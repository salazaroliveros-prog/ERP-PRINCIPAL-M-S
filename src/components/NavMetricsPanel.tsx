import React, { useMemo, useState } from 'react';
import { useSyncExternalStore } from 'react';
import { getNavMetricsSnapshot, type NavMetricsSnapshot, type NavMetricsSummary } from '../lib/navMetrics';

const POLL_INTERVAL_MS = 1000;

function subscribe(onStoreChange: () => void) {
  const id = window.setInterval(onStoreChange, POLL_INTERVAL_MS);
  return () => window.clearInterval(id);
}

function getSnapshot() {
  return getNavMetricsSnapshot();
}

function emptySnapshot(): NavMetricsSnapshot {
  return {
    generatedAt: new Date(0).toISOString(),
    windowSize: 20,
    transitions: {},
    routes: {},
  };
}

type MetricsRow = {
  key: string;
  data: NavMetricsSummary;
};

function toSortedRows(input: Record<string, NavMetricsSummary>) {
  return Object.entries(input)
    .map(([key, data]) => ({ key, data }))
    .sort((a, b) => b.data.p95 - a.data.p95);
}

function sectionTitle(title: string, count: number) {
  return `${title} (${count})`;
}

export default function NavMetricsPanel() {
  const [isOpen, setIsOpen] = useState(false);

  const snapshot = useSyncExternalStore(subscribe, getSnapshot, emptySnapshot);

  const routeRows = useMemo(() => toSortedRows(snapshot.routes), [snapshot.routes]);
  const transitionRows = useMemo(() => toSortedRows(snapshot.transitions), [snapshot.transitions]);

  const hasData = routeRows.length > 0 || transitionRows.length > 0;

  return (
    <div className="fixed bottom-20 right-4 z-40 max-w-[92vw] lg:bottom-4">
      <button
        type="button"
        onClick={() => setIsOpen((current) => !current)}
        className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
      >
        {isOpen ? 'Ocultar Nav Metrics' : 'Mostrar Nav Metrics'}
      </button>

      {isOpen && (
        <div className="mt-2 w-[680px] max-w-[92vw] rounded-2xl border border-slate-200 bg-white p-4 shadow-xl dark:border-slate-700 dark:bg-slate-900">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">Nav Metrics (DEV)</h3>
            <span className="text-[11px] text-slate-500 dark:text-slate-400">window={snapshot.windowSize}</span>
          </div>

          <p className="mb-3 text-[11px] text-slate-500 dark:text-slate-400">
            Actualizado: {new Date(snapshot.generatedAt).toLocaleTimeString()}
          </p>

          {!hasData && (
            <p className="rounded-lg bg-slate-50 p-3 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">
              Sin datos aun. Navega entre modulos para generar metricas.
            </p>
          )}

          {hasData && (
            <div className="space-y-4">
              <MetricsTable title={sectionTitle('Routes', routeRows.length)} rows={routeRows} />
              <MetricsTable title={sectionTitle('Transitions', transitionRows.length)} rows={transitionRows} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function MetricsTable({ title, rows }: { title: string; rows: MetricsRow[] }) {
  if (rows.length === 0) {
    return null;
  }

  return (
    <section>
      <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{title}</h4>
      <div className="max-h-56 overflow-auto rounded-lg border border-slate-200 dark:border-slate-700">
        <table className="w-full text-left text-xs">
          <thead className="sticky top-0 bg-slate-100 dark:bg-slate-800">
            <tr>
              <th className="px-2 py-2 font-semibold text-slate-600 dark:text-slate-300">Key</th>
              <th className="px-2 py-2 font-semibold text-slate-600 dark:text-slate-300">avg</th>
              <th className="px-2 py-2 font-semibold text-slate-600 dark:text-slate-300">p95</th>
              <th className="px-2 py-2 font-semibold text-slate-600 dark:text-slate-300">min</th>
              <th className="px-2 py-2 font-semibold text-slate-600 dark:text-slate-300">max</th>
              <th className="px-2 py-2 font-semibold text-slate-600 dark:text-slate-300">latest</th>
              <th className="px-2 py-2 font-semibold text-slate-600 dark:text-slate-300">n</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key} className="border-t border-slate-100 dark:border-slate-800">
                <td className="max-w-[220px] truncate px-2 py-2 text-slate-700 dark:text-slate-200" title={row.key}>
                  {row.key}
                </td>
                <td className="px-2 py-2 text-slate-600 dark:text-slate-300">{row.data.avg}ms</td>
                <td className="px-2 py-2 text-slate-600 dark:text-slate-300">{row.data.p95}ms</td>
                <td className="px-2 py-2 text-slate-600 dark:text-slate-300">{row.data.min}ms</td>
                <td className="px-2 py-2 text-slate-600 dark:text-slate-300">{row.data.max}ms</td>
                <td className="px-2 py-2 text-slate-600 dark:text-slate-300">{row.data.latest}ms</td>
                <td className="px-2 py-2 text-slate-600 dark:text-slate-300">{row.data.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
