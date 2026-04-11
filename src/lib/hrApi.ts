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

export interface AttendanceRecord {
  id: string;
  employeeId: string;
  employeeName: string;
  type: string;
  timestamp: string;
  createdAt: string;
}

export interface VacancyRecord {
  id: string;
  title: string;
  department: string;
  openings: number;
  status: 'Open' | 'Closed';
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface VacancyPayload {
  title: string;
  department: string;
  openings: number;
  status: 'Open' | 'Closed';
  notes?: string;
}

export interface EmploymentContractRecord {
  id: string;
  employeeId: string;
  employeeName: string;
  employeeRole: string;
  employeeDepartment: string;
  salary: number;
  startDate: string;
  contractType: string;
  companyName: string;
  ownerName: string;
  ownerTitle: string;
  status: 'draft' | 'sent' | 'worker_signed' | 'completed';
  shareToken: string;
  sentAt: string | null;
  workerSignedAt: string | null;
  ownerSignedAt: string | null;
  workerSignatureDataUrl: string | null;
  ownerSignatureDataUrl: string | null;
  signedFileUrl: string | null;
  signedFileName: string | null;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface EmploymentContractPayload {
  employeeId: string;
  startDate: string;
  contractType: string;
  companyName: string;
  ownerName: string;
  ownerTitle: string;
  notes?: string;
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

export async function listAttendance(params: { employeeId?: string; limit?: number; offset?: number } = {}) {
  const search = new URLSearchParams();
  if (params.employeeId) search.set('employeeId', params.employeeId);
  if (params.limit !== undefined) search.set('limit', String(params.limit));
  if (params.offset !== undefined) search.set('offset', String(params.offset));

  const qs = search.toString();
  const path = qs ? `/api/attendance?${qs}` : '/api/attendance';
  return requestJson<{ items: AttendanceRecord[]; hasMore: boolean }>(path);
}

export async function updateAttendance(id: string, payload: Partial<AttendancePayload>) {
  return requestJson<AttendanceRecord>(`/api/attendance/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export async function deleteAttendance(id: string): Promise<void> {
  await requestJson<void>(`/api/attendance/${id}`, {
    method: 'DELETE',
  });
}

export async function listVacancies(): Promise<VacancyRecord[]> {
  const response = await requestJson<{ items: VacancyRecord[] }>('/api/vacancies');
  return response.items;
}

export async function createVacancy(payload: VacancyPayload): Promise<VacancyRecord> {
  return requestJson<VacancyRecord>('/api/vacancies', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function updateVacancy(id: string, payload: Partial<VacancyPayload>): Promise<VacancyRecord> {
  return requestJson<VacancyRecord>(`/api/vacancies/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export async function deleteVacancy(id: string): Promise<void> {
  await requestJson<void>(`/api/vacancies/${id}`, {
    method: 'DELETE',
  });
}

export async function listEmploymentContracts(): Promise<EmploymentContractRecord[]> {
  const response = await requestJson<{ items: EmploymentContractRecord[] }>('/api/contracts');
  return response.items;
}

export async function createEmploymentContract(payload: EmploymentContractPayload): Promise<EmploymentContractRecord> {
  return requestJson<EmploymentContractRecord>('/api/contracts', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function updateEmploymentContract(
  id: string,
  payload: Partial<EmploymentContractRecord>
): Promise<EmploymentContractRecord> {
  return requestJson<EmploymentContractRecord>(`/api/contracts/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export async function deleteEmploymentContract(id: string): Promise<void> {
  await requestJson<void>(`/api/contracts/${id}`, {
    method: 'DELETE',
  });
}

export async function getContractForSigning(token: string): Promise<EmploymentContractRecord> {
  return requestJson<EmploymentContractRecord>(`/api/contracts/sign/${encodeURIComponent(token)}`);
}

export async function submitWorkerContractSignature(
  token: string,
  payload: { workerSignatureDataUrl: string; workerName?: string }
): Promise<EmploymentContractRecord> {
  return requestJson<EmploymentContractRecord>(`/api/contracts/sign/${encodeURIComponent(token)}`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}
