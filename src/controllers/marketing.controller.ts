import type { Request, Response, NextFunction } from 'express'
import { z } from 'zod'
import { GoogleOAuthService } from '../services/marketing/googleOAuth.service'
import { AIReplyService, ReviewSyncService } from '../services/marketing/review.service'
import { ContentService } from '../services/marketing/content.service'
import { CampaignService } from '../services/marketing/campaign.service'
import { AnalyticsService, SettingsService } from '../services/marketing/analytics.service'
import { success, successPaginated, buildPaginationMeta } from '../utils/response'
import { AppError, UnauthorizedError } from '../utils/errors'
import { parseId, parsePagination } from '../utils/pagination'
import { REVIEW_STATUSES } from '../models/GoogleReview'
import { CONTENT_TYPES, CONTENT_STATUSES } from '../models/MarketingContent'
import { CAMPAIGN_STATUSES } from '../models/MarketingCampaign'
import { AI_TONES } from '../models/MarketingSettings'
import { MARKETING_PROVIDERS } from '../models/MarketingProviderAccount'
import { getFrontendOrigin } from '../config/urls'

function requireAuth(req: Request) {
  if (!req.auth) throw new UnauthorizedError()
  return req.auth
}

function requestMeta(req: Request) {
  return {
    ip: req.ip,
    userAgent: req.get('user-agent') || undefined,
  }
}

export async function googleLogin(req: Request, res: Response, next: NextFunction) {
  try {
    const auth = requireAuth(req)
    const url = await GoogleOAuthService.getLoginUrl(auth.organizationId, auth.userId)
    return success(res, { url })
  } catch (error) {
    next(error)
  }
}

export async function googleCallback(req: Request, res: Response, next: NextFunction) {
  try {
    const code = typeof req.query.code === 'string' ? req.query.code : ''
    const state = typeof req.query.state === 'string' ? req.query.state : ''
    if (!code || !state) throw new AppError('Missing OAuth code or state', 400)

    const result = await GoogleOAuthService.handleCallback(code, state, requestMeta(req))
    return res.redirect(result.redirectUrl)
  } catch (error) {
    const message = error instanceof Error ? encodeURIComponent(error.message) : 'oauth_failed'
    return res.redirect(`${getFrontendOrigin()}/marketing?google=error&message=${message}`)
  }
}

export async function googleDisconnect(req: Request, res: Response, next: NextFunction) {
  try {
    const auth = requireAuth(req)
    const account = await GoogleOAuthService.disconnect(auth.organizationId, auth.userId, requestMeta(req))
    return success(res, account, 'Google Business disconnected')
  } catch (error) {
    next(error)
  }
}

export async function syncReviews(req: Request, res: Response, next: NextFunction) {
  try {
    const auth = requireAuth(req)
    const result = await ReviewSyncService.syncLatestReviews(auth.organizationId)
    return success(res, result, 'Reviews synced')
  } catch (error) {
    next(error)
  }
}

export async function listReviews(req: Request, res: Response, next: NextFunction) {
  try {
    const auth = requireAuth(req)
    const { page, limit, search } = parsePagination(req)
    const rating = req.query.rating ? Number(req.query.rating) : undefined
    const status =
      typeof req.query.status === 'string' && REVIEW_STATUSES.includes(req.query.status as typeof REVIEW_STATUSES[number])
        ? (req.query.status as typeof REVIEW_STATUSES[number])
        : undefined

    const { rows, total } = await ReviewSyncService.listReviews(auth.organizationId, {
      page,
      limit,
      search,
      rating: rating && rating >= 1 && rating <= 5 ? rating : undefined,
      status,
    })

    return successPaginated(res, rows, buildPaginationMeta(page, limit, total))
  } catch (error) {
    next(error)
  }
}

export async function getReview(req: Request, res: Response, next: NextFunction) {
  try {
    const auth = requireAuth(req)
    const review = await ReviewSyncService.getReview(auth.organizationId, parseId(req.params.id))
    return success(res, review)
  } catch (error) {
    next(error)
  }
}

export async function generateAiReply(req: Request, res: Response, next: NextFunction) {
  try {
    const auth = requireAuth(req)
    const result = await AIReplyService.generate(
      auth.organizationId,
      parseId(req.params.id),
      auth.userId,
    )
    return success(res, result, 'AI reply generated')
  } catch (error) {
    next(error)
  }
}

export async function updateReviewReply(req: Request, res: Response, next: NextFunction) {
  try {
    const auth = requireAuth(req)
    const body = z.object({ replyText: z.string().min(1) }).parse(req.body)
    const review = await AIReplyService.updateReply(
      auth.organizationId,
      parseId(req.params.id),
      body.replyText,
      auth.userId,
    )
    return success(res, review, 'Reply updated')
  } catch (error) {
    next(error)
  }
}

export async function postReviewReply(req: Request, res: Response, next: NextFunction) {
  try {
    const auth = requireAuth(req)
    const review = await AIReplyService.postReply(
      auth.organizationId,
      parseId(req.params.id),
      auth.userId,
    )
    return success(res, review, 'Reply posted to Google')
  } catch (error) {
    next(error)
  }
}

export async function uploadContent(req: Request, res: Response, next: NextFunction) {
  try {
    const auth = requireAuth(req)
    if (!req.file) throw new AppError('Image file is required', 400)

    const body = z
      .object({
        title: z.string().optional(),
        description: z.string().optional(),
        contentType: z.enum(CONTENT_TYPES).optional(),
        provider: z.enum(MARKETING_PROVIDERS).optional(),
      })
      .parse(req.body)

    const content = await ContentService.upload(auth.organizationId, auth.userId, req.file, body)
    return success(res, content, 'Content uploaded', 201)
  } catch (error) {
    next(error)
  }
}

export async function listContent(req: Request, res: Response, next: NextFunction) {
  try {
    const auth = requireAuth(req)
    const status =
      typeof req.query.status === 'string' &&
      CONTENT_STATUSES.includes(req.query.status as typeof CONTENT_STATUSES[number])
        ? (req.query.status as typeof CONTENT_STATUSES[number])
        : undefined
    const rows = await ContentService.list(auth.organizationId, status)
    return success(res, rows)
  } catch (error) {
    next(error)
  }
}

export async function updateContent(req: Request, res: Response, next: NextFunction) {
  try {
    const auth = requireAuth(req)
    const body = z
      .object({
        title: z.string().min(1).optional(),
        description: z.string().nullable().optional(),
        contentType: z.enum(CONTENT_TYPES).optional(),
        status: z.enum(CONTENT_STATUSES).optional(),
      })
      .parse(req.body)
    const content = await ContentService.update(
      auth.organizationId,
      parseId(req.params.id),
      auth.userId,
      body,
    )
    return success(res, content, 'Content updated')
  } catch (error) {
    next(error)
  }
}

export async function deleteContent(req: Request, res: Response, next: NextFunction) {
  try {
    const auth = requireAuth(req)
    const result = await ContentService.remove(
      auth.organizationId,
      parseId(req.params.id),
      auth.userId,
    )
    return success(res, result, 'Content deleted')
  } catch (error) {
    next(error)
  }
}

export async function publishContent(req: Request, res: Response, next: NextFunction) {
  try {
    const auth = requireAuth(req)
    const content = await ContentService.publish(
      auth.organizationId,
      parseId(req.params.id),
      auth.userId,
    )
    return success(res, content, 'Content published')
  } catch (error) {
    next(error)
  }
}

export async function scheduleContent(req: Request, res: Response, next: NextFunction) {
  try {
    const auth = requireAuth(req)
    const body = z.object({ scheduleAt: z.coerce.date() }).parse(req.body)
    const content = await ContentService.schedule(
      auth.organizationId,
      parseId(req.params.id),
      auth.userId,
      body.scheduleAt,
    )
    return success(res, content, 'Content scheduled')
  } catch (error) {
    next(error)
  }
}

export async function listCampaigns(req: Request, res: Response, next: NextFunction) {
  try {
    const auth = requireAuth(req)
    const rows = await CampaignService.list(auth.organizationId)
    return success(res, rows)
  } catch (error) {
    next(error)
  }
}

export async function getCampaign(req: Request, res: Response, next: NextFunction) {
  try {
    const auth = requireAuth(req)
    const campaign = await CampaignService.get(auth.organizationId, parseId(req.params.id))
    return success(res, campaign)
  } catch (error) {
    next(error)
  }
}

export async function createCampaign(req: Request, res: Response, next: NextFunction) {
  try {
    const auth = requireAuth(req)
    const body = z
      .object({
        campaignName: z.string().min(1),
        provider: z.enum(MARKETING_PROVIDERS),
        campaignType: z.string().min(1),
        audience: z.string().min(1),
        scheduleAt: z.coerce.date().nullable().optional(),
        status: z.enum(CAMPAIGN_STATUSES).optional(),
      })
      .parse(req.body)
    const campaign = await CampaignService.create(auth.organizationId, auth.userId, body)
    return success(res, campaign, 'Campaign created', 201)
  } catch (error) {
    next(error)
  }
}

export async function updateCampaign(req: Request, res: Response, next: NextFunction) {
  try {
    const auth = requireAuth(req)
    const body = z
      .object({
        campaignName: z.string().min(1).optional(),
        campaignType: z.string().min(1).optional(),
        audience: z.string().min(1).optional(),
        scheduleAt: z.coerce.date().nullable().optional(),
        status: z.enum(CAMPAIGN_STATUSES).optional(),
        statistics: z.record(z.unknown()).optional(),
      })
      .parse(req.body)
    const campaign = await CampaignService.update(
      auth.organizationId,
      parseId(req.params.id),
      auth.userId,
      body,
    )
    return success(res, campaign, 'Campaign updated')
  } catch (error) {
    next(error)
  }
}

export async function pauseCampaign(req: Request, res: Response, next: NextFunction) {
  try {
    const auth = requireAuth(req)
    const campaign = await CampaignService.setStatus(
      auth.organizationId,
      parseId(req.params.id),
      auth.userId,
      'paused',
    )
    return success(res, campaign, 'Campaign paused')
  } catch (error) {
    next(error)
  }
}

export async function resumeCampaign(req: Request, res: Response, next: NextFunction) {
  try {
    const auth = requireAuth(req)
    const campaign = await CampaignService.setStatus(
      auth.organizationId,
      parseId(req.params.id),
      auth.userId,
      'scheduled',
    )
    return success(res, campaign, 'Campaign resumed')
  } catch (error) {
    next(error)
  }
}

export async function deleteCampaign(req: Request, res: Response, next: NextFunction) {
  try {
    const auth = requireAuth(req)
    const result = await CampaignService.remove(
      auth.organizationId,
      parseId(req.params.id),
      auth.userId,
    )
    return success(res, result, 'Campaign deleted')
  } catch (error) {
    next(error)
  }
}

export async function getSettings(req: Request, res: Response, next: NextFunction) {
  try {
    const auth = requireAuth(req)
    const settings = await SettingsService.get(auth.organizationId)
    return success(res, settings)
  } catch (error) {
    next(error)
  }
}

export async function updateSettings(req: Request, res: Response, next: NextFunction) {
  try {
    const auth = requireAuth(req)
    const body = z
      .object({
        enableAiReply: z.boolean().optional(),
        reviewApprovalRequired: z.boolean().optional(),
        emailNotification: z.boolean().optional(),
        notificationEmail: z.string().email().nullable().optional(),
        autoSyncReviews: z.boolean().optional(),
        autoFetchInterval: z.number().int().min(5).max(1440).optional(),
        defaultAiTone: z.enum(AI_TONES).optional(),
        theme: z.enum(['system', 'light', 'dark']).optional(),
      })
      .parse(req.body)
    const settings = await SettingsService.update(auth.organizationId, body)
    return success(res, settings, 'Marketing settings updated')
  } catch (error) {
    next(error)
  }
}

export async function getDashboard(req: Request, res: Response, next: NextFunction) {
  try {
    const auth = requireAuth(req)
    const data = await AnalyticsService.getDashboard(auth.organizationId)
    return success(res, data)
  } catch (error) {
    next(error)
  }
}

export async function getReviewAnalytics(req: Request, res: Response, next: NextFunction) {
  try {
    const auth = requireAuth(req)
    const data = await AnalyticsService.getReviewAnalytics(auth.organizationId)
    return success(res, data)
  } catch (error) {
    next(error)
  }
}

export async function getPostAnalytics(req: Request, res: Response, next: NextFunction) {
  try {
    const auth = requireAuth(req)
    const data = await AnalyticsService.getPostAnalytics(auth.organizationId)
    return success(res, data)
  } catch (error) {
    next(error)
  }
}
