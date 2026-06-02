import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: 'AIzaSyCPj3zWsI5ANQ3yXeOgDuY7BsTL9Z9Fqs8',
  authDomain: 'book-log-b40e1.firebaseapp.com',
  projectId: 'book-log-b40e1',
  storageBucket: 'book-log-b40e1.firebasestorage.app',
  messagingSenderId: '461338396030',
  appId: '1:461338396030:web:75a4d09a6f08d4df5adf2f',
};

const app = initializeApp(firebaseConfig);

export const db = getFirestore(app);
