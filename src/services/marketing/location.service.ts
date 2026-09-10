import { GoogleBusinessClient } from '../../integrations/googleBusiness.client'
import { GoogleBusinessLocation } from '../../models/GoogleBusinessLocation'
import { MarketingProviderAccount } from '../../models/MarketingProviderAccount'
import { AppError, NotFoundError } from '../../utils/errors'
import { GoogleTokenService } from './googleToken.service'
import { EntitlementService } from './entitlement.service'
import { GOOGLE_BUSINESS_FEATURES } from '../../constants/googleBusinessFeatures'
import { UsageService } from './usage.service'
import { logMarketingActivity } from './activityLog.service'

export class LocationService {
  static async discoverAndSyncLocations(
    organizationId: number,
    userId?: number,
  ) {
    await EntitlementService.assertFeature(
      organizationId,
      GOOGLE_BUSINESS_FEATURES.GOOGLE_BUSINESS,
    )

    const { accessToken, account } = await GoogleTokenService.getValidAccessToken(
      organizationId,
    )

    const accounts = await GoogleBusinessClient.listAccounts(accessToken)
    if (!accounts.length) {
      throw new AppError('No Google Business accounts found for this Google login', 404)
    }

    const primaryAccount = accounts[0]
    const remoteLocations = await GoogleBusinessClient.listLocations(
      accessToken,
      primaryAccount.accountId,
    )

    account.accountId = primaryAccount.accountId
    account.accountName = primaryAccount.accountName
    account.metadata = {
      ...(account.metadata || {}),
      googleAccounts: accounts,
      lastLocationSyncAt: new Date().toISOString(),
    }
    await account.save()

    const saved: InstanceType<typeof GoogleBusinessLocation>[] = []

    for (const remote of remoteLocations) {
      const location = await GoogleBusinessLocation.findOneAndUpdate(
        { organizationId, googleLocationId: remote.googleLocationId },
        {
          $set: {
            organizationId,
            connectionId: account._id,
            googleLocationId: remote.googleLocationId,
            googleAccountId: remote.googleAccountId,
            locationName: remote.locationName,
            businessName: remote.businessName,
            address: remote.address,
            phone: remote.phone,
            website: remote.website,
            category: remote.category,
            status: 'active',
            metadata: remote.metadata || {},
            lastSyncAt: new Date(),
          },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      )
      saved.push(location)
    }

    await UsageService.increment(
      organizationId,
      'locationsConnected',
      saved.length,
    )

    if (userId) {
      await logMarketingActivity({
        organizationId,
        module: 'google',
        action: 'locations_synced',
        description: `Synced ${saved.length} Google Business location(s)`,
        performedBy: userId,
      })
    }

    return saved
  }

  static async listLocations(
    organizationId: number,
    selectedOnly = false,
  ): Promise<Array<Record<string, unknown>>> {
    const filter: Record<string, unknown> = { organizationId, status: 'active' }
    if (selectedOnly) filter.selected = true
    return GoogleBusinessLocation.find(filter).sort({ businessName: 1 }).lean()
  }

  static async getLocation(organizationId: number, locationId: number) {
    const location = await GoogleBusinessLocation.findOne({
      _id: locationId,
      organizationId,
    })
    if (!location) throw new NotFoundError('Location not found')
    return location
  }

  static async selectLocations(
    organizationId: number,
    locationIds: number[],
    userId: number,
  ): Promise<Array<Record<string, unknown>>> {
    await EntitlementService.assertFeature(
      organizationId,
      GOOGLE_BUSINESS_FEATURES.GOOGLE_BUSINESS,
    )

    const limits = await EntitlementService.getLimits(organizationId)
    const hasMulti = await EntitlementService.hasFeature(
      organizationId,
      GOOGLE_BUSINESS_FEATURES.MULTI_LOCATION,
    )

    if (!hasMulti && locationIds.length > 1) {
      throw new AppError(
        'Multiple Google Business locations are not included in your current plan.',
        403,
      )
    }

    if (locationIds.length > limits.maxLocations) {
      throw new AppError(
        `You can connect up to ${limits.maxLocations} location(s) on your current plan.`,
        403,
      )
    }

    const owned = await GoogleBusinessLocation.find({
      organizationId,
      _id: { $in: locationIds },
    })

    if (owned.length !== locationIds.length) {
      throw new AppError('One or more locations do not belong to your organization', 403)
    }

    await GoogleBusinessLocation.updateMany(
      { organizationId },
      { $set: { selected: false } },
    )

    await GoogleBusinessLocation.updateMany(
      { organizationId, _id: { $in: locationIds } },
      { $set: { selected: true } },
    )

    const account = await MarketingProviderAccount.findOne({
      organizationId,
      provider: 'google',
    })

    if (account && owned[0]) {
      account.locationId = owned[0].googleLocationId
      account.accountId = owned[0].googleAccountId
      await account.save()
    }

    await logMarketingActivity({
      organizationId,
      module: 'google',
      action: 'locations_selected',
      description: `Selected ${locationIds.length} Google Business location(s)`,
      performedBy: userId,
    })

    return this.listLocations(organizationId, true)
  }

  static async getSelectedLocations(organizationId: number) {
    return GoogleBusinessLocation.find({
      organizationId,
      selected: true,
      status: 'active',
    })
  }
}
