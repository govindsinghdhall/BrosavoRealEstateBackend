import { Schema, model, type Document } from 'mongoose'
import { applyAutoIncrement } from '../utils/autoIncrement'

export interface IWhatsAppAccount extends Document<number> {
  organizationId: number
  businessName: string
  displayName: string
  businessId: string
  wabaId: string
  phoneNumber: string
  phoneNumberId: string
  accessToken: string
  tokenExpiry: Date
  isConnected: boolean
  webhookVerified: boolean
  lastSync: Date
  deletedAt: Date | null
  createdAt: Date
  updatedAt: Date
}

const whatsAppAccountSchema =
  new Schema<IWhatsAppAccount>(
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

      businessName: {
        type: String,
        required: true,
        trim: true,
      },

      displayName: {
        type: String,
        required: true,
        trim: true,
      },

      businessId: {
        type: String,
        required: true,
        trim: true,
        index: true,
      },

      wabaId: {
        type: String,
        required: true,
        trim: true,
        index: true,
      },

      phoneNumber: {
        type: String,
        required: true,
        trim: true,
      },

      phoneNumberId: {
        type: String,
        required: true,
        trim: true,
        index: true,
      },

      // Always stored encrypted.
      // Never expose this field to the frontend.
      accessToken: {
        type: String,
        required: true,
        select: false,
      },

      tokenExpiry: {
        type: Date,
        required: true,
      },

      isConnected: {
        type: Boolean,
        default: false,
        index: true,
      },

      webhookVerified: {
        type: Boolean,
        default: false,
      },

      lastSync: {
        type: Date,
        default: Date.now,
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
  whatsAppAccountSchema,
  'WhatsAppAccount',
)

// Organization-scoped account lookup.
whatsAppAccountSchema.index({
  organizationId: 1,
  isConnected: 1,
})

// Phone number ID is the Meta identifier used for sending.
whatsAppAccountSchema.index({
  organizationId: 1,
  phoneNumberId: 1,
})

// WABA lookup.
whatsAppAccountSchema.index({
  organizationId: 1,
  wabaId: 1,
})

// Business lookup.
whatsAppAccountSchema.index({
  organizationId: 1,
  businessId: 1,
})

// A connected organization should normally have one active
// WhatsApp account. Soft-deleted accounts are excluded.
whatsAppAccountSchema.index(
  {
    organizationId: 1,
    phoneNumberId: 1,
  },
  {
    unique: true,
    partialFilterExpression: {
      deletedAt: null,
    },
  },
)

export const WhatsAppAccount =
  model<IWhatsAppAccount>(
    'WhatsAppAccount',
    whatsAppAccountSchema,
  )
