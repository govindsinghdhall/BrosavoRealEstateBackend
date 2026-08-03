import { Schema, model, type Document } from 'mongoose'
import { applyAutoIncrement } from '../utils/autoIncrement'

export const REVIEW_STATUSES = ['pending', 'approved', 'posted', 'ignored'] as const
export type ReviewStatus = (typeof REVIEW_STATUSES)[number]

export interface IGoogleReview extends Document<number> {
  organizationId: number
  providerAccountId: number
  googleReviewId: string
  reviewerName: string
  reviewerAvatar?: string | null
  rating: number
  reviewText: string
  reviewDate: Date
  hasReply: boolean
  replyText?: string | null
  replyDate?: Date | null
  aiGenerated: boolean
  status: ReviewStatus
  metadata: Record<string, unknown>
  createdAt: Date
  updatedAt: Date
}

const schema = new Schema<IGoogleReview>(
  {
    _id: { type: Number },
    organizationId: { type: Number, ref: 'Organization', required: true, index: true },
    providerAccountId: { type: Number, ref: 'MarketingProviderAccount', required: true, index: true },
    googleReviewId: { type: String, required: true, trim: true },
    reviewerName: { type: String, required: true, trim: true },
    reviewerAvatar: { type: String, default: null },
    rating: { type: Number, required: true, min: 1, max: 5 },
    reviewText: { type: String, default: '' },
    reviewDate: { type: Date, required: true, index: true },
    hasReply: { type: Boolean, default: false },
    replyText: { type: String, default: null },
    replyDate: { type: Date, default: null },
    aiGenerated: { type: Boolean, default: false },
    status: { type: String, enum: REVIEW_STATUSES, default: 'pending', index: true },
    metadata: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true },
)

schema.index({ organizationId: 1, googleReviewId: 1 }, { unique: true })
schema.index({ organizationId: 1, status: 1, reviewDate: -1 })

applyAutoIncrement(schema, 'GoogleReview')

export const GoogleReview = model<IGoogleReview>('GoogleReview', schema)
