import { Schema, model, type Document, type Types } from 'mongoose'
import { applyAutoIncrement } from '../utils/autoIncrement'

export const MARKETING_PROVIDERS = [
  'google',
  'whatsapp',
  'facebook',
  'instagram',
  'linkedin',
] as const

export type MarketingProvider = (typeof MARKETING_PROVIDERS)[number]

export interface IMarketingProviderAccount extends Document<number> {
  organizationId: number
  provider: MarketingProvider
  accountName: string
  accountId?: string | null
  locationId?: string | null
  accessToken?: string | null
  refreshToken?: string | null
  tokenExpiry?: Date | null
  metadata: Record<string, unknown>
  isConnected: boolean
  createdBy?: number | null
  updatedBy?: number | null
  createdAt: Date
  updatedAt: Date
}

const schema = new Schema<IMarketingProviderAccount>(
  {
    _id: { type: Number },
    organizationId: { type: Number, ref: 'Organization', required: true, index: true },
    provider: { type: String, enum: MARKETING_PROVIDERS, required: true, index: true },
    accountName: { type: String, required: true, trim: true },
    accountId: { type: String, default: null },
    locationId: { type: String, default: null },
    accessToken: { type: String, default: null, select: false },
    refreshToken: { type: String, default: null, select: false },
    tokenExpiry: { type: Date, default: null },
    metadata: { type: Schema.Types.Mixed, default: {} },
    isConnected: { type: Boolean, default: false, index: true },
    createdBy: { type: Number, ref: 'User', default: null },
    updatedBy: { type: Number, ref: 'User', default: null },
  },
  { timestamps: true },
)

schema.index({ organizationId: 1, provider: 1 }, { unique: true })

applyAutoIncrement(schema, 'MarketingProviderAccount')

export const MarketingProviderAccount = model<IMarketingProviderAccount>(
  'MarketingProviderAccount',
  schema,
)

// Keep Types import available for future metadata typing without unused lint noise
export type MarketingMetadata = Types.Subdocument | Record<string, unknown>
