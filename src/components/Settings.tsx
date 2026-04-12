import React, { useState, useEffect } from 'react';
import { Settings as SettingsIcon, Palette, Check, Save, Building2, Globe, DollarSign, Play, Volume2 } from 'lucide-react';
import { motion } from 'motion/react';
import { toast } from 'sonner';
import { logAction } from '../lib/audit';
import { getOfflineQueueStatus, onOfflineQueueStatusChange, retryOfflineSync } from '../lib/api';
import { cn } from '../lib/utils';
import { getSavedStartupSound, playStartupSound, STARTUP_SOUND_OPTIONS, STARTUP_SOUND_STORAGE_KEY, type StartupSoundId } from '../lib/startupSound';
import { auth } from '../lib/authStorageClient';
import { getThresholdSettings, saveThresholdSettings } from '../lib/settingsApi';
import { getSchedulerStatus, type SchedulerStatusResponse } from '../lib/schedulerApi';

import { useTheme, THEME_COLORS } from '../contexts/ThemeContext';

const MATERIAL_WEEKLY_SPIKE_THRESHOLD_STORAGE_KEY = 'material_weekly_spike_threshold_pct';
const MATERIAL_WEEKLY_SPIKE_THRESHOLD_AUDIT_STORAGE_KEY = 'material_weekly_spike_threshold_audit_v1';
const PHYSICAL_FINANCIAL_DEVIATION_THRESHOLD_STORAGE_KEY = 'physical_financial_deviation_threshold_pct';
const MODULE_LAYOUT_PROFILE_STORAGE_KEY = 'module_layout_profile_v1';
const MODULE_SUBMODULE_LAYOUT_PROFILE_STORAGE_KEY = 'module_submodule_layout_profile_v1';

type MaterialThresholdAuditEntry = {
  value: number;
  changedAt: string;
  changedBy: string;
};

type RoleThemePreset = {
  id: string;
  label: string;
  description: string;
  themeId: string;
};

type ModuleLayoutProfile = 'compact' | 'balanced' | 'airy';
type ModuleLayoutMap = {
  dashboard: ModuleLayoutProfile;
  projects: ModuleLayoutProfile;
  financials: ModuleLayoutProfile;
};

type SubmoduleLayoutMap = {
  clients: ModuleLayoutProfile;
  purchaseOrders: ModuleLayoutProfile;
};

const ROLE_THEME_PRESETS: RoleThemePreset[] = [
  {
    id: 'executive',
    label: 'Direccion / Gerencia',
    description: 'Visual sobria para juntas, reportes y lectura ejecutiva.',
    themeId: 'graphite',
  },
  {
    id: 'operations',
    label: 'Operaciones de Obra',
    description: 'Contraste alto para seguimiento de campo y captura rapida.',
    themeId: 'steel',
  },
  {
    id: 'finance',
    label: 'Finanzas y Control',
    description: 'Jerarquia clara para tablas, cifras y validacion contable.',
    themeId: 'cobalt',
  },
];

const DEFAULT_MODULE_LAYOUTS: ModuleLayoutMap = {
  dashboard: 'balanced',
  projects: 'airy',
  financials: 'compact',
};

const DEFAULT_SUBMODULE_LAYOUTS: SubmoduleLayoutMap = {
  clients: 'airy',
  purchaseOrders: 'compact',
};

const loadModuleLayouts = (): ModuleLayoutMap => {
  try {
    const raw = localStorage.getItem(MODULE_LAYOUT_PROFILE_STORAGE_KEY);
    if (!raw) return DEFAULT_MODULE_LAYOUTS;

    const parsed = JSON.parse(raw) as Partial<ModuleLayoutMap>;
    const allowed = new Set<ModuleLayoutProfile>(['compact', 'balanced', 'airy']);

    return {
      dashboard: allowed.has(parsed.dashboard as ModuleLayoutProfile) ? (parsed.dashboard as ModuleLayoutProfile) : DEFAULT_MODULE_LAYOUTS.dashboard,
      projects: allowed.has(parsed.projects as ModuleLayoutProfile) ? (parsed.projects as ModuleLayoutProfile) : DEFAULT_MODULE_LAYOUTS.projects,
      financials: allowed.has(parsed.financials as ModuleLayoutProfile) ? (parsed.financials as ModuleLayoutProfile) : DEFAULT_MODULE_LAYOUTS.financials,
    };
  } catch {
    return DEFAULT_MODULE_LAYOUTS;
  }
};

const loadSubmoduleLayouts = (): SubmoduleLayoutMap => {
  try {
    const raw = localStorage.getItem(MODULE_SUBMODULE_LAYOUT_PROFILE_STORAGE_KEY);
    if (!raw) return DEFAULT_SUBMODULE_LAYOUTS;

    const parsed = JSON.parse(raw) as Partial<SubmoduleLayoutMap>;
    const allowed = new Set<ModuleLayoutProfile>(['compact', 'balanced', 'airy']);

    return {
      clients: allowed.has(parsed.clients as ModuleLayoutProfile) ? (parsed.clients as ModuleLayoutProfile) : DEFAULT_SUBMODULE_LAYOUTS.clients,
      purchaseOrders: allowed.has(parsed.purchaseOrders as ModuleLayoutProfile) ? (parsed.purchaseOrders as ModuleLayoutProfile) : DEFAULT_SUBMODULE_LAYOUTS.purchaseOrders,
    };
  } catch {
    return DEFAULT_SUBMODULE_LAYOUTS;
  }
};

const loadThresholdAuditHistory = (): MaterialThresholdAuditEntry[] => {
  try {
    const raw = localStorage.getItem(MATERIAL_WEEKLY_SPIKE_THRESHOLD_AUDIT_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as MaterialThresholdAuditEntry[];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item) => item && Number.isFinite(Number(item.value)) && item.changedAt && item.changedBy)
      .sort((left, right) => new Date(right.changedAt).getTime() - new Date(left.changedAt).getTime())
      .slice(0, 12);
  } catch {
    return [];
  }
};

export default function Settings() {
  const { currentTheme, setTheme } = useTheme();
  const [selectedTheme, setSelectedTheme] = useState(currentTheme);
  const [companyName, setCompanyName] = useState('WM_M&S CONSTRUCTORA');
  const [currency, setCurrency] = useState('GTQ');
  const [clockFormat, setClockFormat] = useState<'12h' | '24h'>(() => {
    const saved = localStorage.getItem('clock-format');
    return saved === '12h' ? '12h' : '24h';
  });
  const [startupSound, setStartupSound] = useState<StartupSoundId>(() => getSavedStartupSound());
  const [taxRate, setTaxRate] = useState(12);
  const [materialSpikeThreshold, setMaterialSpikeThreshold] = useState<number>(() => {
    const saved = Number(localStorage.getItem(MATERIAL_WEEKLY_SPIKE_THRESHOLD_STORAGE_KEY) || 10);
    if (!Number.isFinite(saved)) return 10;
    return Math.max(3, Math.min(40, saved));
  });
  const [materialThresholdAuditHistory, setMaterialThresholdAuditHistory] = useState<MaterialThresholdAuditEntry[]>(() => loadThresholdAuditHistory());
  const [physicalFinancialDeviationThreshold, setPhysicalFinancialDeviationThreshold] = useState<number>(() => {
    const saved = Number(localStorage.getItem(PHYSICAL_FINANCIAL_DEVIATION_THRESHOLD_STORAGE_KEY) || 15);
    if (!Number.isFinite(saved)) return 15;
    return Math.max(5, Math.min(40, saved));
  });
  const [queuePending, setQueuePending] = useState(0);
  const [queueSyncing, setQueueSyncing] = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [schedulerSnapshot, setSchedulerSnapshot] = useState<SchedulerStatusResponse | null>(null);
  const [schedulerLoading, setSchedulerLoading] = useState(true);
  const [schedulerRefreshTick, setSchedulerRefreshTick] = useState(0);
  const [moduleLayouts, setModuleLayouts] = useState<ModuleLayoutMap>(() => loadModuleLayouts());
  const [submoduleLayouts, setSubmoduleLayouts] = useState<SubmoduleLayoutMap>(() => loadSubmoduleLayouts());

  useEffect(() => {
    const initial = getOfflineQueueStatus();
    setQueuePending(initial.pending);
    setQueueSyncing(initial.syncing);
    setLastSyncAt(initial.lastSyncAt);

    return onOfflineQueueStatusChange((status) => {
      setQueuePending(status.pending);
      setQueueSyncing(status.syncing);
      setLastSyncAt(status.lastSyncAt);
    });
  }, []);

  useEffect(() => {
    let isCancelled = false;

    (async () => {
      try {
        const remote = await getThresholdSettings();
        if (isCancelled) return;

        setMaterialSpikeThreshold(remote.materialWeeklySpikeThresholdPct);
        setPhysicalFinancialDeviationThreshold(remote.physicalFinancialDeviationThresholdPct);

        localStorage.setItem(MATERIAL_WEEKLY_SPIKE_THRESHOLD_STORAGE_KEY, String(remote.materialWeeklySpikeThresholdPct));
        localStorage.setItem(PHYSICAL_FINANCIAL_DEVIATION_THRESHOLD_STORAGE_KEY, String(remote.physicalFinancialDeviationThresholdPct));
      } catch {
        // Keep local values when API is unavailable.
      }
    })();

    return () => {
      isCancelled = true;
    };
  }, [schedulerRefreshTick]);

  const schedulerHealthStatus = (() => {
    if (schedulerLoading) return 'neutral';
    const scheduler = schedulerSnapshot?.scheduler;
    if (!scheduler?.enabled) return 'red';

    const nowMs = Date.now();
    const lastSuccessMs = scheduler.lastSuccessAt ? new Date(scheduler.lastSuccessAt).getTime() : 0;
    const hoursWithoutSuccess = lastSuccessMs > 0 ? (nowMs - lastSuccessMs) / (1000 * 60 * 60) : Infinity;

    if (hoursWithoutSuccess >= 8) return 'red';
    if (hoursWithoutSuccess >= 2) return 'yellow';

    const failures = Number(scheduler.failures || 0);
    const lastError = String(scheduler.lastError || '').trim();
    if (failures > 0 && lastError) return 'yellow';
    return 'green';
  })();

  const schedulerHealthClass =
    schedulerHealthStatus === 'green'
      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
      : schedulerHealthStatus === 'yellow'
        ? 'bg-amber-50 text-amber-700 border-amber-200'
        : schedulerHealthStatus === 'red'
          ? 'bg-rose-50 text-rose-700 border-rose-200'
          : 'bg-slate-50 text-slate-600 border-slate-200';

  const schedulerHealthMessage =
    schedulerHealthStatus === 'green'
      ? 'Operación normal'
      : schedulerHealthStatus === 'yellow'
        ? 'Atención: corrida atrasada o fallo reciente'
        : schedulerHealthStatus === 'red'
          ? 'Crítico: scheduler inactivo o sin ejecución exitosa >= 8h'
          : 'Consultando estado...';

  const schedulerLastRunAgo = (() => {
    const iso = schedulerSnapshot?.scheduler?.lastRunAt;
    if (!iso) return 'Sin registros';

    const diffMs = Date.now() - new Date(iso).getTime();
    if (!Number.isFinite(diffMs) || diffMs < 0) return 'N/A';

    const minutes = Math.floor(diffMs / (1000 * 60));
    if (minutes < 1) return 'hace instantes';
    if (minutes < 60) return `hace ${minutes} min`;

    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `hace ${hours} h`;

    const days = Math.floor(hours / 24);
    return `hace ${days} d`;
  })();

  useEffect(() => {
    let isCancelled = false;

    const refreshSchedulerStatus = async () => {
      try {
        const snapshot = await getSchedulerStatus();
        if (isCancelled) return;
        setSchedulerSnapshot(snapshot);
      } catch {
        if (isCancelled) return;
        setSchedulerSnapshot({
          status: 'error',
          scheduler: {
            enabled: false,
            reason: 'status-unavailable',
          },
        });
      } finally {
        if (!isCancelled) {
          setSchedulerLoading(false);
        }
      }
    };

    void refreshSchedulerStatus();
    const interval = window.setInterval(() => {
      void refreshSchedulerStatus();
    }, 60 * 1000);

    return () => {
      isCancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  const handleRetrySync = async () => {
    await retryOfflineSync();
    const refreshed = getOfflineQueueStatus();
    setQueuePending(refreshed.pending);
    setQueueSyncing(refreshed.syncing);
    setLastSyncAt(refreshed.lastSyncAt);
    toast.success('Sincronizacion manual ejecutada');
  };

  const handleSaveSettings = async () => {
    const previousThreshold = Number(localStorage.getItem(MATERIAL_WEEKLY_SPIKE_THRESHOLD_STORAGE_KEY) || 10);
    const normalizedPreviousThreshold = Number.isFinite(previousThreshold)
      ? Math.max(3, Math.min(40, previousThreshold))
      : 10;

    setTheme(selectedTheme);
    localStorage.setItem('clock-format', clockFormat);
    localStorage.setItem(STARTUP_SOUND_STORAGE_KEY, startupSound);
    localStorage.setItem(MATERIAL_WEEKLY_SPIKE_THRESHOLD_STORAGE_KEY, String(materialSpikeThreshold));
    localStorage.setItem(PHYSICAL_FINANCIAL_DEVIATION_THRESHOLD_STORAGE_KEY, String(physicalFinancialDeviationThreshold));
    localStorage.setItem(MODULE_LAYOUT_PROFILE_STORAGE_KEY, JSON.stringify(moduleLayouts));
    localStorage.setItem(MODULE_SUBMODULE_LAYOUT_PROFILE_STORAGE_KEY, JSON.stringify(submoduleLayouts));

    try {
      await saveThresholdSettings({
        materialWeeklySpikeThresholdPct: materialSpikeThreshold,
        physicalFinancialDeviationThresholdPct: physicalFinancialDeviationThreshold,
      });
    } catch {
      // Keep working with local persistence if backend settings are not available.
    }

    if (normalizedPreviousThreshold !== materialSpikeThreshold) {
      const user = auth.currentUser;
      const changedBy = user?.email || user?.displayName || 'usuario.local@wmms';
      const entry: MaterialThresholdAuditEntry = {
        value: materialSpikeThreshold,
        changedAt: new Date().toISOString(),
        changedBy,
      };

      const nextHistory = [entry, ...materialThresholdAuditHistory]
        .sort((left, right) => new Date(right.changedAt).getTime() - new Date(left.changedAt).getTime())
        .slice(0, 12);
      localStorage.setItem(MATERIAL_WEEKLY_SPIKE_THRESHOLD_AUDIT_STORAGE_KEY, JSON.stringify(nextHistory));
      setMaterialThresholdAuditHistory(nextHistory);
    }

    window.dispatchEvent(new Event('CLOCK_FORMAT_CHANGED'));
    window.dispatchEvent(new Event('MATERIAL_ALERT_THRESHOLD_CHANGED'));
    window.dispatchEvent(new Event('PHYSICAL_FINANCIAL_DEVIATION_THRESHOLD_CHANGED'));
    window.dispatchEvent(new Event('MODULE_LAYOUT_PROFILE_CHANGED'));
    await logAction('Actualizar Configuración', 'Configuración', 'Se actualizó la configuración general del sistema', 'update');
    toast.success('Configuración guardada con éxito');
  };

  const handlePreviewSound = async (soundId: StartupSoundId) => {
    if (soundId === 'none') {
      toast.info('Esta opción no reproduce audio.');
      return;
    }

    const played = await playStartupSound(soundId);
    if (!played) {
      toast.error('No se pudo reproducir el sonido en este momento.');
    }
  };

  const handleApplyRolePreset = (preset: RoleThemePreset) => {
    const theme = THEME_COLORS.find((item) => item.id === preset.themeId);
    if (!theme) return;
    setSelectedTheme(theme);
    toast.success(`Perfil aplicado: ${preset.label}`);
  };

  return (
    <div className="space-y-4 sm:space-y-5">
      <header>
        <h1 className="text-xl sm:text-3xl font-bold text-slate-900 dark:text-white">Configuración</h1>
        <p className="text-[10px] sm:text-sm text-slate-500 dark:text-slate-400">Personaliza tu experiencia en el ERP</p>
      </header>

      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800 overflow-hidden">
        <div className="p-4 sm:p-6 border-b border-slate-100 dark:border-slate-800 flex items-center gap-3">
          <div className="p-1.5 sm:p-2 bg-primary-light dark:bg-primary/20 text-primary rounded-lg">
            <Palette size={16} className="sm:w-5 sm:h-5" />
          </div>
          <h2 className="text-sm sm:text-xl font-bold text-slate-900 dark:text-white">Tema Visual</h2>
        </div>

        <div className="p-4 sm:p-5 space-y-4 sm:space-y-5">
          <div className="rounded-2xl border border-slate-200/70 dark:border-slate-700/70 bg-slate-50/70 dark:bg-slate-800/40 p-4 sm:p-5">
            <p className="text-[10px] sm:text-xs uppercase tracking-[0.18em] font-black text-slate-500 dark:text-slate-400">Vista previa activa</p>
            <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3 text-[11px] sm:text-xs">
              <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-3">
                <p className="text-slate-400 dark:text-slate-500 uppercase font-black tracking-wider text-[9px]">Tarjetas</p>
                <p className="text-slate-800 dark:text-slate-100 font-semibold mt-1">{selectedTheme.cardEffect}</p>
              </div>
              <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-3">
                <p className="text-slate-400 dark:text-slate-500 uppercase font-black tracking-wider text-[9px]">Tablas</p>
                <p className="text-slate-800 dark:text-slate-100 font-semibold mt-1">{selectedTheme.tableStyle}</p>
              </div>
              <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-3">
                <p className="text-slate-400 dark:text-slate-500 uppercase font-black tracking-wider text-[9px]">Formularios</p>
                <p className="text-slate-800 dark:text-slate-100 font-semibold mt-1">{selectedTheme.formStyle}</p>
              </div>
              <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-3">
                <p className="text-slate-400 dark:text-slate-500 uppercase font-black tracking-wider text-[9px]">Iconografía</p>
                <p className="text-slate-800 dark:text-slate-100 font-semibold mt-1">{selectedTheme.iconStyle}</p>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200/70 dark:border-slate-700/70 bg-white/90 dark:bg-slate-900/40 p-4 sm:p-5">
            <p className="text-[10px] sm:text-xs uppercase tracking-[0.18em] font-black text-slate-500 dark:text-slate-400">Perfiles Profesionales</p>
            <div className="mt-3 grid grid-cols-1 lg:grid-cols-3 gap-2.5 sm:gap-3">
              {ROLE_THEME_PRESETS.map((preset) => {
                const isActive = selectedTheme.id === preset.themeId;
                const iconWrapClass = preset.id === 'finance'
                  ? 'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300'
                  : preset.id === 'operations'
                    ? 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300'
                    : 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200';

                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => handleApplyRolePreset(preset)}
                    className={cn(
                      'text-left rounded-xl border px-3 py-3 transition-all',
                      isActive
                        ? 'border-primary bg-primary-light/30 dark:bg-primary/10'
                        : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 bg-slate-50/70 dark:bg-slate-800/40'
                    )}
                  >
                    <div className="flex items-start gap-2.5">
                      <div className={cn('mt-0.5 p-1.5 rounded-lg', iconWrapClass)}>
                        {preset.id === 'finance' ? (
                          <DollarSign size={14} />
                        ) : preset.id === 'operations' ? (
                          <SettingsIcon size={14} />
                        ) : (
                          <Building2 size={14} />
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="text-[11px] sm:text-xs font-black uppercase tracking-wide text-slate-900 dark:text-white">{preset.label}</p>
                        <p className="text-[10px] sm:text-[11px] text-slate-600 dark:text-slate-300 mt-1 leading-relaxed">{preset.description}</p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200/70 dark:border-slate-700/70 bg-white/90 dark:bg-slate-900/40 p-4 sm:p-5">
            <p className="text-[10px] sm:text-xs uppercase tracking-[0.18em] font-black text-slate-500 dark:text-slate-400">Perfiles por Modulo</p>
            <p className="mt-1 text-[10px] sm:text-xs text-slate-500 dark:text-slate-400">Define densidad visual por area: compacto, balanceado o aireado.</p>
            <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/40 p-3">
                <p className="text-[10px] font-black uppercase tracking-wide text-slate-700 dark:text-slate-200">Dashboard</p>
                <select
                  value={moduleLayouts.dashboard}
                  onChange={(event) => setModuleLayouts((prev) => ({ ...prev, dashboard: event.target.value as ModuleLayoutProfile }))}
                  className="mt-2 w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-xs text-slate-700 dark:text-slate-200"
                >
                  <option value="compact">Compacto</option>
                  <option value="balanced">Balanceado</option>
                  <option value="airy">Aireado</option>
                </select>
              </div>

              <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/40 p-3">
                <p className="text-[10px] font-black uppercase tracking-wide text-slate-700 dark:text-slate-200">Proyectos</p>
                <select
                  value={moduleLayouts.projects}
                  onChange={(event) => setModuleLayouts((prev) => ({ ...prev, projects: event.target.value as ModuleLayoutProfile }))}
                  className="mt-2 w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-xs text-slate-700 dark:text-slate-200"
                >
                  <option value="compact">Compacto</option>
                  <option value="balanced">Balanceado</option>
                  <option value="airy">Aireado</option>
                </select>
              </div>

              <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/40 p-3">
                <p className="text-[10px] font-black uppercase tracking-wide text-slate-700 dark:text-slate-200">Finanzas</p>
                <select
                  value={moduleLayouts.financials}
                  onChange={(event) => setModuleLayouts((prev) => ({ ...prev, financials: event.target.value as ModuleLayoutProfile }))}
                  className="mt-2 w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-xs text-slate-700 dark:text-slate-200"
                >
                  <option value="compact">Compacto</option>
                  <option value="balanced">Balanceado</option>
                  <option value="airy">Aireado</option>
                </select>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200/70 dark:border-slate-700/70 bg-white/90 dark:bg-slate-900/40 p-4 sm:p-5">
            <p className="text-[10px] sm:text-xs uppercase tracking-[0.18em] font-black text-slate-500 dark:text-slate-400">Perfiles por Submodulo</p>
            <p className="mt-1 text-[10px] sm:text-xs text-slate-500 dark:text-slate-400">Estos perfiles tienen prioridad sobre el perfil general del modulo.</p>
            <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/40 p-3">
                <p className="text-[10px] font-black uppercase tracking-wide text-slate-700 dark:text-slate-200">Clientes</p>
                <select
                  value={submoduleLayouts.clients}
                  onChange={(event) => setSubmoduleLayouts((prev) => ({ ...prev, clients: event.target.value as ModuleLayoutProfile }))}
                  className="mt-2 w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-xs text-slate-700 dark:text-slate-200"
                >
                  <option value="compact">Compacto</option>
                  <option value="balanced">Balanceado</option>
                  <option value="airy">Aireado</option>
                </select>
              </div>

              <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/40 p-3">
                <p className="text-[10px] font-black uppercase tracking-wide text-slate-700 dark:text-slate-200">Compras</p>
                <select
                  value={submoduleLayouts.purchaseOrders}
                  onChange={(event) => setSubmoduleLayouts((prev) => ({ ...prev, purchaseOrders: event.target.value as ModuleLayoutProfile }))}
                  className="mt-2 w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-xs text-slate-700 dark:text-slate-200"
                >
                  <option value="compact">Compacto</option>
                  <option value="balanced">Balanceado</option>
                  <option value="airy">Aireado</option>
                </select>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
            {THEME_COLORS.map((theme) => (
              <button
                key={theme.id}
                onClick={() => setSelectedTheme(theme)}
                className={`flex items-center justify-between p-3 sm:p-4 rounded-xl sm:rounded-2xl border-2 transition-all ${
                  selectedTheme.name === theme.name
                    ? 'border-primary bg-primary-light/30 dark:bg-primary/10'
                    : 'border-slate-100 dark:border-slate-800 hover:border-slate-200 dark:hover:border-slate-700 bg-slate-50 dark:bg-slate-800/50'
                }`}
              >
                <div className="flex items-center gap-2 sm:gap-3 text-left min-w-0">
                  <div 
                    className="w-6 h-6 sm:w-8 sm:h-8 rounded-full shadow-sm" 
                    style={{ backgroundColor: theme.color }}
                  />
                  <div className="min-w-0">
                    <p className={`text-xs sm:text-sm font-bold truncate ${selectedTheme.name === theme.name ? 'text-primary' : 'text-slate-700 dark:text-slate-300'}`}>
                      {theme.name}
                    </p>
                    <p className="text-[10px] sm:text-[11px] text-slate-500 dark:text-slate-400 truncate">
                      {theme.headingFont.split(',')[0]} + {theme.fontFamily.split(',')[0]}
                    </p>
                  </div>
                </div>
                {selectedTheme.name === theme.name && (
                  <Check className="text-primary sm:w-5 sm:h-5" size={16} />
                )}
              </button>
            ))}
          </div>

          <div className="rounded-2xl border border-slate-200/70 dark:border-slate-700/70 bg-slate-50/70 dark:bg-slate-800/40 p-4 sm:p-5">
            <div className="flex items-center gap-2 mb-3">
              <Volume2 size={16} className="text-violet-600" />
              <p className="text-[10px] sm:text-xs uppercase tracking-[0.18em] font-black text-slate-500 dark:text-slate-400">Catálogo Sonido de Inicio</p>
            </div>
            <div className="space-y-3">
              {STARTUP_SOUND_OPTIONS.map((sound) => (
                <div
                  key={sound.id}
                  className={cn(
                    'rounded-xl border p-3 sm:p-4 flex items-center justify-between gap-3 transition-colors',
                    startupSound === sound.id
                      ? 'border-primary bg-primary-light/20 dark:bg-primary/10'
                      : 'border-slate-200 dark:border-slate-700 bg-white/90 dark:bg-slate-900/40',
                  )}
                >
                  <button
                    type="button"
                    onClick={() => setStartupSound(sound.id)}
                    className="flex-1 text-left"
                  >
                    <p className="text-xs sm:text-sm font-black text-slate-900 dark:text-white uppercase tracking-wide">{sound.label}</p>
                    <p className="text-[10px] sm:text-xs text-slate-500 dark:text-slate-400 mt-1">{sound.description}</p>
                  </button>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handlePreviewSound(sound.id)}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-[10px] sm:text-xs font-black uppercase tracking-wider bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 hover:opacity-90 transition-opacity"
                    >
                      <Play size={12} />
                      Probar
                    </button>
                    {startupSound === sound.id && <Check size={16} className="text-primary" />}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="pt-4 sm:pt-6 border-t border-slate-100 dark:border-slate-800 flex justify-end">
            <button
              onClick={handleSaveSettings}
              className="w-full sm:w-auto flex items-center justify-center gap-2 bg-primary text-white font-bold py-2.5 sm:py-3 px-6 sm:px-8 rounded-xl hover:bg-primary-hover transition-all shadow-lg shadow-primary-shadow text-xs sm:text-sm"
            >
              <Save size={16} className="sm:w-5 sm:h-5" />
              Guardar Cambios
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-5">
        <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800 overflow-hidden">
          <div className="p-4 sm:p-6 border-b border-slate-100 dark:border-slate-800 flex items-center gap-3">
            <div className="p-1.5 sm:p-2 bg-blue-50 dark:bg-blue-500/10 text-blue-500 rounded-lg">
              <Building2 size={16} className="sm:w-5 sm:h-5" />
            </div>
            <h2 className="text-sm sm:text-xl font-bold text-slate-900 dark:text-white">Perfil de Empresa</h2>
          </div>
          <div className="p-4 sm:p-5 space-y-3 sm:space-y-4">
            <div className="space-y-1.5 sm:space-y-2">
              <label className="text-[9px] sm:text-[10px] font-black uppercase tracking-widest text-slate-400">Nombre de la Empresa</label>
              <input 
                type="text" 
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                className="w-full px-3 sm:px-4 py-2 sm:py-3 bg-slate-50 dark:bg-slate-800 border-none rounded-xl text-xs sm:text-sm focus:ring-2 focus:ring-primary/20 transition-all"
              />
            </div>
            <div className="space-y-1.5 sm:space-y-2">
              <label className="text-[9px] sm:text-[10px] font-black uppercase tracking-widest text-slate-400">NIT / Registro Fiscal</label>
              <input 
                type="text" 
                placeholder="1234567-8"
                className="w-full px-3 sm:px-4 py-2 sm:py-3 bg-slate-50 dark:bg-slate-800 border-none rounded-xl text-xs sm:text-sm focus:ring-2 focus:ring-primary/20 transition-all"
              />
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800 overflow-hidden">
          <div className="p-4 sm:p-6 border-b border-slate-100 dark:border-slate-800 flex items-center gap-3">
            <div className="p-1.5 sm:p-2 bg-amber-50 dark:bg-amber-500/10 text-amber-500 rounded-lg">
              <Globe size={16} className="sm:w-5 sm:h-5" />
            </div>
            <h2 className="text-sm sm:text-xl font-bold text-slate-900 dark:text-white">Localización</h2>
          </div>
          <div className="p-4 sm:p-5 space-y-3 sm:space-y-4">
            <div className="grid grid-cols-2 gap-3 sm:gap-4">
              <div className="space-y-1.5 sm:space-y-2">
                <label className="text-[9px] sm:text-[10px] font-black uppercase tracking-widest text-slate-400">Moneda Base</label>
                <select 
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  className="w-full px-3 sm:px-4 py-2 sm:py-3 bg-slate-50 dark:bg-slate-800 border-none rounded-xl text-xs sm:text-sm focus:ring-2 focus:ring-primary/20 transition-all"
                >
                  <option value="GTQ">Quetzal (GTQ)</option>
                  <option value="USD">Dólar (USD)</option>
                  <option value="EUR">Euro (EUR)</option>
                  <option value="MXN">Peso (MXN)</option>
                </select>
              </div>
              <div className="space-y-1.5 sm:space-y-2">
                <label className="text-[9px] sm:text-[10px] font-black uppercase tracking-widest text-slate-400">Impuesto (%)</label>
                <input 
                  type="number" 
                  value={taxRate}
                  onChange={(e) => setTaxRate(Number(e.target.value))}
                  className="w-full px-3 sm:px-4 py-2 sm:py-3 bg-slate-50 dark:bg-slate-800 border-none rounded-xl text-xs sm:text-sm focus:ring-2 focus:ring-primary/20 transition-all"
                />
              </div>
            </div>
            <div className="space-y-1.5 sm:space-y-2">
              <label className="text-[9px] sm:text-[10px] font-black uppercase tracking-widest text-slate-400">Formato de Hora</label>
              <select
                value={clockFormat}
                onChange={(e) => setClockFormat(e.target.value === '12h' ? '12h' : '24h')}
                className="w-full px-3 sm:px-4 py-2 sm:py-3 bg-slate-50 dark:bg-slate-800 border-none rounded-xl text-xs sm:text-sm focus:ring-2 focus:ring-primary/20 transition-all"
              >
                <option value="24h">24 horas (14:30)</option>
                <option value="12h">12 horas (2:30 PM)</option>
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-[9px] sm:text-[10px] font-black uppercase tracking-widest text-slate-400">
                Umbral alerta precio material (semanal)
              </label>
              <div className="rounded-xl bg-slate-50 dark:bg-slate-800 px-3 py-3">
                <input
                  type="range"
                  min={3}
                  max={40}
                  step={1}
                  value={materialSpikeThreshold}
                  onChange={(e) => setMaterialSpikeThreshold(Number(e.target.value))}
                  className="w-full accent-primary"
                />
                <p className="text-xs font-bold text-slate-700 dark:text-slate-200 mt-2">
                  {materialSpikeThreshold}%
                </p>
                <p className="text-[10px] text-slate-500 mt-1">
                  Historial: cambios de umbral, fecha y responsable.
                </p>
                {materialThresholdAuditHistory.length > 0 && (
                  <div className="mt-2 space-y-1.5">
                    {materialThresholdAuditHistory.slice(0, 6).map((entry, index) => (
                      <div key={`${entry.changedAt}_${index}`} className="rounded-lg border border-slate-200 dark:border-slate-700 px-2 py-1.5 bg-white dark:bg-slate-900/40">
                        <p className="text-[10px] font-bold text-slate-700 dark:text-slate-200">
                          {entry.value}% • {new Date(entry.changedAt).toLocaleString('es-GT', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                        </p>
                        <p className="text-[10px] text-slate-500 break-all">{entry.changedBy}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[9px] sm:text-[10px] font-black uppercase tracking-widest text-slate-400">
                Umbral desviación físico-financiera
              </label>
              <div className="rounded-xl bg-slate-50 dark:bg-slate-800 px-3 py-3">
                <input
                  type="range"
                  min={5}
                  max={40}
                  step={1}
                  value={physicalFinancialDeviationThreshold}
                  onChange={(e) => setPhysicalFinancialDeviationThreshold(Number(e.target.value))}
                  className="w-full accent-primary"
                />
                <p className="text-xs font-bold text-slate-700 dark:text-slate-200 mt-2">
                  {physicalFinancialDeviationThreshold}%
                </p>
                <p className="text-[10px] text-slate-500 mt-1">
                  Se usa para alertas cuando gasto financiero supera el avance físico en ejecución.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800 p-4 sm:p-5">
        <div className="flex items-center gap-3 mb-4 sm:mb-6">
          <div className="p-1.5 sm:p-2 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded-lg">
            <SettingsIcon size={16} className="sm:w-5 sm:h-5" />
          </div>
          <h2 className="text-sm sm:text-xl font-bold text-slate-900 dark:text-white">Información del Sistema</h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 text-[10px] sm:text-sm">
          <div className="space-y-0.5 sm:space-y-1">
            <p className="text-slate-400 dark:text-slate-500 font-bold uppercase tracking-wider text-[8px] sm:text-[10px]">Versión</p>
            <p className="text-slate-900 dark:text-white font-medium">v2.4.0-stable</p>
          </div>
          <div className="space-y-0.5 sm:space-y-1">
            <p className="text-slate-400 dark:text-slate-500 font-bold uppercase tracking-wider text-[8px] sm:text-[10px]">Entorno</p>
            <p className="text-slate-900 dark:text-white font-medium break-words">Producción (Vite + Node/Express)</p>
          </div>
          <div className="space-y-0.5 sm:space-y-1">
            <p className="text-slate-400 dark:text-slate-500 font-bold uppercase tracking-wider text-[8px] sm:text-[10px]">Base de Datos</p>
            <p className="text-slate-900 dark:text-white font-medium">PostgreSQL</p>
          </div>
          <div className="space-y-0.5 sm:space-y-1">
            <p className="text-slate-400 dark:text-slate-500 font-bold uppercase tracking-wider text-[8px] sm:text-[10px]">Última Sincronización</p>
            <p className="text-slate-900 dark:text-white font-medium break-words">{new Date().toLocaleString()}</p>
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800 p-4 sm:p-5">
        <div className="flex items-center gap-3 mb-4 sm:mb-6">
          <div className="p-1.5 sm:p-2 bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 rounded-lg">
            <SettingsIcon size={16} className="sm:w-5 sm:h-5" />
          </div>
          <h2 className="text-sm sm:text-xl font-bold text-slate-900 dark:text-white">Salud del Scheduler</h2>
          <span className={cn('ml-auto px-2.5 py-1 rounded-full border text-[10px] font-black uppercase tracking-wider', schedulerHealthClass)}>
            {schedulerHealthStatus === 'green' ? 'verde' : schedulerHealthStatus === 'yellow' ? 'amarillo' : schedulerHealthStatus === 'red' ? 'rojo' : 'cargando'}
          </span>
        </div>
        <p className="text-[11px] text-slate-500 mb-4">{schedulerHealthMessage}</p>

        {schedulerLoading ? (
          <p className="text-xs text-slate-500">Cargando estado del scheduler...</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            <div className="rounded-xl bg-slate-50 dark:bg-slate-800/60 p-3 sm:p-4">
              <p className="text-[9px] sm:text-[10px] font-black uppercase tracking-widest text-slate-400">Estado</p>
              <p className="text-sm sm:text-base font-bold text-slate-900 dark:text-white mt-1">
                {schedulerSnapshot?.scheduler?.enabled ? 'Activo' : 'Inactivo'}
              </p>
              <p className="text-[10px] text-slate-500 mt-1">{schedulerSnapshot?.scheduler?.reason || 'operativo'}</p>
            </div>

            <div className="rounded-xl bg-slate-50 dark:bg-slate-800/60 p-3 sm:p-4">
              <p className="text-[9px] sm:text-[10px] font-black uppercase tracking-widest text-slate-400">Corridas / Alertas</p>
              <p className="text-sm sm:text-base font-bold text-slate-900 dark:text-white mt-1">
                {(schedulerSnapshot?.scheduler?.runs ?? 0)} / {(schedulerSnapshot?.scheduler?.alertsGenerated ?? 0)}
              </p>
              <p className="text-[10px] text-slate-500 mt-1">saltos dedupe: {schedulerSnapshot?.scheduler?.dedupedSkips ?? 0}</p>
            </div>

            <div className="rounded-xl bg-slate-50 dark:bg-slate-800/60 p-3 sm:p-4">
              <p className="text-[9px] sm:text-[10px] font-black uppercase tracking-widest text-slate-400">Última Ejecución</p>
              <p className="text-sm sm:text-base font-bold text-slate-900 dark:text-white mt-1 break-words">
                {schedulerSnapshot?.scheduler?.lastRunAt
                  ? new Date(schedulerSnapshot.scheduler.lastRunAt).toLocaleString()
                  : 'Sin registros'}
              </p>
              <p className="text-[10px] text-slate-500 mt-1">{schedulerLastRunAgo} • slot: {schedulerSnapshot?.scheduler?.lastSlot || 'N/A'}</p>
            </div>

            <div className="rounded-xl bg-slate-50 dark:bg-slate-800/60 p-3 sm:p-4">
              <p className="text-[9px] sm:text-[10px] font-black uppercase tracking-widest text-slate-400">Fallos</p>
              <p className="text-sm sm:text-base font-bold text-slate-900 dark:text-white mt-1">{schedulerSnapshot?.scheduler?.failures ?? 0}</p>
              <p className="text-[10px] text-slate-500 mt-1 break-words">{schedulerSnapshot?.scheduler?.lastError || 'Sin errores recientes'}</p>
            </div>
          </div>
        )}

        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={() => setSchedulerRefreshTick((tick) => tick + 1)}
            className="w-full sm:w-auto flex items-center justify-center gap-2 bg-indigo-600 text-white font-bold py-2.5 sm:py-3 px-6 sm:px-8 rounded-xl hover:bg-indigo-700 transition-all text-xs sm:text-sm"
          >
            Refrescar ahora
          </button>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800 p-4 sm:p-5">
        <div className="flex items-center gap-3 mb-4 sm:mb-6">
          <div className="p-1.5 sm:p-2 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 rounded-lg">
            <Save size={16} className="sm:w-5 sm:h-5" />
          </div>
          <h2 className="text-sm sm:text-xl font-bold text-slate-900 dark:text-white">Diagnóstico de Sincronización</h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 mb-4 sm:mb-5">
          <div className="rounded-xl bg-slate-50 dark:bg-slate-800/60 p-3 sm:p-4">
            <p className="text-[9px] sm:text-[10px] font-black uppercase tracking-widest text-slate-400">Pendientes en Cola</p>
            <p className="text-lg sm:text-2xl font-bold text-slate-900 dark:text-white mt-1">{queuePending}</p>
          </div>
          <div className="rounded-xl bg-slate-50 dark:bg-slate-800/60 p-3 sm:p-4">
            <p className="text-[9px] sm:text-[10px] font-black uppercase tracking-widest text-slate-400">Estado Sync</p>
            <p className="text-sm sm:text-base font-bold text-slate-900 dark:text-white mt-1">
              {queueSyncing ? 'Sincronizando...' : 'En espera'}
            </p>
          </div>
          <div className="rounded-xl bg-slate-50 dark:bg-slate-800/60 p-3 sm:p-4">
            <p className="text-[9px] sm:text-[10px] font-black uppercase tracking-widest text-slate-400">Último Sync Real</p>
            <p className="text-sm sm:text-base font-bold text-slate-900 dark:text-white mt-1 break-words">
              {lastSyncAt ? new Date(lastSyncAt).toLocaleString() : 'Sin registros'}
            </p>
          </div>
        </div>

        <div className="flex justify-end">
          <button
            type="button"
            onClick={handleRetrySync}
            disabled={queueSyncing}
            className="w-full sm:w-auto flex items-center justify-center gap-2 bg-emerald-600 text-white font-bold py-2.5 sm:py-3 px-6 sm:px-8 rounded-xl hover:bg-emerald-700 disabled:opacity-60 disabled:cursor-not-allowed transition-all text-xs sm:text-sm"
          >
            Reintentar Sincronización
          </button>
        </div>
      </div>
    </div>
  );
}
