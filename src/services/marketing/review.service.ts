import mongoose from 'mongoose'
import { GoogleBusinessClient } from '../../integrations/googleBusiness.client'
import {
  AiReplyRepository,
  GoogleReviewRepository,
  MarketingRepository,
  SettingsRepository,
} from '../../repositories/marketing.repository'
import { AppError, NotFoundError } from '../../utils/errors'
import { logMarketingActivity } from './activityLog.service'
import type { ReviewStatus } from '../../models/GoogleReview'
import { GoogleTokenService } from './googleToken.service'
import { LocationService } from './location.service'
import { GoogleAiService } from './ai.service'
import { AutomationService } from './automation.service'
import { EntitlementService } from './entitlement.service'
import { GOOGLE_BUSINESS_FEATURES } from '../../constants/googleBusinessFeatures'
import { UsageService } from './usage.service'

export class ReviewSyncService {
  static async syncLatestReviews(organizationId: number) {
    await EntitlementService.assertFeature(
      organizationId,
      GOOGLE_BUSINESS_FEATURES.REVIEWS,
    )

    const account = await MarketingRepository.findProvider(organizationId, 'google')
    if (!account?.isConnected) {
      throw new AppError('Google Business is not connected', 400)
    }

    const { accessToken } = await GoogleTokenService.getValidAccessToken(organizationId)
    const locations = await LocationService.getSelectedLocations(organizationId)

    if (!locations.length) {
      throw new AppError('No Google Business locations selected. Select at least one location.', 400)
    }

    let upserted = 0
    let totalRemote = 0

    for (const location of locations) {
      const remote = await GoogleBusinessClient.fetchReviews(
        accessToken,
        location.googleAccountId,
        location.googleLocationId,
      )
      totalRemote += remote.length

      for (const review of remote) {
        const saved = await GoogleReviewRepository.upsertByGoogleId(
          organizationId,
          review.googleReviewId,
          {
            providerAccountId: account._id,
            locationId: location._id,
            reviewerName: review.reviewerName,
            reviewerAvatar: review.reviewerAvatar ?? null,
            rating: review.rating,
            reviewText: review.reviewText,
            reviewDate: review.reviewDate,
            hasReply: Boolean(review.replyText),
            replyText: review.replyText ?? null,
            replyDate: review.replyDate ?? null,
            status: review.replyText ? 'posted' : 'pending',
          },
        )
        upserted += 1

        if (!review.replyText && saved.status === 'pending') {
          try {
            await AutomationService.processNewReview(organizationId, saved._id)
          } catch (error) {
            console.error(`Automation failed for review ${saved._id}:`, error)
          }
        }
      }
    }

    return { upserted, totalRemote }
  }

  static async syncAllConnectedOrgs() {
    const { MarketingProviderAccount } = await import('../../models/MarketingProviderAccount')
    const { MarketingSettings } = await import('../../models/MarketingSettings')

    const accounts = await MarketingProviderAccount.find({
      provider: 'google',
      isConnected: true,
    }).lean()

    const results = []
    for (const account of accounts) {
      const settings = await MarketingSettings.findOne({
        organizationId: account.organizationId,
      }).lean()

      if (settings && settings.autoSyncReviews === false) {
        continue
      }

      try {
        const result = await this.syncLatestReviews(account.organizationId)
        results.push({ organizationId: account.organizationId, ...result })
      } catch (error) {
        results.push({
          organizationId: account.organizationId,
          error: error instanceof Error ? error.message : 'sync failed',
        })
      }
    }
    return results
  }

  static async listReviews(
    organizationId: number,
    query: {
      page: number
      limit: number
      rating?: number
      status?: ReviewStatus
      search?: string
      from?: Date
      to?: Date
      locationId?: number
    },
  ): Promise<{ rows: Array<Record<string, unknown>>; total: number }> {
    const filter: Record<string, unknown> = {}
    if (query.rating) filter.rating = query.rating
    if (query.status) filter.status = query.status
    if (query.locationId) filter.locationId = query.locationId
    if (query.from || query.to) {
      filter.reviewDate = {
        ...(query.from ? { $gte: query.from } : {}),
        ...(query.to ? { $lte: query.to } : {}),
      }
    }
    if (query.search) {
      filter.$or = [
        { reviewerName: { $regex: query.search, $options: 'i' } },
        { reviewText: { $regex: query.search, $options: 'i' } },
        { replyText: { $regex: query.search, $options: 'i' } },
      ]
    }

    const skip = (query.page - 1) * query.limit
    const [rows, total] = await Promise.all([
      GoogleReviewRepository.list(organizationId, filter, skip, query.limit),
      GoogleReviewRepository.count(organizationId, filter),
    ])

    return { rows, total }
  }

  static async getReview(organizationId: number, id: number) {
    const review = await GoogleReviewRepository.findById(organizationId, id)
    if (!review) throw new NotFoundError('Review not found')
    return review
  }
}

export class AIReplyService {
  static async generate(organizationId: number, reviewId: number, userId: number) {
    const review = await ReviewSyncService.getReview(organizationId, reviewId)
    const settings = await SettingsRepository.getOrCreate(organizationId)

    const generatedReply = await GoogleAiService.generateReviewReply({
      organizationId,
      reviewerName: review.reviewerName,
      rating: review.rating,
      reviewText: review.reviewText,
      tone: settings.defaultAiTone,
      language: settings.aiLanguage,
      instructions: settings.aiInstructions,
    })

    const record = await AiReplyRepository.create({
      organizationId,
      reviewId: review._id,
      provider: 'google',
      prompt: `Generate a ${settings.defaultAiTone} reply`,
      generatedReply,
      editedReply: null,
      approved: false,
      posted: false,
    })

    review.aiGenerated = true
    if (!review.replyText) {
      review.replyText = generatedReply
      review.status = settings.reviewApprovalRequired ? 'pending' : 'approved'
      review.metadata = {
        ...(review.metadata || {}),
        responseMode: 'AI_ASSISTED',
      }
    }
    await review.save()

    await logMarketingActivity({
      organizationId,
      module: 'reviews',
      action: 'generated_ai_reply',
      description: `Generated AI reply for review #${reviewId}`,
      performedBy: userId,
    })

    return { review, aiReply: record }
  }

  static async updateReply(
    organizationId: number,
    reviewId: number,
    replyText: string,
    userId: number,
  ) {
    const review = await ReviewSyncService.getReview(organizationId, reviewId)
    review.replyText = replyText
    review.aiGenerated = true
    if (review.status === 'pending') review.status = 'approved'
    review.metadata = {
      ...(review.metadata || {}),
      responseMode: 'MANUAL',
    }
    await review.save()

    const latest = await AiReplyRepository.latestForReview(organizationId, reviewId)
    if (latest) {
      latest.editedReply = replyText
      latest.approved = true
      latest.approvedBy = userId
      await latest.save()
    }

    await logMarketingActivity({
      organizationId,
      module: 'reviews',
      action: 'edited_ai_reply',
      description: `Edited reply for review #${reviewId}`,
      performedBy: userId,
    })

    return review
  }

  static async postReply(organizationId: number, reviewId: number, userId: number) {
    const session = await mongoose.startSession()
    session.startTransaction()

    try {
      const review = await ReviewSyncService.getReview(organizationId, reviewId)
      if (!review.replyText?.trim()) {
        throw new AppError('Add a reply before posting to Google', 400)
      }

      const safety = GoogleAiService.validateReplySafety(review.replyText)
      if (!safety.safe) {
        throw new AppError(
          safety.reason || 'Reply failed safety validation',
          400,
        )
      }

      await AutomationService.publishReviewReply(organizationId, review)

      const latest = await AiReplyRepository.latestForReview(organizationId, reviewId)
      if (latest) {
        latest.posted = true
        latest.approved = true
        latest.approvedBy = userId
        await latest.save({ session })
      }

      await logMarketingActivity({
        organizationId,
        module: 'reviews',
        action: 'posted_reply',
        description: `Posted reply for review #${reviewId}`,
        performedBy: userId,
      })

      await session.commitTransaction()
      return review
    } catch (error) {
      await session.abortTransaction()
      throw error
    } finally {
      session.endSession()
    }
  }
}
