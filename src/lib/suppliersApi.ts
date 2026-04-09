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

export interface CreateSupplierPaymentPayload {
  supplierId: string;
  purchaseOrderId?: string;
  amount: number;
  paymentMethod: 'paypal' | 'banrural_virtual' | 'transferencia' | 'efectivo';
  paymentReference?: string;
  notes?: string;
  paidAt?: string;
}

export interface UpdateSupplierPaymentPayload {
  amount?: number;
  paymentMethod?: 'paypal' | 'banrural_virtual' | 'transferencia' | 'efectivo';
  paymentReference?: string;
  notes?: string;
  paidAt?: string;
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

export async function listSupplierPayments(params: { supplierId?: string; purchaseOrderId?: string } = {}): Promise<any[]> {
  const search = new URLSearchParams();
  if (params.supplierId) search.set('supplierId', params.supplierId);
  if (params.purchaseOrderId) search.set('purchaseOrderId', params.purchaseOrderId);
  const qs = search.toString();
  const path = qs ? `/api/supplier-payments?${qs}` : '/api/supplier-payments';
  const response = await requestJson<{ items: any[] }>(path);
  return response.items;
}

export async function createSupplierPayment(payload: CreateSupplierPaymentPayload): Promise<any> {
  return requestJson<any>('/api/supplier-payments', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function updateSupplierPayment(id: string, payload: UpdateSupplierPaymentPayload): Promise<any> {
  return requestJson<any>(`/api/supplier-payments/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export async function deleteSupplierPayment(id: string): Promise<void> {
  await requestJson<void>(`/api/supplier-payments/${id}`, {
    method: 'DELETE',
  });
}
