import { buildApiUrl, requestJson } from './api';
import { toast } from 'sonner';

export interface Notification {
  id?: string;
  title: string;
  body: string;
  type: 'inventory' | 'subcontract' | 'project' | 'system';
  createdAt: string;
  read: boolean;
}

const NOTIFICATION_DEDUPE_STORAGE_KEY = 'erp_notification_dedupe_v1';
const NOTIFICATION_DEDUPE_LIMIT = 300;
const NOTIFICATION_COOLDOWN_BY_TYPE: Record<Notification['type'], number> = {
  inventory: 30 * 60 * 1000,
  subcontract: 12 * 60 * 60 * 1000,
  project: 60 * 60 * 1000,
  system: 30 * 60 * 1000,
};

function getNotificationFingerprint(title: string, body: string, type: Notification['type']) {
  return `${type}::${title.trim().toLowerCase()}::${body.trim().toLowerCase()}`;
}

function loadDedupeMap() {
  if (typeof window === 'undefined') {
    return new Map<string, number>();
  }

  try {
    const raw = window.localStorage.getItem(NOTIFICATION_DEDUPE_STORAGE_KEY);
    if (!raw) return new Map<string, number>();
    const parsed = JSON.parse(raw) as Array<[string, number]>;
    return new Map(parsed.filter((entry) => Array.isArray(entry) && entry.length === 2));
  } catch {
    return new Map<string, number>();
  }
}

function saveDedupeMap(map: Map<string, number>) {
  if (typeof window === 'undefined') return;

  const entries = Array.from(map.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, NOTIFICATION_DEDUPE_LIMIT);

  try {
    window.localStorage.setItem(NOTIFICATION_DEDUPE_STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // Ignore storage quota errors.
  }
}

function shouldSkipDuplicateNotification(title: string, body: string, type: Notification['type']) {
  const fingerprint = getNotificationFingerprint(title, body, type);
  const now = Date.now();
  const cooldownMs = NOTIFICATION_COOLDOWN_BY_TYPE[type] || (30 * 60 * 1000);
  const dedupeMap = loadDedupeMap();
  const lastSentAt = dedupeMap.get(fingerprint) || 0;

  if (now - lastSentAt < cooldownMs) {
    return true;
  }

  dedupeMap.set(fingerprint, now);
  saveDedupeMap(dedupeMap);
  return false;
}

export const sendNotification = async (title: string, body: string, type: Notification['type']) => {
  if (shouldSkipDuplicateNotification(title, body, type)) {
    return;
  }

  try {
    await requestJson<Notification>('/api/notifications', {
      method: 'POST',
      body: JSON.stringify({
      title,
      body,
      type,
      }),
    });
  } catch (error) {
    console.error('Error sending notification:', error);
  }
};

export const listNotifications = async (params: { limit?: number; offset?: number; unreadOnly?: boolean } = {}) => {
  const search = new URLSearchParams();
  if (params.limit !== undefined) search.set('limit', String(params.limit));
  if (params.offset !== undefined) search.set('offset', String(params.offset));
  if (params.unreadOnly !== undefined) search.set('unreadOnly', String(params.unreadOnly));

  const qs = search.toString();
  const path = qs ? `/api/notifications?${qs}` : '/api/notifications';
  return requestJson<{ items: Notification[]; hasMore: boolean }>(path);
};

export const markNotificationAsRead = async (id: string) => {
  return requestJson<Notification>(`/api/notifications/${id}/read`, {
    method: 'PATCH',
  });
};

export const deleteNotification = async (id: string) => {
  return requestJson<void>(`/api/notifications/${id}`, {
    method: 'DELETE',
  });
};

export const listenForNotifications = (onNewNotification: (n: Notification) => void) => {
  let active = true;
  const knownIds = new Set<string>();
  let stream: EventSource | null = null;
  let reconnectTimer: number | null = null;
  let disableSseForSession = false;
  let streamErrorCount = 0;

  const refreshByPolling = async () => {
    try {
      const response = await listNotifications({ limit: 20, offset: 0 });
      if (!active) return;

      const newestToOldest = response.items;
      const oldestToNewest = [...newestToOldest].reverse();

      oldestToNewest.forEach((item) => {
        if (item.id && !knownIds.has(item.id)) {
          knownIds.add(item.id);
          onNewNotification(item);
        }
      });
    } catch (error) {
      console.error('Error listening for notifications:', error);
    }
  };

  const connectSse = () => {
    if (
      !active ||
      disableSseForSession ||
      typeof window === 'undefined' ||
      typeof window.EventSource === 'undefined'
    ) {
      return;
    }

    try {
      stream = new EventSource(buildApiUrl('/api/notifications/stream'));
      stream.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data) as { event?: string; notification?: Notification };
          const notification = payload?.notification;

          if (payload?.event !== 'created' || !notification?.id || knownIds.has(notification.id)) {
            return;
          }

          knownIds.add(notification.id);
          onNewNotification(notification);
        } catch (error) {
          console.error('Error parsing notifications SSE message:', error);
        }
      };

      stream.onerror = () => {
        streamErrorCount += 1;
        stream?.close();
        stream = null;

        if (streamErrorCount >= 3) {
          disableSseForSession = true;
          return;
        }

        if (!active || reconnectTimer !== null) return;
        reconnectTimer = window.setTimeout(() => {
          reconnectTimer = null;
          void refreshByPolling();
          connectSse();
        }, 4000);
      };
    } catch (error) {
      console.error('Error opening notifications SSE stream:', error);
    }
  };

  const canUseSse = async () => {
    if (disableSseForSession || typeof window === 'undefined') return false;

    const controller = new AbortController();
    try {
      const response = await fetch(buildApiUrl('/api/notifications/stream'), {
        method: 'GET',
        headers: { Accept: 'text/event-stream' },
        signal: controller.signal,
      });
      const contentType = response.headers.get('content-type') || '';
      return response.ok && contentType.includes('text/event-stream');
    } catch {
      return false;
    } finally {
      controller.abort();
    }
  };

  // Prime known IDs to avoid toasting existing notifications on first load.
  listNotifications({ limit: 50, offset: 0 })
    .then(async (response) => {
      if (!active) return;
      response.items.forEach((item) => {
        if (item.id) knownIds.add(item.id);
      });

      if (await canUseSse()) {
        connectSse();
      } else {
        disableSseForSession = true;
      }
    })
    .catch((error) => {
      console.error('Error priming notifications listener:', error);
      connectSse();
    });

  const interval = window.setInterval(() => {
    void refreshByPolling();
  }, 15000);

  return () => {
    active = false;
    if (reconnectTimer !== null) {
      window.clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    stream?.close();
    stream = null;
    window.clearInterval(interval);
  };
};

export const toastNotification = (notification: Notification) => {
  toast(notification.title, {
    description: notification.body,
    duration: 8000,
  });
};
