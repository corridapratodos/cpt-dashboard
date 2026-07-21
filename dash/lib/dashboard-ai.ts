export type DashboardAiPayload = {
  athleteName: string
  generatedAt: string
  sportFocus: string
  yearLabel: string
  windowLabel: string
  activeWindowTitle: string
  stats: {
    sessions: number
    distanceKm: number
    durationSec: number
    avgPaceSec: number | null
    longestSessionKm: number
    fastestPaceSec: number | null
  } | null
  routineConsistency: {
    activeDays: number
    trackedWeeks: number
    solidWeeks: number
    activeDaysPerWeek: number
    currentStreakDays: number
    longestStreakDays: number
    status: string
    title: string
    copy: string
  } | null
  periodComparison: {
    current: {
      distanceKm: number
      sessions: number
      durationSec: number
      avgPaceSec: number | null
    }
    previous: {
      distanceKm: number
      sessions: number
      durationSec: number
      avgPaceSec: number | null
    }
    delta: {
      distancePct: number
      sessionsPct: number
      durationPct: number
      pacePct: number | null
    }
  } | null
  periodContext: {
    activeDays: number
    spanDays: number
    densityPct: number
    avgSessionKm: number
    avgSessionMinutes: number
    longestSharePct: number
    sessionsPerWeek: number
  } | null
  periodRadar: {
    biggestGapDays: number
    strongestDay: {
      label: string
      distanceKm: number
      durationSec: number
    }
    strongestDaySharePct: number
    topWeekdayLabel: string
    topWeekdaySharePct: number
    weekendSharePct: number
  } | null
  analysisInsights: Array<{ title: string; copy: string }>
  vdotEstimate: {
    value: number
    source: string
    sourceMeta: string
    zones: Array<{ label: string; paceRange: string; meta: string }>
  } | null
  recentActivities: Array<{
    date: string
    name: string
    type: string
    distanceKm: number
    durationSec: number
    paceSec: number | null
    hrAvg: number | null
  }>
}

export type DashboardAiReading = {
  title: string
  summary: string
  bullets: string[]
  caution: string | null
  model: string
}

const DASHBOARD_AI_MODEL = 'gemini-3.5-flash'
const DASHBOARD_AI_MAX_ATTEMPTS = 3
const DASHBOARD_AI_RETRY_DELAYS_MS = [400, 1_000]

type GenerationOptions = {
  fetchFn?: typeof fetch
  wait?: (delayMs: number) => Promise<void>
}

export class DashboardAiTemporaryError extends Error {
  readonly status: number | null

  constructor(message: string, status: number | null = null) {
    super(message)
    this.name = 'DashboardAiTemporaryError'
    this.status = status
  }
}

function isTemporaryProviderStatus(status: number) {
  return status === 429 || status === 500 || status === 502 || status === 503 || status === 504
}

function defaultWait(delayMs: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, delayMs))
}

function getApiKey() {
  return process.env.GEMINI_API_KEY?.trim() ?? ''
}

export function isDashboardAiEnabled() {
  return Boolean(getApiKey())
}

export async function generateDashboardAiReading(
  payload: DashboardAiPayload,
  options: GenerationOptions = {},
): Promise<DashboardAiReading> {
  const apiKey = getApiKey()
  if (!apiKey) {
    throw new Error('Leitura com IA indisponivel: GEMINI_API_KEY ausente no servidor.')
  }

  const model = DASHBOARD_AI_MODEL
  const prompt = [
    'Voce e um analista de treino de corrida e endurance.',
    'Leia o JSON do dashboard e devolva uma resposta curta em portugues do Brasil.',
    'Regras:',
    '- use linguagem clara, amigavel e objetiva',
    '- nao invente contexto fora do JSON',
    '- nao cite VO2max, limiar ou zonas se nao existirem no payload',
    '- priorize consistencia, volume, tendencia e sinais de carga',
    '- devolva JSON valido com as chaves: title, summary, bullets, caution',
    '- bullets deve ter de 2 a 4 itens curtos',
    '- caution pode ser null se nao houver alerta relevante',
    '',
    JSON.stringify(payload),
  ].join('\n')

  const fetchFn = options.fetchFn ?? fetch
  const wait = options.wait ?? defaultWait
  let data: any = null

  for (let attempt = 0; attempt < DASHBOARD_AI_MAX_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetchFn(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.45,
            topP: 0.9,
            responseMimeType: 'application/json',
          },
        }),
      })

      data = await response.json().catch(() => null)
      if (response.ok) break

      const message = data?.error?.message ?? 'Falha ao consultar a IA.'
      if (!isTemporaryProviderStatus(response.status)) throw new Error(message)
      if (attempt === DASHBOARD_AI_MAX_ATTEMPTS - 1) {
        throw new DashboardAiTemporaryError(message, response.status)
      }
    } catch (error) {
      if (error instanceof DashboardAiTemporaryError) throw error
      if (error instanceof Error && !/fetch|network|timeout/i.test(error.message)) throw error
      if (attempt === DASHBOARD_AI_MAX_ATTEMPTS - 1) {
        throw new DashboardAiTemporaryError(error instanceof Error ? error.message : 'Falha temporaria de rede.')
      }
    }

    await wait(DASHBOARD_AI_RETRY_DELAYS_MS[attempt] ?? 1_000)
  }

  const text = data?.candidates?.[0]?.content?.parts?.map((part: { text?: string }) => part?.text ?? '').join('')?.trim()
  if (!text) {
    throw new Error('A IA nao retornou conteudo utilizavel.')
  }

  const parsed = JSON.parse(text)
  const title = typeof parsed?.title === 'string' ? parsed.title.trim() : ''
  const summary = typeof parsed?.summary === 'string' ? parsed.summary.trim() : ''
  const bullets = Array.isArray(parsed?.bullets)
    ? parsed.bullets.map((item: unknown) => String(item).trim()).filter(Boolean).slice(0, 4)
    : []
  const caution = typeof parsed?.caution === 'string' && parsed.caution.trim() ? parsed.caution.trim() : null

  if (!title || !summary || bullets.length < 2) {
    throw new Error('A IA retornou uma estrutura incompleta.')
  }

  return {
    title,
    summary,
    bullets,
    caution,
    model,
  }
}
