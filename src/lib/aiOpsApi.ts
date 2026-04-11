import { requestJson } from './api';

export interface DocumentValidationResult {
  status: 'aprobado' | 'revisar' | 'rechazado';
  score: number;
  decision?: 'approved' | 'review' | 'rejected';
  extracted: {
    supplier: string | null;
    total: number;
    date: string | null;
    invoiceNumber: string | null;
  };
  checks: Array<{
    name: string;
    status: 'pass' | 'warn' | 'fail';
    detail: string;
  }>;
  recommendations: string[];
  autoAction?: {
    requested: boolean;
    applied: boolean;
    summary: string;
    workflowId?: string | null;
  };
}

export interface OcrValidationRecord {
  id: string;
  projectId: string | null;
  purchaseOrderId: string | null;
  invoiceNumber: string | null;
  supplier: string | null;
  detectedTotal: number;
  score: number;
  resultStatus: 'aprobado' | 'revisar' | 'rechazado';
  decision: 'approved' | 'review' | 'rejected';
  autoApply: boolean;
  autoActionStatus: string | null;
  autoActionSummary: string | null;
  createdBy: string | null;
  createdAt: string;
}

export async function validateDocumentOCR(payload: {
  rawText?: string;
  imageDataUrl?: string;
  purchaseOrderId?: string;
  projectId?: string;
  autoApply?: boolean;
  requestedBy?: string;
}) {
  return requestJson<DocumentValidationResult>('/api/documents/ocr-validate', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function listOcrValidations(params: {
  projectId?: string;
  purchaseOrderId?: string;
  supplier?: string;
  invoiceNumber?: string;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
} = {}) {
  const search = new URLSearchParams();
  if (params.projectId) search.set('projectId', params.projectId);
  if (params.purchaseOrderId) search.set('purchaseOrderId', params.purchaseOrderId);
  if (params.supplier) search.set('supplier', params.supplier);
  if (params.invoiceNumber) search.set('invoiceNumber', params.invoiceNumber);
  if (params.from) search.set('from', params.from);
  if (params.to) search.set('to', params.to);
  if (params.limit) search.set('limit', String(params.limit));
  if (Number.isFinite(params.offset)) search.set('offset', String(params.offset));

  const qs = search.toString();
  const path = qs ? `/api/documents/ocr-validations?${qs}` : '/api/documents/ocr-validations';
  return requestJson<{ items: OcrValidationRecord[]; hasMore?: boolean; limit?: number; offset?: number }>(path);
}
