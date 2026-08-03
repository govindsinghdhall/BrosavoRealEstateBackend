import { Schema, model, type Document } from 'mongoose'
import { applyAutoIncrement } from '../utils/autoIncrement'
import { MARKETING_PROVIDERS, type MarketingProvider } from './MarketingProviderAccount'

export interface IMarketingAiReply extends Document<number> {
  organizationId: number
  reviewId: number
  provider: MarketingProvider
  prompt: string
  generatedReply: string
  editedReply?: string | null
  approved: boolean
  approvedBy?: number | null
  posted: boolean
  createdAt: Date
  updatedAt: Date
}

const schema = new Schema<IMarketingAiReply>(
  {
    _id: { type: Number },
    organizationId: { type: Number, ref: 'Organization', required: true, index: true },
    reviewId: { type: Number, ref: 'GoogleReview', required: true, index: true },
    provider: { type: String, enum: MARKETING_PROVIDERS, default: 'google' },
    prompt: { type: String, required: true },
    generatedReply: { type: String, required: true },
    editedReply: { type: String, default: null },
    approved: { type: Boolean, default: false },
    approvedBy: { type: Number, ref: 'User', default: null },
    posted: { type: Boolean, default: false },
  },
  { timestamps: true },
)

applyAutoIncrement(schema, 'MarketingAiReply')

export const MarketingAiReply = model<IMarketingAiReply>('MarketingAiReply', schema)
