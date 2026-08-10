import { Schema, model, type Document } from 'mongoose'
import { applyAutoIncrement } from '../utils/autoIncrement'

export interface IWhatsAppMessage extends Document<number> {
  organizationId: number
  conversationId: number
  messageId: string
  from: string
  to: string
  direction: 'inbound' | 'outbound'
  type:
    | 'text'
    | 'image'
    | 'video'
    | 'audio'
    | 'document'
    | 'location'
    | 'interactive'
    | 'template'
  content: any
  status:
    | 'queued'
    | 'sending'
    | 'sent'
    | 'delivered'
    | 'read'
    | 'failed'
  statusCode?: string
  errorMessage?: string
  sentAt?: Date
  deliveredAt?: Date
  readAt?: Date
  metadata?: any
  deletedAt: Date | null
  createdAt: Date
  updatedAt: Date
}

const whatsAppMessageSchema =
  new Schema<IWhatsAppMessage>(
    {
      _id: {
        type: Number,
      },

      organizationId: {
        type: Number,
        ref: 'Organization',
        required: true,
        index: true,
      },

      conversationId: {
        type: Number,
        ref: 'WhatsAppConversation',
        required: true,
        index: true,
      },

      messageId: {
        type: String,
        required: true,
        trim: true,
        index: true,
      },

      from: {
        type: String,
        required: true,
        trim: true,
      },

      to: {
        type: String,
        required: true,
        trim: true,
      },

      direction: {
        type: String,
        enum: ['inbound', 'outbound'],
        required: true,
      },

      type: {
        type: String,
        enum: [
          'text',
          'image',
          'video',
          'audio',
          'document',
          'location',
          'interactive',
          'template',
        ],
        required: true,
      },

      content: {
        type: Schema.Types.Mixed,
        required: true,
      },

      status: {
        type: String,
        enum: [
          'queued',
          'sending',
          'sent',
          'delivered',
          'read',
          'failed',
        ],
        default: 'queued',
        required: true,
        index: true,
      },

      statusCode: {
        type: String,
        trim: true,
      },

      errorMessage: {
        type: String,
        trim: true,
        maxlength: 2000,
      },

      sentAt: Date,

      deliveredAt: Date,

      readAt: Date,

      metadata: {
        type: Schema.Types.Mixed,
      },

      deletedAt: {
        type: Date,
        default: null,
        index: true,
      },
    },
    {
      timestamps: true,
    },
  )

applyAutoIncrement(
  whatsAppMessageSchema,
  'WhatsAppMessage',
)

// Meta message IDs should only identify one message within
// an organization. This also supports safe webhook
// de-duplication.
whatsAppMessageSchema.index({
  organizationId: 1,
  messageId: 1,
}, {
  unique: true,
})

whatsAppMessageSchema.index({
  organizationId: 1,
  conversationId: 1,
  createdAt: -1,
})

whatsAppMessageSchema.index({
  organizationId: 1,
  from: 1,
  to: 1,
})

whatsAppMessageSchema.index({
  organizationId: 1,
  status: 1,
})

export const WhatsAppMessage =
  model<IWhatsAppMessage>(
    'WhatsAppMessage',
    whatsAppMessageSchema,
  )
