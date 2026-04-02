import { initializeApp } from 'firebase/app';
import { getDatabase } from 'firebase/database';

const firebaseConfig = {
  apiKey: "AIzaSyBCtI0KICq-m3e40e3zbCjJyS9L6BFcN1Q",
  authDomain: "smart-qc-a2020.firebaseapp.com",
  databaseURL: "https://smart-qc-a2020-default-rtdb.firebaseio.com",
  projectId: "smart-qc-a2020",
  storageBucket: "smart-qc-a2020.firebasestorage.app",
  messagingSenderId: "284648655586",
  appId: "1:284648655586:web:1f27f82e0ed1077d852cbb",
  measurementId: "G-GQ82C89794"
};

const app = initializeApp(firebaseConfig);
export const db = getDatabase(app);
