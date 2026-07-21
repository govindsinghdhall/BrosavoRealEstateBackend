import { Schema, model, type Document } from 'mongoose'
import { applyAutoIncrement } from '../utils/autoIncrement'

export interface OrganizationSettings {
  faviconUrl?: string
  tagline?: string
  websiteApiKey?: string
  whatsapp?: {
    businessPhone?: string
    businessId?: string
    displayName?: string
  }
}

export interface IOrganization extends Document<number> {
  name: string
  slug: string
  logo: string | null
  email: string | null
  phone: string | null
  address: string | null
  settings: OrganizationSettings | null
  isActive: boolean
  createdAt: Date
  updatedAt: Date
}

const organizationSchema = new Schema<IOrganization>(
  {
    _id: { type: Number },
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    logo: { type: String, default: null },
    email: { type: String, default: null, lowercase: true, trim: true },
    phone: { type: String, default: null, trim: true },
    address: { type: String, default: null, trim: true },
    settings: {
      type: new Schema(
        {
          faviconUrl: String,
          tagline: String,
          websiteApiKey: String,
          whatsapp: {
            businessPhone: String,
            businessId: String,
            displayName: String,
          },
        },
        { _id: false },
      ),
      default: null,
    },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
)

applyAutoIncrement(organizationSchema, 'Organization')

export const Organization = model<IOrganization>('Organization', organizationSchema)
