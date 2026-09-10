import { AppError } from '../utils/errors'
import {
  isValidPropertyLabel,
  LISTING_TYPES,
  PRICE_TYPES,
  PROJECT_STATUSES,
  type PropertyLabel,
} from '../constants/propertyLabels'

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120)
}

export function buildPropertySlug(payload: {
  listingType?: string
  title?: string
  projectName?: string | null
  locality?: string
  sector?: string | null
  city?: string
}): string | null {
  const base =
    payload.listingType === 'PROJECT'
      ? payload.projectName || payload.title
      : payload.title

  if (!base) return null

  const parts = [base, payload.sector, payload.locality, payload.city].filter(Boolean)
  const slug = slugify(parts.join(' '))
  return slug || null
}

export function normalizePropertyLabels(labels?: string[]): PropertyLabel[] {
  if (!labels?.length) return []
  const normalized: PropertyLabel[] = []
  for (const label of labels) {
    const upper = label.toUpperCase().trim()
    if (!isValidPropertyLabel(upper)) {
      throw new AppError(`Unknown label: ${label}`, 400)
    }
    if (!normalized.includes(upper)) {
      normalized.push(upper)
    }
  }
  return normalized
}

export function validatePropertyPayload(
  payload: Record<string, unknown>,
  isPartial = false,
): Record<string, unknown> {
  const listingType = String(payload.listingType ?? 'INDIVIDUAL').toUpperCase()
  if (!LISTING_TYPES.includes(listingType as (typeof LISTING_TYPES)[number])) {
    throw new AppError('Invalid listing type', 400)
  }

  if (payload.priceType) {
    const priceType = String(payload.priceType).toUpperCase()
    if (!PRICE_TYPES.includes(priceType as (typeof PRICE_TYPES)[number])) {
      throw new AppError('Invalid price type', 400)
    }
    payload.priceType = priceType
  }

  if (payload.labels) {
    payload.labels = normalizePropertyLabels(payload.labels as string[])
  }

  if (listingType === 'PROJECT') {
    if (!isPartial || payload.projectName !== undefined) {
      const projectName = String(payload.projectName ?? '').trim()
      if (!projectName) {
        throw new AppError('Project name is required for projects', 400)
      }
      payload.projectName = projectName
    }

    if (!isPartial || payload.projectStatus !== undefined) {
      const projectStatus = String(payload.projectStatus ?? '').toUpperCase()
      if (!projectStatus) {
        throw new AppError('Project status is required for projects', 400)
      }
      if (!PROJECT_STATUSES.includes(projectStatus as (typeof PROJECT_STATUSES)[number])) {
        throw new AppError('Invalid project status', 400)
      }
      payload.projectStatus = projectStatus
    }
  }

  if (payload.hasRera && !String(payload.reraId ?? '').trim()) {
    throw new AppError('RERA number is required when RERA registered', 400)
  }

  const labels = (payload.labels as PropertyLabel[] | undefined) ?? []

  if (labels.includes('DISCOUNTED')) {
    const original = Number(payload.originalPrice)
    const discounted = Number(payload.discountedPrice)
    if (!original || !discounted) {
      throw new AppError('Original and discounted prices are required for discounted listings', 400)
    }
    if (discounted >= original) {
      throw new AppError('Discounted price must be lower than original price', 400)
    }
  }

  if (labels.includes('PRICE_REDUCED')) {
    const previous = Number(payload.previousPrice)
    const current = Number(payload.price)
    if (!previous || !current) {
      throw new AppError('Previous and current prices are required for price-reduced listings', 400)
    }
    if (current >= previous) {
      throw new AppError('Current price must be lower than previous price', 400)
    }
  }

  if (labels.includes('SPECIAL_OFFER')) {
    const offer = payload.offer as Record<string, unknown> | null | undefined
    if (!offer?.title || !String(offer.title).trim()) {
      throw new AppError('Offer title is required for special offer listings', 400)
    }
    if (!offer.validFrom || !offer.validUntil) {
      throw new AppError('Offer validity dates are required for special offer listings', 400)
    }
  }

  if (listingType === 'INDIVIDUAL' && !isPartial) {
    if (!payload.bedrooms && payload.bedrooms !== 0) {
      throw new AppError('BHK is required for individual properties', 400)
    }
    if (!payload.bathrooms) {
      throw new AppError('Bathrooms are required for individual properties', 400)
    }
    if (!payload.area) {
      throw new AppError('Area is required for individual properties', 400)
    }
  }

  if (listingType === 'PROJECT' && Array.isArray(payload.configurations) && payload.configurations.length) {
    const configs = payload.configurations as Array<Record<string, unknown>>
    if (!payload.area && configs[0]) {
      const first = configs[0]
      payload.area = Number(first.areaMax ?? first.areaMin ?? 0)
      payload.bedrooms = Number(first.bedrooms ?? 0)
      payload.bathrooms = Number(first.bathrooms ?? 1)
      payload.superArea = payload.area
    }
  }

  if (!payload.area && listingType === 'PROJECT') {
    payload.area = 1
  }

  if (!payload.slug) {
    payload.slug = buildPropertySlug({
      listingType,
      title: String(payload.title ?? ''),
      projectName: payload.projectName as string | null,
      locality: String(payload.locality ?? ''),
      sector: payload.sector as string | null,
      city: String(payload.city ?? ''),
    })
  }

  payload.listingType = listingType
  return payload
}

export function computeDiscountPercent(original: number, discounted: number): number {
  if (!original || original <= 0) return 0
  return Math.round(((original - discounted) / original) * 100)
}

export function computeReductionPercent(previous: number, current: number): number {
  if (!previous || previous <= 0) return 0
  return Math.round(((previous - current) / previous) * 100)
}

export function isOfferActive(offer: { validFrom: string; validUntil: string } | null | undefined): boolean {
  if (!offer?.validFrom || !offer?.validUntil) return false
  const now = new Date()
  const from = new Date(offer.validFrom)
  const until = new Date(offer.validUntil)
  return now >= from && now <= until
}

export function getActiveLabels(labels: PropertyLabel[], offer: { validFrom: string; validUntil: string } | null): PropertyLabel[] {
  const active = [...labels]
  if (labels.includes('SPECIAL_OFFER') && !isOfferActive(offer)) {
    return active.filter((l) => l !== 'SPECIAL_OFFER')
  }
  return active
}

export function buildConfigurationSummary(
  configurations: Array<{ bedrooms: number }>,
): string | null {
  if (!configurations.length) return null
  const bhks = [...new Set(configurations.map((c) => c.bedrooms))].sort((a, b) => a - b)
  if (!bhks.length) return null
  const labels = bhks.map((b) => (b === 0 ? 'Studio' : b >= 5 ? '5+ BHK' : `${b} BHK`))
  if (labels.length === 1) return labels[0]
  if (labels.length === 2) return `${labels[0]} & ${labels[1]}`
  return `${labels.slice(0, -1).join(', ')} & ${labels[labels.length - 1]}`
}
