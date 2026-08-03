import { Router } from 'express'
import authRoutes from './auth.routes'
import usersRoutes from './users.routes'
import rolesRoutes from './roles.routes'
import organizationsRoutes from './organizations.routes'
import whatsappRoutes from './whatsapp.routes'
import propertiesRoutes from './properties.routes'
import leadsRoutes from './leads.routes'
import contactsRoutes from './contacts.routes'
import siteVisitsRoutes from './siteVisits.routes'
import bookingsRoutes from './bookings.routes'
import leadSourcesRoutes from './leadSources.routes'
import propertyLookupsRoutes from './propertyLookups.routes'
import reportsRoutes from './reports.routes'
import publicRoutes from './public.routes'
import marketingRoutes from './marketing.routes'

const router = Router()

router.get('/health', (_req, res) => {
  res.json({ success: true, message: 'RealEstate API is running' })
})

router.use('/auth', authRoutes)
router.use('/users', usersRoutes)
router.use('/roles', rolesRoutes)
router.use('/organizations', organizationsRoutes)
router.use('/whatsapp', whatsappRoutes)
router.use('/properties', propertiesRoutes)
router.use('/leads', leadsRoutes)
router.use('/contacts', contactsRoutes)
router.use('/site-visits', siteVisitsRoutes)
router.use('/bookings', bookingsRoutes)
router.use('/lead-sources', leadSourcesRoutes)
router.use('/property-lookups', propertyLookupsRoutes)
router.use('/reports', reportsRoutes)
router.use('/marketing', marketingRoutes)
router.use('/public', publicRoutes)

export default router
