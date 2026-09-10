import { Schema, model, type Document } from 'mongoose'
import { applyAutoIncrement } from '../utils/autoIncrement'

export const LOCATION_STATUSES = ['active', 'inactive'] as const
export type GoogleLocationStatus = (typeof LOCATION_STATUSES)[number]

export interface IGoogleBusinessLocation extends Document<number> {
  organizationId: number
  connectionId: number
  googleLocationId: string
  googleAccountId: string
  locationName: string
  businessName: string
  address: {
    line1?: string
    line2?: string
    city?: string
    state?: string
    postalCode?: string
    country?: string
    formatted?: string
  }
  phone?: string | null
  website?: string | null
  category?: string | null
  status: GoogleLocationStatus
  selected: boolean
  metadata: Record<string, unknown>
  lastSyncAt?: Date | null
  createdAt: Date
  updatedAt: Date
}

const schema = new Schema<IGoogleBusinessLocation>(
  {
    _id: { type: Number },
    organizationId: { type: Number, ref: 'Organization', required: true },
    connectionId: { type: Number, ref: 'MarketingProviderAccount', required: true },
    googleLocationId: { type: String, required: true, trim: true },
    googleAccountId: { type: String, required: true, trim: true },
    locationName: { type: String, required: true, trim: true },
    businessName: { type: String, required: true, trim: true },
    address: {
      line1: String,
      line2: String,
      city: String,
      state: String,
      postalCode: String,
      country: String,
      formatted: String,
    },
    phone: { type: String, default: null },
    website: { type: String, default: null },
    category: { type: String, default: null },
    status: { type: String, enum: LOCATION_STATUSES, default: 'active' },
    selected: { type: Boolean, default: false },
    metadata: { type: Schema.Types.Mixed, default: {} },
    lastSyncAt: { type: Date, default: null },
  },
  { timestamps: true },
)

schema.index({ organizationId: 1, googleLocationId: 1 }, { unique: true })
schema.index({ organizationId: 1, selected: 1, status: 1 })
schema.index({ connectionId: 1 })

applyAutoIncrement(schema, 'GoogleBusinessLocation')

export const GoogleBusinessLocation = model<IGoogleBusinessLocation>(
  'GoogleBusinessLocation',
  schema,
)
