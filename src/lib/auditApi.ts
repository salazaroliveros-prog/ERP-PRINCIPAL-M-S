import { requestJson } from './api';

export type AuditLogType = 'create' | 'update' | 'delete' | 'auth' | 'system' | 'read';

export interface AuditLogRecord {
  id: string;
  projectId: string | null;
  userId: string;
  userName: string;
  userEmail: string;
  action: string;
  module: string;
  details: string;
  type: AuditLogType;
  metadata: Record<string, any>;
  field?: string;
  oldValue?: any;
  newValue?: any;
  userAgent?: string;
  ipAddress?: string;
  timestamp: string;
  createdAt: string;
}

export interface ListAuditLogsParams {
  projectId?: string;
  module?: string;
  type?: AuditLogType;
  limit?: number;
  offset?: number;
}

export interface CreateAuditLogInput {
  projectId?: string;
  userId?: string;
  userName?: string;
  userEmail?: string;
  action: string;
  module: string;
  details: string;
  type?: AuditLogType;
  metadata?: Record<string, any>;
  userAgent?: string;
  ipAddress?: string;
}

export async function listAuditLogs(params: ListAuditLogsParams = {}): Promise<{ items: AuditLogRecord[]; hasMore: boolean }> {
  const search = new URLSearchParams();
  if (params.projectId) search.set('projectId', params.projectId);
  if (params.module) search.set('module', params.module);
  if (params.type) search.set('type', params.type);
  if (params.limit !== undefined) search.set('limit', String(params.limit));
  if (params.offset !== undefined) search.set('offset', String(params.offset));

  const path = search.size > 0 ? `/api/audit-logs?${search.toString()}` : '/api/audit-logs';
  return requestJson<{ items: AuditLogRecord[]; hasMore: boolean }>(path);
}

export async function createAuditLog(payload: CreateAuditLogInput): Promise<AuditLogRecord> {
  return requestJson<AuditLogRecord>('/api/audit-logs', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export interface ClearAuditLogsResponse {
  deleted: number;
}

export async function clearAuditLogs(): Promise<ClearAuditLogsResponse> {
  return requestJson<ClearAuditLogsResponse>('/api/audit-logs', {
    method: 'DELETE',
  });
}