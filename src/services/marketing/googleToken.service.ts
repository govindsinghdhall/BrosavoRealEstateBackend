import { encryptToken, decryptToken } from '../../utils/encryption'
import { AppError } from '../../utils/errors'
import { GoogleBusinessClient } from '../../integrations/googleBusiness.client'
import { MarketingProviderAccount } from '../../models/MarketingProviderAccount'
import { logger } from '../../utils/logger'

export class GoogleTokenService {
  static encrypt(value: string | null | undefined): string | null {
    if (!value) return null
    return encryptToken(value)
  }

  static decrypt(value: string | null | undefined): string | null {
    if (!value) return null
    try {
      return decryptToken(value)
    } catch (error: any) {
      logger.error('Failed to decrypt Google token:', error.message)
      throw new AppError(
        'Google credentials could not be decrypted. Please reconnect Google Business.',
        401,
      )
    }
  }

  static isExpired(expiry: Date | null | undefined, bufferMs = 5 * 60 * 1000): boolean {
    if (!expiry) return true
    return expiry.getTime() <= Date.now() + bufferMs
  }

  static async getValidAccessToken(
    organizationId: number,
  ): Promise<{ accessToken: string; account: InstanceType<typeof MarketingProviderAccount> }> {
    const account = await MarketingProviderAccount.findOne({
      organizationId,
      provider: 'google',
      isConnected: true,
    }).select('+accessToken +refreshToken')

    if (!account?.accessToken) {
      throw new AppError('Google Business is not connected', 400)
    }

    let accessToken = this.decrypt(account.accessToken)
    if (!accessToken) {
      throw new AppError('Google access token is missing. Please reconnect.', 401)
    }

    if (!this.isExpired(account.tokenExpiry)) {
      return { accessToken, account }
    }

    const refreshToken = this.decrypt(account.refreshToken)
    if (!refreshToken) {
      account.metadata = {
        ...(account.metadata || {}),
        status: 'reauth_required',
        lastSyncError: 'Refresh token missing',
      }
      await account.save()
      throw new AppError(
        'Google connection expired. Please reconnect Google Business.',
        401,
      )
    }

    try {
      const tokens = await GoogleBusinessClient.refreshAccessToken(refreshToken)
      accessToken = tokens.access_token
      account.accessToken = this.encrypt(tokens.access_token)
      account.tokenExpiry = new Date(Date.now() + tokens.expires_in * 1000)
      account.metadata = {
        ...(account.metadata || {}),
        status: 'connected',
        lastSyncError: null,
      }
      await account.save()
      return { accessToken, account }
    } catch (error: any) {
      account.metadata = {
        ...(account.metadata || {}),
        status: 'reauth_required',
        lastSyncError: 'Token refresh failed',
      }
      await account.save()
      throw new AppError(
        'Google connection expired. Please reconnect Google Business.',
        401,
      )
    }
  }

  static async storeTokens(
    account: InstanceType<typeof MarketingProviderAccount>,
    tokens: {
      access_token: string
      refresh_token?: string | null
      expires_in: number
      scope?: string
    },
  ): Promise<void> {
    account.accessToken = this.encrypt(tokens.access_token)
    if (tokens.refresh_token) {
      account.refreshToken = this.encrypt(tokens.refresh_token)
    }
    account.tokenExpiry = new Date(Date.now() + tokens.expires_in * 1000)
    account.metadata = {
      ...(account.metadata || {}),
      scope: tokens.scope,
      status: 'connected',
      lastSyncError: null,
    }
    await account.save()
  }

  static async revokeAndClear(
    organizationId: number,
    userId?: number,
  ): Promise<void> {
    await MarketingProviderAccount.findOneAndUpdate(
      { organizationId, provider: 'google' },
      {
        $set: {
          isConnected: false,
          accessToken: null,
          refreshToken: null,
          tokenExpiry: null,
          updatedBy: userId ?? null,
          metadata: { status: 'disconnected' },
        },
      },
    )
  }
}
