import { Router } from 'express'
import authRoutes from './auth.routes'
import organizationsRoutes from './organizations.routes'
import usersRoutes from './users.routes'
import rolesRoutes from './roles.routes'
import leadsRoutes from './leads.routes'
import contactsRoutes from './contacts.routes'
import propertiesRoutes from './properties.routes'
import propertyLookupsRoutes from './propertyLookups.routes'
import leadSourcesRoutes from './leadSources.routes'
import siteVisitsRoutes from './siteVisits.routes'
import bookingsRoutes from './bookings.routes'
import reportsRoutes from './reports.routes'
import whatsappRoutes from './whatsapp.routes'
import marketingRoutes from './marketing.routes'
import publicRoutes from './public.routes'

const router = Router()

// Health check
router.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV,
  })
})

// Auth routes
router.use('/auth', authRoutes)

// Organization routes
router.use('/organizations', organizationsRoutes)

// User routes
router.use('/users', usersRoutes)

// Role routes
router.use('/roles', rolesRoutes)

// CRM routes
router.use('/leads', leadsRoutes)
router.use('/contacts', contactsRoutes)
router.use('/properties', propertiesRoutes)
router.use('/property-lookups', propertyLookupsRoutes)
router.use('/lead-sources', leadSourcesRoutes)
router.use('/site-visits', siteVisitsRoutes)
router.use('/bookings', bookingsRoutes)
router.use('/reports', reportsRoutes)

// WhatsApp routes (includes /webhooks and /whatsapp)
router.use(whatsappRoutes)

// Marketing routes
router.use('/marketing', marketingRoutes)

// Public routes
router.use('/public', publicRoutes)

console.log('✅ All routes registered successfully')

export default router