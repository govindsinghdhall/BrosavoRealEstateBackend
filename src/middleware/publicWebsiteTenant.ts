import type { NextFunction, Request, Response } from 'express'
import {
  readWebsiteApiKeyHeader,
  resolvePublicTenantFromRequest,
  type PublicTenantMode,
} from '../services/publicTenant.service'

async function attachPublicTenant(req: Request, mode: PublicTenantMode): Promise<void> {
  const apiKey = readWebsiteApiKeyHeader(req.headers['x-website-api-key'])
  req.publicOrganizationId = await resolvePublicTenantFromRequest({
    mode,
    apiKey,
    organizationIdRaw: req.query.organizationId,
  })
}

export function requirePublicWebsiteReadTenant(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  void attachPublicTenant(req, 'read').then(() => next(), next)
}

export function requirePublicWebsiteInquiryTenant(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  void attachPublicTenant(req, 'inquiry').then(() => next(), next)
}
