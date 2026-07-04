import { Schema, model, type Document } from 'mongoose'
import { applyAutoIncrement } from '../utils/autoIncrement'

export type LeadPropertyInterestLevel =
  | 'SUGGESTED'
  | 'INTERESTED'
  | 'SHORTLISTED'
  | 'VIEWED'
  | 'REJECTED'

export interface ILeadProperty extends Document<number> {
  organizationId: number
  leadId: number
  propertyId: number
  isPrimary: boolean
  interestLevel: LeadPropertyInterestLevel
  matchScore: number | null
  notes: string | null
  linkedById: number
  deletedAt: Date | null
  createdAt: Date
  updatedAt: Date
}

const leadPropertySchema = new Schema<ILeadProperty>(
  {
    _id: { type: Number },
    organizationId: { type: Number, required: true, index: true },
    leadId: { type: Number, ref: 'Lead', required: true, index: true },
    propertyId: { type: Number, ref: 'Property', required: true, index: true },
    isPrimary: { type: Boolean, default: false },
    interestLevel: {
      type: String,
      default: 'INTERESTED',
      uppercase: true,
      trim: true,
    },
    matchScore: { type: Number, default: null },
    notes: { type: String, default: null, trim: true },
    linkedById: { type: Number, ref: 'User', required: true },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true },
)

applyAutoIncrement(leadPropertySchema, 'LeadProperty')

leadPropertySchema.index(
  { organizationId: 1, leadId: 1, propertyId: 1 },
  { unique: true, partialFilterExpression: { deletedAt: null } },
)

export const LeadProperty = model<ILeadProperty>('LeadProperty', leadPropertySchema)
