import { env } from '../config/env'
import { WhatsAppTemplate } from '../models/WhatsAppTemplate'
import { Contact } from '../models/Contact'
import { AppError, NotFoundError } from '../utils/errors'
import { buildWhatsAppPayload } from './whatsapp.payload'

interface WhatsAppTemplateResponse {
  id: number
  name: string
  message: string
  createdAt: string
  updatedAt: string
}

export async function getOrganizationWhatsAppTemplates(organizationId: number) {
  const templates = await WhatsAppTemplate.find({ organizationId }).sort({ createdAt: -1 })
  return templates.map((template) => serializeWhatsAppTemplate(template))
}

export async function getWhatsAppTemplateById(organizationId: number, templateId: number) {
  const template = await WhatsAppTemplate.findOne({ _id: templateId, organizationId })
  if (!template) throw new NotFoundError('WhatsApp template not found')
  return serializeWhatsAppTemplate(template)
}

export async function createWhatsAppTemplate(organizationId: number, payload: { name: string; message: string }) {
  const template = await WhatsAppTemplate.create({ organizationId, ...payload })
  return serializeWhatsAppTemplate(template)
}

export async function updateWhatsAppTemplate(
  organizationId: number,
  templateId: number,
  payload: { name: string; message: string },
) {
  const template = await WhatsAppTemplate.findOneAndUpdate(
    { _id: templateId, organizationId },
    { $set: payload },
    { new: true, runValidators: true },
  )
  if (!template) throw new NotFoundError('WhatsApp template not found')
  return serializeWhatsAppTemplate(template)
}

export async function deleteWhatsAppTemplate(organizationId: number, templateId: number) {
  const template = await WhatsAppTemplate.findOneAndDelete({ _id: templateId, organizationId })
  if (!template) throw new NotFoundError('WhatsApp template not found')
}

export async function sendWhatsAppMessages(
  organizationId: number,
  contactIds: number[],
  message: string,
  templateName?: string,
  languageCode?: string,
) {
  if (!message) {
    throw new AppError('WhatsApp message body is required', 400)
  }

  const contacts = await Contact.find({
    _id: { $in: contactIds },
    organizationId,
    deletedAt: null,
  })

  if (contacts.length !== contactIds.length) {
    throw new NotFoundError('One or more contacts were not found')
  }

  const phoneNumberId = env.WHATSAPP_PHONE_NUMBER_ID
  const accessToken = env.WHATSAPP_ACCESS_TOKEN
  if (!phoneNumberId || !accessToken) {
    throw new AppError('WhatsApp API credentials are not configured', 500)
  }

  const endpoint = new URL(`${env.WHATSAPP_API_BASE_URL}/${env.WHATSAPP_GRAPH_API_VERSION}/${phoneNumberId}/messages`)

  const sendTasks = contacts.map(async (contact) => {
    const to = String(contact.phone).trim()
    const payload = buildWhatsAppPayload(to, {
      templateName,
      languageCode,
      message,
    })

    const response = await fetch(endpoint.toString(), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })

    if (!response.ok) {
      const body = await response.text()
      return { success: false, error: `Failed to send to ${to}: ${response.status} ${body}` }
    }

    return { success: true }
  })

  const results = await Promise.all(sendTasks)
  const sentCount = results.filter((item) => item.success).length
  const errors = results.filter((item) => !item.success).map((item) => item.error ?? 'Unknown error')

  return {
    success: errors.length === 0,
    sentCount,
    failedCount: errors.length,
    errors,
  }
}

function serializeWhatsAppTemplate(template: typeof WhatsAppTemplate.prototype): WhatsAppTemplateResponse {
  return {
    id: template._id,
    name: template.name,
    message: template.message,
    createdAt: template.createdAt.toISOString(),
    updatedAt: template.updatedAt.toISOString(),
  }
}
