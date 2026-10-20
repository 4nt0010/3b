import { initializeApp, deleteApp } from "https://www.gstatic.com/firebasejs/13.0.0/firebase-app.js";
import {
  getAuth, initializeAuth, inMemoryPersistence, onAuthStateChanged, signInWithEmailAndPassword, signOut,
  createUserWithEmailAndPassword, updatePassword, reauthenticateWithCredential, EmailAuthProvider,
} from "https://www.gstatic.com/firebasejs/13.0.0/firebase-auth.js";
import {
  getFirestore, collection, doc, onSnapshot, query, where, getDoc, getDocs, setDoc, updateDoc, addDoc,
  deleteDoc, writeBatch, serverTimestamp, arrayUnion, arrayRemove, deleteField, limit,
} from "https://www.gstatic.com/firebasejs/13.0.0/firebase-firestore.js";

export const firebaseConfig = {
  apiKey: "AIzaSyB6fLEMqAcGvSu_eFGz1avII2cYBVvrDFY",
  authDomain: "binterrogazioni.firebaseapp.com",
  projectId: "binterrogazioni",
  storageBucket: "binterrogazioni.firebasestorage.app",
  messagingSenderId: "771827986229",
  appId: "1:771827986229:web:949179421b368b7b1ea67c",
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

/* Crea un account studente senza far uscire l'admin:
   usa una seconda istanza di Firebase con sessione solo in memoria. */
export async function createStudentAccount(email, password) {
  const sec = initializeApp(firebaseConfig, 'sec-' + Date.now());
  try {
    const secAuth = initializeAuth(sec, { persistence: inMemoryPersistence });
    const cred = await createUserWithEmailAndPassword(secAuth, email, password);
    const uid = cred.user.uid;
    await signOut(secAuth);
    return uid;
  } finally {
    await deleteApp(sec);
  }
}

export {
  onAuthStateChanged, signInWithEmailAndPassword, signOut, updatePassword, reauthenticateWithCredential, EmailAuthProvider,
  collection, doc, onSnapshot, query, where, getDoc, getDocs, setDoc, updateDoc, addDoc, deleteDoc, writeBatch,
  serverTimestamp, arrayUnion, arrayRemove, deleteField, limit,
};
