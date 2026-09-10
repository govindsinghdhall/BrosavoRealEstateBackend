import { Schema, model, type Document } from 'mongoose'
import { applyAutoIncrement } from '../utils/autoIncrement'

export interface IGoogleBusinessUsage extends Document<number> {
  organizationId: number
  periodKey: string
  postsCreated: number
  postsPublished: number
  aiGenerations: number
  aiReplies: number
  autoReplies: number
  reviewsProcessed: number
  locationsConnected: number
  createdAt: Date
  updatedAt: Date
}

const schema = new Schema<IGoogleBusinessUsage>(
  {
    _id: { type: Number },
    organizationId: { type: Number, ref: 'Organization', required: true },
    periodKey: { type: String, required: true, trim: true },
    postsCreated: { type: Number, default: 0 },
    postsPublished: { type: Number, default: 0 },
    aiGenerations: { type: Number, default: 0 },
    aiReplies: { type: Number, default: 0 },
    autoReplies: { type: Number, default: 0 },
    reviewsProcessed: { type: Number, default: 0 },
    locationsConnected: { type: Number, default: 0 },
  },
  { timestamps: true },
)

schema.index({ organizationId: 1, periodKey: 1 }, { unique: true })

applyAutoIncrement(schema, 'GoogleBusinessUsage')

export const GoogleBusinessUsage = model<IGoogleBusinessUsage>(
  'GoogleBusinessUsage',
  schema,
)

export function currentUsagePeriodKey(): string {
  const now = new Date()
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`
}
