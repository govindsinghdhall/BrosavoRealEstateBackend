import { Schema, model, type Document } from 'mongoose'
import { applyAutoIncrement } from '../utils/autoIncrement'

export type WhatsAppTemplateCategory =
  | 'MARKETING'
  | 'UTILITY'
  | 'AUTHENTICATION'

export type WhatsAppTemplateStatus =
  | 'DRAFT'
  | 'PENDING'
  | 'APPROVED'
  | 'REJECTED'
  | 'PAUSED'
  | 'DISABLED'

export interface IWhatsAppMetaTemplateComponent {
  type: 'HEADER' | 'BODY' | 'FOOTER' | 'BUTTONS'
  text?: string
  format?: 'TEXT' | 'IMAGE' | 'VIDEO' | 'DOCUMENT'
  example?: unknown
  buttons?: Array<{
    type:
      | 'PHONE_NUMBER'
      | 'URL'
      | 'QUICK_REPLY'
      | 'COPY_CODE'
      | 'FLOW'
    text: string
    url?: string
    phone_number?: string
    example?: string[]
  }>
}

export interface IWhatsAppMetaTemplate
  extends Document<number> {
  organizationId: number
  /** Meta template ID. Null for local drafts not yet submitted. */
  templateId: string | null
  name: string
  category: WhatsAppTemplateCategory
  language: string
  status: WhatsAppTemplateStatus
  quality: 'GREEN' | 'YELLOW' | 'RED' | 'UNKNOWN'
  components: IWhatsAppMetaTemplateComponent[]
  variables: string[]
  rejectionReason: string | null
  deletedAt: Date | null
  createdAt: Date
  updatedAt: Date
}

const whatsAppMetaTemplateSchema =
  new Schema<IWhatsAppMetaTemplate>(
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

      /*
       * Meta's template ID.
       * Null for CRM drafts that have not been submitted yet.
       */
      templateId: {
        type: String,
        required: false,
        default: null,
        trim: true,
      },

      name: {
        type: String,
        required: true,
        trim: true,
        index: true,
      },

      category: {
        type: String,
        enum: ['MARKETING', 'UTILITY', 'AUTHENTICATION'],
        required: true,
      },

      language: {
        type: String,
        required: true,
        trim: true,
      },

      status: {
        type: String,
        enum: [
          'DRAFT',
          'PENDING',
          'APPROVED',
          'REJECTED',
          'PAUSED',
          'DISABLED',
        ],
        required: true,
      },

      quality: {
        type: String,
        enum: ['GREEN', 'YELLOW', 'RED', 'UNKNOWN'],
        default: 'UNKNOWN',
      },

      components: [
        {
          type: {
            type: String,
            enum: ['HEADER', 'BODY', 'FOOTER', 'BUTTONS'],
            required: true,
          },

          text: {
            type: String,
            trim: true,
          },

          format: {
            type: String,
            enum: ['TEXT', 'IMAGE', 'VIDEO', 'DOCUMENT'],
          },

          example: {
            type: Schema.Types.Mixed,
          },

          buttons: [
            {
              type: {
                type: String,
                enum: [
                  'PHONE_NUMBER',
                  'URL',
                  'QUICK_REPLY',
                  'COPY_CODE',
                  'FLOW',
                ],
              },

              text: {
                type: String,
                trim: true,
              },

              url: {
                type: String,
                trim: true,
              },

              phone_number: {
                type: String,
                trim: true,
              },

              example: {
                type: [String],
              },
            },
          ],
        },
      ],

      variables: {
        type: [String],
        default: [],
      },

      rejectionReason: {
        type: String,
        default: null,
        trim: true,
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
  whatsAppMetaTemplateSchema,
  'WhatsAppMetaTemplate',
)

// Meta template IDs are unique per organization (drafts have null templateId).
whatsAppMetaTemplateSchema.index(
  {
    organizationId: 1,
    templateId: 1,
  },
  {
    unique: true,
    partialFilterExpression: {
      templateId: { $type: 'string' },
      deletedAt: null,
    },
  },
)

// One active template per name + language per organization.
whatsAppMetaTemplateSchema.index(
  {
    organizationId: 1,
    name: 1,
    language: 1,
  },
  {
    unique: true,
    partialFilterExpression: {
      deletedAt: null,
    },
  },
)

whatsAppMetaTemplateSchema.index({
  organizationId: 1,
  status: 1,
})

whatsAppMetaTemplateSchema.index({
  organizationId: 1,
  category: 1,
})

whatsAppMetaTemplateSchema.index({
  organizationId: 1,
  deletedAt: 1,
})

export const WhatsAppMetaTemplate =
  model<IWhatsAppMetaTemplate>(
    'WhatsAppMetaTemplate',
    whatsAppMetaTemplateSchema,
  )
