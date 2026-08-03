import { MarketingProviderAccount } from '../models/MarketingProviderAccount'
import { GoogleReview } from '../models/GoogleReview'
import { MarketingContent } from '../models/MarketingContent'
import { MarketingCampaign } from '../models/MarketingCampaign'
import { MarketingSettings } from '../models/MarketingSettings'
import { MarketingAiReply } from '../models/MarketingAiReply'

export const MarketingRepository = {
  findProvider(organizationId: number, provider: string): Promise<InstanceType<typeof MarketingProviderAccount> | null> {
    return MarketingProviderAccount.findOne({ organizationId, provider })
  },

  findProviderWithTokens(organizationId: number, provider: string): Promise<any> {
    return MarketingProviderAccount.findOne({ organizationId, provider }).select(
      '+accessToken +refreshToken',
    ) as any
  },

  listProviders(organizationId: number): Promise<Array<Record<string, unknown>>> {
    return MarketingProviderAccount.find({ organizationId }).sort({ provider: 1 }).lean() as Promise<
      Array<Record<string, unknown>>
    >
  },

  upsertProvider(
    organizationId: number,
    provider: string,
    data: Record<string, unknown>,
  ): Promise<InstanceType<typeof MarketingProviderAccount>> {
    return MarketingProviderAccount.findOneAndUpdate(
      { organizationId, provider },
      { $set: { organizationId, provider, ...data } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    ) as Promise<InstanceType<typeof MarketingProviderAccount>>
  },

  countConnected(organizationId: number): Promise<number> {
    return MarketingProviderAccount.countDocuments({ organizationId, isConnected: true })
  },
}

export const GoogleReviewRepository = {
  findById(
    organizationId: number,
    id: number,
  ): Promise<InstanceType<typeof GoogleReview> | null> {
    return GoogleReview.findOne({ _id: id, organizationId })
  },

  findByGoogleId(
    organizationId: number,
    googleReviewId: string,
  ): Promise<InstanceType<typeof GoogleReview> | null> {
    return GoogleReview.findOne({ organizationId, googleReviewId })
  },

  upsertByGoogleId(
    organizationId: number,
    googleReviewId: string,
    data: Record<string, unknown>,
  ): Promise<InstanceType<typeof GoogleReview>> {
    return GoogleReview.findOneAndUpdate(
      { organizationId, googleReviewId },
      { $set: { organizationId, googleReviewId, ...data } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    ) as Promise<InstanceType<typeof GoogleReview>>
  },

  list(
    organizationId: number,
    filter: Record<string, unknown>,
    skip: number,
    limit: number,
  ): Promise<Array<Record<string, unknown>>> {
    return GoogleReview.find({ organizationId, ...filter })
      .sort({ reviewDate: -1 })
      .skip(skip)
      .limit(limit)
      .lean() as Promise<Array<Record<string, unknown>>>
  },

  count(organizationId: number, filter: Record<string, unknown> = {}): Promise<number> {
    return GoogleReview.countDocuments({ organizationId, ...filter })
  },

  averageRating(organizationId: number): Promise<Array<{ avg: number }>> {
    return GoogleReview.aggregate([{ $match: { organizationId } }, { $group: { _id: null, avg: { $avg: '$rating' } } }])
  },
}

export const ContentRepository = {
  findById(
    organizationId: number,
    id: number,
  ): Promise<InstanceType<typeof MarketingContent> | null> {
    return MarketingContent.findOne({ _id: id, organizationId })
  },

  list(
    organizationId: number,
    filter: Record<string, unknown> = {},
  ): Promise<Array<Record<string, unknown>>> {
    return MarketingContent.find({ organizationId, ...filter })
      .sort({ createdAt: -1 })
      .lean() as Promise<Array<Record<string, unknown>>>
  },

  create(data: Record<string, unknown>): Promise<InstanceType<typeof MarketingContent>> {
    return MarketingContent.create(data) as Promise<InstanceType<typeof MarketingContent>>
  },

  dueScheduled(now: Date): Promise<Array<InstanceType<typeof MarketingContent>>> {
    return MarketingContent.find({
      status: 'scheduled',
      scheduleAt: { $lte: now },
    }) as Promise<Array<InstanceType<typeof MarketingContent>>>
  },
}

export const CampaignRepository = {
  findById(
    organizationId: number,
    id: number,
  ): Promise<InstanceType<typeof MarketingCampaign> | null> {
    return MarketingCampaign.findOne({ _id: id, organizationId })
  },

  list(organizationId: number): Promise<Array<Record<string, unknown>>> {
    return MarketingCampaign.find({ organizationId }).sort({ createdAt: -1 }).lean() as Promise<
      Array<Record<string, unknown>>
    >
  },

  create(data: Record<string, unknown>): Promise<InstanceType<typeof MarketingCampaign>> {
    return MarketingCampaign.create(data) as Promise<InstanceType<typeof MarketingCampaign>>
  },

  countByStatus(organizationId: number, status: string): Promise<number> {
    return MarketingCampaign.countDocuments({ organizationId, status })
  },
}

export const SettingsRepository = {
  find(organizationId: number): Promise<InstanceType<typeof MarketingSettings> | null> {
    return MarketingSettings.findOne({ organizationId })
  },

  async getOrCreate(organizationId: number): Promise<InstanceType<typeof MarketingSettings>> {
    let settings = await MarketingSettings.findOne({ organizationId })
    if (!settings) {
      settings = await MarketingSettings.create({ organizationId })
    }
    return settings
  },

  update(
    organizationId: number,
    data: Record<string, unknown>,
  ): Promise<InstanceType<typeof MarketingSettings>> {
    return MarketingSettings.findOneAndUpdate(
      { organizationId },
      { $set: data },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    ) as Promise<InstanceType<typeof MarketingSettings>>
  },
}

export const AiReplyRepository = {
  create(data: Record<string, unknown>): Promise<InstanceType<typeof MarketingAiReply>> {
    return MarketingAiReply.create(data) as Promise<InstanceType<typeof MarketingAiReply>>
  },

  latestForReview(
    organizationId: number,
    reviewId: number,
  ): Promise<InstanceType<typeof MarketingAiReply> | null> {
    return MarketingAiReply.findOne({ organizationId, reviewId }).sort({ createdAt: -1 })
  },
}
