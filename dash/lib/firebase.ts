import { cert, getApps, initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

function getServiceAccount() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT

  if (!raw) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT is not configured')
  }

  try {
    return JSON.parse(raw)
  } catch {
    throw new Error('FIREBASE_SERVICE_ACCOUNT is not valid JSON')
  }
}

function getFirebaseApp() {
  if (getApps().length > 0) return getApps()[0]

  return initializeApp({
    credential: cert(getServiceAccount()),
  })
}

export function getDb() {
  return getFirestore(getFirebaseApp())
}

export const userRef = (stravaId: number) =>
  getDb().collection('users').doc(String(stravaId))

export const activitiesRef = (stravaId: number) =>
  userRef(stravaId).collection('activities')

export const metaRef = (stravaId: number) =>
  userRef(stravaId).collection('meta').doc('sync')

export const yearCachesRef = (stravaId: number) =>
  userRef(stravaId).collection('yearCaches')

export const yearCacheIndexRef = (stravaId: number, year: string) =>
  yearCachesRef(stravaId).doc(year)

export const yearCacheChunksRef = (stravaId: number, year: string) =>
  yearCacheIndexRef(stravaId, year).collection('chunks')

export const yearCacheChunkRef = (stravaId: number, year: string, chunkId: string) =>
  yearCacheChunksRef(stravaId, year).doc(chunkId)

export const yearAnalyticsRef = (stravaId: number, year: string) =>
  userRef(stravaId).collection('yearAnalytics').doc(year)

export const sleepRef = (stravaId: number) =>
  userRef(stravaId).collection('sleep')

export const weightRef = (stravaId: number) =>
  userRef(stravaId).collection('weight')
