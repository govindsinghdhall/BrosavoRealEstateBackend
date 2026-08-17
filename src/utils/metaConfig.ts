export function getMetaAppId(): string | undefined {
  return process.env.WHATSAPP_CLIENT_ID || process.env.META_APP_ID
}

export function getMetaAppSecret(): string | undefined {
  return process.env.WHATSAPP_CLIENT_SECRET || process.env.META_APP_SECRET
}

export function getMetaGraphApiVersion(): string {
  return (
    process.env.WHATSAPP_GRAPH_API_VERSION ||
    process.env.META_GRAPH_API_VERSION ||
    'v26.0'
  )
}

export function getMetaWebhookVerifyToken(): string | undefined {
  return (
    process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN ||
    process.env.META_WEBHOOK_VERIFY_TOKEN
  )
}

export function getMetaApiBase(): string {
  return process.env.WHATSAPP_API_BASE_URL || 'https://graph.facebook.com'
}

export function getEncryptionKeySource(): string | undefined {
  return process.env.ENCRYPTION_KEY || process.env.META_ENCRYPTION_KEY
}
