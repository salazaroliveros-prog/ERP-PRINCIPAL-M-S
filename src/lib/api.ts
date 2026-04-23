const configuredBase = (import.meta.env.VITE_API_BASE_URL || '').trim();
const AUTH_STORAGE_KEY = 'erp_local_auth_user';
const OFFLINE_QUEUE_KEY = 'erp_offline_request_queue';
const OFFLINE_CACHE_PREFIX = 'erp_offline_cache:';
const OFFLINE_LAST_SYNC_AT_KEY = 'erp_offline_last_sync_at';
const GET_RETRY_ATTEMPTS = 3;
const REQUEST_TIMEOUT_MS = 12000;

interface QueuedRequest {
  id: string;
  pathname: string;
  method: string;
  headers: Record<string, string>;
  body?: string;
  queuedAt: string;
}

let isFlushingQueue = false;
const queueStatusListeners = new Set<(status: { pending: number; syncing: boolean; lastSyncAt: string | null }) => void>();

function normalizeBaseUrl(baseUrl: string) {
  if (!baseUrl) return '';
  return baseUrl.replace(/\/+$/, '');
}

function getRuntimeApiBaseUrl() {
  if (typeof window === 'undefined') {
    return normalizeBaseUrl(configuredBase);
  }

  const hostname = window.location.hostname;
  const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1';
  if (import.meta.env.DEV && isLocalhost) {
    return window.location.origin;
  }

  return normalizeBaseUrl(configuredBase);
}

export function buildApiUrl(pathname: string) {
  const normalizedPath = pathname.startsWith('/') ? pathname : `/${pathname}`;
  const baseUrl = getRuntimeApiBaseUrl();
  return `${baseUrl}${normalizedPath}`;
}

function isGetRequest(init?: RequestInit) {
  return (init?.method || 'GET').toUpperCase() === 'GET';
}

function isMutatingRequest(init?: RequestInit) {
  const method = (init?.method || 'GET').toUpperCase();
  return method === 'POST' || method === 'PUT' || method === 'PATCH' || method === 'DELETE';
}

function shouldRetryStatus(status: number) {
  return status === 408 || status === 429 || status === 500 || status === 502 || status === 503 || status === 504;
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithTimeout(input: string, init: RequestInit) {
  if (typeof window === 'undefined' || init.signal) {
    return fetch(input, init);
  }

  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    window.clearTimeout(timeout);
  }
}

function getCacheStorageKey(pathname: string) {
  return `${OFFLINE_CACHE_PREFIX}${pathname}`;
}

function getCachedResponse<T>(pathname: string): T | null {
  if (typeof window === 'undefined') return null;

  try {
    const raw = window.localStorage.getItem(getCacheStorageKey(pathname));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { data?: T };
    return parsed?.data ?? null;
  } catch {
    return null;
  }
}

function setCachedResponse<T>(pathname: string, data: T) {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.setItem(
      getCacheStorageKey(pathname),
      JSON.stringify({ data, cachedAt: new Date().toISOString() })
    );
  } catch {
    // Ignore storage quota errors.
  }
}

function readQueuedRequests(): QueuedRequest[] {
  if (typeof window === 'undefined') return [];

  try {
    const raw = window.localStorage.getItem(OFFLINE_QUEUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeQueuedRequests(queue: QueuedRequest[]) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
  emitQueueStatus();
}

function queueRequest(item: QueuedRequest) {
  const queue = readQueuedRequests();
  queue.push(item);
  writeQueuedRequests(queue);
}

function getLastSyncAt() {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(OFFLINE_LAST_SYNC_AT_KEY);
}

function setLastSyncAt(value: string) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(OFFLINE_LAST_SYNC_AT_KEY, value);
}

function emitQueueStatus() {
  if (typeof window === 'undefined') return;

  const status = {
    pending: readQueuedRequests().length,
    syncing: isFlushingQueue,
    lastSyncAt: getLastSyncAt(),
  };

  queueStatusListeners.forEach((listener) => listener(status));
}

export function getOfflineQueueStatus() {
  return {
    pending: readQueuedRequests().length,
    syncing: isFlushingQueue,
    lastSyncAt: getLastSyncAt(),
  };
}

export function onOfflineQueueStatusChange(
  listener: (status: { pending: number; syncing: boolean; lastSyncAt: string | null }) => void
) {
  queueStatusListeners.add(listener);
  listener(getOfflineQueueStatus());

  return () => {
    queueStatusListeners.delete(listener);
  };
}

export async function retryOfflineSync() {
  await flushQueuedRequests();
}

async function flushQueuedRequests() {
  if (typeof window === 'undefined' || isFlushingQueue || !navigator.onLine) return;

  isFlushingQueue = true;
  emitQueueStatus();
  try {
    const queue = readQueuedRequests();
    if (queue.length === 0) return;

    const pending: QueuedRequest[] = [];

    for (const item of queue) {
      try {
        const response = await fetch(buildApiUrl(item.pathname), {
          method: item.method,
          headers: item.headers,
          body: item.body,
        });

        if (!response.ok) {
          pending.push(item);
        }
      } catch {
        pending.push(item);
      }
    }

    writeQueuedRequests(pending);
    setLastSyncAt(new Date().toISOString());
    emitQueueStatus();
  } finally {
    isFlushingQueue = false;
    emitQueueStatus();
  }
}

function buildOptimisticResponse<T>(init?: RequestInit): T {
  if (!init?.body || typeof init.body !== 'string') {
    return null as T;
  }

  try {
    const parsed = JSON.parse(init.body);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && !parsed.id) {
      parsed.id = `offline-${Date.now()}`;
    }
    return parsed as T;
  } catch {
    return null as T;
  }
}

function getStoredAuthToken(): string | null {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as { uid?: string };
    if (!parsed?.uid) return null;
    return parsed.uid;
  } catch {
    return null;
  }
}

export async function requestJson<T>(pathname: string, init?: RequestInit): Promise<T> {
  const headers = new Headers({
    'Content-Type': 'application/json',
  });

  const storedToken = getStoredAuthToken();
  if (storedToken) {
    headers.set('Authorization', `Bearer ${storedToken}`);
  }

  if (init?.headers) {
    new Headers(init.headers).forEach((value, key) => {
      headers.set(key, value);
    });
  }

  const method = (init?.method || 'GET').toUpperCase();
  const requestInit: RequestInit = {
    ...init,
    method,
    headers,
  };

  if (typeof window !== 'undefined' && isMutatingRequest(requestInit) && !navigator.onLine) {
    const normalizedPath = pathname.startsWith('/') ? pathname : `/${pathname}`;
    const serializableHeaders: Record<string, string> = {};
    headers.forEach((value, key) => {
      serializableHeaders[key] = value;
    });

    queueRequest({
      id: typeof crypto !== 'undefined' ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
      pathname: normalizedPath,
      method,
      headers: serializableHeaders,
      body: typeof requestInit.body === 'string' ? requestInit.body : undefined,
      queuedAt: new Date().toISOString(),
    });

    return buildOptimisticResponse<T>(requestInit);
  }

  let response: Response;
  try {
    if (isGetRequest(requestInit)) {
      let attempt = 0;
      while (true) {
        attempt += 1;
        try {
          response = await fetchWithTimeout(buildApiUrl(pathname), requestInit);
          if (!shouldRetryStatus(response.status) || attempt >= GET_RETRY_ATTEMPTS) {
            break;
          }
        } catch (error) {
          if (attempt >= GET_RETRY_ATTEMPTS) {
            throw error;
          }
        }

        await wait(attempt * 300);
      }
    } else {
      response = await fetchWithTimeout(buildApiUrl(pathname), requestInit);
    }
  } catch (error) {
    if (isGetRequest(requestInit)) {
      const cached = getCachedResponse<T>(pathname);
      if (cached !== null) {
        return cached;
      }
    }

    if (typeof window !== 'undefined' && isMutatingRequest(requestInit)) {
      const serializableHeaders: Record<string, string> = {};
      headers.forEach((value, key) => {
        serializableHeaders[key] = value;
      });

      queueRequest({
        id: typeof crypto !== 'undefined' ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
        pathname: pathname.startsWith('/') ? pathname : `/${pathname}`,
        method,
        headers: serializableHeaders,
        body: typeof requestInit.body === 'string' ? requestInit.body : undefined,
        queuedAt: new Date().toISOString(),
      });

      return buildOptimisticResponse<T>(requestInit);
    }

    throw error;
  }

  if (!response.ok) {
    if (isGetRequest(requestInit)) {
      const cached = getCachedResponse<T>(pathname);
      if (cached !== null) {
        return cached;
      }
    }

    let message = `HTTP ${response.status}`;
    try {
      const body = await response.json();
      message = body?.error || message;
    } catch {
      // Ignore JSON parse errors and keep generic message
    }
    throw new Error(message);
  }

  if (response.status === 204) {
    return null as T;
  }

  const data = (await response.json()) as T;
  if (isGetRequest(requestInit)) {
    setCachedResponse(pathname, data);
  }
  return data;
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    void flushQueuedRequests();
  });

  window.addEventListener('storage', (event) => {
    if (event.key === OFFLINE_QUEUE_KEY || event.key === OFFLINE_LAST_SYNC_AT_KEY) {
      emitQueueStatus();
    }
  });

  if (navigator.onLine) {
    void flushQueuedRequests();
  }

  emitQueueStatus();
}
