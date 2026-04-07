import { requestJson } from './api';

export interface ProjectSummary {
  id: string;
  name: string;
  area: number;
  status: string;
  location: string;
  projectManager: string;
  budget: number;
  spent: number;
  physicalProgress: number;
  financialProgress: number;
  startDate: string;
  endDate: string;
  clientUid: string;
  typology: string;
  coordinates: { lat: number; lng: number } | null;
  latitude: string;
  longitude: string;
  createdAt: string;
}

export interface ProjectUpsertInput {
  name: string;
  location: string;
  projectManager: string;
  status: string;
  budget: number;
  spent: number;
  physicalProgress: number;
  financialProgress: number;
  area: number;
  startDate: string;
  endDate: string;
  clientUid: string;
  typology: string;
  latitude?: string;
  longitude?: string;
}

export interface BudgetItemSummary {
  id: string;
  projectId: string;
  description: string;
  category: string;
  totalItemPrice: number;
  total: number;
  order: number;
}

export interface BudgetItemDetail {
  id: string;
  projectId: string;
  description: string;
  category: string;
  unit: string;
  quantity: number;
  materialCost: number;
  laborCost: number;
  indirectCost: number;
  totalUnitPrice: number;
  totalItemPrice: number;
  estimatedDays: number;
  order: number;
  notes: string;
  materialDetails: string;
  indirectFactor: number;
  materials: any[];
  labor: any[];
  subtasks: any[];
  progress?: number;
  createdAt: string;
  updatedAt: string;
}

export interface BudgetItemUpsertInput {
  description: string;
  category?: string;
  unit?: string;
  quantity?: number;
  materialCost?: number;
  laborCost?: number;
  indirectCost?: number;
  totalUnitPrice?: number;
  totalItemPrice?: number;
  estimatedDays?: number;
  order?: number;
  notes?: string;
  materialDetails?: string;
  indirectFactor?: number;
  materials?: any[];
  labor?: any[];
  subtasks?: any[];
  progress?: number;
}

export async function listProjects(): Promise<ProjectSummary[]> {
  const response = await requestJson<{ items: ProjectSummary[] }>('/api/projects');
  return response.items;
}

export async function createProject(payload: ProjectUpsertInput): Promise<ProjectSummary> {
  return requestJson<ProjectSummary>('/api/projects', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function updateProject(projectId: string, payload: ProjectUpsertInput): Promise<ProjectSummary> {
  return requestJson<ProjectSummary>(`/api/projects/${projectId}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export async function deleteProject(projectId: string): Promise<void> {
  await requestJson<void>(`/api/projects/${projectId}`, {
    method: 'DELETE',
  });
}

export async function listBudgetItems(projectId?: string): Promise<BudgetItemSummary[]> {
  const path = projectId
    ? `/api/budget-items?projectId=${encodeURIComponent(projectId)}`
    : '/api/budget-items';
  const response = await requestJson<{ items: BudgetItemSummary[] }>(path);
  return response.items;
}

export async function createBudgetItem(
  projectId: string,
  payload: Pick<BudgetItemSummary, 'description' | 'category' | 'totalItemPrice' | 'order'>
): Promise<BudgetItemSummary> {
  return requestJson<BudgetItemSummary>(`/api/projects/${projectId}/budget-items`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function listProjectBudgetItemsDetailed(projectId: string): Promise<BudgetItemDetail[]> {
  const response = await requestJson<{ items: BudgetItemDetail[] }>(`/api/projects/${projectId}/budget-items`);
  return response.items;
}

export async function createProjectBudgetItem(
  projectId: string,
  payload: BudgetItemUpsertInput
): Promise<BudgetItemDetail> {
  return requestJson<BudgetItemDetail>(`/api/projects/${projectId}/budget-items`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function updateProjectBudgetItem(
  projectId: string,
  itemId: string,
  payload: Partial<BudgetItemUpsertInput>
): Promise<BudgetItemDetail> {
  return requestJson<BudgetItemDetail>(`/api/projects/${projectId}/budget-items/${itemId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export async function deleteProjectBudgetItem(projectId: string, itemId: string): Promise<void> {
  await requestJson<void>(`/api/projects/${projectId}/budget-items/${itemId}`, {
    method: 'DELETE',
  });
}

export async function reorderProjectBudgetItems(projectId: string, orderedIds: string[]): Promise<void> {
  await requestJson<void>(`/api/projects/${projectId}/budget-items/reorder`, {
    method: 'POST',
    body: JSON.stringify({ orderedIds }),
  });
}

export async function updateProjectBudgetSummary(
  projectId: string,
  payload: {
    budget?: number;
    budgetStatus?: string;
    budgetValidationMessage?: string;
    budgetValidationType?: string;
    budgetValidatedAt?: string | null;
    typology?: string;
  }
): Promise<void> {
  await requestJson<void>(`/api/projects/${projectId}/budget-summary`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}
