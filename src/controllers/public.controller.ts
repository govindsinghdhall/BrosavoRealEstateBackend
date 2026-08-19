import type { Request, Response, NextFunction } from 'express'
import { z } from 'zod'
import {
  getPublicPropertyById,
  getPublicStats,
  listPublicBuilders,
  listPublicProperties,
  serializePublicProperty,
  submitPublicInquiry,
} from '../services/public.service'
import { buildPaginationMeta, success, successPaginated } from '../utils/response'
import { parseId, parsePagination } from '../utils/pagination'
import { AppError } from '../utils/errors'

function queryString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function queryBoolean(value: unknown): boolean | undefined {
  if (value === 'true' || value === true) return true
  if (value === 'false' || value === false) return false
  return undefined
}

function requirePublicOrganizationId(req: Request): number {
  if (req.publicOrganizationId === undefined) {
    throw new AppError('organizationId or x-website-api-key is required', 400)
  }
  return req.publicOrganizationId
}

const inquirySchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.string().email().optional().or(z.literal('')),
  phone: z.string().min(10),
  city: z.string().optional(),
  message: z.string().optional(),
  budget: z.coerce.number().optional(),
  propertyId: z.string().optional(),
})

export async function listPublicSiteProperties(req: Request, res: Response, next: NextFunction) {
  try {
    const organizationId = requirePublicOrganizationId(req)
    const { page, limit, search, sortBy, sortOrder } = parsePagination(req)
    const { properties, total } = await listPublicProperties(organizationId, {
      page,
      limit,
      search,
      sortBy,
      sortOrder,
      category: queryString(req.query.category),
      city: queryString(req.query.city),
      locality: queryString(req.query.locality),
      sector: queryString(req.query.sector),
      pincode: queryString(req.query.pincode),
      landmark: queryString(req.query.landmark),
      minPrice: queryString(req.query.minPrice),
      maxPrice: queryString(req.query.maxPrice),
      minArea: queryString(req.query.minArea),
      maxArea: queryString(req.query.maxArea),
      bedrooms: queryString(req.query.bedrooms),
      bhk: queryString(req.query.bhk),
      type: queryString(req.query.type),
      amenities: queryString(req.query.amenities),
      propertyAge: queryString(req.query.propertyAge),
      furnishing: queryString(req.query.furnishing),
      facing: queryString(req.query.facing),
      possessionStatus: queryString(req.query.possessionStatus),
      status: queryString(req.query.status),
      builder: queryString(req.query.builder),
      featured: queryBoolean(req.query.featured),
      reraOnly: queryBoolean(req.query.reraOnly),
      readyToMove: queryBoolean(req.query.readyToMove),
      underConstruction: queryBoolean(req.query.underConstruction),
      possessionYear: queryString(req.query.possessionYear),
    })

    return successPaginated(
      res,
      properties.map(serializePublicProperty),
      buildPaginationMeta(page, limit, total),
    )
  } catch (error) {
    next(error)
  }
}

export async function getPublicSiteProperty(req: Request, res: Response, next: NextFunction) {
  try {
    const organizationId = requirePublicOrganizationId(req)
    const property = await getPublicPropertyById(organizationId, parseId(req.params.id))
    return success(res, serializePublicProperty(property))
  } catch (error) {
    next(error)
  }
}

export async function listPublicSiteBuilders(req: Request, res: Response, next: NextFunction) {
  try {
    const organizationId = requirePublicOrganizationId(req)
    const builders = await listPublicBuilders(organizationId)
    return success(res, builders)
  } catch (error) {
    next(error)
  }
}

export async function getPublicSiteStats(req: Request, res: Response, next: NextFunction) {
  try {
    const organizationId = requirePublicOrganizationId(req)
    const stats = await getPublicStats(organizationId)
    return success(res, stats)
  } catch (error) {
    next(error)
  }
}

export async function createPublicInquiry(req: Request, res: Response, next: NextFunction) {
  try {
    const organizationId = requirePublicOrganizationId(req)
    const payload = inquirySchema.parse(req.body)
    const inquiry = await submitPublicInquiry(organizationId, {
      ...payload,
      email: payload.email || undefined,
    })
    return success(res, inquiry, inquiry.message, 201)
  } catch (error) {
    next(error)
  }
}
