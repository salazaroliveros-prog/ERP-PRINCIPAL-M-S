import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getStorage } from 'firebase/storage';
import { toast } from 'sonner';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const storage = getStorage(app);

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

export const triggerSyncStart = () => {
  if (navigator.onLine) {
    notifySyncStatus(true);
  }
};

// Monitor API connection state
let isFirstConnectionCheck = true;
let wasOffline = typeof navigator !== 'undefined' ? !navigator.onLine : false;
let healthCheckTimer: ReturnType<typeof setInterval> | null = null;

const HEALTHCHECK_INTERVAL_MS = 30000;
const HEALTHCHECK_TIMEOUT_MS = 5000;

const checkApiHealth = async () => {
  if (typeof window === 'undefined' || !navigator.onLine) {
    return false;
  }

  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), HEALTHCHECK_TIMEOUT_MS);

  try {
    const response = await fetch('/api/health', {
      method: 'GET',
      cache: 'no-store',
      signal: controller.signal,
    });
    return response.ok;
  } catch {
    return false;
  } finally {
    window.clearTimeout(timeout);
  }
};

const updateConnectionState = (isOffline: boolean) => {
  if (isFirstConnectionCheck) {
    isFirstConnectionCheck = false;
    wasOffline = isOffline;
    return;
  }

  if (isOffline && !wasOffline) {
    toast.error('Conexion perdida', {
      description: 'Trabajando en modo offline. Tu progreso se guardara localmente.',
      duration: 5000,
    });
    wasOffline = true;
  } else if (!isOffline && wasOffline) {
    toast.success('Conexion recuperada', {
      description: 'Se ha restablecido la conexion. Sincronizando datos...',
      duration: 5000,
    });
    wasOffline = false;
  }
};

export const validateApiConnection = async () => {
  const online = await checkApiHealth();
  notifySyncStatus(!online && navigator.onLine);
  return online;
};

const runConnectivityCheck = async () => {
  const online = await checkApiHealth();
  const offline = !online;
  notifySyncStatus(false);
  updateConnectionState(offline);
};

if (typeof window !== 'undefined') {
  validateApiConnection().then((online) => {
    if (!online) {
      toast.warning('Modo Offline detectado', {
        description: 'La aplicacion se ha iniciado sin conexion. Los cambios se sincronizaran despues.',
        duration: 5000,
      });
      wasOffline = true;
      return;
    }

    toast.success('Conexion establecida', {
      description: 'Conexion con el servidor de base de datos exitosa.',
      duration: 3000,
    });
    wasOffline = false;
  });

  window.addEventListener('online', () => {
    triggerSyncStart();
    void runConnectivityCheck();
  });

  window.addEventListener('offline', () => {
    notifySyncStatus(false);
    updateConnectionState(true);
  });

  healthCheckTimer = window.setInterval(() => {
    if (!navigator.onLine) {
      return;
    }
    triggerSyncStart();
    void runConnectivityCheck();
  }, HEALTHCHECK_INTERVAL_MS);

  window.addEventListener('beforeunload', () => {
    if (healthCheckTimer) {
      window.clearInterval(healthCheckTimer);
      healthCheckTimer = null;
    }
  });
}
