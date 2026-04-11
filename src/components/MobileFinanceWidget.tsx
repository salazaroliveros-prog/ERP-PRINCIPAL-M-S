import React, { useEffect, useMemo, useState } from 'react';
import { Clock3, X } from 'lucide-react';
import { cn, formatCurrency } from '../lib/utils';
import { listTransactions } from '../lib/financialsApi';
import { listProjects } from '../lib/projectsApi';
import { useTheme } from '../contexts/ThemeContext';

type Corner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

type Totals = {
  income: number;
  expense: number;
  profit: number;
};

const CORNER_STORAGE_KEY = 'ms-mobile-widget-corner';

const CORNER_CLASS: Record<Corner, string> = {
  'top-left': 'top-20 left-3',
  'top-right': 'top-20 right-3',
  'bottom-left': 'bottom-24 left-3',
  'bottom-right': 'bottom-24 right-3',
};

function isActiveProjectStatus(status: string) {
  const normalized = String(status || '').trim().toLowerCase();
  return !['completed', 'cancelled', 'finished', 'inactive', 'cerrado', 'finalizado'].includes(normalized);
}

async function getAllTransactions() {
  const all: any[] = [];
  const limit = 200;
  let offset = 0;

  for (let i = 0; i < 15; i += 1) {
    const page = await listTransactions({ limit, offset });
    all.push(...page.items);
    if (!page.hasMore) break;
    offset += page.items.length;
    if (page.items.length === 0) break;
  }

  return all;
}

export default function MobileFinanceWidget() {
  const { currentTheme } = useTheme();
  const [isMobile, setIsMobile] = useState(() => (typeof window !== 'undefined' ? window.innerWidth < 1024 : false));
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [totals, setTotals] = useState<Totals>({ income: 0, expense: 0, profit: 0 });
  const [corner, setCorner] = useState<Corner>(() => {
    if (typeof window === 'undefined') return 'bottom-right';
    const saved = window.localStorage.getItem(CORNER_STORAGE_KEY) as Corner | null;
    if (saved && CORNER_CLASS[saved]) return saved;
    return 'bottom-right';
  });

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 1024);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(CORNER_STORAGE_KEY, corner);
  }, [corner]);

  useEffect(() => {
    if (!isMobile) return;

    let cancelled = false;

    const loadTotals = async () => {
      try {
        setIsLoading(true);
        const [projects, transactions] = await Promise.all([listProjects(), getAllTransactions()]);
        if (cancelled) return;

        const activeProjectIds = new Set(
          projects.filter((project) => isActiveProjectStatus(project.status)).map((project) => project.id)
        );

        const activeTransactions = transactions.filter((transaction) => activeProjectIds.has(transaction.projectId));

        const income = activeTransactions
          .filter((transaction) => transaction.type === 'Income')
          .reduce((acc, transaction) => acc + Number(transaction.amount || 0), 0);

        const expense = activeTransactions
          .filter((transaction) => transaction.type === 'Expense')
          .reduce((acc, transaction) => acc + Number(transaction.amount || 0), 0);

        setTotals({ income, expense, profit: income - expense });
      } catch {
        if (!cancelled) {
          setTotals({ income: 0, expense: 0, profit: 0 });
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    void loadTotals();
    const intervalId = window.setInterval(() => {
      void loadTotals();
    }, 60000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [isMobile]);

  const orderedCorners: Corner[] = useMemo(
    () => ['top-left', 'top-right', 'bottom-left', 'bottom-right'],
    []
  );

  const triggerFinancialQuickAction = (action: 'new-income' | 'new-expense') => {
    const targetHash = '#/financials';
    const dispatch = () => {
      window.dispatchEvent(
        new CustomEvent('QUICK_ACTION_TRIGGER', {
          detail: {
            action,
            route: '/financials',
          },
        })
      );
    };

    if ((window.location.hash || '#/') !== targetHash) {
      window.location.hash = targetHash;
      window.setTimeout(dispatch, 350);
    } else {
      dispatch();
    }

    setIsOpen(false);
  };

  if (!isMobile) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        title="Abrir widget financiero M&S"
        aria-label="Abrir widget financiero M&S"
        className={cn(
          'fixed z-[118] px-3 py-2 rounded-xl border shadow-lg backdrop-blur-md transition-all',
          CORNER_CLASS[corner],
          isOpen ? 'opacity-100 scale-100' : 'opacity-60 hover:opacity-90',
          'text-white border-white/20'
        )}
        style={{ backgroundColor: `${currentTheme.color}CC` }}
      >
        <span className="text-[11px] font-black tracking-[0.2em] uppercase">M&S</span>
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-2xl overflow-hidden">
            <div className="px-4 py-3 flex items-center justify-between" style={{ backgroundColor: `${currentTheme.color}15` }}>
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Widget financiero</p>
                <h3 className="text-sm font-black text-slate-900 dark:text-white">M&S Acceso rápido</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500"
                title="Cerrar"
              >
                <X size={16} />
              </button>
            </div>

            <div className="px-4 pt-3 pb-1">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Ubicar pestaña en esquina</p>
              <div className="grid grid-cols-4 gap-2">
                {orderedCorners.map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => setCorner(item)}
                    className={cn(
                      'py-1.5 rounded-lg text-[9px] font-black uppercase border transition-all',
                      corner === item
                        ? 'bg-primary text-white border-primary'
                        : 'bg-slate-50 dark:bg-slate-800 text-slate-500 border-slate-200 dark:border-slate-700'
                    )}
                  >
                    {item.replace('-', ' ')}
                  </button>
                ))}
              </div>
            </div>

            <div className="p-4 space-y-4">
              <div className="grid grid-cols-3 gap-2">
                <MetricClock title="Ingresos" value={totals.income} loading={isLoading} colorClass="text-emerald-600" />
                <MetricClock title="Gastos" value={totals.expense} loading={isLoading} colorClass="text-rose-600" />
                <MetricClock title="Ganancia" value={totals.profit} loading={isLoading} colorClass={totals.profit >= 0 ? 'text-blue-600' : 'text-rose-600'} />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => triggerFinancialQuickAction('new-income')}
                  className="py-3 rounded-xl bg-emerald-600 text-white font-black uppercase tracking-widest text-xs shadow-lg shadow-emerald-200"
                >
                  Ingreso
                </button>
                <button
                  type="button"
                  onClick={() => triggerFinancialQuickAction('new-expense')}
                  className="py-3 rounded-xl bg-rose-600 text-white font-black uppercase tracking-widest text-xs shadow-lg shadow-rose-200"
                >
                  Gasto
                </button>
              </div>

              <p className="text-[10px] text-slate-500 text-center">
                Abre directamente el formulario para registrar información.
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function MetricClock({
  title,
  value,
  loading,
  colorClass,
}: {
  title: string;
  value: number;
  loading: boolean;
  colorClass: string;
}) {
  return (
    <div className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/60 text-center">
      <div className="w-9 h-9 mx-auto rounded-full border-2 border-slate-300 dark:border-slate-600 flex items-center justify-center mb-1">
        <Clock3 size={14} className={colorClass} />
      </div>
      <p className="text-[9px] font-black uppercase tracking-wider text-slate-400">{title}</p>
      <p className={cn('text-[10px] font-black truncate', colorClass)}>
        {loading ? '...' : formatCurrency(value)}
      </p>
    </div>
  );
}
