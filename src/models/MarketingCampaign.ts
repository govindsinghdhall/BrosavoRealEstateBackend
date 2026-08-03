import { Schema, model, type Document } from 'mongoose'
import { applyAutoIncrement } from '../utils/autoIncrement'
import { MARKETING_PROVIDERS, type MarketingProvider } from './MarketingProviderAccount'

export const CAMPAIGN_STATUSES = ['draft', 'scheduled', 'sending', 'sent', 'paused', 'cancelled'] as const
export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number]

export interface IMarketingCampaign extends Document<number> {
  organizationId: number
  campaignName: string
  provider: MarketingProvider
  campaignType: string
  audience: string
  status: CampaignStatus
  scheduleAt?: Date | null
  completedAt?: Date | null
  statistics: Record<string, unknown>
  createdBy?: number | null
  createdAt: Date
  updatedAt: Date
}

const schema = new Schema<IMarketingCampaign>(
  {
    _id: { type: Number },
    organizationId: { type: Number, ref: 'Organization', required: true, index: true },
    campaignName: { type: String, required: true, trim: true },
    provider: { type: String, enum: MARKETING_PROVIDERS, required: true, index: true },
    campaignType: { type: String, required: true, trim: true },
    audience: { type: String, required: true, trim: true },
    status: { type: String, enum: CAMPAIGN_STATUSES, default: 'draft', index: true },
    scheduleAt: { type: Date, default: null, index: true },
    completedAt: { type: Date, default: null },
    statistics: { type: Schema.Types.Mixed, default: {} },
    createdBy: { type: Number, ref: 'User', default: null },
  },
  { timestamps: true },
)

applyAutoIncrement(schema, 'MarketingCampaign')

export const MarketingCampaign = model<IMarketingCampaign>('MarketingCampaign', schema)
