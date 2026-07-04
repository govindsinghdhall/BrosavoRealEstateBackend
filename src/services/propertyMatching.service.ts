import type { ILead } from '../models/Lead'
import type { IProperty } from '../models/Property'

export interface PropertyMatchResult {
  score: number
  reasons: string[]
}

const TYPE_ALIASES: Record<string, string[]> = {
  APARTMENT: ['FLAT', 'APARTMENT', 'CONDO'],
  BUILDER_FLOOR: ['BUILDER FLOOR', 'BUILDER_FLOOR', 'FLOOR'],
  VILLA: ['VILLA', 'INDEPENDENT HOUSE', 'HOUSE'],
  PLOT: ['PLOT', 'LAND'],
  COMMERCIAL: ['COMMERCIAL', 'OFFICE', 'SHOP', 'RETAIL'],
  OFFICE: ['OFFICE', 'COMMERCIAL'],
  SHOP: ['SHOP', 'RETAIL', 'COMMERCIAL'],
}

function normalizeText(value: string | null | undefined) {
  return (value ?? '').trim().toLowerCase()
}

function parseBedroomsFromRequirements(requirements: string | null | undefined) {
  if (!requirements) return null
  const match = requirements.match(/(\d+)\s*bhk/i)
  return match ? Number(match[1]) : null
}

export function scorePropertyForLead(lead: ILead, property: IProperty): PropertyMatchResult {
  let score = 0
  const reasons: string[] = []
  const requirements = normalizeText(lead.requirements)
  const leadCity = normalizeText(lead.city)
  const leadLocation = normalizeText(lead.city || lead.address)

  if (lead.budget && lead.budget > 0) {
    const budget = lead.budget
    const price = property.price
    if (price <= budget) {
      score += 40
      reasons.push('Within budget')
    } else if (price <= budget * 1.15) {
      score += 30
      reasons.push('Slightly above budget (within 15%)')
    } else if (price <= budget * 1.3) {
      score += 15
      reasons.push('Above budget but negotiable range')
    }
  } else {
    score += 10
  }

  const propertyType = property.type.toUpperCase()
  const aliases = TYPE_ALIASES[propertyType] ?? [propertyType]
  const typeMatched = aliases.some((alias) => requirements.includes(alias.toLowerCase().replace(/_/g, ' ')))
    || requirements.includes(propertyType.toLowerCase().replace(/_/g, ' '))

  if (typeMatched) {
    score += 25
    reasons.push('Property type matches buyer requirements')
  } else if (requirements) {
    score += 5
  } else {
    score += 10
  }

  const desiredBhk = parseBedroomsFromRequirements(lead.requirements)
  if (desiredBhk != null && property.bedrooms != null) {
    if (property.bedrooms === desiredBhk) {
      score += 15
      reasons.push(`${desiredBhk} BHK matches`)
    } else if (Math.abs(property.bedrooms - desiredBhk) === 1) {
      score += 8
      reasons.push('Close BHK match')
    }
  }

  if (leadCity && normalizeText(property.city).includes(leadCity)) {
    score += 12
    reasons.push('City matches preferred location')
  }

  const locality = normalizeText(property.locality)
  const sector = normalizeText(property.sector)
  if (locality && leadLocation.includes(locality)) {
    score += 8
    reasons.push('Locality matches buyer preference')
  } else if (sector && leadLocation.includes(sector)) {
    score += 6
    reasons.push('Sector matches buyer preference')
  }

  if (property.status === 'AVAILABLE') {
    score += 10
    reasons.push('Available now')
  } else if (property.status === 'UNDER_OFFER') {
    score += 4
  }

  if (property.isActive) {
    score += 3
  }

  return {
    score: Math.min(100, score),
    reasons,
  }
}

export function rankPropertiesForLead(lead: ILead, properties: IProperty[]) {
  return properties
    .map((property) => {
      const match = scorePropertyForLead(lead, property)
      return { property, ...match }
    })
    .sort((a, b) => b.score - a.score)
}
