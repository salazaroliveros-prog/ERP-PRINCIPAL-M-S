import { requestJson } from './api';

export interface DocumentPayload {
  name: string;
  type: string;
  size?: string;
  fileUrl?: string;
  folder: string;
  author?: string;
  date?: string;
}

export interface FolderPayload {
  name: string;
  color?: string;
}

export async function listDocuments(): Promise<any[]> {
  const response = await requestJson<{ items: any[] }>('/api/documents');
  return response.items;
}

export async function createDocument(payload: DocumentPayload): Promise<any> {
  return requestJson<any>('/api/documents', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function updateDocument(id: string, payload: Partial<DocumentPayload>): Promise<any> {
  return requestJson<any>(`/api/documents/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export async function deleteDocument(id: string): Promise<void> {
  await requestJson<void>(`/api/documents/${id}`, {
    method: 'DELETE',
  });
}

export async function listFolders(): Promise<any[]> {
  const response = await requestJson<{ items: any[] }>('/api/folders');
  return response.items;
}

export async function createFolder(payload: FolderPayload): Promise<any> {
  return requestJson<any>('/api/folders', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}
