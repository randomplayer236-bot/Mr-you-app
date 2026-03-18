import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import firebaseConfig from '../firebase-applet-config.json';

console.log("Initializing Firebase with project:", firebaseConfig?.projectId);

if (!firebaseConfig || !firebaseConfig.apiKey) {
  console.error("CRITICAL: Firebase configuration is missing or invalid!");
  throw new Error("Firebase configuration is missing or invalid");
}

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
