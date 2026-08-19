import { Router } from 'express'
import {
  createPublicInquiry,
  getPublicSiteProperty,
  getPublicSiteStats,
  listPublicSiteBuilders,
  listPublicSiteProperties,
} from '../controllers/public.controller'
import {
  requirePublicWebsiteInquiryTenant,
  requirePublicWebsiteReadTenant,
} from '../middleware/publicWebsiteTenant'

const router = Router()

router.get('/properties', requirePublicWebsiteReadTenant, listPublicSiteProperties)
router.get('/properties/:id', requirePublicWebsiteReadTenant, getPublicSiteProperty)
router.get('/builders', requirePublicWebsiteReadTenant, listPublicSiteBuilders)
router.get('/stats', requirePublicWebsiteReadTenant, getPublicSiteStats)
router.post('/inquiries', requirePublicWebsiteInquiryTenant, createPublicInquiry)

export default router
