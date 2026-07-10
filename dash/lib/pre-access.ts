const PRE_ACCESS_COOKIE_VERSION = 'v2'

export const PRE_ACCESS_COOKIE_NAME = 'cpt_pre_access'
export const PRE_ACCESS_COOKIE_MAX_AGE = 60 * 60 * 24 * 30

export function normalizePreAccessCode(value: string) {
  return value.trim().toLowerCase()
}

export function getPreAccessCodes() {
  return (process.env.PRE_ACCESS_CODES ?? '')
    .split(',')
    .map((entry) => normalizePreAccessCode(entry))
    .filter(Boolean)
}

export function isPreAccessEnabled() {
  return getPreAccessCodes().length > 0
}

export function isAllowedPreAccessCode(value: string) {
  if (!isPreAccessEnabled()) return true
  const normalized = normalizePreAccessCode(value)
  return Boolean(normalized) && getPreAccessCodes().includes(normalized)
}

function getSigningSecret() {
  const secret = (process.env.PRE_ACCESS_COOKIE_SECRET ?? process.env.NEXTAUTH_SECRET ?? '').trim()
  if (!secret) {
    throw new Error('NEXTAUTH_SECRET ou PRE_ACCESS_COOKIE_SECRET precisa existir para assinar o pre acesso.')
  }
  return secret
}

async function signHex(message: string) {
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(getSigningSecret()),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )

  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(message))
  return Array.from(new Uint8Array(signature))
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('')
}

export async function createPreAccessCookieValue(claimId: string) {
  const normalizedClaimId = claimId.trim()
  if (!normalizedClaimId) {
    throw new Error('claimId obrigatorio para criar cookie de pre acesso.')
  }

  const signature = await signHex(`${PRE_ACCESS_COOKIE_VERSION}:${normalizedClaimId}`)
  return `${PRE_ACCESS_COOKIE_VERSION}.${normalizedClaimId}.${signature}`
}

export async function parsePreAccessCookieValue(value?: string | null) {
  if (!value) return null

  const [version, claimId, signature] = value.split('.')
  if (!version || !claimId || !signature) return null
  if (version !== PRE_ACCESS_COOKIE_VERSION) return null

  const expected = await signHex(`${version}:${claimId}`)
  if (signature !== expected) return null

  return { claimId }
}

export async function isValidPreAccessCookieValue(value?: string | null) {
  const parsed = await parsePreAccessCookieValue(value)
  return Boolean(parsed?.claimId)
}
