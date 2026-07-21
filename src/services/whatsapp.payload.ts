export interface WhatsAppTemplatePayloadOptions {
  templateName?: string
  languageCode?: string
  message?: string
}

export function buildWhatsAppPayload(to: string, options: WhatsAppTemplatePayloadOptions) {
  if (options.templateName) {
    return {
      messaging_product: 'whatsapp',
      to,
      type: 'template',
      template: {
        name: options.templateName,
        language: { code: options.languageCode ?? 'en_US' },
      },
    }
  }

  return {
    messaging_product: 'whatsapp',
    to,
    type: 'text',
    text: {
      body: options.message ?? '',
    },
  }
}
