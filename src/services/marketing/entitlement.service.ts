import { Organization } from '../../models/Organization'
import { AppError } from '../../utils/errors'
import {
  DEFAULT_FEATURE_LIMITS,
  FEATURE_DISABLED_MESSAGE,
  GOOGLE_BUSINESS_FEATURES,
  type GoogleBusinessFeature,
} from '../../constants/googleBusinessFeatures'

interface OrgFeatureConfig {
  enabled?: boolean
  features?: Partial<Record<GoogleBusinessFeature, boolean>>
  limits?: Partial<typeof DEFAULT_FEATURE_LIMITS>
}

function getOrgFeatureConfig(org: InstanceType<typeof Organization> | null): OrgFeatureConfig {
  const settings = org?.settings as Record<string, unknown> | null
  const googleBusiness = settings?.googleBusiness as OrgFeatureConfig | undefined
  return googleBusiness || {}
}

export class EntitlementService {
  static async assertFeature(
    organizationId: number,
    feature: GoogleBusinessFeature,
  ): Promise<void> {
    const allowed = await this.hasFeature(organizationId, feature)
    if (!allowed) {
      throw new AppError(FEATURE_DISABLED_MESSAGE[feature], 403, 'FEATURE_NOT_AVAILABLE')
    }
  }

  static async hasFeature(
    organizationId: number,
    feature: GoogleBusinessFeature,
  ): Promise<boolean> {
    if (process.env.GOOGLE_BUSINESS_FEATURE_FLAG === 'false') {
      return false
    }

    const org = await Organization.findById(organizationId).lean()
    const config = getOrgFeatureConfig(org as InstanceType<typeof Organization> | null)

    if (config.enabled === false) {
      return false
    }

    if (config.features && config.features[feature] === false) {
      return false
    }

    if (feature !== GOOGLE_BUSINESS_FEATURES.GOOGLE_BUSINESS) {
      const base = config.features?.[GOOGLE_BUSINESS_FEATURES.GOOGLE_BUSINESS]
      if (base === false) return false
    }

    return true
  }

  static async getLimits(organizationId: number) {
    const org = await Organization.findById(organizationId).lean()
    const config = getOrgFeatureConfig(org as InstanceType<typeof Organization> | null)
    return {
      ...DEFAULT_FEATURE_LIMITS,
      ...(config.limits || {}),
    }
  }
}
