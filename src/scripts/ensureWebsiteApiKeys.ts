import { Organization } from '../models/Organization'
import { generateWebsiteApiKey } from '../utils/websiteApiKey'

/**
 * Backfill unique website API keys and repair duplicates without logging secrets.
 * Safe to run on every process start.
 */
export async function ensureWebsiteApiKeys(): Promise<void> {
  const organizations = await Organization.find().select('_id settings isActive')
  const seen = new Map<string, number>()

  for (const organization of organizations) {
    const existing = organization.settings?.websiteApiKey?.trim()
    const duplicate = Boolean(existing && seen.has(existing))
    const needsKey = !existing || duplicate

    if (needsKey) {
      organization.settings = {
        ...(organization.settings ?? {}),
        websiteApiKey: generateWebsiteApiKey(),
      }
      await organization.save()
    }

    const stored = organization.settings?.websiteApiKey
    if (stored) {
      seen.set(stored, Number(organization._id))
    }
  }
}
