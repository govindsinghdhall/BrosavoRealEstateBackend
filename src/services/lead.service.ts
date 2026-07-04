import type { ILead } from '../models/Lead'
import { Lead } from '../models/Lead'
import { LeadNote } from '../models/LeadNote'
import { LeadSource } from '../models/LeadSource'
import { LeadTimeline } from '../models/LeadTimeline'
import { Property } from '../models/Property'
import { User } from '../models/User'
import { Booking } from '../models/Booking'
import { SiteVisit } from '../models/SiteVisit'
import { LeadProperty } from '../models/LeadProperty'
import { NotFoundError } from '../utils/errors'
import { activeOrgFilter } from '../utils/pagination'

async function userSnippet(userId: number | null | undefined) {
  if (!userId) return undefined
  const user = await User.findById(userId).lean()
  if (!user) return undefined
  return {
    id: user._id,
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
  }
}

async function sourceSnippet(sourceId: number) {
  const source = await LeadSource.findById(sourceId).lean()
  if (!source) return undefined
  return { id: source._id, name: source.name, type: source.type }
}

async function propertySnippet(propertyId: number | null | undefined) {
  if (!propertyId) return undefined
  const property = await Property.findOne({ _id: propertyId, deletedAt: null }).lean()
  if (!property) return undefined
  return { id: property._id, title: property.title, city: property.city, type: property.type }
}

export async function serializeLead(lead: ILead, options?: { detail?: boolean }) {
  const [source, assignedTo, property, createdBy] = await Promise.all([
    sourceSnippet(lead.sourceId),
    userSnippet(lead.assignedToId),
    propertySnippet(lead.propertyId),
    userSnippet(lead.createdById),
  ])

  const base = {
    id: lead._id,
    contactId: lead.contactId,
    firstName: lead.firstName,
    lastName: lead.lastName,
    email: lead.email,
    phone: lead.phone,
    alternatePhone: lead.alternatePhone,
    status: lead.status,
    priority: lead.priority,
    budget: lead.budget,
    requirements: lead.requirements,
    address: lead.address,
    city: lead.city,
    state: lead.state,
    pincode: lead.pincode,
    sourceId: lead.sourceId,
    assignedToId: lead.assignedToId,
    source,
    assignedTo,
    property,
    createdBy,
    createdAt: lead.createdAt.toISOString(),
    updatedAt: lead.updatedAt.toISOString(),
  }

  if (!options?.detail) return base

  const [notes, timeline, notesCount, siteVisitsCount, bookingsCount, linkedProperties] =
    await Promise.all([
    LeadNote.find({ leadId: lead._id }).sort({ createdAt: -1 }).lean(),
    LeadTimeline.find({ leadId: lead._id }).sort({ createdAt: -1 }).lean(),
    LeadNote.countDocuments({ leadId: lead._id }),
    SiteVisit.countDocuments({ leadId: lead._id, deletedAt: null }),
    Booking.countDocuments({ leadId: lead._id, deletedAt: null }),
    LeadProperty.find({ leadId: lead._id, organizationId: lead.organizationId, deletedAt: null })
      .sort({ isPrimary: -1, matchScore: -1, createdAt: -1 })
      .lean(),
  ])

  const noteUsers = await User.find({
    _id: { $in: notes.map((note) => note.createdById) },
  }).lean()
  const noteUserMap = Object.fromEntries(noteUsers.map((user) => [user._id, user]))

  const timelineUsers = await User.find({
    _id: { $in: timeline.map((entry) => entry.performedById).filter(Boolean) as number[] },
  }).lean()
  const timelineUserMap = Object.fromEntries(timelineUsers.map((user) => [user._id, user]))

  const linkedPropertyIds = linkedProperties.map((entry) => entry.propertyId)
  const linkedPropertyDocs = linkedPropertyIds.length
    ? await Property.find({ _id: { $in: linkedPropertyIds }, deletedAt: null }).lean()
    : []
  const linkedPropertyMap = Object.fromEntries(linkedPropertyDocs.map((item) => [item._id, item]))

  return {
    ...base,
    notes: notes.map((note) => ({
      id: note._id,
      content: note.content,
      createdAt: note.createdAt.toISOString(),
      updatedAt: note.updatedAt.toISOString(),
      createdBy: noteUserMap[note.createdById]
        ? {
            id: noteUserMap[note.createdById]._id,
            firstName: noteUserMap[note.createdById].firstName,
            lastName: noteUserMap[note.createdById].lastName,
          }
        : undefined,
    })),
    timeline: timeline.map((entry) => ({
      id: entry._id,
      action: entry.action,
      description: entry.description,
      metadata: entry.metadata,
      createdAt: entry.createdAt.toISOString(),
      performedBy: entry.performedById && timelineUserMap[entry.performedById]
        ? {
            id: timelineUserMap[entry.performedById]._id,
            firstName: timelineUserMap[entry.performedById].firstName,
            lastName: timelineUserMap[entry.performedById].lastName,
          }
        : undefined,
    })),
    linkedProperties: linkedProperties.map((entry) => ({
      id: entry._id,
      propertyId: entry.propertyId,
      isPrimary: entry.isPrimary,
      interestLevel: entry.interestLevel,
      matchScore: entry.matchScore,
      notes: entry.notes,
      property: linkedPropertyMap[entry.propertyId]
        ? {
            id: linkedPropertyMap[entry.propertyId]._id,
            title: linkedPropertyMap[entry.propertyId].title,
            type: linkedPropertyMap[entry.propertyId].type,
            status: linkedPropertyMap[entry.propertyId].status,
            price: linkedPropertyMap[entry.propertyId].price,
            city: linkedPropertyMap[entry.propertyId].city,
            locality: linkedPropertyMap[entry.propertyId].locality,
            bedrooms: linkedPropertyMap[entry.propertyId].bedrooms,
          }
        : undefined,
      createdAt: entry.createdAt.toISOString(),
    })),
    _count: {
      notes: notesCount,
      siteVisits: siteVisitsCount,
      bookings: bookingsCount,
    },
  }
}

export async function addLeadTimelineEntry(input: {
  organizationId: number
  leadId: number
  action: string
  description?: string
  performedById?: number
  metadata?: unknown
}) {
  return LeadTimeline.create({
    organizationId: input.organizationId,
    leadId: input.leadId,
    action: input.action,
    description: input.description ?? null,
    performedById: input.performedById ?? null,
    metadata: input.metadata ?? null,
  })
}

export async function listLeads(
  organizationId: number,
  options: {
    page: number
    limit: number
    search?: string
    status?: string
    sortBy?: string
    sortOrder?: 'asc' | 'desc'
  },
) {
  const filter: Record<string, unknown> = activeOrgFilter(organizationId)
  if (options.status) filter.status = options.status.toUpperCase()

  if (options.search) {
    const pattern = new RegExp(options.search, 'i')
    filter.$or = [
      { firstName: pattern },
      { lastName: pattern },
      { email: pattern },
      { phone: pattern },
      { city: pattern },
    ]
  }

  const sortField = options.sortBy || 'createdAt'
  const sortDirection = options.sortOrder === 'asc' ? 1 : -1

  const [leads, total] = await Promise.all([
    Lead.find(filter)
      .sort({ [sortField]: sortDirection })
      .skip((options.page - 1) * options.limit)
      .limit(options.limit),
    Lead.countDocuments(filter),
  ])

  const data = await Promise.all(leads.map((lead) => serializeLead(lead)))
  return { leads: data, total }
}

export async function getLeadById(leadId: number, organizationId: number) {
  const lead = await Lead.findOne({ _id: leadId, ...activeOrgFilter(organizationId) })
  if (!lead) throw new NotFoundError('Lead not found')
  return serializeLead(lead, { detail: true })
}

export async function createLead(
  organizationId: number,
  createdById: number,
  payload: Record<string, unknown>,
) {
  const lead = await Lead.create({
    organizationId,
    createdById,
    status: 'NEW',
    ...payload,
  })

  await addLeadTimelineEntry({
    organizationId,
    leadId: lead._id,
    action: 'CREATED',
    description: 'Lead created',
    performedById: createdById,
  })

  return serializeLead(lead)
}

export async function updateLead(
  leadId: number,
  organizationId: number,
  performedById: number,
  updates: Record<string, unknown>,
) {
  const existing = await Lead.findOne({ _id: leadId, ...activeOrgFilter(organizationId) })
  if (!existing) throw new NotFoundError('Lead not found')

  const previousStatus = existing.status
  Object.assign(existing, updates)
  await existing.save()

  if (updates.status && updates.status !== previousStatus) {
    await addLeadTimelineEntry({
      organizationId,
      leadId: leadId,
      action: 'STATUS_CHANGED',
      description: `Status changed from ${previousStatus} to ${updates.status}`,
      performedById,
      metadata: { from: previousStatus, to: updates.status },
    })
  }

  if (updates.propertyId !== undefined && updates.propertyId !== existing.propertyId) {
    await addLeadTimelineEntry({
      organizationId,
      leadId,
      action: 'PROPERTY_INTEREST_UPDATED',
      description: updates.propertyId
        ? 'Primary property interest updated'
        : 'Primary property interest cleared',
      performedById,
      metadata: { propertyId: updates.propertyId },
    })
  }

  return serializeLead(existing)
}

export async function deleteLead(leadId: number, organizationId: number) {
  const lead = await Lead.findOneAndUpdate(
    { _id: leadId, ...activeOrgFilter(organizationId) },
    { $set: { deletedAt: new Date() } },
    { new: true },
  )
  if (!lead) throw new NotFoundError('Lead not found')
}

export async function getLeadTimeline(leadId: number, organizationId: number) {
  const lead = await Lead.findOne({ _id: leadId, ...activeOrgFilter(organizationId) })
  if (!lead) throw new NotFoundError('Lead not found')

  const timeline = await LeadTimeline.find({ leadId }).sort({ createdAt: -1 }).lean()
  const users = await User.find({
    _id: { $in: timeline.map((entry) => entry.performedById).filter(Boolean) as number[] },
  }).lean()
  const userMap = Object.fromEntries(users.map((user) => [user._id, user]))

  return timeline.map((entry) => ({
    id: entry._id,
    action: entry.action,
    description: entry.description,
    metadata: entry.metadata,
    createdAt: entry.createdAt.toISOString(),
    performedBy: entry.performedById && userMap[entry.performedById]
      ? {
          id: userMap[entry.performedById]._id,
          firstName: userMap[entry.performedById].firstName,
          lastName: userMap[entry.performedById].lastName,
        }
      : undefined,
  }))
}

export async function addLeadNote(
  leadId: number,
  organizationId: number,
  createdById: number,
  content: string,
) {
  const lead = await Lead.findOne({ _id: leadId, ...activeOrgFilter(organizationId) })
  if (!lead) throw new NotFoundError('Lead not found')

  const note = await LeadNote.create({
    organizationId,
    leadId,
    content,
    createdById,
  })

  await addLeadTimelineEntry({
    organizationId,
    leadId,
    action: 'NOTE_ADDED',
    description: 'Note added',
    performedById: createdById,
  })

  const user = await User.findById(createdById).lean()
  return {
    id: note._id,
    content: note.content,
    createdAt: note.createdAt.toISOString(),
    updatedAt: note.updatedAt.toISOString(),
    createdBy: user
      ? { id: user._id, firstName: user.firstName, lastName: user.lastName }
      : undefined,
  }
}
