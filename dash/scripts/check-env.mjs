import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

function loadEnvFile(fileName) {
  const fullPath = resolve(process.cwd(), fileName)
  if (!existsSync(fullPath)) return

  const lines = readFileSync(fullPath, 'utf8').split(/\r?\n/)

  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue

    const separatorIndex = line.indexOf('=')
    if (separatorIndex === -1) continue

    const key = line.slice(0, separatorIndex).trim()
    if (!key || process.env[key]) continue

    let value = line.slice(separatorIndex + 1).trim()

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }

    process.env[key] = value
  }
}

function isValidEncryptionKey(raw) {
  const value = raw?.trim()
  if (!value) return true
  if (/^[a-fA-F0-9]{64}$/.test(value)) return true
  if (value.length === 32) return true

  try {
    const decoded = Buffer.from(value, 'base64')
    return decoded.length === 32 && decoded.toString('base64') === value
  } catch {
    return false
  }
}

loadEnvFile('.env.local')
loadEnvFile('.env')

const required = [
  'STRAVA_CLIENT_ID',
  'STRAVA_CLIENT_SECRET',
  'STRAVA_WEBHOOK_VERIFY_TOKEN',
  'NEXTAUTH_URL',
  'NEXTAUTH_SECRET',
  'FIREBASE_SERVICE_ACCOUNT',
]

const missing = required.filter((key) => !process.env[key]?.trim())
if (missing.length) {
  console.error(`Variaveis ausentes: ${missing.join(', ')}`)
  process.exit(1)
}

try {
  const parsed = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)
  const firebaseKeys = ['project_id', 'client_email', 'private_key']
  const invalid = firebaseKeys.filter((key) => !parsed?.[key])
  if (invalid.length) {
    console.error(`FIREBASE_SERVICE_ACCOUNT sem campos obrigatorios: ${invalid.join(', ')}`)
    process.exit(1)
  }
} catch {
  console.error('FIREBASE_SERVICE_ACCOUNT nao contem JSON valido.')
  process.exit(1)
}

try {
  new URL(process.env.NEXTAUTH_URL)
} catch {
  console.error('NEXTAUTH_URL precisa ser uma URL valida.')
  process.exit(1)
}

if (!/^\d+$/.test(process.env.STRAVA_CLIENT_ID)) {
  console.error('STRAVA_CLIENT_ID precisa ser numerico.')
  process.exit(1)
}

if (process.env.NEXTAUTH_SECRET.length < 24) {
  console.error('NEXTAUTH_SECRET muito curto. Use pelo menos 24 caracteres.')
  process.exit(1)
}

if (!isValidEncryptionKey(process.env.OAUTH_TOKEN_ENCRYPTION_KEY)) {
  console.error('OAUTH_TOKEN_ENCRYPTION_KEY precisa ser base64 de 32 bytes, hex de 64 chars ou string de 32 chars.')
  process.exit(1)
}

console.log('Ambiente validado com sucesso.')