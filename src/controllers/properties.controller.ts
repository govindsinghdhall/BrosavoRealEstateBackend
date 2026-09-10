import type { Request, Response, NextFunction } from 'express'
import { z } from 'zod'
import {
  createProperty,
  deleteProperty,
  getInventory,
  getPropertyById,
  listProperties,
  serializeProperty,
  updateProperty,
} from '../services/property.service'
import { listPropertiesWithOwners } from '../services/leadProperty.service'
import { validatePropertyPayload, buildPropertySlug } from '../services/propertyValidation.service'
import { buildPaginationMeta, success, successPaginated } from '../utils/response'
import { AppError } from '../utils/errors'

function paramId(value: string | string[]): number {
  const raw = Array.isArray(value) ? value[0] : value
  const id = Number(raw)

  if (!Number.isInteger(id) || id <= 0) {
    throw new AppError('Invalid ID', 400)
  }

  return id
}

const projectConfigurationSchema = z.object({
  bedrooms: z.coerce.number().int().nonnegative(),
  bathrooms: z.coerce.number().int().positive(),
  areaMin: z.coerce.number().nonnegative().nullable().optional(),
  areaMax: z.coerce.number().nonnegative().nullable().optional(),
  startingPrice: z.coerce.number().nonnegative(),
  availableUnits: z.coerce.number().int().nonnegative().nullable().optional(),
})

const offerSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  validFrom: z.string().min(1),
  validUntil: z.string().min(1),
})

const propertyBodySchema = z.object({
  listingType: z.string().optional(),
  title: z.string().min(1),
  slug: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  listingCategory: z.string().optional(),
  type: z.string().min(1),
  status: z.string().optional(),
  projectStatus: z.string().nullable().optional(),
  projectName: z.string().nullable().optional(),
  projectLaunchDate: z.string().nullable().optional(),
  projectWebsite: z.string().nullable().optional(),
  projectDescription: z.string().nullable().optional(),
  projectHighlights: z.array(z.string()).optional(),
  totalUnits: z.coerce.number().int().nonnegative().nullable().optional(),
  availableUnits: z.coerce.number().int().nonnegative().nullable().optional(),
  totalTowers: z.coerce.number().int().nonnegative().nullable().optional(),
  totalFloors: z.coerce.number().int().nonnegative().nullable().optional(),
  configurations: z.array(projectConfigurationSchema).optional(),
  price: z.coerce.number().nonnegative(),
  priceType: z.string().optional(),
  originalPrice: z.coerce.number().nonnegative().nullable().optional(),
  discountedPrice: z.coerce.number().nonnegative().nullable().optional(),
  previousPrice: z.coerce.number().nonnegative().nullable().optional(),
  labels: z.array(z.string()).optional(),
  offer: offerSchema.nullable().optional(),
  urgencyReason: z.string().nullable().optional(),
  area: z.coerce.number().nonnegative().optional(),
  carpetArea: z.coerce.number().nonnegative().nullable().optional(),
  builtUpArea: z.coerce.number().nonnegative().nullable().optional(),
  superArea: z.coerce.number().nonnegative().nullable().optional(),
  bedrooms: z.coerce.number().int().nonnegative().nullable().optional(),
  bathrooms: z.coerce.number().int().nonnegative().nullable().optional(),
  address: z.string().min(1),
  city: z.string().min(1),
  state: z.string().min(1),
  pincode: z.string().nullable().optional(),
  locality: z.string().optional(),
  sector: z.string().nullable().optional(),
  landmark: z.string().nullable().optional(),
  latitude: z.coerce.number().nullable().optional(),
  longitude: z.coerce.number().nullable().optional(),
  builderName: z.string().nullable().optional(),
  propertyAge: z.string().nullable().optional(),
  furnishing: z.string().nullable().optional(),
  facing: z.string().nullable().optional(),
  possessionStatus: z.string().nullable().optional(),
  possessionDate: z.string().nullable().optional(),
  roiPotential: z.coerce.number().nullable().optional(),
  isVerified: z.boolean().optional(),
  hasRera: z.boolean().optional(),
  reraId: z.string().nullable().optional(),
  videoTourUrl: z.string().nullable().optional(),
  virtualTourUrl: z.string().nullable().optional(),
  brochureUrl: z.string().nullable().optional(),
  amenities: z.array(z.string()).optional(),
  isActive: z.boolean().optional(),
  ownerName: z.string().nullable().optional(),
  ownerPhone: z.string().nullable().optional(),
  ownerEmail: z.string().email().nullable().optional().or(z.literal('')),
  ownerAddress: z.string().nullable().optional(),
  ownerNotes: z.string().nullable().optional(),
})

function normalizePayload(payload: z.infer<typeof propertyBodySchema>) {
  const listingType = (payload.listingType ?? 'INDIVIDUAL').toUpperCase()
  return {
    ...payload,
    listingType,
    listingCategory: payload.listingCategory?.toUpperCase(),
    type: payload.type.toUpperCase(),
    status: payload.status?.toUpperCase() ?? 'AVAILABLE',
    projectStatus: payload.projectStatus?.toUpperCase() ?? null,
    priceType: payload.priceType?.toUpperCase() ?? 'FIXED',
    propertyAge: payload.propertyAge?.toUpperCase() ?? null,
    furnishing: payload.furnishing?.toUpperCase() ?? null,
    facing: payload.facing?.toUpperCase() ?? null,
    possessionStatus: payload.possessionStatus?.toUpperCase() ?? null,
    slug:
      payload.slug ??
      buildPropertySlug({
        listingType,
        title: payload.title,
        projectName: payload.projectName,
        locality: payload.locality ?? '',
        sector: payload.sector,
        city: payload.city,
      }),
  }
}

export async function getPropertyInventory(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.auth) {
      return res.status(401).json({ success: false, message: 'Unauthorized' })
    }

    const inventory = await getInventory(req.auth.organizationId)
    return success(res, inventory)
  } catch (error) {
    next(error)
  }
}

export async function listOrganizationProperties(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.auth) {
      return res.status(401).json({ success: false, message: 'Unauthorized' })
    }

    const page = Math.max(1, Number(req.query.page) || 1)
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20))
    const search = typeof req.query.search === 'string' ? req.query.search : undefined
    const status = typeof req.query.status === 'string' ? req.query.status : undefined
    const type = typeof req.query.type === 'string' ? req.query.type : undefined
    const city = typeof req.query.city === 'string' ? req.query.city : undefined
    const listingType = typeof req.query.listingType === 'string' ? req.query.listingType : undefined
    const projectStatus =
      typeof req.query.projectStatus === 'string' ? req.query.projectStatus : undefined
    const labels = typeof req.query.labels === 'string' ? req.query.labels : undefined
    const sortBy = typeof req.query.sortBy === 'string' ? req.query.sortBy : undefined
    const sortOrder = req.query.sortOrder === 'asc' ? 'asc' : 'desc'

    const { properties, total } = await listProperties(req.auth.organizationId, {
      page,
      limit,
      search,
      status,
      type,
      city,
      listingType,
      projectStatus,
      labels,
      sortBy,
      sortOrder,
    })

    const data = properties.map(serializeProperty)
    return successPaginated(res, data, buildPaginationMeta(page, limit, total))
  } catch (error) {
    next(error)
  }
}

export async function getOrganizationProperty(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.auth) {
      return res.status(401).json({ success: false, message: 'Unauthorized' })
    }

    const property = await getPropertyById(paramId(req.params.id), req.auth.organizationId)
    return success(res, serializeProperty(property))
  } catch (error) {
    next(error)
  }
}

export async function createOrganizationProperty(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.auth) {
      return res.status(401).json({ success: false, message: 'Unauthorized' })
    }

    const parsed = normalizePayload(propertyBodySchema.parse(req.body))
    const payload = validatePropertyPayload(parsed as Record<string, unknown>)
    const property = await createProperty(req.auth.organizationId, payload)
    return success(res, serializeProperty(property), 'Property created', 201)
  } catch (error) {
    next(error)
  }
}

export async function updateOrganizationProperty(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.auth) {
      return res.status(401).json({ success: false, message: 'Unauthorized' })
    }

    const parsed = propertyBodySchema.partial().parse(req.body)
    const payload: Record<string, unknown> = { ...parsed }
    if (parsed.listingCategory) payload.listingCategory = parsed.listingCategory.toUpperCase()
    if (parsed.type) payload.type = parsed.type.toUpperCase()
    if (parsed.status) payload.status = parsed.status.toUpperCase()
    if (parsed.listingType) payload.listingType = parsed.listingType.toUpperCase()
    if (parsed.projectStatus) payload.projectStatus = parsed.projectStatus.toUpperCase()
    if (parsed.priceType) payload.priceType = parsed.priceType.toUpperCase()
    if (parsed.propertyAge) payload.propertyAge = parsed.propertyAge.toUpperCase()
    if (parsed.furnishing) payload.furnishing = parsed.furnishing.toUpperCase()
    if (parsed.facing) payload.facing = parsed.facing.toUpperCase()
    if (parsed.possessionStatus) payload.possessionStatus = parsed.possessionStatus.toUpperCase()

    const validated = validatePropertyPayload(payload, true)

    const property = await updateProperty(
      paramId(req.params.id),
      req.auth.organizationId,
      validated,
    )
    return success(res, serializeProperty(property), 'Property updated')
  } catch (error) {
    next(error)
  }
}

export async function deleteOrganizationProperty(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.auth) {
      return res.status(401).json({ success: false, message: 'Unauthorized' })
    }

    await deleteProperty(paramId(req.params.id), req.auth.organizationId)
    return success(res, null, 'Property deleted')
  } catch (error) {
    next(error)
  }
}

export async function listPropertyOwners(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.auth) {
      return res.status(401).json({ success: false, message: 'Unauthorized' })
    }

    const page = Math.max(1, Number(req.query.page) || 1)
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50))
    const search = typeof req.query.search === 'string' ? req.query.search : undefined

    const { properties, total } = await listPropertiesWithOwners(req.auth.organizationId, {
      page,
      limit,
      search,
    })

    return successPaginated(res, properties, buildPaginationMeta(page, limit, total))
  } catch (error) {
    next(error)
  }
}

export async function uploadPropertyImagesBatch(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.auth) {
      return res.status(401).json({ success: false, message: 'Unauthorized' })
    }

    await getPropertyById(paramId(req.params.id), req.auth.organizationId)
    return success(res, [], 'Image upload is not configured yet', 201)
  } catch (error) {
    next(error)
  }
}
