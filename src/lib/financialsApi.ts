import { requestJson } from './api';

export interface FinancialTransaction {
  id: string;
  projectId: string;
  budgetItemId: string | null;
  subcontractId: string | null;
  type: 'Income' | 'Expense';
  category: string;
  amount: number;
  date: string;
  description: string;
  accountType: 'project' | 'owner';
  incomeOrigin: string;
  fundingSource: string;
  createdAt: string;
}

export interface ListTransactionsResult {
  items: FinancialTransaction[];
  hasMore: boolean;
  offset: number;
  limit: number;
}

export interface CreateTransactionInput {
  projectId?: string;
  budgetItemId: string;
  subcontractId?: string;
  type: 'Income' | 'Expense';
  category: string;
  amount: number;
  date: string;
  description: string;
  accountType?: 'project' | 'owner';
  incomeOrigin?: string;
  fundingSource?: string;
}

export async function listTransactions(params: {
  limit?: number;
  offset?: number;
  projectId?: string;
  subcontractId?: string;
  from?: string;
  to?: string;
} = {}): Promise<ListTransactionsResult> {
  const search = new URLSearchParams();

  if (params.limit) search.set('limit', String(params.limit));
  if (params.offset) search.set('offset', String(params.offset));
  if (params.projectId) search.set('projectId', params.projectId);
  if (params.subcontractId) search.set('subcontractId', params.subcontractId);
  if (params.from) search.set('from', params.from);
  if (params.to) search.set('to', params.to);

  const queryString = search.toString();
  const path = queryString ? `/api/transactions?${queryString}` : '/api/transactions';
  return requestJson<ListTransactionsResult>(path);
}

export async function createTransaction(payload: CreateTransactionInput): Promise<FinancialTransaction> {
  return requestJson<FinancialTransaction>('/api/transactions', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function updateTransactionById(id: string, payload: CreateTransactionInput): Promise<FinancialTransaction> {
  return requestJson<FinancialTransaction>(`/api/transactions/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export async function deleteTransactionById(id: string): Promise<void> {
  await requestJson<void>(`/api/transactions/${id}`, {
    method: 'DELETE',
  });
}
