// Calculo de taxa de suor a partir de testes de pesagem (antes/depois do treino).
// Funcoes puras, sem dependencias, para rodar tambem no node --test.
//
// Premissas assumidas (sao aproximacoes, nao constantes fisiologicas):
// - 1 ml de liquido = 1 g.
// - Perda de massa metabolica (CO2 expirado, agua respiratoria, substrato queimado)
//   em torno de 0,12 kg/h; varia com intensidade, clima e ar seco.
// - Cada pesagem tem erro de ~0,1 kg (balanca, roupa, esvaziamento de bexiga).
// - Sodio no suor: media de populacao proxima de 900 mg/L, com variacao individual
//   de cerca de 10x. So teste de suor medido substitui esse cenario.

export type GiDiscomfort = 'none' | 'mild' | 'strong'

export type HydrationTest = {
  id: string
  date: string
  preKg: number
  postKg: number
  fluidMl: number
  urineMl: number | null
  durationMin: number
  distanceKm: number | null
  tempC: number | null
  humidityPct: number | null
  sodiumMg: number | null
  carbG: number | null
  sweatSodiumMgL: number | null
  gi: GiDiscomfort
}

export const METABOLIC_LOSS_KG_PER_H = { min: 0, central: 0.12, max: 0.25 }
export const SCALE_ERROR_KG = 0.1
export const SWEAT_SODIUM_MG_PER_L = { low: 500, typical: 900, high: 1500 }
export const REPLACEMENT_FRACTION = { low: 0.5, high: 0.7 }
export const DEHYDRATION_REFERENCE_PCT = 2

export type Range = { low: number; central: number; high: number }

export type TestFlag = { tone: 'info' | 'warn'; text: string }

export type TestAnalysis = {
  test: HydrationTest
  hours: number
  massLossKg: number
  massLossPct: number
  sweatL: Range
  sweatRateLH: Range
  intakeMlH: number
  replacementPct: number | null
  sodiumIntakeMgH: number | null
  sodiumLossMgH: Range
  sodiumMeasured: boolean
  paceSecKm: number | null
  flags: TestFlag[]
}

export type HydrationSummary = {
  count: number
  sweatRateMin: number
  sweatRateMax: number
  sweatRateMean: number
  massLossPctMax: number
  toleratedIntakeMlH: number | null
}

export type IntakePlan = {
  lowMlH: number
  highMlH: number
  meanSweatMlH: number
  toleranceCapMlH: number | null
  cappedByTolerance: boolean
}

export function validateTest(test: Omit<HydrationTest, 'id'>): string[] {
  const errors: string[] = []
  if (!/^\d{4}-\d{2}-\d{2}$/.test(test.date)) errors.push('Informe a data do teste.')
  if (!(test.preKg >= 30 && test.preKg <= 250)) errors.push('Peso antes fora do intervalo (30 a 250 kg).')
  if (!(test.postKg >= 30 && test.postKg <= 250)) errors.push('Peso depois fora do intervalo (30 a 250 kg).')
  if (!(test.durationMin >= 10 && test.durationMin <= 720)) errors.push('Duracao fora do intervalo (10 a 720 min).')
  if (!(test.fluidMl >= 0 && test.fluidMl <= 10000)) errors.push('Liquido ingerido fora do intervalo (0 a 10000 ml).')
  if (test.urineMl != null && !(test.urineMl >= 0 && test.urineMl <= 3000)) errors.push('Urina fora do intervalo (0 a 3000 ml).')
  if (test.preKg - test.postKg > test.preKg * 0.1) errors.push('Perda acima de 10% do peso: confira as pesagens.')
  if (test.sodiumMg != null && test.sodiumMg < 0) errors.push('Sodio ingerido invalido.')
  if (test.sweatSodiumMgL != null && !(test.sweatSodiumMgL >= 100 && test.sweatSodiumMgL <= 3000)) errors.push('Sodio do suor fora do intervalo (100 a 3000 mg/L).')
  return errors
}

function sweatLiters(test: HydrationTest, correctionKgH: number, scaleOffsetKg: number): number {
  const hours = test.durationMin / 60
  const base = (test.preKg - test.postKg) + test.fluidMl / 1000 - (test.urineMl ?? 0) / 1000
  return Math.max(0, base - correctionKgH * hours + scaleOffsetKg)
}

export function analyzeTest(test: HydrationTest): TestAnalysis {
  const hours = test.durationMin / 60
  const massLossKg = test.preKg - test.postKg
  const massLossPct = (massLossKg / test.preKg) * 100

  const sweatL: Range = {
    low: sweatLiters(test, METABOLIC_LOSS_KG_PER_H.max, -2 * SCALE_ERROR_KG),
    central: sweatLiters(test, METABOLIC_LOSS_KG_PER_H.central, 0),
    high: sweatLiters(test, METABOLIC_LOSS_KG_PER_H.min, 2 * SCALE_ERROR_KG),
  }
  const sweatRateLH: Range = {
    low: sweatL.low / hours,
    central: sweatL.central / hours,
    high: sweatL.high / hours,
  }

  const intakeMlH = test.fluidMl / hours
  const replacementPct = sweatL.central > 0 ? (test.fluidMl / 1000 / sweatL.central) * 100 : null
  const sodiumIntakeMgH = test.sodiumMg != null ? test.sodiumMg / hours : null

  const sodiumMeasured = test.sweatSodiumMgL != null
  const concentration = sodiumMeasured
    ? { low: test.sweatSodiumMgL as number, typical: test.sweatSodiumMgL as number, high: test.sweatSodiumMgL as number }
    : SWEAT_SODIUM_MG_PER_L
  const sodiumLossMgH: Range = {
    low: sweatRateLH.central * concentration.low,
    central: sweatRateLH.central * concentration.typical,
    high: sweatRateLH.central * concentration.high,
  }

  const paceSecKm = test.distanceKm && test.distanceKm > 0 ? (test.durationMin * 60) / test.distanceKm : null

  const flags: TestFlag[] = []
  if (massLossKg < 0) {
    flags.push({ tone: 'warn', text: 'Peso subiu durante o treino: voce bebeu mais do que suou. Em prova longa isso e o cenario de risco para hiponatremia.' })
  } else if (massLossPct > DEHYDRATION_REFERENCE_PCT) {
    flags.push({ tone: 'info', text: `Perda de ${massLossPct.toFixed(1)}% do peso, acima da referencia de ${DEHYDRATION_REFERENCE_PCT}%. E um sinal de atencao, nao um corte: em clima frio e ritmo moderado a tolerancia costuma ser maior.` })
  }
  if (replacementPct != null && replacementPct > 100) {
    flags.push({ tone: 'warn', text: 'Ingestao acima da estimativa de suor. Revise as pesagens ou o volume bebido.' })
  }
  if (sweatRateLH.high - sweatRateLH.low > 0.5) {
    flags.push({ tone: 'info', text: 'Faixa larga: pesagens mais cuidadosas (sem roupa molhada, apos urinar) e registro da urina estreitam a estimativa.' })
  }
  if (test.gi === 'strong') {
    flags.push({ tone: 'info', text: 'Desconforto gastrico forte: esse volume por hora nao conta como tolerado no plano.' })
  }

  return {
    test,
    hours,
    massLossKg,
    massLossPct,
    sweatL,
    sweatRateLH,
    intakeMlH,
    replacementPct,
    sodiumIntakeMgH,
    sodiumLossMgH,
    sodiumMeasured,
    paceSecKm,
    flags,
  }
}

export function summarizeTests(analyses: TestAnalysis[]): HydrationSummary | null {
  if (!analyses.length) return null
  const rates = analyses.map((analysis) => analysis.sweatRateLH.central)
  const tolerated = analyses
    .filter((analysis) => analysis.test.gi !== 'strong')
    .map((analysis) => analysis.intakeMlH)

  return {
    count: analyses.length,
    sweatRateMin: Math.min(...rates),
    sweatRateMax: Math.max(...rates),
    sweatRateMean: rates.reduce((sum, rate) => sum + rate, 0) / rates.length,
    massLossPctMax: Math.max(...analyses.map((analysis) => analysis.massLossPct)),
    toleratedIntakeMlH: tolerated.length ? Math.max(...tolerated) : null,
  }
}

function roundTo(value: number, step: number) {
  return Math.round(value / step) * step
}

// Heuristica: repor parte do suor (50-70%), limitada ao maior volume por hora ja tolerado
// sem desconforto forte. Nao e resultado de estudo; serve como ponto de partida para testar.
export function planIntake(summary: HydrationSummary | null): IntakePlan | null {
  if (!summary) return null

  const meanSweatMlH = summary.sweatRateMean * 1000
  let low = meanSweatMlH * REPLACEMENT_FRACTION.low
  let high = meanSweatMlH * REPLACEMENT_FRACTION.high
  const cap = summary.toleratedIntakeMlH
  let cappedByTolerance = false

  if (cap != null && high > cap) {
    cappedByTolerance = true
    high = cap
    if (low > cap) low = cap
  }

  return {
    lowMlH: roundTo(low, 10),
    highMlH: roundTo(high, 10),
    meanSweatMlH: roundTo(meanSweatMlH, 10),
    toleranceCapMlH: cap != null ? roundTo(cap, 10) : null,
    cappedByTolerance,
  }
}
