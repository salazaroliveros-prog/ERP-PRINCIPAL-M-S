import { requestJson } from './api';

export interface InventoryItem {
  id: string;
  projectId: string;
  name: string;
  unit: string;
  stock: number;
  minStock: number;
  unitPrice: number;
  category: string;
  createdAt: string;
  updatedAt: string;
}

export interface SyncInventoryItemInput {
  name: string;
  unit: string;
  totalQuantity: number;
  unitPrice: number;
  category?: string;
}

export interface UpsertInventoryInput {
  projectId: string;
  name: string;
  category: string;
  unit: string;
  unitPrice: number;
  stock: number;
  minStock: number;
  suppliers?: string[];
  batches?: any[];
}

export interface CreateQuoteInput {
  clientId: string;
  projectId: string;
  date: string;
  status: string;
  total: number;
  items: any[];
}

export interface CreateInventoryTransactionInput {
  materialId: string;
  materialName: string;
  type: string;
  quantity: number;
  batchNumber?: string | null;
  previousStock?: number | null;
  newStock?: number | null;
  reason?: string | null;
  projectId?: string | null;
}

export interface CreateDeletedRecordInput {
  type: string;
  originalId?: string | null;
  materialId?: string | null;
  materialName?: string | null;
  batchId?: string | null;
  data: any;
  reason?: string | null;
}

export interface CreatePurchaseOrderInput {
  projectId?: string;
  budgetItemId?: string;
  materialId?: string;
  materialName: string;
  quantity: number;
  unit?: string;
  estimatedCost?: number;
  supplier?: string;
  supplierId?: string;
  notes?: string;
  status?: string;
  date?: string;
  datePaid?: string | null;
  paymentMethod?: string | null;
  paymentReference?: string | null;
  stockApplied?: boolean;
  budgetApplied?: boolean;
}

export interface PurchaseOrderItem {
  id: string;
  projectId: string;
  budgetItemId: string;
  materialId: string;
  materialName: string;
  quantity: number;
  unit: string;
  estimatedCost: number;
  supplier: string;
  supplierId: string;
  notes: string;
  status: string;
  date: string;
  dateReceived?: string | null;
  datePaid?: string | null;
  paymentMethod?: string | null;
  paymentReference?: string | null;
  stockApplied?: boolean;
  budgetApplied?: boolean;
  createdAt: string;
  updatedAt: string;
}

export async function listInventoryByProject(projectId: string): Promise<InventoryItem[]> {
  const response = await requestJson<{ items: InventoryItem[] }>(
    `/api/inventory?projectId=${encodeURIComponent(projectId)}`
  );
  return response.items;
}

export async function listInventory(params: {
  projectId?: string;
  limit?: number;
  offset?: number;
} = {}): Promise<{ items: InventoryItem[]; hasMore: boolean }> {
  const search = new URLSearchParams();
  if (params.projectId !== undefined) search.set('projectId', params.projectId);
  if (params.limit) search.set('limit', String(params.limit));
  if (params.offset) search.set('offset', String(params.offset));

  const qs = search.toString();
  const path = qs ? `/api/inventory?${qs}` : '/api/inventory';
  return requestJson<{ items: InventoryItem[]; hasMore: boolean }>(path);
}

export async function upsertInventoryItem(payload: UpsertInventoryInput): Promise<InventoryItem> {
  return requestJson<InventoryItem>('/api/inventory', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function updateInventoryItem(
  id: string,
  payload: Partial<UpsertInventoryInput>
): Promise<InventoryItem> {
  return requestJson<InventoryItem>(`/api/inventory/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export async function adjustInventoryStock(
  id: string,
  payload: { delta: number }
): Promise<InventoryItem> {
  return requestJson<InventoryItem>(`/api/inventory/${id}/stock`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export async function deleteInventoryItem(id: string): Promise<void> {
  await requestJson<void>(`/api/inventory/${id}`, {
    method: 'DELETE',
  });
}

export async function syncInventoryFromBudget(
  projectId: string,
  items: SyncInventoryItemInput[]
): Promise<{ synced: number }> {
  return requestJson<{ synced: number }>('/api/inventory/sync', {
    method: 'POST',
    body: JSON.stringify({ projectId, items }),
  });
}

export async function createQuote(payload: CreateQuoteInput): Promise<{ id: string }> {
  return requestJson<{ id: string }>('/api/quotes', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function listInventoryTransactions(params: {
  materialId?: string;
  type?: string;
  limit?: number;
} = {}): Promise<any[]> {
  const search = new URLSearchParams();
  if (params.materialId) search.set('materialId', params.materialId);
  if (params.type) search.set('type', params.type);
  if (params.limit) search.set('limit', String(params.limit));

  const qs = search.toString();
  const path = qs ? `/api/inventory-transactions?${qs}` : '/api/inventory-transactions';
  const response = await requestJson<{ items: any[] }>(path);
  return response.items;
}

export async function createInventoryTransaction(payload: CreateInventoryTransactionInput): Promise<any> {
  return requestJson<any>('/api/inventory-transactions', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function deleteInventoryTransaction(id: string): Promise<void> {
  await requestJson<void>(`/api/inventory-transactions/${id}`, {
    method: 'DELETE',
  });
}

export async function listDeletedRecords(): Promise<any[]> {
  const response = await requestJson<{ items: any[] }>('/api/deleted-records');
  return response.items;
}

export async function createDeletedRecord(payload: CreateDeletedRecordInput): Promise<any> {
  return requestJson<any>('/api/deleted-records', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function deleteDeletedRecord(id: string): Promise<void> {
  await requestJson<void>(`/api/deleted-records/${id}`, {
    method: 'DELETE',
  });
}

export async function createPurchaseOrder(payload: CreatePurchaseOrderInput): Promise<any> {
  return requestJson<any>('/api/purchase-orders', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function listPurchaseOrders(params: {
  projectId?: string;
  supplierId?: string;
  status?: string;
} = {}): Promise<PurchaseOrderItem[]> {
  const search = new URLSearchParams();
  if (params.projectId) search.set('projectId', params.projectId);
  if (params.supplierId) search.set('supplierId', params.supplierId);
  if (params.status) search.set('status', params.status);

  const qs = search.toString();
  const path = qs ? `/api/purchase-orders?${qs}` : '/api/purchase-orders';
  const response = await requestJson<{ items: PurchaseOrderItem[] }>(path);
  return response.items;
}

export async function updatePurchaseOrder(id: string, payload: Partial<CreatePurchaseOrderInput> & {
  status?: string;
  dateReceived?: string | null;
  datePaid?: string | null;
}): Promise<PurchaseOrderItem> {
  return requestJson<PurchaseOrderItem>(`/api/purchase-orders/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export async function deletePurchaseOrder(id: string): Promise<void> {
  await requestJson<void>(`/api/purchase-orders/${id}`, {
    method: 'DELETE',
  });
}
