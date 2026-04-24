import React, { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import {
  differenceInDays,
  parseISO,
  startOfDay,
  min as minDate,
  max as maxDate,
  format as formatDateFns
} from 'date-fns';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  AreaChart,
  Area,
  Legend,
  ReferenceLine,
  ComposedChart,
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ScatterChart,
  Scatter,
  ZAxis,
  FunnelChart,
  Funnel,
  LabelList,
} from 'recharts';
import {
  TrendingUp,
  TrendingDown,
  Construction,
  Users,
  Package,
  HandCoins,
  AlertTriangle,
  CheckCircle2,
  Clock,
  History,
  CheckSquare,
  ArrowRight,
  Edit3,
  ChevronRight,
  Search,
  Loader2,
  X,
  ArrowLeft,
  SlidersHorizontal,
  LayoutGrid,
  RotateCcw,
  Sparkles,
  ShieldAlert,
  HardHat,
  Wrench,
  Activity,
  Target,
  Flame,
} from 'lucide-react';
import { formatCurrency, cn, handleApiError, OperationType, getMitigationSuggestions } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { sendNotification } from '../lib/notifications';
import { logAction } from '../lib/audit';
import { listProjects, listProjectBudgetItemsDetailed, updateProject, updateProjectBudgetItem } from '../lib/projectsApi';
import { listTransactions } from '../lib/financialsApi';
import { listInventory } from '../lib/operationsApi';
import { listSubcontracts } from '../lib/subcontractsApi';
import { listWorkflows } from '../lib/workflowsApi';
import { listQuotes } from '../lib/quotesApi';
import { listEmployees } from '../lib/hrApi';
import { listRisks } from '../lib/risksApi';
import { listSafetyIncidents } from '../lib/safetyApi';
import { listEquipment } from '../lib/equipmentApi';
import { fetchTasks, updateTask } from '../lib/tasksApi';
import type { Task } from '../lib/tasksApi';
import { useTheme } from '../contexts/ThemeContext';
import { ParallaxCard } from './ParallaxCard';

const COLORS = [
  '#3b82f6', // Blue
  '#10b981', // Emerald
  '#f59e0b', // Amber
  '#ef4444', // Red
  '#8b5cf6', // Violet
  '#ec4899', // Pink
  '#06b6d4', // Cyan
  '#f97316', // Orange
  '#6366f1', // Indigo
  '#14b8a6', // Teal
];

type DashboardChartKey =
  | 'profitTrend'
  | 'projectHealth'
  | 'projectStatus'
  | 'expenseCategory'
  | 'progressComparison'
  | 'scheduleProgress'
  | 'statsCard1'
  | 'statsCard2'
  | 'statsCard3'
  | 'statsCard4';

type DashboardChartPreferences = Record<DashboardChartKey, string>;

const CHART_TYPE_OPTIONS: Record<DashboardChartKey, Array<{ value: string; label: string }>> = {
  profitTrend: [
    { value: 'area', label: 'Area' },
    { value: 'line', label: 'Línea' },
    { value: 'bar', label: 'Barras' },
    { value: 'composed', label: 'Combinada' },
    { value: 'step', label: 'Step' },
  ],
  projectHealth: [
    { value: 'grouped-bar', label: 'Barras agrupadas' },
    { value: 'stacked-bar', label: 'Barras apiladas' },
    { value: 'line', label: 'Líneas' },
    { value: 'area', label: 'Área' },
    { value: 'composed', label: 'Combinada' },
  ],
  projectStatus: [
    { value: 'donut', label: 'Donut' },
    { value: 'pie', label: 'Pastel' },
    { value: 'bar', label: 'Barras' },
    { value: 'radar', label: 'Radar' },
  ],
  expenseCategory: [
    { value: 'donut', label: 'Donut' },
    { value: 'pie', label: 'Pastel' },
    { value: 'bar', label: 'Barras' },
    { value: 'radar', label: 'Radar' },
    { value: 'line', label: 'Línea' },
  ],
  progressComparison: [
    { value: 'stacked-bar', label: 'Apilada' },
    { value: 'grouped-bar', label: 'Agrupada' },
    { value: 'line', label: 'Líneas' },
    { value: 'area', label: 'Área' },
    { value: 'radar', label: 'Radar' },
  ],
  scheduleProgress: [
    { value: 'gantt', label: 'Cronograma' },
    { value: 'horizontal-bars', label: 'Barras horizontales' },
    { value: 'radar', label: 'Radar avance' },
  ],
  statsCard1: [
    { value: 'number', label: 'Número' },
    { value: 'gauge', label: 'Acelerómetro' },
  ],
  statsCard2: [
    { value: 'number', label: 'Número' },
    { value: 'gauge', label: 'Acelerómetro' },
  ],
  statsCard3: [
    { value: 'number', label: 'Número' },
    { value: 'gauge', label: 'Acelerómetro' },
  ],
  statsCard4: [
    { value: 'number', label: 'Número' },
    { value: 'gauge', label: 'Acelerómetro' },
  ],
};

const THEME_DEFAULT_CHARTS: Record<string, DashboardChartPreferences> = {
  sunset: {
    profitTrend: 'bar',
    projectHealth: 'grouped-bar',
    projectStatus: 'donut',
    expenseCategory: 'donut',
    progressComparison: 'stacked-bar',
    scheduleProgress: 'gantt',
    statsCard1: 'gauge',
    statsCard2: 'gauge',
    statsCard3: 'gauge',
    statsCard4: 'gauge',
  },
  ocean: {
    profitTrend: 'bar',
    projectHealth: 'composed',
    projectStatus: 'pie',
    expenseCategory: 'bar',
    progressComparison: 'line',
    scheduleProgress: 'horizontal-bars',
    statsCard1: 'gauge',
    statsCard2: 'gauge',
    statsCard3: 'gauge',
    statsCard4: 'gauge',
  },
  forest: {
    profitTrend: 'bar',
    projectHealth: 'stacked-bar',
    projectStatus: 'radar',
    expenseCategory: 'radar',
    progressComparison: 'grouped-bar',
    scheduleProgress: 'gantt',
    statsCard1: 'gauge',
    statsCard2: 'gauge',
    statsCard3: 'gauge',
    statsCard4: 'gauge',
  },
  aurora: {
    profitTrend: 'bar',
    projectHealth: 'area',
    projectStatus: 'donut',
    expenseCategory: 'line',
    progressComparison: 'area',
    scheduleProgress: 'radar',
    statsCard1: 'gauge',
    statsCard2: 'gauge',
    statsCard3: 'gauge',
    statsCard4: 'gauge',
  },
  ember: {
    profitTrend: 'bar',
    projectHealth: 'grouped-bar',
    projectStatus: 'bar',
    expenseCategory: 'bar',
    progressComparison: 'stacked-bar',
    scheduleProgress: 'horizontal-bars',
    statsCard1: 'gauge',
    statsCard2: 'gauge',
    statsCard3: 'gauge',
    statsCard4: 'gauge',
  },
};

const normalizeProjectStatus = (status: string) =>
  String(status || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

const isEvaluationStatus = (status: string) => {
  const normalized = normalizeProjectStatus(status);
  return normalized === 'evaluation' || normalized === 'planning' || normalized === 'en evaluacion' || normalized === 'en planeacion';
};

const isExecutionStatus = (status: string) => {
  const normalized = normalizeProjectStatus(status);
  return normalized === 'in progress' || normalized === 'inprogress' || normalized === 'active' || normalized === 'execution' || normalized === 'en ejecucion';
};

type DashboardWidgetId =
  | 'executionRevenue'
  | 'executionExpense'
  | 'executionProfit'
  | 'activeProjects'
  | 'pipelineSnapshot'
  | 'executionTrend';

type DashboardWidgetSize = 'compact' | 'wide' | 'tall';

type DashboardWidgetConfig = {
  id: DashboardWidgetId;
  size: DashboardWidgetSize;
  chartType: string;
};

const DASHBOARD_WIDGET_STORAGE_KEY = 'dashboard-widget-layout-v1';

const DASHBOARD_WIDGET_DEFAULTS: DashboardWidgetConfig[] = [
  { id: 'executionRevenue', size: 'compact', chartType: 'number' },
  { id: 'executionExpense', size: 'compact', chartType: 'number' },
  { id: 'executionProfit', size: 'compact', chartType: 'gauge' },
  { id: 'activeProjects', size: 'compact', chartType: 'gauge' },
  { id: 'executionTrend', size: 'wide', chartType: 'area' },
  { id: 'pipelineSnapshot', size: 'wide', chartType: 'bar' },
];

const DASHBOARD_WIDGET_CHART_OPTIONS: Record<DashboardWidgetId, Array<{ value: string; label: string }>> = {
  executionRevenue: [
    { value: 'number', label: 'Número' },
    { value: 'gauge', label: 'Cobertura' },
  ],
  executionExpense: [
    { value: 'number', label: 'Número' },
    { value: 'gauge', label: 'Consumo' },
  ],
  executionProfit: [
    { value: 'number', label: 'Número' },
    { value: 'gauge', label: 'Margen' },
  ],
  activeProjects: [
    { value: 'number', label: 'Número' },
    { value: 'gauge', label: 'Promedio' },
  ],
  executionTrend: [
    { value: 'area', label: 'Área' },
    { value: 'line', label: 'Línea' },
    { value: 'bar', label: 'Barras' },
  ],
  pipelineSnapshot: [
    { value: 'bar', label: 'Barras' },
    { value: 'donut', label: 'Donut' },
  ],
};

const sanitizeDashboardWidgetLayout = (layout: DashboardWidgetConfig[] | null | undefined) => {
  const fallback = DASHBOARD_WIDGET_DEFAULTS;
  if (!Array.isArray(layout) || layout.length === 0) return fallback;

  const map = new Map(layout.map((widget) => [widget.id, widget]));
  return fallback.map((widget) => {
    const saved = map.get(widget.id);
    return saved
      ? {
          ...widget,
          size: saved.size || widget.size,
          chartType: saved.chartType || widget.chartType,
        }
      : widget;
  });
};

const RadialMetric = ({
  value,
  accent,
  valueLabel,
  helperLabel,
}: {
  value: number;
  accent: string;
  valueLabel: string;
  helperLabel: string;
}) => {
  const normalized = Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (normalized / 100) * circumference;

  return (
    <div className="relative flex h-40 w-40 items-center justify-center">
      <svg viewBox="0 0 140 140" className="h-full w-full -rotate-90">
        <circle cx="70" cy="70" r={radius} fill="none" stroke="rgba(148, 163, 184, 0.16)" strokeWidth="12" />
        <circle
          cx="70"
          cy="70"
          r={radius}
          fill="none"
          stroke={accent}
          strokeWidth="12"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-black text-slate-900 dark:text-white">{normalized.toFixed(0)}%</span>
        <span className="mt-1 text-[10px] font-black uppercase tracking-[0.28em] text-slate-400">{helperLabel}</span>
        <span className="mt-2 text-xs font-bold text-slate-500 dark:text-slate-400">{valueLabel}</span>
      </div>
    </div>
  );
};

const StatCard = ({ title, value, icon: Icon, trend, trendValue, color, chartType, onChartTypeChange, gaugeData }: any) => {
  const gaugeValue = Array.isArray(gaugeData) && gaugeData.length > 0 ? gaugeData[0].value : 0;

  // Create gauge SVG
  const createGaugeSVG = (percent: number) => {
    const radius = 45;
    const circumference = 2 * Math.PI * radius;
    const strokeDashOffset = circumference - (percent / 100) * circumference;
    
    return (
      <svg className="w-full h-full transform -rotate-90" viewBox="0 0 120 120">
        {/* Background circle */}
        <circle
          cx="60"
          cy="60"
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth="8"
          className="text-slate-200 dark:text-slate-700"
        />
        {/* Progress circle */}
        <circle
          cx="60"
          cy="60"
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth="8"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashOffset}
          strokeLinecap="round"
          className="text-primary transition-all duration-500"
        />
        {/* Center text */}
        <text x="60" y="60" textAnchor="middle" dy="0.3em" className="text-sm font-bold fill-slate-900 dark:fill-white">
          {Math.round(percent)}%
        </text>
      </svg>
    );
  };
  
  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -5 }}
      className="bg-white dark:bg-slate-900 rounded-theme shadow-(--shadow-theme) border border-slate-100 dark:border-slate-800 transition-all duration-300 hover:shadow-xl hover:shadow-primary/5 group h-full flex flex-col"
    >
      <div className="p-6 sm:p-8 flex-1 flex flex-col">
        <div className="flex items-start justify-between mb-4 sm:mb-6">
          <div>
            <h3 className="text-slate-400 dark:text-slate-500 text-[10px] sm:text-[11px] font-black uppercase tracking-[0.2em]">{title}</h3>
          </div>
          <div className="flex items-center gap-2">
            {trend && (
              <div className={cn(
                "flex items-center gap-1 text-[9px] sm:text-[10px] font-black uppercase tracking-wider px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-full",
                trend === 'up' ? "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400"
              )}>
                {trend === 'up' ? <TrendingUp size={10} className="sm:w-3 sm:h-3" /> : <TrendingDown size={10} className="sm:w-3 sm:h-3" />}
                {trendValue}
              </div>
            )}
            {onChartTypeChange && (
              <select
                aria-label="Tipo de visualización de tarjeta"
                value={chartType}
                onChange={(e) => onChartTypeChange(e.target.value)}
                className="px-2 py-1 text-[9px] bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg font-bold text-slate-700 dark:text-slate-200 focus:ring-2 focus:ring-primary outline-none"
              >
                <option value="number">Número</option>
                <option value="gauge">Acelerómetro</option>
              </select>
            )}
          </div>
        </div>

        {chartType === 'gauge' ? (
          <div className="flex-1 flex items-center justify-center py-4">
            <div className="w-32 h-32 sm:w-40 sm:h-40 flex items-center justify-center">
              {createGaugeSVG(gaugeValue)}
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-start justify-center gap-2">
            <div className={cn("p-2 sm:p-3 rounded-xl sm:rounded-2xl shadow-inner transition-transform group-hover:scale-110 duration-500", color)}>
              <Icon size={20} className="text-white sm:w-6 sm:h-6" />
            </div>
            <p className="text-3xl sm:text-4xl font-black text-slate-900 dark:text-white tracking-tight">{value}</p>
          </div>
        )}
      </div>
    </motion.div>
  );
};

const TOOLTIP_STYLE = {
  contentStyle: { backgroundColor: 'rgba(15,23,42,0.92)', borderRadius: '14px', border: 'none', boxShadow: '0 20px 25px -5px rgb(0 0 0/0.2)', backdropFilter: 'blur(8px)' },
  itemStyle: { color: '#fff', fontSize: '12px', fontWeight: 700 },
  labelStyle: { color: '#94a3b8', fontSize: '10px', fontWeight: 800, textTransform: 'uppercase' as const, marginBottom: '4px' },
};

const CHART_CARD = 'bg-white dark:bg-slate-900 p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800 transition-all duration-300 hover:shadow-lg';

export default function Dashboard() {
  const { currentTheme } = useTheme();
  const [projects, setProjects] = useState<any[]>([]);
  const [quotes, setQuotes] = useState<any[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [inventory, setInventory] = useState<any[]>([]);
  const [subcontracts, setSubcontracts] = useState<any[]>([]);
  const [recentLogs, setRecentLogs] = useState<any[]>([]);
  const [pendingWorkflows, setPendingWorkflows] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [risks, setRisks] = useState<any[]>([]);
  const [safetyIncidents, setSafetyIncidents] = useState<any[]>([]);
  const [equipment, setEquipment] = useState<any[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [activePage, setActivePage] = useState(0);
  const [isQuickProgressModalOpen, setIsQuickProgressModalOpen] = useState(false);
  const [selectedQuickProjectId, setSelectedQuickProjectId] = useState<string | null>(null);
  const [quickBudgetItems, setQuickBudgetItems] = useState<any[]>([]);
  const [isLoadingQuickItems, setIsLoadingQuickItems] = useState(false);
  const [quickSearchTerm, setQuickSearchTerm] = useState('');
  const [progressChartScope, setProgressChartScope] = useState<'all' | 'selected'>('all');
  const [chartPreferences, setChartPreferences] = useState<DashboardChartPreferences>(
    THEME_DEFAULT_CHARTS.sunset
  );
  const [cardStyle, setCardStyle] = useState<'default' | '3d-tilt' | 'glassmorphism'>('default');
  const [isWidgetEditMode, setIsWidgetEditMode] = useState(false);
  const [dashboardWidgets, setDashboardWidgets] = useState<DashboardWidgetConfig[]>(DASHBOARD_WIDGET_DEFAULTS);
  const [startDate, setStartDate] = useState<Date | null>(null);
  const [endDate, setEndDate] = useState<Date | null>(null);
  const [lastLoadedAt, setLastLoadedAt] = useState<Date | null>(null);
  const navigate = useNavigate();

  const updateChartPreference = (chartKey: DashboardChartKey, value: string) => {
    setChartPreferences((prev) => ({
      ...prev,
      [chartKey]: value,
    }));
  };

  useEffect(() => {
    const storageKey = 'dashboard-chart-preferences-by-theme';
    const fallback = THEME_DEFAULT_CHARTS[currentTheme.id] || THEME_DEFAULT_CHARTS.sunset;

    try {
      const raw = localStorage.getItem(storageKey);
      const parsed = raw ? JSON.parse(raw) : {};
      const persistedForTheme = parsed?.[currentTheme.id];
      setChartPreferences(persistedForTheme ? { ...fallback, ...persistedForTheme } : fallback);
    } catch {
      setChartPreferences(fallback);
    }
  }, [currentTheme.id]);

  useEffect(() => {
    const storageKey = 'dashboard-chart-preferences-by-theme';
    try {
      const raw = localStorage.getItem(storageKey);
      const parsed = raw ? JSON.parse(raw) : {};
      parsed[currentTheme.id] = chartPreferences;
      localStorage.setItem(storageKey, JSON.stringify(parsed));
    } catch {
      // Ignore persistence errors and keep runtime preferences.
    }
  }, [chartPreferences, currentTheme.id]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(DASHBOARD_WIDGET_STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      setDashboardWidgets(sanitizeDashboardWidgetLayout(parsed));
    } catch {
      setDashboardWidgets(DASHBOARD_WIDGET_DEFAULTS);
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(DASHBOARD_WIDGET_STORAGE_KEY, JSON.stringify(dashboardWidgets));
    } catch {
      // Ignore persistence errors and keep runtime preferences.
    }
  }, [dashboardWidgets]);

  const updateWidgetLayout = (widgetId: DashboardWidgetId, patch: Partial<DashboardWidgetConfig>) => {
    setDashboardWidgets((prev) =>
      prev.map((widget) => (widget.id === widgetId ? { ...widget, ...patch } : widget))
    );
  };

  const moveWidget = (widgetId: DashboardWidgetId, direction: 'left' | 'right') => {
    setDashboardWidgets((prev) => {
      const currentIndex = prev.findIndex((widget) => widget.id === widgetId);
      if (currentIndex === -1) return prev;

      const targetIndex = direction === 'left' ? currentIndex - 1 : currentIndex + 1;
      if (targetIndex < 0 || targetIndex >= prev.length) return prev;

      const next = [...prev];
      [next[currentIndex], next[targetIndex]] = [next[targetIndex], next[currentIndex]];
      return next;
    });
  };

  const resetDashboardWidgets = () => {
    setDashboardWidgets(DASHBOARD_WIDGET_DEFAULTS);
  };

  const clampPercent = (value: any) => {
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) return 0;
    return Math.max(0, Math.min(100, numericValue));
  };

  const getFinancialProgress = (project: any) => {
    const budget = Number(project?.budget || 0);
    const spent = Number(project?.spent || 0);
    if (budget > 0) {
      return clampPercent((spent / budget) * 100);
    }
    return clampPercent(project?.financialProgress || 0);
  };

  useEffect(() => {
    if (!selectedQuickProjectId) {
      setQuickBudgetItems([]);
      return;
    }

    let cancelled = false;
    setIsLoadingQuickItems(true);

    (async () => {
      try {
        const items = await listProjectBudgetItemsDetailed(selectedQuickProjectId);
        if (!cancelled) {
          const orderedItems = [...items].sort((a: any, b: any) => {
            const orderDiff = Number(a?.order || 0) - Number(b?.order || 0);
            if (orderDiff !== 0) return orderDiff;
            return String(a?.description || '').localeCompare(String(b?.description || ''));
          });
          setQuickBudgetItems(orderedItems);
        }
      } catch (error) {
        if (!cancelled) {
          handleApiError(error, OperationType.GET, `projects/${selectedQuickProjectId}/budgetItems`);
        }
      } finally {
        if (!cancelled) {
          setIsLoadingQuickItems(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedQuickProjectId]);

  const buildProjectPayload = (project: any, physicalProgress: number) => {
    const budget = Number(project?.budget || 0);
    const spent = Number(project?.spent || 0);
    return {
      name: project?.name || '',
      location: project?.location || '',
      projectManager: project?.projectManager || '',
      status: project?.status || 'Planning',
      budget,
      spent,
      physicalProgress,
      financialProgress: budget > 0 ? (spent / budget) * 100 : Number(project?.financialProgress || 0),
      area: Number(project?.area || 0),
      startDate: project?.startDate || '',
      endDate: project?.endDate || '',
      clientUid: project?.clientUid || '',
      typology: project?.typology || 'RESIDENCIAL',
      latitude: project?.latitude || '',
      longitude: project?.longitude || '',
    };
  };

  const handleQuickProgressUpdate = async (budgetItemId: string, newProgress: number) => {
    if (!selectedQuickProjectId) return;

    // Validate progress
    if (newProgress < 0 || newProgress > 100) {
      toast.error('El avance debe estar entre 0 y 100');
      return;
    }

    try {
      await updateProjectBudgetItem(selectedQuickProjectId, budgetItemId, {
        progress: newProgress,
      });

      // Recalculate project physical progress
      const updatedBudgetItems = quickBudgetItems.map(i =>
        i.id === budgetItemId ? { ...i, progress: clampPercent(newProgress) } : i
      );

      setQuickBudgetItems(updatedBudgetItems);

      const totalBudget = updatedBudgetItems.reduce((acc, i) => acc + ((i.materialCost + i.laborCost + i.indirectCost) * (i.quantity || 1)), 0);
      const overallProgress = totalBudget > 0
        ? updatedBudgetItems.reduce((acc, i) => acc + (clampPercent(i.progress || 0) * ((i.materialCost + i.laborCost + i.indirectCost) * (i.quantity || 1))), 0) / totalBudget
        : 0;

      const project = projects.find(p => p.id === selectedQuickProjectId);
      if (project) {
        await updateProject(selectedQuickProjectId, buildProjectPayload(project, overallProgress));
      }
      setProjects(prev => prev.map(p => p.id === selectedQuickProjectId ? {
        ...p,
        physicalProgress: clampPercent(overallProgress),
        financialProgress: getFinancialProgress(p),
      } : p));

      const budgetItem = quickBudgetItems.find(i => i.id === budgetItemId);
      await logAction(
        'Actualización Rápida de Avance',
        'Dashboard',
        `Avance de "${budgetItem?.description || budgetItemId}" en "${project?.name || selectedQuickProjectId}" actualizado al ${newProgress.toFixed(1)}%`,
        'update',
        { projectId: selectedQuickProjectId, budgetItemId, progress: newProgress }
      );

      toast.success('Avance actualizado correctamente');
    } catch (error) {
      handleApiError(error, OperationType.WRITE, `projects/${selectedQuickProjectId}/budgetItems/${budgetItemId}`);
    }
  };

  // Formato ISO date string para pasar al backend
  const fromParam = startDate ? startDate.toISOString().split('T')[0] : undefined;
  const toParam = endDate ? endDate.toISOString().split('T')[0] : undefined;

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        setLoading(true);
        // Carga estática (no depende de fechas)
        const [projectsItems, quotesItems, inventoryResult, subcontractsItems, workflowsItems, employeesItems, risksItems, safetyItems, equipmentItems, tasksResult] = await Promise.all([
          listProjects(),
          listQuotes(),
          listInventory({ limit: 500, offset: 0 }),
          listSubcontracts({ status: 'Active' }),
          listWorkflows({ status: 'pending' }),
          listEmployees().catch(() => []),
          listRisks().catch(() => []),
          listSafetyIncidents().catch(() => []),
          listEquipment().catch(() => []),
          fetchTasks().catch(() => ({ items: [] })),
        ]);

        if (cancelled) return;

        setQuotes(quotesItems);
        setInventory(inventoryResult.items);
        setSubcontracts(subcontractsItems);
        setPendingWorkflows(workflowsItems.slice(0, 5));
        setEmployees(employeesItems);
        setRisks(risksItems);
        setSafetyIncidents(safetyItems);
        setEquipment(equipmentItems);
        setTasks(tasksResult.items);
        setRecentLogs([]);

        // Transacciones con filtro de fecha al backend
        const transactionsResult = await listTransactions({
          limit: 200,
          offset: 0,
          from: fromParam,
          to: toParam,
        });

        if (cancelled) return;

        const projectSpentMap = transactionsResult.items
          .filter((t: any) => t.type === 'Expense')
          .reduce((acc: Record<string, number>, t: any) => {
            const key = String(t.projectId || '');
            if (!key) return acc;
            acc[key] = (acc[key] || 0) + Number(t.amount || 0);
            return acc;
          }, {});

        const normalizedProjects = projectsItems.map((p: any) => {
          const spentFromTransactions = projectSpentMap[String(p.id)] ?? Number(p.spent || 0);
          const budget = Number(p.budget || 0);
          const financialProgress = budget > 0
            ? clampPercent((spentFromTransactions / budget) * 100)
            : clampPercent(p.financialProgress || 0);

          return {
            ...p,
            spent: spentFromTransactions,
            financialProgress,
            physicalProgress: clampPercent(p.physicalProgress || 0),
          };
        });

        setProjects(normalizedProjects);
        setTransactions(transactionsResult.items);
        setLastLoadedAt(new Date());
      } catch (error) {
        if (!cancelled) {
          handleApiError(error, OperationType.GET, 'dashboard');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [fromParam, toParam]); // Re-ejecuta cuando cambia el filtro de fechas

  useEffect(() => {
    if (loading) return;

    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    const notifiedKey = `notified_${todayStr}`;
    const notifiedItems = JSON.parse(localStorage.getItem(notifiedKey) || '{}');
    let hasNewNotifications = false;

    // Check for expiring subcontracts (within 7 days)
    const sevenDaysFromNow = new Date();
    sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);

    subcontracts.forEach((sub: any) => {
      if (sub.endDate && sub.status !== 'Finished') {
        const endDate = new Date(sub.endDate);
        const subId = `sub_${sub.id}`;

        if (endDate <= sevenDaysFromNow && endDate >= now && !notifiedItems[subId]) {
          sendNotification(
            'Subcontrato por Vencer',
            `El subcontrato con ${sub.contractor} para la obra ${sub.projectName} vence el ${sub.endDate}.`,
            'subcontract'
          );
          notifiedItems[subId] = true;
          hasNewNotifications = true;
        }
      }
    });

    // Check for overdue tasks
    const today = new Date().toISOString().split('T')[0];
    tasks.forEach((task) => {
      if (task.dueDate && task.status !== 'done' && task.status !== 'cancelled' && task.dueDate < today) {
        const taskKey = `task_overdue_${task.id}`;
        if (!notifiedItems[taskKey]) {
          sendNotification(
            'Tarea Vencida',
            `La tarea "${task.title}" venció el ${new Date(task.dueDate + 'T00:00:00').toLocaleDateString('es-GT')}.`,
            'project'
          );
          notifiedItems[taskKey] = true;
          hasNewNotifications = true;
        }
      }
    });

    // Check for financial deviations in active projects
    projects.forEach((p: any) => {
      if (p.status === 'In Progress') {
        const financialProgress = p.budget > 0 ? (p.spent / p.budget) * 100 : 0;
        const progressDeviation = financialProgress - (p.physicalProgress || 0);
        const projectId = `proj_dev_${p.id}`;

        if (progressDeviation > 15 && !notifiedItems[projectId]) {
          sendNotification(
            'Alerta de Desviación Financiera',
            `La obra ${p.name} tiene una desviación del ${progressDeviation.toFixed(1)}% (Gasto > Avance Físico).`,
            'project'
          );
          notifiedItems[projectId] = true;
          hasNewNotifications = true;
        }
      }
    });

    if (hasNewNotifications) {
      localStorage.setItem(notifiedKey, JSON.stringify(notifiedItems));
    }
  }, [projects, subcontracts, tasks, loading]);

  const executionProjects = useMemo(
    () => projects.filter((project) => isExecutionStatus(project.status)),
    [projects]
  );

  const evaluationProjects = useMemo(
    () => projects.filter((project) => isEvaluationStatus(project.status)),
    [projects]
  );

  const executionProjectIds = useMemo(
    () => new Set(executionProjects.map((project) => String(project.id))),
    [executionProjects]
  );

  // Las transacciones ya vienen filtradas por fecha desde el backend.
  // filteredTransactions es un alias para mantener compatibilidad con los cálculos derivados.
  const filteredTransactions = transactions;

  const executionTransactions = useMemo(
    () => filteredTransactions.filter((transaction) => executionProjectIds.has(String(transaction.projectId || ''))),
    [filteredTransactions, executionProjectIds]
  );

  const executionBudget = executionProjects.reduce((acc, project) => acc + Number(project.budget || 0), 0);
  const executionSpent = executionTransactions
    .filter((transaction) => transaction.type === 'Expense')
    .reduce((acc, transaction) => acc + Number(transaction.amount || 0), 0);
  const executionIncome = executionTransactions
    .filter((transaction) => transaction.type === 'Income')
    .reduce((acc, transaction) => acc + Number(transaction.amount || 0), 0);
  const executionProfit = executionIncome - executionSpent;
  const executionMargin = executionIncome > 0 ? (executionProfit / executionIncome) * 100 : 0;
  const budgetConsumption = executionBudget > 0 ? (executionSpent / executionBudget) * 100 : 0;
  const activeProjects = executionProjects.length;
  const averageExecutionProgress = activeProjects > 0
    ? executionProjects.reduce((acc, project) => acc + clampPercent(project.physicalProgress || 0), 0) / activeProjects
    : 0;

  const quotationQuotes = quotes.filter((quote) => {
    const normalized = String(quote.status || '').trim().toLowerCase();
    return normalized === 'pending' || normalized === 'sent';
  });
  const quotationValue = quotationQuotes.reduce((acc, quote) => acc + Number(quote.total || 0), 0);
  const evaluationBudget = evaluationProjects.reduce((acc, project) => acc + Number(project.budget || 0), 0);
  const evaluationSpent = evaluationProjects.reduce((acc, project) => acc + Number(project.spent || 0), 0);
  const activeExecutionCoverage = executionBudget > 0 ? (executionIncome / executionBudget) * 100 : 0;

  const projectHealthData = executionProjects.map(p => {
    const projectExpenses = executionTransactions
      .filter(t => t.projectId === p.id && t.type === 'Expense')
      .reduce((acc, t) => acc + (t.amount || 0), 0);
    const projectIncome = executionTransactions
      .filter(t => t.projectId === p.id && t.type === 'Income')
      .reduce((acc, t) => acc + (t.amount || 0), 0);

    return {
      name: p.name,
      presupuesto: p.budget || 0,
      gastado: projectExpenses,
      ingresos: projectIncome,
      ganancia: projectIncome - projectExpenses
    };
  });

  const expenseByCategory = filteredTransactions
    .filter(t => t.type === 'Expense' && executionProjectIds.has(String(t.projectId || '')))
    .reduce((acc: any, t) => {
      const category = t.category || 'Otros';
      acc[category] = (acc[category] || 0) + (t.amount || 0);
      return acc;
    }, {});

  const expenseByCategoryData = Object.keys(expenseByCategory).map(key => ({
    name: key,
    value: expenseByCategory[key]
  })).sort((a, b) => b.value - a.value);

  const statusData = [
    { name: 'Evaluación', value: evaluationProjects.length },
    { name: 'En Planeación', value: projects.filter(p => p.status === 'Planning').length },
    { name: 'En Ejecución', value: executionProjects.length },
    { name: 'Completadas', value: projects.filter(p => p.status === 'Completed').length },
    { name: 'En Pausa', value: projects.filter(p => p.status === 'On Hold').length },
  ].filter(d => d.value > 0);

  const statusRadarData = statusData.map((item) => ({
    subject: item.name,
    value: item.value,
  }));

  const expenseRadarData = expenseByCategoryData.map((item) => ({
    subject: item.name,
    value: item.value,
  }));

  const activeProjectsList = executionProjects;

  const progressComparisonData = projects
    .map(p => {
      const physicalProgress = clampPercent(p.physicalProgress || 0);
      const financialProgress = getFinancialProgress(p);
      return {
        id: p.id,
        name: p.name,
        fisico: physicalProgress,
        fisicoRestante: Math.max(0, 100 - physicalProgress),
        financiero: financialProgress,
        financieroRestante: Math.max(0, 100 - financialProgress),
      };
    })
    .filter(p => p.fisico > 0 || p.financiero > 0 || p.id === selectedQuickProjectId)
    .sort((a, b) => Math.max(b.fisico, b.financiero) - Math.max(a.fisico, a.financiero));

  const progressComparisonChartData = progressChartScope === 'selected' && selectedQuickProjectId
    ? progressComparisonData.filter((p) => p.id === selectedQuickProjectId)
    : progressComparisonData;

  const allProjectDates = activeProjectsList.flatMap(p => [
    p.startDate ? parseISO(p.startDate) : null,
    p.endDate ? parseISO(p.endDate) : null
  ]).filter(d => d !== null) as Date[];

  const globalMinDate = allProjectDates.length > 0 ? minDate(allProjectDates) : startOfDay(new Date());
  const globalMaxDate = allProjectDates.length > 0 ? maxDate(allProjectDates) : startOfDay(new Date());
  const totalDays = Math.max(30, differenceInDays(globalMaxDate, globalMinDate) + 7); // Add buffer

  const ganttData = activeProjectsList.map(p => {
    const startDate = p.startDate ? parseISO(p.startDate) : globalMinDate;
    const endDate = p.endDate ? parseISO(p.endDate) : startDate;
    const physicalProgress = clampPercent(p.physicalProgress || 0);
    const financialProgress = getFinancialProgress(p);

    const startOffset = Math.max(0, differenceInDays(startDate, globalMinDate));
    const duration = Math.max(1, differenceInDays(endDate, startDate));

    return {
      id: p.id,
      name: p.name,
      shortName: p.name.length > 24 ? `${p.name.substring(0, 21)}...` : p.name,
      startOffset,
      duration,
      physicalDuration: duration * physicalProgress / 100,
      financialDuration: duration * financialProgress / 100,
      physical: physicalProgress,
      financial: financialProgress,
      physicalLabel: `${physicalProgress.toFixed(1)}%`,
      financialLabel: `${financialProgress.toFixed(1)}%`,
      startDate: p.startDate,
      endDate: p.endDate
    };
  }).sort((a, b) => a.startOffset - b.startOffset);

  const ganttChartData = progressChartScope === 'selected' && selectedQuickProjectId
    ? ganttData.filter((p) => p.id === selectedQuickProjectId)
    : ganttData;

  const scheduleRadarData = ganttChartData.slice(0, 8).map((item) => ({
    subject: item.shortName,
    physical: item.physical,
    financial: item.financial,
  }));

  const scheduleTrendData = ganttChartData.map((item) => ({
    name: item.shortName,
    physical: item.physical,
    financial: item.financial,
    duration: item.duration,
  }));

  const ganttChartHeight = Math.max(340, 120 + (ganttChartData.length * 30));

  const formatXAxis = (tickItem: number) => {
    const date = new Date(globalMinDate);
    date.setDate(date.getDate() + tickItem);
    return formatDateFns(date, 'MMM d', { locale: undefined }); // Recharts doesn't need locale here
  };

  const todayOffset = differenceInDays(new Date(), globalMinDate);

  const lowStockItems = inventory.filter(i => i.stock <= i.minStock);

  const riskProjects = projects.filter(p => {
    if (p.status !== 'In Progress') return false;
    const financialProgress = p.budget > 0 ? (p.spent / p.budget) * 100 : 0;
    const progressDeviation = financialProgress - (p.physicalProgress || 0);
    return progressDeviation > 15;
  });

  const inactiveProjects = projects.filter(p => {
    if (p.status === 'Completed') return false;
    const lastUpdate = new Date(p.updatedAt || p.createdAt || Date.now());
    const diffDays = Math.ceil((new Date().getTime() - lastUpdate.getTime()) / (1000 * 3600 * 24));
    return diffDays > 15;
  });

  const profitTrendData = Array.from({ length: 7 }).map((_, i) => {
    const date = new Date();
    date.setDate(date.getDate() - (6 - i));
    const dateStr = date.toISOString().split('T')[0];

    const spentUpToDate = filteredTransactions
      .filter(t => executionProjectIds.has(String(t.projectId || '')) && t.type === 'Expense' && t.date <= dateStr)
      .reduce((acc, t) => acc + (t.amount || 0), 0);

    const incomeUpToDate = filteredTransactions
      .filter(t => executionProjectIds.has(String(t.projectId || '')) && t.type === 'Income' && t.date <= dateStr)
      .reduce((acc, t) => acc + (t.amount || 0), 0);

    return {
      date: date.toLocaleDateString('es-GT', { day: 'numeric', month: 'short' }),
      profit: incomeUpToDate - spentUpToDate
    };
  });

  const nearingEndSubs = subcontracts.filter(sub => {
    if (!sub.endDate || sub.status === 'Finished') return false;
    const daysLeft = Math.ceil((new Date(sub.endDate).getTime() - new Date().getTime()) / (1000 * 3600 * 24));
    return daysLeft <= 30 && daysLeft > 0;
  });

  const financialSummary = {
    totalIncome: executionIncome,
    totalExpense: executionSpent,
  };

  // ── Datos nuevas gráficas avanzadas ──────────────────────────────────────

  // Scatter: desviación físico vs financiero por proyecto
  const deviationScatterData = projects.map(p => ({
    name: p.name,
    fisico: clampPercent(p.physicalProgress || 0),
    financiero: getFinancialProgress(p),
    desviacion: getFinancialProgress(p) - clampPercent(p.physicalProgress || 0),
    budget: Number(p.budget || 0),
  }));

  // Burndown: presupuesto restante por semana (últimas 8 semanas)
  const burndownData = Array.from({ length: 8 }).map((_, i) => {
    const weekDate = new Date();
    weekDate.setDate(weekDate.getDate() - (7 - i) * 7);
    const dateStr = weekDate.toISOString().split('T')[0];
    const spentUpTo = filteredTransactions
      .filter(t => t.type === 'Expense' && t.date <= dateStr)
      .reduce((acc, t) => acc + Number(t.amount || 0), 0);
    const totalBudget = projects.reduce((acc, p) => acc + Number(p.budget || 0), 0);
    return {
      semana: `S${i + 1}`,
      restante: Math.max(0, totalBudget - spentUpTo),
      gastado: spentUpTo,
      ideal: totalBudget * (1 - (i / 7) * 0.8),
    };
  });

  // HR: empleados por departamento y masa salarial
  const employeesByDept = employees.reduce((acc: any, e) => {
    const dept = e.department || 'Sin depto';
    acc[dept] = (acc[dept] || 0) + 1;
    return acc;
  }, {});
  const employeesByDeptData = Object.entries(employeesByDept)
    .map(([name, value]) => ({ name, value: value as number }))
    .sort((a, b) => b.value - a.value);
  const salaryByDept = employees.reduce((acc: any, e) => {
    const dept = e.department || 'Sin depto';
    acc[dept] = (acc[dept] || 0) + Number(e.salary || 0);
    return acc;
  }, {});
  const salaryByDeptData = Object.entries(salaryByDept)
    .map(([name, value]) => ({ name, value: value as number }))
    .sort((a, b) => b.value - a.value);
  const activeEmployees = employees.filter(e => String(e.status || '').toLowerCase() === 'active').length;
  const totalSalaryMass = employees.reduce((acc, e) => acc + Number(e.salary || 0), 0);

  // Riesgos: por categoría y estado
  const riskByCategory = risks.reduce((acc: any, r) => {
    const cat = r.category || 'General';
    acc[cat] = (acc[cat] || 0) + 1;
    return acc;
  }, {});
  const riskByCategoryData = Object.entries(riskByCategory)
    .map(([name, value]) => ({ name, value: value as number }))
    .sort((a, b) => b.value - a.value);
  const riskByStatus = risks.reduce((acc: any, r) => {
    const s = r.status || 'Open';
    acc[s] = (acc[s] || 0) + 1;
    return acc;
  }, {});
  const riskByStatusData = Object.entries(riskByStatus)
    .map(([name, value]) => ({ name, value: value as number }));
  const highRisks = risks.filter(r =>
    ['high', 'critical'].includes(String(r.impact || '').toLowerCase())
  ).length;

  // Seguridad: incidentes por severidad y tipo
  const incidentsBySeverity = safetyIncidents.reduce((acc: any, i) => {
    const sev = i.severity || 'Low';
    acc[sev] = (acc[sev] || 0) + 1;
    return acc;
  }, {});
  const incidentsBySeverityData = Object.entries(incidentsBySeverity)
    .map(([name, value]) => ({ name, value: value as number }));
  const incidentsByType = safetyIncidents.reduce((acc: any, i) => {
    const t = i.type || 'General';
    acc[t] = (acc[t] || 0) + 1;
    return acc;
  }, {});
  const incidentsByTypeData = Object.entries(incidentsByType)
    .map(([name, value]) => ({ name, value: value as number }))
    .sort((a, b) => b.value - a.value);
  const openIncidents = safetyIncidents.filter(i =>
    String(i.status || '').toLowerCase() !== 'closed'
  ).length;

  // Equipos: por estado y costo diario top 8
  const equipmentByStatus = equipment.reduce((acc: any, e) => {
    const s = e.status || 'Available';
    acc[s] = (acc[s] || 0) + 1;
    return acc;
  }, {});
  const equipmentByStatusData = Object.entries(equipmentByStatus)
    .map(([name, value]) => ({ name, value: value as number }));
  const equipmentCostData = equipment
    .filter(e => Number(e.dailyRate || 0) > 0)
    .sort((a, b) => Number(b.dailyRate) - Number(a.dailyRate))
    .slice(0, 8)
    .map(e => ({
      name: e.name.length > 18 ? e.name.slice(0, 16) + '…' : e.name,
      costo: Number(e.dailyRate),
      dias: Number(e.estimatedDays || 0),
    }));
  const totalEquipmentCost = equipment.reduce(
    (acc, e) => acc + Number(e.dailyRate || 0) * Number(e.estimatedDays || 0), 0
  );

  // Ingresos vs Gastos por mes (últimos 6 meses)
  const monthlyFinancialData = Array.from({ length: 6 }).map((_, i) => {
    const d = new Date();
    d.setMonth(d.getMonth() - (5 - i));
    const monthStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const ingresos = filteredTransactions
      .filter(t => t.type === 'Income' && String(t.date || '').startsWith(monthStr))
      .reduce((acc, t) => acc + Number(t.amount || 0), 0);
    const gastos = filteredTransactions
      .filter(t => t.type === 'Expense' && String(t.date || '').startsWith(monthStr))
      .reduce((acc, t) => acc + Number(t.amount || 0), 0);
    return {
      mes: d.toLocaleDateString('es-GT', { month: 'short', year: '2-digit' }),
      ingresos,
      gastos,
      utilidad: ingresos - gastos,
    };
  });

  // Funnel pipeline
  const funnelData = [
    { name: 'Cotizaciones', value: quotationQuotes.length, fill: '#8b5cf6' },
    { name: 'Evaluación', value: evaluationProjects.length, fill: '#6366f1' },
    { name: 'Ejecución', value: executionProjects.length, fill: '#0ea5e9' },
    { name: 'Completadas', value: projects.filter(p => p.status === 'Completed').length, fill: '#10b981' },
  ].filter(d => d.value > 0);

  const overdueTasksCount = tasks.filter(t => {
    const today = new Date().toISOString().split('T')[0];
    return t.dueDate && t.status !== 'done' && t.status !== 'cancelled' && t.dueDate < today;
  }).length;

  const PAGES = ['Resumen Ejecutivo', 'Análisis Financiero', 'RRHH · Riesgos · Seguridad', 'Equipos · Pipeline'];

  const pipelineData = [
    { name: 'Cotización', value: quotationValue, count: quotationQuotes.length, fill: '#6366f1' },
    { name: 'Evaluación', value: evaluationBudget, count: evaluationProjects.length, fill: '#8b5cf6' },
    { name: 'Ejecución', value: executionBudget, count: executionProjects.length, fill: '#0ea5e9' },
  ].filter((item) => item.value > 0 || item.count > 0);

  const widgetSurfaceClass = cn(
    'relative h-full overflow-hidden rounded-[28px] border px-5 py-5 shadow-[0_24px_60px_-30px_rgba(15,23,42,0.35)] transition-all duration-300',
    cardStyle === 'glassmorphism'
      ? 'bg-white/60 dark:bg-slate-900/45 border-white/40 dark:border-slate-700/40 backdrop-blur-2xl'
      : 'bg-white dark:bg-slate-900 border-slate-200/70 dark:border-slate-800'
  );

  const getWidgetGridClass = (size: DashboardWidgetSize) => {
    if (size === 'wide') return 'col-span-1 md:col-span-2 xl:col-span-6';
    if (size === 'tall') return 'col-span-1 md:col-span-1 xl:col-span-4 xl:row-span-2';
    return 'col-span-1 md:col-span-1 xl:col-span-3';
  };

  const renderMetricWidget = ({
    headline,
    valueLabel,
    accentClass,
    accentColor,
    helper,
    chartType,
    gaugeValue,
    icon: Icon,
  }: {
    headline: string;
    valueLabel: string;
    accentClass: string;
    accentColor: string;
    helper: string;
    chartType: string;
    gaugeValue: number;
    icon: any;
  }) => (
    <div className="flex h-full flex-col justify-between gap-6">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200/70 bg-emerald-50/80 px-3 py-1 text-[10px] font-black uppercase tracking-[0.28em] text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300">
            <Sparkles size={11} />
            Solo ejecución
          </div>
          <p className="text-[11px] font-black uppercase tracking-[0.32em] text-slate-400">{headline}</p>
          <p className="max-w-[18rem] text-sm font-semibold leading-6 text-slate-500 dark:text-slate-400">{helper}</p>
        </div>
        <div className={cn('rounded-2xl p-3 text-white shadow-lg', accentClass)}>
          <Icon size={18} />
        </div>
      </div>

      {chartType === 'gauge' ? (
        <div className="flex items-center justify-center">
          <RadialMetric
            value={gaugeValue}
            accent={accentColor}
            valueLabel={valueLabel}
            helperLabel="avance"
          />
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-4xl font-black tracking-tight text-slate-950 dark:text-white">{valueLabel}</p>
          <div className="inline-flex items-center gap-2 rounded-full border border-white/60 bg-white/70 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.24em] text-slate-500 shadow-sm dark:border-slate-700/80 dark:bg-slate-800/70 dark:text-slate-300">
            <Sparkles size={12} />
            {helper}
          </div>
        </div>
      )}
    </div>
  );

  const renderWidgetBody = (widget: DashboardWidgetConfig) => {
    switch (widget.id) {
      case 'executionRevenue':
        return renderMetricWidget({
          headline: 'Ingresos en ejecución',
          valueLabel: formatCurrency(executionIncome),
          accentClass: 'bg-linear-to-br from-emerald-500 via-emerald-500 to-teal-500',
          accentColor: '#10b981',
          helper: `${activeProjects} obra(s) activas con cobertura ${activeExecutionCoverage.toFixed(0)}% del presupuesto`,
          chartType: widget.chartType,
          gaugeValue: activeExecutionCoverage,
          icon: TrendingUp,
        });
      case 'executionExpense':
        return renderMetricWidget({
          headline: 'Gasto operativo activo',
          valueLabel: formatCurrency(executionSpent),
          accentClass: 'bg-linear-to-br from-rose-500 via-rose-500 to-orange-500',
          accentColor: '#ef4444',
          helper: `${formatCurrency(executionBudget)} presupuestados para las obras en marcha`,
          chartType: widget.chartType,
          gaugeValue: budgetConsumption,
          icon: HandCoins,
        });
      case 'executionProfit':
        return renderMetricWidget({
          headline: 'Ganancia neta activa',
          valueLabel: formatCurrency(executionProfit),
          accentClass: executionProfit >= 0
            ? 'bg-linear-to-br from-sky-500 via-cyan-500 to-blue-600'
            : 'bg-linear-to-br from-rose-600 via-rose-500 to-red-600',
          accentColor: executionProfit >= 0 ? '#0284c7' : '#dc2626',
          helper: `Margen ${executionMargin.toFixed(1)}% solo en proyectos en ejecución`,
          chartType: widget.chartType,
          gaugeValue: Math.max(0, Math.min(100, executionMargin)),
          icon: executionProfit >= 0 ? TrendingUp : TrendingDown,
        });
      case 'activeProjects':
        return renderMetricWidget({
          headline: 'Capacidad operativa',
          valueLabel: `${activeProjects} activas`,
          accentClass: 'bg-linear-to-br from-indigo-500 via-violet-500 to-fuchsia-500',
          accentColor: '#6366f1',
          helper: `Avance físico promedio ${averageExecutionProgress.toFixed(1)}%`,
          chartType: widget.chartType,
          gaugeValue: averageExecutionProgress,
          icon: Construction,
        });
      case 'executionTrend':
        return (
          <div className="flex h-full flex-col gap-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200/70 bg-emerald-50/80 px-3 py-1 text-[10px] font-black uppercase tracking-[0.28em] text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300">
                  <Sparkles size={11} />
                  Solo ejecución
                </div>
                <p className="text-[11px] font-black uppercase tracking-[0.32em] text-slate-400">Pulso financiero activo</p>
                <p className="mt-2 text-sm font-semibold text-slate-500 dark:text-slate-400">
                  Tendencia diaria de ganancia de las obras en ejecución. Cotización y evaluación quedan fuera del neto.
                </p>
              </div>
              <div className="rounded-2xl bg-linear-to-br from-emerald-500 to-sky-500 p-3 text-white shadow-lg">
                <TrendingUp size={18} />
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-emerald-100 bg-emerald-50/80 px-4 py-3 dark:border-emerald-500/20 dark:bg-emerald-500/10">
                <p className="text-[10px] font-black uppercase tracking-[0.24em] text-emerald-500">Ingreso activo</p>
                <p className="mt-2 text-lg font-black text-emerald-700 dark:text-emerald-300">{formatCurrency(executionIncome)}</p>
              </div>
              <div className="rounded-2xl border border-rose-100 bg-rose-50/80 px-4 py-3 dark:border-rose-500/20 dark:bg-rose-500/10">
                <p className="text-[10px] font-black uppercase tracking-[0.24em] text-rose-500">Gasto activo</p>
                <p className="mt-2 text-lg font-black text-rose-700 dark:text-rose-300">{formatCurrency(executionSpent)}</p>
              </div>
              <div className="rounded-2xl border border-sky-100 bg-sky-50/80 px-4 py-3 dark:border-sky-500/20 dark:bg-sky-500/10">
                <p className="text-[10px] font-black uppercase tracking-[0.24em] text-sky-500">Utilidad</p>
                <p className="mt-2 text-lg font-black text-sky-700 dark:text-sky-300">{formatCurrency(executionProfit)}</p>
              </div>
            </div>
            <div className="min-h-55 flex-1">
              <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={220}>
                {widget.chartType === 'line' ? (
                  <LineChart data={profitTrendData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                    <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 700 }} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 700 }} tickFormatter={(value) => `Q${value >= 1000 ? `${Math.round(value / 1000)}k` : value}`} />
                    <Tooltip formatter={(value: any) => [formatCurrency(value), 'Ganancia']} />
                    <Line type="monotone" dataKey="profit" stroke="#10b981" strokeWidth={3} dot={{ r: 2 }} />
                  </LineChart>
                ) : widget.chartType === 'bar' ? (
                  <BarChart data={profitTrendData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                    <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 700 }} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 700 }} tickFormatter={(value) => `Q${value >= 1000 ? `${Math.round(value / 1000)}k` : value}`} />
                    <Tooltip formatter={(value: any) => [formatCurrency(value), 'Ganancia']} />
                    <Bar dataKey="profit" fill="#0ea5e9" radius={[8, 8, 0, 0]} />
                  </BarChart>
                ) : (
                  <AreaChart data={profitTrendData}>
                    <defs>
                      <linearGradient id="executionTrendFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.36} />
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                    <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 700 }} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 700 }} tickFormatter={(value) => `Q${value >= 1000 ? `${Math.round(value / 1000)}k` : value}`} />
                    <Tooltip formatter={(value: any) => [formatCurrency(value), 'Ganancia']} />
                    <Area type="monotone" dataKey="profit" stroke="#10b981" strokeWidth={3} fill="url(#executionTrendFill)" />
                  </AreaChart>
                )}
              </ResponsiveContainer>
            </div>
          </div>
        );
      case 'pipelineSnapshot':
        return (
          <div className="flex h-full flex-col gap-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[11px] font-black uppercase tracking-[0.32em] text-slate-400">Embudo comercial y operativo</p>
                <p className="mt-2 text-sm font-semibold text-slate-500 dark:text-slate-400">
                  Visibilidad separada entre cotización, evaluación y ejecución para que el neto no mezcle etapas.
                </p>
              </div>
              <div className="rounded-2xl bg-linear-to-br from-violet-500 via-indigo-500 to-sky-500 p-3 text-white shadow-lg">
                <LayoutGrid size={18} />
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-violet-100 bg-violet-50/80 px-4 py-3 dark:border-violet-500/20 dark:bg-violet-500/10">
                <p className="text-[10px] font-black uppercase tracking-[0.24em] text-violet-500">Cotizaciones</p>
                <p className="mt-2 text-lg font-black text-violet-700 dark:text-violet-300">{quotationQuotes.length}</p>
                <p className="mt-1 text-xs font-semibold text-slate-500 dark:text-slate-400">{formatCurrency(quotationValue)}</p>
              </div>
              <div className="rounded-2xl border border-fuchsia-100 bg-fuchsia-50/80 px-4 py-3 dark:border-fuchsia-500/20 dark:bg-fuchsia-500/10">
                <p className="text-[10px] font-black uppercase tracking-[0.24em] text-fuchsia-500">Evaluación</p>
                <p className="mt-2 text-lg font-black text-fuchsia-700 dark:text-fuchsia-300">{evaluationProjects.length}</p>
                <p className="mt-1 text-xs font-semibold text-slate-500 dark:text-slate-400">{formatCurrency(evaluationBudget)}</p>
              </div>
              <div className="rounded-2xl border border-sky-100 bg-sky-50/80 px-4 py-3 dark:border-sky-500/20 dark:bg-sky-500/10">
                <p className="text-[10px] font-black uppercase tracking-[0.24em] text-sky-500">Ejecución</p>
                <p className="mt-2 text-lg font-black text-sky-700 dark:text-sky-300">{executionProjects.length}</p>
                <p className="mt-1 text-xs font-semibold text-slate-500 dark:text-slate-400">{formatCurrency(executionBudget)}</p>
              </div>
            </div>
            <div className="min-h-55 flex-1">
              <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={220}>
                {widget.chartType === 'donut' ? (
                  <PieChart>
                    <Pie data={pipelineData} dataKey="value" nameKey="name" innerRadius={65} outerRadius={92} paddingAngle={4}>
                      {pipelineData.map((entry) => (
                        <Cell key={entry.name} fill={entry.fill} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value: any, _name: any, item: any) => [formatCurrency(value), item?.payload?.name || 'Valor']} />
                    <Legend />
                  </PieChart>
                ) : (
                  <BarChart data={pipelineData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 700 }} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 700 }} tickFormatter={(value) => `Q${value >= 1000 ? `${Math.round(value / 1000)}k` : value}`} />
                    <Tooltip formatter={(value: any) => [formatCurrency(value), 'Monto']} />
                    <Bar dataKey="value" radius={[8, 8, 0, 0]}>
                      {pipelineData.map((entry) => (
                        <Cell key={entry.name} fill={entry.fill} />
                      ))}
                    </Bar>
                  </BarChart>
                )}
              </ResponsiveContainer>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-2xl border border-slate-200/70 bg-slate-50/70 px-4 py-3 dark:border-slate-700 dark:bg-slate-800/70">
                <p className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-400">Gasto de evaluación</p>
                <p className="mt-2 text-lg font-black text-slate-900 dark:text-white">{formatCurrency(evaluationSpent)}</p>
              </div>
              <div className="rounded-2xl border border-slate-200/70 bg-slate-50/70 px-4 py-3 dark:border-slate-700 dark:bg-slate-800/70">
                <p className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-400">Cobertura activa</p>
                <p className="mt-2 text-lg font-black text-slate-900 dark:text-white">{activeExecutionCoverage.toFixed(1)}%</p>
              </div>
            </div>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="space-y-4 min-w-0 overflow-x-hidden p-4">
      <header className="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-slate-800 flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">Tablero de Control</h1>
          {lastLoadedAt && (
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">
              Actualizado: {lastLoadedAt.toLocaleTimeString('es-GT', { hour: '2-digit', minute: '2-digit' })}
              {(startDate || endDate) && (
                <span className="ml-2 text-primary">
                  · Filtro activo{startDate ? ` desde ${startDate.toLocaleDateString('es-GT')}` : ''}{endDate ? ` hasta ${endDate.toLocaleDateString('es-GT')}` : ''}
                </span>
              )}
            </p>
          )}
        </div>
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
            <label htmlFor="date-start" className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Filtrar por Fecha</label>
            <div className="flex items-center gap-1">
              <input
                id="date-start"
                type="date"
                aria-label="Fecha de inicio del filtro"
                onChange={(e) => setStartDate(e.target.value ? new Date(e.target.value) : null)}
                className="px-3 py-1.5 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-bold text-slate-700 dark:text-slate-200 focus:ring-2 focus:ring-primary outline-none"
              />
              <span className="text-sm text-slate-400">-</span>
              <input
                id="date-end"
                type="date"
                aria-label="Fecha de fin del filtro"
                onChange={(e) => setEndDate(e.target.value ? new Date(e.target.value) : null)}
                className="px-3 py-1.5 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-bold text-slate-700 dark:text-slate-200 focus:ring-2 focus:ring-primary outline-none"
              />
            </div>
          </div>
        </div>
      </header>

      {/* ── Navegación de páginas ── */}
      <nav className="flex items-center gap-2 flex-wrap">
        {PAGES.map((label, idx) => (
          <button
            key={idx}
            type="button"
            onClick={() => setActivePage(idx)}
            className={cn(
              'relative px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all border',
              activePage === idx
                ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 border-slate-900 dark:border-white shadow-md'
                : 'bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:border-slate-400'
            )}
          >
            <span className="mr-1.5 opacity-50">{String(idx + 1).padStart(2, '0')}</span>{label}
            {idx === 0 && overdueTasksCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-red-500 text-white text-[9px] font-black px-1">
                {overdueTasksCount}
              </span>
            )}
          </button>
        ))}
      </nav>
      {/* ── PÁGINA 0: Resumen Ejecutivo ── */}
      <AnimatePresence mode="wait">
      {activePage === 0 && (
      <motion.div key="page0" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -16 }} transition={{ duration: 0.25 }}>
      <section className="space-y-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 rounded-full border border-sky-200/70 bg-sky-50/80 px-3 py-1 text-[11px] font-black uppercase tracking-[0.28em] text-sky-700 dark:border-sky-500/20 dark:bg-sky-500/10 dark:text-sky-300">
              <SlidersHorizontal size={12} />
              Panel ejecutivo configurable
            </div>
            <h2 className="text-2xl font-black tracking-tight text-slate-950 dark:text-white">Métricas clave para la constructora</h2>
            <p className="max-w-3xl text-sm font-semibold leading-6 text-slate-500 dark:text-slate-400">
              Esta franja superior vuelve a separar lo que ya está en obra de lo que sigue en cotización o evaluación.
              Puedes reordenar tarjetas, cambiar tamaño y alternar su visualización sin perder la configuración.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => setIsWidgetEditMode((prev) => !prev)}
              className={cn(
                'inline-flex items-center gap-2 rounded-2xl border px-4 py-2 text-xs font-black uppercase tracking-[0.24em] transition-colors',
                isWidgetEditMode
                  ? 'border-slate-900 bg-slate-900 text-white dark:border-white dark:bg-white dark:text-slate-900'
                  : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800'
              )}
            >
              <LayoutGrid size={14} />
              {isWidgetEditMode ? 'Cerrar personalización' : 'Personalizar tablero'}
            </button>
            <button
              type="button"
              onClick={resetDashboardWidgets}
              className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-xs font-black uppercase tracking-[0.24em] text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              <RotateCcw size={14} />
              Restablecer
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-12 xl:auto-rows-[minmax(260px,auto)]">
          {dashboardWidgets.map((widget, index) => {
            const content = (
              <div className={widgetSurfaceClass}>
                <div className="pointer-events-none absolute inset-0">
                  <div className="absolute -right-16 top-0 h-32 w-32 rounded-full bg-linear-to-br from-sky-400/20 via-cyan-300/10 to-transparent blur-3xl" />
                  <div className="absolute bottom-0 left-0 h-28 w-28 rounded-full bg-linear-to-br from-violet-400/15 via-fuchsia-300/10 to-transparent blur-3xl" />
                </div>
                <div className="relative z-10 flex h-full flex-col gap-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400">
                      Widget {String(index + 1).padStart(2, '0')}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <select
                        aria-label="Tamaño del widget"
                        value={widget.size}
                        onChange={(e) => updateWidgetLayout(widget.id, { size: e.target.value as DashboardWidgetSize })}
                        className="rounded-xl border border-slate-200 bg-white/90 px-3 py-2 text-[11px] font-black uppercase tracking-[0.2em] text-slate-600 dark:border-slate-700 dark:bg-slate-800/90 dark:text-slate-200"
                      >
                        <option value="compact">Compacta</option>
                        <option value="wide">Ancha</option>
                        <option value="tall">Alta</option>
                      </select>
                      <select
                        aria-label="Tipo de gráfica del widget"
                        value={widget.chartType}
                        onChange={(e) => updateWidgetLayout(widget.id, { chartType: e.target.value })}
                        className="rounded-xl border border-slate-200 bg-white/90 px-3 py-2 text-[11px] font-black uppercase tracking-[0.2em] text-slate-600 dark:border-slate-700 dark:bg-slate-800/90 dark:text-slate-200"
                      >
                        {DASHBOARD_WIDGET_CHART_OPTIONS[widget.id].map((option) => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                      {isWidgetEditMode && (
                        <>
                          <button
                            type="button"
                            onClick={() => moveWidget(widget.id, 'left')}
                            className="rounded-xl border border-slate-200 bg-white/90 p-2 text-slate-600 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800/90 dark:text-slate-200 dark:hover:bg-slate-800"
                            title="Mover a la izquierda"
                            aria-label="Mover a la izquierda"
                          >
                            <ArrowLeft size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={() => moveWidget(widget.id, 'right')}
                            className="rounded-xl border border-slate-200 bg-white/90 p-2 text-slate-600 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800/90 dark:text-slate-200 dark:hover:bg-slate-800"
                            title="Mover a la derecha"
                            aria-label="Mover a la derecha"
                          >
                            <ArrowRight size={14} />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="min-h-0 flex-1">
                    {renderWidgetBody(widget)}
                  </div>
                </div>
              </div>
            );

            return (
              <div key={widget.id} className={getWidgetGridClass(widget.size)}>
                {cardStyle === '3d-tilt' ? (
                  <ParallaxCard className="h-full">{content}</ParallaxCard>
                ) : (
                  content
                )}
              </div>
            );
          })}
        </div>
      </section>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 min-w-0">
        <div className="lg:col-span-2 space-y-8 min-w-0">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 min-w-0">
            <div className="bg-white dark:bg-slate-900 p-8 rounded-3xl shadow-sm border border-slate-100 dark:border-slate-800 transition-all duration-300">
              <div className="mb-6 flex items-center justify-between gap-3">
                <h3 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-widest">Tendencia de Ganancia Global</h3>
                <select
                  aria-label="Tipo de gráfica: Tendencia de Ganancia"
                  value={chartPreferences.profitTrend}
                  onChange={(e) => updateChartPreference('profitTrend', e.target.value)}
                  className="px-3 py-2 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-200 focus:ring-2 focus:ring-primary outline-none"
                >
                  {CHART_TYPE_OPTIONS.profitTrend.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </div>
              <div className="h-64 min-w-0">
                <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={220}>
                  {chartPreferences.profitTrend === 'line' ? (
                    <LineChart data={profitTrendData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" className="dark:stroke-slate-800/50" />
                      <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 700 }} dy={10} />
                      <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 700 }} tickFormatter={(value) => `Q${value >= 1000 ? (value / 1000).toFixed(0) + 'k' : value}`} />
                      <Tooltip contentStyle={{ backgroundColor: 'rgba(15, 23, 42, 0.9)', borderRadius: '16px', border: 'none', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)', backdropFilter: 'blur(8px)' }} itemStyle={{ color: '#fff', fontSize: '12px', fontWeight: 700 }} labelStyle={{ color: '#94a3b8', fontSize: '10px', fontWeight: 800, textTransform: 'uppercase', marginBottom: '4px' }} formatter={(value: any) => [formatCurrency(value), 'Ganancia']} />
                      <Line type="monotone" dataKey="profit" stroke="#10b981" strokeWidth={3} dot={{ r: 2 }} activeDot={{ r: 6 }} />
                    </LineChart>
                  ) : chartPreferences.profitTrend === 'bar' ? (
                    <BarChart data={profitTrendData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" className="dark:stroke-slate-800/50" />
                      <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 700 }} dy={10} />
                      <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 700 }} tickFormatter={(value) => `Q${value >= 1000 ? (value / 1000).toFixed(0) + 'k' : value}`} />
                      <Tooltip contentStyle={{ backgroundColor: 'rgba(15, 23, 42, 0.9)', borderRadius: '16px', border: 'none', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)', backdropFilter: 'blur(8px)' }} itemStyle={{ color: '#fff', fontSize: '12px', fontWeight: 700 }} labelStyle={{ color: '#94a3b8', fontSize: '10px', fontWeight: 800, textTransform: 'uppercase', marginBottom: '4px' }} formatter={(value: any) => [formatCurrency(value), 'Ganancia']} />
                      <Bar dataKey="profit" fill="#10b981" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  ) : chartPreferences.profitTrend === 'composed' ? (
                    <ComposedChart data={profitTrendData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" className="dark:stroke-slate-800/50" />
                      <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 700 }} dy={10} />
                      <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 700 }} tickFormatter={(value) => `Q${value >= 1000 ? (value / 1000).toFixed(0) + 'k' : value}`} />
                      <Tooltip contentStyle={{ backgroundColor: 'rgba(15, 23, 42, 0.9)', borderRadius: '16px', border: 'none', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)', backdropFilter: 'blur(8px)' }} itemStyle={{ color: '#fff', fontSize: '12px', fontWeight: 700 }} labelStyle={{ color: '#94a3b8', fontSize: '10px', fontWeight: 800, textTransform: 'uppercase', marginBottom: '4px' }} formatter={(value: any) => [formatCurrency(value), 'Ganancia']} />
                      <Bar dataKey="profit" fill="#34d399" radius={[6, 6, 0, 0]} opacity={0.55} />
                      <Line type="monotone" dataKey="profit" stroke="#059669" strokeWidth={3} dot={false} />
                    </ComposedChart>
                  ) : chartPreferences.profitTrend === 'step' ? (
                    <LineChart data={profitTrendData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" className="dark:stroke-slate-800/50" />
                      <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 700 }} dy={10} />
                      <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 700 }} tickFormatter={(value) => `Q${value >= 1000 ? (value / 1000).toFixed(0) + 'k' : value}`} />
                      <Tooltip contentStyle={{ backgroundColor: 'rgba(15, 23, 42, 0.9)', borderRadius: '16px', border: 'none', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)', backdropFilter: 'blur(8px)' }} itemStyle={{ color: '#fff', fontSize: '12px', fontWeight: 700 }} labelStyle={{ color: '#94a3b8', fontSize: '10px', fontWeight: 800, textTransform: 'uppercase', marginBottom: '4px' }} formatter={(value: any) => [formatCurrency(value), 'Ganancia']} />
                      <Line type="stepAfter" dataKey="profit" stroke="#10b981" strokeWidth={3} dot={{ r: 2 }} />
                    </LineChart>
                  ) : (
                    <AreaChart data={profitTrendData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id="colorProfit" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" className="dark:stroke-slate-800/50" />
                      <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 700 }} dy={10} />
                      <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 700 }} tickFormatter={(value) => `Q${value >= 1000 ? (value / 1000).toFixed(0) + 'k' : value}`} />
                      <Tooltip contentStyle={{ backgroundColor: 'rgba(15, 23, 42, 0.9)', borderRadius: '16px', border: 'none', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)', backdropFilter: 'blur(8px)' }} itemStyle={{ color: '#fff', fontSize: '12px', fontWeight: 700 }} labelStyle={{ color: '#94a3b8', fontSize: '10px', fontWeight: 800, textTransform: 'uppercase', marginBottom: '4px' }} formatter={(value: any) => [formatCurrency(value), 'Ganancia']} />
                      <Area type="monotone" dataKey="profit" stroke="#10b981" strokeWidth={4} fillOpacity={1} fill="url(#colorProfit)" dot={{ r: 0 }} activeDot={{ r: 6, fill: '#10b981', stroke: '#fff', strokeWidth: 2 }} name="Ganancia" />
                    </AreaChart>
                  )}
                </ResponsiveContainer>
              </div>
            </div>

            <div className="bg-white dark:bg-slate-900 p-8 rounded-theme shadow-(--shadow-theme) border border-slate-100 dark:border-slate-800 transition-all duration-300 hover:shadow-lg">
              <div className="mb-6 flex items-center justify-between gap-3">
                <h3 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-widest">Salud Financiera por Proyecto</h3>
                <select
                  aria-label="Tipo de gráfica: Salud Financiera"
                  value={chartPreferences.projectHealth}
                  onChange={(e) => updateChartPreference('projectHealth', e.target.value)}
                  className="px-3 py-2 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-200 focus:ring-2 focus:ring-primary outline-none"
                >
                  {CHART_TYPE_OPTIONS.projectHealth.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </div>
              <div className="h-64 min-w-0">
                <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={220}>
                  {chartPreferences.projectHealth === 'line' ? (
                    <LineChart data={projectHealthData} margin={{ top: 10, right: 10, left: 0, bottom: 30 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" className="dark:stroke-slate-800/50" />
                      <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 9, fontWeight: 700 }} interval={0} minTickGap={10} angle={-45} textAnchor="end" height={80} />
                      <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 9, fontWeight: 700 }} tickFormatter={(value) => `Q${value >= 1000 ? (value / 1000).toFixed(0) + 'k' : value}`} />
                      <Tooltip contentStyle={{ backgroundColor: 'rgba(15, 23, 42, 0.9)', borderRadius: '16px', border: 'none', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)', backdropFilter: 'blur(8px)' }} itemStyle={{ color: '#fff', fontSize: '12px', fontWeight: 700 }} labelStyle={{ color: '#94a3b8', fontSize: '10px', fontWeight: 800, textTransform: 'uppercase', marginBottom: '4px' }} formatter={(value: any) => [formatCurrency(value), '']} />
                      <Legend verticalAlign="top" align="right" iconType="circle" wrapperStyle={{ fontSize: '9px', fontWeight: 800, textTransform: 'uppercase', paddingBottom: '20px' }} />
                      <Line type="monotone" dataKey="presupuesto" stroke="#3b82f6" strokeWidth={2.5} name="Presupuesto" />
                      <Line type="monotone" dataKey="gastado" stroke="#ef4444" strokeWidth={2.5} name="Gastado" />
                    </LineChart>
                  ) : chartPreferences.projectHealth === 'area' ? (
                    <AreaChart data={projectHealthData} margin={{ top: 10, right: 10, left: 0, bottom: 30 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" className="dark:stroke-slate-800/50" />
                      <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 9, fontWeight: 700 }} interval={0} minTickGap={10} angle={-45} textAnchor="end" height={80} />
                      <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 9, fontWeight: 700 }} tickFormatter={(value) => `Q${value >= 1000 ? (value / 1000).toFixed(0) + 'k' : value}`} />
                      <Tooltip contentStyle={{ backgroundColor: 'rgba(15, 23, 42, 0.9)', borderRadius: '16px', border: 'none', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)', backdropFilter: 'blur(8px)' }} itemStyle={{ color: '#fff', fontSize: '12px', fontWeight: 700 }} labelStyle={{ color: '#94a3b8', fontSize: '10px', fontWeight: 800, textTransform: 'uppercase', marginBottom: '4px' }} formatter={(value: any) => [formatCurrency(value), '']} />
                      <Legend verticalAlign="top" align="right" iconType="circle" wrapperStyle={{ fontSize: '9px', fontWeight: 800, textTransform: 'uppercase', paddingBottom: '20px' }} />
                      <Area type="monotone" dataKey="presupuesto" stroke="#3b82f6" fill="#93c5fd" fillOpacity={0.3} name="Presupuesto" />
                      <Area type="monotone" dataKey="gastado" stroke="#ef4444" fill="#fda4af" fillOpacity={0.3} name="Gastado" />
                    </AreaChart>
                  ) : chartPreferences.projectHealth === 'composed' ? (
                    <ComposedChart data={projectHealthData} margin={{ top: 10, right: 10, left: 0, bottom: 30 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" className="dark:stroke-slate-800/50" />
                      <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 9, fontWeight: 700 }} interval={0} minTickGap={10} angle={-45} textAnchor="end" height={80} />
                      <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 9, fontWeight: 700 }} tickFormatter={(value) => `Q${value >= 1000 ? (value / 1000).toFixed(0) + 'k' : value}`} />
                      <Tooltip contentStyle={{ backgroundColor: 'rgba(15, 23, 42, 0.9)', borderRadius: '16px', border: 'none', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)', backdropFilter: 'blur(8px)' }} itemStyle={{ color: '#fff', fontSize: '12px', fontWeight: 700 }} labelStyle={{ color: '#94a3b8', fontSize: '10px', fontWeight: 800, textTransform: 'uppercase', marginBottom: '4px' }} formatter={(value: any) => [formatCurrency(value), '']} />
                      <Legend verticalAlign="top" align="right" iconType="circle" wrapperStyle={{ fontSize: '9px', fontWeight: 800, textTransform: 'uppercase', paddingBottom: '20px' }} />
                      <Bar dataKey="gastado" fill="#ef4444" radius={[4, 4, 0, 0]} name="Gastado" barSize={16} />
                      <Line type="monotone" dataKey="presupuesto" stroke="#2563eb" strokeWidth={3} name="Presupuesto" />
                    </ComposedChart>
                  ) : (
                    <BarChart data={projectHealthData} margin={{ top: 10, right: 10, left: 0, bottom: 30 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" className="dark:stroke-slate-800/50" />
                      <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 9, fontWeight: 700 }} interval={0} minTickGap={10} angle={-45} textAnchor="end" height={80} />
                      <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 9, fontWeight: 700 }} tickFormatter={(value) => `Q${value >= 1000 ? (value / 1000).toFixed(0) + 'k' : value}`} />
                      <Tooltip contentStyle={{ backgroundColor: 'rgba(15, 23, 42, 0.9)', borderRadius: '16px', border: 'none', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)', backdropFilter: 'blur(8px)' }} itemStyle={{ color: '#fff', fontSize: '12px', fontWeight: 700 }} labelStyle={{ color: '#94a3b8', fontSize: '10px', fontWeight: 800, textTransform: 'uppercase', marginBottom: '4px' }} formatter={(value: any) => [formatCurrency(value), '']} />
                      <Legend verticalAlign="top" align="right" iconType="circle" wrapperStyle={{ fontSize: '9px', fontWeight: 800, textTransform: 'uppercase', paddingBottom: '20px' }} />
                      <Bar dataKey="presupuesto" fill="#3b82f6" radius={[4, 4, 0, 0]} name="Presupuesto" barSize={chartPreferences.projectHealth === 'stacked-bar' ? 22 : 20} stackId={chartPreferences.projectHealth === 'stacked-bar' ? 'health' : undefined} />
                      <Bar dataKey="gastado" fill="#ef4444" radius={[4, 4, 0, 0]} name="Gastado" barSize={chartPreferences.projectHealth === 'stacked-bar' ? 22 : 20} stackId={chartPreferences.projectHealth === 'stacked-bar' ? 'health' : undefined} />
                    </BarChart>
                  )}
                </ResponsiveContainer>
              </div>
            </div>

            <div className="bg-white dark:bg-slate-900 p-8 rounded-theme shadow-(--shadow-theme) border border-slate-100 dark:border-slate-800 transition-all duration-300 hover:shadow-lg">
              <div className="mb-6 flex items-center justify-between gap-3">
                <h3 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-widest">Estado de los Proyectos</h3>
                <select
                  aria-label="Tipo de gráfica: Estado de Proyectos"
                  value={chartPreferences.projectStatus}
                  onChange={(e) => updateChartPreference('projectStatus', e.target.value)}
                  className="px-3 py-2 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-200 focus:ring-2 focus:ring-primary outline-none"
                >
                  {CHART_TYPE_OPTIONS.projectStatus.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </div>
              <div className="h-64 min-w-0">
                <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={220}>
                  {chartPreferences.projectStatus === 'bar' ? (
                    <BarChart data={statusData} margin={{ top: 10, right: 10, left: 0, bottom: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" className="dark:stroke-slate-800/50" />
                      <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 700 }} />
                      <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 700 }} allowDecimals={false} />
                      <Tooltip contentStyle={{ backgroundColor: 'rgba(15, 23, 42, 0.9)', borderRadius: '16px', border: 'none', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)', backdropFilter: 'blur(8px)' }} itemStyle={{ color: '#fff', fontSize: '12px', fontWeight: 700 }} />
                      <Bar dataKey="value" radius={[8, 8, 0, 0]}>
                        {statusData.map((entry, index) => <Cell key={`status-bar-${index}`} fill={COLORS[index % COLORS.length]} />)}
                      </Bar>
                    </BarChart>
                  ) : chartPreferences.projectStatus === 'radar' ? (
                    <RadarChart data={statusRadarData} outerRadius={90}>
                      <PolarGrid stroke="#334155" strokeOpacity={0.3} />
                      <PolarAngleAxis dataKey="subject" tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 700 }} />
                      <PolarRadiusAxis tick={{ fill: '#94a3b8', fontSize: 9 }} allowDecimals={false} />
                      <Tooltip contentStyle={{ backgroundColor: 'rgba(15, 23, 42, 0.9)', borderRadius: '16px', border: 'none', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)', backdropFilter: 'blur(8px)' }} itemStyle={{ color: '#fff', fontSize: '12px', fontWeight: 700 }} />
                      <Radar name="Estados" dataKey="value" stroke="#6366f1" fill="#6366f1" fillOpacity={0.35} />
                    </RadarChart>
                  ) : (
                    <PieChart margin={{ top: 0, right: 0, left: 0, bottom: 20 }}>
                      <Pie
                        data={statusData}
                        cx="50%"
                        cy="45%"
                        innerRadius={chartPreferences.projectStatus === 'pie' ? 0 : 60}
                        outerRadius={80}
                        paddingAngle={8}
                        dataKey="value"
                      >
                        {statusData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} stroke="none" />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={{ backgroundColor: 'rgba(15, 23, 42, 0.9)', borderRadius: '16px', border: 'none', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)', backdropFilter: 'blur(8px)' }} itemStyle={{ color: '#fff', fontSize: '12px', fontWeight: 700 }} />
                      <Legend verticalAlign="bottom" align="center" iconType="circle" wrapperStyle={{ fontSize: '9px', fontWeight: 800, textTransform: 'uppercase', paddingTop: '20px' }} />
                    </PieChart>
                  )}
                </ResponsiveContainer>
              </div>
            </div>

            <div className="bg-white dark:bg-slate-900 p-8 rounded-theme shadow-(--shadow-theme) border border-slate-100 dark:border-slate-800 transition-all duration-300 hover:shadow-lg">
              <div className="mb-6 flex items-center justify-between gap-3">
                <h3 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-widest">Gastos por Categoría</h3>
                <select
                  aria-label="Tipo de gráfica: Gastos por Categoría"
                  value={chartPreferences.expenseCategory}
                  onChange={(e) => updateChartPreference('expenseCategory', e.target.value)}
                  className="px-3 py-2 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-200 focus:ring-2 focus:ring-primary outline-none"
                >
                  {CHART_TYPE_OPTIONS.expenseCategory.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </div>
              <div className="h-64 min-w-0">
                <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={220}>
                  {chartPreferences.expenseCategory === 'bar' ? (
                    <BarChart data={expenseByCategoryData} margin={{ top: 10, right: 10, left: 0, bottom: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" className="dark:stroke-slate-800/50" />
                      <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 9, fontWeight: 700 }} interval={0} angle={-30} textAnchor="end" height={70} />
                      <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 9, fontWeight: 700 }} tickFormatter={(value) => `Q${value >= 1000 ? (value / 1000).toFixed(0) + 'k' : value}`} />
                      <Tooltip contentStyle={{ backgroundColor: 'rgba(15, 23, 42, 0.9)', borderRadius: '16px', border: 'none', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)', backdropFilter: 'blur(8px)' }} itemStyle={{ color: '#fff', fontSize: '12px', fontWeight: 700 }} formatter={(value: any) => [formatCurrency(value), 'Total']} />
                      <Bar dataKey="value" radius={[8, 8, 0, 0]}>
                        {expenseByCategoryData.map((entry, index) => <Cell key={`expense-bar-${index}`} fill={COLORS[index % COLORS.length]} />)}
                      </Bar>
                    </BarChart>
                  ) : chartPreferences.expenseCategory === 'radar' ? (
                    <RadarChart data={expenseRadarData} outerRadius={90}>
                      <PolarGrid stroke="#334155" strokeOpacity={0.3} />
                      <PolarAngleAxis dataKey="subject" tick={{ fill: '#94a3b8', fontSize: 9, fontWeight: 700 }} />
                      <PolarRadiusAxis tick={{ fill: '#94a3b8', fontSize: 9 }} />
                      <Tooltip contentStyle={{ backgroundColor: 'rgba(15, 23, 42, 0.9)', borderRadius: '16px', border: 'none', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)', backdropFilter: 'blur(8px)' }} itemStyle={{ color: '#fff', fontSize: '12px', fontWeight: 700 }} formatter={(value: any) => [formatCurrency(value), 'Total']} />
                      <Radar name="Total" dataKey="value" stroke="#f97316" fill="#f97316" fillOpacity={0.3} />
                    </RadarChart>
                  ) : chartPreferences.expenseCategory === 'line' ? (
                    <LineChart data={expenseByCategoryData} margin={{ top: 10, right: 10, left: 0, bottom: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" className="dark:stroke-slate-800/50" />
                      <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 9, fontWeight: 700 }} interval={0} angle={-30} textAnchor="end" height={70} />
                      <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 9, fontWeight: 700 }} tickFormatter={(value) => `Q${value >= 1000 ? (value / 1000).toFixed(0) + 'k' : value}`} />
                      <Tooltip contentStyle={{ backgroundColor: 'rgba(15, 23, 42, 0.9)', borderRadius: '16px', border: 'none', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)', backdropFilter: 'blur(8px)' }} itemStyle={{ color: '#fff', fontSize: '12px', fontWeight: 700 }} formatter={(value: any) => [formatCurrency(value), 'Total']} />
                      <Line type="monotone" dataKey="value" stroke="#f97316" strokeWidth={3} />
                    </LineChart>
                  ) : (
                    <PieChart margin={{ top: 0, right: 0, left: 0, bottom: 20 }}>
                      <Pie
                        data={expenseByCategoryData}
                        cx="50%"
                        cy="45%"
                        innerRadius={chartPreferences.expenseCategory === 'pie' ? 0 : 60}
                        outerRadius={80}
                        paddingAngle={8}
                        dataKey="value"
                      >
                        {expenseByCategoryData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} stroke="none" />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={{ backgroundColor: 'rgba(15, 23, 42, 0.9)', borderRadius: '16px', border: 'none', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)', backdropFilter: 'blur(8px)' }} itemStyle={{ color: '#fff', fontSize: '12px', fontWeight: 700 }} formatter={(value: any) => [formatCurrency(value), 'Total']} />
                      <Legend verticalAlign="bottom" align="center" iconType="circle" wrapperStyle={{ fontSize: '9px', fontWeight: 800, textTransform: 'uppercase', paddingTop: '20px' }} />
                    </PieChart>
                  )}
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Stacked Bar Chart for Progress Comparison */}
          <div className="bg-white dark:bg-slate-900 p-8 rounded-theme shadow-(--shadow-theme) border border-slate-100 dark:border-slate-800 transition-all duration-300 hover:shadow-lg">
            <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <h3 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-widest flex items-center gap-2">
                <TrendingUp size={18} className="text-primary" />
                Comparativa de Avance (Físico vs Financiero)
              </h3>
              <div className="flex items-center gap-2">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Vista</label>
                <select
                  aria-label="Vista de comparativa de avance"
                  value={progressChartScope}
                  onChange={(e) => setProgressChartScope(e.target.value as 'all' | 'selected')}
                  className="px-3 py-2 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-200 focus:ring-2 focus:ring-primary outline-none"
                >
                  <option value="all">Todos los proyectos</option>
                  <option value="selected" disabled={!selectedQuickProjectId}>
                    Solo proyecto seleccionado
                  </option>
                </select>
                <select
                  aria-label="Tipo de gráfica: Comparativa de Avance"
                  value={chartPreferences.progressComparison}
                  onChange={(e) => updateChartPreference('progressComparison', e.target.value)}
                  className="px-3 py-2 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-200 focus:ring-2 focus:ring-primary outline-none"
                >
                  {CHART_TYPE_OPTIONS.progressComparison.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </div>
            </div>
            {progressChartScope === 'selected' && !selectedQuickProjectId && (
              <p className="mb-4 text-xs font-bold text-amber-600 dark:text-amber-400">
                Seleccione un proyecto en "Actualización rápida de avance" para ver su comparativa individual.
              </p>
            )}
            <div className="h-80 min-w-0">
              <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={220}>
                {chartPreferences.progressComparison === 'line' ? (
                  <LineChart data={progressComparisonChartData} margin={{ top: 20, right: 30, left: 20, bottom: 60 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" className="dark:stroke-slate-800/50" />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 700 }} angle={-45} textAnchor="end" interval={0} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 700 }} tickFormatter={(value) => `${value.toFixed(1)}%`} domain={[0, 100]} />
                    <Tooltip contentStyle={{ backgroundColor: 'rgba(15, 23, 42, 0.9)', borderRadius: '16px', border: 'none', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)', backdropFilter: 'blur(8px)' }} itemStyle={{ color: '#fff', fontSize: '12px', fontWeight: 700 }} labelStyle={{ color: '#94a3b8', fontSize: '10px', fontWeight: 800, textTransform: 'uppercase', marginBottom: '4px' }} formatter={(value: any) => [`${value.toFixed(1)}%`, '']} />
                    <Legend verticalAlign="top" align="right" iconType="circle" wrapperStyle={{ fontSize: '10px', fontWeight: 800, textTransform: 'uppercase', paddingBottom: '20px' }} />
                    <Line type="monotone" dataKey="fisico" stroke="#3b82f6" name="Avance Físico" strokeWidth={3} />
                    <Line type="monotone" dataKey="financiero" stroke="#ef4444" name="Avance Financiero" strokeWidth={3} />
                  </LineChart>
                ) : chartPreferences.progressComparison === 'area' ? (
                  <AreaChart data={progressComparisonChartData} margin={{ top: 20, right: 30, left: 20, bottom: 60 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" className="dark:stroke-slate-800/50" />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 700 }} angle={-45} textAnchor="end" interval={0} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 700 }} tickFormatter={(value) => `${value.toFixed(1)}%`} domain={[0, 100]} />
                    <Tooltip contentStyle={{ backgroundColor: 'rgba(15, 23, 42, 0.9)', borderRadius: '16px', border: 'none', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)', backdropFilter: 'blur(8px)' }} itemStyle={{ color: '#fff', fontSize: '12px', fontWeight: 700 }} labelStyle={{ color: '#94a3b8', fontSize: '10px', fontWeight: 800, textTransform: 'uppercase', marginBottom: '4px' }} formatter={(value: any) => [`${value.toFixed(1)}%`, '']} />
                    <Legend verticalAlign="top" align="right" iconType="circle" wrapperStyle={{ fontSize: '10px', fontWeight: 800, textTransform: 'uppercase', paddingBottom: '20px' }} />
                    <Area type="monotone" dataKey="fisico" stroke="#3b82f6" fill="#93c5fd" fillOpacity={0.3} name="Avance Físico" />
                    <Area type="monotone" dataKey="financiero" stroke="#ef4444" fill="#fda4af" fillOpacity={0.3} name="Avance Financiero" />
                  </AreaChart>
                ) : chartPreferences.progressComparison === 'radar' ? (
                  <RadarChart data={progressComparisonChartData.slice(0, 8)} outerRadius={95}>
                    <PolarGrid stroke="#334155" strokeOpacity={0.3} />
                    <PolarAngleAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 9, fontWeight: 700 }} />
                    <PolarRadiusAxis domain={[0, 100]} tick={{ fill: '#94a3b8', fontSize: 9 }} />
                    <Tooltip contentStyle={{ backgroundColor: 'rgba(15, 23, 42, 0.9)', borderRadius: '16px', border: 'none', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)', backdropFilter: 'blur(8px)' }} itemStyle={{ color: '#fff', fontSize: '12px', fontWeight: 700 }} labelStyle={{ color: '#94a3b8', fontSize: '10px', fontWeight: 800, textTransform: 'uppercase', marginBottom: '4px' }} formatter={(value: any) => [`${value.toFixed(1)}%`, '']} />
                    <Legend verticalAlign="top" align="right" iconType="circle" wrapperStyle={{ fontSize: '10px', fontWeight: 800, textTransform: 'uppercase', paddingBottom: '20px' }} />
                    <Radar dataKey="fisico" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.25} name="Avance Físico" />
                    <Radar dataKey="financiero" stroke="#ef4444" fill="#ef4444" fillOpacity={0.2} name="Avance Financiero" />
                  </RadarChart>
                ) : (
                  <BarChart data={progressComparisonChartData} margin={{ top: 20, right: 30, left: 20, bottom: 60 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" className="dark:stroke-slate-800/50" />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 700 }} angle={-45} textAnchor="end" interval={0} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 700 }} tickFormatter={(value) => `${value.toFixed(1)}%`} domain={[0, 100]} />
                    <Tooltip contentStyle={{ backgroundColor: 'rgba(15, 23, 42, 0.9)', borderRadius: '16px', border: 'none', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)', backdropFilter: 'blur(8px)' }} itemStyle={{ color: '#fff', fontSize: '12px', fontWeight: 700 }} labelStyle={{ color: '#94a3b8', fontSize: '10px', fontWeight: 800, textTransform: 'uppercase', marginBottom: '4px' }} formatter={(value: any, name: any) => {
                      if (name.includes('Restante') || name.includes('Pendiente')) return null;
                      return [`${value.toFixed(1)}%`, name];
                    }} />
                    <Legend verticalAlign="top" align="right" iconType="circle" wrapperStyle={{ fontSize: '10px', fontWeight: 800, textTransform: 'uppercase', paddingBottom: '20px' }} />
                    <Bar dataKey="fisico" stackId={chartPreferences.progressComparison === 'stacked-bar' ? 'a' : undefined} name="Avance Físico" fill="#3b82f6" barSize={30} />
                    <Bar dataKey="fisicoRestante" stackId={chartPreferences.progressComparison === 'stacked-bar' ? 'a' : undefined} name="Pendiente Físico" fill="#dbeafe" barSize={30} radius={[4, 4, 0, 0]} />
                    <Bar dataKey="financiero" stackId={chartPreferences.progressComparison === 'stacked-bar' ? 'b' : undefined} name="Avance Financiero" fill="#ef4444" barSize={30} />
                    <Bar dataKey="financieroRestante" stackId={chartPreferences.progressComparison === 'stacked-bar' ? 'b' : undefined} name="Pendiente Financiero" fill="#fee2e2" barSize={30} radius={[4, 4, 0, 0]} />
                  </BarChart>
                )}
              </ResponsiveContainer>
            </div>
          </div>

          {/* Gantt-style Progress Chart */}
          <div className="bg-white dark:bg-slate-900 p-6 rounded-theme shadow-(--shadow-theme) border border-slate-100 dark:border-slate-800 transition-all duration-300 hover:shadow-lg">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-5">
              <div className="flex items-center gap-4">
                <h3 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-widest flex items-center gap-2">
                  <TrendingUp size={18} className="text-primary" />
                  Cronograma de Avance por Obra
                </h3>
                <button
                  onClick={() => setIsQuickProgressModalOpen(true)}
                  className="p-1.5 bg-primary/10 text-primary rounded-lg hover:bg-primary/20 transition-colors"
                  title="Actualización rápida de avance"
                >
                  <Edit3 size={14} />
                </button>
              </div>
              <div className="flex items-center gap-3">
                <select
                  aria-label="Tipo de gráfica: Cronograma de Avance"
                  value={chartPreferences.scheduleProgress}
                  onChange={(e) => updateChartPreference('scheduleProgress', e.target.value)}
                  className="px-3 py-2 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-200 focus:ring-2 focus:ring-primary outline-none"
                >
                  {CHART_TYPE_OPTIONS.scheduleProgress.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-linear-to-r from-sky-500 to-indigo-500" />
                  <span className="text-[10px] font-bold text-slate-500 uppercase">Físico</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-linear-to-r from-rose-500 to-amber-500" />
                  <span className="text-[10px] font-bold text-slate-500 uppercase">Financiero</span>
                </div>
              </div>
            </div>
            <p className="mb-3 text-[10px] font-bold uppercase tracking-wider text-slate-500">
              Mostrando {ganttChartData.length} obra(s)
            </p>
            <div style={{ height: `${ganttChartHeight}px` }} className="min-w-0">
              <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={220}>
                {chartPreferences.scheduleProgress === 'radar' ? (
                  <RadarChart data={scheduleRadarData} outerRadius={120}>
                    <PolarGrid stroke="#334155" strokeOpacity={0.3} />
                    <PolarAngleAxis dataKey="subject" tick={{ fill: '#94a3b8', fontSize: 9, fontWeight: 700 }} />
                    <PolarRadiusAxis domain={[0, 100]} tick={{ fill: '#94a3b8', fontSize: 9 }} />
                    <Tooltip contentStyle={{ backgroundColor: 'rgba(15, 23, 42, 0.9)', borderRadius: '16px', border: 'none', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)', backdropFilter: 'blur(8px)' }} itemStyle={{ color: '#fff', fontSize: '12px', fontWeight: 700 }} />
                    <Legend verticalAlign="top" align="right" iconType="circle" wrapperStyle={{ fontSize: '10px', fontWeight: 800, textTransform: 'uppercase', paddingBottom: '20px' }} />
                    <Radar dataKey="physical" stroke="#0ea5e9" fill="#0ea5e9" fillOpacity={0.25} name="Físico" />
                    <Radar dataKey="financial" stroke="#f43f5e" fill="#f43f5e" fillOpacity={0.18} name="Financiero" />
                  </RadarChart>
                ) : chartPreferences.scheduleProgress === 'line' ? (
                  <LineChart data={scheduleTrendData} margin={{ top: 10, right: 24, left: 12, bottom: 42 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" className="dark:stroke-slate-800/50" />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 9, fontWeight: 700 }} angle={-25} textAnchor="end" height={56} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 9, fontWeight: 700 }} domain={[0, 100]} tickFormatter={(value) => `${value}%`} />
                    <Tooltip contentStyle={{ backgroundColor: 'rgba(15, 23, 42, 0.9)', borderRadius: '16px', border: 'none', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)', backdropFilter: 'blur(8px)' }} itemStyle={{ color: '#fff', fontSize: '12px', fontWeight: 700 }} formatter={(value: any) => [`${value.toFixed(1)}%`, '']} />
                    <Legend verticalAlign="top" align="right" iconType="circle" wrapperStyle={{ fontSize: '10px', fontWeight: 800, textTransform: 'uppercase', paddingBottom: '20px' }} />
                    <Line type="monotone" dataKey="physical" stroke="#0ea5e9" name="Físico" strokeWidth={3} />
                    <Line type="monotone" dataKey="financial" stroke="#f43f5e" name="Financiero" strokeWidth={3} />
                  </LineChart>
                ) : chartPreferences.scheduleProgress === 'area' ? (
                  <AreaChart data={scheduleTrendData} margin={{ top: 10, right: 24, left: 12, bottom: 42 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" className="dark:stroke-slate-800/50" />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 9, fontWeight: 700 }} angle={-25} textAnchor="end" height={56} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 9, fontWeight: 700 }} domain={[0, 100]} tickFormatter={(value) => `${value}%`} />
                    <Tooltip contentStyle={{ backgroundColor: 'rgba(15, 23, 42, 0.9)', borderRadius: '16px', border: 'none', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)', backdropFilter: 'blur(8px)' }} itemStyle={{ color: '#fff', fontSize: '12px', fontWeight: 700 }} formatter={(value: any) => [`${value.toFixed(1)}%`, '']} />
                    <Legend verticalAlign="top" align="right" iconType="circle" wrapperStyle={{ fontSize: '10px', fontWeight: 800, textTransform: 'uppercase', paddingBottom: '20px' }} />
                    <Area type="monotone" dataKey="physical" stroke="#0ea5e9" fill="#7dd3fc" fillOpacity={0.3} name="Físico" />
                    <Area type="monotone" dataKey="financial" stroke="#f43f5e" fill="#fda4af" fillOpacity={0.22} name="Financiero" />
                  </AreaChart>
                ) : chartPreferences.scheduleProgress === 'horizontal-bars' ? (
                  <BarChart data={scheduleTrendData} layout="vertical" margin={{ top: 10, right: 24, left: 12, bottom: 12 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" className="dark:stroke-slate-800/50" />
                    <XAxis type="number" domain={[0, 100]} tickFormatter={(value) => `${value}%`} axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 9, fontWeight: 700 }} />
                    <YAxis dataKey="name" type="category" width={140} axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 9, fontWeight: 800 }} />
                    <Tooltip contentStyle={{ backgroundColor: 'rgba(15, 23, 42, 0.9)', borderRadius: '16px', border: 'none', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)', backdropFilter: 'blur(8px)' }} itemStyle={{ color: '#fff', fontSize: '12px', fontWeight: 700 }} formatter={(value: any) => [`${value.toFixed(1)}%`, '']} />
                    <Legend verticalAlign="top" align="right" iconType="circle" wrapperStyle={{ fontSize: '10px', fontWeight: 800, textTransform: 'uppercase', paddingBottom: '20px' }} />
                    <Bar dataKey="physical" fill="#0ea5e9" radius={[0, 6, 6, 0]} name="Físico" barSize={10} />
                    <Bar dataKey="financial" fill="#f43f5e" radius={[0, 6, 6, 0]} name="Financiero" barSize={10} />
                  </BarChart>
                ) : (
                  <BarChart
                    data={ganttChartData}
                    layout="vertical"
                    margin={{ top: 6, right: 24, left: 6, bottom: 12 }}
                    barGap={-14}
                  >
                    <defs>
                      <linearGradient id="ganttPhysicalGradient" x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0%" stopColor="#0ea5e9" />
                        <stop offset="100%" stopColor="#6366f1" />
                      </linearGradient>
                      <linearGradient id="ganttFinancialGradient" x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0%" stopColor="#f43f5e" />
                        <stop offset="100%" stopColor="#f59e0b" />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" className="dark:stroke-slate-800/50" />
                    <XAxis
                      type="number"
                      domain={[0, totalDays]}
                      tickFormatter={formatXAxis}
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 700 }}
                      minTickGap={30}
                    />
                    <YAxis
                      dataKey="shortName"
                      type="category"
                      width={140}
                      tick={({ x, y, payload }) => (
                        <g transform={`translate(${x},${y})`}>
                          <text
                            x={-10}
                            y={0}
                            dy={4}
                            textAnchor="end"
                            fill="#64748b"
                            fontSize={9}
                            fontWeight={800}
                            className="dark:fill-slate-400"
                          >
                            {payload.value}
                          </text>
                        </g>
                      )}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip
                      cursor={{ fill: 'rgba(241, 245, 249, 0.5)' }}
                      content={({ active, payload, label }) => {
                        if (active && payload && payload.length) {
                          const data = payload[0].payload;
                          return (
                            <div className="bg-slate-900/95 backdrop-blur-md p-4 rounded-2xl border border-slate-800 shadow-2xl">
                              <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">{label}</p>
                              <div className="space-y-2">
                                <div className="flex items-center justify-between gap-8">
                                  <div className="flex items-center gap-2">
                                    <div className="w-2 h-2 bg-linear-to-r from-sky-500 to-indigo-500 rounded-full" />
                                    <span className="text-xs font-bold text-white">Avance Físico</span>
                                  </div>
                                  <span className="text-xs font-black text-blue-300">{data.physical.toFixed(1)}%</span>
                                </div>
                                <div className="flex items-center justify-between gap-8">
                                  <div className="flex items-center gap-2">
                                    <div className="w-2 h-2 bg-linear-to-r from-rose-500 to-amber-500 rounded-full" />
                                    <span className="text-xs font-bold text-white">Avance Financiero</span>
                                  </div>
                                  <span className="text-xs font-black text-rose-300">{data.financial.toFixed(1)}%</span>
                                </div>
                                <div className="pt-2 mt-2 border-t border-slate-800 flex flex-col gap-1">
                                  <p className="text-[9px] text-emerald-300 font-bold uppercase">Físico guardado: {data.physical.toFixed(1)}%</p>
                                  <p className="text-[9px] text-slate-400 font-bold uppercase">Inicio: {data.startDate || 'N/A'}</p>
                                  <p className="text-[9px] text-slate-400 font-bold uppercase">Fin: {data.endDate || 'N/A'}</p>
                                </div>
                              </div>
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                    <ReferenceLine
                      x={todayOffset}
                      stroke="#10b981"
                      strokeDasharray="3 3"
                      label={{
                        position: 'top',
                        value: 'Hoy',
                        fill: '#10b981',
                        fontSize: 10,
                        fontWeight: 800,
                        offset: 10,
                      }}
                    />
                    <Bar dataKey="startOffset" stackId="bg" fill="transparent" />
                    <Bar dataKey="duration" stackId="bg" fill="#e2e8f0" className="dark:fill-slate-800/50" radius={[0, 6, 6, 0]} barSize={14} />
                    <Bar dataKey="startOffset" stackId="phys" fill="transparent" />
                    <Bar
                      dataKey="physicalDuration"
                      stackId="phys"
                      fill="url(#ganttPhysicalGradient)"
                      radius={[0, 6, 6, 0]}
                      barSize={8}
                      onClick={(data) => navigate(`/projects/${data.id}`)}
                      className="cursor-pointer hover:opacity-80 transition-opacity"
                    />
                    <Bar dataKey="startOffset" stackId="fin" fill="transparent" />
                    <Bar
                      dataKey="financialDuration"
                      stackId="fin"
                      fill="url(#ganttFinancialGradient)"
                      radius={[0, 6, 6, 0]}
                      barSize={4}
                      onClick={(data) => navigate(`/projects/${data.id}`)}
                      className="cursor-pointer hover:opacity-80 transition-opacity"
                    />
                  </BarChart>
                )}
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800 transition-colors duration-300">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-6">Resumen Financiero Consolidado</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="p-4 bg-emerald-50 dark:bg-emerald-500/10 rounded-xl border border-emerald-100 dark:border-emerald-500/20">
                <p className="text-xs font-bold text-emerald-600 dark:text-emerald-400 uppercase mb-1">Ingresos</p>
                <p className="text-xl font-bold text-emerald-700 dark:text-emerald-300">{formatCurrency(financialSummary.totalIncome)}</p>
              </div>
              <div className="p-4 bg-rose-50 dark:bg-rose-500/10 rounded-xl border border-rose-100 dark:border-rose-500/20">
                <p className="text-xs font-bold text-rose-600 dark:text-rose-400 uppercase mb-1">Gastos</p>
                <p className="text-xl font-bold text-rose-700 dark:text-rose-300">{formatCurrency(financialSummary.totalExpense)}</p>
              </div>
              <div className="p-4 bg-blue-50 dark:bg-blue-500/10 rounded-xl border border-blue-100 dark:border-blue-500/20">
                <p className="text-xs font-bold text-blue-600 dark:text-blue-400 uppercase mb-1">Balance</p>
                <p className="text-xl font-bold text-blue-700 dark:text-blue-300">{formatCurrency(financialSummary.totalIncome - financialSummary.totalExpense)}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-8">
          <div className="bg-white dark:bg-slate-900 p-6 rounded-theme shadow-(--shadow-theme) border border-slate-100 dark:border-slate-800 transition-all duration-300 hover:shadow-lg">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-6 flex items-center gap-2">
              <AlertTriangle className="text-rose-600" size={20} />
              Alertas Críticas
            </h3>
            <div className="space-y-4">
              {riskProjects.length > 0 && (
                <div className="p-4 bg-amber-50 dark:bg-amber-500/10 rounded-xl border border-amber-100 dark:border-amber-500/20">
                  <p className="text-sm font-bold text-amber-700 dark:text-amber-400 mb-2">Desviación Financiera ({riskProjects.length})</p>
                  <div className="space-y-2">
                    {riskProjects.slice(0, 3).map(p => {
                      const deviation = (p.spent / p.budget) * 100 - (p.physicalProgress || 0);
                      return (
                        <div key={p.id} className="space-y-1">
                          <p className="text-xs text-amber-600 dark:text-amber-500 font-bold truncate">• {p.name} (+{deviation.toFixed(1)}% desv.)</p>
                          <div className="pl-3 space-y-0.5">
                            {getMitigationSuggestions(deviation).slice(0, 2).map((s, i) => (
                              <p key={i} className="text-[10px] text-slate-500 dark:text-slate-400 italic leading-tight">- {s}</p>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              {inactiveProjects.length > 0 && (
                <div className="p-4 bg-rose-50 dark:bg-rose-500/10 rounded-xl border border-rose-100 dark:border-rose-500/20">
                  <p className="text-sm font-bold text-rose-700 dark:text-rose-400 mb-2">Obras Inactivas ({inactiveProjects.length})</p>
                  <div className="space-y-2">
                    {inactiveProjects.slice(0, 3).map(p => (
                      <p key={p.id} className="text-xs text-rose-600 dark:text-rose-500 truncate">• {p.name}</p>
                    ))}
                  </div>
                </div>
              )}
              {lowStockItems.length > 0 && (
                <div className="p-4 bg-primary-light dark:bg-primary/10 rounded-xl border border-primary-light dark:border-primary/20">
                  <p className="text-sm font-bold text-primary mb-2">Inventario Bajo ({lowStockItems.length})</p>
                  <div className="space-y-2">
                    {lowStockItems.slice(0, 3).map(i => (
                      <p key={i.id} className="text-xs text-primary truncate">• {i.name} ({i.stock} {i.unit})</p>
                    ))}
                  </div>
                </div>
              )}
              {(() => {
                const today = new Date().toISOString().split('T')[0];
                const overdueTasks = tasks.filter(t => t.dueDate && t.status !== 'done' && t.status !== 'cancelled' && t.dueDate < today);
                if (overdueTasks.length === 0) return null;
                return (
                  <div className="p-4 bg-red-50 dark:bg-red-500/10 rounded-xl border border-red-100 dark:border-red-500/20">
                    <p className="text-sm font-bold text-red-700 dark:text-red-400 mb-2">Tareas Vencidas ({overdueTasks.length})</p>
                    <div className="space-y-1">
                      {overdueTasks.slice(0, 3).map(t => (
                        <p key={t.id} className="text-xs text-red-600 dark:text-red-500 truncate cursor-pointer hover:underline" onClick={() => navigate('/tasks')}>• {t.title}</p>
                      ))}
                      {overdueTasks.length > 3 && <p className="text-[10px] text-red-400 font-bold">+{overdueTasks.length - 3} más</p>}
                    </div>
                  </div>
                );
              })()}
              {inactiveProjects.length === 0 && lowStockItems.length === 0 && tasks.filter(t => { const today = new Date().toISOString().split('T')[0]; return t.dueDate && t.status !== 'done' && t.status !== 'cancelled' && t.dueDate < today; }).length === 0 && (
                <p className="text-sm text-slate-400 dark:text-slate-500 italic">No hay alertas críticas en este momento.</p>
              )}
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 p-6 rounded-theme shadow-(--shadow-theme) border border-slate-100 dark:border-slate-800 transition-all duration-300 hover:shadow-lg">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-6 flex items-center gap-2">
              <CheckSquare className="text-primary" size={20} />
              Aprobaciones Pendientes
            </h3>
            <div className="space-y-4">
              {pendingWorkflows.length > 0 ? pendingWorkflows.map(task => (
                <div key={task.id} className="flex items-center gap-3 p-3 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg transition-colors border border-transparent hover:border-slate-100 dark:hover:border-slate-700 cursor-pointer" onClick={() => navigate('/workflows')}>
                  <div className="p-2 bg-amber-50 dark:bg-amber-500/10 text-amber-500 rounded-lg">
                    <CheckSquare size={16} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-slate-900 dark:text-white truncate">{task.title}</p>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400 uppercase font-bold tracking-tighter">Solicitado por {task.requestedBy}</p>
                  </div>
                  <ArrowRight size={14} className="text-slate-300" />
                </div>
              )) : (
                <p className="text-sm text-slate-400 dark:text-slate-500 italic">No hay aprobaciones pendientes.</p>
              )}
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800 transition-colors duration-300">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-6 flex items-center gap-2">
              <History className="text-primary" size={20} />
              Actividad Reciente
            </h3>
            <div className="space-y-4">
              {recentLogs.length > 0 ? recentLogs.map(log => (
                <div key={log.id} className="flex items-start gap-3 p-3 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg transition-colors border border-transparent hover:border-slate-100 dark:hover:border-slate-700">
                  <div className="p-2 bg-slate-100 dark:bg-slate-800 text-slate-400 rounded-lg mt-0.5">
                    <History size={14} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-slate-900 dark:text-white leading-tight">{log.action}</p>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate tracking-tight">{log.userName} en {log.module}</p>
                    <p className="text-[9px] text-slate-400 font-bold uppercase tracking-tighter mt-1">
                      {log.timestamp?.toDate ? log.timestamp.toDate().toLocaleTimeString() : 'Reciente'}
                    </p>
                  </div>
                </div>
              )) : (
                <p className="text-sm text-slate-400 dark:text-slate-500 italic">No hay actividad reciente registrada.</p>
              )}
            </div>
          </div>

          {/* Widget Tareas */}
          <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800 transition-colors duration-300">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <CheckCircle2 className="text-primary" size={20} />
                Tareas
              </h3>
              <button
                onClick={() => navigate('/tasks')}
                className="text-[10px] font-black uppercase tracking-widest text-primary hover:text-primary-hover transition-colors"
              >
                Ver todas →
              </button>
            </div>
            {/* Mini gráfica de distribución por prioridad */}
            {tasks.length > 0 && (() => {
              const priorityData = [
                { name: 'Crítica', value: tasks.filter(t => (t.priority as string) === 'critical' && t.status !== 'done' && t.status !== 'cancelled').length, fill: '#ef4444' },
                { name: 'Alta', value: tasks.filter(t => t.priority === 'high' && t.status !== 'done' && t.status !== 'cancelled').length, fill: '#f97316' },
                { name: 'Media', value: tasks.filter(t => t.priority === 'medium' && t.status !== 'done' && t.status !== 'cancelled').length, fill: '#f59e0b' },
                { name: 'Baja', value: tasks.filter(t => t.priority === 'low' && t.status !== 'done' && t.status !== 'cancelled').length, fill: '#10b981' },
              ].filter(d => d.value > 0);
              if (priorityData.length === 0) return null;
              return (
                <div className="flex items-center gap-4 mb-4 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl">
                  <div className="w-16 h-16 shrink-0">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={priorityData} dataKey="value" cx="50%" cy="50%" innerRadius={18} outerRadius={30} paddingAngle={3}>
                          {priorityData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                        </Pie>
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="flex flex-wrap gap-x-3 gap-y-1">
                    {priorityData.map(d => (
                      <div key={d.name} className="flex items-center gap-1">
                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: d.fill }} />
                        <span className="text-[10px] font-black text-slate-500 uppercase">{d.name}: {d.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}
            <div className="flex gap-3 mb-4">
              {(['pending','in_progress','done'] as const).map((s) => {
                const count = tasks.filter(t => t.status === s).length;
                const label = s === 'pending' ? 'Pendientes' : s === 'in_progress' ? 'En Progreso' : 'Completadas';
                const color = s === 'pending' ? 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300' : s === 'in_progress' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300';
                return (
                  <div key={s} className={`flex-1 rounded-xl px-3 py-2 text-center ${color}`}>
                    <p className="text-lg font-black">{count}</p>
                    <p className="text-[9px] font-black uppercase tracking-wider">{label}</p>
                  </div>
                );
              })}
            </div>
            <div className="space-y-2">
              {tasks
                .filter(t => t.status !== 'done' && t.status !== 'cancelled')
                .sort((a, b) => {
                  if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate);
                  if (a.dueDate) return -1;
                  if (b.dueDate) return 1;
                  return 0;
                })
                .slice(0, 5)
                .map(task => {
                  const isOverdue = task.dueDate && new Date(task.dueDate + 'T00:00:00') < new Date();
                  return (
                    <div
                      key={task.id}
                      className="flex items-center gap-3 p-3 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer border border-transparent hover:border-slate-100 dark:hover:border-slate-700"
                      onClick={() => navigate('/tasks')}
                    >
                      <button
                        onClick={async (e) => {
                          e.stopPropagation();
                          const updated = await updateTask(task.id, { status: task.status === 'done' ? 'pending' : 'done' });
                          setTasks(prev => prev.map(t => t.id === task.id ? updated : t));
                        }}
                        className="shrink-0 text-slate-300 hover:text-primary transition-colors"
                      >
                        {task.status === 'in_progress'
                          ? <Clock size={16} className="text-blue-500" />
                          : <CheckCircle2 size={16} />}
                      </button>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-black text-slate-900 dark:text-white truncate">{task.title}</p>
                        {task.dueDate && (
                          <p className={`text-[10px] font-bold ${isOverdue ? 'text-rose-500' : 'text-slate-400'}`}>
                            📅 {new Date(task.dueDate + 'T00:00:00').toLocaleDateString('es-GT')}{isOverdue ? ' · Vencida' : ''}
                          </p>
                        )}
                      </div>
                      <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full ${
                        (task.priority as string) === 'critical' ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300' :
                        task.priority === 'high' ? 'bg-rose-100 text-rose-600 dark:bg-rose-900/40 dark:text-rose-300' :
                        task.priority === 'medium' ? 'bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-300' :
                        'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
                      }`}>{(task.priority as string) === 'critical' ? '🔴 Crítica' : task.priority === 'high' ? 'Alta' : task.priority === 'medium' ? 'Media' : 'Baja'}</span>
                    </div>
                  );
                })}
              {tasks.filter(t => t.status !== 'done' && t.status !== 'cancelled').length === 0 && (
                <p className="text-sm text-slate-400 dark:text-slate-500 italic text-center py-4">No hay tareas pendientes.</p>
              )}
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800 transition-colors duration-300">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-6 flex items-center gap-2">
              <Clock className="text-primary" size={20} />
              Vencimientos (30 días)
            </h3>
            <div className="space-y-4">
              {nearingEndSubs.length > 0 ? nearingEndSubs.map(sub => {
                const daysLeft = Math.ceil((new Date(sub.endDate).getTime() - new Date().getTime()) / (1000 * 3600 * 24));
                return (
                  <div key={sub.id} className="flex items-center gap-3 p-3 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg transition-colors border border-transparent hover:border-slate-100 dark:hover:border-slate-700">
                    <div className="p-2 bg-primary-light dark:bg-primary/10 text-primary rounded-lg">
                      <Clock size={16} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-slate-900 dark:text-white truncate">{sub.contractor}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">{sub.service} - {sub.budgetItemName || 'N/A'}</p>
                      <p className="text-[10px] text-primary font-bold uppercase tracking-wider">{daysLeft} días restantes</p>
                    </div>
                  </div>
                );
              }) : (
                <p className="text-sm text-slate-400 dark:text-slate-500 italic">No hay vencimientos próximos.</p>
              )}
            </div>
          </div>
        </div>
      </div>
      </motion.div>
      )}

      {/* ── PÁGINA 1: Análisis Financiero Avanzado ── */}
      {activePage === 1 && (
      <motion.div key="page1" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -16 }} transition={{ duration: 0.25 }} className="space-y-8">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          <div className={cn(CHART_CARD, 'xl:col-span-2')}>
            <h3 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-widest mb-5 flex items-center gap-2"><Activity size={16} className="text-emerald-500" />Ingresos vs Gastos — Últimos 6 meses</h3>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={monthlyFinancialData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="ingGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/><stop offset="95%" stopColor="#10b981" stopOpacity={0}/></linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="mes" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 700 }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 700 }} tickFormatter={v => `Q${v >= 1000 ? (v/1000).toFixed(0)+'k' : v}`} />
                  <Tooltip {...TOOLTIP_STYLE} formatter={(v: any, n: any) => [formatCurrency(v), n]} />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: '10px', fontWeight: 800, textTransform: 'uppercase' }} />
                  <Bar dataKey="gastos" name="Gastos" fill="#ef4444" radius={[6,6,0,0]} barSize={18} opacity={0.85} />
                  <Area type="monotone" dataKey="ingresos" name="Ingresos" stroke="#10b981" strokeWidth={3} fill="url(#ingGrad)" />
                  <Line type="monotone" dataKey="utilidad" name="Utilidad" stroke="#6366f1" strokeWidth={2.5} dot={{ r: 3 }} strokeDasharray="5 3" />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className={CHART_CARD}>
            <h3 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-widest mb-5 flex items-center gap-2"><Flame size={16} className="text-orange-500" />Burndown de Presupuesto</h3>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={burndownData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="burnGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#f97316" stopOpacity={0.35}/><stop offset="95%" stopColor="#f97316" stopOpacity={0}/></linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="semana" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 700 }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 700 }} tickFormatter={v => `Q${v >= 1000 ? (v/1000).toFixed(0)+'k' : v}`} />
                  <Tooltip {...TOOLTIP_STYLE} formatter={(v: any, n: any) => [formatCurrency(v), n]} />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: '10px', fontWeight: 800, textTransform: 'uppercase' }} />
                  <Area type="monotone" dataKey="restante" name="Restante" stroke="#f97316" strokeWidth={3} fill="url(#burnGrad)" />
                  <Line type="monotone" dataKey="ideal" name="Ideal" stroke="#94a3b8" strokeWidth={2} strokeDasharray="6 3" dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        <div className={CHART_CARD}>
          <h3 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-widest mb-2 flex items-center gap-2"><Target size={16} className="text-violet-500" />Scatter — Desviación Físico vs Financiero por Proyecto</h3>
          <p className="text-xs text-slate-400 mb-5">Cada punto es un proyecto. Eje X = avance físico, Eje Y = avance financiero. Puntos sobre la diagonal = gasto adelantado al avance.</p>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 20, right: 30, left: 0, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis type="number" dataKey="fisico" name="Avance Físico" domain={[0,100]} tickFormatter={v => `${v}%`} axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 700 }} label={{ value: 'Avance Físico %', position: 'insideBottom', offset: -10, fill: '#94a3b8', fontSize: 10 }} />
                <YAxis type="number" dataKey="financiero" name="Avance Financiero" domain={[0,100]} tickFormatter={v => `${v}%`} axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 700 }} label={{ value: 'Financiero %', angle: -90, position: 'insideLeft', fill: '#94a3b8', fontSize: 10 }} />
                <ZAxis type="number" dataKey="budget" range={[60, 400]} name="Presupuesto" />
                <Tooltip {...TOOLTIP_STYLE} cursor={{ strokeDasharray: '3 3' }} content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const d = payload[0].payload;
                  return (
                    <div className="bg-slate-900/95 p-3 rounded-xl border border-slate-700 text-xs">
                      <p className="font-black text-white mb-1">{d.name}</p>
                      <p className="text-emerald-300">Físico: {d.fisico.toFixed(1)}%</p>
                      <p className="text-rose-300">Financiero: {d.financiero.toFixed(1)}%</p>
                      <p className={cn('font-bold mt-1', d.desviacion > 10 ? 'text-amber-400' : 'text-slate-400')}>Desviación: {d.desviacion > 0 ? '+' : ''}{d.desviacion.toFixed(1)}%</p>
                    </div>
                  );
                }} />
                <ReferenceLine segment={[{x:0,y:0},{x:100,y:100}]} stroke="#94a3b8" strokeDasharray="4 4" />
                <Scatter data={deviationScatterData} name="Proyectos">
                  {deviationScatterData.map((entry, i) => (
                    <Cell key={i} fill={entry.desviacion > 15 ? '#ef4444' : entry.desviacion > 5 ? '#f59e0b' : '#10b981'} fillOpacity={0.8} />
                  ))}
                </Scatter>
              </ScatterChart>
            </ResponsiveContainer>
          </div>
          <div className="flex items-center gap-6 mt-3">
            {[['#10b981','Alineado (≤5%)'],['#f59e0b','Atención (5-15%)'],['#ef4444','Riesgo (>15%)']].map(([color, label]) => (
              <div key={label} className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
                <span className="text-[10px] font-bold text-slate-500 uppercase">{label}</span>
              </div>
            ))}
          </div>
        </div>
      </motion.div>
      )}

      {/* ── PÁGINA 2: RRHH · Riesgos · Seguridad ── */}
      {activePage === 2 && (
      <motion.div key="page2" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -16 }} transition={{ duration: 0.25 }} className="space-y-8">
        {/* KPIs RRHH */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[{ label: 'Total Empleados', value: employees.length, color: 'bg-blue-500', icon: Users },
            { label: 'Activos', value: activeEmployees, color: 'bg-emerald-500', icon: CheckCircle2 },
            { label: 'Masa Salarial', value: formatCurrency(totalSalaryMass), color: 'bg-violet-500', icon: HandCoins },
            { label: 'Riesgos Altos', value: highRisks, color: 'bg-rose-500', icon: ShieldAlert },
          ].map(({ label, value, color, icon: Icon }) => (
            <div key={label} className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm flex items-center gap-4">
              <div className={cn('p-3 rounded-xl text-white', color)}><Icon size={18} /></div>
              <div><p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{label}</p><p className="text-xl font-black text-slate-900 dark:text-white mt-0.5">{value}</p></div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {/* Empleados por departamento */}
          <div className={CHART_CARD}>
            <h3 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-widest mb-5 flex items-center gap-2"><Users size={15} className="text-blue-500" />Empleados por Departamento</h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={employeesByDeptData} layout="vertical" margin={{ top: 0, right: 20, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                  <XAxis type="number" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 700 }} allowDecimals={false} />
                  <YAxis dataKey="name" type="category" width={100} axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 9, fontWeight: 800 }} />
                  <Tooltip {...TOOLTIP_STYLE} />
                  <Bar dataKey="value" name="Empleados" radius={[0,6,6,0]} barSize={14}>
                    {employeesByDeptData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Masa salarial por departamento */}
          <div className={CHART_CARD}>
            <h3 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-widest mb-5 flex items-center gap-2"><HandCoins size={15} className="text-violet-500" />Masa Salarial por Departamento</h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={salaryByDeptData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={4}>
                    {salaryByDeptData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip {...TOOLTIP_STYLE} formatter={(v: any) => [formatCurrency(v), 'Salario']} />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: '9px', fontWeight: 800, textTransform: 'uppercase' }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Riesgos por categoría */}
          <div className={CHART_CARD}>
            <h3 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-widest mb-5 flex items-center gap-2"><ShieldAlert size={15} className="text-rose-500" />Riesgos por Categoría</h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart data={riskByCategoryData.slice(0,8).map(d => ({ subject: d.name, value: d.value }))} outerRadius={85}>
                  <PolarGrid stroke="#334155" strokeOpacity={0.25} />
                  <PolarAngleAxis dataKey="subject" tick={{ fill: '#94a3b8', fontSize: 9, fontWeight: 700 }} />
                  <PolarRadiusAxis tick={{ fill: '#94a3b8', fontSize: 8 }} allowDecimals={false} />
                  <Tooltip {...TOOLTIP_STYLE} />
                  <Radar dataKey="value" stroke="#ef4444" fill="#ef4444" fillOpacity={0.3} name="Riesgos" />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Riesgos por estado */}
          <div className={CHART_CARD}>
            <h3 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-widest mb-5 flex items-center gap-2"><AlertTriangle size={15} className="text-amber-500" />Estado de Riesgos</h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={riskByStatusData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={5}>
                    {riskByStatusData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip {...TOOLTIP_STYLE} />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: '9px', fontWeight: 800, textTransform: 'uppercase' }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Incidentes por severidad */}
          <div className={CHART_CARD}>
            <h3 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-widest mb-1 flex items-center gap-2"><HardHat size={15} className="text-orange-500" />Incidentes por Severidad</h3>
            <p className="text-[10px] text-slate-400 mb-4">{openIncidents} incidente(s) abierto(s)</p>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={incidentsBySeverityData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 700 }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 700 }} allowDecimals={false} />
                  <Tooltip {...TOOLTIP_STYLE} />
                  <Bar dataKey="value" name="Incidentes" radius={[6,6,0,0]}>
                    {incidentsBySeverityData.map((_, i) => <Cell key={i} fill={['#10b981','#f59e0b','#ef4444','#7c3aed'][i % 4]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Incidentes por tipo */}
          <div className={CHART_CARD}>
            <h3 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-widest mb-5 flex items-center gap-2"><HardHat size={15} className="text-cyan-500" />Incidentes por Tipo</h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={incidentsByTypeData.slice(0,6)} layout="vertical" margin={{ top: 0, right: 20, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                  <XAxis type="number" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 700 }} allowDecimals={false} />
                  <YAxis dataKey="name" type="category" width={110} axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 9, fontWeight: 800 }} />
                  <Tooltip {...TOOLTIP_STYLE} />
                  <Bar dataKey="value" name="Incidentes" radius={[0,6,6,0]} barSize={14}>
                    {incidentsByTypeData.slice(0,6).map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </motion.div>
      )}

      {/* ── PÁGINA 3: Equipos · Pipeline ── */}
      {activePage === 3 && (
      <motion.div key="page3" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -16 }} transition={{ duration: 0.25 }} className="space-y-8">
        {/* KPIs Equipos */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[{ label: 'Total Equipos', value: equipment.length, color: 'bg-cyan-500', icon: Wrench },
            { label: 'Costo Total Est.', value: formatCurrency(totalEquipmentCost), color: 'bg-orange-500', icon: HandCoins },
            { label: 'Cotizaciones Activas', value: quotationQuotes.length, color: 'bg-violet-500', icon: Package },
            { label: 'Proyectos Completados', value: projects.filter(p => p.status === 'Completed').length, color: 'bg-emerald-500', icon: CheckCircle2 },
          ].map(({ label, value, color, icon: Icon }) => (
            <div key={label} className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm flex items-center gap-4">
              <div className={cn('p-3 rounded-xl text-white', color)}><Icon size={18} /></div>
              <div><p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{label}</p><p className="text-xl font-black text-slate-900 dark:text-white mt-0.5">{value}</p></div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {/* Equipos por estado */}
          <div className={CHART_CARD}>
            <h3 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-widest mb-5 flex items-center gap-2"><Wrench size={15} className="text-cyan-500" />Equipos por Estado</h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={equipmentByStatusData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={5}>
                    {equipmentByStatusData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip {...TOOLTIP_STYLE} />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: '9px', fontWeight: 800, textTransform: 'uppercase' }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Top equipos por costo diario */}
          <div className={cn(CHART_CARD, 'xl:col-span-2')}>
            <h3 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-widest mb-5 flex items-center gap-2"><Wrench size={15} className="text-orange-500" />Top Equipos por Costo Diario</h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={equipmentCostData} layout="vertical" margin={{ top: 0, right: 30, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                  <XAxis type="number" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 700 }} tickFormatter={v => `Q${v >= 1000 ? (v/1000).toFixed(0)+'k' : v}`} />
                  <YAxis dataKey="name" type="category" width={120} axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 9, fontWeight: 800 }} />
                  <Tooltip {...TOOLTIP_STYLE} formatter={(v: any, n: any) => [n === 'costo' ? formatCurrency(v) : `${v} días`, n]} />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: '9px', fontWeight: 800, textTransform: 'uppercase' }} />
                  <Bar dataKey="costo" name="Costo/día" radius={[0,6,6,0]} barSize={12}>
                    {equipmentCostData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Funnel pipeline */}
          <div className={cn(CHART_CARD, 'xl:col-span-2')}>
            <h3 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-widest mb-2 flex items-center gap-2"><Target size={15} className="text-indigo-500" />Embudo de Proyectos — Pipeline Completo</h3>
            <p className="text-xs text-slate-400 mb-5">Cantidad de proyectos en cada etapa del ciclo de vida.</p>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <FunnelChart>
                  <Tooltip {...TOOLTIP_STYLE} />
                  <Funnel dataKey="value" data={funnelData} isAnimationActive>
                    {funnelData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                    <LabelList position="center" fill="#fff" fontSize={12} fontWeight={800} formatter={(v: any) => v} />
                  </Funnel>
                </FunnelChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Radar multi-dimensión proyectos */}
          <div className={CHART_CARD}>
            <h3 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-widest mb-5 flex items-center gap-2"><Activity size={15} className="text-fuchsia-500" />Radar Multi-Dimensión</h3>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart data={[
                  { subject: 'Ejecución', value: executionProjects.length },
                  { subject: 'Evaluación', value: evaluationProjects.length },
                  { subject: 'Cotizaciones', value: quotationQuotes.length },
                  { subject: 'Subcontratos', value: subcontracts.length },
                  { subject: 'Empleados', value: employees.length },
                  { subject: 'Equipos', value: equipment.length },
                  { subject: 'Riesgos', value: risks.length },
                  { subject: 'Incidentes', value: safetyIncidents.length },
                ]} outerRadius={100}>
                  <PolarGrid stroke="#334155" strokeOpacity={0.25} />
                  <PolarAngleAxis dataKey="subject" tick={{ fill: '#94a3b8', fontSize: 9, fontWeight: 700 }} />
                  <PolarRadiusAxis tick={{ fill: '#94a3b8', fontSize: 8 }} allowDecimals={false} />
                  <Tooltip {...TOOLTIP_STYLE} />
                  <Radar dataKey="value" stroke="#8b5cf6" fill="#8b5cf6" fillOpacity={0.3} name="Cantidad" />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </motion.div>
      )}
      </AnimatePresence>

      {/* Quick Progress Update Modal */}
      <AnimatePresence>
        {isQuickProgressModalOpen && (
          <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-slate-950/50 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white dark:bg-slate-900 w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden border border-slate-200 dark:border-slate-800"
            >
              <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-800/50">
                <h2 className="text-xl font-black text-slate-900 dark:text-white uppercase tracking-tight flex items-center gap-3">
                  <Edit3 className="text-primary" size={24} />
                  Actualización Rápida de Avance
                </h2>
                <button
                  title="Cerrar actualizacion rapida"
                  aria-label="Cerrar actualizacion rapida"
                  onClick={() => {
                    setIsQuickProgressModalOpen(false);
                    setSelectedQuickProjectId(null);
                    setQuickSearchTerm('');
                  }}
                  className="p-2 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-full transition-colors"
                >
                  <X size={20} className="text-slate-500" />
                </button>
              </div>

              <div className="p-6 max-h-[70vh] overflow-y-auto">
                {!selectedQuickProjectId ? (
                  <div className="space-y-6">
                    <div className="relative">
                      <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                      <input
                        type="text"
                        placeholder="Buscar proyecto por nombre o ubicación..."
                        value={quickSearchTerm}
                        onChange={(e) => setQuickSearchTerm(e.target.value)}
                        className="w-full pl-12 pr-4 py-3 bg-slate-100 dark:bg-slate-800 border-none rounded-2xl text-sm font-bold focus:ring-2 focus:ring-primary transition-all"
                      />
                    </div>

                    <div className="grid grid-cols-1 gap-3">
                      {projects
                        .filter(p =>
                        (String(p.name || '').toLowerCase().includes(quickSearchTerm.toLowerCase()) ||
                          String(p.location || '').toLowerCase().includes(quickSearchTerm.toLowerCase()))
                        )
                        .map(project => (
                          <button
                            key={project.id}
                            onClick={() => setSelectedQuickProjectId(project.id)}
                            className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-800/50 hover:bg-primary/5 dark:hover:bg-primary/10 rounded-2xl border border-slate-100 dark:border-slate-800 transition-all group"
                          >
                            <div className="text-left">
                              <p className="font-black text-slate-900 dark:text-white text-sm uppercase tracking-tight">{project.name}</p>
                              <p className="text-xs text-slate-500 font-bold">{project.location}</p>
                            </div>
                            <ChevronRight size={18} className="text-slate-300 group-hover:text-primary transition-colors" />
                          </button>
                        ))}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-6">
                    <button
                      onClick={() => setSelectedQuickProjectId(null)}
                      className="text-xs font-black text-primary uppercase tracking-widest hover:underline flex items-center gap-1"
                    >
                      ← Volver a selección de proyectos
                    </button>

                    <div className="bg-primary/5 dark:bg-primary/10 p-4 rounded-2xl border border-primary/10">
                      <p className="text-[10px] font-black text-primary uppercase tracking-widest mb-1">Proyecto Seleccionado</p>
                      <p className="text-lg font-black text-slate-900 dark:text-white uppercase tracking-tight">
                        {projects.find(p => p.id === selectedQuickProjectId)?.name}
                      </p>
                    </div>

                    {isLoadingQuickItems ? (
                      <div className="flex flex-col items-center py-12 gap-4">
                        <Loader2 className="animate-spin text-primary" size={32} />
                        <p className="text-sm font-bold text-slate-400">Cargando renglones...</p>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Renglones del Presupuesto</p>
                        {quickBudgetItems.length > 0 ? (
                          quickBudgetItems.map(item => (
                            <div key={item.id} className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-800 space-y-3">
                              <div className="flex items-start justify-between gap-4">
                                <div className="flex-1">
                                  <p className="font-black text-slate-900 dark:text-white text-sm uppercase tracking-tight leading-tight">{item.description}</p>
                                  <p className="text-[10px] text-slate-500 font-bold uppercase mt-1">{item.category} • {item.quantity} {item.unit}</p>
                                </div>
                                <div className="w-24">
                                  <div className="relative">
                                    <input
                                      type="number"
                                      min="0"
                                      max="100"
                                      title={`Avance de ${item.description}`}
                                      placeholder="0"
                                      defaultValue={item.progress || 0}
                                      onBlur={(e) => {
                                        const val = parseFloat(e.target.value);
                                        if (!isNaN(val) && val !== item.progress) {
                                          handleQuickProgressUpdate(item.id, val);
                                        }
                                      }}
                                      className="w-full pl-3 pr-8 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-black focus:ring-2 focus:ring-primary transition-all text-right"
                                    />
                                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-black text-slate-400">%</span>
                                  </div>
                                </div>
                              </div>
                              <div className="w-full bg-slate-200 dark:bg-slate-700 h-1.5 rounded-full overflow-hidden">
                                <motion.div
                                  initial={{ width: 0 }}
                                  animate={{ width: `${item.progress || 0}%` }}
                                  className="h-full bg-primary"
                                />
                              </div>
                            </div>
                          ))
                        ) : (
                          <div className="text-center py-8 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-dashed border-slate-200 dark:border-slate-800">
                            <p className="text-sm text-slate-400 font-bold italic">No hay renglones registrados en este proyecto.</p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="p-6 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-100 dark:border-slate-800 flex justify-end">
                <button
                  onClick={() => {
                    setIsQuickProgressModalOpen(false);
                    setSelectedQuickProjectId(null);
                    setQuickSearchTerm('');
                  }}
                  className="px-6 py-2.5 bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-xl font-black text-xs uppercase tracking-widest hover:scale-105 active:scale-95 transition-all"
                >
                  Cerrar
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
