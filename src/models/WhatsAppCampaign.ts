import { Schema, model, type Document } from 'mongoose'
import { applyAutoIncrement } from '../utils/autoIncrement'

export interface IWhatsAppCampaign extends Document<number> {
  organizationId: number
  name: string
  templateId: number
  status: 'draft' | 'queued' | 'running' | 'completed' | 'cancelled' | 'failed'
  recipients: string[]
  variables: Record<string, any>
  scheduledAt?: Date
  sentAt?: Date
  completedAt?: Date
  stats: {
    total: number
    sent: number
    delivered: number
    read: number
    failed: number
    replied: number
  }
  createdBy: number
  deletedAt: Date | null
  createdAt: Date
  updatedAt: Date
}

const whatsAppCampaignSchema = new Schema<IWhatsAppCampaign>(
  {
    _id: { type: Number },
    organizationId: { type: Number, ref: 'Organization', required: true, index: true },
    name: { type: String, required: true, trim: true },
    templateId: { type: Number, ref: 'WhatsAppMetaTemplate', required: true },
    status: {
      type: String,
      enum: ['draft', 'queued', 'running', 'completed', 'cancelled', 'failed'],
      default: 'draft',
    },
    recipients: { type: [String], required: true },
    variables: { type: Schema.Types.Mixed, default: {} },
    scheduledAt: Date,
    sentAt: Date,
    completedAt: Date,
    stats: {
      total: { type: Number, default: 0, min: 0 },
      sent: { type: Number, default: 0, min: 0 },
      delivered: { type: Number, default: 0, min: 0 },
      read: { type: Number, default: 0, min: 0 },
      failed: { type: Number, default: 0, min: 0 },
      replied: { type: Number, default: 0, min: 0 },
    },
    createdBy: { type: Number, ref: 'User', required: true },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
)

applyAutoIncrement(whatsAppCampaignSchema, 'WhatsAppCampaign')

// Indexes
whatsAppCampaignSchema.index({ organizationId: 1, status: 1 })
whatsAppCampaignSchema.index({ organizationId: 1, scheduledAt: 1 })
whatsAppCampaignSchema.index({ organizationId: 1, createdAt: -1 })

export const WhatsAppCampaign = model<IWhatsAppCampaign>('WhatsAppCampaign', whatsAppCampaignSchema)