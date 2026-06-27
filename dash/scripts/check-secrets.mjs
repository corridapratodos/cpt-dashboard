import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, extname } from 'node:path'

const roots = ['app', 'components', 'lib', 'scripts', 'tests']
const allowedFiles = new Set(['.env.example', 'check-secrets.mjs'])
const exts = new Set(['.ts', '.tsx', '.js', '.mjs', '.json', '.md', '.css', '.yml', '.yaml'])
const findings = []

const patterns = [
  { label: 'firebase-private-key', regex: /-----BEGIN PRIVATE KEY-----/ },
  { label: 'env-assignment-secret', regex: /(?:STRAVA_CLIENT_SECRET|NEXTAUTH_SECRET|STRAVA_WEBHOOK_VERIFY_TOKEN|FIREBASE_SERVICE_ACCOUNT)\s*[=:]\s*['"]?[A-Za-z0-9_\-\/+=.{]{8,}/ },
  { label: 'hardcoded-strava-client-secret', regex: /client_secret\s*[=:]\s*['"][A-Za-z0-9]{16,}['"]/ },
  { label: 'suspicious-long-token', regex: /['"][A-Fa-f0-9]{32,}['"]/ },
]

function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    const stat = statSync(full)
    if (stat.isDirectory()) {
      walk(full)
      continue
    }

    if (!exts.has(extname(full))) continue
    if (allowedFiles.has(entry)) continue

    const content = readFileSync(full, 'utf8')
    for (const pattern of patterns) {
      if (pattern.regex.test(content)) {
        findings.push(`${full}: ${pattern.label}`)
      }
    }
  }
}

for (const root of roots) {
  walk(root)
}

if (findings.length) {
  console.error('Possiveis segredos hardcoded encontrados:')
  findings.forEach((item) => console.error(`- ${item}`))
  process.exit(1)
}

console.log('Varredura de segredos sem achados.')
