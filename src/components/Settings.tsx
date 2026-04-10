import React, { useState, useEffect } from 'react';
import { Settings as SettingsIcon, Palette, Check, Save, Building2, Globe, DollarSign } from 'lucide-react';
import { motion } from 'motion/react';
import { toast } from 'sonner';
import { logAction } from '../lib/audit';
import { getOfflineQueueStatus, onOfflineQueueStatusChange, retryOfflineSync } from '../lib/api';

import { useTheme, THEME_COLORS } from '../contexts/ThemeContext';

export default function Settings() {
  const { currentTheme, setTheme } = useTheme();
  const [selectedTheme, setSelectedTheme] = useState(currentTheme);
  const [companyName, setCompanyName] = useState('WM_M&S CONSTRUCTORA');
  const [currency, setCurrency] = useState('GTQ');
  const [taxRate, setTaxRate] = useState(12);
  const [queuePending, setQueuePending] = useState(0);
  const [queueSyncing, setQueueSyncing] = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);

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

  const handleRetrySync = async () => {
    await retryOfflineSync();
    const refreshed = getOfflineQueueStatus();
    setQueuePending(refreshed.pending);
    setQueueSyncing(refreshed.syncing);
    setLastSyncAt(refreshed.lastSyncAt);
    toast.success('Sincronizacion manual ejecutada');
  };

  const handleSaveSettings = async () => {
    setTheme(selectedTheme);
    await logAction('Actualizar Configuración', 'Configuración', 'Se actualizó la configuración general del sistema', 'update');
    toast.success('Configuración guardada con éxito');
  };

  return (
    <div className="space-y-4 sm:space-y-8">
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

        <div className="p-4 sm:p-8 space-y-4 sm:space-y-8">
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

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-6">
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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-8">
        <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800 overflow-hidden">
          <div className="p-4 sm:p-6 border-b border-slate-100 dark:border-slate-800 flex items-center gap-3">
            <div className="p-1.5 sm:p-2 bg-blue-50 dark:bg-blue-500/10 text-blue-500 rounded-lg">
              <Building2 size={16} className="sm:w-5 sm:h-5" />
            </div>
            <h2 className="text-sm sm:text-xl font-bold text-slate-900 dark:text-white">Perfil de Empresa</h2>
          </div>
          <div className="p-4 sm:p-8 space-y-4 sm:space-y-6">
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
          <div className="p-4 sm:p-8 space-y-4 sm:space-y-6">
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
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800 p-4 sm:p-8">
        <div className="flex items-center gap-3 mb-4 sm:mb-6">
          <div className="p-1.5 sm:p-2 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded-lg">
            <SettingsIcon size={16} className="sm:w-5 sm:h-5" />
          </div>
          <h2 className="text-sm sm:text-xl font-bold text-slate-900 dark:text-white">Información del Sistema</h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-8 text-[10px] sm:text-sm">
          <div className="space-y-0.5 sm:space-y-1">
            <p className="text-slate-400 dark:text-slate-500 font-bold uppercase tracking-wider text-[8px] sm:text-[10px]">Versión</p>
            <p className="text-slate-900 dark:text-white font-medium">v2.4.0-stable</p>
          </div>
          <div className="space-y-0.5 sm:space-y-1">
            <p className="text-slate-400 dark:text-slate-500 font-bold uppercase tracking-wider text-[8px] sm:text-[10px]">Entorno</p>
            <p className="text-slate-900 dark:text-white font-medium truncate">Producción (Vite + Node/Express)</p>
          </div>
          <div className="space-y-0.5 sm:space-y-1">
            <p className="text-slate-400 dark:text-slate-500 font-bold uppercase tracking-wider text-[8px] sm:text-[10px]">Base de Datos</p>
            <p className="text-slate-900 dark:text-white font-medium">PostgreSQL</p>
          </div>
          <div className="space-y-0.5 sm:space-y-1">
            <p className="text-slate-400 dark:text-slate-500 font-bold uppercase tracking-wider text-[8px] sm:text-[10px]">Última Sincronización</p>
            <p className="text-slate-900 dark:text-white font-medium truncate">{new Date().toLocaleString()}</p>
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800 p-4 sm:p-8">
        <div className="flex items-center gap-3 mb-4 sm:mb-6">
          <div className="p-1.5 sm:p-2 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 rounded-lg">
            <Save size={16} className="sm:w-5 sm:h-5" />
          </div>
          <h2 className="text-sm sm:text-xl font-bold text-slate-900 dark:text-white">Diagnóstico de Sincronización</h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6 mb-4 sm:mb-6">
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
            <p className="text-sm sm:text-base font-bold text-slate-900 dark:text-white mt-1 truncate">
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
