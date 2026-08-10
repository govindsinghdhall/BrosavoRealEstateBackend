import { createApp } from './app'
import { connectDatabase } from './config/database'
import { logCorsConfig } from './config/cors'
import { env } from './config/env'
import { startMarketingCronJobs } from './cron/marketing.cron'
import { startWhatsAppCronJobs } from './cron/whatsapp.cron'
import { seedDemoOrganization } from './scripts/seed'
import { syncDefaultRolePermissions } from './scripts/syncRolePermissions'

async function bootstrap() {
  logCorsConfig()

  await connectDatabase()
  await seedDemoOrganization()
  await syncDefaultRolePermissions()

  const app = createApp()

  startMarketingCronJobs()
  startWhatsAppCronJobs()

  app.listen(env.PORT, () => {
    console.log(`RealEstate API listening on http://localhost:${env.PORT}`)
    console.log(`Health check: http://localhost:${env.PORT}/api/v1/health`)
  })
}

bootstrap().catch((error) => {
  console.error('Failed to start server:', error)
  process.exit(1)
})