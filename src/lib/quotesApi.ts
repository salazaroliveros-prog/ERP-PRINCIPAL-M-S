import { requestJson } from './api';

export interface QuoteItem {
  description: string;
  quantity: number;
  unitPrice: number;
  materials?: any[];
  labor?: any[];
  indirectFactor?: number;
  materialCost?: number;
  laborCost?: number;
}

export interface QuotePayload {
  clientId: string;
  projectId: string;
  date: string;
  status: string;
  total: number;
  notes?: string;
  items: QuoteItem[];
  sentAt?: string | null;
}

export interface QuoteRecord extends QuotePayload {
  id: string;
  createdAt: string;
  updatedAt: string;
}

export async function listQuotes(params: {
  clientId?: string;
  projectId?: string;
  status?: string;
} = {}): Promise<QuoteRecord[]> {
  const search = new URLSearchParams();
  if (params.clientId) search.set('clientId', params.clientId);
  if (params.projectId) search.set('projectId', params.projectId);
  if (params.status) search.set('status', params.status);

  const qs = search.toString();
  const path = qs ? `/api/quotes?${qs}` : '/api/quotes';
  const response = await requestJson<{ items: QuoteRecord[] }>(path);
  return response.items;
}

export async function createQuoteRecord(payload: QuotePayload): Promise<QuoteRecord> {
  return requestJson<QuoteRecord>('/api/quotes', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function updateQuoteRecord(id: string, payload: Partial<QuotePayload>): Promise<QuoteRecord> {
  return requestJson<QuoteRecord>(`/api/quotes/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export async function deleteQuoteRecord(id: string): Promise<void> {
  await requestJson<void>(`/api/quotes/${id}`, {
    method: 'DELETE',
  });
}
