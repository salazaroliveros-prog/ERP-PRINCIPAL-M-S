import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { auth } from '../firebase';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number) {
  return new Intl.NumberFormat('es-GT', {
    style: 'currency',
    currency: 'GTQ',
  }).format(amount);
}

export function formatDate(date: string | Date) {
  return new Intl.DateTimeFormat('es-GT', {
    dateStyle: 'medium',
  }).format(new Date(date));
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

import { toast } from 'sonner';
import { 
  updateDoc, 
  doc, 
  serverTimestamp, 
  DocumentReference, 
  getDoc,
  setDoc,
  increment,
  arrayUnion,
  arrayRemove
} from 'firebase/firestore';
import { db, triggerSyncStart } from '../firebase';

export async function safeUpdate(
  path: string, 
  id: string, 
  data: any, 
  operationType: OperationType = OperationType.UPDATE
) {
  try {
    triggerSyncStart();
    const docRef = doc(db, path, id);
    const updateData = {
      ...data,
      _lastModifiedAt: serverTimestamp(),
      _lastModifiedBy: auth.currentUser?.uid || 'system',
      _syncStatus: 'pending' // Mark as pending locally
    };

    await updateDoc(docRef, updateData);
    return true;
  } catch (error) {
    handleFirestoreError(error, operationType, `${path}/${id}`);
    return false;
  }
}

export async function safeCreate(
  path: string, 
  data: any, 
  id?: string
) {
  try {
    triggerSyncStart();
    const docData = {
      ...data,
      _createdAt: serverTimestamp(),
      _createdBy: auth.currentUser?.uid || 'system',
      _lastModifiedAt: serverTimestamp(),
      _lastModifiedBy: auth.currentUser?.uid || 'system',
      _syncStatus: 'pending'
    };

    if (id) {
      await setDoc(doc(db, path, id), docData);
    } else {
      const { addDoc, collection } = await import('firebase/firestore');
      await addDoc(collection(db, path), docData);
    }
    return true;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
    return false;
  }
}

export async function updateWithConflictCheck(
  path: string,
  id: string,
  data: any,
  lastKnownUpdate: any // The _lastModifiedAt from the document when it was read
) {
  try {
    triggerSyncStart();
    const docRef = doc(db, path, id);
    const docSnap = await getDoc(docRef);
    
    if (!docSnap.exists()) {
      throw new Error('El documento no existe');
    }

    const currentData = docSnap.data();
    const serverLastUpdate = currentData?._lastModifiedAt;

    // If server has a newer update than what we knew, there's a conflict
    if (serverLastUpdate && lastKnownUpdate && serverLastUpdate.toMillis() > lastKnownUpdate.toMillis()) {
      const confirm = window.confirm(
        'Conflicto de datos detectado: Este documento fue modificado por otro usuario. ¿Deseas sobrescribir los cambios?'
      );
      if (!confirm) return false;
    }

    return await safeUpdate(path, id, data);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `${path}/${id}`);
    return false;
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  
  // User-visible notification
  const userMessage = errInfo.error.includes('Missing or insufficient permissions')
    ? 'Error de permisos: No tienes autorización para realizar esta acción.'
    : `Error en la base de datos: ${errInfo.error}`;
    
  toast.error(userMessage, {
    description: `Operación: ${operationType} en ${path || 'desconocido'}`,
    duration: 5000,
  });

  throw new Error(JSON.stringify(errInfo));
}

export function getMitigationSuggestions(deviation: number): string[] {
  if (deviation > 30) {
    return [
      "Auditoría inmediata de costos y materiales.",
      "Suspensión temporal de compras no críticas.",
      "Revisión de subcontratos y rendimientos.",
      "Ajuste urgente de cronograma y presupuesto."
    ];
  }
  if (deviation > 15) {
    return [
      "Verificar avance físico reportado vs realidad.",
      "Revisar facturas pendientes de registro.",
      "Optimizar el uso de materiales en stock.",
      "Reunión de seguimiento con el encargado."
    ];
  }
  return [];
}
