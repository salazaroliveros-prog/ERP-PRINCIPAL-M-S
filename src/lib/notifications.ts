import { collection, addDoc, serverTimestamp, query, orderBy, limit, onSnapshot, where } from 'firebase/firestore';
import { db } from '../firebase';
import { toast } from 'sonner';

export interface Notification {
  id?: string;
  title: string;
  body: string;
  type: 'inventory' | 'subcontract' | 'project';
  createdAt: any;
  read: boolean;
}

export const sendNotification = async (title: string, body: string, type: Notification['type']) => {
  try {
    await addDoc(collection(db, 'notifications'), {
      title,
      body,
      type,
      createdAt: serverTimestamp(),
      read: false
    });
  } catch (error) {
    console.error('Error sending notification:', error);
  }
};

export const listenForNotifications = (onNewNotification: (n: Notification) => void) => {
  const q = query(
    collection(db, 'notifications'),
    where('createdAt', '>', new Date()), // Only new ones
    orderBy('createdAt', 'desc'),
    limit(1)
  );

  return onSnapshot(q, (snapshot) => {
    snapshot.docChanges().forEach((change) => {
      if (change.type === 'added') {
        const data = change.doc.data() as Notification;
        onNewNotification({ id: change.doc.id, ...data });
      }
    });
  }, (error) => {
    console.error('Error listening for notifications:', error);
  });
};
