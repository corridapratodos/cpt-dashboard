import type { Activity, RecordEntry } from './types'
import type { DashboardAiPayload } from '@/lib/dashboard-ai'
import type { DashboardSlices, WindowMode } from './analytics'
import { fmt, getDisplayName, getSportLabel, sportMeta } from './helpers'
import { AnalysisSpotlight, AnalysisTile, InsightItem, Panel, SectionLead } from './ui'
import { DashboardAiReadingCard } from './DashboardAiReadingCard'

type Props = {
  windowMode: WindowMode
  stats: DashboardSlices['stats']
  periodContext: DashboardSlices['periodContext']
  analysisInsights: Array<{ title: string; copy: string }>
  periodBenchmark: DashboardSlices['periodBenchmark']
  periodRadar: DashboardSlices['periodRadar']
  showOperatorNotes: boolean
  records: RecordEntry[]
  effortHighlights: Activity[]
  aiPayload: DashboardAiPayload
}

export function DashboardInterpretationSection({
  windowMode,
  stats,
  periodContext,
  analysisInsights,
  periodBenchmark,
  periodRadar,
  showOperatorNotes,
  records,
  effortHighlights,
  aiPayload,
}: Props) {
  return (
    <>
      <SectionLead
        id="comparativo"
        eyebrow="Leitura comparativa"
        title="Periodo em contexto e interpretacao automatica"
        subtitle="Aqui o recorte atual deixa de ser so numero absoluto e passa a ser lido contra o bloco anterior e contra o proprio historico carregado."
      />
      <section className="dashboard-grid">
        <Panel eyebrow="Contexto" title="Leituras do periodo" subtitle="Composicao do bloco atual alem dos KPIs de topo">
          {periodContext && stats ? (
            <div className="analysis-grid">
              <AnalysisTile label="Densidade" value={`${periodContext.densityPct}%`} meta={`${periodContext.activeDays} dias ativos em ${periodContext.spanDays} dias`} />
              <AnalysisTile label="Sessao media" value={`${fmt.dist(periodContext.avgSessionKm)} km`} meta={`${periodContext.avgSessionMinutes} min por sessao`} />
              <AnalysisTile label="Peso do longao" value={`${periodContext.longestSharePct}%`} meta={`${fmt.dist(stats.longest.distanceKm)} km do volume total`} />
              <AnalysisTile label="Cadencia" value={`${periodContext.sessionsPerWeek.toFixed(1)}/sem`} meta="sessoes por semana ativa" />
            </div>
          ) : (
            <p className="empty-copy">Ainda nao ha base suficiente para contextualizar a janela ativa.</p>
          )}
        </Panel>

        <Panel eyebrow="Leitura automatica" title="Comparativos do recorte" subtitle="Resumo interpretado do bloco atual contra referencias equivalentes">
          {analysisInsights.length ? (
            <AnalysisSpotlight
              eyebrow="Leitura automatica"
              title={analysisInsights[0]?.title ?? 'Leitura pronta do recorte'}
              copy={analysisInsights[0]?.copy}
              badge="DESTAQUE"
            >
              {analysisInsights.slice(1).length > 0 && (
                <div className="analysis-spotlight-list">
                  {analysisInsights.slice(1).map((insight) => (
                    <article key={insight.title} className="analysis-spotlight-note">
                      <strong>{insight.title}</strong>
                      <p>{insight.copy}</p>
                    </article>
                  ))}
                </div>
              )}
            </AnalysisSpotlight>
          ) : (
            <p className="empty-copy">Ainda nao ha comparativos suficientes para gerar leitura automatica deste recorte.</p>
          )}
          {periodBenchmark && (
            <div className="analysis-grid analysis-grid-compact">
              <AnalysisTile label="Posicao em volume" value={`#${periodBenchmark.rank}/${periodBenchmark.total}`} meta={`${periodBenchmark.label} do recorte`} />
              <AnalysisTile label="Media comparavel" value={`${fmt.dist(periodBenchmark.averageDistance)} km`} meta={`${periodBenchmark.averageSessions.toFixed(1)} sessoes por periodo`} />
              <AnalysisTile label="Melhor janela" value={`${fmt.dist(periodBenchmark.best.distance)} km`} meta={periodBenchmark.best.label} />
              <AnalysisTile label="Janela atual" value={`${fmt.dist(periodBenchmark.current.distance)} km`} meta={periodBenchmark.current.label} />
            </div>
          )}
        </Panel>

        <Panel eyebrow="Radar" title="Distribuicao do bloco" subtitle="Leituras deterministicas da janela ativa, sem depender de LLM">
          {periodRadar ? (
            <div className="analysis-grid">
              <AnalysisTile label="Dia mais forte" value={`${fmt.dist(periodRadar.strongestDay.distance)} km`} meta={`${periodRadar.strongestDay.label} | ${periodRadar.strongestDaySharePct}% do volume`} />
              <AnalysisTile label="Maior intervalo" value={`${periodRadar.biggestGapDays}d`} meta="entre dias ativos do recorte" />
              <AnalysisTile label="Dia dominante" value={periodRadar.topWeekdayLabel} meta={`${periodRadar.topWeekdaySharePct}% das sessoes`} />
              <AnalysisTile label="Fim de semana" value={`${periodRadar.weekendSharePct}%`} meta="das sessoes em sabado e domingo" />
            </div>
          ) : (
            <p className="empty-copy">Ainda nao ha base suficiente para ler a distribuicao interna do recorte.</p>
          )}
        </Panel>

        <Panel eyebrow="IA beta" title="Leitura integrada" subtitle="Recorte atual enviado como JSON estruturado para leitura externa no proprio painel">
          <DashboardAiReadingCard payload={aiPayload} />
        </Panel>
      </section>

      <SectionLead
        eyebrow="Leitura de apoio"
        title={showOperatorNotes ? 'Contexto de produto, recordes e leitura qualitativa' : 'Recordes e leitura qualitativa'}
        subtitle={showOperatorNotes ? 'Esses blocos ajudam a interpretar os numeros principais sem transformar o painel em uma planilha crua.' : 'Blocos de apoio para interpretar a fase atual sem mergulhar direto no bruto.'}
      />
      <section className={`insight-grid ${showOperatorNotes ? 'insight-grid-expanded' : 'athlete-insight-grid'}`}>
        <Panel eyebrow="Recordes" title="Melhores marcas do recorte" subtitle="Prioriza best efforts oficiais do Strava. Quando nao houver detalhamento disponivel, cai para aproximacao pela atividade inteira.">
          {records.length ? (
            <div className="record-grid">
              {records.map((record) => (
                <article key={`${record.targetKm}-${record.activity.stravaId}`} className="compare-tile">
                  <p className="metric-label">{record.targetKm} km</p>
                  <strong>{fmt.clock(record.displayDurationSec)}</strong>
                  <span className="compare-previous">
                    {record.source === 'strava-best-effort'
                      ? `best effort oficial - ${fmt.pace(record.displayPaceSec)}/km`
                      : `aproximado pela atividade - ${fmt.pace(record.displayPaceSec)}/km`}
                  </span>
                  <span className="compare-previous">{getDisplayName(record.activity.name)} | {fmt.fullDate(record.activity.date)}</span>
                </article>
              ))}
            </div>
          ) : (
            <p className="empty-copy">Ainda nao ha atividades proximas das distancias de referencia neste recorte.</p>
          )}
        </Panel>

        {showOperatorNotes && (
          <Panel eyebrow="Produto" title="Leituras rapidas" subtitle="Como interpretar o recorte e a estrutura atual da home">
            <div className="insight-list">
              <InsightItem title="Janelas agora mudam a leitura">Voce pode alternar entre ano, mes ativo, semana ativa e 28 dias sem perder o mesmo recorte base de esporte e ano.</InsightItem>
              <InsightItem title="2026 agora carrega completo">O primeiro ano selecionado deixa de ficar preso ao recorte inicial de 160 atividades e passa a buscar o ano inteiro sob demanda.</InsightItem>
              <InsightItem title="Carga atual e heuristica">A leitura semanal serve para consistencia e deload, nao como equivalencia cientifica de TRIMP ou TSS.</InsightItem>
            </div>
          </Panel>
        )}

        <Panel eyebrow="Qualitativo" title="Ultimos treinos" subtitle="Amostra recente para leitura qualitativa">
          <div className="recent-grid">
            {effortHighlights.map((activity) => (
              <article key={activity.stravaId} className="mini-card">
                <div className="mini-topline">
                  <span className="sport-tag" style={{ background: sportMeta[activity.type]?.chip ?? 'var(--chip-neutral)' }}>{getSportLabel(activity.type)}</span>
                  <span>{fmt.date(activity.date)}</span>
                </div>
                <h4>{getDisplayName(activity.name)}</h4>
                <div className="mini-metrics">
                  <span>{fmt.dist(activity.distanceKm)} km</span>
                  <span>{fmt.dur(activity.durationSec)}</span>
                  <span>{activity.type === 'Ride' ? fmt.speed(activity.distanceKm, activity.durationSec) : `${fmt.pace(activity.paceSec)}/km`}</span>
                </div>
              </article>
            ))}
          </div>
        </Panel>
      </section>
    </>
  )
}
