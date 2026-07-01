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

export type ParseResult =
  | { type: 'sleep'; records: SleepRecord[]; skipped: number }
  | { type: 'weight'; records: WeightRecord[]; skipped: number }
  | { type: 'unknown' }

function parseNum(value: string): number | null {
  const clean = value.replace('%', '').replace('kg', '').trim()
  if (!clean || clean === '--') return null
  const n = parseFloat(clean)
  return Number.isFinite(n) ? n : null
}

// "5h 2min" | "2min" | "5h" | "5min" → minutes
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

// Peso CSV: hierárquico — linha de data " 30 Jun 2026" + linhas de hora
function parseWeightCSV(lines: string[]): { records: WeightRecord[]; skipped: number } {
  const byDate = new Map<string, WeightRecord>()
  let currentDate: string | null = null
  let skipped = 0

  const ptMonths: Record<string, number> = {
    Jan: 0, Fev: 1, Mar: 2, Abr: 3, Maio: 4, Jun: 5,
    Jul: 6, Ago: 7, Set: 8, Out: 9, Nov: 10, Dez: 11,
  }

  for (let i = 1; i < lines.length; i++) {
    const raw = lines[i]
    if (!raw.trim()) continue

    // Date header: " 30 Jun 2026" (may be quoted)
    const dateMatch = raw.replace(/"/g, '').replace(/,+$/, '').trim().match(/^(\d{1,2})\s+(\w+)\s+(\d{4})$/)
    if (dateMatch) {
      const day = parseInt(dateMatch[1])
      const month = ptMonths[dateMatch[2]]
      const year = parseInt(dateMatch[3])
      if (month != null && Number.isFinite(day) && Number.isFinite(year)) {
        const d = new Date(Date.UTC(year, month, day))
        currentDate = d.toISOString().slice(0, 10)
      }
      continue
    }

    if (!currentDate) continue

    // Time row: "10:42 AM,110.5 kg,..."
    const cols = raw.split(',')
    const timeStr = cols[0]?.trim()
    if (!timeStr.match(/^\d{1,2}:\d{2}\s*(AM|PM)$/i)) continue

    // Only keep first (morning) reading per day
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

export function parseHealthCSV(content: string): ParseResult {
  const lines = content.split(/\r?\n/)
  const header = lines[0]?.trim() ?? ''

  if (header.startsWith('Sono')) {
    const { records, skipped } = parseSleepCSV(lines)
    return { type: 'sleep', records, skipped }
  }

  if (header.startsWith('Tempo,Peso')) {
    const { records, skipped } = parseWeightCSV(lines)
    return { type: 'weight', records, skipped }
  }

  return { type: 'unknown' }
}
