import { randomBytes } from 'crypto'

/** 64-char hex key for public website tenancy. Never log this value. */
export function generateWebsiteApiKey(): string {
  return randomBytes(32).toString('hex')
}
