import { Organization } from '../models/Organization'
import { AppError, ForbiddenError, NotFoundError, UnauthorizedError } from '../utils/errors'

export type PublicTenantMode = 'read' | 'inquiry'

export type PublicOrgRef = {
  id: number
  isActive: boolean
}

export function parsePublicOrganizationId(raw: unknown): number | undefined {
  if (raw === undefined || raw === null || raw === '') return undefined
  const value = Array.isArray(raw) ? raw[0] : raw
  const n = Number(value)
  if (!Number.isInteger(n) || n <= 0) {
    throw new AppError('Invalid organizationId', 400)
  }
  return n
}

export function readWebsiteApiKeyHeader(header: unknown): string | undefined {
  if (typeof header === 'string') {
    const trimmed = header.trim()
    return trimmed || undefined
  }
  if (Array.isArray(header) && typeof header[0] === 'string') {
    const trimmed = header[0].trim()
    return trimmed || undefined
  }
  return undefined
}

export function reconcilePublicTenant(input: {
  mode: PublicTenantMode
  hasApiKeyHeader: boolean
  organizationId?: number
  orgFromKey: PublicOrgRef | null
  orgFromId: PublicOrgRef | null
}): number {
  const { mode, hasApiKeyHeader, organizationId, orgFromKey, orgFromId } = input

  if (mode === 'inquiry' && !hasApiKeyHeader) {
    throw new UnauthorizedError('x-website-api-key is required')
  }

  if (!hasApiKeyHeader && organizationId === undefined) {
    throw new AppError('organizationId or x-website-api-key is required', 400)
  }

  if (hasApiKeyHeader && (!orgFromKey || !orgFromKey.isActive)) {
    throw new UnauthorizedError('Invalid website API key')
  }

  if (hasApiKeyHeader && organizationId !== undefined) {
    if (!orgFromId || !orgFromId.isActive || orgFromId.id !== orgFromKey!.id) {
      throw new ForbiddenError('Website API key does not match organizationId')
    }
    return orgFromKey!.id
  }

  if (hasApiKeyHeader && orgFromKey) {
    return orgFromKey.id
  }

  if (!orgFromId || !orgFromId.isActive) {
    throw new NotFoundError('Organization not found')
  }

  return orgFromId.id
}

export async function resolvePublicTenantFromRequest(input: {
  mode: PublicTenantMode
  apiKey?: string
  organizationIdRaw: unknown
}): Promise<number> {
  const organizationId = parsePublicOrganizationId(input.organizationIdRaw)
  const hasApiKeyHeader = Boolean(input.apiKey)

  let orgFromKey: PublicOrgRef | null = null
  let orgFromId: PublicOrgRef | null = null

  if (input.apiKey) {
    const org = await Organization.findOne({ 'settings.websiteApiKey': input.apiKey }).select(
      '_id isActive',
    )
    if (org) {
      orgFromKey = { id: Number(org._id), isActive: org.isActive }
    }
  }

  if (organizationId !== undefined) {
    const org = await Organization.findById(organizationId).select('_id isActive')
    if (org) {
      orgFromId = { id: Number(org._id), isActive: org.isActive }
    }
  }

  return reconcilePublicTenant({
    mode: input.mode,
    hasApiKeyHeader,
    organizationId,
    orgFromKey,
    orgFromId,
  })
}
