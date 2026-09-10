import { env } from '../config/env'
import { getGoogleOAuthRedirectUri } from '../config/urls'
import { AppError } from '../utils/errors'
import { logger } from '../utils/logger'

export interface GoogleTokenResponse {
  access_token: string
  refresh_token?: string
  expires_in: number
  token_type: string
  scope?: string
}

export interface GoogleReviewPayload {
  googleReviewId: string
  reviewerName: string
  reviewerAvatar?: string | null
  rating: number
  reviewText: string
  reviewDate: Date
  replyText?: string | null
  replyDate?: Date | null
}

export interface GoogleAccountPayload {
  accountId: string
  accountName: string
  type?: string
}

export interface GoogleLocationPayload {
  googleLocationId: string
  googleAccountId: string
  locationName: string
  businessName: string
  address: Record<string, string | undefined>
  phone?: string | null
  website?: string | null
  category?: string | null
  metadata?: Record<string, unknown>
}

export interface GoogleLocalPostPayload {
  summary: string
  topicType?: 'STANDARD' | 'EVENT' | 'OFFER'
  callToAction?: {
    actionType: string
    url?: string
  }
  media?: Array<{ mediaFormat: string; sourceUrl: string }>
}

const ACCOUNT_API = 'https://mybusinessaccountmanagement.googleapis.com/v1'
const BUSINESS_INFO_API = 'https://mybusinessbusinessinformation.googleapis.com/v1'
const MY_BUSINESS_API = 'https://mybusiness.googleapis.com/v4'

async function googleFetch<T>(
  url: string,
  accessToken: string,
  options: RequestInit = {},
  retries = 2,
): Promise<T> {
  let lastError: Error | null = null

  for (let attempt = 0; attempt <= retries; attempt++) {
    const response = await fetch(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
    })

    if (response.status === 429 && attempt < retries) {
      const delay = Math.pow(2, attempt) * 1000
      await new Promise((r) => setTimeout(r, delay))
      continue
    }

    if (!response.ok) {
      const text = await response.text()
      logger.error(`Google API error ${response.status} for ${url}: ${text.slice(0, 500)}`)

      if (response.status === 401) {
        throw new AppError('Google authorization expired. Please reconnect.', 401)
      }
      if (response.status === 403) {
        throw new AppError(
          'Google Business API access denied. Ensure required APIs are enabled and your account has access.',
          403,
        )
      }
      if (response.status === 429) {
        throw new AppError('Google API rate limit exceeded. Please try again later.', 429)
      }

      throw new AppError(`Google API request failed (${response.status})`, 502)
    }

    if (response.status === 204) {
      return undefined as T
    }

    return (await response.json()) as T
  }

  throw lastError || new AppError('Google API request failed after retries', 502)
}

function parseAccountId(resourceName: string): string {
  return resourceName.replace(/^accounts\//, '')
}

function parseLocationId(resourceName: string): string {
  const parts = resourceName.split('/')
  return parts[parts.length - 1] || resourceName
}

/** Google Business Profile API client — authenticated requests with retry/rate-limit handling. */
export class GoogleBusinessClient {
  static isConfigured() {
    return Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET)
  }

  static getRedirectUri() {
    return getGoogleOAuthRedirectUri()
  }

  static buildAuthUrl(state: string) {
    if (!this.isConfigured()) {
      throw new AppError(
        'Google OAuth is not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.',
        503,
      )
    }

    const params = new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID!,
      redirect_uri: this.getRedirectUri(),
      response_type: 'code',
      access_type: 'offline',
      prompt: 'consent',
      scope: [
        'https://www.googleapis.com/auth/business.manage',
        'openid',
        'email',
        'profile',
      ].join(' '),
      state,
    })

    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
  }

  static async exchangeCode(code: string): Promise<GoogleTokenResponse> {
    if (!this.isConfigured()) {
      throw new AppError('Google OAuth is not configured', 503)
    }

    const body = new URLSearchParams({
      code,
      client_id: env.GOOGLE_CLIENT_ID!,
      client_secret: env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: this.getRedirectUri(),
      grant_type: 'authorization_code',
    })

    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    })

    if (!response.ok) {
      const text = await response.text()
      throw new AppError(`Google token exchange failed: ${text}`, 502)
    }

    return (await response.json()) as GoogleTokenResponse
  }

  static async refreshAccessToken(refreshToken: string): Promise<GoogleTokenResponse> {
    if (!this.isConfigured()) {
      throw new AppError('Google OAuth is not configured', 503)
    }

    const body = new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID!,
      client_secret: env.GOOGLE_CLIENT_SECRET!,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    })

    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    })

    if (!response.ok) {
      const text = await response.text()
      throw new AppError(`Google token refresh failed: ${text}`, 502)
    }

    return (await response.json()) as GoogleTokenResponse
  }

  static async listAccounts(accessToken: string): Promise<GoogleAccountPayload[]> {
    const data = await googleFetch<{ accounts?: Array<{ name: string; accountName?: string; type?: string }> }>(
      `${ACCOUNT_API}/accounts`,
      accessToken,
    )

    return (data.accounts || []).map((account) => ({
      accountId: parseAccountId(account.name),
      accountName: account.accountName || account.name,
      type: account.type,
    }))
  }

  static async listLocations(
    accessToken: string,
    accountId: string,
  ): Promise<GoogleLocationPayload[]> {
    const readMask = [
      'name',
      'title',
      'storefrontAddress',
      'phoneNumbers',
      'websiteUri',
      'categories',
    ].join(',')

    const data = await googleFetch<{
      locations?: Array<{
        name: string
        title?: string
        storefrontAddress?: {
          addressLines?: string[]
          locality?: string
          administrativeArea?: string
          postalCode?: string
          regionCode?: string
        }
        phoneNumbers?: { primaryPhone?: string }
        websiteUri?: string
        categories?: { primaryCategory?: { displayName?: string } }
      }>
    }>(
      `${BUSINESS_INFO_API}/accounts/${accountId}/locations?readMask=${readMask}&pageSize=100`,
      accessToken,
    )

    return (data.locations || []).map((loc) => {
      const addr = loc.storefrontAddress
      const lines = addr?.addressLines || []
      return {
        googleLocationId: parseLocationId(loc.name),
        googleAccountId: accountId,
        locationName: loc.name,
        businessName: loc.title || 'Business Location',
        address: {
          line1: lines[0],
          line2: lines[1],
          city: addr?.locality,
          state: addr?.administrativeArea,
          postalCode: addr?.postalCode,
          country: addr?.regionCode,
          formatted: lines.join(', '),
        },
        phone: loc.phoneNumbers?.primaryPhone || null,
        website: loc.websiteUri || null,
        category: loc.categories?.primaryCategory?.displayName || null,
        metadata: { resourceName: loc.name },
      }
    })
  }

  static async fetchReviews(
    accessToken: string,
    accountId: string,
    locationId: string,
  ): Promise<GoogleReviewPayload[]> {
    const url = `${MY_BUSINESS_API}/accounts/${accountId}/locations/${locationId}/reviews`
    const data = await googleFetch<{
      reviews?: Array<{
        reviewId?: string
        name?: string
        reviewer?: { displayName?: string; profilePhotoUrl?: string }
        starRating?: string
        comment?: string
        createTime?: string
        reviewReply?: { comment?: string; updateTime?: string }
      }>
    }>(url, accessToken)

    const ratingMap: Record<string, number> = {
      ONE: 1,
      TWO: 2,
      THREE: 3,
      FOUR: 4,
      FIVE: 5,
    }

    return (data.reviews || []).map((review) => {
      const googleReviewId =
        review.reviewId ||
        (review.name ? review.name.split('/').pop() : '') ||
        ''

      return {
        googleReviewId,
        reviewerName: review.reviewer?.displayName || 'Google User',
        reviewerAvatar: review.reviewer?.profilePhotoUrl || null,
        rating: ratingMap[review.starRating || 'FIVE'] || 5,
        reviewText: review.comment || '',
        reviewDate: review.createTime ? new Date(review.createTime) : new Date(),
        replyText: review.reviewReply?.comment || null,
        replyDate: review.reviewReply?.updateTime
          ? new Date(review.reviewReply.updateTime)
          : null,
      }
    })
  }

  static async postReply(
    accessToken: string,
    accountId: string,
    locationId: string,
    reviewId: string,
    comment: string,
  ): Promise<void> {
    const url = `${MY_BUSINESS_API}/accounts/${accountId}/locations/${locationId}/reviews/${reviewId}/reply`
    await googleFetch(url, accessToken, {
      method: 'PUT',
      body: JSON.stringify({ comment }),
    })
  }

  static async createLocalPost(
    accessToken: string,
    accountId: string,
    locationId: string,
    payload: GoogleLocalPostPayload,
  ): Promise<{ googlePostId: string }> {
    const url = `${MY_BUSINESS_API}/accounts/${accountId}/locations/${locationId}/localPosts`
    const data = await googleFetch<{ name?: string }>(url, accessToken, {
      method: 'POST',
      body: JSON.stringify({
        languageCode: 'en-US',
        summary: payload.summary,
        topicType: payload.topicType || 'STANDARD',
        callToAction: payload.callToAction,
        media: payload.media,
      }),
    })

    const googlePostId = data.name
      ? data.name.split('/').pop() || data.name
      : ''

    return { googlePostId }
  }

  static async getUserInfo(accessToken: string): Promise<{ email?: string; name?: string }> {
    const data = await googleFetch<{ email?: string; name?: string }>(
      'https://www.googleapis.com/oauth2/v2/userinfo',
      accessToken,
    )
    return { email: data.email, name: data.name }
  }
}
