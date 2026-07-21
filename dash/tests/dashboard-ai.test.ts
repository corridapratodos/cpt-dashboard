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

test('leitura com IA tenta novamente quando o provedor responde 503', async () => {
  const previousKey = process.env.GEMINI_API_KEY
  process.env.GEMINI_API_KEY = 'test-key'
  let calls = 0
  const waits: number[] = []
  try {
    const reading = await generateDashboardAiReading(payload, {
      fetchFn: async () => {
        calls += 1
        if (calls === 1) return new Response(JSON.stringify({ error: { message: 'high demand' } }), { status: 503 })
        return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify({
          title: 'Leitura', summary: 'Resumo valido.', bullets: ['Ponto um', 'Ponto dois'], caution: null,
        }) }] } }] }), { status: 200 })
      },
      wait: async (delayMs) => { waits.push(delayMs) },
    })
    assert.equal(calls, 2)
    assert.deepEqual(waits, [400])
    assert.equal(reading.title, 'Leitura')
  } finally {
    if (previousKey == null) delete process.env.GEMINI_API_KEY
    else process.env.GEMINI_API_KEY = previousKey
  }
})

test('leitura com IA classifica sobrecarga persistente como temporaria', async () => {
  const previousKey = process.env.GEMINI_API_KEY
  process.env.GEMINI_API_KEY = 'test-key'
  let calls = 0
  try {
    await assert.rejects(generateDashboardAiReading(payload, {
      fetchFn: async () => {
        calls += 1
        return new Response(JSON.stringify({ error: { message: 'high demand' } }), { status: 503 })
      },
      wait: async () => {},
    }), (error) => error instanceof DashboardAiTemporaryError && error.status === 503)
    assert.equal(calls, 3)
  } finally {
    if (previousKey == null) delete process.env.GEMINI_API_KEY
    else process.env.GEMINI_API_KEY = previousKey
  }
})
