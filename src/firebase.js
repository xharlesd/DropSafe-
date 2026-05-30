import { initializeApp } from "firebase/app";
import { getDatabase } from "firebase/database";

const firebaseConfig = {
  apiKey: "AIzaSyDcaHIRlbSt6i5XR-pcuP8VCljMGOiNklQ",
  authDomain: "dropsafe-e1c30.firebaseapp.com",
  databaseURL: "https://dropsafe-e1c30-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "dropsafe-e1c30",
  storageBucket: "dropsafe-e1c30.firebasestorage.app",
  messagingSenderId: "106599716165",
  appId: "1:106599716165:web:10a29cf672c2fd3ef11a2c",
  measurementId: "G-SJMZGS8581"
};

const app = initializeApp(firebaseConfig);

export const db = getDatabase(app);