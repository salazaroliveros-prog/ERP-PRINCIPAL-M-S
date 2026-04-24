import { requestJson } from './api';

export type TaskStatus = 'pending' | 'in_progress' | 'done' | 'cancelled';
export type TaskPriority = 'low' | 'medium' | 'high' | 'critical';

export interface Task {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  projectId: string | null;
  assigneeId: string | null;
  assigneeName: string | null;
  dueDate: string | null;
  completedAt: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TasksResponse {
  items: Task[];
}

export interface CreateTaskInput {
  title: string;
  description?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  projectId?: string;
  assigneeId?: string;
  assigneeName?: string;
  dueDate?: string;
  createdBy?: string;
}

export interface UpdateTaskInput {
  title?: string;
  description?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  projectId?: string;
  assigneeId?: string;
  assigneeName?: string;
  dueDate?: string;
}

export function fetchTasks(params?: { projectId?: string; status?: TaskStatus; priority?: TaskPriority; assigneeId?: string }) {
  const query = new URLSearchParams();
  if (params?.projectId) query.set('projectId', params.projectId);
  if (params?.status) query.set('status', params.status);
  if (params?.priority) query.set('priority', params.priority);
  if (params?.assigneeId) query.set('assigneeId', params.assigneeId);
  const qs = query.toString();
  return requestJson<TasksResponse>(`/api/tasks${qs ? `?${qs}` : ''}`);
}

export function createTask(input: CreateTaskInput) {
  return requestJson<Task>('/api/tasks', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function updateTask(id: string, input: UpdateTaskInput) {
  return requestJson<Task>(`/api/tasks/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export function deleteTask(id: string) {
  return requestJson<null>(`/api/tasks/${id}`, { method: 'DELETE' });
}
