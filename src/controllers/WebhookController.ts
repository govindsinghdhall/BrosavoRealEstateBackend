import { Request, Response, NextFunction } from 'express'
import { success } from '../utils/response'
import { logger } from '../utils/logger'
import {
  WhatsAppWebhookLog,
  WhatsAppAccount,
} from '../models'
import { WhatsAppService } from '../services/WhatsAppService'

const whatsappService = WhatsAppService.getInstance()

export class WebhookController {
  /**
   * Verify WhatsApp webhook with Meta.
   *
   * URL:
   * GET /api/v1/webhooks/whatsapp
   *
   * Meta sends:
   *
   * hub.mode
   * hub.verify_token
   * hub.challenge
   *
   * We must:
   * 1. Verify hub.mode === "subscribe"
   * 2. Verify hub.verify_token matches our environment variable
   * 3. Return hub.challenge as plain text with HTTP 200
   *
   * IMPORTANT:
   * This endpoint is PUBLIC.
   * It must NOT use req.auth.
   * It must NOT require organizationId.
   */
  async verifyWebhook(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const mode = req.query['hub.mode']
      const token = req.query['hub.verify_token']
      const challenge = req.query['hub.challenge']

      const verifyToken =
        process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN

      if (!verifyToken) {
        logger.error(
          'WHATSAPP_WEBHOOK_VERIFY_TOKEN is not configured',
        )

        return res
          .status(500)
          .send('Webhook verification token is not configured')
      }

      logger.info(
        'Meta WhatsApp webhook verification request received',
      )

      if (
        mode !== 'subscribe' ||
        token !== verifyToken ||
        !challenge
      ) {
        logger.warn(
          'Meta WhatsApp webhook verification failed',
        )

        return res
          .status(403)
          .send('Verification failed')
      }

      logger.info(
        'Meta WhatsApp webhook verified successfully',
      )

      /*
       * CRITICAL:
       * Meta expects the raw challenge value.
       *
       * DO NOT return JSON.
       * DO NOT use the success() helper.
       */
      return res
        .status(200)
        .send(String(challenge))
    } catch (error) {
      logger.error(
        'Error verifying WhatsApp webhook:',
        error,
      )

      next(error)
    }
  }

  /**
   * Receive WhatsApp webhook events from Meta.
   *
   * URL:
   * POST /api/v1/webhooks/whatsapp
   *
   * IMPORTANT:
   * There is intentionally NO organizationId in the URL.
   *
   * The organization is resolved using the
   * phone_number_id contained in Meta's payload.
   */
  async receiveWebhook(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const payload = req.body
      const headers = req.headers

      /*
       * Meta webhook payload:
       *
       * entry[0]
       *   changes[0]
       *     value
       *       metadata
       *         phone_number_id
       *         display_phone_number
       *         business_account_id
       */

      const entries = payload?.entry || []

      if (!Array.isArray(entries) || entries.length === 0) {
        logger.warn(
          'WhatsApp webhook received with no entries',
        )

        return res.sendStatus(200)
      }

      /*
       * A single webhook request can potentially contain
       * multiple entries/changes.
       *
       * We process each change separately so that the
       * correct organization can be resolved from the
       * phone_number_id.
       */
      for (const entry of entries) {
        const changes = entry?.changes || []

        if (!Array.isArray(changes)) {
          continue
        }

        for (const change of changes) {
          const value = change?.value

          if (!value) {
            continue
          }

          const phoneNumberId =
            value?.metadata?.phone_number_id

          const wabaId =
            value?.metadata?.business_account_id ||
            value?.metadata?.waba_id

          /*
           * phone_number_id is the key we use to identify
           * the connected BROSAVO organization.
           */
          if (!phoneNumberId) {
            logger.warn(
              'WhatsApp webhook event missing phone_number_id',
            )

            continue
          }

          /*
           * Find the active WhatsApp account associated
           * with this Meta phone number.
           */
          const account =
            await WhatsAppAccount.findOne({
              phoneNumberId: String(phoneNumberId),
              isConnected: true,
              deletedAt: null,
            }).lean()

          if (!account) {
            logger.warn(
              `WhatsApp webhook received for unknown phoneNumberId ${phoneNumberId}`,
            )

            continue
          }

          /*
           * If Meta provides the WABA ID, verify that it
           * matches the account stored in BROSAVO.
           */
          if (
            wabaId &&
            String(wabaId) !== String(account.wabaId)
          ) {
            logger.warn(
              `WhatsApp webhook WABA mismatch for phoneNumberId ${phoneNumberId}. Received ${wabaId}, expected ${account.wabaId}`,
            )

            continue
          }

          const organizationId =
            account.organizationId

          const event =
            change?.field || 'unknown'

          logger.info(
            `WhatsApp webhook received for organization ${organizationId}, phoneNumberId ${phoneNumberId}, event ${event}`,
          )

          /*
           * Store the webhook before processing it.
           */
          const webhookLog =
            await WhatsAppWebhookLog.create({
              organizationId,
              event,
              payload,
              headers,
              processed: false,
            })

          try {
            /*
             * Process the verified webhook.
             */
            await whatsappService.processWebhook(
              organizationId,
              {
                entry: [
                  {
                    ...entry,
                    changes: [change],
                  },
                ],
              },
            )

            /*
             * Mark webhook as successfully processed.
             */
            await WhatsAppWebhookLog.updateOne(
              {
                _id: webhookLog._id,
                organizationId,
              },
              {
                processed: true,
                processedAt: new Date(),
                error: null,
              },
            )

            logger.info(
              `WhatsApp webhook processed successfully for organization ${organizationId}`,
            )
          } catch (error: any) {
            const errorMessage =
              error?.message ||
              'Webhook processing failed'

            logger.error(
              `Error processing WhatsApp webhook for organization ${organizationId}:`,
              error,
            )

            await WhatsAppWebhookLog.updateOne(
              {
                _id: webhookLog._id,
                organizationId,
              },
              {
                processed: false,
                error: errorMessage,
              },
            )
          }
        }
      }

      /*
       * Meta expects HTTP 200.
       */
      return res.sendStatus(200)
    } catch (error) {
      logger.error(
        'Error receiving WhatsApp webhook:',
        error,
      )

      /*
       * Always acknowledge Meta so it does not
       * repeatedly retry the request.
       */
      return res.sendStatus(200)
    }
  }

  /**
   * Get webhook logs.
   *
   * Protected CRM endpoint.
   *
   * GET:
   * /api/v1/whatsapp/webhook-logs
   */
  async getWebhookLogs(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const { organizationId } = req.auth!

      const {
        limit = 50,
        processed,
      } = req.query

      const query: any = {
        organizationId,
      }

      if (processed !== undefined) {
        query.processed =
          processed === 'true'
      }

      const parsedLimit = Math.min(
        100,
        Math.max(
          1,
          Number(limit) || 50,
        ),
      )

      const logs =
        await WhatsAppWebhookLog.find(query)
          .sort({
            createdAt: -1,
          })
          .limit(parsedLimit)
          .lean()

      return success(
        res,
        logs,
        'Webhook logs retrieved successfully',
      )
    } catch (error) {
      next(error)
    }
  }
}

export default WebhookController