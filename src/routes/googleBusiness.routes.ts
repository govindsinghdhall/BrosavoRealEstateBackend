/**
 * Google Business Profile SaaS API aliases.
 * Maps spec paths (/google-business/*) to the marketing module handlers.
 */
import { Router } from 'express'
import * as marketingController from '../controllers/marketing.controller'
import { authenticate, requirePermission } from '../middleware/auth'
import { PERMISSIONS } from '../constants/permissions'
import { upload } from '../middleware/upload'

const router = Router()

router.get('/google/callback', marketingController.googleCallback)

router.use(authenticate)

router.get('/status', requirePermission(PERMISSIONS.MARKETING_READ), marketingController.getGoogleStatus)
router.get('/locations', requirePermission(PERMISSIONS.MARKETING_READ), marketingController.listLocations)
router.post(
  '/locations/sync',
  requirePermission(PERMISSIONS.MARKETING_MANAGE),
  marketingController.syncLocations,
)
router.post(
  '/locations/select',
  requirePermission(PERMISSIONS.MARKETING_MANAGE),
  marketingController.selectLocations,
)

router.get('/posts', requirePermission(PERMISSIONS.MARKETING_READ), marketingController.listContent)
router.post(
  '/posts/upload',
  requirePermission(PERMISSIONS.MARKETING_MANAGE),
  upload.single('file'),
  marketingController.uploadContent,
)
router.put('/posts/:id', requirePermission(PERMISSIONS.MARKETING_MANAGE), marketingController.updateContent)
router.delete('/posts/:id', requirePermission(PERMISSIONS.MARKETING_MANAGE), marketingController.deleteContent)
router.post('/posts/:id/publish', requirePermission(PERMISSIONS.MARKETING_MANAGE), marketingController.publishContent)
router.post('/posts/:id/schedule', requirePermission(PERMISSIONS.MARKETING_MANAGE), marketingController.scheduleContent)
router.post('/posts/:id/cancel', requirePermission(PERMISSIONS.MARKETING_MANAGE), marketingController.cancelContent)
router.post('/posts/:id/duplicate', requirePermission(PERMISSIONS.MARKETING_MANAGE), marketingController.duplicateContent)
router.post('/posts/generate-ai', requirePermission(PERMISSIONS.MARKETING_MANAGE), marketingController.generatePostAi)

router.get('/reviews', requirePermission(PERMISSIONS.MARKETING_READ), marketingController.listReviews)
router.get('/reviews/:id', requirePermission(PERMISSIONS.MARKETING_READ), marketingController.getReview)
router.post('/reviews/sync', requirePermission(PERMISSIONS.MARKETING_MANAGE), marketingController.syncReviews)
router.post(
  '/reviews/:id/generate-reply',
  requirePermission(PERMISSIONS.MARKETING_REPLY),
  marketingController.generateAiReply,
)
router.put('/reviews/:id', requirePermission(PERMISSIONS.MARKETING_REPLY), marketingController.updateReviewReply)
router.post('/reviews/:id/reply', requirePermission(PERMISSIONS.MARKETING_REPLY), marketingController.postReviewReply)

router.get('/automation', requirePermission(PERMISSIONS.MARKETING_READ), marketingController.getAutomation)
router.put('/automation', requirePermission(PERMISSIONS.MARKETING_MANAGE), marketingController.updateAutomation)

router.get('/usage', requirePermission(PERMISSIONS.MARKETING_READ), marketingController.getUsage)
router.get('/dashboard', requirePermission(PERMISSIONS.MARKETING_READ), marketingController.getDashboard)
router.get('/analytics/reviews', requirePermission(PERMISSIONS.MARKETING_READ), marketingController.getReviewAnalytics)
router.get('/analytics/posts', requirePermission(PERMISSIONS.MARKETING_READ), marketingController.getPostAnalytics)

router.get('/settings', requirePermission(PERMISSIONS.MARKETING_READ), marketingController.getSettings)
router.put('/settings', requirePermission(PERMISSIONS.MARKETING_MANAGE), marketingController.updateSettings)

router.get('/activity-logs', requirePermission(PERMISSIONS.MARKETING_READ), marketingController.listActivityLogs)
router.get('/connect', requirePermission(PERMISSIONS.MARKETING_MANAGE), marketingController.googleLogin)
router.post('/disconnect', requirePermission(PERMISSIONS.MARKETING_MANAGE), marketingController.googleDisconnect)

export default router
