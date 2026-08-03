import { Router } from 'express'
import * as marketingController from '../controllers/marketing.controller'
import { authenticate, requirePermission } from '../middleware/auth'
import { PERMISSIONS } from '../constants/permissions'
import { upload } from '../middleware/upload'

const router = Router()

// OAuth callback must remain public (Google redirects here without JWT)
router.get('/google/callback', marketingController.googleCallback)

router.use(authenticate)

router.get('/dashboard', requirePermission(PERMISSIONS.MARKETING_READ), marketingController.getDashboard)
router.get(
  '/analytics/reviews',
  requirePermission(PERMISSIONS.MARKETING_READ),
  marketingController.getReviewAnalytics,
)
router.get(
  '/analytics/posts',
  requirePermission(PERMISSIONS.MARKETING_READ),
  marketingController.getPostAnalytics,
)

router.get('/google/login', requirePermission(PERMISSIONS.MARKETING_MANAGE), marketingController.googleLogin)
router.post(
  '/google/disconnect',
  requirePermission(PERMISSIONS.MARKETING_MANAGE),
  marketingController.googleDisconnect,
)
router.post(
  '/google/reviews/sync',
  requirePermission(PERMISSIONS.MARKETING_MANAGE),
  marketingController.syncReviews,
)
router.get('/google/reviews', requirePermission(PERMISSIONS.MARKETING_READ), marketingController.listReviews)
router.get(
  '/google/reviews/:id',
  requirePermission(PERMISSIONS.MARKETING_READ),
  marketingController.getReview,
)
router.post(
  '/google/reviews/:id/generate-ai',
  requirePermission(PERMISSIONS.MARKETING_REPLY),
  marketingController.generateAiReply,
)
router.put(
  '/google/reviews/:id',
  requirePermission(PERMISSIONS.MARKETING_REPLY),
  marketingController.updateReviewReply,
)
router.post(
  '/google/reviews/:id/reply',
  requirePermission(PERMISSIONS.MARKETING_REPLY),
  marketingController.postReviewReply,
)

router.post(
  '/content/upload',
  requirePermission(PERMISSIONS.MARKETING_MANAGE),
  upload.single('file'),
  marketingController.uploadContent,
)
router.get('/content', requirePermission(PERMISSIONS.MARKETING_READ), marketingController.listContent)
router.put(
  '/content/:id',
  requirePermission(PERMISSIONS.MARKETING_MANAGE),
  marketingController.updateContent,
)
router.delete(
  '/content/:id',
  requirePermission(PERMISSIONS.MARKETING_MANAGE),
  marketingController.deleteContent,
)
router.post(
  '/content/:id/publish',
  requirePermission(PERMISSIONS.MARKETING_MANAGE),
  marketingController.publishContent,
)
router.post(
  '/content/:id/schedule',
  requirePermission(PERMISSIONS.MARKETING_MANAGE),
  marketingController.scheduleContent,
)

router.get('/campaigns', requirePermission(PERMISSIONS.MARKETING_READ), marketingController.listCampaigns)
router.get(
  '/campaigns/:id',
  requirePermission(PERMISSIONS.MARKETING_READ),
  marketingController.getCampaign,
)
router.post(
  '/campaigns',
  requirePermission(PERMISSIONS.MARKETING_MANAGE),
  marketingController.createCampaign,
)
router.put(
  '/campaigns/:id',
  requirePermission(PERMISSIONS.MARKETING_MANAGE),
  marketingController.updateCampaign,
)
router.post(
  '/campaigns/:id/pause',
  requirePermission(PERMISSIONS.MARKETING_MANAGE),
  marketingController.pauseCampaign,
)
router.post(
  '/campaigns/:id/resume',
  requirePermission(PERMISSIONS.MARKETING_MANAGE),
  marketingController.resumeCampaign,
)
router.delete(
  '/campaigns/:id',
  requirePermission(PERMISSIONS.MARKETING_MANAGE),
  marketingController.deleteCampaign,
)

router.get('/settings', requirePermission(PERMISSIONS.MARKETING_READ), marketingController.getSettings)
router.put(
  '/settings',
  requirePermission(PERMISSIONS.MARKETING_MANAGE),
  marketingController.updateSettings,
)

export default router
