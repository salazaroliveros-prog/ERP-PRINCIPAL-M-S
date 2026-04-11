import { requestJson } from './api';

export interface DocumentValidationResult {
  status: 'aprobado' | 'revisar' | 'rechazado';
  score: number;
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
}

export async function validateDocumentOCR(payload: {
  rawText?: string;
  imageDataUrl?: string;
  purchaseOrderId?: string;
  projectId?: string;
}) {
  return requestJson<DocumentValidationResult>('/api/documents/ocr-validate', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}
