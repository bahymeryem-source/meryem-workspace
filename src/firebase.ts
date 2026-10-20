import AsyncStorage from '@react-native-async-storage/async-storage';
import { getApp, getApps, initializeApp } from 'firebase/app';
import { getAuth, initializeAuth } from 'firebase/auth';
// @ts-ignore
import { getReactNativePersistence } from 'firebase/auth';
import {
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from 'firebase/firestore';
import { Platform } from 'react-native';

const firebaseConfig = {
  apiKey: 'AIzaSyDzTKKhq-dHVaVgJb5SXqTYbZCH9R7JhOY',
  authDomain: 'meryem-workspace.firebaseapp.com',
  projectId: 'meryem-workspace',
  storageBucket: 'meryem-workspace.firebasestorage.app',
  messagingSenderId: '830349451801',
  appId: '1:830349451801:web:6d9222d913a6b8fad64088',
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

function makeAuth() {
  if (Platform.OS === 'web') return getAuth(app);
  try {
    return initializeAuth(app, {
      persistence: getReactNativePersistence(AsyncStorage),
    });
  } catch {
    return getAuth(app);
  }
}

function makeDb() {
  if (Platform.OS === 'web') {
    try {
      return initializeFirestore(app, {
        localCache: persistentLocalCache({
          tabManager: persistentMultipleTabManager(),
        }),
      });
    } catch {
      return getFirestore(app);
    }
  }
  return getFirestore(app);
}

export const auth = makeAuth();
export const db = makeDb();