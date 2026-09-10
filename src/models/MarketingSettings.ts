import { Schema, model, type Document } from 'mongoose'
import { applyAutoIncrement } from '../utils/autoIncrement'
import type { AutomationAction } from './GoogleBusinessAutomationRule'

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
  autoReplyEnabled: boolean
  ratingRules: Partial<Record<string, AutomationAction>>
  aiLanguage: string
  aiInstructions: string
  brandVoice: string
  defaultTimezone: string
  defaultCta: string
  defaultPostBehavior: 'draft' | 'publish' | 'schedule'
  createdAt: Date
  updatedAt: Date
}

const schema = new Schema<IMarketingSettings>(
  {
    _id: { type: Number },
    organizationId: { type: Number, ref: 'Organization', required: true, unique: true },
    enableAiReply: { type: Boolean, default: true },
    reviewApprovalRequired: { type: Boolean, default: true },
    emailNotification: { type: Boolean, default: false },
    notificationEmail: { type: String, default: null },
    autoSyncReviews: { type: Boolean, default: true },
    autoFetchInterval: { type: Number, default: 30 },
    defaultAiTone: { type: String, enum: AI_TONES, default: 'professional' },
    theme: { type: String, enum: ['system', 'light', 'dark'], default: 'system' },
    autoReplyEnabled: { type: Boolean, default: false },
    ratingRules: { type: Schema.Types.Mixed, default: {} },
    aiLanguage: { type: String, default: 'English' },
    aiInstructions: {
      type: String,
      default: 'Always be polite and thank customers for their feedback.',
    },
    brandVoice: { type: String, default: '' },
    defaultTimezone: { type: String, default: 'Asia/Kolkata' },
    defaultCta: { type: String, default: 'LEARN_MORE' },
    defaultPostBehavior: {
      type: String,
      enum: ['draft', 'publish', 'schedule'],
      default: 'draft',
    },
  },
  { timestamps: true },
)

applyAutoIncrement(schema, 'MarketingSettings')

export const MarketingSettings = model<IMarketingSettings>('MarketingSettings', schema)
