import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

// Try to load from the JSON file using glob (won't fail if missing)
const configs = import.meta.glob('../firebase-applet-config.json', { eager: true });
const jsonConfig = (Object.values(configs)[0] as any)?.default;

// Fallback to environment variables (Netlify/Production)
const config = {
  apiKey: jsonConfig?.apiKey || import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: jsonConfig?.authDomain || import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: jsonConfig?.projectId || import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: jsonConfig?.storageBucket || import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: jsonConfig?.messagingSenderId || import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: jsonConfig?.appId || import.meta.env.VITE_FIREBASE_APP_ID,
  firestoreDatabaseId: jsonConfig?.firestoreDatabaseId || import.meta.env.VITE_FIREBASE_DATABASE_ID
};

console.log("Initializing Firebase with project:", config.projectId);

let app;
try {
  if (!config.apiKey) {
    throw new Error("Missing API Key");
  }
  app = initializeApp(config);
} catch (e) {
  console.error("CRITICAL: Firebase configuration is missing or invalid! Please set VITE_FIREBASE_API_KEY and other variables in your environment.", e);
  // Initialize with a dummy config to prevent exports from being undefined
  app = initializeApp({
    apiKey: "missing",
    authDomain: "missing",
    projectId: "missing",
    storageBucket: "missing",
    messagingSenderId: "missing",
    appId: "missing"
  });
}

export const db = getFirestore(app, config.firestoreDatabaseId || '(default)');
export const auth = getAuth(app);
export const storage = getStorage(app);
