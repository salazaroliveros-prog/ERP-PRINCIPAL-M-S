import { requestJson } from './api';

export interface ProjectPoi {
  id: string;
  projectId: string;
  name: string;
  comment: string;
  lat: number;
  lng: number;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectLogbookEntry {
  id: string;
  projectId: string;
  date: string;
  content: string;
  weather: string;
  workersCount: number;
  photos: string[];
  authorEmail: string;
  createdAt: string;
}

export async function listProjectPois(projectId: string): Promise<ProjectPoi[]> {
  const response = await requestJson<{ items: ProjectPoi[] }>(`/api/projects/${projectId}/pois`);
  return response.items;
}

export async function createProjectPoi(
  projectId: string,
  payload: { name: string; comment?: string; lat: number; lng: number }
): Promise<ProjectPoi> {
  return requestJson<ProjectPoi>(`/api/projects/${projectId}/pois`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function updateProjectPoi(
  projectId: string,
  poiId: string,
  payload: { name?: string; comment?: string; lat?: number; lng?: number }
): Promise<ProjectPoi> {
  return requestJson<ProjectPoi>(`/api/projects/${projectId}/pois/${poiId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export async function deleteProjectPoi(projectId: string, poiId: string): Promise<void> {
  await requestJson<void>(`/api/projects/${projectId}/pois/${poiId}`, {
    method: 'DELETE',
  });
}

export async function listProjectLogbookEntries(projectId: string): Promise<ProjectLogbookEntry[]> {
  const response = await requestJson<{ items: ProjectLogbookEntry[] }>(`/api/projects/${projectId}/logbook`);
  return response.items;
}

export async function createProjectLogbookEntry(
  projectId: string,
  payload: {
    date: string;
    content: string;
    weather?: string;
    workersCount?: number;
    photos?: string[];
    authorEmail?: string;
  }
): Promise<ProjectLogbookEntry> {
  return requestJson<ProjectLogbookEntry>(`/api/projects/${projectId}/logbook`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function deleteProjectLogbookEntry(projectId: string, entryId: string): Promise<void> {
  await requestJson<void>(`/api/projects/${projectId}/logbook/${entryId}`, {
    method: 'DELETE',
  });
}