import { useEffect, useMemo, useState } from 'react'
import type { Activity } from './types'
import { fmt } from './helpers'
import { AnalysisTile, Panel, SectionLead } from './ui'
import {
  DEHYDRATION_REFERENCE_PCT,
  REPLACEMENT_FRACTION,
  SWEAT_SODIUM_MG_PER_L,
  analyzeTest,
  planIntake,
  summarizeTests,
  validateTest,
  type GiDiscomfort,
  type HydrationTest,
} from '@/lib/hydration'

type Props = {
  viewerKey: string
  activities: Activity[]
}

type FormState = {
  date: string
  preKg: string
  postKg: string
  fluidMl: string
  urineMl: string
  durationMin: string
  distanceKm: string
  tempC: string
  humidityPct: string
  sodiumMg: string
  carbG: string
  sweatSodiumMgL: string
  gi: GiDiscomfort
}

const EMPTY_FORM: FormState = {
  date: '',
  preKg: '',
  postKg: '',
  fluidMl: '',
  urineMl: '',
  durationMin: '',
  distanceKm: '',
  tempC: '',
  humidityPct: '',
  sodiumMg: '',
  carbG: '',
  sweatSodiumMgL: '',
  gi: 'none',
}

const GI_LABEL: Record<GiDiscomfort, string> = {
  none: 'sem desconforto',
  mild: 'desconforto leve',
  strong: 'desconforto forte',
}

function storageKey(viewerKey: string) {
  return `cpt-hydration:${viewerKey}`
}

function readStoredTests(viewerKey: string): HydrationTest[] {
  try {
    const raw = window.localStorage.getItem(storageKey(viewerKey))
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as HydrationTest[]) : []
  } catch {
    return []
  }
}

function writeStoredTests(viewerKey: string, tests: HydrationTest[]) {
  try {
    window.localStorage.setItem(storageKey(viewerKey), JSON.stringify(tests))
  } catch {
    // armazenamento indisponivel: o card segue funcionando nesta sessao
  }
}

function num(value: string): number | null {
  const clean = value.trim().replace(',', '.')
  if (!clean) return null
  const parsed = Number(clean)
  return Number.isFinite(parsed) ? parsed : null
}

function rangeLabel(low: number, high: number, digits = 1) {
  return `${low.toFixed(digits)}-${high.toFixed(digits)}`
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="hydration-field">
      <span className="metric-label">{label}</span>
      {children}
      {hint && <small className="hydration-hint">{hint}</small>}
    </label>
  )
}

export function DashboardHydrationCard({ viewerKey, activities }: Props) {
  const [tests, setTests] = useState<HydrationTest[]>([])
  const [loaded, setLoaded] = useState(false)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [errors, setErrors] = useState<string[]>([])
  const [formOpen, setFormOpen] = useState(false)

  useEffect(() => {
    setTests(readStoredTests(viewerKey))
    setLoaded(true)
  }, [viewerKey])

  useEffect(() => {
    if (loaded) writeStoredTests(viewerKey, tests)
  }, [loaded, tests, viewerKey])

  const runs = useMemo(
    () => activities.filter((activity) => activity.type === 'Run' || activity.type === 'TrailRun').slice(0, 20),
    [activities]
  )

  const analyses = useMemo(
    () => [...tests].sort((a, b) => (a.date < b.date ? 1 : -1)).map(analyzeTest),
    [tests]
  )
  const summary = useMemo(() => summarizeTests(analyses), [analyses])
  const plan = useMemo(() => planIntake(summary), [summary])

  const setField = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((current) => ({ ...current, [key]: value }))
  }

  const prefillFromActivity = (stravaId: string) => {
    const activity = runs.find((run) => String(run.stravaId) === stravaId)
    if (!activity) return
    setForm((current) => ({
      ...current,
      date: activity.localDate || activity.date.slice(0, 10),
      durationMin: String(Math.round(activity.durationSec / 60)),
      distanceKm: activity.distanceKm.toFixed(1),
    }))
  }

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault()
    const candidate: Omit<HydrationTest, 'id'> = {
      date: form.date,
      preKg: num(form.preKg) ?? NaN,
      postKg: num(form.postKg) ?? NaN,
      fluidMl: num(form.fluidMl) ?? 0,
      urineMl: num(form.urineMl),
      durationMin: num(form.durationMin) ?? NaN,
      distanceKm: num(form.distanceKm),
      tempC: num(form.tempC),
      humidityPct: num(form.humidityPct),
      sodiumMg: num(form.sodiumMg),
      carbG: num(form.carbG),
      sweatSodiumMgL: num(form.sweatSodiumMgL),
      gi: form.gi,
    }

    const found = validateTest(candidate)
    setErrors(found)
    if (found.length) return

    setTests((current) => [...current, { ...candidate, id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}` }])
    setForm(EMPTY_FORM)
    setFormOpen(false)
  }

  const removeTest = (id: string) => {
    if (!window.confirm('Remover este teste?')) return
    setTests((current) => current.filter((item) => item.id !== id))
  }

  return (
    <>
      <SectionLead
        id="hidratacao"
        eyebrow="Hidratacao"
        title="Taxa de suor e plano de reposicao"
        subtitle="Calibrado com os seus testes de pesagem. Sem testes, nao ha numero confiavel para prescrever."
      />
      <section className="dashboard-grid">
        <Panel
          eyebrow="Calibracao"
          title="Seus testes de suor"
          subtitle="Pese antes e depois do treino, anote o que bebeu. O resultado vem com faixa de incerteza."
          right={
            <button type="button" className="btn btn-outline" onClick={() => setFormOpen((open) => !open)}>
              {formOpen ? 'Fechar' : 'Registrar teste'}
            </button>
          }
        >
          {formOpen && (
            <form className="hydration-form" onSubmit={handleSubmit} noValidate>
              {runs.length > 0 && (
                <Field label="Preencher com corrida" hint="Opcional: copia data, duracao e distancia.">
                  <select className="period-select" defaultValue="" onChange={(event) => prefillFromActivity(event.target.value)}>
                    <option value="">Escolher corrida recente</option>
                    {runs.map((run) => (
                      <option key={run.stravaId} value={run.stravaId}>
                        {fmt.date(run.date)} - {run.name} ({fmt.dist(run.distanceKm)} km)
                      </option>
                    ))}
                  </select>
                </Field>
              )}
              <div className="hydration-grid">
                <Field label="Data">
                  <input className="access-input" type="date" value={form.date} onChange={(event) => setField('date', event.target.value)} />
                </Field>
                <Field label="Peso antes (kg)" hint="Sem roupa, apos urinar.">
                  <input className="access-input" inputMode="decimal" value={form.preKg} onChange={(event) => setField('preKg', event.target.value)} />
                </Field>
                <Field label="Peso depois (kg)" hint="Sem roupa molhada, mesma balanca.">
                  <input className="access-input" inputMode="decimal" value={form.postKg} onChange={(event) => setField('postKg', event.target.value)} />
                </Field>
                <Field label="Duracao (min)">
                  <input className="access-input" inputMode="numeric" value={form.durationMin} onChange={(event) => setField('durationMin', event.target.value)} />
                </Field>
                <Field label="Liquido ingerido (ml)" hint="Tudo: agua, bebida, gel diluido.">
                  <input className="access-input" inputMode="numeric" value={form.fluidMl} onChange={(event) => setField('fluidMl', event.target.value)} />
                </Field>
                <Field label="Urina durante (ml)" hint="Opcional; vazio conta como 0.">
                  <input className="access-input" inputMode="numeric" value={form.urineMl} onChange={(event) => setField('urineMl', event.target.value)} />
                </Field>
                <Field label="Distancia (km)">
                  <input className="access-input" inputMode="decimal" value={form.distanceKm} onChange={(event) => setField('distanceKm', event.target.value)} />
                </Field>
                <Field label="Temperatura (C)">
                  <input className="access-input" inputMode="decimal" value={form.tempC} onChange={(event) => setField('tempC', event.target.value)} />
                </Field>
                <Field label="Umidade (%)">
                  <input className="access-input" inputMode="numeric" value={form.humidityPct} onChange={(event) => setField('humidityPct', event.target.value)} />
                </Field>
                <Field label="Sodio ingerido (mg)">
                  <input className="access-input" inputMode="numeric" value={form.sodiumMg} onChange={(event) => setField('sodiumMg', event.target.value)} />
                </Field>
                <Field label="Carboidrato (g)">
                  <input className="access-input" inputMode="numeric" value={form.carbG} onChange={(event) => setField('carbG', event.target.value)} />
                </Field>
                <Field label="Sodio do suor (mg/L)" hint="So se voce fez teste de suor medido.">
                  <input className="access-input" inputMode="numeric" value={form.sweatSodiumMgL} onChange={(event) => setField('sweatSodiumMgL', event.target.value)} />
                </Field>
                <Field label="Estomago">
                  <select className="period-select" value={form.gi} onChange={(event) => setField('gi', event.target.value as GiDiscomfort)}>
                    {(Object.keys(GI_LABEL) as GiDiscomfort[]).map((key) => (
                      <option key={key} value={key}>{GI_LABEL[key]}</option>
                    ))}
                  </select>
                </Field>
              </div>
              {errors.length > 0 && (
                <ul className="access-error hydration-errors">
                  {errors.map((message) => <li key={message}>{message}</li>)}
                </ul>
              )}
              <div className="admin-actions-row">
                <button type="submit" className="btn btn-primary">Salvar teste</button>
                <button type="button" className="btn btn-outline" onClick={() => { setForm(EMPTY_FORM); setErrors([]) }}>Limpar</button>
              </div>
            </form>
          )}

          {!analyses.length ? (
            <p className="empty-copy">
              Nenhum teste registrado. Faixa de populacao para referencia: de 0,5 a mais de 2 L/h de suor, com grande variacao entre pessoas e entre dias. Use apenas como contexto, nao para prescrever.
            </p>
          ) : (
            <div className="hydration-list">
              {analyses.map((analysis) => (
                <article key={analysis.test.id} className="hydration-row">
                  <div className="hydration-row-head">
                    <strong>{fmt.fullDate(`${analysis.test.date}T00:00:00Z`)}</strong>
                    <span className="pill pill-ghost">
                      {analysis.test.durationMin} min
                      {analysis.test.distanceKm ? ` | ${analysis.test.distanceKm.toFixed(1)} km` : ''}
                      {analysis.paceSecKm ? ` | ${fmt.pace(Math.round(analysis.paceSecKm))}/km` : ''}
                      {analysis.test.tempC != null ? ` | ${analysis.test.tempC.toFixed(0)} C` : ''}
                      {analysis.test.humidityPct != null ? ` | ${analysis.test.humidityPct.toFixed(0)}% umid.` : ''}
                    </span>
                    <button type="button" className="btn btn-ghost" onClick={() => removeTest(analysis.test.id)}>Remover</button>
                  </div>
                  <div className="analysis-grid analysis-grid-compact">
                    <AnalysisTile
                      label="Taxa de suor"
                      value={`${analysis.sweatRateLH.central.toFixed(2)} L/h`}
                      meta={`faixa ${rangeLabel(analysis.sweatRateLH.low, analysis.sweatRateLH.high, 2)} L/h`}
                    />
                    <AnalysisTile
                      label="Perda de peso"
                      value={`${analysis.massLossPct.toFixed(1)}%`}
                      meta={`${analysis.massLossKg.toFixed(1)} kg | referencia ${DEHYDRATION_REFERENCE_PCT}%`}
                    />
                    <AnalysisTile
                      label="Ingestao"
                      value={`${Math.round(analysis.intakeMlH)} ml/h`}
                      meta={analysis.replacementPct != null ? `${Math.round(analysis.replacementPct)}% do suor | ${GI_LABEL[analysis.test.gi]}` : GI_LABEL[analysis.test.gi]}
                    />
                    <AnalysisTile
                      label={analysis.sodiumMeasured ? 'Sodio perdido (medido)' : 'Sodio perdido (cenarios)'}
                      value={
                        analysis.sodiumMeasured
                          ? `${Math.round(analysis.sodiumLossMgH.central)} mg/h`
                          : `${Math.round(analysis.sodiumLossMgH.low)}-${Math.round(analysis.sodiumLossMgH.high)} mg/h`
                      }
                      meta={
                        analysis.sodiumIntakeMgH != null
                          ? `ingerido ${Math.round(analysis.sodiumIntakeMgH)} mg/h`
                          : 'sodio ingerido nao informado'
                      }
                    />
                  </div>
                  {analysis.flags.map((flag) => (
                    <p key={flag.text} className="hydration-flag" data-tone={flag.tone}>{flag.text}</p>
                  ))}
                </article>
              ))}
            </div>
          )}
        </Panel>

        <Panel
          eyebrow="Plano"
          title="Ponto de partida para a prova"
          subtitle="Heuristica sobre os seus testes, para ser validada nos longos finais."
        >
          {summary && plan ? (
            <>
              <div className="analysis-grid">
                <AnalysisTile
                  label="Suor observado"
                  value={`${rangeLabel(summary.sweatRateMin, summary.sweatRateMax, 2)} L/h`}
                  meta={`${summary.count} ${summary.count === 1 ? 'teste' : 'testes'} | media ${summary.sweatRateMean.toFixed(2)} L/h`}
                />
                <AnalysisTile
                  label="Reposicao sugerida"
                  value={`${plan.lowMlH}-${plan.highMlH} ml/h`}
                  meta={`${Math.round(REPLACEMENT_FRACTION.low * 100)}-${Math.round(REPLACEMENT_FRACTION.high * 100)}% do suor medio${plan.cappedByTolerance ? ' | limitada pelo seu estomago' : ''}`}
                />
                <AnalysisTile
                  label="Maior volume tolerado"
                  value={plan.toleranceCapMlH != null ? `${plan.toleranceCapMlH} ml/h` : '-'}
                  meta={plan.toleranceCapMlH != null ? 'sem desconforto forte; treinavel com o tempo' : 'todos os testes com desconforto forte'}
                />
                <AnalysisTile
                  label="Maior perda de peso"
                  value={`${summary.massLossPctMax.toFixed(1)}%`}
                  meta={`referencia ${DEHYDRATION_REFERENCE_PCT}%, nao e um corte rigido`}
                />
              </div>
              {summary.count < 3 && (
                <p className="hydration-flag" data-tone="info">
                  Com {summary.count} {summary.count === 1 ? 'teste' : 'testes'} a faixa ainda e fragil. Repita em condicoes parecidas com a da prova antes de confiar.
                </p>
              )}
            </>
          ) : (
            <p className="empty-copy">O plano aparece depois do primeiro teste registrado.</p>
          )}

          <div className="hydration-notes">
            <p className="metric-label">O que e medido e o que e estimado</p>
            <ul>
              <li><strong>Medido por voce:</strong> peso antes e depois, liquido ingerido, duracao. A taxa de suor sai da diferenca, descontando a perda metabolica (~0,12 kg/h, aproximacao) e com erro de balanca de 0,1 kg por pesagem.</li>
              <li><strong>Cenario, nao medida:</strong> sodio no suor. Varia cerca de 10 vezes entre pessoas; usamos {SWEAT_SODIUM_MG_PER_L.low}, {SWEAT_SODIUM_MG_PER_L.typical} e {SWEAT_SODIUM_MG_PER_L.high} mg/L como cenarios. Um teste de suor medido substitui isso.</li>
              <li><strong>Heuristica:</strong> repor {Math.round(REPLACEMENT_FRACTION.low * 100)}-{Math.round(REPLACEMENT_FRACTION.high * 100)}% do suor, limitado ao que o estomago tolera. Nao vem de um estudo; valide nos longos.</li>
              <li><strong>Fora do modelo:</strong> ritmo da prova, sol, aclimatacao e dia a dia mudam o suor. Beber a mais que o suor e o risco que mais importa em prova longa e lenta (hiponatremia).</li>
            </ul>
            <p className="hydration-hint">Os testes ficam salvos apenas neste navegador.</p>
          </div>
        </Panel>
      </section>
    </>
  )
}
