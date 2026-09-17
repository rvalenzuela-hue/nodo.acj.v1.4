import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyCrz3epxfj33orn3k2oEd5vdudZrI6K5_8",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "sigeac-1fc0c.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "sigeac-1fc0c",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "sigeac-1fc0c.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "518704861037",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:518704861037:web:97bc0e3a94eaf1a9c91464",
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
