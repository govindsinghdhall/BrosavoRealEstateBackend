import type { ILeadProperty } from '../models/LeadProperty'
import { LeadProperty } from '../models/LeadProperty'
import { Lead } from '../models/Lead'
import { Property } from '../models/Property'
import { AppError, NotFoundError } from '../utils/errors'
import { activeOrgFilter } from '../utils/pagination'
import { rankPropertiesForLead } from './propertyMatching.service'
import { serializeProperty } from './property.service'
import { addLeadTimelineEntry } from './lead.service'

async function propertySummary(propertyId: number) {
  const property = await Property.findOne({ _id: propertyId, deletedAt: null }).lean()
  if (!property) return undefined
  return {
    id: property._id,
    title: property.title,
    type: property.type,
    status: property.status,
    price: property.price,
    city: property.city,
    locality: property.locality,
    bedrooms: property.bedrooms,
  }
}

export async function serializeLeadProperty(link: ILeadProperty) {
  const property = await propertySummary(link.propertyId)
  return {
    id: link._id,
    leadId: link.leadId,
    propertyId: link.propertyId,
    isPrimary: link.isPrimary,
    interestLevel: link.interestLevel,
    matchScore: link.matchScore,
    notes: link.notes,
    property,
    createdAt: link.createdAt.toISOString(),
    updatedAt: link.updatedAt.toISOString(),
  }
}

async function ensureLead(leadId: number, organizationId: number) {
  const lead = await Lead.findOne({ _id: leadId, ...activeOrgFilter(organizationId) })
  if (!lead) throw new NotFoundError('Lead not found')
  return lead
}

async function ensureProperty(propertyId: number, organizationId: number) {
  const property = await Property.findOne({ _id: propertyId, ...activeOrgFilter(organizationId) })
  if (!property) throw new NotFoundError('Property not found')
  return property
}

async function setPrimaryProperty(
  leadId: number,
  organizationId: number,
  propertyId: number | null,
) {
  await LeadProperty.updateMany(
    { leadId, organizationId, deletedAt: null },
    { $set: { isPrimary: false } },
  )

  if (propertyId) {
    await LeadProperty.findOneAndUpdate(
      { leadId, propertyId, organizationId, deletedAt: null },
      { $set: { isPrimary: true } },
    )
  }

  await Lead.findOneAndUpdate(
    { _id: leadId, organizationId },
    { $set: { propertyId } },
  )
}

export async function listLinkedProperties(leadId: number, organizationId: number) {
  await ensureLead(leadId, organizationId)

  const links = await LeadProperty.find({
    leadId,
    organizationId,
    deletedAt: null,
  }).sort({ isPrimary: -1, matchScore: -1, createdAt: -1 })

  return Promise.all(links.map((link) => serializeLeadProperty(link)))
}

export async function getPropertySuggestions(leadId: number, organizationId: number, limit = 10) {
  const lead = await ensureLead(leadId, organizationId)

  const [properties, linkedIds] = await Promise.all([
    Property.find({
      organizationId,
      deletedAt: null,
      status: { $in: ['AVAILABLE', 'UNDER_OFFER'] },
    }).lean(),
    LeadProperty.find({ leadId, organizationId, deletedAt: null }).distinct('propertyId'),
  ])

  const linkedSet = new Set(linkedIds)
  const available = properties.filter((property) => !linkedSet.has(property._id))

  return rankPropertiesForLead(lead, available as never)
    .slice(0, limit)
    .map(({ property, score, reasons }) => ({
      property: serializeProperty(property as never),
      matchScore: score,
      matchReasons: reasons,
    }))
}

export async function linkPropertyToLead(input: {
  leadId: number
  organizationId: number
  propertyId: number
  linkedById: number
  isPrimary?: boolean
  interestLevel?: string
  notes?: string
  matchScore?: number | null
}) {
  const lead = await ensureLead(input.leadId, input.organizationId)
  const property = await ensureProperty(input.propertyId, input.organizationId)

  const existing = await LeadProperty.findOne({
    leadId: input.leadId,
    propertyId: input.propertyId,
    organizationId: input.organizationId,
    deletedAt: null,
  })

  if (existing) {
    throw new AppError('Property is already linked to this lead', 409)
  }

  const { score } = rankPropertiesForLead(lead, [property])[0]

  const link = await LeadProperty.create({
    organizationId: input.organizationId,
    leadId: input.leadId,
    propertyId: input.propertyId,
    linkedById: input.linkedById,
    isPrimary: input.isPrimary ?? false,
    interestLevel: (input.interestLevel ?? 'INTERESTED').toUpperCase(),
    notes: input.notes ?? null,
    matchScore: input.matchScore ?? score,
  })

  if (input.isPrimary) {
    await setPrimaryProperty(input.leadId, input.organizationId, input.propertyId)
  }

  await addLeadTimelineEntry({
    organizationId: input.organizationId,
    leadId: input.leadId,
    action: 'PROPERTY_LINKED',
    description: `Linked property "${property.title}"`,
    performedById: input.linkedById,
    metadata: { propertyId: input.propertyId, matchScore: link.matchScore },
  })

  return serializeLeadProperty(link)
}

export async function updateLinkedProperty(
  leadId: number,
  propertyId: number,
  organizationId: number,
  performedById: number,
  updates: {
    isPrimary?: boolean
    interestLevel?: string
    notes?: string | null
  },
) {
  await ensureLead(leadId, organizationId)
  await ensureProperty(propertyId, organizationId)

  const link = await LeadProperty.findOne({
    leadId,
    propertyId,
    organizationId,
    deletedAt: null,
  })

  if (!link) throw new NotFoundError('Linked property not found')

  if (updates.interestLevel) link.interestLevel = updates.interestLevel.toUpperCase() as never
  if (updates.notes !== undefined) link.notes = updates.notes
  if (updates.isPrimary !== undefined) link.isPrimary = updates.isPrimary

  await link.save()

  if (updates.isPrimary) {
    await setPrimaryProperty(leadId, organizationId, propertyId)
  } else if (updates.isPrimary === false) {
    const lead = await Lead.findById(leadId)
    if (lead?.propertyId === propertyId) {
      await setPrimaryProperty(leadId, organizationId, null)
    }
  }

  if (updates.interestLevel || updates.isPrimary) {
    await addLeadTimelineEntry({
      organizationId,
      leadId,
      action: 'PROPERTY_LINK_UPDATED',
      description: 'Updated linked property interest',
      performedById,
      metadata: { propertyId, ...updates },
    })
  }

  return serializeLeadProperty(link)
}

export async function unlinkPropertyFromLead(
  leadId: number,
  propertyId: number,
  organizationId: number,
  performedById: number,
) {
  const lead = await ensureLead(leadId, organizationId)
  const property = await ensureProperty(propertyId, organizationId)

  const link = await LeadProperty.findOneAndUpdate(
    { leadId, propertyId, organizationId, deletedAt: null },
    { $set: { deletedAt: new Date(), isPrimary: false } },
    { new: true },
  )

  if (!link) throw new NotFoundError('Linked property not found')

  if (lead.propertyId === propertyId) {
    const nextPrimary = await LeadProperty.findOne({
      leadId,
      organizationId,
      deletedAt: null,
      interestLevel: { $ne: 'REJECTED' },
    }).sort({ isPrimary: -1, matchScore: -1, createdAt: -1 })

    await setPrimaryProperty(leadId, organizationId, nextPrimary?.propertyId ?? null)
  }

  await addLeadTimelineEntry({
    organizationId,
    leadId,
    action: 'PROPERTY_UNLINKED',
    description: `Removed property "${property.title}" from lead`,
    performedById,
    metadata: { propertyId },
  })
}

export async function listPropertiesWithOwners(
  organizationId: number,
  options: {
    page: number
    limit: number
    search?: string
  },
) {
  const filter: Record<string, unknown> = {
    organizationId,
    deletedAt: null,
  }

  if (options.search) {
    const pattern = new RegExp(options.search, 'i')
    filter.$or = [
      { title: pattern },
      { ownerName: pattern },
      { ownerPhone: pattern },
      { ownerEmail: pattern },
      { locality: pattern },
      { city: pattern },
    ]
  }

  const [properties, total] = await Promise.all([
    Property.find(filter)
      .sort({ updatedAt: -1 })
      .skip((options.page - 1) * options.limit)
      .limit(options.limit),
    Property.countDocuments(filter),
  ])

  return {
    properties: properties.map((property) => ({
      ...serializeProperty(property),
      ownerName: property.ownerName,
      ownerPhone: property.ownerPhone,
      ownerEmail: property.ownerEmail,
      ownerAddress: property.ownerAddress,
      ownerNotes: property.ownerNotes,
    })),
    total,
  }
}
