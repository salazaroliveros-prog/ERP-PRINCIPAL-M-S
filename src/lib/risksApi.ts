import { requestJson } from './api';

export interface RiskRecord {
  id: string;
  projectId: string;
  title: string;
  description: string;
  category: string;
  impact: string;
  probability: string;
  status: string;
  mitigationPlan: string;
  contingencyPlan: string;
  owner: string;
  createdAt: string;
  updatedAt: string;
}

export interface RiskPayload {
  projectId: string;
  title: string;
  description?: string;
  category?: string;
  impact?: string;
  probability?: string;
  status?: string;
  mitigationPlan?: string;
  contingencyPlan?: string;
  owner?: string;
}

export async function listRisks(): Promise<RiskRecord[]> {
  const response = await requestJson<{ items: RiskRecord[] }>('/api/risks');
  return response.items;
}

export async function createRisk(payload: RiskPayload): Promise<RiskRecord> {
  return requestJson<RiskRecord>('/api/risks', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function updateRisk(id: string, payload: Partial<RiskPayload>): Promise<RiskRecord> {
  return requestJson<RiskRecord>(`/api/risks/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export async function deleteRisk(id: string): Promise<void> {
  await requestJson<void>(`/api/risks/${id}`, {
    method: 'DELETE',
  });
}