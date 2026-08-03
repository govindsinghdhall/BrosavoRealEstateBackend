import cron from 'node-cron'
import { ReviewSyncService } from '../services/marketing/review.service'
import { ContentService } from '../services/marketing/content.service'
import { GoogleOAuthService } from '../services/marketing/googleOAuth.service'
import { MarketingActivityLog } from '../models/MarketingActivityLog'

export function startMarketingCronJobs() {
  // Sync Google reviews every 30 minutes
  cron.schedule('*/30 * * * *', async () => {
    try {
      const results = await ReviewSyncService.syncAllConnectedOrgs()
      if (results.length) {
        console.log(`[cron] Review sync complete for ${results.length} org(s)`)
      }
    } catch (error) {
      console.error('[cron] Review sync failed', error)
    }
  })

  // Publish scheduled content every 15 minutes
  cron.schedule('*/15 * * * *', async () => {
    try {
      const result = await ContentService.publishDueContent()
      if (result.published > 0) {
        console.log(`[cron] Published ${result.published}/${result.scanned} scheduled content items`)
      }
    } catch (error) {
      console.error('[cron] Content scheduler failed', error)
    }
  })

  // Refresh expiring Google tokens every 12 hours
  cron.schedule('0 */12 * * *', async () => {
    try {
      await GoogleOAuthService.refreshExpiringTokens()
      console.log('[cron] Token refresh pass complete')
    } catch (error) {
      console.error('[cron] Token refresh failed', error)
    }
  })

  // Cleanup activity logs older than 90 days — weekly
  cron.schedule('0 3 * * 0', async () => {
    try {
      const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)
      const result = await MarketingActivityLog.deleteMany({ createdAt: { $lt: cutoff } })
      console.log(`[cron] Cleaned ${result.deletedCount} old marketing activity logs`)
    } catch (error) {
      console.error('[cron] Activity cleanup failed', error)
    }
  })

  console.log('Marketing cron jobs scheduled')
}
