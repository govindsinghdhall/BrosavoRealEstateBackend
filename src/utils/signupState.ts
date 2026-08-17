import crypto from 'crypto'
import { AppError } from './errors'

const STATE_TTL_MS = 15 * 60 * 1000

interface SignupStatePayload {
  organizationId: number
  userId: number
  nonce: string
  exp: number
}

function getStateSecret(): string {
  const secret =
    process.env.ENCRYPTION_KEY ||
    process.env.META_ENCRYPTION_KEY ||
    process.env.JWT_SECRET

  if (!secret) {
    throw new AppError('Unable to sign WhatsApp signup state', 500)
  }

  return secret
}

export function createEmbeddedSignupState(
  organizationId: number,
  userId: number,
): string {
  const payload: SignupStatePayload = {
    organizationId,
    userId,
    nonce: crypto.randomBytes(16).toString('hex'),
    exp: Date.now() + STATE_TTL_MS,
  }

  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const signature = crypto
    .createHmac('sha256', getStateSecret())
    .update(body)
    .digest('base64url')

  return `${body}.${signature}`
}

export function verifyEmbeddedSignupState(
  state: string,
  organizationId: number,
  userId: number,
): void {
  if (!state || !state.includes('.')) {
    throw new AppError('WhatsApp signup state is missing or invalid', 403)
  }

  const [body, signature] = state.split('.')

  const expected = crypto
    .createHmac('sha256', getStateSecret())
    .update(body)
    .digest('base64url')

  const provided = Buffer.from(signature)
  const computed = Buffer.from(expected)

  if (
    provided.length !== computed.length ||
    !crypto.timingSafeEqual(provided, computed)
  ) {
    throw new AppError('WhatsApp signup state is invalid', 403)
  }

  let payload: SignupStatePayload

  try {
    payload = JSON.parse(
      Buffer.from(body, 'base64url').toString('utf8'),
    ) as SignupStatePayload
  } catch {
    throw new AppError('WhatsApp signup state is invalid', 403)
  }

  if (payload.exp < Date.now()) {
    throw new AppError('WhatsApp signup state has expired. Please try again.', 403)
  }

  if (
    Number(payload.organizationId) !== Number(organizationId) ||
    Number(payload.userId) !== Number(userId)
  ) {
    throw new AppError('WhatsApp signup state does not match this session', 403)
  }
}
