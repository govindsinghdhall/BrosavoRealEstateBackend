import { GoogleBusinessAutomationRule } from '../../models/GoogleBusinessAutomationRule'
import { GoogleReview } from '../../models/GoogleReview'
import { SettingsRepository } from '../../repositories/marketing.repository'
import { AppError, NotFoundError } from '../../utils/errors'
import { EntitlementService } from './entitlement.service'
import { GOOGLE_BUSINESS_FEATURES } from '../../constants/googleBusinessFeatures'
import { GoogleAiService } from './ai.service'
import { GoogleBusinessClient } from '../../integrations/googleBusiness.client'
import { GoogleTokenService } from './googleToken.service'
import { LocationService } from './location.service'
import { UsageService } from './usage.service'
import { logMarketingActivity } from './activityLog.service'
import type { AutomationAction } from '../../models/GoogleBusinessAutomationRule'

export class AutomationService {
  static async getRules(
    organizationId: number,
    locationId?: number,
  ): Promise<Array<Record<string, unknown>>> {
    const filter: Record<string, unknown> = { organizationId }
    if (locationId) filter.locationId = locationId
    return GoogleBusinessAutomationRule.find(filter)
      .sort({ priority: -1, createdAt: -1 })
      .lean()
  }

  static async upsertSettings(
    organizationId: number,
    userId: number,
    data: {
      autoReplyEnabled?: boolean
      ratingRules?: Record<string, AutomationAction>
      rules?: Array<{
        id?: number
        name: string
        enabled: boolean
        minRating?: number
        maxRating?: number
        keywords?: string[]
        action: AutomationAction
        locationId?: number | null
        priority?: number
      }>
    },
  ): Promise<{ settings: unknown; rules: Array<Record<string, unknown>> }> {
    await EntitlementService.assertFeature(
      organizationId,
      GOOGLE_BUSINESS_FEATURES.AUTO_REPLY,
    )

    const settings = await SettingsRepository.getOrCreate(organizationId)

    if (data.autoReplyEnabled !== undefined) {
      settings.autoReplyEnabled = data.autoReplyEnabled
    }
    if (data.ratingRules) {
      settings.ratingRules = data.ratingRules
    }
    await settings.save()

    if (data.rules) {
      for (const rule of data.rules) {
        if (rule.id) {
          await GoogleBusinessAutomationRule.findOneAndUpdate(
            { _id: rule.id, organizationId },
            {
              $set: {
                name: rule.name,
                enabled: rule.enabled,
                minRating: rule.minRating ?? null,
                maxRating: rule.maxRating ?? null,
                keywords: rule.keywords || [],
                action: rule.action,
                locationId: rule.locationId ?? null,
                priority: rule.priority ?? 0,
              },
            },
          )
        } else {
          await GoogleBusinessAutomationRule.create({
            organizationId,
            name: rule.name,
            enabled: rule.enabled,
            minRating: rule.minRating ?? null,
            maxRating: rule.maxRating ?? null,
            keywords: rule.keywords || [],
            action: rule.action,
            locationId: rule.locationId ?? null,
            priority: rule.priority ?? 0,
            createdBy: userId,
          })
        }
      }
    }

    return {
      settings,
      rules: await this.getRules(organizationId),
    }
  }

  static resolveActionForReview(
    rating: number,
    reviewText: string,
    rules: Array<{
      enabled: boolean
      minRating?: number | null
      maxRating?: number | null
      keywords?: string[]
      action: AutomationAction
      priority: number
    }>,
    settingsDefaults: Record<string, AutomationAction> = {},
  ): AutomationAction {
    const defaultKey = String(rating)
    const defaultAction = settingsDefaults[defaultKey]

    const matched = rules
      .filter((rule) => rule.enabled)
      .filter((rule) => {
        if (rule.minRating != null && rating < rule.minRating) return false
        if (rule.maxRating != null && rating > rule.maxRating) return false
        if (rule.keywords?.length) {
          const lower = reviewText.toLowerCase()
          return rule.keywords.some((kw) => lower.includes(kw.toLowerCase()))
        }
        return true
      })
      .sort((a, b) => b.priority - a.priority)[0]

    if (matched) return matched.action
    if (defaultAction) return defaultAction

    if (rating >= 4) return 'auto_publish'
    return 'require_approval'
  }

  static async processNewReview(
    organizationId: number,
    reviewId: number,
  ): Promise<void> {
    const settings = await SettingsRepository.getOrCreate(organizationId)
    if (!settings.autoReplyEnabled) return

    const hasAutoReply = await EntitlementService.hasFeature(
      organizationId,
      GOOGLE_BUSINESS_FEATURES.AUTO_REPLY,
    )
    if (!hasAutoReply) return

    const review = await GoogleReview.findOne({ _id: reviewId, organizationId })
    if (!review || review.hasReply) return

    const rules = await GoogleBusinessAutomationRule.find({
      organizationId,
      enabled: true,
    }).lean()

    const action = this.resolveActionForReview(
      review.rating,
      review.reviewText,
      rules,
      (settings.ratingRules || {}) as Record<string, AutomationAction>,
    )

    const generated = await GoogleAiService.generateReviewReply({
      organizationId,
      reviewerName: review.reviewerName,
      rating: review.rating,
      reviewText: review.reviewText,
      tone: settings.defaultAiTone,
      language: settings.aiLanguage,
      instructions: settings.aiInstructions,
    })

    const safety = GoogleAiService.validateReplySafety(generated)
    if (!safety.safe) {
      review.status = 'pending'
      review.replyText = generated
      review.aiGenerated = true
      review.metadata = {
        ...(review.metadata || {}),
        responseMode: 'HUMAN_REVIEW_REQUIRED',
        safetyReason: safety.reason,
      }
      await review.save()
      return
    }

    review.replyText = generated
    review.aiGenerated = true
    review.metadata = {
      ...(review.metadata || {}),
      responseMode: action === 'auto_publish' ? 'AUTOMATIC' : 'AI_ASSISTED',
    }

    if (action === 'auto_publish') {
      await this.publishReviewReply(organizationId, review)
      await UsageService.increment(organizationId, 'autoReplies')
    } else {
      review.status = 'pending'
      await review.save()
    }

    await UsageService.increment(organizationId, 'reviewsProcessed')
  }

  static async publishReviewReply(
    organizationId: number,
    review: InstanceType<typeof GoogleReview>,
  ) {
    if (!review.replyText?.trim()) {
      throw new AppError('Reply text is required', 400)
    }

    const { accessToken } = await GoogleTokenService.getValidAccessToken(organizationId)
    const locations = await LocationService.getSelectedLocations(organizationId)
    const location = locations[0]

    if (!location) {
      throw new AppError('No Google Business location selected', 400)
    }

    await GoogleBusinessClient.postReply(
      accessToken,
      location.googleAccountId,
      location.googleLocationId,
      review.googleReviewId,
      review.replyText,
    )

    review.hasReply = true
    review.replyDate = new Date()
    review.status = 'posted'
    await review.save()

    await UsageService.increment(organizationId, 'aiReplies')
  }

  static async deleteRule(organizationId: number, ruleId: number) {
    const rule = await GoogleBusinessAutomationRule.findOneAndDelete({
      _id: ruleId,
      organizationId,
    })
    if (!rule) throw new NotFoundError('Automation rule not found')
    return { id: ruleId }
  }
}
