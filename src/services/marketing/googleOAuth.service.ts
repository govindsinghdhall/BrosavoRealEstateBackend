import { signAccessToken, verifyAccessToken } from '../../utils/jwt'
import { AppError } from '../../utils/errors'
import { getFrontendOrigin } from '../../config/urls'
import { GoogleBusinessClient } from '../../integrations/googleBusiness.client'
import { MarketingRepository } from '../../repositories/marketing.repository'
import { logMarketingActivity } from './activityLog.service'
import { Organization } from '../../models/Organization'
import { GoogleTokenService } from './googleToken.service'
import { LocationService } from './location.service'
import { EntitlementService } from './entitlement.service'
import { GOOGLE_BUSINESS_FEATURES } from '../../constants/googleBusinessFeatures'

export class GoogleOAuthService {
  static async getLoginUrl(organizationId: number, userId: number) {
    await EntitlementService.assertFeature(
      organizationId,
      GOOGLE_BUSINESS_FEATURES.GOOGLE_BUSINESS,
    )

    const state = signAccessToken({
      userId,
      organizationId,
      roleId: 0,
      email: `marketing-oauth-${organizationId}@internal`,
    })
    return GoogleBusinessClient.buildAuthUrl(state)
  }

  static async handleCallback(code: string, state: string, meta?: { ip?: string; userAgent?: string }) {
    let organizationId: number
    let userId: number

    try {
      const payload = verifyAccessToken(state)
      organizationId = payload.organizationId
      userId = payload.userId
    } catch {
      throw new AppError('Invalid OAuth state', 400)
    }

    await EntitlementService.assertFeature(
      organizationId,
      GOOGLE_BUSINESS_FEATURES.GOOGLE_BUSINESS,
    )

    const tokens = await GoogleBusinessClient.exchangeCode(code)
    const org = await Organization.findById(organizationId).lean()
    const userInfo = await GoogleBusinessClient.getUserInfo(tokens.access_token)
    const expiry = new Date(Date.now() + tokens.expires_in * 1000)

    const account = await MarketingRepository.upsertProvider(organizationId, 'google', {
      accountName: userInfo.name || org?.name || 'Google Business',
      accountId: null,
      locationId: null,
      accessToken: GoogleTokenService.encrypt(tokens.access_token),
      refreshToken: GoogleTokenService.encrypt(tokens.refresh_token ?? null),
      tokenExpiry: expiry,
      isConnected: true,
      metadata: {
        scope: tokens.scope,
        connectedAt: new Date().toISOString(),
        status: 'connected',
        googleEmail: userInfo.email,
        googleName: userInfo.name,
      },
      updatedBy: userId,
      createdBy: userId,
    })

    try {
      await LocationService.discoverAndSyncLocations(organizationId, userId)
    } catch (error) {
      console.error(`Location discovery failed for org ${organizationId}:`, error)
    }

    await logMarketingActivity({
      organizationId,
      module: 'google',
      action: 'connected',
      description: 'Connected Google Business account',
      performedBy: userId,
      ip: meta?.ip,
      userAgent: meta?.userAgent,
    })

    return {
      account: {
        id: account._id,
        provider: account.provider,
        accountName: account.accountName,
        isConnected: account.isConnected,
        locationId: account.locationId,
        status: 'connected',
      },
      redirectUrl: `${getFrontendOrigin()}/marketing?google=connected`,
    }
  }

  static async disconnect(organizationId: number, userId: number, meta?: { ip?: string; userAgent?: string }) {
    await GoogleTokenService.revokeAndClear(organizationId, userId)

    const { GoogleBusinessLocation } = await import('../../models/GoogleBusinessLocation')
    await GoogleBusinessLocation.updateMany(
      { organizationId },
      { $set: { selected: false, status: 'inactive' } },
    )

    const account = await MarketingRepository.findProvider(organizationId, 'google')

    await logMarketingActivity({
      organizationId,
      module: 'google',
      action: 'disconnected',
      description: 'Disconnected Google Business account',
      performedBy: userId,
      ip: meta?.ip,
      userAgent: meta?.userAgent,
    })

    return account
  }

  static async getStatus(organizationId: number) {
    const account = await MarketingRepository.findProvider(organizationId, 'google')
    const locations = await LocationService.listLocations(organizationId)

    return {
      isConnected: Boolean(account?.isConnected),
      accountName: account?.accountName || null,
      accountId: account?.accountId || null,
      status: (account?.metadata as Record<string, unknown>)?.status || 'disconnected',
      lastSyncAt: (account?.metadata as Record<string, unknown>)?.lastLocationSyncAt || null,
      locationsCount: locations.length,
      selectedLocationsCount: locations.filter((l) => l.selected).length,
    }
  }

  static async refreshExpiringTokens() {
    const soon = new Date(Date.now() + 60 * 60 * 1000)
    const { MarketingProviderAccount } = await import('../../models/MarketingProviderAccount')
    const accounts = await MarketingProviderAccount.find({
      provider: 'google',
      isConnected: true,
      tokenExpiry: { $lte: soon },
    }).select('+accessToken +refreshToken')

    for (const account of accounts) {
      try {
        await GoogleTokenService.getValidAccessToken(account.organizationId)
      } catch (error) {
        console.error(`Failed to refresh Google token for org ${account.organizationId}`, error)
      }
    }
  }
}
