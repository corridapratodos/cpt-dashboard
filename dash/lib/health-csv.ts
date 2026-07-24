export type SleepRecord = {
  date: string
  durationMin: number
  sleepTime: string | null
  wakeTime: string | null
}

export type WeightRecord = {
  date: string
  weightKg: number
  bmi: number | null
  fatPct: number | null
  muscleMassKg: number | null
  waterPct: number | null
}

export type Vo2MaxRecord = {
  date: string
  monthLabel: string
  vo2Max: number
}

export type ParseResult =
  | { type: 'sleep'; records: SleepRecord[]; skipped: number }
  | { type: 'weight'; records: WeightRecord[]; skipped: number }
  | { type: 'vo2Max'; records: Vo2MaxRecord[]; skipped: number }
  | { type: 'unknown' }

function parseNum(value: string): number | null {
  const clean = value.replace('%', '').replace('kg', '').trim().replace(',', '.')
  if (!clean || clean === '--') return null
  const n = parseFloat(clean)
  return Number.isFinite(n) ? n : null
}

// "5h 2min" | "2min" | "5h" | "5min" -> minutes
function parseDuration(value: string): number | null {
  if (!value || value === '--') return null
  const hours = value.match(/(\d+)h/)
  const mins = value.match(/(\d+)\s*min/)
  const h = hours ? parseInt(hours[1]) : 0
  const m = mins ? parseInt(mins[1]) : 0
  const total = h * 60 + m
  return total > 0 ? total : null
}

function parseTime(value: string): string | null {
  if (!value || value === '--') return null
  return value.trim()
}

const ptMonths: Record<string, number> = {
  jan: 0,
  fev: 1,
  mar: 2,
  abr: 3,
  maio: 4,
  mai: 4,
  jun: 5,
  jul: 6,
  ago: 7,
  set: 8,
  out: 9,
  nov: 10,
  dez: 11,
}

function parsePtMonthYear(value: string): { date: string; label: string } | null {
  const clean = value.replace(/"/g, '').trim().toLowerCase()
  const match = clean.match(/^(\w+)\s+(\d{4})$/)
  if (!match) return null

  const month = ptMonths[match[1]]
  const year = Number(match[2])
  if (month == null || !Number.isFinite(year)) return null

  return {
    date: new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 10),
    label: value.replace(/"/g, '').trim(),
  }
}

function parseSleepCSV(lines: string[]): { records: SleepRecord[]; skipped: number } {
  const records: SleepRecord[] = []
  let skipped = 0

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue

    const cols = line.split(',')
    const date = cols[0]?.trim()
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) { skipped++; continue }

    const durationMin = parseDuration(cols[1]?.trim() ?? '')
    if (!durationMin) { skipped++; continue }

    records.push({
      date,
      durationMin,
      sleepTime: parseTime(cols[2] ?? ''),
      wakeTime: parseTime(cols[3] ?? ''),
    })
  }

  return { records, skipped }
}

// Peso CSV: hierarquico - linha de data "30 Jun 2026" + linhas de hora
function parseWeightCSV(lines: string[]): { records: WeightRecord[]; skipped: number } {
  const byDate = new Map<string, WeightRecord>()
  let currentDate: string | null = null
  let skipped = 0

  for (let i = 1; i < lines.length; i++) {
    const raw = lines[i]
    if (!raw.trim()) continue

    const dateMatch = raw.replace(/"/g, '').replace(/,+$/, '').trim().match(/^(\d{1,2})\s+(\w+)\s+(\d{4})$/)
    if (dateMatch) {
      const day = parseInt(dateMatch[1])
      const month = ptMonths[dateMatch[2].toLowerCase()]
      const year = parseInt(dateMatch[3])
      if (month != null && Number.isFinite(day) && Number.isFinite(year)) {
        currentDate = new Date(Date.UTC(year, month, day)).toISOString().slice(0, 10)
      }
      continue
    }

    if (!currentDate) continue

    const cols = raw.split(',')
    const timeStr = cols[0]?.trim()
    if (!timeStr.match(/^\d{1,2}:\d{2}\s*(AM|PM)$/i)) continue

    if (byDate.has(currentDate)) continue

    const weightKg = parseNum(cols[1] ?? '')
    if (!weightKg) { skipped++; continue }

    byDate.set(currentDate, {
      date: currentDate,
      weightKg,
      bmi: parseNum(cols[3] ?? ''),
      fatPct: parseNum(cols[4] ?? ''),
      muscleMassKg: parseNum(cols[5] ?? ''),
      waterPct: parseNum(cols[7] ?? ''),
    })
  }

  return { records: Array.from(byDate.values()), skipped }
}

function parseVo2MaxCSV(lines: string[]): { records: Vo2MaxRecord[]; skipped: number } {
  const records: Vo2MaxRecord[] = []
  let skipped = 0

  for (const raw of lines.slice(1)) {
    const line = raw.trim()
    if (!line) continue

    const cols = line.split(',').map((col) => col.trim())
    const month = parsePtMonthYear(cols[0] ?? '')
    const value = parseNum(cols[2] ?? cols[1] ?? '')

    if (!month || value == null) {
      skipped++
      continue
    }

    records.push({
      date: month.date,
      monthLabel: month.label,
      vo2Max: value,
    })
  }

  return { records, skipped }
}

export function parseHealthCSV(content: string): ParseResult {
  const lines = content.split(/\r?\n/)
  const header = lines[0]?.replace(/^\uFEFF/, '').trim() ?? ''
  const normalizedHeader = header.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

  if (header.startsWith('Sono')) {
    const { records, skipped } = parseSleepCSV(lines)
    return { type: 'sleep', records, skipped }
  }

  if (header.startsWith('Tempo,Peso')) {
    const { records, skipped } = parseWeightCSV(lines)
    return { type: 'weight', records, skipped }
  }

  if (normalizedHeader.startsWith('vo') && normalizedHeader.includes('max')) {
    const { records, skipped } = parseVo2MaxCSV(lines)
    return { type: 'vo2Max', records, skipped }
  }

  return { type: 'unknown' }
}
