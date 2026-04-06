import { requestJson } from './api';

export interface SupplierPayload {
  name: string;
  category?: string;
  contact?: string;
  email?: string;
  phone?: string;
  rating?: number;
  status?: string;
  balance?: number;
  lastOrder?: string;
}

export async function listSuppliers(): Promise<any[]> {
  const response = await requestJson<{ items: any[] }>('/api/suppliers');
  return response.items;
}

export async function createSupplier(payload: SupplierPayload): Promise<any> {
  return requestJson<any>('/api/suppliers', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function updateSupplier(id: string, payload: Partial<SupplierPayload>): Promise<any> {
  return requestJson<any>(`/api/suppliers/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export async function deleteSupplier(id: string): Promise<void> {
  await requestJson<void>(`/api/suppliers/${id}`, {
    method: 'DELETE',
  });
}
