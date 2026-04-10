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

export interface ApiErrorInfo {
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

export interface AIClientErrorInfo {
  userMessage: string;
  technicalMessage: string;
  isPermissionDenied: boolean;
}

import { toast } from 'sonner';

export function handleApiError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: ApiErrorInfo = {
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
  console.error('API Error: ', JSON.stringify(errInfo));
  
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

export function parseAIClientError(error: unknown): AIClientErrorInfo {
  const technicalMessage = error instanceof Error ? error.message : String(error);
  const normalized = technicalMessage.toLowerCase();

  const isPermissionDenied =
    normalized.includes('permission_denied') ||
    normalized.includes('forbidden') ||
    normalized.includes('denied access') ||
    normalized.includes('403');

  if (isPermissionDenied) {
    return {
      isPermissionDenied: true,
      technicalMessage,
      userMessage:
        'Gemini devolvio un error 403 de permisos. Tu proyecto/API key no tiene acceso al modelo. Verifica habilitacion de API, restricciones de clave y permisos del proyecto en Google AI Studio/Cloud.',
    };
  }

  if (normalized.includes('api key') || normalized.includes('api_key') || normalized.includes('unauthenticated') || normalized.includes('401')) {
    return {
      isPermissionDenied: false,
      technicalMessage,
      userMessage: 'La clave de Gemini es invalida o no esta configurada correctamente.',
    };
  }

  if (normalized.includes('quota') || normalized.includes('rate limit') || normalized.includes('resource_exhausted') || normalized.includes('429')) {
    return {
      isPermissionDenied: false,
      technicalMessage,
      userMessage: 'Se alcanzo el limite de uso de la IA. Intenta de nuevo en unos minutos.',
    };
  }

  return {
    isPermissionDenied: false,
    technicalMessage,
    userMessage: 'No fue posible completar la operacion con IA en este momento. Intenta nuevamente.',
  };
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
