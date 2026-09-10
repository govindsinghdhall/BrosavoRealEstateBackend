import type { IProperty } from '../models/Property'
import { Property } from '../models/Property'
import { LeadSource } from '../models/LeadSource'
import { User } from '../models/User'
import { Role } from '../models/Role'
import { NotFoundError } from '../utils/errors'
import { createLead } from './lead.service'
import {
  buildConfigurationSummary,
  computeDiscountPercent,
  computeReductionPercent,
  getActiveLabels,
  isOfferActive,
} from './propertyValidation.service'

function publicPropertyFilter(organizationId: number) {
  return {
    organizationId,
    deletedAt: null,
    isActive: true,
  }
}

function applyCategoryFilter(filter: Record<string, unknown>, category?: string) {
  if (!category || category === 'buy') {
    filter.$or = [
      { listingCategory: 'BUY' },
      { listingCategory: { $exists: false } },
      { listingCategory: null },
    ]
    return
  }

  switch (category) {
    case 'rent':
      filter.listingCategory = 'RENT'
      break
    case 'pg':
      filter.listingCategory = 'PG'
      break
    case 'commercial':
      filter.type = { $in: ['COMMERCIAL', 'OFFICE', 'SHOP', 'WAREHOUSE', 'COWORKING_SPACE'] }
      break
    case 'plot':
      filter.type = 'PLOT'
      break
    case 'luxury':
      filter.price = { $gte: 5_000_000 }
      break
    case 'new_projects':
      filter.$or = [
        { listingType: 'PROJECT' },
        { possessionStatus: 'UNDER_CONSTRUCTION' },
      ]
      break
    default:
      filter.listingCategory = category.toUpperCase()
  }
}

function applyBhkFilter(filter: Record<string, unknown>, bhk: string) {
  const clauses: Record<string, unknown>[] = []

  for (const value of bhk.split(',').map((entry) => entry.trim()).filter(Boolean)) {
    if (value === 'studio') {
      clauses.push({ bedrooms: 0 })
      continue
    }
    if (value === '5_plus_bhk') {
      clauses.push({ bedrooms: { $gte: 5 } })
      continue
    }
    const match = value.match(/(\d+)_bhk/)
    if (match) {
      clauses.push({ bedrooms: Number(match[1]) })
    }
  }

  if (clauses.length) {
    filter.$and = [...((filter.$and as Record<string, unknown>[]) ?? []), { $or: clauses }]
  }
}

function applyTypeFilter(filter: Record<string, unknown>, type: string) {
  const types = type
    .split(',')
    .map((entry) => entry.trim().toUpperCase())
    .filter(Boolean)

  if (types.length) {
    filter.type = types.length === 1 ? types[0] : { $in: types }
  }
}

function applyListFilter(
  filter: Record<string, unknown>,
  field: string,
  values: string,
  uppercase = true,
) {
  const entries = values
    .split(',')
    .map((entry) => (uppercase ? entry.trim().toUpperCase() : entry.trim()))
    .filter(Boolean)

  if (!entries.length) return

  filter[field] = entries.length === 1 ? entries[0] : { $in: entries }
}

export function serializePublicProperty(property: IProperty) {
  const area = property.area
  const superArea = property.superArea ?? area
  const listingType = property.listingType ?? 'INDIVIDUAL'
  const isProject = listingType === 'PROJECT'
  const displayPrice =
    property.labels?.includes('DISCOUNTED') && property.discountedPrice
      ? property.discountedPrice
      : property.price
  const price = displayPrice
  const activeLabels = getActiveLabels(property.labels ?? [], property.offer)
  const activeOffer =
    property.offer && isOfferActive(property.offer) ? property.offer : null

  const discountPercent =
    property.originalPrice && property.discountedPrice
      ? computeDiscountPercent(property.originalPrice, property.discountedPrice)
      : null
  const reductionPercent =
    property.previousPrice && property.price
      ? computeReductionPercent(property.previousPrice, property.price)
      : null

  const configurationSummary = isProject
    ? buildConfigurationSummary(property.configurations ?? [])
    : null

  return {
    id: String(property._id),
    listingType: listingType.toLowerCase(),
    slug: property.slug,
    title: property.title,
    description: isProject ? property.projectDescription ?? property.description : property.description,
    listingCategory: (property.listingCategory || 'BUY').toLowerCase(),
    type: property.type.toLowerCase(),
    status: property.status.toLowerCase(),
    projectStatus: property.projectStatus?.toLowerCase() ?? null,
    projectName: property.projectName,
    projectLaunchDate: property.projectLaunchDate,
    projectWebsite: property.projectWebsite,
    projectHighlights: property.projectHighlights ?? [],
    totalUnits: property.totalUnits,
    availableUnits: property.availableUnits,
    totalTowers: property.totalTowers,
    totalFloors: property.totalFloors,
    configurations: (property.configurations ?? []).map((c) => ({
      bedrooms: c.bedrooms,
      bathrooms: c.bathrooms,
      areaMin: c.areaMin,
      areaMax: c.areaMax,
      startingPrice: c.startingPrice,
      availableUnits: c.availableUnits,
    })),
    configurationSummary,
    price,
    startingPrice: isProject ? property.price : null,
    priceType: (property.priceType ?? 'FIXED').toLowerCase(),
    originalPrice: property.originalPrice,
    discountedPrice: property.discountedPrice,
    previousPrice: property.previousPrice,
    discountPercent,
    reductionPercent,
    labels: activeLabels.map((l) => l.toLowerCase()),
    featured: activeLabels.includes('FEATURED'),
    offer: activeOffer,
    pricePerSqFt: superArea > 0 ? Math.round(price / superArea) : 0,
    area,
    carpetArea: property.carpetArea,
    builtUpArea: property.builtUpArea,
    superArea,
    bedrooms: property.bedrooms,
    bathrooms: property.bathrooms,
    address: property.address,
    city: property.city,
    state: property.state,
    pincode: property.pincode,
    locality: property.locality || property.city,
    sector: property.sector,
    landmark: property.landmark,
    latitude: property.latitude,
    longitude: property.longitude,
    builderName: property.builderName,
    propertyAge: property.propertyAge,
    furnishing: property.furnishing,
    facing: property.facing,
    possessionStatus: property.possessionStatus,
    possessionDate: property.possessionDate,
    roiPotential: property.roiPotential,
    postedBy: 'Durga Property',
    isVerified: property.isVerified,
    hasRera: property.hasRera,
    reraId: property.reraId,
    hasVideoTour: Boolean(property.videoTourUrl),
    videoTourUrl: property.videoTourUrl,
    virtualTourUrl: property.virtualTourUrl,
    brochureUrl: property.brochureUrl,
    amenities: property.amenities ?? [],
    images: [],
    luxury: property.price >= 5_000_000,
  }
}

export async function listPublicProperties(
  organizationId: number,
  options: {
  page: number
  limit: number
  search?: string
  category?: string
  city?: string
  locality?: string
  sector?: string
  pincode?: string
  landmark?: string
  minPrice?: string
  maxPrice?: string
  minArea?: string
  maxArea?: string
  bedrooms?: string
  bhk?: string
  type?: string
  amenities?: string
  propertyAge?: string
  furnishing?: string
  facing?: string
  possessionStatus?: string
  status?: string
  builder?: string
  featured?: boolean
  listingType?: string
  projectStatus?: string
  labels?: string
  reraOnly?: boolean
  readyToMove?: boolean
  underConstruction?: boolean
  possessionYear?: string
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
}) {
  const filter: Record<string, unknown> = publicPropertyFilter(organizationId)

  applyCategoryFilter(filter, options.category)

  if (options.search) {
    const pattern = new RegExp(options.search, 'i')
    filter.$and = [
      ...((filter.$and as Record<string, unknown>[]) ?? []),
      {
        $or: [
          { title: pattern },
          { description: pattern },
          { city: pattern },
          { locality: pattern },
          { sector: pattern },
          { address: pattern },
          { builderName: pattern },
          { landmark: pattern },
          { pincode: pattern },
          { projectName: pattern },
        ],
      },
    ]
  }

  if (options.city) filter.city = new RegExp(options.city, 'i')
  if (options.locality) filter.locality = new RegExp(options.locality, 'i')
  if (options.sector) filter.sector = new RegExp(options.sector, 'i')
  if (options.pincode) filter.pincode = new RegExp(options.pincode, 'i')
  if (options.landmark) filter.landmark = new RegExp(options.landmark, 'i')
  if (options.builder) filter.builderName = new RegExp(options.builder, 'i')
  if (options.listingType) filter.listingType = options.listingType.toUpperCase()
  if (options.projectStatus) filter.projectStatus = options.projectStatus.toUpperCase()

  if (options.labels) {
    const labelList = options.labels.split(',').map((l) => l.trim().toUpperCase()).filter(Boolean)
    if (labelList.length) filter.labels = { $in: labelList }
  }

  if (options.minPrice || options.maxPrice) {
    const price: Record<string, number> = {}
    if (options.minPrice) price.$gte = Number(options.minPrice)
    if (options.maxPrice) price.$lte = Number(options.maxPrice)
    filter.price = price
  }

  if (options.minArea || options.maxArea) {
    const area: Record<string, number> = {}
    if (options.minArea) area.$gte = Number(options.minArea)
    if (options.maxArea) area.$lte = Number(options.maxArea)
    filter.area = area
  }

  if (options.bedrooms) filter.bedrooms = Number(options.bedrooms)
  if (options.bhk) applyBhkFilter(filter, options.bhk)
  if (options.type) applyTypeFilter(filter, options.type)
  if (options.amenities) applyListFilter(filter, 'amenities', options.amenities, false)
  if (options.propertyAge) applyListFilter(filter, 'propertyAge', options.propertyAge)
  if (options.furnishing) applyListFilter(filter, 'furnishing', options.furnishing)
  if (options.facing) applyListFilter(filter, 'facing', options.facing)
  if (options.possessionStatus) applyListFilter(filter, 'possessionStatus', options.possessionStatus)
  if (options.status) filter.status = options.status.toUpperCase()
  if (options.reraOnly) filter.hasRera = true
  if (options.readyToMove) filter.possessionStatus = 'READY_TO_MOVE'
  if (options.underConstruction) filter.possessionStatus = 'UNDER_CONSTRUCTION'
  if (options.possessionYear) {
    filter.possessionDate = new RegExp(options.possessionYear, 'i')
  }
  if (options.featured) {
    filter.labels = { $in: ['FEATURED'] }
  }

  const sortField = options.sortBy || 'createdAt'
  const sortDirection = options.sortOrder === 'asc' ? 1 : -1

  const [properties, total] = await Promise.all([
    Property.find(filter)
      .sort({ [sortField]: sortDirection })
      .skip((options.page - 1) * options.limit)
      .limit(options.limit),
    Property.countDocuments(filter),
  ])

  return { properties, total }
}

export async function getPublicPropertyById(organizationId: number, propertyId: number) {
  const property = await Property.findOne({
    _id: propertyId,
    ...publicPropertyFilter(organizationId),
  })

  if (!property) {
    throw new NotFoundError('Property not found')
  }

  return property
}

export async function listPublicBuilders(organizationId: number) {
  const builders = await Property.aggregate([
    { $match: { ...publicPropertyFilter(organizationId), builderName: { $nin: [null, ''] } } },
    { $group: { _id: '$builderName', count: { $sum: 1 } } },
    { $project: { _id: 0, name: '$_id', count: 1 } },
    { $sort: { name: 1 } },
  ])

  return builders as { name: string; count: number }[]
}

export async function getPublicStats(organizationId: number) {
  const totalProperties = await Property.countDocuments(publicPropertyFilter(organizationId))
  return { totalProperties }
}

async function resolveWebsiteLeadSourceId(organizationId: number) {
  const source =
    (await LeadSource.findOne({ organizationId, type: 'WEBSITE' })) ??
    (await LeadSource.findOne({ organizationId, name: 'Website' }))

  if (!source) {
    throw new NotFoundError('Website lead source is not configured')
  }

  return source._id
}

async function resolvePublicLeadCreatorId(organizationId: number) {
  const adminRole = await Role.findOne({ organizationId, name: 'admin' })
  if (!adminRole) {
    throw new NotFoundError('Admin role is not configured')
  }

  const user = await User.findOne({
    organizationId,
    roleId: adminRole._id,
    isActive: true,
  }).sort({ _id: 1 })

  if (!user) {
    throw new NotFoundError('No active admin user found for public inquiries')
  }

  return user._id
}

export async function submitPublicInquiry(
  organizationId: number,
  payload: {
  firstName: string
  lastName: string
  email?: string
  phone: string
  city?: string
  message?: string
  budget?: number
  propertyId?: string
}) {
  const [sourceId, createdById] = await Promise.all([
    resolveWebsiteLeadSourceId(organizationId),
    resolvePublicLeadCreatorId(organizationId),
  ])

  const parsedPropertyId = payload.propertyId ? Number(payload.propertyId) : null
  if (payload.propertyId && (!Number.isInteger(parsedPropertyId) || parsedPropertyId! <= 0)) {
    throw new NotFoundError('Property not found')
  }

  if (parsedPropertyId) {
    await getPublicPropertyById(organizationId, parsedPropertyId)
  }

  const lead = await createLead(organizationId, createdById, {
    firstName: payload.firstName,
    lastName: payload.lastName,
    email: payload.email || null,
    phone: payload.phone,
    city: payload.city ?? null,
    requirements: payload.message ?? null,
    budget: payload.budget ?? null,
    sourceId,
    propertyId: parsedPropertyId,
    status: 'NEW',
  })

  return {
    id: String(lead.id),
    message: 'Your inquiry has been received. Our team will contact you shortly.',
  }
}
