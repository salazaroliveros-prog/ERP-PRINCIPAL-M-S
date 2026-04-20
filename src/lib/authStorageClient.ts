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
const GOOGLE_GSI_SRC = 'https://accounts.google.com/gsi/client';
let googleScriptPromise: Promise<void> | null = null;

type GoogleTokenResponse = {
  access_token?: string;
  error?: string;
  error_description?: string;
};

type GoogleTokenClient = {
  requestAccessToken: (options?: { prompt?: string }) => void;
};

type GoogleOauth2Api = {
  initTokenClient: (config: {
    client_id: string;
    scope: string;
    callback: (response: GoogleTokenResponse) => void;
    error_callback?: (error: { type?: string }) => void;
    prompt?: string;
  }) => GoogleTokenClient;
};

type WindowWithGoogle = Window & {
  google?: {
    accounts?: {
      oauth2?: GoogleOauth2Api;
    };
  };
};

function buildInitials(name: string) {
  const normalized = String(name || 'Usuario').trim();
  const parts = normalized.split(/\s+/).filter(Boolean);
  const initials = parts.slice(0, 2).map((part) => part[0]?.toUpperCase() || '').join('');
  return initials || 'U';
}

export function getFallbackAvatarUrl(name: string) {
  const initials = buildInitials(name);
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='96' height='96' viewBox='0 0 96 96'><defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0%' stop-color='#2563eb'/><stop offset='100%' stop-color='#0ea5e9'/></linearGradient></defs><rect width='96' height='96' rx='16' fill='url(#g)'/><text x='50%' y='54%' dominant-baseline='middle' text-anchor='middle' fill='white' font-family='Inter, Arial, sans-serif' font-size='34' font-weight='700'>${initials}</text></svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function createDefaultAvatar(name: string) {
  return getFallbackAvatarUrl(name);
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

async function ensureGoogleIdentityClientLoaded() {
  if (typeof window === 'undefined') {
    throw Object.assign(new Error('Google Identity Services no está disponible en este entorno'), {
      code: 'auth/operation-not-supported-in-this-environment',
    });
  }

  const runtimeWindow = window as WindowWithGoogle;
  if (runtimeWindow.google?.accounts?.oauth2) {
    return;
  }

  if (!googleScriptPromise) {
    googleScriptPromise = new Promise<void>((resolve, reject) => {
      const existing = document.querySelector<HTMLScriptElement>(`script[src="${GOOGLE_GSI_SRC}"]`);
      if (existing) {
        existing.addEventListener('load', () => resolve(), { once: true });
        existing.addEventListener('error', () => reject(new Error('No se pudo cargar Google Identity Services')), { once: true });
        return;
      }

      const script = document.createElement('script');
      script.src = GOOGLE_GSI_SRC;
      script.async = true;
      script.defer = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('No se pudo cargar Google Identity Services'));
      document.head.appendChild(script);
    });
  }

  await googleScriptPromise;
}

async function requestGoogleAccessToken() {
  await ensureGoogleIdentityClientLoaded();

  const clientId = (import.meta.env.VITE_GOOGLE_CLIENT_ID || '').trim();
  if (!clientId) {
    throw Object.assign(new Error('Falta VITE_GOOGLE_CLIENT_ID para habilitar el selector de cuentas de Google'), {
      code: 'auth/google-client-id-missing',
    });
  }

  const runtimeWindow = window as WindowWithGoogle;
  const oauth2 = runtimeWindow.google?.accounts?.oauth2;

  if (!oauth2) {
    throw Object.assign(new Error('Google Identity Services no está disponible'), {
      code: 'auth/google-identity-unavailable',
    });
  }

  return new Promise<string>((resolve, reject) => {
    const tokenClient = oauth2.initTokenClient({
      client_id: clientId,
      scope: 'openid email profile',
      prompt: 'select_account',
      callback: (response) => {
        if (response.error) {
          reject(
            Object.assign(new Error(response.error_description || response.error), {
              code: `auth/${response.error}`,
            })
          );
          return;
        }

        if (!response.access_token) {
          reject(
            Object.assign(new Error('Google no devolvió un token de acceso'), {
              code: 'auth/missing-access-token',
            })
          );
          return;
        }

        resolve(response.access_token);
      },
      error_callback: (error) => {
        const code = error?.type === 'popup_closed' ? 'auth/popup-closed-by-user' : 'auth/cancelled-popup-request';
        reject(Object.assign(new Error(error?.type || 'No se pudo abrir el selector de cuenta de Google'), { code }));
      },
    });

    tokenClient.requestAccessToken({ prompt: 'select_account' });
  });
}

async function fetchGoogleProfile(accessToken: string) {
  const response = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw Object.assign(new Error('No se pudo leer el perfil de Google'), {
      code: 'auth/profile-fetch-failed',
    });
  }

  return response.json() as Promise<{
    email?: string;
    name?: string;
    picture?: string;
  }>;
}

export async function signInWithPopup(_auth: LocalAuth, _provider: GoogleAuthProvider) {
  const accessToken = await requestGoogleAccessToken();
  const profile = await fetchGoogleProfile(accessToken);

  const normalizedEmail = String(profile.email || '').trim().toLowerCase();
  if (!normalizedEmail) {
    throw Object.assign(new Error('Google no devolvió un correo válido para iniciar sesión'), {
      code: 'auth/missing-email',
    });
  }

  const inferredName = normalizedEmail.split('@')[0].replace(/[._-]+/g, ' ').trim() || 'Usuario';
  const displayName = String(profile.name || '').trim() || inferredName
    .split(' ')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');

  const photoURL = String(profile.picture || '').trim() || createDefaultAvatar(displayName);
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
const HEALTHCHECK_RETRY_ATTEMPTS = 2;

type ConnectionToastKind = 'online' | 'offline' | 'offline-init';

const showConnectionToast = (kind: ConnectionToastKind, title: string) => {
  const classMap: Record<ConnectionToastKind, string> = {
    online: 'connection-toast connection-toast--online',
    offline: 'connection-toast connection-toast--offline',
    'offline-init': 'connection-toast connection-toast--warning',
  };

  const iconMap: Record<ConnectionToastKind, string> = {
    online: '●',
    offline: '●',
    'offline-init': '◌',
  };

  const durationMap: Record<ConnectionToastKind, number> = {
    online: 2000,
    offline: 2400,
    'offline-init': 2600,
  };

  if (kind === 'online') {
    toast.success(title, {
      icon: iconMap[kind],
      duration: durationMap[kind],
      className: classMap[kind],
    });
    return;
  }

  if (kind === 'offline') {
    toast.error(title, {
      icon: iconMap[kind],
      duration: durationMap[kind],
      className: classMap[kind],
    });
    return;
  }

  toast.warning(title, {
    icon: iconMap[kind],
    duration: durationMap[kind],
    className: classMap[kind],
  });
};

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const checkApiHealth = async () => {
  if (typeof window === 'undefined' || !navigator.onLine) {
    return false;
  }

  for (let attempt = 1; attempt <= HEALTHCHECK_RETRY_ATTEMPTS; attempt++) {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), HEALTHCHECK_TIMEOUT_MS);

    try {
      const response = await fetch(buildApiUrl('/api/health'), {
        method: 'GET',
        cache: 'no-store',
        signal: controller.signal,
      });
      if (response.ok) {
        return true;
      }
    } catch {
      // try again below
    } finally {
      window.clearTimeout(timeout);
    }

    if (attempt < HEALTHCHECK_RETRY_ATTEMPTS) {
      await wait(attempt * 250);
    }
  }

  return false;
};

const updateConnectionState = (isOffline: boolean) => {
  if (isFirstConnectionCheck) {
    isFirstConnectionCheck = false;
    wasOffline = isOffline;
    return;
  }

  if (isOffline && !wasOffline) {
    showConnectionToast('offline', 'Sin conexion');
    wasOffline = true;
  } else if (!isOffline && wasOffline) {
    showConnectionToast('online', 'Conexion recuperada');
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
      showConnectionToast('offline-init', 'Modo offline activo');
      wasOffline = true;
      return;
    }

    showConnectionToast('online', 'Conexion establecida');
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
