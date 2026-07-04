import { Router } from 'express'
import * as propertiesController from '../controllers/properties.controller'
import { authenticate, requirePermission } from '../middleware/auth'
import { PERMISSIONS } from '../constants/permissions'

const router = Router()

router.use(authenticate)

router.get(
  '/inventory',
  requirePermission(PERMISSIONS.PROPERTIES_READ),
  propertiesController.getPropertyInventory,
)
router.get(
  '/owners',
  requirePermission(PERMISSIONS.PROPERTIES_READ),
  propertiesController.listPropertyOwners,
)
router.get('/', requirePermission(PERMISSIONS.PROPERTIES_READ), propertiesController.listOrganizationProperties)
router.post(
  '/',
  requirePermission(PERMISSIONS.PROPERTIES_CREATE),
  propertiesController.createOrganizationProperty,
)
router.post(
  '/:id/images/batch',
  requirePermission(PERMISSIONS.PROPERTIES_UPDATE),
  propertiesController.uploadPropertyImagesBatch,
)
router.get(
  '/:id',
  requirePermission(PERMISSIONS.PROPERTIES_READ),
  propertiesController.getOrganizationProperty,
)
router.put(
  '/:id',
  requirePermission(PERMISSIONS.PROPERTIES_UPDATE),
  propertiesController.updateOrganizationProperty,
)
router.delete(
  '/:id',
  requirePermission(PERMISSIONS.PROPERTIES_DELETE),
  propertiesController.deleteOrganizationProperty,
)

export default router
