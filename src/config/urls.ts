import { env } from './env'

/** Public Render API origin — used when env vars are missing in production. */
const PRODUCTION_API_ORIGIN = 'https://brisavorealestatebackend-1.onrender.com'

/** Live CRM frontend — used for post-OAuth browser redirects in production. */
const PRODUCTION_FRONTEND_ORIGIN = 'https://crm.durgaproperty.com'

function stripTrailingSlash(url: string): string {
  return url.replace(/\/$/, '')
}

/**
 * Public backend origin for OAuth callbacks.
 * Render sets PORT=10000 internally; never build callback URLs from localhost:PORT in production.
 */
export function getApiOrigin(): string {
  if (env.API_BASE_URL) {
    return stripTrailingSlash(env.API_BASE_URL)
  }

  if (env.NODE_ENV === 'production') {
    return PRODUCTION_API_ORIGIN
  }

  return `http://localhost:${env.PORT}`
}

/** Redirect URI registered with Google OAuth (must match Google Cloud Console). */
export function getGoogleOAuthRedirectUri(): string {
  if (env.GOOGLE_REDIRECT_URI) {
    return env.GOOGLE_REDIRECT_URI
  }

  return `${getApiOrigin()}/api/v1/marketing/google/callback`
}

/** CRM frontend origin for res.redirect() after OAuth completes. */
export function getFrontendOrigin(): string {
  const configured = stripTrailingSlash(env.FRONTEND_URL)

  if (env.NODE_ENV === 'production' && /^https?:\/\/localhost(:\d+)?$/i.test(configured)) {
    return PRODUCTION_FRONTEND_ORIGIN
  }

  return configured
}
