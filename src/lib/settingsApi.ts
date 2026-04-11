import { requestJson } from './api';

export interface ThresholdSettings {
  materialWeeklySpikeThresholdPct: number;
  physicalFinancialDeviationThresholdPct: number;
  updatedAt: string | null;
  updatedBy: string | null;
  source?: 'database' | 'fallback';
}

export const DEFAULT_THRESHOLD_SETTINGS: ThresholdSettings = {
  materialWeeklySpikeThresholdPct: 10,
  physicalFinancialDeviationThresholdPct: 15,
  updatedAt: null,
  updatedBy: null,
  source: 'fallback',
};

function normalizeThresholdSettings(input: Partial<ThresholdSettings> | null | undefined): ThresholdSettings {
  const material = Number(input?.materialWeeklySpikeThresholdPct ?? DEFAULT_THRESHOLD_SETTINGS.materialWeeklySpikeThresholdPct);
  const deviation = Number(input?.physicalFinancialDeviationThresholdPct ?? DEFAULT_THRESHOLD_SETTINGS.physicalFinancialDeviationThresholdPct);

  return {
    materialWeeklySpikeThresholdPct: Number.isFinite(material) ? Math.max(3, Math.min(40, material)) : DEFAULT_THRESHOLD_SETTINGS.materialWeeklySpikeThresholdPct,
    physicalFinancialDeviationThresholdPct: Number.isFinite(deviation) ? Math.max(5, Math.min(40, deviation)) : DEFAULT_THRESHOLD_SETTINGS.physicalFinancialDeviationThresholdPct,
    updatedAt: input?.updatedAt || null,
    updatedBy: input?.updatedBy || null,
    source: input?.source || 'database',
  };
}

export async function getThresholdSettings(): Promise<ThresholdSettings> {
  const response = await requestJson<ThresholdSettings>('/api/settings/thresholds');
  return normalizeThresholdSettings(response);
}

export async function saveThresholdSettings(payload: {
  materialWeeklySpikeThresholdPct: number;
  physicalFinancialDeviationThresholdPct: number;
}): Promise<ThresholdSettings> {
  const response = await requestJson<ThresholdSettings>('/api/settings/thresholds', {
    method: 'PUT',
    body: JSON.stringify(payload),
  });

  return normalizeThresholdSettings(response);
}
