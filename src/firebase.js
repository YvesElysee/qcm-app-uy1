import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  // COLLE TES CLES ICI
  apiKey: "AIzaSyA0IcPrxRxaVHSkqs3FOuknImq5vhB5Qss",
  authDomain: "qcm-app-3fb0e.firebaseapp.com",
  projectId: "qcm-app-3fb0e",
  storageBucket: "qcm-app-3fb0e.firebasestorage.app",
  messagingSenderId: "536752092231",
  appId: "1:536752092231:web:3d3a2efc82045630c96d62"
};

// Initialisation de Firebase
const app = initializeApp(firebaseConfig);

// EXPORTATION DE LA BASE DE DONNEES (C'est la ligne importante !)
export const db = getFirestore(app);
