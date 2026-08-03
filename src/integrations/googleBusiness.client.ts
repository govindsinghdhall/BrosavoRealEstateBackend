import { env } from '../config/env'
import { AppError } from '../utils/errors'

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

/** Thin Google Business Profile client. Uses live OAuth when configured; otherwise safe stubs. */
export class GoogleBusinessClient {
  static isConfigured() {
    return Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET)
  }

  static getRedirectUri() {
    return (
      env.GOOGLE_REDIRECT_URI ||
      `http://localhost:${env.PORT}/api/v1/marketing/google/callback`
    )
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

  /**
   * Fetches reviews for a location.
   * When Google credentials are missing or the live API is unavailable, returns [].
   * Replace the stub body with Business Profile API calls when accounts are live.
   */
  static async fetchReviews(_accessToken: string, _locationId: string): Promise<GoogleReviewPayload[]> {
    try {
      // Placeholder for Google Business Profile reviews.list
      // https://developers.google.com/my-business/reference/rest/v4/accounts.locations.reviews/list
      return []
    } catch {
      return []
    }
  }

  static async postReply(
    _accessToken: string,
    _locationId: string,
    _reviewId: string,
    _comment: string,
  ): Promise<void> {
    // Placeholder for reviews.updateReply — no-op until Google account is connected live.
  }
}
