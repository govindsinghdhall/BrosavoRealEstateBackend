import { Schema, model, type Document } from 'mongoose'
import { applyAutoIncrement } from '../utils/autoIncrement'

export const AI_TONES = ['professional', 'friendly', 'formal'] as const
export type AiTone = (typeof AI_TONES)[number]

export interface IMarketingSettings extends Document<number> {
  organizationId: number
  enableAiReply: boolean
  reviewApprovalRequired: boolean
  emailNotification: boolean
  notificationEmail?: string | null
  autoSyncReviews: boolean
  autoFetchInterval: number
  defaultAiTone: AiTone
  theme: 'system' | 'light' | 'dark'
  createdAt: Date
  updatedAt: Date
}

const schema = new Schema<IMarketingSettings>(
  {
    _id: { type: Number },
    organizationId: { type: Number, ref: 'Organization', required: true, unique: true, index: true },
    enableAiReply: { type: Boolean, default: true },
    reviewApprovalRequired: { type: Boolean, default: true },
    emailNotification: { type: Boolean, default: false },
    notificationEmail: { type: String, default: null },
    autoSyncReviews: { type: Boolean, default: true },
    autoFetchInterval: { type: Number, default: 30 },
    defaultAiTone: { type: String, enum: AI_TONES, default: 'professional' },
    theme: { type: String, enum: ['system', 'light', 'dark'], default: 'system' },
  },
  { timestamps: true },
)

applyAutoIncrement(schema, 'MarketingSettings')

export const MarketingSettings = model<IMarketingSettings>('MarketingSettings', schema)
