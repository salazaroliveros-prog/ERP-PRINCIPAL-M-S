import { requestJson } from './api';

export interface SafetyIncidentRecord {
  id: string;
  title: string;
  type: string;
  severity: string;
  location: string;
  date: string;
  description: string;
  measures: string;
  status: string;
  authorEmail: string;
  createdAt: string;
  updatedAt: string;
}

export interface SafetyIncidentPayload {
  title: string;
  type?: string;
  severity?: string;
  location?: string;
  date?: string;
  description?: string;
  measures?: string;
  status?: string;
  authorEmail?: string;
}

export async function listSafetyIncidents(): Promise<SafetyIncidentRecord[]> {
  const response = await requestJson<{ items: SafetyIncidentRecord[] }>('/api/safety-incidents');
  return response.items;
}

export async function createSafetyIncident(payload: SafetyIncidentPayload): Promise<SafetyIncidentRecord> {
  return requestJson<SafetyIncidentRecord>('/api/safety-incidents', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function updateSafetyIncident(id: string, payload: Partial<SafetyIncidentPayload>): Promise<SafetyIncidentRecord> {
  return requestJson<SafetyIncidentRecord>(`/api/safety-incidents/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export async function deleteSafetyIncident(id: string): Promise<void> {
  await requestJson<void>(`/api/safety-incidents/${id}`, {
    method: 'DELETE',
  });
}