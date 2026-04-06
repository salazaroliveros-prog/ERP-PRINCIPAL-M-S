import { requestJson } from './api';

export interface EquipmentRecord {
  id: string;
  name: string;
  type: string;
  projectId: string;
  dailyRate: number;
  estimatedDays: number;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface EquipmentPayload {
  name: string;
  type: string;
  projectId?: string;
  dailyRate: number;
  estimatedDays?: number;
  status: string;
}

export async function listEquipment(): Promise<EquipmentRecord[]> {
  const response = await requestJson<{ items: EquipmentRecord[] }>('/api/equipment');
  return response.items;
}

export async function createEquipment(payload: EquipmentPayload): Promise<EquipmentRecord> {
  return requestJson<EquipmentRecord>('/api/equipment', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function updateEquipment(id: string, payload: Partial<EquipmentPayload>): Promise<EquipmentRecord> {
  return requestJson<EquipmentRecord>(`/api/equipment/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export async function deleteEquipment(id: string): Promise<void> {
  await requestJson<void>(`/api/equipment/${id}`, {
    method: 'DELETE',
  });
}
