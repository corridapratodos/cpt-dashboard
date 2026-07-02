const PRE_ACCESS_PAYLOAD = 'cpt-pre-access'
const PRE_ACCESS_COOKIE_VERSION = 'v1'

export const PRE_ACCESS_COOKIE_NAME = 'cpt_pre_access'
export const PRE_ACCESS_COOKIE_MAX_AGE = 60 * 60 * 24 * 30

function normalizeCode(value: string) {
  return value.trim().toLowerCase()
}

export function getPreAccessCodes() {
  return (process.env.PRE_ACCESS_CODES ?? '')
    .split(',')
    .map((entry) => normalizeCode(entry))
    .filter(Boolean)
}

export function isPreAccessEnabled() {
  return getPreAccessCodes().length > 0
}

export function isAllowedPreAccessCode(value: string) {
  if (!isPreAccessEnabled()) return true
  const normalized = normalizeCode(value)
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

export async function createPreAccessCookieValue() {
  const signature = await signHex(`${PRE_ACCESS_COOKIE_VERSION}:${PRE_ACCESS_PAYLOAD}`)
  return `${PRE_ACCESS_COOKIE_VERSION}.${signature}`
}

export async function isValidPreAccessCookieValue(value?: string | null) {
  if (!value) return false
  const expected = await createPreAccessCookieValue()
  return value === expected
}
