// Busca atividades do atleta com suporte a sync incremental por data
export async function fetchActivities(accessToken: string, after?: number) {
  const activities: any[] = []
  let page = 1

  while (true) {
    const params = new URLSearchParams({
      per_page: '200',
      page: String(page),
    })

    if (after) params.set('after', String(after))

    const res = await fetch(
      `https://www.strava.com/api/v3/athlete/activities?${params.toString()}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    )

    if (!res.ok) throw new Error(`Strava API error: ${res.status}`)

    const batch = await res.json()
    if (!batch.length) break

    activities.push(...batch)
    page++
  }

  return activities
}

export async function fetchAllActivities(accessToken: string) {
  return fetchActivities(accessToken)
}

// Busca atividade individual (para best efforts/splits)
export async function fetchActivity(accessToken: string, id: number) {
  const res = await fetch(
    `https://www.strava.com/api/v3/activities/${id}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  )

  if (!res.ok) throw new Error(`Strava API error: ${res.status}`)

  return res.json()
}

// Filtro de corrida valida para a lente principal do produto
export function isRealRun(a: any): boolean {
  if (a.type !== 'Run') return false

  const distKm = a.distance / 1000
  const durationMin = a.moving_time / 60

  if (distKm < 2 || durationMin < 20) return false

  const paceSec = a.moving_time / distKm
  return paceSec >= 270 && paceSec <= 600
}

// Normaliza atividade para o schema do Firestore
export function mapActivity(a: any) {
  const distKm = a.distance / 1000
  const paceSec = distKm > 0 ? Math.round(a.moving_time / distKm) : null

  return {
    stravaId: a.id,
    name: a.name,
    date: new Date(a.start_date),
    distanceKm: parseFloat(distKm.toFixed(2)),
    durationSec: a.moving_time,
    paceSec,
    hrAvg: a.average_heartrate ?? null,
    hrMax: a.max_heartrate ?? null,
    elevationGain: a.total_elevation_gain ?? 0,
    kudos: a.kudos_count ?? 0,
    type: a.type,
    syncedAt: new Date(),
  }
}

