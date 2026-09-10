import { Schema, model, type Document } from 'mongoose'
import { applyAutoIncrement } from '../utils/autoIncrement'
import { MARKETING_PROVIDERS, type MarketingProvider } from './MarketingProviderAccount'

export const CONTENT_TYPES = ['photo', 'post', 'offer', 'festival', 'campaign'] as const
export type MarketingContentType = (typeof CONTENT_TYPES)[number]

export const CONTENT_STATUSES = [
  'draft',
  'scheduled',
  'processing',
  'published',
  'failed',
  'auth_required',
  'cancelled',
] as const
export type MarketingContentStatus = (typeof CONTENT_STATUSES)[number]

export interface IMarketingContent extends Document<number> {
  organizationId: number
  provider: MarketingProvider
  contentType: MarketingContentType
  title: string
  description?: string | null
  imageUrl?: string | null
  thumbnailUrl?: string | null
  scheduleAt?: Date | null
  publishedAt?: Date | null
  status: MarketingContentStatus
  locationIds: number[]
  timezone: string
  googlePostId?: string | null
  retryCount: number
  lastError?: string | null
  cta?: string | null
  targetUrl?: string | null
  createdBy?: number | null
  publishedBy?: number | null
  createdAt: Date
  updatedAt: Date
}

const schema = new Schema<IMarketingContent>(
  {
    _id: { type: Number },
    organizationId: { type: Number, ref: 'Organization', required: true, index: true },
    provider: { type: String, enum: MARKETING_PROVIDERS, required: true, index: true },
    contentType: { type: String, enum: CONTENT_TYPES, required: true },
    title: { type: String, required: true, trim: true },
    description: { type: String, default: null },
    imageUrl: { type: String, default: null },
    thumbnailUrl: { type: String, default: null },
    scheduleAt: { type: Date, default: null },
    publishedAt: { type: Date, default: null },
    status: { type: String, enum: CONTENT_STATUSES, default: 'draft' },
    locationIds: { type: [Number], default: [] },
    timezone: { type: String, default: 'Asia/Kolkata' },
    googlePostId: { type: String, default: null },
    retryCount: { type: Number, default: 0 },
    lastError: { type: String, default: null },
    cta: { type: String, default: null },
    targetUrl: { type: String, default: null },
    createdBy: { type: Number, ref: 'User', default: null },
    publishedBy: { type: Number, ref: 'User', default: null },
  },
  { timestamps: true },
)

schema.index({ organizationId: 1, status: 1, scheduleAt: 1 })

applyAutoIncrement(schema, 'MarketingContent')

export const MarketingContent = model<IMarketingContent>('MarketingContent', schema)
