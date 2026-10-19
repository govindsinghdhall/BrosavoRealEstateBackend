import type { Request } from 'express'
import { AppError } from './errors'

export function parsePagination(req: Request) {
  const page = Math.max(1, Number(req.query.page) || 1)
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20))
  const search = typeof req.query.search === 'string' ? req.query.search : undefined
  const sortBy = typeof req.query.sortBy === 'string' ? req.query.sortBy : 'createdAt'
  const sortOrder: 'asc' | 'desc' = (req.query.sortOrder === 'asc' || req.query.sortOrder === 'desc') 
    ? req.query.sortOrder 
    : 'desc'
  return { page, limit, search, sortBy, sortOrder }
}

export function parseId(value: string | string[]): number {
  const raw = Array.isArray(value) ? value[0] : value
  const id = Number(raw)
  if (!Number.isInteger(id) || id <= 0) {
    throw new AppError('Invalid ID', 400)
  }
  return id
}

export function activeOrgFilter(organizationId: number) {
  return { organizationId, deletedAt: null }
}
