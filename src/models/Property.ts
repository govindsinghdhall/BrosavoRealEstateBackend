import { Schema, model, type Document } from 'mongoose'
import { applyAutoIncrement } from '../utils/autoIncrement'
import type { ListingType, PriceType, ProjectStatus, PropertyLabel } from '../constants/propertyLabels'

export interface IProjectConfiguration {
  bedrooms: number
  bathrooms: number
  areaMin: number | null
  areaMax: number | null
  startingPrice: number
  availableUnits: number | null
}

export interface IPropertyOffer {
  title: string
  description: string
  validFrom: string
  validUntil: string
}

export interface IProperty extends Document<number> {
  organizationId: number
  listingType: ListingType
  title: string
  slug: string | null
  description: string | null
  listingCategory: string
  type: string
  status: string
  projectStatus: ProjectStatus | null
  projectName: string | null
  projectLaunchDate: string | null
  projectWebsite: string | null
  projectDescription: string | null
  projectHighlights: string[]
  totalUnits: number | null
  availableUnits: number | null
  totalTowers: number | null
  totalFloors: number | null
  configurations: IProjectConfiguration[]
  price: number
  priceType: PriceType
  originalPrice: number | null
  discountedPrice: number | null
  previousPrice: number | null
  labels: PropertyLabel[]
  offer: IPropertyOffer | null
  urgencyReason: string | null
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

const projectConfigurationSchema = new Schema<IProjectConfiguration>(
  {
    bedrooms: { type: Number, required: true, min: 0 },
    bathrooms: { type: Number, required: true, min: 1 },
    areaMin: { type: Number, default: null, min: 0 },
    areaMax: { type: Number, default: null, min: 0 },
    startingPrice: { type: Number, required: true, min: 0 },
    availableUnits: { type: Number, default: null, min: 0 },
  },
  { _id: false },
)

const propertyOfferSchema = new Schema<IPropertyOffer>(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, default: '', trim: true },
    validFrom: { type: String, required: true },
    validUntil: { type: String, required: true },
  },
  { _id: false },
)

const propertySchema = new Schema<IProperty>(
  {
    _id: { type: Number },
    organizationId: { type: Number, ref: 'Organization', required: true, index: true },
    listingType: { type: String, default: 'INDIVIDUAL', uppercase: true, trim: true, index: true },
    title: { type: String, required: true, trim: true },
    slug: { type: String, default: null, trim: true, lowercase: true },
    description: { type: String, default: null },
    listingCategory: { type: String, default: 'BUY', uppercase: true, trim: true },
    type: { type: String, required: true, uppercase: true, trim: true },
    status: { type: String, default: 'AVAILABLE', uppercase: true, trim: true, index: true },
    projectStatus: { type: String, default: null, uppercase: true, trim: true, index: true },
    projectName: { type: String, default: null, trim: true },
    projectLaunchDate: { type: String, default: null },
    projectWebsite: { type: String, default: null, trim: true },
    projectDescription: { type: String, default: null },
    projectHighlights: { type: [String], default: [] },
    totalUnits: { type: Number, default: null, min: 0 },
    availableUnits: { type: Number, default: null, min: 0 },
    totalTowers: { type: Number, default: null, min: 0 },
    totalFloors: { type: Number, default: null, min: 0 },
    configurations: { type: [projectConfigurationSchema], default: [] },
    price: { type: Number, required: true, min: 0 },
    priceType: { type: String, default: 'FIXED', uppercase: true, trim: true },
    originalPrice: { type: Number, default: null, min: 0 },
    discountedPrice: { type: Number, default: null, min: 0 },
    previousPrice: { type: Number, default: null, min: 0 },
    labels: { type: [String], default: [], index: true },
    offer: { type: propertyOfferSchema, default: null },
    urgencyReason: { type: String, default: null, trim: true },
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
    locality: { type: String, default: '', trim: true, index: true },
    sector: { type: String, default: null, trim: true, index: true },
    landmark: { type: String, default: null, trim: true },
    latitude: { type: Number, default: null },
    longitude: { type: Number, default: null },
    builderName: { type: String, default: null, trim: true, index: true },
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
propertySchema.index({ organizationId: 1, listingType: 1 })
propertySchema.index({ organizationId: 1, projectStatus: 1 })
propertySchema.index({ organizationId: 1, labels: 1 })
propertySchema.index({ organizationId: 1, projectName: 1 })
propertySchema.index({ title: 'text', projectName: 'text', locality: 'text', sector: 'text', builderName: 'text' })

export const Property = model<IProperty>('Property', propertySchema)
