export function repairMojibake(value: string) {
  if (!value || !/(?:\u00C3|\u00C2|\u00E2\u20AC)/.test(value)) return value

  try {
    const bytes = Uint8Array.from(Array.from(value).map((char) => char.charCodeAt(0) & 0xff))
    const decoded = new TextDecoder('utf-8', { fatal: false }).decode(bytes)

    if (!decoded || decoded.includes('\uFFFD')) return value
    return decoded
  } catch {
    return value
  }
}

export function normalizeTextValue(value: unknown) {
  return typeof value === 'string' ? repairMojibake(value) : value
}
