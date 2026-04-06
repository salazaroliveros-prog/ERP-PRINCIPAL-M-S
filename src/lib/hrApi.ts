import { requestJson } from './api';

export interface EmployeeRecord {
  id: string;
  name: string;
  role: string;
  department: string;
  salary: number;
  status: string;
  joinDate: string;
  createdAt: string;
  updatedAt: string;
}

export interface EmployeePayload {
  name: string;
  role: string;
  department: string;
  salary: number;
  status: string;
  joinDate: string;
}

export interface AttendancePayload {
  employeeId: string;
  employeeName?: string;
  type: string;
  timestamp: string;
}

export async function listEmployees(): Promise<EmployeeRecord[]> {
  const response = await requestJson<{ items: EmployeeRecord[] }>('/api/employees');
  return response.items;
}

export async function createEmployee(payload: EmployeePayload): Promise<EmployeeRecord> {
  return requestJson<EmployeeRecord>('/api/employees', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function updateEmployee(id: string, payload: Partial<EmployeePayload>): Promise<EmployeeRecord> {
  return requestJson<EmployeeRecord>(`/api/employees/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export async function deleteEmployee(id: string): Promise<void> {
  await requestJson<void>(`/api/employees/${id}`, {
    method: 'DELETE',
  });
}

export async function createAttendance(payload: AttendancePayload): Promise<any> {
  return requestJson<any>('/api/attendance', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}
