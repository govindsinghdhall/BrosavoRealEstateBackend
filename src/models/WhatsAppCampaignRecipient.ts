import { Schema, model, type Document } from 'mongoose'
import { applyAutoIncrement } from '../utils/autoIncrement'

export interface IWhatsAppCampaignRecipient
  extends Document<number> {
  organizationId: number
  campaignId: number
  contactId?: number
  phoneNumber: string
  messageId?: string

  status:
    | 'pending'
    | 'sent'
    | 'delivered'
    | 'read'
    | 'failed'

  errorMessage?: string

  sentAt?: Date
  deliveredAt?: Date
  readAt?: Date

  createdAt: Date
  updatedAt: Date
}

const whatsAppCampaignRecipientSchema =
  new Schema<IWhatsAppCampaignRecipient>(
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

      campaignId: {
        type: Number,
        ref: 'WhatsAppCampaign',
        required: true,
        index: true,
      },

      contactId: {
        type: Number,
        ref: 'Contact',
        index: true,
      },

      phoneNumber: {
        type: String,
        required: true,
        trim: true,
        index: true,
      },

      messageId: {
        type: String,
        trim: true,
        index: true,
        sparse: true,
      },

      status: {
        type: String,
        enum: [
          'pending',
          'sent',
          'delivered',
          'read',
          'failed',
        ],
        default: 'pending',
        required: true,
        index: true,
      },

      errorMessage: {
        type: String,
        trim: true,
        maxlength: 2000,
      },

      sentAt: {
        type: Date,
      },

      deliveredAt: {
        type: Date,
      },

      readAt: {
        type: Date,
      },
    },
    {
      timestamps: true,
    },
  )

applyAutoIncrement(
  whatsAppCampaignRecipientSchema,
  'WhatsAppCampaignRecipient',
)

// ============================================================
// INDEXES
// ============================================================

// Main campaign recipient lookup.
whatsAppCampaignRecipientSchema.index({
  organizationId: 1,
  campaignId: 1,
})

// Campaign worker uses this to find pending recipients.
whatsAppCampaignRecipientSchema.index({
  organizationId: 1,
  campaignId: 1,
  status: 1,
  _id: 1,
})

// Useful for campaign analytics/status filtering.
whatsAppCampaignRecipientSchema.index({
  organizationId: 1,
  status: 1,
})

// Used when opening campaign details and resolving CRM contacts.
whatsAppCampaignRecipientSchema.index({
  organizationId: 1,
  campaignId: 1,
  contactId: 1,
})

// Used by Meta webhook processing to find the recipient
// from the WhatsApp message ID.
whatsAppCampaignRecipientSchema.index({
  organizationId: 1,
  messageId: 1,
})

// Phone number lookup within a campaign.
whatsAppCampaignRecipientSchema.index({
  organizationId: 1,
  campaignId: 1,
  phoneNumber: 1,
})

export const WhatsAppCampaignRecipient =
  model<IWhatsAppCampaignRecipient>(
    'WhatsAppCampaignRecipient',
    whatsAppCampaignRecipientSchema,
  )
