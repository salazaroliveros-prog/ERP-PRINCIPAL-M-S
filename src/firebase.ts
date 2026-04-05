import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore, enableMultiTabIndexedDbPersistence, doc, getDocFromServer, onSnapshot, collection, terminate, clearIndexedDbPersistence, onSnapshotsInSync } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { toast } from 'sonner';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const storage = getStorage(app);

// Enable offline persistence with multi-tab support
if (typeof window !== 'undefined') {
  enableMultiTabIndexedDbPersistence(db).catch((err) => {
    if (err.code === 'failed-precondition') {
      console.warn('Firestore persistence failed: Multiple tabs open');
    } else if (err.code === 'unimplemented') {
      console.warn('Firestore persistence failed: Browser not supported');
    }
  });
}

// Monitor Sync Status
export const isSyncing = { value: false };
const syncListeners: ((syncing: boolean) => void)[] = [];

export const onSyncStatusChange = (callback: (syncing: boolean) => void) => {
  syncListeners.push(callback);
  return () => {
    const index = syncListeners.indexOf(callback);
    if (index > -1) syncListeners.splice(index, 1);
  };
};

const notifySyncStatus = (syncing: boolean) => {
  if (isSyncing.value === syncing) return;
  isSyncing.value = syncing;
  syncListeners.forEach(cb => cb(syncing));
};

// Use onSnapshotsInSync to detect when local data is in sync with server
if (typeof window !== 'undefined') {
  onSnapshotsInSync(db, () => {
    notifySyncStatus(false);
  });
}

export const triggerSyncStart = () => {
  if (navigator.onLine) {
    notifySyncStatus(true);
  }
};

// Monitor Firestore Connection State
let isFirstConnectionCheck = true;
let wasOffline = false;

// Function to validate connection at startup
export const validateFirestoreConnection = async () => {
  try {
    // Try to get a document from server to check real connectivity
    await getDocFromServer(doc(db, '_connection_test_', 'ping'));
    return true;
  } catch (error: any) {
    if (error.code === 'unavailable' || error.message?.includes('offline')) {
      return false;
    }
    // Permission denied or other errors still mean we reached the server
    return true;
  }
};

// Initial validation
validateFirestoreConnection().then(online => {
  if (!online) {
    toast.warning('Modo Offline detectado', {
      description: 'La aplicación se ha iniciado sin conexión. Los cambios se sincronizarán después.',
      duration: 5000,
    });
    wasOffline = true;
  } else {
    toast.success('Conexión establecida', {
      description: 'Conexión con el servidor de base de datos exitosa.',
      duration: 3000,
    });
  }
});

// Real-time connection monitoring
onSnapshot(doc(db, '_connection_test_', 'ping'), { includeMetadataChanges: true }, (snapshot) => {
  const isOffline = snapshot.metadata.fromCache;
  
  if (isFirstConnectionCheck) {
    isFirstConnectionCheck = false;
    wasOffline = isOffline;
    return;
  }

  if (isOffline && !wasOffline) {
    toast.error('Conexión perdida', {
      description: 'Trabajando en modo offline. Tu progreso se guardará localmente.',
      duration: 5000,
    });
    wasOffline = true;
  } else if (!isOffline && wasOffline) {
    toast.success('Conexión recuperada', {
      description: 'Se ha restablecido la conexión. Sincronizando datos...',
      duration: 5000,
    });
    wasOffline = false;
  }
}, (error) => {
  // Ignore permission errors for the connection test document
  if (error.code !== 'permission-denied') {
    console.error('Firestore connection monitor error:', error);
  }
});
