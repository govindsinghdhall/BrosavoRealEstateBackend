import { Request, Response, NextFunction } from 'express'
import { success } from '../utils/response'
import { logger } from '../utils/logger'
import {
  WhatsAppAccount,
  WhatsAppWebhookLog,
} from '../models'
import { WhatsAppService } from '../services/WhatsAppService'

const whatsappService =
  WhatsAppService.getInstance()

export class WebhookController {
  /**
   * Verify webhook (called by Meta)
   *
   * Meta sends:
   * ?hub.mode=subscribe
   * &hub.verify_token=...
   * &hub.challenge=...
   */
  async verifyWebhook(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const mode =
        req.query['hub.mode'] as string

      const token =
        req.query['hub.verify_token'] as string

      const challenge =
        req.query['hub.challenge'] as string

      const verifyToken =
        process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN

      if (!verifyToken) {
        logger.error(
          'WHATSAPP_WEBHOOK_VERIFY_TOKEN is not configured',
        )

        return res
          .status(500)
          .send('Webhook verification is not configured')
      }

      if (
        mode === 'subscribe' &&
        token === verifyToken
      ) {
        logger.info(
          'WhatsApp webhook verified successfully',
        )

        return res
          .status(200)
          .send(challenge)
      }

      logger.warn(
        'WhatsApp webhook verification failed: invalid token',
      )

      return res
        .status(403)
        .send('Verification failed')
    } catch (error) {
      next(error)
    }
  }

  /**
   * Receive webhook from Meta.
   *
   * IMPORTANT:
   * Meta expects a fast 200 response.
   *
   * We resolve the organization from Meta's
   * phone_number_id and then process the event.
   */
  async receiveWebhook(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const payload = req.body
      const headers = req.headers

      if (!payload) {
        logger.warn(
          'WhatsApp webhook received with empty body',
        )

        return res.sendStatus(200)
      }

      logger.info(
        'WhatsApp webhook received',
      )

      const phoneNumberId =
        payload?.entry?.[0]?.changes?.[0]?.value
          ?.metadata?.phone_number_id

      let organizationId: number | null =
        null

      if (phoneNumberId) {
        const account =
          await WhatsAppAccount.findOne({
            phoneNumberId: String(
              phoneNumberId,
            ),
            isConnected: true,
            deletedAt: null,
          })

        if (account) {
          organizationId =
            account.organizationId
        }
      }

      /*
       * Do not reject unknown organizations.
       *
       * Meta should receive HTTP 200 even when we cannot
       * resolve an organization. This prevents unnecessary
       * webhook retries.
       *
       * The webhook is still stored for diagnostics.
       */
      if (!organizationId) {
        await WhatsAppWebhookLog.create({
          event:
            payload?.entry?.[0]?.changes?.[0]
              ?.field || 'unknown',

          payload,

          headers,

          processed: false,

          error:
            'Unable to resolve organization from phone_number_id',
        })

        logger.warn(
          `WhatsApp webhook organization could not be resolved for phone_number_id=${phoneNumberId || 'unknown'}`,
        )

        return res.sendStatus(200)
      }

      /*
       * WhatsAppService.processWebhook() is responsible for:
       *
       * - webhook event logging
       * - inbound messages
       * - sent status
       * - delivered status
       * - read status
       * - failed status
       * - campaign recipient updates
       * - conversation updates
       */
      try {
        await whatsappService.processWebhook(
          organizationId,
          payload,
        )
      } catch (error: any) {
        /*
         * Never return a non-200 response to Meta because
         * of an internal processing error. The event has
         * already been logged by the service and can be
         * investigated/reprocessed.
         */
        logger.error(
          'Error processing WhatsApp webhook:',
          error?.response?.data ||
            error?.message ||
            error,
        )
      }

      return res.sendStatus(200)
    } catch (error: any) {
      /*
       * Always acknowledge Meta webhooks.
       *
       * We log the error and return 200 so Meta does not
       * repeatedly retry an event because of an internal
       * application failure.
       */
      logger.error(
        'Error receiving WhatsApp webhook:',
        error?.response?.data ||
          error?.message ||
          error,
      )

      return res.sendStatus(200)
    }
  }

  /**
   * Get webhook logs for the authenticated organization.
   */
  async getWebhookLogs(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const { organizationId } =
        req.auth!

      const {
        limit = 50,
        processed,
      } = req.query

      const parsedLimit = Math.min(
        100,
        Math.max(
          1,
          Number(limit) || 50,
        ),
      )

      const query: any = {
        organizationId,
      }

      if (
        processed !== undefined
      ) {
        query.processed =
          processed === 'true'
      }

      const logs =
        await WhatsAppWebhookLog.find(
          query,
        )
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
