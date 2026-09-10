import {
  GoogleBusinessUsage,
  currentUsagePeriodKey,
} from '../../models/GoogleBusinessUsage'
import { AppError } from '../../utils/errors'
import { EntitlementService } from './entitlement.service'

export type UsageMetric =
  | 'postsCreated'
  | 'postsPublished'
  | 'aiGenerations'
  | 'aiReplies'
  | 'autoReplies'
  | 'reviewsProcessed'
  | 'locationsConnected'

const LIMIT_MAP: Record<UsageMetric, keyof Awaited<ReturnType<typeof EntitlementService.getLimits>>> = {
  postsCreated: 'maxScheduledPostsPerMonth',
  postsPublished: 'maxScheduledPostsPerMonth',
  aiGenerations: 'maxAiGenerationsPerMonth',
  aiReplies: 'maxAiRepliesPerMonth',
  autoReplies: 'maxAiRepliesPerMonth',
  reviewsProcessed: 'maxAiRepliesPerMonth',
  locationsConnected: 'maxLocations',
}

export class UsageService {
  static async getOrCreate(organizationId: number) {
    const periodKey = currentUsagePeriodKey()
    return GoogleBusinessUsage.findOneAndUpdate(
      { organizationId, periodKey },
      { $setOnInsert: { organizationId, periodKey } },
      { upsert: true, new: true },
    )
  }

  static async increment(
    organizationId: number,
    metric: UsageMetric,
    amount = 1,
  ): Promise<void> {
    const usage = await this.getOrCreate(organizationId)
    usage[metric] = (usage[metric] || 0) + amount
    await usage.save()
  }

  static async assertWithinLimit(
    organizationId: number,
    metric: UsageMetric,
  ): Promise<void> {
    const [usage, limits] = await Promise.all([
      this.getOrCreate(organizationId),
      EntitlementService.getLimits(organizationId),
    ])

    const limitKey = LIMIT_MAP[metric]
    const limit = limits[limitKey]
    const current = usage[metric] || 0

    if (current >= limit) {
      throw new AppError(
        `Monthly limit reached for ${metric.replace(/([A-Z])/g, ' $1').toLowerCase()}. Upgrade your plan or wait until next month.`,
        403,
        'USAGE_LIMIT_EXCEEDED',
      )
    }
  }

  static async getUsageSummary(organizationId: number) {
    const [usage, limits] = await Promise.all([
      this.getOrCreate(organizationId),
      EntitlementService.getLimits(organizationId),
    ])

    return {
      period: usage.periodKey,
      usage: {
        postsCreated: usage.postsCreated,
        postsPublished: usage.postsPublished,
        aiGenerations: usage.aiGenerations,
        aiReplies: usage.aiReplies,
        autoReplies: usage.autoReplies,
        reviewsProcessed: usage.reviewsProcessed,
        locationsConnected: usage.locationsConnected,
      },
      limits,
    }
  }
}
