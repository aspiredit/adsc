import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyDqyZbVRfuBAeSnAvD3LvbQ3sVT8hGXJew",
  authDomain: "adsc-events.firebaseapp.com",
  projectId: "adsc-events",
  storageBucket: "adsc-events.firebasestorage.app",
  messagingSenderId: "750870457681",
  appId: "1:750870457681:web:2742bcea7ab212d0773770"
};

const app = initializeApp(firebaseConfig);
export const db  = getFirestore(app);
export const auth = getAuth(app);
