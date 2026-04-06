import { requestJson } from './api';
import { toast } from 'sonner';

export interface Notification {
  id?: string;
  title: string;
  body: string;
  type: 'inventory' | 'subcontract' | 'project' | 'system';
  createdAt: string;
  read: boolean;
}

export const sendNotification = async (title: string, body: string, type: Notification['type']) => {
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

export const listenForNotifications = (onNewNotification: (n: Notification) => void) => {
  let active = true;
  const knownIds = new Set<string>();

  // Prime known ids to avoid toasting existing notifications on first load.
  listNotifications({ limit: 50, offset: 0 })
    .then((response) => {
      if (!active) return;
      response.items.forEach((item) => {
        if (item.id) knownIds.add(item.id);
      });
    })
    .catch((error) => {
      console.error('Error priming notifications listener:', error);
    });

  const interval = window.setInterval(async () => {
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
  }, 8000);

  return () => {
    active = false;
    window.clearInterval(interval);
  };
};

export const toastNotification = (notification: Notification) => {
  toast(notification.title, {
    description: notification.body,
    duration: 8000,
  });
};
