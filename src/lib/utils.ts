import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { auth } from './authStorageClient';

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
