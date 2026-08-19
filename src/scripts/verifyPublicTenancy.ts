/**
 * Live two-org public tenancy check. Requires MONGODB_URI.
 * Creates isolated orgs prefixed with public-tenancy-test- and deletes them after.
 *
 *   npx tsx src/scripts/verifyPublicTenancy.ts
 */
import { config } from 'dotenv'
import { createApp } from '../app'
import { connectDatabase, disconnectDatabase } from '../config/database'
import { Organization } from '../models/Organization'
import { Property } from '../models/Property'
import { Role } from '../models/Role'
import { User } from '../models/User'
import { Lead } from '../models/Lead'
import { LeadSource } from '../models/LeadSource'
import { seedOrganizationDefaults } from '../services/organization.service'
import { generateWebsiteApiKey } from '../utils/websiteApiKey'
import { hashPassword } from '../utils/password'

config()

async function request(
  app: ReturnType<typeof createApp>,
  method: 'GET' | 'POST',
  path: string,
  options?: { key?: string; body?: unknown },
): Promise<{ status: number; body: Record<string, unknown> }> {
  const http = await import('node:http')
  const server = app.listen(0)
  const address = server.address()
  if (!address || typeof address === 'string') {
    server.close()
    throw new Error('Failed to bind test server')
  }

  try {
    const result = await new Promise<{ status: number; body: Record<string, unknown> }>(
      (resolve, reject) => {
        const payload = options?.body ? JSON.stringify(options.body) : undefined
        const req = http.request(
          {
            hostname: '127.0.0.1',
            port: address.port,
            path: `/api/v1${path}`,
            method,
            headers: {
              'content-type': 'application/json',
              ...(options?.key ? { 'x-website-api-key': options.key } : {}),
              ...(payload ? { 'content-length': Buffer.byteLength(payload) } : {}),
            },
          },
          (res) => {
            const chunks: Buffer[] = []
            res.on('data', (chunk) => chunks.push(chunk as Buffer))
            res.on('end', () => {
              const raw = Buffer.concat(chunks).toString('utf8')
              let parsed: Record<string, unknown> = {}
              try {
                parsed = raw ? (JSON.parse(raw) as Record<string, unknown>) : {}
              } catch {
                parsed = { raw }
              }
              resolve({ status: res.statusCode ?? 0, body: parsed })
            })
          },
        )
        req.on('error', reject)
        if (payload) req.write(payload)
        req.end()
      },
    )
    return result
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()))
    })
  }
}

async function run() {
  await connectDatabase()
  const stamp = Date.now()
  const keyA = generateWebsiteApiKey()
  const keyB = generateWebsiteApiKey()

  const orgA = await Organization.create({
    name: `Public Tenancy A ${stamp}`,
    slug: `public-tenancy-a-${stamp}`,
    email: `tenancy-a-${stamp}@example.com`,
    settings: { websiteApiKey: keyA },
  })
  const orgB = await Organization.create({
    name: `Public Tenancy B ${stamp}`,
    slug: `public-tenancy-b-${stamp}`,
    email: `tenancy-b-${stamp}@example.com`,
    settings: { websiteApiKey: keyB },
  })

  await seedOrganizationDefaults(orgA._id)
  await seedOrganizationDefaults(orgB._id)

  const adminRoleA = await Role.findOne({ organizationId: orgA._id, name: 'admin' })
  if (adminRoleA) {
    await User.create({
      organizationId: orgA._id,
      roleId: adminRoleA._id,
      email: `admin-a-${stamp}@example.com`,
      passwordHash: await hashPassword('TenancyTest@123'),
      firstName: 'Admin',
      lastName: 'A',
      isActive: true,
    })
  }

  const a1 = await Property.create({
    organizationId: orgA._id,
    title: 'A1',
    type: 'APARTMENT',
    price: 100,
    area: 100,
    address: 'A',
    city: 'Gurugram',
    state: 'HR',
    locality: 'A',
    isActive: true,
  })
  await Property.create({
    organizationId: orgA._id,
    title: 'A2',
    type: 'APARTMENT',
    price: 200,
    area: 200,
    address: 'A',
    city: 'Gurugram',
    state: 'HR',
    locality: 'A',
    isActive: true,
  })
  const b1 = await Property.create({
    organizationId: orgB._id,
    title: 'B1',
    type: 'VILLA',
    price: 300,
    area: 300,
    address: 'B',
    city: 'Delhi',
    state: 'DL',
    locality: 'B',
    isActive: true,
  })
  await Property.create({
    organizationId: orgB._id,
    title: 'B2',
    type: 'VILLA',
    price: 400,
    area: 400,
    address: 'B',
    city: 'Delhi',
    state: 'DL',
    locality: 'B',
    isActive: true,
  })

  const app = createApp()
  const failures: string[] = []

  const expect = (label: string, ok: boolean) => {
    if (!ok) failures.push(label)
    console.log(`${ok ? 'PASS' : 'FAIL'} ${label}`)
  }

  const titles = (body: Record<string, unknown>) =>
    Array.isArray(body.data)
      ? (body.data as { title?: string }[]).map((row) => row.title).sort()
      : []

  try {
    const bothA = await request(app, 'GET', `/public/properties?organizationId=${orgA._id}&limit=100`, {
      key: keyA,
    })
    expect('KEY_A + ORG_A lists A1,A2', bothA.status === 200 && titles(bothA.body).join() === 'A1,A2')

    const bothB = await request(app, 'GET', `/public/properties?organizationId=${orgB._id}&limit=100`, {
      key: keyB,
    })
    expect('KEY_B + ORG_B lists B1,B2', bothB.status === 200 && titles(bothB.body).join() === 'B1,B2')

    const conflict = await request(app, 'GET', `/public/properties?organizationId=${orgB._id}`, {
      key: keyA,
    })
    expect('KEY_A + ORG_B is 403', conflict.status === 403)

    const conflict2 = await request(app, 'GET', `/public/properties?organizationId=${orgA._id}`, {
      key: keyB,
    })
    expect('KEY_B + ORG_A is 403', conflict2.status === 403)

    const orgOnlyA = await request(app, 'GET', `/public/properties?organizationId=${orgA._id}&limit=100`)
    expect('ORG_A only lists A1,A2', orgOnlyA.status === 200 && titles(orgOnlyA.body).join() === 'A1,A2')

    const orgOnlyB = await request(app, 'GET', `/public/properties?organizationId=${orgB._id}&limit=100`)
    expect('ORG_B only lists B1,B2', orgOnlyB.status === 200 && titles(orgOnlyB.body).join() === 'B1,B2')

    const keyOnlyA = await request(app, 'GET', '/public/properties?limit=100', { key: keyA })
    expect('KEY_A only lists A1,A2', keyOnlyA.status === 200 && titles(keyOnlyA.body).join() === 'A1,A2')

    const neither = await request(app, 'GET', '/public/properties')
    expect('neither is 400', neither.status === 400)

    const crossDetail = await request(
      app,
      'GET',
      `/public/properties/${a1._id}?organizationId=${orgB._id}`,
      { key: keyB },
    )
    expect('cross-tenant property detail is 404', crossDetail.status === 404)

    const statsA = await request(app, 'GET', `/public/stats?organizationId=${orgA._id}`, { key: keyA })
    const statsData = statsA.body.data as { totalProperties?: number } | undefined
    expect('stats are tenant-scoped', statsA.status === 200 && statsData?.totalProperties === 2)

    const buildersB = await request(app, 'GET', `/public/builders?organizationId=${orgB._id}`, {
      key: keyB,
    })
    expect('builders tenant-scoped', buildersB.status === 200)

    const inquiryNoKey = await request(
      app,
      'POST',
      `/public/inquiries?organizationId=${orgA._id}`,
      { body: { firstName: 'Test', lastName: 'User', phone: '9999999999' } },
    )
    expect('inquiry without key is 401', inquiryNoKey.status === 401)

    const inquiryCross = await request(app, 'POST', `/public/inquiries?organizationId=${orgB._id}`, {
      key: keyB,
      body: {
        firstName: 'Test',
        lastName: 'User',
        phone: '9999999999',
        propertyId: String(a1._id),
      },
    })
    expect('inquiry with other org property is 404', inquiryCross.status === 404)

    const inquiryOk = await request(app, 'POST', `/public/inquiries?organizationId=${orgA._id}`, {
      key: keyA,
      body: {
        firstName: 'Test',
        lastName: 'User',
        phone: '9999999999',
        propertyId: String(a1._id),
      },
    })
    expect('inquiry KEY_A + ORG_A succeeds', inquiryOk.status === 201)
  } finally {
    await Lead.deleteMany({ organizationId: { $in: [orgA._id, orgB._id] } })
    await Property.deleteMany({ organizationId: { $in: [orgA._id, orgB._id] } })
    await User.deleteMany({ organizationId: { $in: [orgA._id, orgB._id] } })
    await Role.deleteMany({ organizationId: { $in: [orgA._id, orgB._id] } })
    await LeadSource.deleteMany({ organizationId: { $in: [orgA._id, orgB._id] } })
    await Organization.deleteMany({ _id: { $in: [orgA._id, orgB._id] } })
    await disconnectDatabase()
  }

  if (failures.length) {
    throw new Error(`Tenancy checks failed:\n${failures.join('\n')}`)
  }

  console.log('All public tenancy checks passed')
  void b1
}

run().catch((error) => {
  console.error(error)
  process.exit(1)
})
