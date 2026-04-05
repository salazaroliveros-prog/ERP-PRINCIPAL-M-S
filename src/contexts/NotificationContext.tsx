import React, { createContext, useContext, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { listenForNotifications, Notification } from '../lib/notifications';
import { collection, doc, updateDoc, query, where, orderBy, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';

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

    // Listen for all notifications to show in a list (e.g. in a popover)
    const q = query(
      collection(db, 'notifications'),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const newNotifications = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Notification[];
      
      setNotifications(newNotifications);
      setUnreadCount(newNotifications.filter(n => !n.read).length);
    }, (error) => {
      console.error('Error listening for notifications in Provider:', error);
    });

    // Also listen for NEW notifications specifically to show toast
    const unsubscribeNew = listenForNotifications((n) => {
      // Only toast if it's really new (created in the last few seconds)
      // The listenForNotifications already filters by createdAt > now when it starts
      toast(n.title, {
        description: n.body,
        duration: 8000, // Longer duration for important alerts
        action: {
          label: 'Ver',
          onClick: () => markAsRead(n.id!)
        }
      });
    });

    return () => {
      unsubscribe();
      unsubscribeNew();
    };
  }, [user]);

  const markAsRead = async (id: string) => {
    try {
      await updateDoc(doc(db, 'notifications', id), { read: true });
    } catch (error) {
      console.error('Error marking notification as read:', error);
    }
  };

  const markAllAsRead = async () => {
    try {
      const unread = notifications.filter(n => !n.read);
      await Promise.all(unread.map(n => updateDoc(doc(db, 'notifications', n.id!), { read: true })));
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
