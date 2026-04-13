import React from 'react';

export type WidgetType = 'presupuesto' | 'gastado' | 'ganancia' | 'obras' | 'custom';

export interface WidgetOption {
  type: WidgetType;
  label: string;
  description: string;
}

export const WIDGET_OPTIONS: WidgetOption[] = [
  { type: 'presupuesto', label: 'Presupuesto', description: 'Presupuesto total de todos los proyectos.' },
  { type: 'gastado', label: 'Gastado', description: 'Total gastado en todos los proyectos.' },
  { type: 'ganancia', label: 'Ganancia', description: 'Ganancia estimada (ingresos - gastos).' },
  { type: 'obras', label: 'Obras Activas', description: 'Cantidad de proyectos actualmente en ejecución.' },
  { type: 'custom', label: 'Personalizado', description: 'Widget personalizado (próximamente).' },
];

export const WidgetPicker: React.FC<{ onPick: (type: WidgetType) => void }> = ({ onPick }) => {
  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-700 p-6 w-80">
      <h3 className="font-bold text-lg mb-4 text-slate-900 dark:text-white">Agregar Widget</h3>
      <ul className="space-y-3">
        {WIDGET_OPTIONS.map(opt => (
          <li key={opt.type}>
            <button
              className="w-full text-left p-3 rounded-xl border border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-primary/10 dark:hover:bg-primary/20 transition-all"
              onClick={() => onPick(opt.type)}
              disabled={opt.type === 'custom'}
            >
              <div className="font-bold text-slate-800 dark:text-white">{opt.label}</div>
              <div className="text-xs text-slate-500 dark:text-slate-400">{opt.description}</div>
              {opt.type === 'custom' && <span className="text-[10px] text-amber-500 font-bold">Próximamente</span>}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
};
