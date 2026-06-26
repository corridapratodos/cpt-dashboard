import { initializeApp, getApps, cert } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

// Inicializa apenas uma vez (Next.js hot reload safe)
const app =
  getApps().length === 0
    ? initializeApp({ credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT!)) })
    : getApps()[0]

export const db = getFirestore(app)

// Helpers de referência (schema do Firestore)
export const userRef = (stravaId: number) =>
  db.collection('users').doc(String(stravaId))

export const activitiesRef = (stravaId: number) =>
  userRef(stravaId).collection('activities')

export const metaRef = (stravaId: number) =>
  userRef(stravaId).collection('meta').doc('sync')
