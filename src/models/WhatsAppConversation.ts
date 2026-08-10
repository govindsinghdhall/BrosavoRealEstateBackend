import { Schema, model, type Document } from 'mongoose'
import { applyAutoIncrement } from '../utils/autoIncrement'

export interface IWhatsAppConversation extends Document<number> {
  organizationId: number
  contactId?: number
  wabaId: string
  phoneNumberId: string
  customerPhone: string
  contactName?: string
  lastMessage?: string
  lastMessageAt: Date
  unreadCount: number
  isArchived: boolean
  assignedTo?: number
  status: 'active' | 'archived' | 'resolved'
  deletedAt: Date | null
  createdAt: Date
  updatedAt: Date
}

const whatsAppConversationSchema =
  new Schema<IWhatsAppConversation>(
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

      contactId: {
        type: Number,
        ref: 'Contact',
        index: true,
      },

      wabaId: {
        type: String,
        required: true,
        trim: true,
        index: true,
      },

      phoneNumberId: {
        type: String,
        required: true,
        trim: true,
        index: true,
      },

      customerPhone: {
        type: String,
        required: true,
        trim: true,
        index: true,
      },

      contactName: {
        type: String,
        trim: true,
        default: null,
      },

      lastMessage: {
        type: String,
        trim: true,
        default: null,
      },

      lastMessageAt: {
        type: Date,
        default: Date.now,
        index: true,
      },

      unreadCount: {
        type: Number,
        default: 0,
        min: 0,
      },

      isArchived: {
        type: Boolean,
        default: false,
      },

      assignedTo: {
        type: Number,
        ref: 'User',
        index: true,
      },

      status: {
        type: String,
        enum: ['active', 'archived', 'resolved'],
        default: 'active',
        index: true,
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
  whatsAppConversationSchema,
  'WhatsAppConversation',
)

// ============================================================
// INDEXES
// ============================================================

// A WhatsApp conversation must be unique for an organization,
// customer phone, phone number and WABA.
//
// Partial index is intentional so a soft-deleted conversation
// does not prevent a new active conversation from being created.
whatsAppConversationSchema.index(
  {
    organizationId: 1,
    customerPhone: 1,
    phoneNumberId: 1,
    wabaId: 1,
  },
  {
    unique: true,
    partialFilterExpression: {
      deletedAt: null,
    },
  },
)

whatsAppConversationSchema.index({
  organizationId: 1,
  assignedTo: 1,
})

whatsAppConversationSchema.index({
  organizationId: 1,
  lastMessageAt: -1,
})

whatsAppConversationSchema.index({
  organizationId: 1,
  status: 1,
  unreadCount: -1,
})

whatsAppConversationSchema.index({
  organizationId: 1,
  contactId: 1,
})

export const WhatsAppConversation =
  model<IWhatsAppConversation>(
    'WhatsAppConversation',
    whatsAppConversationSchema,
  )
