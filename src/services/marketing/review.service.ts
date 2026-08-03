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

export class ReviewSyncService {
  static async syncLatestReviews(organizationId: number) {
    const account = await MarketingRepository.findProviderWithTokens(organizationId, 'google')
    if (!account?.isConnected || !account.accessToken) {
      throw new AppError('Google Business is not connected', 400)
    }

    const remote = await GoogleBusinessClient.fetchReviews(
      account.accessToken,
      account.locationId || '',
    )

    let upserted = 0
    for (const review of remote) {
      await GoogleReviewRepository.upsertByGoogleId(organizationId, review.googleReviewId, {
        providerAccountId: account._id,
        reviewerName: review.reviewerName,
        reviewerAvatar: review.reviewerAvatar ?? null,
        rating: review.rating,
        reviewText: review.reviewText,
        reviewDate: review.reviewDate,
        hasReply: Boolean(review.replyText),
        replyText: review.replyText ?? null,
        replyDate: review.replyDate ?? null,
        status: review.replyText ? 'posted' : 'pending',
      })
      upserted += 1
    }

    return { upserted, totalRemote: remote.length }
  }

  static async syncAllConnectedOrgs() {
    const { MarketingProviderAccount } = await import('../../models/MarketingProviderAccount')
    const accounts = await MarketingProviderAccount.find({ provider: 'google', isConnected: true }).lean()
    const results = []
    for (const account of accounts) {
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
    },
  ): Promise<{ rows: Array<Record<string, unknown>>; total: number }> {
    const filter: Record<string, unknown> = {}
    if (query.rating) filter.rating = query.rating
    if (query.status) filter.status = query.status
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

    const tone = settings.defaultAiTone
    const firstName = review.reviewerName.split(' ')[0] || 'there'
    const generatedReply =
      `Hi ${firstName}, thank you for your ${review.rating}-star review. ` +
      `We truly appreciate your feedback and are glad you shared your experience with us. ` +
      `If you need anything else, our team is here to help. — (${tone} tone)`

    const record = await AiReplyRepository.create({
      organizationId,
      reviewId: review._id,
      provider: 'google',
      prompt: `Generate a ${tone} reply for: ${review.reviewText}`,
      generatedReply,
      editedReply: null,
      approved: false,
      posted: false,
    })

    review.aiGenerated = true
    if (!review.replyText) {
      review.replyText = generatedReply
      review.status = settings.reviewApprovalRequired ? 'pending' : 'approved'
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

      const account = await MarketingRepository.findProviderWithTokens(organizationId, 'google')
      if (!account?.isConnected || !account.accessToken) {
        throw new AppError('Google Business is not connected', 400)
      }

      await GoogleBusinessClient.postReply(
        account.accessToken,
        account.locationId || '',
        review.googleReviewId,
        review.replyText,
      )

      review.hasReply = true
      review.replyDate = new Date()
      review.status = 'posted'
      await review.save({ session })

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
