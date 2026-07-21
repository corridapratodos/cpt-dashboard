import test from 'node:test'
import assert from 'node:assert/strict'
import {
  DashboardAiTemporaryError,
  generateDashboardAiReading,
  type DashboardAiPayload,
} from '../lib/dashboard-ai.ts'

const payload: DashboardAiPayload = {
  athleteName: 'Atleta', generatedAt: '2026-07-21T12:00:00.000Z', sportFocus: 'corrida',
  yearLabel: '2026', windowLabel: 'ano', activeWindowTitle: 'Ano', stats: null,
  routineConsistency: null, periodComparison: null, periodContext: null, periodRadar: null,
  analysisInsights: [], vdotEstimate: null, recentActivities: [],
}

function successResponse() {
  return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify({
    title: 'Leitura', summary: 'Resumo valido.', bullets: ['Ponto um', 'Ponto dois'], caution: null,
  }) }] } }] }), { status: 200 })
}

async function withApiKey(run: () => Promise<void>) {
  const previousKey = process.env.GEMINI_API_KEY
  process.env.GEMINI_API_KEY = 'test-key'
  try { await run() } finally {
    if (previousKey == null) delete process.env.GEMINI_API_KEY
    else process.env.GEMINI_API_KEY = previousKey
  }
}

test('leitura com IA tenta novamente no modelo principal quando recebe 503', async () => withApiKey(async () => {
  let calls = 0
  const waits: number[] = []
  const reading = await generateDashboardAiReading(payload, {
    fetchFn: async () => {
      calls += 1
      return calls === 1
        ? new Response(JSON.stringify({ error: { message: 'high demand' } }), { status: 503 })
        : successResponse()
    },
    wait: async (delayMs) => { waits.push(delayMs) },
  })
  assert.equal(calls, 2)
  assert.deepEqual(waits, [400])
  assert.equal(reading.model, 'gemini-3.5-flash')
}))

test('leitura com IA usa Flash-Lite apos esgotar sobrecarga do modelo principal', async () => withApiKey(async () => {
  const urls: string[] = []
  const waits: number[] = []
  const reading = await generateDashboardAiReading(payload, {
    fetchFn: async (input) => {
      urls.push(String(input))
      return urls.length <= 3
        ? new Response(JSON.stringify({ error: { message: 'high demand' } }), { status: 503 })
        : successResponse()
    },
    wait: async (delayMs) => { waits.push(delayMs) },
  })
  assert.equal(urls.length, 4)
  assert.ok(urls.slice(0, 3).every((url) => url.includes('/gemini-3.5-flash:')))
  assert.ok(urls[3].includes('/gemini-3.1-flash-lite:'))
  assert.deepEqual(waits, [400, 1_000])
  assert.equal(reading.model, 'gemini-3.1-flash-lite')
}))

test('leitura com IA mantem erro temporario quando principal e fallback falham', async () => withApiKey(async () => {
  let calls = 0
  await assert.rejects(generateDashboardAiReading(payload, {
    fetchFn: async () => {
      calls += 1
      return new Response(JSON.stringify({ error: { message: 'high demand' } }), { status: 503 })
    },
    wait: async () => {},
  }), (error) => error instanceof DashboardAiTemporaryError && error.status === 503)
  assert.equal(calls, 4)
}))

test('leitura com IA nao usa fallback em erro permanente do provedor', async () => withApiKey(async () => {
  let calls = 0
  await assert.rejects(generateDashboardAiReading(payload, {
    fetchFn: async () => {
      calls += 1
      return new Response(JSON.stringify({ error: { message: 'invalid request' } }), { status: 400 })
    },
    wait: async () => {},
  }), /invalid request/)
  assert.equal(calls, 1)
}))
