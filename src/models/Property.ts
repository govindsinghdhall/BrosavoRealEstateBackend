import { Schema, model, type Document } from 'mongoose'
import { applyAutoIncrement } from '../utils/autoIncrement'

export interface IProperty extends Document<number> {
  organizationId: number
  title: string
  description: string | null
  listingCategory: string
  type: string
  status: string
  price: number
  area: number
  carpetArea: number | null
  builtUpArea: number | null
  superArea: number | null
  bedrooms: number | null
  bathrooms: number | null
  address: string
  city: string
  state: string
  pincode: string | null
  locality: string
  sector: string | null
  landmark: string | null
  latitude: number | null
  longitude: number | null
  builderName: string | null
  propertyAge: string | null
  furnishing: string | null
  facing: string | null
  possessionStatus: string | null
  possessionDate: string | null
  roiPotential: number | null
  isVerified: boolean
  hasRera: boolean
  reraId: string | null
  videoTourUrl: string | null
  virtualTourUrl: string | null
  brochureUrl: string | null
  amenities: string[]
  isActive: boolean
  ownerName: string | null
  ownerPhone: string | null
  ownerEmail: string | null
  ownerAddress: string | null
  ownerNotes: string | null
  deletedAt: Date | null
  createdAt: Date
  updatedAt: Date
}

const propertySchema = new Schema<IProperty>(
  {
    _id: { type: Number },
    organizationId: { type: Number, ref: 'Organization', required: true, index: true },
    title: { type: String, required: true, trim: true },
    description: { type: String, default: null },
    listingCategory: { type: String, default: 'BUY', uppercase: true, trim: true },
    type: { type: String, required: true, uppercase: true, trim: true },
    status: { type: String, default: 'AVAILABLE', uppercase: true, trim: true, index: true },
    price: { type: Number, required: true, min: 0 },
    area: { type: Number, required: true, min: 0 },
    carpetArea: { type: Number, default: null },
    builtUpArea: { type: Number, default: null },
    superArea: { type: Number, default: null },
    bedrooms: { type: Number, default: null },
    bathrooms: { type: Number, default: null },
    address: { type: String, required: true, trim: true },
    city: { type: String, required: true, trim: true, index: true },
    state: { type: String, required: true, trim: true },
    pincode: { type: String, default: null, trim: true },
    locality: { type: String, default: '', trim: true },
    sector: { type: String, default: null, trim: true },
    landmark: { type: String, default: null, trim: true },
    latitude: { type: Number, default: null },
    longitude: { type: Number, default: null },
    builderName: { type: String, default: null, trim: true },
    propertyAge: { type: String, default: null, uppercase: true, trim: true },
    furnishing: { type: String, default: null, uppercase: true, trim: true },
    facing: { type: String, default: null, uppercase: true, trim: true },
    possessionStatus: { type: String, default: null, uppercase: true, trim: true },
    possessionDate: { type: String, default: null },
    roiPotential: { type: Number, default: null },
    isVerified: { type: Boolean, default: true },
    hasRera: { type: Boolean, default: false },
    reraId: { type: String, default: null, trim: true },
    videoTourUrl: { type: String, default: null },
    virtualTourUrl: { type: String, default: null },
    brochureUrl: { type: String, default: null },
    amenities: { type: [String], default: [] },
    isActive: { type: Boolean, default: true },
    ownerName: { type: String, default: null, trim: true },
    ownerPhone: { type: String, default: null, trim: true },
    ownerEmail: { type: String, default: null, lowercase: true, trim: true },
    ownerAddress: { type: String, default: null, trim: true },
    ownerNotes: { type: String, default: null, trim: true },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true },
)

applyAutoIncrement(propertySchema, 'Property')

propertySchema.index({ organizationId: 1, status: 1 })
propertySchema.index({ organizationId: 1, type: 1 })
propertySchema.index({ organizationId: 1, city: 1 })

export const Property = model<IProperty>('Property', propertySchema)
