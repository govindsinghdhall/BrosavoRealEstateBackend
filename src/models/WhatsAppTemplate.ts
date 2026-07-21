import { Schema, model, type Document } from 'mongoose'
import { applyAutoIncrement } from '../utils/autoIncrement'

export interface IWhatsAppTemplate extends Document<number> {
  organizationId: number
  name: string
  message: string
  createdAt: Date
  updatedAt: Date
}

const whatsAppTemplateSchema = new Schema<IWhatsAppTemplate>(
  {
    _id: { type: Number },
    organizationId: { type: Number, ref: 'Organization', required: true, index: true },
    name: { type: String, required: true, trim: true },
    message: { type: String, required: true, trim: true },
  },
  { timestamps: true },
)

applyAutoIncrement(whatsAppTemplateSchema, 'WhatsAppTemplate')

export const WhatsAppTemplate = model<IWhatsAppTemplate>('WhatsAppTemplate', whatsAppTemplateSchema)
