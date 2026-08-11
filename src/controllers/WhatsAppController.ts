import { Request, Response, NextFunction } from 'express'
import { WhatsAppService } from '../services/WhatsAppService'
import {
  success,
  successPaginated,
  buildPaginationMeta,
} from '../utils/response'
import { AppError } from '../utils/errors'
import {
  WhatsAppMetaTemplate,
  WhatsAppCampaign,
  WhatsAppConversation,
  WhatsAppMessage,
  WhatsAppAccount,
  WhatsAppCampaignRecipient,
  Contact,
} from '../models'

const whatsappService = WhatsAppService.getInstance()

/**
 * Normalize a phone number into the canonical format used by the CRM.
 *
 * Examples:
 * +91 9876543210 -> 919876543210
 * 919876543210   -> 919876543210
 * 9876543210     -> 919876543210
 * 09876543210    -> 919876543210
 *
 * For non-Indian international numbers, the function keeps
 * the international digits as supplied.
 */
function normalizeWhatsAppPhone(
  phone: string | null | undefined,
): string | null {
  if (!phone) {
    return null
  }

  let normalized = String(phone).trim()

  if (!normalized) {
    return null
  }

  // Remove spaces, brackets, hyphens and other formatting characters.
  normalized = normalized.replace(/[^\d+]/g, '')

  // Remove leading +
  normalized = normalized.replace(/^\+/, '')

  // Must contain digits only after normalization.
  if (!/^\d+$/.test(normalized)) {
    return null
  }

  /*
   * Indian mobile number handling.
   *
   * 9876543210
   * becomes
   * 919876543210
   */
  if (/^[6-9]\d{9}$/.test(normalized)) {
    normalized = `91${normalized}`
  }

  /*
   * 09876543210
   * becomes
   * 919876543210
   */
  if (/^0\d{10}$/.test(normalized)) {
    normalized = `91${normalized.substring(1)}`
  }

  /*
   * Basic international phone number validation.
   *
   * International numbers are generally between 8 and 15 digits.
   */
  if (normalized.length < 8 || normalized.length > 15) {
    return null
  }

  return normalized
}

export class WhatsAppController {
  // ==================== SETTINGS ====================

  /**
   * Generate Meta OAuth URL
   */
  async getAuthUrl(req: Request, res: Response, next: NextFunction) {
    try {
      const { organizationId, userId } = req.auth!

      const url = await whatsappService.getAuthUrl({
        organizationId,
        userId,
      })

      return success(
        res,
        { url },
        'WhatsApp OAuth URL generated successfully',
      )
    } catch (error) {
      next(error)
    }
  }

  /**
   * OAuth callback from Meta
   */
  async oauthCallback(req: Request, res: Response, next: NextFunction) {
    try {
      const { code, state } = req.query

      if (!code) {
        throw new AppError('Authorization code is missing', 400)
      }

      if (!state) {
        throw new AppError('State is missing', 400)
      }

      const decodedState = JSON.parse(
        Buffer.from(state as string, 'base64').toString('utf8'),
      )

      const account = await whatsappService.connectOrganization(
        decodedState.organizationId,
        code as string,
        process.env.WHATSAPP_REDIRECT_URI!,
      )

      return success(
        res,
        {
          connected: true,
          account: {
            businessName: account.businessName,
            displayName: account.displayName,
            phoneNumber: account.phoneNumber,
            phoneNumberId: account.phoneNumberId,
            businessId: account.businessId,
            wabaId: account.wabaId,
          },
        },
        'WhatsApp connected successfully',
      )
    } catch (error) {
      next(error)
    }
  }

  /**
 * Complete Meta WhatsApp Embedded Signup
 */
/**
 * Complete Meta WhatsApp Embedded Signup
 */
async completeEmbeddedSignup(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const { organizationId } = req.auth!

    const { code } = req.body

    if (!code) {
      throw new AppError(
        'Meta Embedded Signup authorization code is required',
        400,
      )
    }

    const account =
      await whatsappService.completeEmbeddedSignup(
        organizationId,
        code,
      )

    return success(
      res,
      {
        connected: true,
        account: {
          businessName:
            account.businessName,
          displayName:
            account.displayName,
          phoneNumber:
            account.phoneNumber,
          phoneNumberId:
            account.phoneNumberId,
          businessId:
            account.businessId,
          wabaId:
            account.wabaId,
          isConnected:
            account.isConnected,
          webhookVerified:
            account.webhookVerified,
        },
      },
      'WhatsApp Embedded Signup completed successfully',
    )
  } catch (error) {
    next(error)
  }
}

  /**
   * Get WhatsApp settings/account info
   */
  async getSettings(req: Request, res: Response, next: NextFunction) {
    try {
      const { organizationId } = req.auth!

      const account =
        await whatsappService.getAccountInfo(organizationId)

      if (!account) {
        return success(
          res,
          {
            isConnected: false,
          },
          'No WhatsApp account connected',
        )
      }

      const templateCount =
        await WhatsAppMetaTemplate.countDocuments({
          organizationId,
          deletedAt: null,
        })

      const webhookUrl = `${process.env.API_BASE_URL}/api/v1/webhooks/whatsapp`

      return success(
        res,
        {
          ...account,
          webhookUrl,
          webhookVerified: account.webhookVerified || false,
          templateCount,
          lastSync: account.lastSync,
        },
        'WhatsApp settings retrieved',
      )
    } catch (error) {
      next(error)
    }
  }

  /**
   * Connect WhatsApp account using Meta authorization code
   */
  async connectAccount(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const { organizationId } = req.auth!
      const { code, redirectUri } = req.body

      if (!code) {
        throw new AppError(
          'Authorization code is required',
          400,
        )
      }

      if (!redirectUri) {
        throw new AppError(
          'Redirect URI is required',
          400,
        )
      }

      const account =
        await whatsappService.connectOrganization(
          organizationId,
          code,
          redirectUri,
        )

      return success(
        res,
        {
          businessName: account.businessName,
          displayName: account.displayName,
          phoneNumber: account.phoneNumber,
          phoneNumberId: account.phoneNumberId,
          isConnected: true,
        },
        'WhatsApp account connected successfully',
      )
    } catch (error) {
      next(error)
    }
  }

  /**
   * Disconnect WhatsApp account
   */
  async disconnectAccount(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const { organizationId } = req.auth!

      await whatsappService.disconnectAccount(organizationId)

      return success(
        res,
        null,
        'WhatsApp account disconnected successfully',
      )
    } catch (error) {
      next(error)
    }
  }

  /**
   * Refresh WhatsApp account
   */
  async refreshAccount(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const { organizationId } = req.auth!
      const { refreshToken } = req.body

      if (!refreshToken) {
        throw new AppError(
          'Refresh token is required',
          400,
        )
      }

      // TODO: Implement actual token refresh with Meta.
      // For now, just sync templates.
      await whatsappService.syncMetaTemplates(
        organizationId,
      )

      return success(
        res,
        {
          refreshed: true,
        },
        'Account refreshed successfully',
      )
    } catch (error) {
      next(error)
    }
  }

  /**
   * Verify webhook configuration
   */
  async verifyWebhook(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const { organizationId } = req.auth!

      await WhatsAppAccount.updateOne(
        { organizationId },
        { webhookVerified: true },
      )

      return success(
        res,
        {
          webhookVerified: true,
        },
        'Webhook verified successfully',
      )
    } catch (error) {
      next(error)
    }
  }

  // ==================== TEMPLATES ====================

  /**
   * Sync Meta templates
   */
  async syncTemplates(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const { organizationId } = req.auth!

      const templates =
        await whatsappService.syncMetaTemplates(
          organizationId,
        )

      return success(
        res,
        {
          count: templates.length,
          templates,
        },
        'Templates synced successfully',
      )
    } catch (error) {
      next(error)
    }
  }

  /**
   * Get all templates with pagination and filters
   */
  async getTemplates(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const { organizationId } = req.auth!
      const {
        category,
        status,
        search,
        page = 1,
        limit = 20,
      } = req.query

      const query: any = {
        organizationId,
        deletedAt: null,
      }

      if (category) {
        query.category = category
      }

      if (status) {
        query.status = status
      }

      if (search) {
        query.$or = [
          {
            name: {
              $regex: search,
              $options: 'i',
            },
          },
          {
            templateId: {
              $regex: search,
              $options: 'i',
            },
          },
        ]
      }

      const pageNum = Math.max(1, Number(page) || 1)
      const limitNum = Math.min(100, Math.max(1, Number(limit) || 20))
      const skip = (pageNum - 1) * limitNum

      const [templates, total] =
        await Promise.all([
          WhatsAppMetaTemplate.find(query)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limitNum)
            .lean(),

          WhatsAppMetaTemplate.countDocuments(query),
        ])

      const meta = buildPaginationMeta(
        pageNum,
        limitNum,
        total,
      )

      return successPaginated(
        res,
        templates,
        meta,
        'Templates retrieved successfully',
      )
    } catch (error) {
      next(error)
    }
  }

  /**
   * Get a single template by ID
   */
  async getTemplate(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const { organizationId } = req.auth!
      const { templateId } = req.params

      const template =
        await WhatsAppMetaTemplate.findOne({
          organizationId,
          _id: Number(templateId),
          deletedAt: null,
        }).lean()

      if (!template) {
        throw new AppError(
          'Template not found',
          404,
        )
      }

      return success(
        res,
        template,
        'Template retrieved successfully',
      )
    } catch (error) {
      next(error)
    }
  }

  // ==================== MESSAGES ====================

  /**
   * Send a WhatsApp message
   */
  async sendMessage(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const { organizationId } = req.auth!

      const {
        to,
        type,
        content,
        templateName,
        templateLanguage,
        templateComponents,
        metadata,
      } = req.body

      if (!to) {
        throw new AppError(
          'Recipient phone number is required',
          400,
        )
      }

      if (!type) {
        throw new AppError(
          'Message type is required',
          400,
        )
      }

      if (!content && type !== 'template') {
        throw new AppError(
          'Message content is required',
          400,
        )
      }

      const result =
        await whatsappService.sendMessage(
          organizationId,
          {
            to,
            type,
            content,
            templateName,
            templateLanguage,
            templateComponents,
            metadata,
          },
        )

      return success(
        res,
        result,
        'Message sent successfully',
      )
    } catch (error) {
      next(error)
    }
  }

  /**
   * Get message status
   */
  async getMessageStatus(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const { organizationId } = req.auth!
      const { messageId } = req.params

      const message =
        await WhatsAppMessage.findOne({
          organizationId,
          messageId,
          deletedAt: null,
        }).lean()

      if (!message) {
        throw new AppError(
          'Message not found',
          404,
        )
      }

      return success(
        res,
        {
          status: message.status,
          sentAt: message.sentAt,
          deliveredAt: message.deliveredAt,
          readAt: message.readAt,
          errorMessage: message.errorMessage,
        },
        'Message status retrieved',
      )
    } catch (error) {
      next(error)
    }
  }

  // ==================== CONVERSATIONS ====================

  /**
   * Get all conversations with pagination and filters
   */
  async getConversations(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const { organizationId } = req.auth!

      const {
        status,
        assignedTo,
        search,
        unreadOnly,
        page = 1,
        limit = 20,
      } = req.query

      const pageNum = Math.max(1, Number(page) || 1)
      const limitNum = Math.min(100, Math.max(1, Number(limit) || 20))

      const result =
        await whatsappService.getConversations(
          organizationId,
          {
            status: status as string,
            assignedTo: assignedTo
              ? Number(assignedTo)
              : undefined,
            search: search as string,
            unreadOnly:
              unreadOnly === 'true',
          },
          pageNum,
          limitNum,
        )

      const meta = buildPaginationMeta(
        pageNum,
        limitNum,
        result.total,
      )

      return successPaginated(
        res,
        result.data,
        meta,
        'Conversations retrieved successfully',
      )
    } catch (error) {
      next(error)
    }
  }

  /**
   * Get messages for a specific conversation
   */
  async getConversationMessages(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const { organizationId } = req.auth!
      const { conversationId } = req.params
      const {
        limit = 50,
        before,
      } = req.query

      const messages =
        await whatsappService.getConversationMessages(
          organizationId,
          Number(conversationId),
          Number(limit),
          before
            ? new Date(before as string)
            : undefined,
        )

      return success(
        res,
        messages,
        'Messages retrieved successfully',
      )
    } catch (error) {
      next(error)
    }
  }

  /**
   * Mark conversation as read
   */
  async markRead(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const { organizationId } = req.auth!
      const { conversationId } = req.params

      await whatsappService.markConversationRead(
        organizationId,
        Number(conversationId),
      )

      return success(
        res,
        null,
        'Conversation marked as read',
      )
    } catch (error) {
      next(error)
    }
  }

  /**
   * Assign conversation to an agent
   */
  async assignConversation(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const { organizationId } = req.auth!
      const { conversationId } = req.params
      const { userId } = req.body

      if (!userId) {
        throw new AppError(
          'User ID is required',
          400,
        )
      }

      await whatsappService.assignConversation(
        organizationId,
        Number(conversationId),
        Number(userId),
      )

      return success(
        res,
        null,
        'Conversation assigned successfully',
      )
    } catch (error) {
      next(error)
    }
  }

  /**
   * Unassign conversation from agent
   */
  async unassignConversation(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const { organizationId } = req.auth!
      const { conversationId } = req.params

      await WhatsAppConversation.updateOne(
        {
          organizationId,
          _id: Number(conversationId),
        },
        {
          assignedTo: null,
        },
      )

      return success(
        res,
        null,
        'Conversation unassigned successfully',
      )
    } catch (error) {
      next(error)
    }
  }

  /**
   * Archive conversation
   */
  async archiveConversation(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const { organizationId } = req.auth!
      const { conversationId } = req.params

      await whatsappService.archiveConversation(
        organizationId,
        Number(conversationId),
      )

      return success(
        res,
        null,
        'Conversation archived successfully',
      )
    } catch (error) {
      next(error)
    }
  }

  /**
   * Unarchive conversation
   */
  async unarchiveConversation(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const { organizationId } = req.auth!
      const { conversationId } = req.params

      await WhatsAppConversation.updateOne(
        {
          organizationId,
          _id: Number(conversationId),
        },
        {
          status: 'active',
          isArchived: false,
        },
      )

      return success(
        res,
        null,
        'Conversation unarchived successfully',
      )
    } catch (error) {
      next(error)
    }
  }

  /**
   * Get unread count for organization
   */
  async getUnreadCount(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const { organizationId } = req.auth!

      const count =
        await whatsappService.getUnreadCount(
          organizationId,
        )

      return success(
        res,
        { unread: count },
        'Unread count retrieved',
      )
    } catch (error) {
      next(error)
    }
  }

  /**
   * Create a conversation from a Contact ID
   */
  async createConversation(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const { organizationId } = req.auth!
      const { contactId } = req.body

      if (!contactId) {
        throw new AppError(
          'Contact ID is required',
          400,
        )
      }

      const conversation =
        await whatsappService.createConversation(
          organizationId,
          Number(contactId),
        )

      return success(
        res,
        conversation,
        'Conversation created or retrieved successfully',
      )
    } catch (error) {
      next(error)
    }
  }

  // ==================== CAMPAIGNS ====================

  /**
   * Create a WhatsApp campaign.
   *
   * Supported audience modes:
   *
   * 1. Existing:
   *    recipients: string[]
   *
   * 2. All eligible CRM contacts:
   *    audienceType: "all_eligible"
   *
   * 3. Selected CRM contacts:
   *    audienceType: "selected"
   *    contactIds: number[]
   */
  async createCampaign(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const { organizationId, userId } = req.auth!

      const {
        name,
        templateId,
        recipients,
        audienceType,
        contactIds,
        variables,
        scheduledAt,
      } = req.body

      if (!name) {
        throw new AppError(
          'Campaign name is required',
          400,
        )
      }

      if (!templateId) {
        throw new AppError(
          'Template ID is required',
          400,
        )
      }

      const normalizedTemplateId =
        Number(templateId)

      if (
        !Number.isInteger(
          normalizedTemplateId,
        )
      ) {
        throw new AppError(
          'Invalid template ID',
          400,
        )
      }

      // Make sure the template belongs to this organization.
      const template =
        await WhatsAppMetaTemplate.findOne({
          organizationId,
          _id: normalizedTemplateId,
          deletedAt: null,
        })

      if (!template) {
        throw new AppError(
          'Template not found',
          404,
        )
      }

      let finalRecipients: string[] = []

      let parsedScheduledAt: Date | undefined

      if (scheduledAt) {
        const date = new Date(scheduledAt)

        if (Number.isNaN(date.getTime())) {
          throw new AppError('Invalid scheduledAt value', 400)
        }

        if (date.getTime() < Date.now()) {
          throw new AppError('scheduledAt cannot be in the past', 400)
        }

        parsedScheduledAt = date
      }

      /**
       * MODE 1:
       * All eligible CRM contacts.
       */
      if (
        audienceType ===
        'all_eligible'
      ) {
        const contacts =
          await Contact.find({
            organizationId,
            deletedAt: null,
            phone: {
              $exists: true,
              $nin: ['', null],
            },
          })
            .select('phone')
            .lean()

        const normalizedPhones =
          contacts
            .map((contact) =>
              normalizeWhatsAppPhone(
                contact.phone,
              ),
            )
            .filter(
              (
                phone,
              ): phone is string =>
                Boolean(phone),
            )

        // Remove duplicate phone numbers.
        finalRecipients = [
          ...new Set(normalizedPhones),
        ]

        if (
          finalRecipients.length ===
          0
        ) {
          throw new AppError(
            'No eligible contacts with valid phone numbers were found',
            400,
          )
        }
      }

      /**
       * MODE 2:
       * Selected CRM contacts.
       */
      else if (
        audienceType ===
        'selected'
      ) {
        if (
          !Array.isArray(
            contactIds,
          ) ||
          contactIds.length === 0
        ) {
          throw new AppError(
            'At least one contact must be selected',
            400,
          )
        }

        const normalizedContactIds =
          contactIds
            .map((id: unknown) =>
              Number(id),
            )
            .filter(
              (id: number) =>
                Number.isInteger(id),
            )

        if (
          normalizedContactIds.length ===
          0
        ) {
          throw new AppError(
            'No valid contact IDs were provided',
            400,
          )
        }

        const contacts =
          await Contact.find({
            organizationId,
            _id: {
              $in:
                normalizedContactIds,
            },
            deletedAt: null,
            phone: {
              $exists: true,
              $nin: ['', null],
            },
          })
            .select('phone')
            .lean()

        const normalizedPhones =
          contacts
            .map((contact) =>
              normalizeWhatsAppPhone(
                contact.phone,
              ),
            )
            .filter(
              (
                phone,
              ): phone is string =>
                Boolean(phone),
            )

        finalRecipients = [
          ...new Set(normalizedPhones),
        ]

        if (
          finalRecipients.length ===
          0
        ) {
          throw new AppError(
            'None of the selected contacts have valid phone numbers',
            400,
          )
        }
      }

      /**
       * MODE 3:
       * Existing recipients-based API.
       *
       * This keeps your old functionality
       * working while we transition to
       * contact-based campaigns.
       */
      else {
        if (
          !Array.isArray(
            recipients,
          ) ||
          recipients.length === 0
        ) {
          throw new AppError(
            'At least one recipient is required',
            400,
          )
        }

        finalRecipients =
          recipients
            .map((phone: unknown) =>
              typeof phone ===
              'string'
                ? normalizeWhatsAppPhone(
                    phone,
                  )
                : null,
            )
            .filter(
              (
                phone,
              ): phone is string =>
                Boolean(phone),
            )

        // Remove duplicate phone numbers.
        finalRecipients = [
          ...new Set(
            finalRecipients,
          ),
        ]

        if (
          finalRecipients.length ===
          0
        ) {
          throw new AppError(
            'No valid phone numbers were provided',
            400,
          )
        }
      }

      const campaign =
        await whatsappService.createCampaign(
          organizationId,
          {
            name,
            templateId:
              normalizedTemplateId,
            recipients:
              finalRecipients,
            variables:
              variables || {},
            scheduledAt: parsedScheduledAt,
            createdBy: userId,
          },
        )

      return success(
        res,
        {
          ...campaign.toObject(),
          audienceType:
            audienceType ||
            'recipients',
          recipientCount:
            finalRecipients.length,
        },
        'Campaign created successfully',
      )
    } catch (error) {
      next(error)
    }
  }

  /**
   * Get all campaigns with pagination and filters
   */
  async getCampaigns(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const { organizationId } = req.auth!

      const {
        status,
        search,
        page = 1,
        limit = 20,
      } = req.query

      const pageNum = Math.max(1, Number(page) || 1)
      const limitNum = Math.min(100, Math.max(1, Number(limit) || 20))
      const skip =
        (pageNum - 1) *
        limitNum

      const query: any = {
        organizationId,
        deletedAt: null,
      }

      if (status) {
        query.status = status
      }

      if (search) {
        query.name = {
          $regex: search,
          $options: 'i',
        }
      }

      const [campaigns, total] =
        await Promise.all([
          WhatsAppCampaign.find(query)
            .sort({
              createdAt: -1,
            })
            .skip(skip)
            .limit(limitNum)
            .populate(
              'templateId',
              'name category language',
            )
            .populate(
              'createdBy',
              'firstName lastName email',
            )
            .lean(),

          WhatsAppCampaign.countDocuments(
            query,
          ),
        ])

      const meta =
        buildPaginationMeta(
          pageNum,
          limitNum,
          total,
        )

      return successPaginated(
        res,
        campaigns,
        meta,
        'Campaigns retrieved successfully',
      )
    } catch (error) {
      next(error)
    }
  }

  /**
   * Get a single campaign by ID
   */
  async getCampaign(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const { organizationId } = req.auth!
      const { campaignId } = req.params

      const campaign =
        await WhatsAppCampaign.findOne({
          organizationId,
          _id: Number(campaignId),
          deletedAt: null,
        })
          .populate(
            'templateId',
            'name category language',
          )
          .populate(
            'createdBy',
            'firstName lastName email',
          )
          .lean()

      if (!campaign) {
        throw new AppError(
          'Campaign not found',
          404,
        )
      }

      return success(
        res,
        campaign,
        'Campaign retrieved successfully',
      )
    } catch (error) {
      next(error)
    }
  }

  /**
   * Get campaign statistics
   */
  async getCampaignStats(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const { organizationId } = req.auth!
      const { campaignId } = req.params
      const numericCampaignId = Number(campaignId)

      if (!Number.isInteger(numericCampaignId)) {
        throw new AppError('Invalid campaign ID', 400)
      }

      const stats =
        await whatsappService.getCampaignStats(
          organizationId,
          numericCampaignId,
        )

      return success(
        res,
        stats,
        'Campaign stats retrieved successfully',
      )
    } catch (error) {
      next(error)
    }
  }

  /**
   * Get campaign recipients with pagination and filters
   */
  async getCampaignRecipients(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const { organizationId } = req.auth!
      const { campaignId } = req.params
      const {
        status,
        page = 1,
        limit = 20,
      } = req.query

      const pageNum = Math.max(1, Number(page) || 1)
      const limitNum = Math.min(100, Math.max(1, Number(limit) || 20))

      const numericCampaignId = Number(campaignId)

      if (!Number.isInteger(numericCampaignId)) {
        throw new AppError('Invalid campaign ID', 400)
      }

      const query: any = {
        organizationId,
        campaignId: numericCampaignId,
      }

      if (status) {
        query.status = status
      }

      const skip =
        (pageNum - 1) *
        limitNum

      const [
        recipients,
        total,
      ] = await Promise.all([
        WhatsAppCampaignRecipient.find(
          query,
        )
          .skip(skip)
          .limit(limitNum)
          .populate(
            'contactId',
            'firstName lastName email phone',
          )
          .lean(),

        WhatsAppCampaignRecipient.countDocuments(
          query,
        ),
      ])

      const meta =
        buildPaginationMeta(
          pageNum,
          limitNum,
          total,
        )

      return successPaginated(
        res,
        recipients,
        meta,
        'Campaign recipients retrieved',
      )
    } catch (error) {
      next(error)
    }
  }

  /**
   * Cancel a campaign
   */
  async cancelCampaign(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const { organizationId } = req.auth!
      const { campaignId } = req.params
      const numericCampaignId = Number(campaignId)

      if (!Number.isInteger(numericCampaignId)) {
        throw new AppError('Invalid campaign ID', 400)
      }

      await whatsappService.cancelCampaign(
        organizationId,
        numericCampaignId,
      )

      return success(
        res,
        null,
        'Campaign cancelled successfully',
      )
    } catch (error) {
      next(error)
    }
  }

  /**
   * Delete a campaign (soft delete)
   */
  async deleteCampaign(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const { organizationId } = req.auth!
      const { campaignId } = req.params
      const numericCampaignId = Number(campaignId)

      if (!Number.isInteger(numericCampaignId)) {
        throw new AppError('Invalid campaign ID', 400)
      }

      await whatsappService.deleteCampaign(
        organizationId,
        numericCampaignId,
      )

      return success(
        res,
        null,
        'Campaign deleted successfully',
      )
    } catch (error) {
      next(error)
    }
  }

  // ==================== CONTACT INTEGRATION ====================

  /**
   * Get WhatsApp conversations for a specific contact
   */
  async getContactConversations(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const { organizationId } = req.auth!
      const { contactId } = req.params

      const conversations =
        await WhatsAppConversation.find({
          organizationId,
          contactId: Number(contactId),
          deletedAt: null,
        })
          .sort({
            lastMessageAt: -1,
          })
          .populate(
            'assignedTo',
            'firstName lastName email',
          )
          .lean()

      return success(
        res,
        conversations,
        'Contact conversations retrieved',
      )
    } catch (error) {
      next(error)
    }
  }

  /**
   * Get WhatsApp conversation history for a contact
   */
  async getContactConversationHistory(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const { organizationId } = req.auth!
      const { contactId } = req.params
      const {
        limit = 50,
        before,
      } = req.query

      const conversations =
        await WhatsAppConversation.find({
          organizationId,
          contactId: Number(contactId),
          deletedAt: null,
        }).select('_id')

      const conversationIds =
        conversations.map(
          (c) => c._id,
        )

      if (
        conversationIds.length ===
        0
      ) {
        return success(
          res,
          [],
          'No conversation history found',
        )
      }

      const query: any = {
        organizationId,
        conversationId: {
          $in: conversationIds,
        },
        deletedAt: null,
      }

      if (before) {
        query.createdAt = {
          $lt: new Date(
            before as string,
          ),
        }
      }

      const messages =
        await WhatsAppMessage.find(
          query,
        )
          .sort({
            createdAt: -1,
          })
          .limit(Number(limit))
          .lean()

      return success(
        res,
        messages,
        'Conversation history retrieved',
      )
    } catch (error) {
      next(error)
    }
  }

  // ==================== DASHBOARD ====================

  /**
   * Get dashboard statistics
   */
  async getDashboardStats(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const { organizationId } = req.auth!

      const today = new Date()
      today.setHours(
        0,
        0,
        0,
        0,
      )

      const tomorrow =
        new Date(today)

      tomorrow.setDate(
        tomorrow.getDate() + 1,
      )

      const weekStart =
        new Date(today)

      weekStart.setDate(
        weekStart.getDate() - 7,
      )

      const account =
        await whatsappService.getAccountInfo(
          organizationId,
        )

      const [
        unreadCount,
        totalConversations,
        activeConversations,
        totalTemplates,
        campaignsToday,
        messagesToday,
        messagesThisWeek,
        campaignsRunning,
      ] = await Promise.all([
        whatsappService.getUnreadCount(
          organizationId,
        ),

        WhatsAppConversation.countDocuments(
          {
            organizationId,
            deletedAt: null,
            status: {
              $ne: 'archived',
            },
          },
        ),

        WhatsAppConversation.countDocuments(
          {
            organizationId,
            deletedAt: null,
            status: 'active',
          },
        ),

        WhatsAppMetaTemplate.countDocuments(
          {
            organizationId,
            deletedAt: null,
            status: 'APPROVED',
          },
        ),

        WhatsAppCampaign.countDocuments(
          {
            organizationId,
            deletedAt: null,
            createdAt: {
              $gte: today,
              $lt: tomorrow,
            },
          },
        ),

        WhatsAppMessage.countDocuments(
          {
            organizationId,
            deletedAt: null,
            direction: 'outbound',
            createdAt: {
              $gte: today,
              $lt: tomorrow,
            },
          },
        ),

        WhatsAppMessage.countDocuments(
          {
            organizationId,
            deletedAt: null,
            direction: 'outbound',
            createdAt: {
              $gte: weekStart,
            },
          },
        ),

        WhatsAppCampaign.countDocuments(
          {
            organizationId,
            deletedAt: null,
            status: 'running',
          },
        ),
      ])

      const recentCampaigns =
        await WhatsAppCampaign.find({
          organizationId,
          deletedAt: null,
        })
          .sort({
            createdAt: -1,
          })
          .limit(5)
          .populate(
            'templateId',
            'name',
          )
          .lean()

      const recentConversations =
        await WhatsAppConversation.find({
          organizationId,
          deletedAt: null,
        })
          .sort({
            lastMessageAt: -1,
          })
          .limit(5)
          .populate(
            'contactId',
            'firstName lastName email phone',
          )
          .populate(
            'assignedTo',
            'firstName lastName',
          )
          .lean()

      return success(
        res,
        {
          account: {
            isConnected:
              account?.isConnected ||
              false,
            businessName:
              account?.businessName ||
              null,
            displayName:
              account?.displayName ||
              null,
            phoneNumber:
              account?.phoneNumber ||
              null,
            webhookVerified:
              account?.webhookVerified ||
              false,
          },

          stats: {
            unread:
              unreadCount,
            totalConversations,
            activeConversations,
            totalTemplates,
            campaignsToday,
            messagesToday,
            messagesThisWeek,
            campaignsRunning,
          },

          recent: {
            campaigns:
              recentCampaigns,
            conversations:
              recentConversations,
          },
        },
        'Dashboard stats retrieved',
      )
    } catch (error) {
      next(error)
    }
  }

  // ==================== BULK OPERATIONS ====================

  /**
   * Bulk send messages
   *
   * NOTE:
   * This is the existing synchronous bulk endpoint.
   * Campaigns should use the campaign processor instead
   * for larger audiences.
   */
  async bulkSendMessages(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const { organizationId } = req.auth!

      const {
        recipients,
        type,
        content,
        templateName,
        templateLanguage,
        templateComponents,
      } = req.body

      if (
        !recipients ||
        !Array.isArray(
          recipients,
        ) ||
        recipients.length === 0
      ) {
        throw new AppError(
          'At least one recipient is required',
          400,
        )
      }

      if (recipients.length > 100) {
        throw new AppError(
          'Direct bulk send is limited to 100 recipients. Use a WhatsApp campaign for larger audiences.',
          400,
        )
      }

      const results: any[] = []

      let successCount = 0
      let failureCount = 0

      for (const recipient of recipients) {
        try {
          const result =
            await whatsappService.sendMessage(
              organizationId,
              {
                to:
                  recipient.phone ||
                  recipient,
                type,
                content,
                templateName,
                templateLanguage,
                templateComponents,
                metadata: {
                  bulk: true,
                  recipientId:
                    recipient.id,
                },
              },
            )

          results.push({
            ...result,
            phone:
              recipient.phone ||
              recipient,
          })

          successCount++
        } catch (error: any) {
          results.push({
            phone:
              recipient.phone ||
              recipient,
            error:
              error.message,
          })

          failureCount++
        }
      }

      return success(
        res,
        {
          total:
            recipients.length,
          success:
            successCount,
          failed:
            failureCount,
          results,
        },
        'Bulk send completed',
      )
    } catch (error) {
      next(error)
    }
  }
}

export default WhatsAppController
