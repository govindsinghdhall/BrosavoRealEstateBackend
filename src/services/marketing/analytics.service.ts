import {
  CampaignRepository,
  ContentRepository,
  GoogleReviewRepository,
  MarketingRepository,
  SettingsRepository,
} from '../../repositories/marketing.repository'
import { getOrganizationById } from '../organization.service'

export class SettingsService {
  static get(organizationId: number) {
    return SettingsRepository.getOrCreate(organizationId)
  }

  static update(organizationId: number, data: Record<string, unknown>) {
    return SettingsRepository.update(organizationId, data)
  }
}

export class AnalyticsService {
  static async getDashboard(organizationId: number): Promise<Record<string, unknown>> {
    const [
      connectedPlatforms,
      reviewCount,
      pendingReplies,
      avgResult,
      scheduledCampaigns,
      scheduledContent,
      publishedContent,
      draftContent,
      providers,
      settings,
      organization,
    ] = await Promise.all([
      MarketingRepository.countConnected(organizationId),
      GoogleReviewRepository.count(organizationId),
      GoogleReviewRepository.count(organizationId, { status: 'pending' }),
      GoogleReviewRepository.averageRating(organizationId),
      CampaignRepository.countByStatus(organizationId, 'scheduled'),
      ContentRepository.list(organizationId, { status: 'scheduled' }),
      ContentRepository.list(organizationId, { status: 'published' }),
      ContentRepository.list(organizationId, { status: 'draft' }),
      MarketingRepository.listProviders(organizationId),
      SettingsRepository.getOrCreate(organizationId),
      getOrganizationById(organizationId),
    ])

    const averageRating = avgResult[0]?.avg ? Number(avgResult[0].avg.toFixed(1)) : 0
    const google = providers.find((p) => p.provider === 'google') as
      | {
          isConnected?: boolean
          accountName?: string
          accountId?: string | null
          locationId?: string | null
          metadata?: { verified?: boolean; mapsUrl?: string }
        }
      | undefined
    const whatsappConfigured = Boolean(organization.settings?.whatsapp?.businessPhone)

    let marketingScore = 20
    if (google?.isConnected) marketingScore += 25
    if (whatsappConfigured) marketingScore += 15
    if (reviewCount > 0) marketingScore += 15
    if (pendingReplies === 0 && reviewCount > 0) marketingScore += 10
    if (averageRating >= 4.5) marketingScore += 10
    if (scheduledCampaigns > 0 || scheduledContent.length > 0) marketingScore += 5
    marketingScore = Math.min(100, marketingScore)

    const monthStart = new Date()
    monthStart.setDate(1)
    monthStart.setHours(0, 0, 0, 0)
    const reviewsThisMonth = await GoogleReviewRepository.count(organizationId, {
      reviewDate: { $gte: monthStart },
    })

    return {
      summary: {
        connectedPlatforms,
        totalPlatforms: 5,
        googleReviews: reviewCount,
        googleReviewsTrend: reviewsThisMonth > 0 ? `+${reviewsThisMonth} this month` : 'No new reviews this month',
        pendingAiReplies: pendingReplies,
        scheduledCampaigns,
        averageRating,
        marketingScore,
      },
      googleBusiness: {
        connected: Boolean(google?.isConnected),
        name: google?.accountName || organization.name,
        address: organization.address || '',
        logoUrl: organization.logo || '',
        verified: Boolean(google?.metadata && (google.metadata as { verified?: boolean }).verified),
        averageRating,
        totalReviews: reviewCount,
        googleMapsUrl: (google?.metadata as { mapsUrl?: string } | undefined)?.mapsUrl || 'https://maps.google.com',
        accountId: google?.accountId || null,
        locationId: google?.locationId || null,
      },
      reviewStats: {
        pendingReplies,
        repliedToday: await GoogleReviewRepository.count(organizationId, {
          status: 'posted',
          replyDate: { $gte: new Date(new Date().setHours(0, 0, 0, 0)) },
        }),
        averageRating,
        newReviews: reviewsThisMonth,
      },
      postsSummary: {
        scheduled: scheduledContent.length,
        published: publishedContent.length,
        drafts: draftContent.length,
      },
      settings: {
        googleConnected: Boolean(google?.isConnected),
        enableAiReplies: settings.enableAiReply,
        reviewApprovalRequired: settings.reviewApprovalRequired,
        emailNotifications: settings.emailNotification,
        notificationEmail: settings.notificationEmail,
        autoSyncReviews: settings.autoSyncReviews,
        autoFetchInterval: settings.autoFetchInterval,
        defaultAiTone: settings.defaultAiTone,
        theme: settings.theme,
      },
      providers,
      whatsappConfigured,
    }
  }

  static async getReviewAnalytics(organizationId: number) {
    const { GoogleReview } = await import('../../models/GoogleReview')
    const [byMonth, byRating, keywords] = await Promise.all([
      GoogleReview.aggregate([
        { $match: { organizationId } },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m', date: '$reviewDate' } },
            value: { $sum: 1 },
            avgRating: { $avg: '$rating' },
          },
        },
        { $sort: { _id: 1 } },
        { $limit: 12 },
      ]),
      GoogleReview.aggregate([
        { $match: { organizationId } },
        { $group: { _id: '$rating', value: { $sum: 1 } } },
        { $sort: { _id: 1 } },
      ]),
      GoogleReview.aggregate([
        { $match: { organizationId, reviewText: { $ne: '' } } },
        { $project: { words: { $split: [{ $toLower: '$reviewText' }, ' '] } } },
        { $unwind: '$words' },
        {
          $match: {
            words: {
              $nin: ['the', 'a', 'an', 'and', 'or', 'to', 'of', 'in', 'for', 'is', 'was', 'with', 'on', ''],
            },
          },
        },
        { $group: { _id: '$words', value: { $sum: 1 } } },
        { $sort: { value: -1 } },
        { $limit: 10 },
      ]),
    ])

    return {
      reviewsTrend: byMonth.map((row) => ({ label: row._id, value: row.value })),
      ratingTrend: byMonth.map((row) => ({
        label: row._id,
        value: Number((row.avgRating || 0).toFixed(1)),
      })),
      ratingDistribution: byRating.map((row) => ({ name: `${row._id}★`, value: row.value })),
      popularReviewKeywords: keywords.map((row) => ({ name: row._id, value: row.value })),
      sentiment: [
        {
          name: 'Positive',
          value: byRating.filter((r) => r._id >= 4).reduce((s, r) => s + r.value, 0),
        },
        {
          name: 'Neutral',
          value: byRating.filter((r) => r._id === 3).reduce((s, r) => s + r.value, 0),
        },
        {
          name: 'Negative',
          value: byRating.filter((r) => r._id <= 2).reduce((s, r) => s + r.value, 0),
        },
      ],
    }
  }

  static async getPostAnalytics(organizationId: number): Promise<Record<string, unknown>> {
    const content = await ContentRepository.list(organizationId)
    const byStatus = content.reduce<Record<string, number>>((acc, item) => {
      const status = String(item.status)
      acc[status] = (acc[status] || 0) + 1
      return acc
    }, {})

    return {
      total: content.length,
      byStatus,
      recent: content.slice(0, 10),
    }
  }
}
