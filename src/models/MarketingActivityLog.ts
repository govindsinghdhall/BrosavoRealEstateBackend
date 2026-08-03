import { Schema, model, type Document } from 'mongoose'
import { applyAutoIncrement } from '../utils/autoIncrement'

export interface IMarketingActivityLog extends Document<number> {
  organizationId: number
  module: string
  action: string
  description: string
  performedBy?: number | null
  ip?: string | null
  userAgent?: string | null
  createdAt: Date
  updatedAt: Date
}

const schema = new Schema<IMarketingActivityLog>(
  {
    _id: { type: Number },
    organizationId: { type: Number, ref: 'Organization', required: true, index: true },
    module: { type: String, required: true, index: true },
    action: { type: String, required: true },
    description: { type: String, required: true },
    performedBy: { type: Number, ref: 'User', default: null },
    ip: { type: String, default: null },
    userAgent: { type: String, default: null },
  },
  { timestamps: true },
)

schema.index({ organizationId: 1, createdAt: -1 })

applyAutoIncrement(schema, 'MarketingActivityLog')

export const MarketingActivityLog = model<IMarketingActivityLog>('MarketingActivityLog', schema)
