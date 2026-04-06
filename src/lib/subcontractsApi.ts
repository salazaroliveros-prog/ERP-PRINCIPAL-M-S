import { requestJson } from './api';

export interface SubcontractRecord {
  id: string;
  projectId: string;
  budgetItemId: string;
  budgetItemName: string;
  contractor: string;
  service: string;
  startDate: string;
  endDate: string;
  total: number;
  paid: number;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface SubcontractPayload {
  projectId: string;
  budgetItemId?: string;
  budgetItemName?: string;
  contractor: string;
  service: string;
  startDate?: string;
  endDate?: string;
  total: number;
  paid?: number;
  status?: string;
}

export async function listSubcontracts(params: { projectId?: string; status?: string } = {}): Promise<SubcontractRecord[]> {
  const search = new URLSearchParams();
  if (params.projectId) search.set('projectId', params.projectId);
  if (params.status) search.set('status', params.status);
  const qs = search.toString();
  const path = qs ? `/api/subcontracts?${qs}` : '/api/subcontracts';
  const response = await requestJson<{ items: SubcontractRecord[] }>(path);
  return response.items;
}

export async function createSubcontract(payload: SubcontractPayload): Promise<SubcontractRecord> {
  return requestJson<SubcontractRecord>('/api/subcontracts', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function updateSubcontract(id: string, payload: Partial<SubcontractPayload>): Promise<SubcontractRecord> {
  return requestJson<SubcontractRecord>(`/api/subcontracts/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export async function deleteSubcontract(id: string): Promise<void> {
  await requestJson<void>(`/api/subcontracts/${id}`, {
    method: 'DELETE',
  });
}