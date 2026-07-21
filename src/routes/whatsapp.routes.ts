import { Router } from 'express'
import * as whatsappController from '../controllers/whatsapp.controller'
import { authenticate, requirePermission } from '../middleware/auth'
import { PERMISSIONS } from '../constants/permissions'

const router = Router()
router.use(authenticate)

router.get('/settings', requirePermission(PERMISSIONS.ORGANIZATION_READ), whatsappController.getWhatsAppSettings)
router.patch('/settings', requirePermission(PERMISSIONS.ORGANIZATION_UPDATE), whatsappController.updateWhatsAppSettings)
router.get('/templates', requirePermission(PERMISSIONS.ORGANIZATION_READ), whatsappController.listWhatsAppTemplates)
router.post('/templates', requirePermission(PERMISSIONS.ORGANIZATION_UPDATE), whatsappController.createWhatsAppTemplateController)
router.put('/templates/:id', requirePermission(PERMISSIONS.ORGANIZATION_UPDATE), whatsappController.updateWhatsAppTemplateController)
router.delete('/templates/:id', requirePermission(PERMISSIONS.ORGANIZATION_UPDATE), whatsappController.deleteWhatsAppTemplateController)
router.post('/send', requirePermission(PERMISSIONS.ORGANIZATION_UPDATE), whatsappController.sendWhatsAppMessage)

export default router
