/**
 * @deprecated Public `/api/v1/public/*` routes resolve the organization per
 * request via `x-website-api-key` and/or `organizationId`.
 * Do not use this helper for those endpoints.
 */
export async function resolvePublicOrganizationId(): Promise<number> {
  throw new Error(
    'resolvePublicOrganizationId is deprecated. Public routes must use req.publicOrganizationId.',
  )
}
