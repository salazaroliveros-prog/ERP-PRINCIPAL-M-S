import React, { createContext, useContext, useEffect, useState } from 'react';
import { deleteNotification, listenForNotifications, listNotifications, markNotificationAsRead, Notification } from '../lib/notifications';

interface NotificationContextType {
  notifications: Notification[];
  unreadCount: number;
  isPanelOpen: boolean;
  setPanelOpen: (open: boolean) => void;
  markAsRead: (id: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  removeNotification: (id: string) => Promise<void>;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export const NotificationProvider: React.FC<{ children: React.ReactNode; user: any }> = ({ children, user }) => {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isPanelOpen, setIsPanelOpen] = useState(false);

  const markAsRead = async (id: string) => {
    try {
      await markNotificationAsRead(id);
      setNotifications((prev) => prev.map((item) => (item.id === id ? { ...item, read: true } : item)));
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch (error) {
      console.error('Error marking notification as read:', error);
    }
  };

  const markAllAsRead = async () => {
    const unread = notifications.filter(n => !n.read && n.id);
    if (unread.length === 0) {
      setUnreadCount(0);
      return;
    }

    // Optimistic update so the badge disappears as soon as user opens/verifies notifications.
    setNotifications((prev) => prev.map((item) => ({ ...item, read: true })));
    setUnreadCount(0);

    const results = await Promise.allSettled(unread.map(n => markNotificationAsRead(n.id!)));
    const failed = results.some(r => r.status === 'rejected');
    if (failed) {
      try {
        const response = await listNotifications({ limit: 200, offset: 0 });
        setNotifications(response.items);
        setUnreadCount(response.items.filter(n => !n.read).length);
      } catch (error) {
        console.error('Error refreshing notifications after mark-all:', error);
      }
    }
  };

  const removeNotification = async (id: string) => {
    const previousItems = notifications;
    const target = previousItems.find((item) => item.id === id);
    if (!target) return;

    setNotifications((prev) => prev.filter((item) => item.id !== id));
    if (!target.read) {
      setUnreadCount((prev) => Math.max(0, prev - 1));
    }

    try {
      await deleteNotification(id);
    } catch (error) {
      console.error('Error deleting notification:', error);
      setNotifications(previousItems);
      setUnreadCount(previousItems.filter((item) => !item.read).length);
    }
  };

  const setPanelOpen = (open: boolean) => {
    setIsPanelOpen(open);
    if (open) {
      void markAllAsRead();
    }
  };

  useEffect(() => {
    if (!user) {
      setNotifications([]);
      setUnreadCount(0);
      setIsPanelOpen(false);
      return;
    }

    let mounted = true;

    const refreshNotifications = async () => {
      try {
        const response = await listNotifications({ limit: 200, offset: 0 });
        if (!mounted) return;
        setNotifications(response.items);
        setUnreadCount(response.items.filter(n => !n.read).length);
      } catch (error) {
        console.error('Error loading notifications in Provider:', error);
      }
    };

    refreshNotifications();
    const refreshInterval = window.setInterval(refreshNotifications, 60000);

    // New notifications are shown in the notifications panel (no floating toasts).
    const unsubscribeNew = listenForNotifications((n) => {
      const incoming = isPanelOpen ? { ...n, read: true } : n;

      setNotifications((prev) => {
        if (incoming.id && prev.some((item) => item.id === incoming.id)) {
          return prev;
        }
        return [incoming, ...prev];
      });

      if (!incoming.read) {
        setUnreadCount((prev) => prev + 1);
      }

      if (incoming.read && incoming.id) {
        void markNotificationAsRead(incoming.id).catch((error) => {
          console.error('Error auto-marking visible notification as read:', error);
        });
      }
    });

    return () => {
      mounted = false;
      window.clearInterval(refreshInterval);
      unsubscribeNew();
    };
  }, [user, isPanelOpen]);

  return (
    <NotificationContext.Provider value={{ notifications, unreadCount, isPanelOpen, setPanelOpen, markAsRead, markAllAsRead, removeNotification }}>
      {children}
    </NotificationContext.Provider>
  );
};

export const useNotifications = () => {
  const context = useContext(NotificationContext);
  if (context === undefined) {
    throw new Error('useNotifications must be used within a NotificationProvider');
  }
  return context;
};
