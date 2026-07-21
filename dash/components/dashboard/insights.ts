import type { DashboardSlices, WindowMode } from './analytics'
import { fmt } from './helpers'

export type AnalysisInsight = {
  title: string
  copy: string
}

type Params = {
  windowMode: WindowMode
  periodComparison: DashboardSlices['periodComparison']
  periodBenchmark: DashboardSlices['periodBenchmark']
  periodContext: DashboardSlices['periodContext']
  loadInsight: DashboardSlices['loadInsight']
}

export function buildAnalysisInsights({
  windowMode,
  periodComparison,
  periodBenchmark,
  periodContext,
  loadInsight,
}: Params): AnalysisInsight[] {
  const insights: AnalysisInsight[] = []

  if (periodComparison) {
    if (periodComparison.distanceChange >= 12) {
      insights.push({
        title: 'Volume acima do bloco anterior',
        copy: `A distancia subiu ${fmt.pct(periodComparison.distanceChange)} e a frequencia mudou ${fmt.pct(periodComparison.sessionChange)} frente ao periodo anterior equivalente.`,
      })
    } else if (periodComparison.distanceChange <= -12) {
      insights.push({
        title: 'Volume abaixo do bloco anterior',
        copy: `A distancia caiu ${Math.abs(periodComparison.distanceChange).toFixed(0)}% contra o bloco anterior. Isso pode refletir recuperacao planejada, pausa ou quebra de consistencia; o volume isolado nao distingue essas causas.`,
      })
    } else {
      insights.push({
        title: 'Volume em faixa parecida',
        copy: `O recorte atual esta perto do bloco anterior: distancia em ${fmt.pct(periodComparison.distanceChange)} e sessoes em ${fmt.pct(periodComparison.sessionChange)}.`,
      })
    }

    if (periodComparison.current.avgPace && periodComparison.previous.avgPace) {
      const improved = periodComparison.paceChange >= 2
      const regressed = periodComparison.paceChange <= -2
      insights.push({
        title: improved ? 'Desempenho ganhou eficiencia' : regressed ? 'Desempenho perdeu eficiencia' : 'Ritmo muito proximo do bloco anterior',
        copy: improved
          ? `O pace medio melhorou ${fmt.pct(periodComparison.paceChange)} contra o periodo anterior.`
          : regressed
            ? `O pace medio piorou ${Math.abs(periodComparison.paceChange).toFixed(0)}% contra o periodo anterior.`
            : 'O pace medio variou pouco, o que sugere estabilidade de intensidade neste recorte.',
      })
    }
  }

  if (periodBenchmark) {
    insights.push({
      title: `Posicao do ${windowMode === 'month' ? 'mes' : 'bloco semanal'} no historico filtrado`,
      copy: `Este recorte ocupa a posicao ${periodBenchmark.rank} de ${periodBenchmark.total} em volume dentro das ${periodBenchmark.label} carregadas. Melhor janela: ${fmt.dist(periodBenchmark.best.distance)} km em ${periodBenchmark.best.label}.`,
    })

    if (periodBenchmark.paceDelta != null) {
      insights.push({
        title: periodBenchmark.paceDelta >= 2 ? 'Ritmo acima da media comparavel' : periodBenchmark.paceDelta <= -2 ? 'Ritmo abaixo da media comparavel' : 'Ritmo em linha com a media comparavel',
        copy: periodBenchmark.paceDelta >= 2
          ? `O pace do periodo esta ${fmt.pct(periodBenchmark.paceDelta)} melhor que a media das ${periodBenchmark.label} equivalentes do recorte.`
          : periodBenchmark.paceDelta <= -2
            ? `O pace do periodo esta ${Math.abs(periodBenchmark.paceDelta).toFixed(0)}% abaixo da media das ${periodBenchmark.label} equivalentes do recorte.`
            : `O pace do periodo esta praticamente alinhado com a media das ${periodBenchmark.label} equivalentes do recorte.`,
      })
    }
  }

  if (periodContext) {
    insights.push({
      title: 'Densidade de treino do recorte',
      copy: `${periodContext.activeDays} dias ativos em ${periodContext.spanDays} dias de janela, com densidade de ${periodContext.densityPct}% e media de ${periodContext.sessionsPerWeek} sessoes por semana ativa.`,
    })
  }

  if (loadInsight) {
    insights.push({
      title: 'Consistencia do volume recente',
      copy: `${loadInsight.recommendation} O bloco tem ${loadInsight.stableWeeks} semanas consecutivas dentro da faixa recente de volume.`,
    })
  }

  return insights.slice(0, 4)
}

export function buildYearLabel(selectedYears: string[], allYearsSelected: boolean) {
  return allYearsSelected ? 'historico completo' : selectedYears.length === 1 ? selectedYears[0] : `${selectedYears.length} anos`
}

export function buildLoadingLabel(loadingYears: string[]) {
  if (!loadingYears.length) return ''
  return loadingYears.length === 1
    ? `Carregando recorte de ${loadingYears[0]}...`
    : `Carregando ${loadingYears.length} anos selecionados...`
}
