import cron from 'node-cron'
import { logger } from '../utils/logger'
import { WhatsAppService } from '../services/WhatsAppService'
import {
  WhatsAppAccount,
  WhatsAppCampaign,
} from '../models'

const whatsappService =
  WhatsAppService.getInstance()

let cronStarted = false

/**
 * Start all WhatsApp background jobs.
 *
 * Jobs:
 * 1. Sync approved/pending Meta templates every 6 hours.
 * 2. Process scheduled/queued campaigns every minute.
 *
 * Token refresh is intentionally not scheduled yet because
 * the current WhatsAppService does not implement a safe Meta
 * token-refresh flow. Do not fake-refresh or overwrite tokens.
 */
export function startWhatsAppCronJobs(): void {
  if (cronStarted) {
    logger.warn(
      'WhatsApp cron jobs are already running',
    )

    return
  }

  cronStarted = true

  // ============================================================
  // META TEMPLATE SYNC
  // Every 6 hours
  // ============================================================

  cron.schedule(
    '0 */6 * * *',
    async () => {
      logger.info(
        'Running WhatsApp template sync cron job',
      )

      try {
        const accounts =
          await WhatsAppAccount.find({
            isConnected: true,
            deletedAt: null,
          }).select(
            'organizationId',
          )

        /*
         * Multiple WhatsAppAccount records can theoretically
         * exist for an organization, so de-duplicate org IDs.
         */
        const organizationIds =
          Array.from(
            new Set(
              accounts.map(
                (account) =>
                  account.organizationId,
              ),
            ),
          )

        for (const organizationId of organizationIds) {
          try {
            await whatsappService.syncMetaTemplates(
              organizationId,
            )

            logger.info(
              `WhatsApp templates synced for organization ${organizationId}`,
            )
          } catch (error: any) {
            logger.error(
              `Failed to sync WhatsApp templates for organization ${organizationId}:`,
              error?.response?.data ||
                error?.message ||
                error,
            )
          }
        }
      } catch (error: any) {
        logger.error(
          'Error in WhatsApp template sync cron job:',
          error?.message || error,
        )
      }
    },
    {
      timezone:
        process.env.CRON_TIMEZONE ||
        'Asia/Kolkata',
    },
  )

  // ============================================================
  // CAMPAIGN PROCESSOR
  // Every minute
  // ============================================================

  cron.schedule(
    '* * * * *',
    async () => {
      logger.info(
        'Running WhatsApp campaign processor cron job',
      )

      try {
        const now = new Date()

        /*
         * Only queued campaigns are selected here.
         *
         * executeCampaign() atomically changes queued/draft
         * to running, so if multiple application instances
         * execute this cron simultaneously, only one instance
         * should claim a given campaign.
         */
        const campaigns =
          await WhatsAppCampaign.find({
            status: 'queued',
            scheduledAt: {
              $lte: now,
            },
            deletedAt: null,
          })
            .select('_id organizationId')
            .sort({
              scheduledAt: 1,
              _id: 1,
            })
            .limit(20)
            .lean()

        if (!campaigns.length) {
          return
        }

        logger.info(
          `Found ${campaigns.length} WhatsApp campaign(s) ready to process`,
        )

        /*
         * Execute sequentially so one Node process does not
         * start too many Meta API requests simultaneously.
         *
         * Each campaign itself sends recipients in batches.
         */
        for (const campaign of campaigns) {
          try {
            await whatsappService.executeCampaign(
              campaign._id,
            )

            logger.info(
              `WhatsApp campaign ${campaign._id} processing completed`,
            )
          } catch (error: any) {
            /*
             * executeCampaign() already marks a claimed campaign
             * as failed when an unrecoverable campaign-level error
             * occurs.
             *
             * This update is a safety fallback.
             */
            await WhatsAppCampaign.updateOne(
              {
                _id: campaign._id,
                organizationId:
                  campaign.organizationId,
                status: {
                  $in: [
                    'queued',
                    'running',
                  ],
                },
              },
              {
                status: 'failed',
              },
            )

            logger.error(
              `Failed to process WhatsApp campaign ${campaign._id}:`,
              error?.response?.data ||
                error?.message ||
                error,
            )
          }
        }
      } catch (error: any) {
        logger.error(
          'Error in WhatsApp campaign processor cron job:',
          error?.message || error,
        )
      }
    },
    {
      timezone:
        process.env.CRON_TIMEZONE ||
        'Asia/Kolkata',
    },
  )

  logger.info(
    'WhatsApp cron jobs started successfully',
  )
}
