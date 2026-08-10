import crypto from 'crypto'

const algorithm = 'aes-256-gcm'

function getEncryptionKey(): Buffer {
  const raw = process.env.ENCRYPTION_KEY
  if (!raw) {
    throw new Error(
      'ENCRYPTION_KEY is required. Set a stable 64-char hex value in .env (32 bytes).',
    )
  }

  if (!/^[0-9a-fA-F]{64}$/.test(raw)) {
    throw new Error(
      'ENCRYPTION_KEY must be exactly 64 hex characters (32 bytes). Generate with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"',
    )
  }

  return Buffer.from(raw, 'hex')
}

export function encryptToken(text: string): string {
  if (!text) return text

  const key = getEncryptionKey()
  const iv = crypto.randomBytes(16)
  const cipher = crypto.createCipheriv(algorithm, key, iv)

  let encrypted = cipher.update(text, 'utf8', 'hex')
  encrypted += cipher.final('hex')

  const authTag = cipher.getAuthTag()

  return iv.toString('hex') + ':' + authTag.toString('hex') + ':' + encrypted
}

export function decryptToken(encryptedText: string): string {
  if (!encryptedText) return encryptedText

  const parts = encryptedText.split(':')
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted token format')
  }

  const key = getEncryptionKey()
  const iv = Buffer.from(parts[0], 'hex')
  const authTag = Buffer.from(parts[1], 'hex')
  const encrypted = Buffer.from(parts[2], 'hex')

  const decipher = crypto.createDecipheriv(algorithm, key, iv)
  decipher.setAuthTag(authTag)

  let decrypted = decipher.update(encrypted, undefined, 'utf8')
  decrypted += decipher.final('utf8')

  return decrypted
}
