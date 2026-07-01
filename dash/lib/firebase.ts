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

export const sleepRef = (stravaId: number) =>
  userRef(stravaId).collection('sleep')

export const weightRef = (stravaId: number) =>
  userRef(stravaId).collection('weight')
