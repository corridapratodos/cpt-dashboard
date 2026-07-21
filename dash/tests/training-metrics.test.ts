import test from 'node:test'
import assert from 'node:assert/strict'
import {
  calculateAggregatePace,
  getCalendarConsistency,
  getCanonicalLocalDate,
  getOfficialBestEffortDuration,
  hasCriticalMetricQualityIssue,
  isReliablePerformanceActivity,
} from '../lib/training-metrics.ts'

test('corrida real mais rapida que 4:30/km continua confiavel', () => {
  assert.equal(isReliablePerformanceActivity({ type: 'Run', distanceKm: 5, durationSec: 20 * 60, paceSec: 240 }), true)
})

test('trail legitima usa faixa diferente da corrida de rua', () => {
  assert.equal(isReliablePerformanceActivity({ type: 'TrailRun', distanceKm: 8, durationSec: 100 * 60, paceSec: 750 }), true)
})

test('atividade ignorada nunca e confiavel para desempenho', () => {
  assert.equal(isReliablePerformanceActivity({ type: 'Run', distanceKm: 10, durationSec: 45 * 60, paceSec: 270, excludedFromMetrics: true }), false)
})

test('flag critica impede uso em recorde ou desempenho', () => {
  const activity = { type: 'Run', distanceKm: 10, durationSec: 45 * 60, paceSec: 270, qualityFlags: ['invalid-distance'] }
  assert.equal(hasCriticalMetricQualityIssue(activity), true)
  assert.equal(isReliablePerformanceActivity(activity), false)
})

test('pace agregado usa tempo total dividido pela distancia', () => {
  assert.equal(calculateAggregatePace(3600, 12), 300)
  assert.equal(calculateAggregatePace(0, 12), null)
})

test('data local tem prioridade sobre o instante UTC', () => {
  assert.equal(getCanonicalLocalDate({ date: '2026-08-01T01:00:00.000Z', startDateLocal: '2026-07-31T22:00:00' }), '2026-07-31')
  assert.equal(getCanonicalLocalDate({ date: '2026-08-01T01:00:00.000Z' }), '2026-08-01')
})

test('best effort oficial usa elapsed time', () => {
  assert.equal(getOfficialBestEffortDuration({ elapsedSec: 1200, movingSec: 1140 }), 1200)
})

test('consistencia inclui semanas vazias e streak toca o fim da janela', () => {
  const result = getCalendarConsistency(
    ['2026-06-01', '2026-06-02', '2026-06-03', '2026-06-22'],
    new Date('2026-06-01T00:00:00Z'),
    new Date('2026-06-28T00:00:00Z'),
  )

  assert.equal(result.trackedWeeks, 4)
  assert.equal(result.solidWeeks, 1)
  assert.equal(result.currentStreakDays, 0)
  assert.equal(result.longestStreakDays, 3)
  assert.deepEqual(result.weekCounts, [3, 0, 0, 1])
})
