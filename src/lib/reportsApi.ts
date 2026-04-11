import { requestJson } from './api';

export interface SendPdfEmailInput {
  to: string;
  subject: string;
  html: string;
  fileName: string;
  pdfBase64: string;
}

export async function sendPdfReportByEmail(payload: SendPdfEmailInput) {
  return requestJson<{ success: boolean; providerId?: string; message?: string }>('/api/reports/email', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}
