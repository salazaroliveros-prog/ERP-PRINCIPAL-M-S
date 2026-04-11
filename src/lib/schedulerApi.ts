import { requestJson } from './api';

export interface SchedulerStatusResponse {
  status: string;
  scheduler?: {
    enabled?: boolean;
    reason?: string;
    intervalMs?: number;
    runs?: number;
    alertsGenerated?: number;
    dedupedSkips?: number;
    failures?: number;
    lastCheckedAt?: string | null;
    lastRunAt?: string | null;
    lastSuccessAt?: string | null;
    lastErrorAt?: string | null;
    lastError?: string | null;
    lastSlot?: string | null;
    activeTimer?: boolean;
    hours?: number[];
  };
}

export async function getSchedulerStatus() {
  return requestJson<SchedulerStatusResponse>('/api/scheduler/status');
}
