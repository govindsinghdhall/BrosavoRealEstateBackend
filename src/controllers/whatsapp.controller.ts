import type { Request, Response, NextFunction } from 'express'
import { z } from 'zod'
import { getOrganizationById, updateOrganizationById } from '../services/organization.service'
import {
  createWhatsAppTemplate,
  deleteWhatsAppTemplate,
  getOrganizationWhatsAppTemplates,
  getWhatsAppTemplateById,
  sendWhatsAppMessages,
  updateWhatsAppTemplate,
} from '../services/whatsapp.service'
import { success } from '../utils/response'
import { NotFoundError, AppError } from '../utils/errors'

const updateSettingsSchema = z.object({
  businessPhone: z.string().trim().optional(),
  businessId: z.string().trim().optional(),
  displayName: z.string().trim().optional(),
})

const templatePayloadSchema = z.object({
  name: z.string().min(1),
  message: z.string().min(1),
})

const sendMessageSchema = z.object({
  contactIds: z.array(z.number().int().positive()).nonempty(),
  templateId: z.number().int().positive().optional(),
  customMessage: z.string().trim().optional(),
}).refine((data) => !!data.templateId || !!data.customMessage, {
  message: 'Either templateId or customMessage is required.',
})

export async function getWhatsAppSettings(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.auth) throw new AppError('Unauthorized', 401)

    const organization = await getOrganizationById(req.auth.organizationId)
    return success(res, organization.settings?.whatsapp ?? null)
  } catch (error) {
    next(error)
  }
}

export async function updateWhatsAppSettings(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.auth) throw new AppError('Unauthorized', 401)

    const payload = updateSettingsSchema.parse(req.body)
    const organization = await updateOrganizationById(req.auth.organizationId, {
      settings: {
        ...((await getOrganizationById(req.auth.organizationId)).settings ?? {}),
        whatsapp: {
          businessPhone: payload.businessPhone || undefined,
          businessId: payload.businessId || undefined,
          displayName: payload.displayName || undefined,
        },
      },
    })

    return success(res, organization.settings?.whatsapp ?? null, 'WhatsApp settings updated')
  } catch (error) {
    next(error)
  }
}

export async function listWhatsAppTemplates(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.auth) throw new NotFoundError('Unauthorized')
    const templates = await getOrganizationWhatsAppTemplates(req.auth.organizationId)
    return success(res, templates)
  } catch (error) {
    next(error)
  }
}

export async function createWhatsAppTemplateController(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.auth) throw new NotFoundError('Unauthorized')
    const payload = templatePayloadSchema.parse(req.body)
    const template = await createWhatsAppTemplate(req.auth.organizationId, payload)
    return success(res, template, 'WhatsApp template created')
  } catch (error) {
    next(error)
  }
}

export async function updateWhatsAppTemplateController(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.auth) throw new NotFoundError('Unauthorized')
    const templateId = Number(req.params.id)
    if (!templateId) throw new NotFoundError('Invalid template id')
    const payload = templatePayloadSchema.parse(req.body)
    const template = await updateWhatsAppTemplate(req.auth.organizationId, templateId, payload)
    return success(res, template, 'WhatsApp template updated')
  } catch (error) {
    next(error)
  }
}

export async function deleteWhatsAppTemplateController(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.auth) throw new NotFoundError('Unauthorized')
    const templateId = Number(req.params.id)
    if (!templateId) throw new NotFoundError('Invalid template id')
    await deleteWhatsAppTemplate(req.auth.organizationId, templateId)
    return success(res, null, 'WhatsApp template deleted')
  } catch (error) {
    next(error)
  }
}

export async function sendWhatsAppMessage(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.auth) throw new AppError('Unauthorized', 401)
    const payload = sendMessageSchema.parse(req.body)

    const template = payload.templateId
      ? await getWhatsAppTemplateById(req.auth.organizationId, payload.templateId)
      : null

    const message = payload.customMessage || template?.message || ''
    const templateName = template?.name
    const languageCode = 'en_US'

    const result = await sendWhatsAppMessages(
      req.auth.organizationId,
      payload.contactIds,
      message,
      templateName,
      languageCode,
    )

    return success(res, result, 'WhatsApp message sent')
  } catch (error) {
    next(error)
  }
}
