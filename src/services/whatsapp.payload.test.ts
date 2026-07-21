import test from 'node:test'
import assert from 'node:assert/strict'
import { buildWhatsAppPayload } from './whatsapp.payload'

test('buildWhatsAppPayload returns a Meta template payload when a template name is provided', () => {
  const payload = buildWhatsAppPayload('919999107733', {
    templateName: 'jaspers_market_plain_text_v1',
    languageCode: 'en_US',
  })

  assert.deepEqual(payload, {
    messaging_product: 'whatsapp',
    to: '919999107733',
    type: 'template',
    template: {
      name: 'jaspers_market_plain_text_v1',
      language: { code: 'en_US' },
    },
  })
})

test('buildWhatsAppPayload returns a text payload for custom messages', () => {
  const payload = buildWhatsAppPayload('919999107733', {
    message: 'Hello from CRM',
  })

  assert.deepEqual(payload, {
    messaging_product: 'whatsapp',
    to: '919999107733',
    type: 'text',
    text: {
      body: 'Hello from CRM',
    },
  })
})
