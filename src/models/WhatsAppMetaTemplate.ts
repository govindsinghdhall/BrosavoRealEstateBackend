import { Schema, model, type Document } from 'mongoose'
import { applyAutoIncrement } from '../utils/autoIncrement'

export interface IWhatsAppMetaTemplate
  extends Document<number> {
  organizationId: number
  templateId: string
  name: string
  category:
    | 'MARKETING'
    | 'UTILITY'
    | 'AUTHENTICATION'
  language: string
  status:
    | 'APPROVED'
    | 'PENDING'
    | 'REJECTED'
    | 'PAUSED'
    | 'DISABLED'
  quality:
    | 'GREEN'
    | 'YELLOW'
    | 'RED'
    | 'UNKNOWN'

  components: Array<{
    type:
      | 'HEADER'
      | 'BODY'
      | 'FOOTER'
      | 'BUTTONS'

    text?: string

    format?:
      | 'TEXT'
      | 'IMAGE'
      | 'VIDEO'
      | 'DOCUMENT'

    example?: any

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
  }>

  variables: string[]

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
       * This is Meta's template ID.
       *
       * Do NOT make this globally unique because this is a
       * multi-tenant CRM and every organization must be scoped
       * independently.
       */
      templateId: {
        type: String,
        required: true,
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
        enum: [
          'MARKETING',
          'UTILITY',
          'AUTHENTICATION',
        ],
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
          'APPROVED',
          'PENDING',
          'REJECTED',
          'PAUSED',
          'DISABLED',
        ],
        required: true,
      },

      quality: {
        type: String,
        enum: [
          'GREEN',
          'YELLOW',
          'RED',
          'UNKNOWN',
        ],
        default: 'UNKNOWN',
      },

      components: [
        {
          type: {
            type: String,
            enum: [
              'HEADER',
              'BODY',
              'FOOTER',
              'BUTTONS',
            ],
            required: true,
          },

          text: {
            type: String,
            trim: true,
          },

          format: {
            type: String,
            enum: [
              'TEXT',
              'IMAGE',
              'VIDEO',
              'DOCUMENT',
            ],
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

      /*
       * Extracted variables from Meta template components.
       *
       * Example:
       *
       * ["1", "2", "customer_name"]
       */
      variables: {
        type: [String],
        default: [],
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

// ============================================================
// INDEXES
// ============================================================

// Same Meta template ID can safely exist in separate
// organizations.
whatsAppMetaTemplateSchema.index(
  {
    organizationId: 1,
    templateId: 1,
  },
  {
    unique: true,
  },
)

// Useful for template selection in the CRM.
whatsAppMetaTemplateSchema.index({
  organizationId: 1,
  name: 1,
  language: 1,
})

// Campaign creation only allows APPROVED templates.
whatsAppMetaTemplateSchema.index({
  organizationId: 1,
  status: 1,
})

// Template filtering by category.
whatsAppMetaTemplateSchema.index({
  organizationId: 1,
  category: 1,
})

// Soft-delete aware queries.
whatsAppMetaTemplateSchema.index({
  organizationId: 1,
  deletedAt: 1,
})

export const WhatsAppMetaTemplate =
  model<IWhatsAppMetaTemplate>(
    'WhatsAppMetaTemplate',
    whatsAppMetaTemplateSchema,
  )
