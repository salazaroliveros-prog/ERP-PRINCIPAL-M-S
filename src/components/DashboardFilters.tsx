import React from 'react';
import { format as formatDateFns } from 'date-fns';

interface DashboardFiltersProps {
  startDate: Date | null;
  setStartDate: (date: Date | null) => void;
  endDate: Date | null;
  setEndDate: (date: Date | null) => void;
  cardStyle: 'default' | '3d-tilt' | 'glassmorphism';
  setCardStyle: (style: 'default' | '3d-tilt' | 'glassmorphism') => void;
}

export const DashboardFilters = ({ startDate, setStartDate, endDate, setEndDate, cardStyle, setCardStyle }: DashboardFiltersProps) => (
  <div className="flex items-center gap-6 flex-wrap">
    <div className="flex items-center gap-2">
      <label htmlFor="card-style-select" className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Estilo Tarjetas</label>
      <select
        id="card-style-select"
        value={cardStyle}
        onChange={(e) => setCardStyle(e.target.value as 'default' | '3d-tilt' | 'glassmorphism')}
        className="px-3 py-2 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-200 focus:ring-2 focus:ring-primary outline-none"
      >
        <option value="default">Predeterminado</option>
        <option value="3d-tilt">3D Inclinación</option>
        <option value="glassmorphism">Vidrio líquido</option>
      </select>
    </div>
    <div className="flex items-center gap-2">
      <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Filtrar por Fecha</label>
      <div className="flex items-center gap-1">
        <input
          type="date"
          value={startDate ? formatDateFns(startDate, 'yyyy-MM-dd') : ''}
          onChange={(e) => setStartDate(e.target.value ? new Date(e.target.value) : null)}
          className="px-3 py-1.5 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-bold text-slate-700 dark:text-slate-200 focus:ring-2 focus:ring-primary outline-none"
        />
        <span className="text-sm text-slate-400">-</span>
        <input
          type="date"
          value={endDate ? formatDateFns(endDate, 'yyyy-MM-dd') : ''}
          onChange={(e) => setEndDate(e.target.value ? new Date(e.target.value) : null)}
          className="px-3 py-1.5 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-bold text-slate-700 dark:text-slate-200 focus:ring-2 focus:ring-primary outline-none"
        />
      </div>
    </div>
  </div>
);
