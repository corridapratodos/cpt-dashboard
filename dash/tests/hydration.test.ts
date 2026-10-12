import test from 'node:test'
import assert from 'node:assert/strict'
import {
  analyzeTest,
  planIntake,
  summarizeTests,
  validateTest,
  type HydrationTest,
} from '../lib/hydration.ts'

function makeTest(overrides: Partial<HydrationTest> = {}): HydrationTest {
  return {
    id: 't1',
    date: '2026-10-10',
    preKg: 100,
    postKg: 97.5,
    fluidMl: 500,
    urineMl: null,
    durationMin: 150,
    distanceKm: 25,
    tempC: 20,
    humidityPct: null,
    sodiumMg: null,
    carbG: null,
    sweatSodiumMgL: null,
    gi: 'none',
    ...overrides,
  }
}

test('taxa de suor soma a ingestao, desconta urina e correcao metabolica', () => {
  const analysis = analyzeTest(makeTest({ urineMl: 200 }))
  // perda 2,5 kg + 0,5 L bebidos - 0,2 L urina - 0,12 kg/h * 2,5 h = 2,5 L em 2,5 h
  assert.ok(Math.abs(analysis.sweatL.central - 2.5) < 1e-9)
  assert.ok(Math.abs(analysis.sweatRateLH.central - 1.0) < 1e-9)
})

test('faixa de incerteza e ordenada e contem o valor central', () => {
  const { sweatRateLH } = analyzeTest(makeTest())
  assert.ok(sweatRateLH.low < sweatRateLH.central)
  assert.ok(sweatRateLH.central < sweatRateLH.high)
})

test('perda percentual usa o peso inicial e fica negativa quando o peso sobe', () => {
  assert.ok(Math.abs(analyzeTest(makeTest()).massLossPct - 2.5) < 1e-9)
  const gained = analyzeTest(makeTest({ postKg: 100.8 }))
  assert.ok(gained.massLossPct < 0)
  assert.ok(gained.flags.some((flag) => flag.tone === 'warn'))
})

test('perda acima de 2% gera aviso informativo, nao de alerta', () => {
  const analysis = analyzeTest(makeTest())
  assert.ok(analysis.flags.some((flag) => flag.tone === 'info' && flag.text.includes('2%')))
  assert.ok(!analysis.flags.some((flag) => flag.tone === 'warn'))
})

test('sodio do suor medido colapsa a faixa de cenarios', () => {
  const scenario = analyzeTest(makeTest())
  assert.ok(scenario.sodiumLossMgH.low < scenario.sodiumLossMgH.high)
  assert.equal(scenario.sodiumMeasured, false)

  const measured = analyzeTest(makeTest({ sweatSodiumMgL: 1100 }))
  assert.equal(measured.sodiumMeasured, true)
  assert.equal(measured.sodiumLossMgH.low, measured.sodiumLossMgH.high)
})

test('sodio ingerido por hora usa a duracao do teste', () => {
  const analysis = analyzeTest(makeTest({ sodiumMg: 400, durationMin: 120 }))
  assert.equal(analysis.sodiumIntakeMgH, 200)
})

test('pace e calculado so quando ha distancia', () => {
  assert.equal(analyzeTest(makeTest({ distanceKm: 30, durationMin: 180 })).paceSecKm, 360)
  assert.equal(analyzeTest(makeTest({ distanceKm: null })).paceSecKm, null)
})

test('validacao rejeita valores implausiveis', () => {
  const { id: _id, ...valid } = makeTest()
  assert.deepEqual(validateTest(valid), [])
  assert.ok(validateTest({ ...valid, postKg: 80 }).length > 0)
  assert.ok(validateTest({ ...valid, durationMin: 2 }).length > 0)
  assert.ok(validateTest({ ...valid, date: '' }).length > 0)
  assert.ok(validateTest({ ...valid, sweatSodiumMgL: 20 }).length > 0)
})

test('resumo sem testes devolve null e plano tambem', () => {
  assert.equal(summarizeTests([]), null)
  assert.equal(planIntake(null), null)
})

test('resumo separa o volume ja testado do limite com desconforto forte', () => {
  const summary = summarizeTests([
    analyzeTest(makeTest({ id: 'a', fluidMl: 750, gi: 'mild' })),
    analyzeTest(makeTest({ id: 'b', fluidMl: 1500, gi: 'strong', postKg: 96.5 })),
  ])
  assert.ok(summary)
  assert.equal(summary.count, 2)
  assert.ok(summary.sweatRateMax >= summary.sweatRateMin)
  assert.equal(Math.round(summary.testedIntakeMlH ?? 0), 300)
  assert.equal(Math.round(summary.strongDiscomfortMlH ?? 0), 600)
})

test('plano repoe 50 a 70% do suor medio e nao e travado pelo volume testado', () => {
  const summary = summarizeTests([analyzeTest(makeTest({ fluidMl: 750, gi: 'none' }))])
  const plan = planIntake(summary)
  assert.ok(plan)
  assert.equal(plan.testedMlH, 300)
  assert.equal(plan.cappedByLimit, false)
  assert.equal(plan.aboveTested, true)
  assert.ok(Math.abs(plan.lowMlH / plan.meanSweatMlH - 0.5) < 0.05)
  assert.ok(Math.abs(plan.highMlH / plan.meanSweatMlH - 0.7) < 0.05)
})

test('desconforto forte registrado limita o alvo', () => {
  const summary = summarizeTests([analyzeTest(makeTest({ fluidMl: 750, gi: 'strong' }))])
  const plan = planIntake(summary)
  assert.ok(plan)
  assert.equal(plan.limitMlH, 300)
  assert.equal(plan.cappedByLimit, true)
  assert.ok(plan.highMlH <= 300)
  assert.ok(plan.lowMlH <= plan.highMlH)
})

test('alvo dentro do que ja foi testado nao pede cautela extra', () => {
  // pouco suor e bastante ingestao: o alvo (50-70% do suor) fica abaixo do que ja foi bebido
  const summary = summarizeTests([analyzeTest(makeTest({ postKg: 99.5, fluidMl: 1000, gi: 'none' }))])
  const plan = planIntake(summary)
  assert.ok(plan)
  assert.equal(plan.aboveTested, false)
})

test('texto do alerta de 2% depende da temperatura registrada', () => {
  const find = (tempC: number | null) =>
    analyzeTest(makeTest({ tempC })).flags.find((flag) => flag.text.includes('2%'))
  const warm = find(20)
  const cool = find(8)
  const unknown = find(null)
  assert.ok(warm && warm.text.includes('20 C') && !warm.text.includes('clima frio'))
  assert.ok(cool && cool.text.includes('clima frio'))
  assert.ok(unknown && !unknown.text.includes('clima frio') && !unknown.text.includes(' C a perda'))
})
