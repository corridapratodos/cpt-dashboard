import type { ActivitySplit } from '@/components/dashboard/types'


type InterpretationActivity = {
  type: string
  paceSec: number | null
  hrAvg: number | null
}

export type ActivityInterpretation = {
  title: string
  summary: string
  callouts: string[]
}

type PaceSplit = ActivitySplit & {
  paceSec: number
}

function round(value: number, digits = 1) {
  return Number(value.toFixed(digits))
}

function average(values: number[]) {
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function median(values: number[]) {
  const ordered = [...values].sort((a, b) => a - b)
  const middle = Math.floor(ordered.length / 2)
  return ordered.length % 2 === 0
    ? (ordered[middle - 1] + ordered[middle]) / 2
    : ordered[middle]
}

function formatPct(value: number) {
  return `${value > 0 ? '+' : ''}${Math.round(value)}%`
}

function buildMainBlock(splits: PaceSplit[]) {
  if (splits.length < 4) {
    return { main: splits, trimmedStart: false, trimmedEnd: false }
  }

  const paceMedian = median(splits.map((split) => split.paceSec))
  const trimmedStart = splits[0].paceSec >= paceMedian * 1.12
  const trimmedEnd = splits[splits.length - 1].paceSec >= paceMedian * 1.12
  const startIndex = trimmedStart ? 1 : 0
  const endIndex = trimmedEnd ? splits.length - 1 : splits.length
  const main = endIndex > startIndex ? splits.slice(startIndex, endIndex) : splits

  return {
    main: main.length >= 4 ? main : splits,
    trimmedStart,
    trimmedEnd,
  }
}

function getHalfPaceChangePct(main: PaceSplit[]) {
  const middle = Math.floor(main.length / 2)
  const first = main.slice(0, middle)
  const second = main.slice(middle)
  if (!first.length || !second.length) return 0

  const firstAvg = average(first.map((split) => split.paceSec))
  const secondAvg = average(second.map((split) => split.paceSec))
  return ((firstAvg - secondAvg) / firstAvg) * 100
}

function getConsistencyPct(main: PaceSplit[]) {
  const paceValues = main.map((split) => split.paceSec)
  const avgPace = average(paceValues)
  const spread = Math.max(...paceValues) - Math.min(...paceValues)
  return avgPace > 0 ? (spread / avgPace) * 100 : 0
}

function getHeartRateSignal(main: PaceSplit[]) {
  const hrSplits = main.filter((split) => split.hrAvg != null)
  if (hrSplits.length < 4) return ''

  const middle = Math.floor(hrSplits.length / 2)
  const first = hrSplits.slice(0, middle)
  const second = hrSplits.slice(middle)
  if (!first.length || !second.length) return ''

  const firstHr = average(first.map((split) => split.hrAvg ?? 0))
  const secondHr = average(second.map((split) => split.hrAvg ?? 0))
  const hrDelta = secondHr - firstHr
  const paceChangePct = getHalfPaceChangePct(main)

  if (hrDelta >= 6 && paceChangePct <= 1) {
    return `A FC subiu ${Math.round(hrDelta)} bpm entre as metades, sinal de custo crescente para sustentar o bloco.`
  }

  if (hrDelta >= 3 && paceChangePct > 1) {
    return `A FC acompanhou a aceleracao do bloco e subiu cerca de ${Math.round(hrDelta)} bpm sem sair do controle.`
  }

  if (Math.abs(hrDelta) < 3) {
    return 'A FC ficou bem estavel ao longo do bloco principal, reforcando a sensacao de controle.'
  }

  return ''
}

function getTitle(progressPct: number, consistencyPct: number) {
  if (progressPct >= 3) return 'Treino que ganhou ritmo'
  if (progressPct <= -3) return 'Treino que perdeu sustentacao'
  if (consistencyPct <= 4) return 'Treino bem redondo'
  return 'Treino com oscilacao moderada'
}

function getSummary(main: PaceSplit[], progressPct: number, consistencyPct: number) {
  const start = main[0]
  const end = main[main.length - 1]
  const paceDeltaLabel = formatPct(progressPct)

  if (progressPct >= 3) {
    return `O bloco principal foi ficando mais rapido ao longo do treino. Do primeiro ao ultimo km util, o ritmo saiu de ${Math.floor(start.paceSec / 60)}:${String(start.paceSec % 60).padStart(2, '0')}/km para ${Math.floor(end.paceSec / 60)}:${String(end.paceSec % 60).padStart(2, '0')}/km, com progressao de ${paceDeltaLabel}.`
  }

  if (progressPct <= -3) {
    return `O treino comecou mais encaixado e perdeu ritmo na metade final. A segunda metade ficou ${formatPct(progressPct)} abaixo da primeira, sugerindo perda de sustentacao dentro do proprio bloco.`
  }

  if (consistencyPct <= 4) {
    return 'O bloco principal ficou bem estavel, com pouca variacao entre as parciais e sem sinais claros de quebra interna. E um treino que passa sensacao de fluidez do comeco ao fim.'
  }

  return 'O treino teve algumas oscilacoes de ritmo, mas ainda manteve um bloco principal reconhecivel. Nao parece uma sessao baguncada, so menos continua do que um bloco totalmente liso.'
}

export function buildActivityInterpretation(activity: InterpretationActivity, splits: ActivitySplit[]): ActivityInterpretation | null {
  if (!['Run', 'TrailRun', 'VirtualRun', 'Walk', 'Hike'].includes(activity.type)) return null

  const paced = splits.filter((split): split is PaceSplit => split.paceSec != null && Number.isFinite(split.paceSec) && split.distanceKm >= 0.8)
  if (paced.length < 4) return null

  const block = buildMainBlock(paced)
  const main = block.main
  const progressPct = round(getHalfPaceChangePct(main))
  const consistencyPct = round(getConsistencyPct(main))
  const title = getTitle(progressPct, consistencyPct)
  const summary = getSummary(main, progressPct, consistencyPct)
  const callouts: string[] = []

  if (block.trimmedStart) {
    callouts.push('O inicio parece aquecimento ou entrada em ritmo, entao a leitura priorizou o bloco central.')
  }

  if (block.trimmedEnd) {
    callouts.push('O fechamento parece desaquecimento ou sobra curta, entao o texto nao tratou esse trecho como parte do bloco principal.')
  }

  if (consistencyPct <= 4) {
    callouts.push(`As parciais do bloco util variaram pouco entre si, com dispersao de cerca de ${consistencyPct.toFixed(1)}%.`)
  } else if (consistencyPct >= 8) {
    callouts.push(`As parciais oscilaram bastante dentro do bloco util, com dispersao de cerca de ${consistencyPct.toFixed(1)}%.`)
  } else {
    callouts.push(`O bloco principal teve variacao moderada entre parciais, na casa de ${consistencyPct.toFixed(1)}%.`)
  }

  if (progressPct >= 3) {
    callouts.push(`A segunda metade do bloco foi ${formatPct(progressPct)} mais rapida do que a primeira.`)
  } else if (progressPct <= -3) {
    callouts.push(`A segunda metade do bloco ficou ${formatPct(progressPct)} abaixo da primeira.`)
  } else {
    callouts.push('A relacao entre primeira e segunda metade ficou proxima, sem mudanca brusca de andamento.')
  }

  const heartRateSignal = getHeartRateSignal(main)
  if (heartRateSignal) {
    callouts.push(heartRateSignal)
  } else if (activity.hrAvg != null) {
    callouts.push('A FC media existe, mas ainda sem sinal forte o bastante para mudar a leitura do bloco.')
  }

  return {
    title,
    summary,
    callouts: callouts.slice(0, 4),
  }
}
