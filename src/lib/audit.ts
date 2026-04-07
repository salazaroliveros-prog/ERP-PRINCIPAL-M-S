import { auth } from './authStorageClient';
import { createAuditLog } from './auditApi';

export type AuditLogType = 'create' | 'update' | 'delete' | 'auth' | 'system' | 'read';

export const logAction = async (
  action: string,
  module: string,
  details: string,
  type: AuditLogType = 'system',
  metadata: Record<string, any> = {}
) => {
  try {
    const user = auth.currentUser;
    if (!user) return;

    await createAuditLog({
      projectId: metadata.projectId ? String(metadata.projectId) : undefined,
      userId: user.uid,
      userName: user.displayName || 'Usuario',
      userEmail: user.email || '',
      action,
      module,
      details,
      type,
      userAgent: navigator.userAgent,
      metadata,
    });
  } catch (error) {
    console.error('Error logging action:', error);
  }
};

export const logProjectChange = async (
  projectId: string,
  projectName: string,
  fieldLabel: string,
  oldValue: any,
  newValue: any,
  userId: string,
  userEmail: string
) => {
  await logAction(
    'Cambio en Proyecto',
    'Proyectos',
    `Proyecto: ${projectName} (${projectId}) - Campo: ${fieldLabel} cambió de "${oldValue}" a "${newValue}"`,
    'update',
    { projectId, projectName, field: fieldLabel, oldValue, newValue }
  );
};
