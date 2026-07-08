import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

type EncryptedValue = {
  iv: string
  tag: string
  data: string
}

type StoredOAuthEnvelope = {
  version?: number
  accessToken?: EncryptedValue | null
  refreshToken?: EncryptedValue | null
  encryptedAt?: unknown
} | null | undefined

type StoredOAuthUser = {
  accessToken?: unknown
  refreshToken?: unknown
  expiresAt?: unknown
  oauthTokens?: StoredOAuthEnvelope
} | null | undefined

export type OAuthTokenSet = {
  accessToken: string
  refreshToken: string
  expiresAt: number
}

const OAUTH_TOKEN_ENCRYPTION_VERSION = 1
const OAUTH_TOKEN_ENCRYPTION_ALGO = 'aes-256-gcm'
const OAUTH_TOKEN_IV_BYTES = 12

function parseKeyMaterial(raw: string) {
  const trimmed = raw.trim()
  if (!trimmed) return null

  if (/^[a-fA-F0-9]{64}$/.test(trimmed)) {
    return Buffer.from(trimmed, 'hex')
  }

  if (trimmed.length === 32) {
    return Buffer.from(trimmed, 'utf8')
  }

  try {
    const decoded = Buffer.from(trimmed, 'base64')
    if (decoded.length === 32 && decoded.toString('base64') === trimmed) {
      return decoded
    }
  } catch {}

  return null
}

function getEncryptionKey() {
  const raw = process.env.OAUTH_TOKEN_ENCRYPTION_KEY?.trim()
  if (!raw) return null

  const key = parseKeyMaterial(raw)
  if (!key || key.length !== 32) {
    throw new Error('OAUTH_TOKEN_ENCRYPTION_KEY precisa resolver para 32 bytes.')
  }

  return key
}

function encryptValue(value: string, key: Buffer): EncryptedValue {
  const iv = randomBytes(OAUTH_TOKEN_IV_BYTES)
  const cipher = createCipheriv(OAUTH_TOKEN_ENCRYPTION_ALGO, key, iv)
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()

  return {
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
    data: encrypted.toString('base64'),
  }
}

function decryptValue(value: EncryptedValue, key: Buffer) {
  const decipher = createDecipheriv(
    OAUTH_TOKEN_ENCRYPTION_ALGO,
    key,
    Buffer.from(String(value.iv ?? ''), 'base64')
  )
  decipher.setAuthTag(Buffer.from(String(value.tag ?? ''), 'base64'))

  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(String(value.data ?? ''), 'base64')),
    decipher.final(),
  ])

  return decrypted.toString('utf8')
}

function isEncryptedValue(value: unknown): value is EncryptedValue {
  return Boolean(
    value &&
      typeof value === 'object' &&
      typeof (value as EncryptedValue).iv === 'string' &&
      typeof (value as EncryptedValue).tag === 'string' &&
      typeof (value as EncryptedValue).data === 'string'
  )
}

export function isOAuthTokenEncryptionEnabled() {
  return Boolean(process.env.OAUTH_TOKEN_ENCRYPTION_KEY?.trim())
}

export function buildStoredOAuthTokenPayload(tokens: OAuthTokenSet) {
  const key = getEncryptionKey()

  if (!key) {
    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresAt: tokens.expiresAt,
    }
  }

  return {
    accessToken: null,
    refreshToken: null,
    expiresAt: tokens.expiresAt,
    oauthTokens: {
      version: OAUTH_TOKEN_ENCRYPTION_VERSION,
      accessToken: encryptValue(tokens.accessToken, key),
      refreshToken: encryptValue(tokens.refreshToken, key),
      encryptedAt: new Date(),
    },
  }
}

export function readStoredOAuthTokens(userData: StoredOAuthUser): OAuthTokenSet | null {
  const expiresAt = Number(userData?.expiresAt ?? 0)
  if (!Number.isFinite(expiresAt) || expiresAt <= 0) return null

  const envelope = userData?.oauthTokens
  if (envelope?.accessToken && envelope?.refreshToken) {
    const key = getEncryptionKey()
    if (!key) {
      if (typeof userData?.accessToken === 'string' && typeof userData?.refreshToken === 'string') {
        return {
          accessToken: userData.accessToken,
          refreshToken: userData.refreshToken,
          expiresAt,
        }
      }

      return null
    }

    if (!isEncryptedValue(envelope.accessToken) || !isEncryptedValue(envelope.refreshToken)) {
      return null
    }

    return {
      accessToken: decryptValue(envelope.accessToken, key),
      refreshToken: decryptValue(envelope.refreshToken, key),
      expiresAt,
    }
  }

  if (typeof userData?.accessToken !== 'string' || typeof userData?.refreshToken !== 'string') {
    return null
  }

  return {
    accessToken: userData.accessToken,
    refreshToken: userData.refreshToken,
    expiresAt,
  }
}