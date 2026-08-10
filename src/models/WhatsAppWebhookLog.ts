import { Schema, model, type Document } from 'mongoose'
import { applyAutoIncrement } from '../utils/autoIncrement'

export interface IWhatsAppWebhookLog extends Document<number> {
  organizationId?: number
  event: string
  payload: any
  headers: any
  processed: boolean
  error?: string
  processedAt?: Date
  createdAt: Date
  updatedAt: Date
}

const whatsAppWebhookLogSchema =
  new Schema<IWhatsAppWebhookLog>(
    {
      _id: {
        type: Number,
      },

      organizationId: {
        type: Number,
        ref: 'Organization',
        index: true,
      },

      event: {
        type: String,
        required: true,
        trim: true,
        index: true,
      },

      payload: {
        type: Schema.Types.Mixed,
        required: true,
      },

      headers: {
        type: Schema.Types.Mixed,
        default: {},
      },

      processed: {
        type: Boolean,
        default: false,
        index: true,
      },

      error: {
        type: String,
        trim: true,
        maxlength: 4000,
      },

      processedAt: {
        type: Date,
      },
    },
    {
      timestamps: true,
    },
  )

applyAutoIncrement(
  whatsAppWebhookLogSchema,
  'WhatsAppWebhookLog',
)

whatsAppWebhookLogSchema.index({
  organizationId: 1,
  createdAt: -1,
})

whatsAppWebhookLogSchema.index({
  processed: 1,
  createdAt: 1,
})

whatsAppWebhookLogSchema.index({
  event: 1,
})

export const WhatsAppWebhookLog =
  model<IWhatsAppWebhookLog>(
    'WhatsAppWebhookLog',
    whatsAppWebhookLogSchema,
  )
