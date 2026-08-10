import axios from 'axios'
import {
  WhatsAppAccount,
  WhatsAppConversation,
  WhatsAppMessage,
  WhatsAppMetaTemplate,
  WhatsAppWebhookLog,
  WhatsAppCampaign,
  WhatsAppCampaignRecipient,
  Contact,
} from '../models'
import { AppError } from '../utils/errors'
import { decryptToken, encryptToken } from '../utils/encryption'
import { logger } from '../utils/logger'
import { normalizeIndianPhoneNumber } from '../utils/phone'

type WhatsAppMessageType =
  | 'text'
  | 'template'
  | 'image'
  | 'video'
  | 'audio'
  | 'document'
  | 'location'
  | 'interactive'

interface SendMessageData {
  to: string
  type: WhatsAppMessageType
  content?: any
  templateName?: string
  templateLanguage?: string
  templateComponents?: any[]
  metadata?: any
}

export class WhatsAppService {
  private static instance: WhatsAppService

  private readonly metaApiBase =
    process.env.WHATSAPP_API_BASE_URL || 'https://graph.facebook.com'

  private readonly apiVersion =
    process.env.WHATSAPP_GRAPH_API_VERSION || 'v18.0'

  private constructor() {}

  static getInstance(): WhatsAppService {
    if (!WhatsAppService.instance) {
      WhatsAppService.instance = new WhatsAppService()
    }

    return WhatsAppService.instance
  }

  // ============================================================
  // OAUTH
  // ============================================================

  async getAuthUrl(data: {
    organizationId: number
    userId: number
  }): Promise<string> {
    const clientId = process.env.WHATSAPP_CLIENT_ID
    const redirectUri = process.env.WHATSAPP_REDIRECT_URI

    if (!clientId) {
      throw new AppError('WHATSAPP_CLIENT_ID is not configured', 500)
    }

    if (!redirectUri) {
      throw new AppError('WHATSAPP_REDIRECT_URI is not configured', 500)
    }

    const state = Buffer.from(
      JSON.stringify({
        organizationId: data.organizationId,
        userId: data.userId,
        timestamp: Date.now(),
      }),
    ).toString('base64url')

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: [
        'whatsapp_business_management',
        'whatsapp_business_messaging',
      ].join(','),
      state,
    })

    return `https://www.facebook.com/${this.apiVersion}/dialog/oauth?${params.toString()}`
  }

  async exchangeToken(code: string, redirectUri: string): Promise<any> {
    try {
      const clientId = process.env.WHATSAPP_CLIENT_ID
      const clientSecret = process.env.WHATSAPP_CLIENT_SECRET

      if (!clientId || !clientSecret) {
        throw new AppError(
          'WhatsApp client credentials are not configured',
          500,
        )
      }

      const response = await axios.get(
        `${this.metaApiBase}/${this.apiVersion}/oauth/access_token`,
        {
          params: {
            client_id: clientId,
            client_secret: clientSecret,
            grant_type: 'authorization_code',
            redirect_uri: redirectUri,
            code,
          },
        },
      )

      return response.data
    } catch (error: any) {
      logger.error(
        'Error exchanging WhatsApp authorization code:',
        error.response?.data || error.message,
      )

      if (error instanceof AppError) {
        throw error
      }

      throw new AppError(
        error.response?.data?.error?.message ||
          'Failed to exchange authorization code',
        500,
      )
    }
  }

  async connectOrganization(
    organizationId: number,
    code: string,
    redirectUri: string,
  ) {
    const tokenData = await this.exchangeToken(code, redirectUri)

    if (!tokenData?.access_token) {
      throw new AppError('Meta did not return an access token', 502)
    }

    const accountDetails = await this.getAccountDetails(
      tokenData.access_token,
    )

    const tokenExpiry = new Date()

    if (tokenData.expires_in) {
      tokenExpiry.setSeconds(
        tokenExpiry.getSeconds() + Number(tokenData.expires_in),
      )
    }

    const account = await this.saveAccount(organizationId, {
      businessId: accountDetails.businessId,
      businessName: accountDetails.businessName,
      wabaId: accountDetails.wabaId,
      phoneNumber: accountDetails.phoneNumber,
      phoneNumberId: accountDetails.phoneNumberId,
      displayName: accountDetails.displayName,
      accessToken: tokenData.access_token,
      tokenExpiry,
    })

    try {
      await this.syncMetaTemplates(organizationId)
    } catch (error) {
      logger.warn(
        'Template sync failed after connecting WhatsApp account:',
        error,
      )
    }

    return this.serializeAccount(account)
  }

  // ============================================================
// META EMBEDDED SIGNUP
// ============================================================

async completeEmbeddedSignup(
  organizationId: number,
  oauthUserToken: string,
) {
  try {
    if (!oauthUserToken) {
      throw new AppError(
        'Meta OAuth user token is required',
        400,
      )
    }

    // --------------------------------------------------------
    // 1. Debug the OAuth user token
    // --------------------------------------------------------
    const debugResponse = await axios.get(
      `${this.metaApiBase}/${this.apiVersion}/debug_token`,
      {
        params: {
          input_token: oauthUserToken,
        },
        headers: {
          Authorization: `Bearer ${oauthUserToken}`,
        },
      },
    )

    const tokenData = debugResponse.data?.data

    if (!tokenData?.is_valid) {
      throw new AppError(
        'The Meta OAuth token is invalid or expired',
        401,
      )
    }

    // Make sure this token belongs to our Meta app.
    const configuredAppId =
      process.env.WHATSAPP_CLIENT_ID

    if (
      configuredAppId &&
      tokenData.app_id &&
      String(tokenData.app_id) !== String(configuredAppId)
    ) {
      throw new AppError(
        'The Meta OAuth token does not belong to this application',
        401,
      )
    }

    // --------------------------------------------------------
    // 2. Find the WABAs shared with this business
    // --------------------------------------------------------
    //
    // The Embedded Signup token can be used to identify the
    // shared WABA. Meta's Embedded Signup flow uses the
    // Business Management endpoints for this step.
    //
    // We first inspect the granular scopes returned by
    // debug_token.
    // --------------------------------------------------------

    const granularScopes =
      tokenData.granular_scopes || []

    const whatsappScope =
      granularScopes.find(
        (scope: any) =>
          scope.scope ===
          'whatsapp_business_management',
      )

    const targetWabaIds =
      whatsappScope?.target_ids || []

    if (!targetWabaIds.length) {
      throw new AppError(
        'Meta did not return a WhatsApp Business Account from Embedded Signup',
        404,
      )
    }

    const wabaId = String(targetWabaIds[0])

    // --------------------------------------------------------
    // 3. Get WABA information
    // --------------------------------------------------------
    const wabaResponse = await axios.get(
      `${this.metaApiBase}/${this.apiVersion}/${wabaId}`,
      {
        params: {
          fields:
            'id,name,currency,timezone_id,message_template_namespace',
          access_token: oauthUserToken,
        },
      },
    )

    const waba = wabaResponse.data

    if (!waba?.id) {
      throw new AppError(
        'Unable to retrieve the WhatsApp Business Account',
        404,
      )
    }

    // --------------------------------------------------------
    // 4. Get phone numbers belonging to the WABA
    // --------------------------------------------------------
    const phoneResponse = await axios.get(
      `${this.metaApiBase}/${this.apiVersion}/${wabaId}/phone_numbers`,
      {
        params: {
          fields:
            'id,display_phone_number,verified_name,quality_rating,code_verification_status',
          access_token: oauthUserToken,
        },
      },
    )

    const phoneNumbers =
      phoneResponse.data?.data || []

    if (!phoneNumbers.length) {
      throw new AppError(
        'No WhatsApp phone number was found for the connected WABA',
        404,
      )
    }

    const phoneNumber = phoneNumbers[0]

    // --------------------------------------------------------
    // 5. Get the owning business information
    // --------------------------------------------------------
    let businessId = wabaId
    let businessName =
      waba.name || 'WhatsApp Business'

    try {
      const ownerResponse = await axios.get(
        `${this.metaApiBase}/${this.apiVersion}/${wabaId}`,
        {
          params: {
            fields:
              'owner_business_info',
            access_token: oauthUserToken,
          },
        },
      )

      const owner =
        ownerResponse.data?.owner_business_info

      if (owner?.id) {
        businessId = String(owner.id)
      }

      if (owner?.name) {
        businessName = owner.name
      }
    } catch (error: any) {
      logger.warn(
        'Unable to retrieve WABA owner business information:',
        error.response?.data || error.message,
      )
    }

    // --------------------------------------------------------
    // 6. Calculate token expiry
    // --------------------------------------------------------
    const tokenExpiry = new Date()

    if (tokenData.expires_at) {
      tokenExpiry.setTime(
        Number(tokenData.expires_at) * 1000,
      )
    } else {
      // Keep a conservative fallback.
      tokenExpiry.setDate(
        tokenExpiry.getDate() + 60,
      )
    }

    // --------------------------------------------------------
    // 7. Save the customer's WhatsApp account
    // --------------------------------------------------------
    const account = await this.saveAccount(
      organizationId,
      {
        businessId,
        businessName,
        wabaId: String(waba.id),
        phoneNumber:
          phoneNumber.display_phone_number,
        phoneNumberId: String(phoneNumber.id),
        displayName:
          phoneNumber.verified_name ||
          waba.name ||
          businessName,
        accessToken: oauthUserToken,
        tokenExpiry,
      },
    )

    // --------------------------------------------------------
    // 8. Subscribe the WABA to this Meta app
    // --------------------------------------------------------
    try {
      await this.subscribeWabaToApp(
        String(waba.id),
        oauthUserToken,
      )

      await WhatsAppAccount.updateOne(
        {
          _id: account._id,
          organizationId,
        },
        {
          webhookVerified: true,
        },
      )
    } catch (error: any) {
      logger.warn(
        'WABA was connected but webhook subscription failed:',
        error.response?.data || error.message,
      )
    }

    // --------------------------------------------------------
    // 9. Sync templates
    // --------------------------------------------------------
    try {
      await this.syncMetaTemplates(
        organizationId,
      )
    } catch (error) {
      logger.warn(
        'Template sync failed after Embedded Signup:',
        error,
      )
    }

    return this.serializeAccount(account)
  } catch (error: any) {
    logger.error(
      'Embedded Signup completion failed:',
      error.response?.data || error.message,
    )

    if (error instanceof AppError) {
      throw error
    }

    throw new AppError(
      error.response?.data?.error?.message ||
        'Failed to complete WhatsApp Embedded Signup',
      500,
    )
  }
}

private async subscribeWabaToApp(
  wabaId: string,
  accessToken: string,
): Promise<void> {
  try {
    const response = await axios.post(
      `${this.metaApiBase}/${this.apiVersion}/${wabaId}/subscribed_apps`,
      {},
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
    )

    if (response.data?.success !== true) {
      throw new AppError(
        'Meta did not confirm WABA webhook subscription',
        502,
      )
    }

    logger.info(
      `WhatsApp WABA ${wabaId} subscribed to app successfully`,
    )
  } catch (error: any) {
    logger.error(
      `Failed to subscribe WABA ${wabaId} to app:`,
      error.response?.data || error.message,
    )

    throw error
  }
}

  async getAccountDetails(accessToken: string): Promise<any> {
    try {
      const response = await axios.get(
        `${this.metaApiBase}/${this.apiVersion}/me/accounts`,
        {
          params: {
            access_token: accessToken,
            fields:
              'id,name,business_verification_status,phone_numbers{id,display_phone_number,quality_rating,verified_name}',
          },
        },
      )

      const accounts = response.data?.data || []

      if (!accounts.length) {
        throw new AppError('No WhatsApp Business Account found', 404)
      }

      const account = accounts[0]
      const phoneNumbers = account.phone_numbers?.data || []

      if (!phoneNumbers.length) {
        throw new AppError(
          'No WhatsApp phone number found for this business account',
          404,
        )
      }

      const phoneNumber = phoneNumbers[0]

      return {
        businessId: account.id,
        businessName: account.name,
        wabaId: account.id,
        phoneNumberId: phoneNumber.id,
        phoneNumber: phoneNumber.display_phone_number,
        displayName: phoneNumber.verified_name || account.name,
        quality: phoneNumber.quality_rating,
      }
    } catch (error: any) {
      logger.error(
        'Error getting WhatsApp account details:',
        error.response?.data || error.message,
      )

      if (error instanceof AppError) {
        throw error
      }

      throw new AppError(
        error.response?.data?.error?.message ||
          'Failed to get WhatsApp account details',
        500,
      )
    }
  }

  // ============================================================
  // ACCOUNT
  // ============================================================

  async saveAccount(
    organizationId: number,
    accountData: {
      businessId: string
      businessName: string
      wabaId: string
      phoneNumber: string
      phoneNumberId: string
      displayName: string
      accessToken: string
      tokenExpiry: Date
    },
  ): Promise<any> {
    try {
      const encryptedToken = encryptToken(accountData.accessToken)

      const existing = await WhatsAppAccount.findOne({
        organizationId,
        businessId: accountData.businessId,
      })

      if (existing) {
        existing.businessName = accountData.businessName
        existing.displayName = accountData.displayName
        existing.wabaId = accountData.wabaId
        existing.phoneNumber = accountData.phoneNumber
        existing.phoneNumberId = accountData.phoneNumberId
        existing.accessToken = encryptedToken
        existing.tokenExpiry = accountData.tokenExpiry
        existing.isConnected = true
        existing.webhookVerified = false
        existing.deletedAt = null
        existing.lastSync = new Date()

        await existing.save()

        return existing
      }

      return await WhatsAppAccount.create({
        organizationId,
        businessName: accountData.businessName,
        displayName: accountData.displayName,
        businessId: accountData.businessId,
        wabaId: accountData.wabaId,
        phoneNumber: accountData.phoneNumber,
        phoneNumberId: accountData.phoneNumberId,
        accessToken: encryptedToken,
        tokenExpiry: accountData.tokenExpiry,
        isConnected: true,
        webhookVerified: false,
        lastSync: new Date(),
        deletedAt: null,
      })
    } catch (error: any) {
      logger.error('Error saving WhatsApp account:', error.message)

      if (error instanceof AppError) {
        throw error
      }

      throw new AppError('Failed to save WhatsApp account', 500)
    }
  }

  /**
   * Internal method.
   * Returns the encrypted token from MongoDB and decrypts it exactly once.
   */
  private async getAccountWithToken(organizationId: number): Promise<any> {
    const account = await WhatsAppAccount.findOne({
      organizationId,
      isConnected: true,
      deletedAt: null,
    }).select('+accessToken')

    if (!account) {
      throw new AppError(
        'WhatsApp account not found or not connected',
        404,
      )
    }

    if (!account.accessToken) {
      throw new AppError(
        'WhatsApp access token is missing. Please reconnect WhatsApp.',
        401,
      )
    }

    let accessToken: string

    try {
      accessToken = decryptToken(account.accessToken)
    } catch (error: any) {
      logger.error(
        'Failed to decrypt WhatsApp access token:',
        error.message,
      )

      throw new AppError(
        'WhatsApp access token could not be decrypted. Please reconnect the WhatsApp account.',
        401,
      )
    }

    return {
      account,
      accessToken,
    }
  }

  /**
   * Internal account/token accessor.
   * Kept for compatibility with existing service/controller code.
   *
   * IMPORTANT:
   * Never send this object directly to the frontend.
   */
  async getAccount(organizationId: number): Promise<any> {
    const { account, accessToken } =
      await this.getAccountWithToken(organizationId)

    return {
      ...account.toObject(),
      accessToken,
    }
  }

  async getAccountInfo(organizationId: number): Promise<any> {
    const account = await WhatsAppAccount.findOne({
      organizationId,
      isConnected: true,
      deletedAt: null,
    })

    if (!account) {
      return null
    }

    return this.serializeAccount(account)
  }

  private serializeAccount(account: any): any {
    const data = account.toObject ? account.toObject() : account

    delete data.accessToken

    return {
      id: data._id,
      businessName: data.businessName,
      displayName: data.displayName,
      phoneNumber: data.phoneNumber,
      phoneNumberId: data.phoneNumberId,
      businessId: data.businessId,
      wabaId: data.wabaId,
      isConnected: data.isConnected,
      webhookVerified: data.webhookVerified,
      tokenExpiry: data.tokenExpiry,
      lastSync: data.lastSync,
    }
  }

  async disconnectAccount(organizationId: number): Promise<void> {
    await WhatsAppAccount.updateMany(
      {
        organizationId,
        isConnected: true,
      },
      {
        isConnected: false,
        webhookVerified: false,
        deletedAt: new Date(),
      },
    )
  }

  // ============================================================
  // TEMPLATES
  // ============================================================

  async syncMetaTemplates(organizationId: number): Promise<any[]> {
    try {
      const { account, accessToken } =
        await this.getAccountWithToken(organizationId)

      const response = await axios.get(
        `${this.metaApiBase}/${this.apiVersion}/${account.wabaId}/message_templates`,
        {
          params: {
            access_token: accessToken,
            limit: 100,
          },
        },
      )

      const templates = response.data?.data || []
      const savedTemplates: any[] = []

      for (const template of templates) {
        const components = template.components || []
        const variables = this.extractTemplateVariables(components)

        const saved = await WhatsAppMetaTemplate.findOneAndUpdate(
          {
            organizationId,
            templateId: template.id,
          },
          {
            organizationId,
            templateId: template.id,
            name: template.name,
            category: template.category,
            language: template.language,
            status: template.status,
            quality: template.quality || 'UNKNOWN',
            components,
            variables,
            deletedAt: null,
          },
          {
            upsert: true,
            new: true,
            setDefaultsOnInsert: true,
          },
        )

        savedTemplates.push(saved)
      }

      await WhatsAppAccount.updateOne(
        {
          organizationId,
          _id: account._id,
        },
        {
          lastSync: new Date(),
        },
      )

      return savedTemplates
    } catch (error: any) {
      logger.error(
        'Error syncing Meta WhatsApp templates:',
        error.response?.data || error.message,
      )

      if (error instanceof AppError) {
        throw error
      }

      throw new AppError(
        error.response?.data?.error?.message ||
          'Failed to sync Meta WhatsApp templates',
        500,
      )
    }
  }

  private extractTemplateVariables(components: any[]): string[] {
    const variables = new Set<string>()

    for (const component of components) {
      const text = component?.text

      if (!text || typeof text !== 'string') {
        continue
      }

      const matches = text.match(/{{\s*([^}]+?)\s*}}/g) || []

      for (const match of matches) {
        const value = match
          .replace('{{', '')
          .replace('}}', '')
          .trim()

        if (value) {
          variables.add(value)
        }
      }
    }

    return Array.from(variables)
  }

  // ============================================================
  // SEND MESSAGE
  // ============================================================

  async sendMessage(
    organizationId: number,
    messageData: SendMessageData,
  ): Promise<any> {
    try {
      const { account, accessToken } =
        await this.getAccountWithToken(organizationId)

      const normalizedPhone = this.normalizePhone(messageData.to)

      const payload = this.buildMetaMessagePayload(
        normalizedPhone,
        messageData,
      )

      const response = await axios.post(
        `${this.metaApiBase}/${this.apiVersion}/${account.phoneNumberId}/messages`,
        payload,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          timeout: 30000,
        },
      )

      const messageId = response.data?.messages?.[0]?.id

      if (!messageId) {
        throw new AppError(
          'WhatsApp API did not return a message ID',
          502,
        )
      }

      const conversation = await this.getOrCreateConversation(
        organizationId,
        normalizedPhone,
        account.phoneNumberId,
        account.wabaId,
      )

      const savedMessage = await WhatsAppMessage.create({
        organizationId,
        conversationId: conversation._id,
        messageId,
        from: account.phoneNumberId,
        to: normalizedPhone,
        direction: 'outbound',
        type: messageData.type,
        content: messageData.content || {},
        status: 'sent',
        metadata: messageData.metadata,
        sentAt: new Date(),
      })

      await WhatsAppConversation.updateOne(
        {
          organizationId,
          _id: conversation._id,
        },
        {
          lastMessageAt: new Date(),
          status: 'active',
          isArchived: false,
        },
      )

      // Link this message to a campaign recipient if this was a campaign send.
      if (messageData.metadata?.campaignId) {
        await WhatsAppCampaignRecipient.updateOne(
          {
            organizationId,
            campaignId: Number(messageData.metadata.campaignId),
            phoneNumber: normalizedPhone,
          },
          {
            messageId,
            status: 'sent',
            sentAt: new Date(),
          },
        )
      }

      return {
        messageId,
        conversationId: conversation._id,
        message: savedMessage,
      }
    } catch (error: any) {
      logger.error(
        'Error sending WhatsApp message:',
        error.response?.data || error.message,
      )

      if (error instanceof AppError) {
        throw error
      }

      const metaError = error.response?.data?.error

      throw new AppError(
        metaError?.message || 'Failed to send WhatsApp message',
        this.getMetaErrorStatus(error.response?.status),
      )
    }
  }

  private buildMetaMessagePayload(
    to: string,
    messageData: SendMessageData,
  ): any {
    const payload: any = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: to.replace(/^\+/, ''),
      type: messageData.type,
    }

    switch (messageData.type) {
      case 'text':
        payload.text = {
          preview_url: false,
          body: String(messageData.content || ''),
        }
        break

      case 'template':
        if (!messageData.templateName) {
          throw new AppError(
            'templateName is required for template messages',
            400,
          )
        }

        payload.template = {
          name: messageData.templateName,
          language: {
            code: messageData.templateLanguage || 'en_US',
          },
          components: messageData.templateComponents || [],
        }
        break

      case 'image':
      case 'video':
      case 'audio':
      case 'document':
        payload[messageData.type] = messageData.content
        break

      case 'location':
        payload.location = messageData.content
        break

      case 'interactive':
        payload.interactive = messageData.content
        break

      default:
        throw new AppError('Unsupported WhatsApp message type', 400)
    }

    return payload
  }

  private normalizePhone(phone: string): string {
    const normalized = String(phone || '').trim()

    if (!normalized) {
      throw new AppError('Recipient phone number is required', 400)
    }

    // Existing utility is preferred for Indian CRM contacts.
    try {
      const indian = normalizeIndianPhoneNumber(normalized)

      if (indian) {
        return indian.replace(/[^\d+]/g, '')
      }
    } catch {
      // Fall through to generic normalization.
    }

    const generic = normalized.replace(/[^\d+]/g, '')

    if (generic.startsWith('+')) {
      return generic
    }

    if (generic.length === 10) {
      return `+91${generic}`
    }

    if (generic.length >= 11 && generic.length <= 15) {
      return `+${generic}`
    }

    throw new AppError(
      `Invalid WhatsApp phone number: ${phone}`,
      400,
    )
  }

  private getMetaErrorStatus(status?: number): number {
    if (!status) {
      return 502
    }

    if (status === 400) return 400
    if (status === 401 || status === 403) return 401
    if (status === 404) return 404
    if (status === 409) return 409
    if (status === 429) return 429

    return status >= 500 ? 502 : 500
  }

  // ============================================================
  // CONVERSATIONS
  // ============================================================

  async getOrCreateConversation(
    organizationId: number,
    customerPhone: string,
    phoneNumberId: string,
    wabaId: string,
  ): Promise<any> {
    const normalizedPhone = this.normalizePhone(customerPhone)

    let conversation = await WhatsAppConversation.findOne({
      organizationId,
      customerPhone: normalizedPhone,
      phoneNumberId,
      wabaId,
      deletedAt: null,
    })

    if (conversation) {
      return conversation
    }

    conversation = await WhatsAppConversation.create({
      organizationId,
      customerPhone: normalizedPhone,
      phoneNumberId,
      wabaId,
      lastMessageAt: new Date(),
      unreadCount: 0,
      isArchived: false,
      status: 'active',
      deletedAt: null,
    })

    return conversation
  }

  async createConversation(
    organizationId: number,
    contactId: number,
  ): Promise<any> {
    const contact = await Contact.findOne({
      _id: contactId,
      organizationId,
      deletedAt: null,
    })

    if (!contact) {
      throw new AppError(
        'Contact not found in this organization',
        404,
      )
    }

    if (!contact.phone) {
      throw new AppError(
        'Contact does not have a phone number',
        400,
      )
    }

    const normalizedPhone = this.normalizePhone(contact.phone)

    const account = await WhatsAppAccount.findOne({
      organizationId,
      isConnected: true,
      deletedAt: null,
    })

    if (!account) {
      throw new AppError(
        'WhatsApp account is not connected',
        400,
      )
    }

    const existingConversation =
      await WhatsAppConversation.findOne({
        organizationId,
        contactId: contact._id,
        customerPhone: normalizedPhone,
        phoneNumberId: account.phoneNumberId,
        wabaId: account.wabaId,
        deletedAt: null,
      })

    if (existingConversation) {
      return existingConversation
    }

    const displayName =
      `${contact.firstName || ''} ${contact.lastName || ''}`.trim() ||
      normalizedPhone

    return WhatsAppConversation.create({
      organizationId,
      contactId: contact._id,
      customerPhone: normalizedPhone,
      phoneNumberId: account.phoneNumberId,
      wabaId: account.wabaId,
      contactName: displayName,
      lastMessage: 'Conversation started',
      lastMessageAt: new Date(),
      unreadCount: 0,
      isArchived: false,
      status: 'active',
      deletedAt: null,
    })
  }

  async getConversations(
    organizationId: number,
    filters: {
      status?: string
      assignedTo?: number
      search?: string
      unreadOnly?: boolean
    } = {},
    page = 1,
    limit = 20,
  ): Promise<{ data: any[]; total: number }> {
    const query: any = {
      organizationId,
      deletedAt: null,
    }

    if (filters.status && filters.status !== 'all') {
      query.status = filters.status
    } else {
      query.status = { $ne: 'archived' }
    }

    if (filters.assignedTo) {
      query.assignedTo = filters.assignedTo
    }

    if (filters.unreadOnly) {
      query.unreadCount = { $gt: 0 }
    }

    if (filters.search) {
      query.$or = [
        {
          customerPhone: {
            $regex: filters.search,
            $options: 'i',
          },
        },
        {
          contactName: {
            $regex: filters.search,
            $options: 'i',
          },
        },
      ]
    }

    const skip = Math.max(0, page - 1) * limit

    const [data, total] = await Promise.all([
      WhatsAppConversation.find(query)
        .sort({ lastMessageAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('contactId', 'firstName lastName email phone')
        .populate('assignedTo', 'firstName lastName email')
        .lean(),

      WhatsAppConversation.countDocuments(query),
    ])

    return {
      data,
      total,
    }
  }

  async getConversationMessages(
    organizationId: number,
    conversationId: number,
    limit = 50,
    before?: Date,
  ): Promise<any[]> {
    const query: any = {
      organizationId,
      conversationId,
      deletedAt: null,
    }

    if (before) {
      query.createdAt = {
        $lt: before,
      }
    }

    return WhatsAppMessage.find(query)
      .sort({ createdAt: -1 })
      .limit(Math.min(limit, 100))
      .lean()
  }

  async markConversationRead(
    organizationId: number,
    conversationId: number,
  ): Promise<void> {
    await WhatsAppConversation.updateOne(
      {
        organizationId,
        _id: conversationId,
        deletedAt: null,
      },
      {
        unreadCount: 0,
      },
    )
  }

  async assignConversation(
    organizationId: number,
    conversationId: number,
    userId: number,
  ): Promise<void> {
    await WhatsAppConversation.updateOne(
      {
        organizationId,
        _id: conversationId,
        deletedAt: null,
      },
      {
        assignedTo: userId,
      },
    )
  }

  async archiveConversation(
    organizationId: number,
    conversationId: number,
  ): Promise<void> {
    await WhatsAppConversation.updateOne(
      {
        organizationId,
        _id: conversationId,
        deletedAt: null,
      },
      {
        status: 'archived',
        isArchived: true,
      },
    )
  }

  async getUnreadCount(organizationId: number): Promise<number> {
    const result = await WhatsAppConversation.aggregate([
      {
        $match: {
          organizationId,
          deletedAt: null,
          status: { $ne: 'archived' },
          unreadCount: { $gt: 0 },
        },
      },
      {
        $group: {
          _id: null,
          total: {
            $sum: '$unreadCount',
          },
        },
      },
    ])

    return result[0]?.total || 0
  }

  // ============================================================
  // WEBHOOKS
  // ============================================================

  async processWebhook(
    organizationId: number | null,
    payload: any,
  ): Promise<void> {
    let webhookLog: any = null

    try {
      webhookLog = await WhatsAppWebhookLog.create({
        organizationId: organizationId || undefined,
        event:
          payload?.entry?.[0]?.changes?.[0]?.field ||
          'unknown',
        payload,
        headers: {},
        processed: false,
      })

      if (!organizationId) {
        logger.warn(
          'WhatsApp webhook received but organization could not be resolved',
        )

        return
      }

      const entries = payload?.entry || []

      for (const entry of entries) {
        for (const change of entry.changes || []) {
          const value = change?.value

          if (!value) {
            continue
          }

          if (Array.isArray(value.messages) && value.messages.length) {
            await this.processMessages(
              organizationId,
              value,
            )
          }

          if (Array.isArray(value.statuses) && value.statuses.length) {
            await this.processStatusUpdates(
              organizationId,
              value.statuses,
            )
          }

          if (Array.isArray(value.contacts) && value.contacts.length) {
            await this.processContacts(
              organizationId,
              value.contacts,
            )
          }
        }
      }

      if (webhookLog?._id) {
        await WhatsAppWebhookLog.updateOne(
          {
            _id: webhookLog._id,
            organizationId,
          },
          {
            processed: true,
            processedAt: new Date(),
          },
        )
      }
    } catch (error: any) {
      logger.error(
        'Error processing WhatsApp webhook:',
        error.message,
      )

      if (webhookLog?._id) {
        await WhatsAppWebhookLog.updateOne(
          {
            _id: webhookLog._id,
          },
          {
            processed: false,
            errorMessage: error.message,
          },
        )
      }

      throw error
    }
  }

  private async processMessages(
    organizationId: number,
    value: any,
  ): Promise<void> {
    const messages = value.messages || []

    for (const message of messages) {
      const from = message?.from
      const phoneNumberId = value.metadata?.phone_number_id
      const wabaId = value.metadata?.waba_id

      if (!from || !phoneNumberId || !wabaId || !message.id) {
        logger.warn(
          'WhatsApp webhook message missing required fields',
        )

        continue
      }

      // Prevent duplicate inbound webhook processing.
      const existingMessage =
        await WhatsAppMessage.findOne({
          organizationId,
          messageId: message.id,
        })

      if (existingMessage) {
        continue
      }

      const conversation =
        await this.getOrCreateConversation(
          organizationId,
          from,
          phoneNumberId,
          wabaId,
        )

      const contactProfile = value.contacts?.find(
        (item: any) =>
          item?.wa_id === String(from),
      )

      await WhatsAppMessage.create({
        organizationId,
        conversationId: conversation._id,
        messageId: message.id,
        from,
        to: phoneNumberId,
        direction: 'inbound',
        type: message.type,
        content: message,
        status: 'delivered',
        deliveredAt: new Date(),
      })

      await WhatsAppConversation.updateOne(
        {
          organizationId,
          _id: conversation._id,
        },
        {
          lastMessageAt: new Date(),
          lastMessage: this.getWebhookMessagePreview(message),
          unreadCount: (conversation.unreadCount || 0) + 1,
          status: 'active',
          isArchived: false,
          ...(contactProfile?.profile?.name
            ? {
                contactName:
                  contactProfile.profile.name,
              }
            : {}),
        },
      )

      await this.linkContactToConversation(
        organizationId,
        from,
        conversation._id,
      )
    }
  }

  private getWebhookMessagePreview(message: any): string {
    if (message.type === 'text') {
      return message.text?.body || ''
    }

    if (message.type === 'image') return '[Image]'
    if (message.type === 'video') return '[Video]'
    if (message.type === 'audio') return '[Audio]'
    if (message.type === 'document') return '[Document]'
    if (message.type === 'location') return '[Location]'
    if (message.type === 'interactive') return '[Interactive]'

    return `[${message.type || 'Message'}]`
  }

  private async processStatusUpdates(
    organizationId: number,
    statuses: any[],
  ): Promise<void> {
    for (const status of statuses) {
      if (!status?.id || !status?.status) {
        continue
      }

      const message = await WhatsAppMessage.findOne({
        organizationId,
        messageId: status.id,
      })

      if (!message) {
        continue
      }

      const updateData: any = {
        status: status.status,
      }

      if (status.errors?.[0]) {
        updateData.statusCode =
          status.errors[0].code

        updateData.errorMessage =
          status.errors[0].message
      }

      if (status.status === 'sent') {
        updateData.sentAt =
          message.sentAt || new Date()
      }

      if (status.status === 'delivered') {
        updateData.deliveredAt = new Date()
      }

      if (status.status === 'read') {
        updateData.readAt = new Date()
      }

      if (status.status === 'failed') {
        updateData.status = 'failed'
      }

      await WhatsAppMessage.updateOne(
        {
          organizationId,
          messageId: status.id,
        },
        updateData,
      )

      const campaignRecipient =
        await WhatsAppCampaignRecipient.findOne({
          organizationId,
          messageId: status.id,
        })

      if (!campaignRecipient) {
        continue
      }

      const recipientUpdate: any = {
        status: status.status,
      }

      if (status.status === 'sent') {
        recipientUpdate.sentAt =
          campaignRecipient.sentAt || new Date()
      }

      if (status.status === 'delivered') {
        recipientUpdate.deliveredAt = new Date()
      }

      if (status.status === 'read') {
        recipientUpdate.readAt = new Date()
      }

      if (status.status === 'failed') {
        recipientUpdate.errorMessage =
          status.errors?.[0]?.message ||
          'WhatsApp message failed'
      }

      await WhatsAppCampaignRecipient.updateOne(
        {
          organizationId,
          _id: campaignRecipient._id,
        },
        recipientUpdate,
      )

      await this.recalculateCampaignStats(
        organizationId,
        campaignRecipient.campaignId,
      )
    }
  }

  private async processContacts(
    organizationId: number,
    contacts: any[],
  ): Promise<void> {
    for (const metaContact of contacts) {
      const phone = metaContact?.wa_id

      if (!phone) {
        continue
      }

      try {
        const normalizedPhone =
          this.normalizePhone(phone)

        const contact =
          await Contact.findOne({
            organizationId,
            phone: normalizedPhone,
            deletedAt: null,
          })

        if (contact) {
          continue
        }

        // Do not invent a Contact schema shape here.
        // Existing CRM contacts should be linked when they already exist.
        logger.info(
          `WhatsApp contact ${normalizedPhone} is not linked to an existing CRM contact`,
        )
      } catch (error: any) {
        logger.error(
          `Error processing WhatsApp contact ${phone}:`,
          error.message,
        )
      }
    }
  }

  private async linkContactToConversation(
    organizationId: number,
    phoneNumber: string,
    conversationId: number,
  ): Promise<void> {
    try {
      const normalizedPhone =
        this.normalizePhone(phoneNumber)

      const contact = await Contact.findOne({
        organizationId,
        phone: normalizedPhone,
        deletedAt: null,
      })

      if (!contact) {
        return
      }

      await WhatsAppConversation.updateOne(
        {
          organizationId,
          _id: conversationId,
        },
        {
          contactId: contact._id,
        },
      )
    } catch (error: any) {
      logger.error(
        'Error linking WhatsApp contact to conversation:',
        error.message,
      )
    }
  }

  // ============================================================
  // BULK CAMPAIGNS
  // ============================================================

  async createCampaign(
    organizationId: number,
    campaignData: {
      name: string
      templateId: number
      recipients: string[]
      variables: Record<string, any>
      scheduledAt?: Date
      createdBy: number
    },
  ): Promise<any> {
    const template =
      await WhatsAppMetaTemplate.findOne({
        organizationId,
        _id: campaignData.templateId,
        deletedAt: null,
      })

    if (!template) {
      throw new AppError(
        'WhatsApp template not found',
        404,
      )
    }

    if (template.status !== 'APPROVED') {
      throw new AppError(
        `WhatsApp template is ${template.status}. Only APPROVED templates can be used for campaigns.`,
        400,
      )
    }

    if (!campaignData.recipients?.length) {
      throw new AppError(
        'At least one recipient is required',
        400,
      )
    }

    const normalizedRecipients =
      this.normalizeAndDeduplicateRecipients(
        campaignData.recipients,
      )

    if (!normalizedRecipients.length) {
      throw new AppError(
        'No valid WhatsApp recipients were provided',
        400,
      )
    }

    const campaign =
      await WhatsAppCampaign.create({
        organizationId,
        name: campaignData.name.trim(),
        templateId: campaignData.templateId,
        status: 'queued',
        recipients: normalizedRecipients,
        variables: campaignData.variables || {},
        scheduledAt:
          campaignData.scheduledAt || new Date(),
        stats: {
          total: normalizedRecipients.length,
          sent: 0,
          delivered: 0,
          read: 0,
          failed: 0,
          replied: 0,
        },
        createdBy: campaignData.createdBy,
      })

    const recipientDocuments =
      normalizedRecipients.map((phone) => ({
        organizationId,
        campaignId: campaign._id,
        phoneNumber: phone,
        status: 'pending',
      }))

    await WhatsAppCampaignRecipient.insertMany(
      recipientDocuments,
    )

    return campaign
  }

  private normalizeAndDeduplicateRecipients(
    recipients: string[],
  ): string[] {
    const unique = new Set<string>()

    for (const recipient of recipients) {
      try {
        unique.add(
          this.normalizePhone(recipient),
        )
      } catch {
        // Invalid recipients are excluded from the campaign.
      }
    }

    return Array.from(unique)
  }

  /**
   * Execute one queued campaign.
   *
   * This is intended to be called by whatsapp.cron.ts.
   */
  async executeCampaign(
    campaignId: number,
  ): Promise<void> {
    // Atomically claim the campaign.
    const campaign =
      await WhatsAppCampaign.findOneAndUpdate(
        {
          _id: campaignId,
          deletedAt: null,
          status: {
            $in: ['queued', 'draft'],
          },
          $or: [
            {
              scheduledAt: {
                $exists: false,
              },
            },
            {
              scheduledAt: null,
            },
            {
              scheduledAt: {
                $lte: new Date(),
              },
            },
          ],
        },
        {
          status: 'running',
          sentAt: new Date(),
        },
        {
          new: true,
        },
      )

    if (!campaign) {
      return
    }

    const organizationId =
      campaign.organizationId

    try {
      const { account } =
        await this.getAccountWithToken(
          organizationId,
        )

      const template =
        await WhatsAppMetaTemplate.findOne({
          organizationId,
          _id: campaign.templateId,
          deletedAt: null,
        })

      if (!template) {
        throw new AppError(
          'Campaign template not found',
          404,
        )
      }

      if (template.status !== 'APPROVED') {
        throw new AppError(
          'Campaign template is no longer approved',
          400,
        )
      }

      const batchSize = 10
      const delayBetweenBatchesMs =
        this.getCampaignBatchDelay()

      while (true) {
        const recipients =
          await WhatsAppCampaignRecipient.find({
            organizationId,
            campaignId: campaign._id,
            status: 'pending',
          })
            .sort({ _id: 1 })
            .limit(batchSize)
            .lean()

        if (!recipients.length) {
          break
        }

        for (const recipient of recipients) {
          const currentCampaign =
            await WhatsAppCampaign.findOne({
              organizationId,
              _id: campaign._id,
              status: 'running',
              deletedAt: null,
            }).lean()

          if (!currentCampaign) {
            return
          }

          try {
            const templateComponents =
              this.buildCampaignTemplateComponents(
                template.components || [],
                campaign.variables || {},
              )

            await this.sendMessage(
              organizationId,
              {
                to: recipient.phoneNumber,
                type: 'template',
                content: {},
                templateName: template.name,
                templateLanguage:
                  template.language || 'en_US',
                templateComponents,
                metadata: {
                  campaignId:
                    campaign._id,
                  campaignRecipientId:
                    recipient._id,
                },
              },
            )
          } catch (error: any) {
            await WhatsAppCampaignRecipient.updateOne(
              {
                organizationId,
                _id: recipient._id,
                status: 'pending',
              },
              {
                status: 'failed',
                errorMessage:
                  error.message ||
                  'Failed to send WhatsApp message',
              },
            )

            logger.error(
              `Campaign ${campaign._id}: failed to send ${recipient.phoneNumber}:`,
              error.message,
            )
          }
        }

        await this.recalculateCampaignStats(
          organizationId,
          campaign._id,
        )

        if (recipients.length === batchSize) {
          await this.sleep(
            delayBetweenBatchesMs,
          )
        }
      }

      await this.recalculateCampaignStats(
        organizationId,
        campaign._id,
      )

      await WhatsAppCampaign.updateOne(
        {
          organizationId,
          _id: campaign._id,
          status: 'running',
        },
        {
          status: 'completed',
          completedAt: new Date(),
        },
      )

      logger.info(
        `WhatsApp campaign ${campaign._id} completed`,
      )
    } catch (error: any) {
      await WhatsAppCampaign.updateOne(
        {
          organizationId,
          _id: campaign._id,
        },
        {
          status: 'failed',
        },
      )

      logger.error(
        `WhatsApp campaign ${campaign._id} failed:`,
        error.message,
      )

      throw error
    }
  }

  private buildCampaignTemplateComponents(
    components: any[],
    variables: Record<string, any>,
  ): any[] {
    const result: any[] = []

    for (const component of components) {
      if (
        component.type === 'BODY' &&
        component.text
      ) {
        const bodyMatches =
          component.text.match(
            /{{\s*([^}]+?)\s*}}/g,
          ) || []

        if (!bodyMatches.length) {
          continue
        }

        const parameters = bodyMatches.map(
          (match: string) => {
            const key = match
              .replace('{{', '')
              .replace('}}', '')
              .trim()

            return {
              type: 'text',
              text: String(
                variables[key] ??
                  variables[String(
                    bodyMatches.indexOf(match) + 1,
                  )] ??
                  '',
              ),
            }
          },
        )

        result.push({
          type: 'body',
          parameters,
        })

        continue
      }

      if (
        component.type === 'HEADER' &&
        component.format === 'TEXT' &&
        component.text
      ) {
        const matches =
          component.text.match(
            /{{\s*([^}]+?)\s*}}/g,
          ) || []

        if (matches.length) {
          result.push({
            type: 'header',
            parameters: matches.map(
              (match: string) => {
                const key = match
                  .replace('{{', '')
                  .replace('}}', '')
                  .trim()

                return {
                  type: 'text',
                  text: String(
                    variables[key] ?? '',
                  ),
                }
              },
            ),
          })
        }
      }
    }

    return result
  }

  private getCampaignBatchDelay(): number {
    const value = Number(
      process.env.WHATSAPP_CAMPAIGN_BATCH_DELAY_MS ||
        1000,
    )

    if (!Number.isFinite(value) || value < 0) {
      return 1000
    }

    return value
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) =>
      setTimeout(resolve, ms),
    )
  }

  private async recalculateCampaignStats(
    organizationId: number,
    campaignId: number,
  ): Promise<void> {
    const grouped =
      await WhatsAppCampaignRecipient.aggregate([
        {
          $match: {
            organizationId,
            campaignId,
          },
        },
        {
          $group: {
            _id: '$status',
            count: {
              $sum: 1,
            },
          },
        },
      ])

    const stats = {
      total: 0,
      sent: 0,
      delivered: 0,
      read: 0,
      failed: 0,
      replied: 0,
    }

    for (const item of grouped) {
      const status = item._id
      const count = Number(item.count || 0)

      stats.total += count

      if (status === 'sent') {
        stats.sent += count
      }

      if (status === 'delivered') {
        stats.delivered += count
      }

      if (status === 'read') {
        stats.read += count
      }

      if (status === 'failed') {
        stats.failed += count
      }
    }

    await WhatsAppCampaign.updateOne(
      {
        organizationId,
        _id: campaignId,
      },
      {
        stats,
      },
    )
  }

  async getCampaigns(
    organizationId: number,
    page = 1,
    limit = 20,
  ): Promise<{
    data: any[]
    total: number
  }> {
    const query = {
      organizationId,
      deletedAt: null,
    }

    const skip = Math.max(0, page - 1) * limit

    const [data, total] =
      await Promise.all([
        WhatsAppCampaign.find(query)
          .sort({
            createdAt: -1,
          })
          .skip(skip)
          .limit(Math.min(limit, 100))
          .populate(
            'templateId',
            'name category language status',
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

    return {
      data,
      total,
    }
  }

  async getCampaignStats(
    organizationId: number,
    campaignId: number,
  ): Promise<any> {
    const campaign =
      await WhatsAppCampaign.findOne({
        organizationId,
        _id: campaignId,
        deletedAt: null,
      })
        .populate(
          'templateId',
          'name category language status',
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

    const recipientStats =
      await WhatsAppCampaignRecipient.aggregate(
        [
          {
            $match: {
              organizationId,
              campaignId,
            },
          },
          {
            $group: {
              _id: '$status',
              count: {
                $sum: 1,
              },
            },
          },
        ],
      )

    const stats: Record<
      string,
      number
    > = {}

    for (const item of recipientStats) {
      stats[item._id] =
        Number(item.count || 0)
    }

    return {
      ...campaign,
      recipientStats: stats,
    }
  }

  async getCampaignRecipients(
    organizationId: number,
    campaignId: number,
    page = 1,
    limit = 20,
  ): Promise<{
    data: any[]
    total: number
  }> {
    const query = {
      organizationId,
      campaignId,
    }

    const skip =
      Math.max(0, page - 1) * limit

    const [data, total] =
      await Promise.all([
        WhatsAppCampaignRecipient.find(
          query,
        )
          .sort({
            _id: 1,
          })
          .skip(skip)
          .limit(Math.min(limit, 100))
          .populate(
            'contactId',
            'firstName lastName email phone',
          )
          .lean(),

        WhatsAppCampaignRecipient.countDocuments(
          query,
        ),
      ])

    return {
      data,
      total,
    }
  }

  async cancelCampaign(
    organizationId: number,
    campaignId: number,
  ): Promise<void> {
    const campaign =
      await WhatsAppCampaign.findOne({
        organizationId,
        _id: campaignId,
        deletedAt: null,
        status: {
          $in: [
            'draft',
            'queued',
            'running',
          ],
        },
      })

    if (!campaign) {
      throw new AppError(
        'Campaign not found or cannot be cancelled',
        404,
      )
    }

    await WhatsAppCampaign.updateOne(
      {
        organizationId,
        _id: campaignId,
      },
      {
        status: 'cancelled',
      },
    )
  }

  async deleteCampaign(
    organizationId: number,
    campaignId: number,
  ): Promise<void> {
    const campaign =
      await WhatsAppCampaign.findOne({
        organizationId,
        _id: campaignId,
        deletedAt: null,
      })

    if (!campaign) {
      throw new AppError(
        'Campaign not found',
        404,
      )
    }

    if (
      campaign.status === 'running'
    ) {
      throw new AppError(
        'Running campaigns cannot be deleted',
        400,
      )
    }

    await WhatsAppCampaign.updateOne(
      {
        organizationId,
        _id: campaignId,
      },
      {
        deletedAt: new Date(),
      },
    )
  }
}

export const whatsappService =
  WhatsAppService.getInstance()
