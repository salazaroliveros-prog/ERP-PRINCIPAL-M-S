import { toast } from 'sonner';
import { buildApiUrl } from './api';

export interface UserProviderInfo {
  providerId: string;
  displayName: string | null;
  email: string | null;
  photoURL: string | null;
}

export interface User {
  uid: string;
  email: string;
  displayName: string;
  photoURL: string | null;
  emailVerified: boolean;
  isAnonymous: boolean;
  tenantId: string | null;
  providerData: UserProviderInfo[];
}

type AuthStateCallback = (user: User | null) => void;

const AUTH_STORAGE_KEY = 'erp_local_auth_user';

function createDefaultAvatar(name: string) {
  return `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=0D8ABC&color=fff`;
}

function loadStoredUser(): User | null {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as User;
    if (!parsed?.uid || !parsed?.email) return null;
    return parsed;
  } catch {
    return null;
  }
}

class LocalAuth {
  public currentUser: User | null = loadStoredUser();
  private listeners = new Set<AuthStateCallback>();

  private emit() {
    this.listeners.forEach((callback) => callback(this.currentUser));
  }

  setCurrentUser(user: User | null) {
    this.currentUser = user;

    if (typeof window !== 'undefined') {
      if (user) {
        window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(user));
      } else {
        window.localStorage.removeItem(AUTH_STORAGE_KEY);
      }
    }

    this.emit();
  }

  onAuthStateChanged(callback: AuthStateCallback) {
    this.listeners.add(callback);
    callback(this.currentUser);
    return () => {
      this.listeners.delete(callback);
    };
  }

  async signOut() {
    this.setCurrentUser(null);
  }
}

export const auth = new LocalAuth();

export class GoogleAuthProvider {}

export async function signInWithPopup(_auth: LocalAuth, _provider: GoogleAuthProvider) {
  const defaultEmail = auth.currentUser?.email || '';
  const email = typeof window !== 'undefined'
    ? window.prompt('Ingresa tu correo corporativo para iniciar sesion', defaultEmail)
    : null;

  if (!email || !email.trim()) {
    const error = Object.assign(new Error('Inicio de sesion cancelado por el usuario'), {
      code: 'auth/popup-closed-by-user',
    });
    throw error;
  }

  const normalizedEmail = email.trim().toLowerCase();
  const inferredName = normalizedEmail.split('@')[0].replace(/[._-]+/g, ' ').trim() || 'Usuario';
  const displayName = inferredName
    .split(' ')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');

  const photoURL = createDefaultAvatar(displayName);
  try {
    const response = await fetch(buildApiUrl('/api/auth/login'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: normalizedEmail,
        displayName,
        photoURL,
      }),
    });

    if (!response.ok) {
      let message = `HTTP ${response.status}`;
      try {
        const body = await response.json();
        message = body?.error || message;
      } catch {
        // Keep generic HTTP message.
      }
      throw new Error(message);
    }

    const persistedUser = (await response.json()) as User;
    auth.setCurrentUser(persistedUser);
    return { user: persistedUser };
  } catch {
    const fallbackUser: User = {
      uid: auth.currentUser?.uid || (typeof crypto !== 'undefined' ? crypto.randomUUID() : `${Date.now()}`),
      email: normalizedEmail,
      displayName,
      photoURL,
      emailVerified: true,
      isAnonymous: false,
      tenantId: null,
      providerData: [
        {
          providerId: 'local-fallback',
          displayName,
          email: normalizedEmail,
          photoURL,
        },
      ],
    };

    auth.setCurrentUser(fallbackUser);
    return { user: fallbackUser };
  }
}

export function onAuthStateChanged(localAuth: LocalAuth, callback: AuthStateCallback) {
  return localAuth.onAuthStateChanged(callback);
}

export async function signOut(localAuth: LocalAuth) {
  await localAuth.signOut();
}

export function getAuth() {
  return auth;
}

export interface StorageReference {
  path: string;
  downloadURL?: string;
}

export const storage = {
  name: 'local-storage',
};

export function ref(_storage: typeof storage, filePath: string): StorageReference {
  return {
    path: filePath,
  };
}

export async function uploadBytes(fileRef: StorageReference, file: File) {
  const payload = new FormData();
  payload.append('file', file);
  payload.append('path', fileRef.path);

  const response = await fetch(buildApiUrl('/api/uploads'), {
    method: 'POST',
    body: payload,
  });

  if (!response.ok) {
    let message = `HTTP ${response.status}`;
    try {
      const errorBody = await response.json();
      message = errorBody?.error || message;
    } catch {
      // Keep default message when body is not JSON.
    }
    throw new Error(message);
  }

  const data = await response.json();
  fileRef.downloadURL = String(data?.url || '');

  return {
    ref: fileRef,
    metadata: {
      fullPath: fileRef.path,
      size: file.size,
      contentType: file.type,
    },
  };
}

export async function getDownloadURL(fileRef: StorageReference) {
  if (!fileRef.downloadURL) {
    throw new Error('No existe URL de descarga para este archivo');
  }
  return fileRef.downloadURL;
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

export const triggerSyncStart = () => {
  if (navigator.onLine) {
    notifySyncStatus(true);
  }
};

// Monitor API connection state
let isFirstConnectionCheck = true;
let wasOffline = typeof navigator !== 'undefined' ? !navigator.onLine : false;
let healthCheckTimer: number | null = null;

const HEALTHCHECK_INTERVAL_MS = 30000;
const HEALTHCHECK_TIMEOUT_MS = 5000;

const checkApiHealth = async () => {
  if (typeof window === 'undefined' || !navigator.onLine) {
    return false;
  }

  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), HEALTHCHECK_TIMEOUT_MS);

  try {
    const response = await fetch(buildApiUrl('/api/health'), {
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
