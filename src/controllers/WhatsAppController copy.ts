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
   * Verify WhatsApp webhook with Meta
   *
   * URL:
   * GET /api/v1/webhooks/whatsapp/:organizationId
   */
  

  /**
   * Receive WhatsApp webhook events from Meta
   *
   * URL:
   * POST /api/v1/webhooks/whatsapp/:organizationId
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
        !Number.isInteger(numericOrganizationId)
      ) {
        return res
          .status(400)
          .send('Invalid organization ID')
      }

      const payload = req.body
      const headers = req.headers

      logger.info(
        `WhatsApp webhook received for organization ${numericOrganizationId}`,
      )

      const event =
        payload.entry?.[0]?.changes?.[0]?.field ||
        'unknown'

      await WhatsAppWebhookLog.create({
        organizationId: numericOrganizationId,
        event,
        payload,
        headers,
        processed: false,
      })

      try {
        await whatsappService.processWebhook(
          numericOrganizationId,
          payload,
        )

        await WhatsAppWebhookLog.updateOne(
          {
            organizationId: numericOrganizationId,
            event,
            payload,
          },
          {
            processed: true,
            processedAt: new Date(),
          },
        )
      } catch (error: any) {
        logger.error(
          `Error processing WhatsApp webhook for organization ${numericOrganizationId}:`,
          error,
        )

        await WhatsAppWebhookLog.updateOne(
          {
            organizationId: numericOrganizationId,
            event,
            payload,
          },
          {
            error: error?.message || 'Webhook processing failed',
          },
        )
      }

      // Meta expects HTTP 200.
      return res.sendStatus(200)
    } catch (error) {
      logger.error(
        'Error receiving WhatsApp webhook:',
        error,
      )

      // Always acknowledge Meta.
      return res.sendStatus(200)
    }
  }

  /**
   * Get webhook logs
   */
  async getWebhookLogs(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const { organizationId } = req.auth!
      const { limit = 50, processed } = req.query

      const query: any = {
        organizationId,
      }

      if (processed !== undefined) {
        query.processed =
          processed === 'true'
      }

      const logs =
        await WhatsAppWebhookLog.find(query)
          .sort({ createdAt: -1 })
          .limit(Number(limit))
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