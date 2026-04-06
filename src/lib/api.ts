const configuredBase = (import.meta.env.VITE_API_BASE_URL || '').trim();

function normalizeBaseUrl(baseUrl: string) {
  if (!baseUrl) return '';
  return baseUrl.replace(/\/+$/, '');
}

export function buildApiUrl(pathname: string) {
  const normalizedPath = pathname.startsWith('/') ? pathname : `/${pathname}`;
  const baseUrl = normalizeBaseUrl(configuredBase);
  return `${baseUrl}${normalizedPath}`;
}

export async function requestJson<T>(pathname: string, init?: RequestInit): Promise<T> {
  const response = await fetch(buildApiUrl(pathname), {
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
    ...init,
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
