const configuredBase = (import.meta.env.VITE_API_BASE_URL || '').trim();
const AUTH_STORAGE_KEY = 'erp_local_auth_user';

function normalizeBaseUrl(baseUrl: string) {
  if (!baseUrl) return '';
  return baseUrl.replace(/\/+$/, '');
}

export function buildApiUrl(pathname: string) {
  const normalizedPath = pathname.startsWith('/') ? pathname : `/${pathname}`;
  const baseUrl = normalizeBaseUrl(configuredBase);
  return `${baseUrl}${normalizedPath}`;
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

  const response = await fetch(buildApiUrl(pathname), {
    ...init,
    headers,
  });

  if (!response.ok) {
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

  return response.json();
}
