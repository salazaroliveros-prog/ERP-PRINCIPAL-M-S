import { requestJson } from './api';

export interface WorkflowTaskRecord {
  id: string;
  title: string;
  type: 'quote' | 'purchase_order' | 'subcontract' | 'other';
  referenceId: string;
  status: 'pending' | 'approved' | 'rejected';
  requestedBy: string;
  requestedAt: string;
  priority: 'low' | 'medium' | 'high';
  description: string;
  amount?: number;
  resolvedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface WorkflowTaskPayload {
  title: string;
  type: 'quote' | 'purchase_order' | 'subcontract' | 'other';
  referenceId: string;
  priority: 'low' | 'medium' | 'high';
  description: string;
  amount?: number;
  requestedBy: string;
}

export async function listWorkflows(params: { status?: string } = {}): Promise<WorkflowTaskRecord[]> {
  const search = new URLSearchParams();
  if (params.status) search.set('status', params.status);
  const qs = search.toString();
  const path = qs ? `/api/workflows?${qs}` : '/api/workflows';
  const response = await requestJson<{ items: WorkflowTaskRecord[] }>(path);
  return response.items;
}

export async function createWorkflow(payload: WorkflowTaskPayload): Promise<WorkflowTaskRecord> {
  return requestJson<WorkflowTaskRecord>('/api/workflows', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function updateWorkflow(id: string, payload: Partial<WorkflowTaskPayload>): Promise<WorkflowTaskRecord> {
  return requestJson<WorkflowTaskRecord>(`/api/workflows/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export async function updateWorkflowStatus(
  id: string,
  status: 'pending' | 'approved' | 'rejected'
): Promise<WorkflowTaskRecord> {
  return requestJson<WorkflowTaskRecord>(`/api/workflows/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
}

export async function deleteWorkflow(id: string): Promise<void> {
  await requestJson<void>(`/api/workflows/${id}`, {
    method: 'DELETE',
  });
}