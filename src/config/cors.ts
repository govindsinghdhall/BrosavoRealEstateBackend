import type { CorsOptions } from 'cors'
import { corsOrigins, env } from './env'

const LOCALHOST_ORIGIN = /^https?:\/\/localhost(:\d+)?$/
const LOCAL_NETWORK_ORIGIN = /^https?:\/\/127\.0\.0\.1(:\d+)?$/
const RENDER_ORIGIN = /^https:\/\/[a-z0-9-]+\.onrender\.com$/

/**
 * Normalize an origin so configuration can safely contain
 * a trailing slash without causing an exact-match failure.
 */
function normalizeOrigin(origin: string): string {
  return origin.trim().replace(/\/$/, '')
}

/**
 * Configured CORS origins.
 *
 * CORS_ORIGIN can contain comma-separated origins:
 *
 * CORS_ORIGIN=https://www.durgaproperty.com,https://crm.brosavo.com
 */
const configuredOrigins = corsOrigins
  .map(normalizeOrigin)
  .filter(Boolean)

function isAllowedOrigin(origin: string): boolean {
  const normalizedOrigin = normalizeOrigin(origin)

  /**
   * Explicitly configured origins.
   */
  if (configuredOrigins.includes(normalizedOrigin)) {
    return true
  }

  /**
   * Local development.
   */
  if (
    LOCALHOST_ORIGIN.test(normalizedOrigin) ||
    LOCAL_NETWORK_ORIGIN.test(normalizedOrigin)
  ) {
    return true
  }

  /**
   * Render preview/deployment URLs.
   */
  if (
    env.NODE_ENV === 'production' &&
    RENDER_ORIGIN.test(normalizedOrigin)
  ) {
    return true
  }

  return false
}

export function getCorsOptions(): CorsOptions {
  return {
    origin(origin, callback) {
      /**
       * Requests without an Origin header include:
       * - curl
       * - Postman
       * - server-to-server requests
       */
      if (!origin) {
        callback(null, true)
        return
      }

      if (isAllowedOrigin(origin)) {
        callback(null, true)
        return
      }

      console.warn(`CORS blocked origin: ${origin}`)
      console.warn(
        `Configured CORS origins: ${configuredOrigins.join(', ')}`,
      )

      callback(null, false)
    },

    credentials: true,

    methods: [
      'GET',
      'POST',
      'PUT',
      'PATCH',
      'DELETE',
      'OPTIONS',
    ],

    /**
     * IMPORTANT:
     * x-website-api-key is required by the frontend
     * and must be allowed during the browser preflight.
     */
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'Accept',
      'x-website-api-key',
    ],

    optionsSuccessStatus: 204,
  }
}

export function logCorsConfig(): void {
  console.log(
    `CORS origins: ${configuredOrigins.join(', ')}`,
  )

  console.log(
    'CORS also allows: http://localhost:* and http://127.0.0.1:*',
  )

  if (env.NODE_ENV === 'production') {
    console.log(
      'CORS also allows: https://*.onrender.com',
    )
  }

  console.log(
    'CORS allowed headers: Content-Type, Authorization, Accept, x-website-api-key',
  )
}