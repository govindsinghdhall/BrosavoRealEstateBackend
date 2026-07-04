import type { IProperty } from '../models/Property'
import { Property } from '../models/Property'
import { NotFoundError } from '../utils/errors'

function activeFilter(organizationId: number) {
  return { organizationId, deletedAt: null }
}

export function serializeProperty(property: IProperty) {
  return {
    id: property._id,
    title: property.title,
    description: property.description,
    listingCategory: property.listingCategory,
    type: property.type,
    status: property.status,
    price: property.price,
    area: property.area,
    carpetArea: property.carpetArea,
    builtUpArea: property.builtUpArea,
    superArea: property.superArea,
    bedrooms: property.bedrooms,
    bathrooms: property.bathrooms,
    address: property.address,
    city: property.city,
    state: property.state,
    pincode: property.pincode,
    locality: property.locality,
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
    isVerified: property.isVerified,
    hasRera: property.hasRera,
    reraId: property.reraId,
    videoTourUrl: property.videoTourUrl,
    virtualTourUrl: property.virtualTourUrl,
    brochureUrl: property.brochureUrl,
    amenities: property.amenities,
    isActive: property.isActive,
    ownerName: property.ownerName,
    ownerPhone: property.ownerPhone,
    ownerEmail: property.ownerEmail,
    ownerAddress: property.ownerAddress,
    ownerNotes: property.ownerNotes,
    createdAt: property.createdAt.toISOString(),
    updatedAt: property.updatedAt.toISOString(),
  }
}

async function groupInventory(
  organizationId: number,
  field: 'status' | 'type' | 'city',
): Promise<{ [key: string]: string | number; _count: number }[]> {
  const key = field
  return Property.aggregate([
    { $match: activeFilter(organizationId) },
    { $group: { _id: `$${field}`, count: { $sum: 1 } } },
    { $project: { _id: 0, [key]: '$_id', _count: '$count' } },
    { $sort: { [key]: 1 } },
  ])
}

export async function getInventory(organizationId: number) {
  const [byStatus, byType, byCity] = await Promise.all([
    groupInventory(organizationId, 'status'),
    groupInventory(organizationId, 'type'),
    groupInventory(organizationId, 'city'),
  ])

  return { byStatus, byType, byCity }
}

export async function listProperties(
  organizationId: number,
  options: {
    page: number
    limit: number
    search?: string
    status?: string
    type?: string
    city?: string
    sortBy?: string
    sortOrder?: 'asc' | 'desc'
  },
) {
  const filter: Record<string, unknown> = activeFilter(organizationId)

  if (options.status) filter.status = options.status.toUpperCase()
  if (options.type) filter.type = options.type.toUpperCase()
  if (options.city) filter.city = new RegExp(options.city, 'i')

  if (options.search) {
    const pattern = new RegExp(options.search, 'i')
    filter.$or = [{ title: pattern }, { city: pattern }, { locality: pattern }, { address: pattern }]
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

export async function getPropertyById(propertyId: number, organizationId: number) {
  const property = await Property.findOne({ _id: propertyId, ...activeFilter(organizationId) })
  if (!property) {
    throw new NotFoundError('Property not found')
  }
  return property
}

export async function createProperty(
  organizationId: number,
  payload: Record<string, unknown>,
) {
  return Property.create({
    organizationId,
    ...payload,
  })
}

export async function updateProperty(
  propertyId: number,
  organizationId: number,
  updates: Record<string, unknown>,
) {
  const property = await Property.findOneAndUpdate(
    { _id: propertyId, ...activeFilter(organizationId) },
    { $set: updates },
    { new: true, runValidators: true },
  )

  if (!property) {
    throw new NotFoundError('Property not found')
  }

  return property
}

export async function deleteProperty(propertyId: number, organizationId: number) {
  const property = await Property.findOneAndUpdate(
    { _id: propertyId, ...activeFilter(organizationId) },
    { $set: { deletedAt: new Date(), isActive: false } },
    { new: true },
  )

  if (!property) {
    throw new NotFoundError('Property not found')
  }
}
