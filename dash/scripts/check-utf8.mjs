import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, extname } from 'node:path'

const decoder = new TextDecoder('utf-8', { fatal: true })
const roots = ['app', 'components', 'lib', 'scripts', 'tests']
const exts = new Set(['.ts', '.tsx', '.js', '.mjs', '.json', '.md', '.css'])
const failures = []

function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    const stat = statSync(full)
    if (stat.isDirectory()) {
      walk(full)
      continue
    }

    if (!exts.has(extname(full))) continue

    const buffer = readFileSync(full)
    const hasBom = buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf

    try {
      decoder.decode(buffer)
      if (hasBom) failures.push(`${full}: UTF-8 com BOM`) 
    } catch {
      failures.push(`${full}: UTF-8 invalido`)
    }
  }
}

for (const root of roots) {
  walk(root)
}

if (failures.length) {
  console.error('Falhas de encoding encontradas:')
  failures.forEach((item) => console.error(`- ${item}`))
  process.exit(1)
}

console.log('Encoding UTF-8 validado sem BOM.')
