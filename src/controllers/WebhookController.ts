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
   * GET /api/v1/webhooks/whatsapp/:organizationId
   *
   * Important:
   * Meta webhook verification does NOT require a WhatsAppAccount
   * to already exist in the database.
   *
   * The WhatsAppAccount will be created later during
   * WhatsApp onboarding / Embedded Signup.
   */
  async verifyWebhook(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const { organizationId } = req.params
      const numericOrganizationId = Number(organizationId)

      if (
        !organizationId ||
        !Number.isInteger(numericOrganizationId) ||
        numericOrganizationId <= 0
      ) {
        return res.status(400).send('Invalid organization ID')
      }

      const mode = req.query['hub.mode'] as string
      const token = req.query['hub.verify_token'] as string
      const challenge = req.query['hub.challenge'] as string

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

      if (
        mode !== 'subscribe' ||
        token !== verifyToken ||
        !challenge
      ) {
        logger.warn(
          `WhatsApp webhook verification failed for organization ${numericOrganizationId}`,
        )

        return res
          .status(403)
          .send('Verification failed')
      }

      logger.info(
        `WhatsApp webhook verified for organization ${numericOrganizationId}`,
      )

      return res.status(200).send(challenge)
    } catch (error) {
      next(error)
    }
  }

  /**
   * Receive WhatsApp webhook events from Meta.
   *
   * URL:
   * POST /api/v1/webhooks/whatsapp/:organizationId
   *
   * Security:
   *
   * 1. organizationId comes from the webhook URL.
   * 2. phone_number_id comes from Meta's webhook payload.
   * 3. Both must belong to the same active WhatsAppAccount.
   * 4. If WABA ID is available, it is also verified.
   */
  async receiveWebhook(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const { organizationId } = req.params
      const numericOrganizationId = Number(organizationId)

      if (
        !organizationId ||
        !Number.isInteger(numericOrganizationId) ||
        numericOrganizationId <= 0
      ) {
        return res.status(400).send('Invalid organization ID')
      }

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
       */

      const value =
        payload?.entry?.[0]?.changes?.[0]?.value

      const phoneNumberId =
        value?.metadata?.phone_number_id

      const wabaId =
        value?.metadata?.business_account_id ||
        value?.metadata?.waba_id

      /*
       * phone_number_id is required for tenant identification.
       */
      if (!phoneNumberId) {
        logger.warn(
          `WhatsApp webhook rejected for organization ${numericOrganizationId}: phone_number_id missing`,
        )

        /*
         * Return 200 so Meta does not repeatedly retry
         * an unusable webhook.
         */
        return res.sendStatus(200)
      }

      /*
       * Find the ACTIVE WhatsApp account belonging to:
       *
       * organizationId from URL
       * +
       * phoneNumberId from Meta
       *
       * This prevents somebody from changing the organization ID
       * in the URL and injecting events into another organization.
       */
      const account =
        await WhatsAppAccount.findOne({
          organizationId: numericOrganizationId,
          phoneNumberId: String(phoneNumberId),
          isConnected: true,
          deletedAt: null,
        }).lean()

      if (!account) {
        logger.warn(
          `WhatsApp webhook rejected: phoneNumberId ${phoneNumberId} does not belong to an active WhatsApp account for organization ${numericOrganizationId}`,
        )

        return res.sendStatus(200)
      }

      /*
       * If Meta provides a WABA/business account ID,
       * verify that it matches the stored WABA ID.
       */
      if (
        wabaId &&
        String(wabaId) !== String(account.wabaId)
      ) {
        logger.warn(
          `WhatsApp webhook rejected: WABA mismatch for organization ${numericOrganizationId}. Received ${wabaId}, expected ${account.wabaId}`,
        )

        return res.sendStatus(200)
      }

      const event =
        payload?.entry?.[0]?.changes?.[0]?.field ||
        'unknown'

      logger.info(
        `WhatsApp webhook received for organization ${numericOrganizationId}, phoneNumberId ${phoneNumberId}, event ${event}`,
      )

      /*
       * Store the webhook before processing it.
       */
      const webhookLog =
        await WhatsAppWebhookLog.create({
          organizationId: numericOrganizationId,
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
          numericOrganizationId,
          payload,
        )

        /*
         * Mark webhook as successfully processed.
         */
        await WhatsAppWebhookLog.updateOne(
          {
            _id: webhookLog._id,
            organizationId: numericOrganizationId,
          },
          {
            processed: true,
            processedAt: new Date(),
            error: null,
          },
        )

        logger.info(
          `WhatsApp webhook processed successfully for organization ${numericOrganizationId}`,
        )
      } catch (error: any) {
        const errorMessage =
          error?.message ||
          'Webhook processing failed'

        logger.error(
          `Error processing WhatsApp webhook for organization ${numericOrganizationId}:`,
          error,
        )

        await WhatsAppWebhookLog.updateOne(
          {
            _id: webhookLog._id,
            organizationId: numericOrganizationId,
          },
          {
            processed: false,
            error: errorMessage,
          },
        )
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
       * Always acknowledge Meta.
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