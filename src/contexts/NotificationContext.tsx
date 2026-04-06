import React, { createContext, useContext, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { listenForNotifications, listNotifications, markNotificationAsRead, Notification } from '../lib/notifications';

interface NotificationContextType {
  notifications: Notification[];
  unreadCount: number;
  markAsRead: (id: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export const NotificationProvider: React.FC<{ children: React.ReactNode; user: any }> = ({ children, user }) => {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (!user) {
      setNotifications([]);
      setUnreadCount(0);
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
    const refreshInterval = window.setInterval(refreshNotifications, 10000);

    // Also listen for NEW notifications specifically to show toast
    const unsubscribeNew = listenForNotifications((n) => {
      toast(n.title, {
        description: n.body,
        duration: 8000, // Longer duration for important alerts
        action: {
          label: 'Ver',
          onClick: () => markAsRead(n.id!)
        }
      });
      refreshNotifications();
    });

    return () => {
      mounted = false;
      window.clearInterval(refreshInterval);
      unsubscribeNew();
    };
  }, [user]);

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
    try {
      const unread = notifications.filter(n => !n.read);
      await Promise.all(unread.map(n => markNotificationAsRead(n.id!)));
      setNotifications((prev) => prev.map((item) => ({ ...item, read: true })));
      setUnreadCount(0);
    } catch (error) {
      console.error('Error marking all as read:', error);
    }
  };

  return (
    <NotificationContext.Provider value={{ notifications, unreadCount, markAsRead, markAllAsRead }}>
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
