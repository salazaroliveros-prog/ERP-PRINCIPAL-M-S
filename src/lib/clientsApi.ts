import { requestJson } from './api';

export interface ClientPayload {
  name: string;
  email?: string;
  phone?: string;
  company?: string;
  contactPerson?: string;
  contacto?: string;
  status?: string;
  notes?: string;
  location?: any;
  attachments?: any[];
  lastInteraction?: string | null;
}

export async function listClients(): Promise<any[]> {
  const response = await requestJson<{ items: any[] }>('/api/clients');
  return response.items;
}

export async function createClient(payload: ClientPayload): Promise<any> {
  return requestJson<any>('/api/clients', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function updateClient(id: string, payload: Partial<ClientPayload>): Promise<any> {
  return requestJson<any>(`/api/clients/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export async function deleteClient(id: string): Promise<void> {
  await requestJson<void>(`/api/clients/${id}`, {
    method: 'DELETE',
  });
}

export async function listClientChats(clientId: string): Promise<any[]> {
  const response = await requestJson<{ items: any[] }>(`/api/clients/${clientId}/chats`);
  return response.items;
}

export async function createClientChat(clientId: string, payload: { text: string; sender?: string }): Promise<any> {
  return requestJson<any>(`/api/clients/${clientId}/chats`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function listClientInteractions(clientId: string): Promise<any[]> {
  const response = await requestJson<{ items: any[] }>(`/api/clients/${clientId}/interactions`);
  return response.items;
}

export async function createClientInteraction(
  clientId: string,
  payload: { type: string; notes: string; date: string }
): Promise<any> {
  return requestJson<any>(`/api/clients/${clientId}/interactions`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function addClientAttachment(clientId: string, attachment: any): Promise<any> {
  return requestJson<any>(`/api/clients/${clientId}/attachments`, {
    method: 'POST',
    body: JSON.stringify({ attachment }),
  });
}
