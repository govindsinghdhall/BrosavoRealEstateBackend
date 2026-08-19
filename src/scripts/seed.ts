import { config } from 'dotenv'
import { connectDatabase, disconnectDatabase } from '../config/database'
import { Organization } from '../models/Organization'
import { Role } from '../models/Role'
import { User } from '../models/User'
import { seedOrganizationDefaults } from '../services/organization.service'
import { hashPassword } from '../utils/password'
import { generateWebsiteApiKey } from '../utils/websiteApiKey'

config()

const DEMO_ORG_NAME = 'Durga Property'
const DEMO_ORG_SLUG = 'durga-property'
const LEGACY_DEMO_SLUG = 'realestate-crm-demo'
const DEMO_EMAIL = 'admin@realestatecrm.com'
const DEMO_PASSWORD = 'Admin@123'

async function migrateLegacyDemoOrganization() {
  const legacyOrg = await Organization.findOne({ slug: LEGACY_DEMO_SLUG })
  if (!legacyOrg) return

  legacyOrg.name = DEMO_ORG_NAME
  legacyOrg.slug = DEMO_ORG_SLUG
  legacyOrg.settings = {
    ...legacyOrg.settings,
    tagline: 'Your real estate business, organized.',
  }
  await legacyOrg.save()
  console.log(`Migrated legacy demo organization to "${DEMO_ORG_NAME}"`)
}

export async function seedDemoOrganization() {
  await migrateLegacyDemoOrganization()

  const existingUser = await User.findOne({ email: DEMO_EMAIL })
  if (existingUser) {
    return
  }

  const existingOrg =
    (await Organization.findOne({ slug: DEMO_ORG_SLUG })) ??
    (await Organization.findOne({ slug: LEGACY_DEMO_SLUG }))
  if (existingOrg) {
    const adminRole = await Role.findOne({ organizationId: existingOrg._id, name: 'admin' })
    if (!adminRole) {
      await seedOrganizationDefaults(existingOrg._id)
    }

    const role =
      adminRole ?? (await Role.findOne({ organizationId: existingOrg._id, name: 'admin' }))
    if (!role) return

    await User.create({
      organizationId: existingOrg._id,
      roleId: role._id,
      email: DEMO_EMAIL,
      passwordHash: await hashPassword(DEMO_PASSWORD),
      firstName: 'Admin',
      lastName: 'User',
      phone: null,
      isActive: true,
      lastLoginAt: new Date(),
    })
    console.log('Demo admin user created')
    return
  }

  const organization = await Organization.create({
    name: DEMO_ORG_NAME,
    slug: DEMO_ORG_SLUG,
    email: DEMO_EMAIL,
    settings: { tagline: 'Your real estate business, organized.', websiteApiKey: generateWebsiteApiKey() },
  })

  await seedOrganizationDefaults(organization._id)

  const adminRole = await Role.findOne({ organizationId: organization._id, name: 'admin' })
  if (!adminRole) return

  await User.create({
    organizationId: organization._id,
    roleId: adminRole._id,
    email: DEMO_EMAIL,
    passwordHash: await hashPassword(DEMO_PASSWORD),
    firstName: 'Admin',
    lastName: 'User',
    phone: null,
    isActive: true,
    lastLoginAt: new Date(),
  })

  console.log('Demo organization seeded:', DEMO_EMAIL)
}

async function runSeed() {
  await connectDatabase()
  await seedDemoOrganization()
  await disconnectDatabase()
}

if (require.main === module) {
  runSeed()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error)
      process.exit(1)
    })
}
