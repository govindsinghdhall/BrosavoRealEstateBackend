import { Router } from 'express'
import { WhatsAppController } from '../controllers/WhatsAppController'
import { WebhookController } from '../controllers/WebhookController'
import { authenticate, requirePermission } from '../middleware/auth'

const router = Router()

const whatsappController = new WhatsAppController()
const webhookController = new WebhookController()

// ============================================================
// PUBLIC ROUTES
// ============================================================

// ============================================================
// META WHATSAPP WEBHOOK
// ============================================================
//
// IMPORTANT:
// This endpoint is used by Meta for BOTH:
// 1. GET  -> webhook verification
// 2. POST -> incoming WhatsApp events
//
// Do NOT put organizationId in the URL.
// The organization will be resolved from the WhatsApp
// phone_number_id / WABA information in the webhook payload.
//

router.get(
  '/webhooks/whatsapp',
  webhookController.verifyWebhook,
)

router.post(
  '/webhooks/whatsapp',
  webhookController.receiveWebhook,
)

// ============================================================
// META OAUTH CALLBACK
// ============================================================
//
// This is completely separate from the WhatsApp webhook.
//
// Meta OAuth redirects here after a user connects WhatsApp.
//

router.get(
  '/whatsapp/callback',
  whatsappController.oauthCallback,
)

// ============================================================
// PROTECTED ROUTES
// ============================================================

router.use(authenticate)

// ============================================================
// WHATSAPP CONNECTION / OAUTH
// ============================================================

// Generate Meta OAuth URL
router.get(
  '/whatsapp/auth-url',
  requirePermission('whatsapp.manage'),
  whatsappController.getAuthUrl,
)

// Get connected WhatsApp account settings
router.get(
  '/whatsapp/settings',
  requirePermission('whatsapp.read'),
  whatsappController.getSettings,
)

router.get(
  '/whatsapp/connection',
  requirePermission('whatsapp.read'),
  whatsappController.getSettings,
)

router.post(
  '/whatsapp/connect/initiate',
  requirePermission('whatsapp.manage'),
  whatsappController.initiateEmbeddedSignup,
)

router.post(
  '/whatsapp/test',
  requirePermission('whatsapp.read'),
  whatsappController.testConnection,
)

// Connect WhatsApp account
router.post(
  '/whatsapp/connect',
  requirePermission('whatsapp.manage'),
  whatsappController.connectAccount,
)

// Disconnect WhatsApp account
router.post(
  '/whatsapp/disconnect',
  requirePermission('whatsapp.manage'),
  whatsappController.disconnectAccount,
)

// Refresh WhatsApp account/token information
router.post(
  '/whatsapp/refresh',
  requirePermission('whatsapp.manage'),
  whatsappController.refreshAccount,
)

// ============================================================
// TEMPLATES
// ============================================================

// Get Meta WhatsApp templates
router.get(
  '/whatsapp/templates',
  requirePermission('whatsapp.read'),
  whatsappController.getTemplates,
)

// Sync templates from Meta
router.post(
  '/whatsapp/templates/sync',
  requirePermission('whatsapp.manage'),
  whatsappController.syncTemplates,
)

// ============================================================
// INDIVIDUAL MESSAGES
// ============================================================

// Send a single WhatsApp message
router.post(
  '/whatsapp/send',
  requirePermission('whatsapp.send'),
  whatsappController.sendMessage,
)

router.post(
  '/whatsapp/messages',
  requirePermission('whatsapp.send'),
  whatsappController.sendCrmMessage,
)

// ============================================================
// CONVERSATIONS / INBOX
// ============================================================

// List conversations
router.get(
  '/whatsapp/conversations',
  requirePermission('whatsapp.read'),
  whatsappController.getConversations,
)

// Create/find conversation
router.post(
  '/whatsapp/conversations',
  requirePermission('whatsapp.send'),
  whatsappController.createConversation,
)

// Get conversation messages
router.get(
  '/whatsapp/conversations/:conversationId/messages',
  requirePermission('whatsapp.read'),
  whatsappController.getConversationMessages,
)

// Mark conversation as read
router.post(
  '/whatsapp/conversations/:conversationId/read',
  requirePermission('whatsapp.send'),
  whatsappController.markRead,
)

// Assign conversation to CRM user
router.post(
  '/whatsapp/conversations/:conversationId/assign',
  requirePermission('whatsapp.manage'),
  whatsappController.assignConversation,
)

// Archive conversation
router.post(
  '/whatsapp/conversations/:conversationId/archive',
  requirePermission('whatsapp.manage'),
  whatsappController.archiveConversation,
)

// Get unread conversation count
router.get(
  '/whatsapp/unread',
  requirePermission('whatsapp.read'),
  whatsappController.getUnreadCount,
)

// ============================================================
// BULK WHATSAPP CAMPAIGNS
// ============================================================

// List campaigns
router.get(
  '/whatsapp/campaigns',
  requirePermission('whatsapp.campaign'),
  whatsappController.getCampaigns,
)

// Create / schedule bulk campaign
router.post(
  '/whatsapp/campaigns',
  requirePermission('whatsapp.campaign'),
  whatsappController.createCampaign,
)

// Get campaign statistics
router.get(
  '/whatsapp/campaigns/:campaignId/stats',
  requirePermission('whatsapp.campaign'),
  whatsappController.getCampaignStats,
)

// Get campaign recipients
router.get(
  '/whatsapp/campaigns/:campaignId/recipients',
  requirePermission('whatsapp.campaign'),
  whatsappController.getCampaignRecipients,
)

// Cancel campaign
router.post(
  '/whatsapp/campaigns/:campaignId/cancel',
  requirePermission('whatsapp.campaign'),
  whatsappController.cancelCampaign,
)

// Delete campaign
router.delete(
  '/whatsapp/campaigns/:campaignId',
  requirePermission('whatsapp.campaign'),
  whatsappController.deleteCampaign,
)

// ============================================================
// WEBHOOK LOGS
// ============================================================

// View webhook logs
router.get(
  '/whatsapp/webhook-logs',
  requirePermission('whatsapp.manage'),
  webhookController.getWebhookLogs,
)

// ============================================================
// META EMBEDDED SIGNUP
// ============================================================

// Complete Meta Embedded Signup
router.post(
  '/whatsapp/embedded-signup',
  requirePermission('whatsapp.manage'),
  whatsappController.completeEmbeddedSignup,
)

export default router