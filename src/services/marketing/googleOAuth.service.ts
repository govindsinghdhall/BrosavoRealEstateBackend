import { signAccessToken, verifyAccessToken } from '../../utils/jwt'
import { AppError } from '../../utils/errors'
import { env } from '../../config/env'
import { GoogleBusinessClient } from '../../integrations/googleBusiness.client'
import { MarketingRepository } from '../../repositories/marketing.repository'
import { logMarketingActivity } from './activityLog.service'
import { Organization } from '../../models/Organization'

export class GoogleOAuthService {
  static async getLoginUrl(organizationId: number, userId: number) {
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

    const tokens = await GoogleBusinessClient.exchangeCode(code)
    const org = await Organization.findById(organizationId).lean()
    const expiry = new Date(Date.now() + tokens.expires_in * 1000)

    const account = await MarketingRepository.upsertProvider(organizationId, 'google', {
      accountName: org?.name || 'Google Business',
      accountId: null,
      locationId: null,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token ?? null,
      tokenExpiry: expiry,
      isConnected: true,
      metadata: {
        scope: tokens.scope,
        connectedAt: new Date().toISOString(),
      },
      updatedBy: userId,
      createdBy: userId,
    })

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
      },
      redirectUrl: `${env.FRONTEND_URL}/marketing?google=connected`,
    }
  }

  static async disconnect(organizationId: number, userId: number, meta?: { ip?: string; userAgent?: string }) {
    const account = await MarketingRepository.upsertProvider(organizationId, 'google', {
      isConnected: false,
      accessToken: null,
      refreshToken: null,
      tokenExpiry: null,
      updatedBy: userId,
    })

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

  static async refreshExpiringTokens() {
    const soon = new Date(Date.now() + 60 * 60 * 1000)
    const { MarketingProviderAccount } = await import('../../models/MarketingProviderAccount')
    const accounts = await MarketingProviderAccount.find({
      provider: 'google',
      isConnected: true,
      tokenExpiry: { $lte: soon },
    }).select('+accessToken +refreshToken')

    for (const account of accounts) {
      if (!account.refreshToken) continue
      try {
        const tokens = await GoogleBusinessClient.refreshAccessToken(account.refreshToken)
        account.accessToken = tokens.access_token
        account.tokenExpiry = new Date(Date.now() + tokens.expires_in * 1000)
        await account.save()
      } catch (error) {
        console.error(`Failed to refresh Google token for org ${account.organizationId}`, error)
      }
    }
  }
}
