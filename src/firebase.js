import { initializeApp } from "firebase/app";
import { getDatabase } from "firebase/database";

const firebaseConfig = {
  apiKey: "AIzaSyC260e4Gm5xYsHPYGlT16DScv6cjCLUdLc",
  authDomain: "car-reservation-4ca46.firebaseapp.com",
  databaseURL: "https://car-reservation-4ca46-default-rtdb.firebaseio.com",
  projectId: "car-reservation-4ca46",
  storageBucket: "car-reservation-4ca46.firebasestorage.app",
  messagingSenderId: "941135831175",
  appId: "1:941135831175:web:25fe3c7f0a43fdd62dd822"
};

const app = initializeApp(firebaseConfig);
export const db = getDatabase(app);
