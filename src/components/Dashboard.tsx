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
  PolarRadiusAxis
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
  Save,
  Plus,
  X,
  Construction as ConstructionIcon,
  ShoppingBag,
  Package as PackageIcon
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
import { useTheme } from '../contexts/ThemeContext';

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
  | 'scheduleProgress';

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
  ],
};

const MOBILE_CHART_BREAKPOINT = 640;
const MOBILE_MAX_CHART_ITEMS = 6;

const truncateChartLabel = (value: string, maxLength: number) => {
  if (!value) return 'N/A';
  return value.length > maxLength ? `${value.slice(0, maxLength - 1)}...` : value;
};

const sanitizeChartPreferences = (
  preferences: Partial<DashboardChartPreferences> | undefined,
  fallback: DashboardChartPreferences,
): DashboardChartPreferences => {
  const sanitized = { ...fallback };

  (Object.keys(CHART_TYPE_OPTIONS) as DashboardChartKey[]).forEach((chartKey) => {
    const allowedValues = CHART_TYPE_OPTIONS[chartKey].map((option) => option.value);
    const preferred = preferences?.[chartKey];
    sanitized[chartKey] = preferred && allowedValues.includes(preferred)
      ? preferred
      : fallback[chartKey];
  });

  return sanitized;
};

const THEME_DEFAULT_CHARTS: Record<string, DashboardChartPreferences> = {
  sunset: {
    profitTrend: 'area',
    projectHealth: 'grouped-bar',
    projectStatus: 'donut',
    expenseCategory: 'donut',
    progressComparison: 'stacked-bar',
    scheduleProgress: 'gantt',
  },
  ocean: {
    profitTrend: 'line',
    projectHealth: 'composed',
    projectStatus: 'pie',
    expenseCategory: 'bar',
    progressComparison: 'line',
    scheduleProgress: 'horizontal-bars',
  },
  forest: {
    profitTrend: 'composed',
    projectHealth: 'stacked-bar',
    projectStatus: 'radar',
    expenseCategory: 'radar',
    progressComparison: 'grouped-bar',
    scheduleProgress: 'gantt',
  },
  aurora: {
    profitTrend: 'step',
    projectHealth: 'area',
    projectStatus: 'donut',
    expenseCategory: 'line',
    progressComparison: 'area',
    scheduleProgress: 'radar',
  },
  ember: {
    profitTrend: 'bar',
    projectHealth: 'grouped-bar',
    projectStatus: 'bar',
    expenseCategory: 'bar',
    progressComparison: 'stacked-bar',
    scheduleProgress: 'horizontal-bars',
  },
};

const StatCard = ({ title, value, icon: Icon, trend, trendValue, color }: any) => (
  <motion.div 
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    whileHover={{ y: -5 }}
    className="bg-white dark:bg-slate-900 p-4 sm:p-6 rounded-[var(--radius-theme)] shadow-[var(--shadow-theme)] border border-slate-100 dark:border-slate-800 transition-all duration-300 hover:shadow-xl hover:shadow-primary/5 group"
  >
    <div className="flex items-start justify-between mb-3 sm:mb-6">
      <div className={cn("p-3 sm:p-4 rounded-xl sm:rounded-2xl shadow-inner transition-transform group-hover:scale-110 duration-500", color)}>
        <Icon size={20} className="text-white sm:w-6 sm:h-6" />
      </div>
      {trend && (
        <div className={cn(
          "flex items-center gap-1 text-[9px] sm:text-[10px] font-black uppercase tracking-wider px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-full",
          trend === 'up' ? "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400"
        )}>
          {trend === 'up' ? <TrendingUp size={10} className="sm:w-3 sm:h-3" /> : <TrendingDown size={10} className="sm:w-3 sm:h-3" />}
          {trendValue}
        </div>
      )}
    </div>
    <div className="space-y-0.5 sm:space-y-1">
      <h3 className="text-slate-400 dark:text-slate-500 text-[9px] sm:text-[10px] font-black uppercase tracking-[0.15em] sm:tracking-[0.2em]">{title}</h3>
      <p className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white tracking-tight">{value}</p>
    </div>
  </motion.div>
);

const isEvaluationStatus = (status: string) => status === 'Evaluation' || status === 'Planning';

const QuickActionButton = ({ icon: Icon, label, onClick, color }: any) => (
  <button
    onClick={onClick}
    className="flex items-center gap-2 sm:gap-3 w-full p-3 sm:p-4 bg-white dark:bg-slate-800 rounded-xl sm:rounded-2xl border border-slate-100 dark:border-slate-700 shadow-sm hover:shadow-md transition-all active:scale-95"
  >
    <div className={cn("p-1.5 sm:p-2 rounded-lg sm:rounded-xl", color)}>
      <Icon size={16} className="text-white sm:w-5 sm:h-5" />
    </div>
    <span className="font-bold text-xs sm:text-sm text-slate-700 dark:text-slate-300">{label}</span>
  </button>
);

export default function Dashboard() {
  const { currentTheme } = useTheme();
  const [projects, setProjects] = useState<any[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [inventory, setInventory] = useState<any[]>([]);
  const [subcontracts, setSubcontracts] = useState<any[]>([]);
  const [recentLogs, setRecentLogs] = useState<any[]>([]);
  const [pendingWorkflows, setPendingWorkflows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isFabOpen, setIsFabOpen] = useState(false);
  const [isQuickProgressModalOpen, setIsQuickProgressModalOpen] = useState(false);
  const [selectedQuickProjectId, setSelectedQuickProjectId] = useState<string | null>(null);
  const [quickBudgetItems, setQuickBudgetItems] = useState<any[]>([]);
  const [isLoadingQuickItems, setIsLoadingQuickItems] = useState(false);
  const [quickSearchTerm, setQuickSearchTerm] = useState('');
  const [progressChartScope, setProgressChartScope] = useState<'all' | 'selected'>('all');
  const [chartPreferences, setChartPreferences] = useState<DashboardChartPreferences>(
    THEME_DEFAULT_CHARTS.sunset
  );
  const [isMobileChartView, setIsMobileChartView] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.innerWidth < MOBILE_CHART_BREAKPOINT;
  });
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
      setChartPreferences(sanitizeChartPreferences(
        persistedForTheme ? { ...fallback, ...persistedForTheme } : fallback,
        fallback,
      ));
    } catch {
      setChartPreferences(fallback);
    }
  }, [currentTheme.id]);

  useEffect(() => {
    const onResize = () => {
      setIsMobileChartView(window.innerWidth < MOBILE_CHART_BREAKPOINT);
    };

    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

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

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const [projectsItems, transactionsResult, inventoryResult, subcontractsItems, workflowsItems] = await Promise.all([
          listProjects(),
          listTransactions({ limit: 100, offset: 0 }),
          listInventory({ limit: 500, offset: 0 }),
          listSubcontracts({ status: 'Active' }),
          listWorkflows({ status: 'pending' }),
        ]);

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
        setInventory(inventoryResult.items);
        setSubcontracts(subcontractsItems);
        setPendingWorkflows(workflowsItems.slice(0, 5));
        setRecentLogs([]);
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
  }, []);

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
  }, [projects, subcontracts, loading]);

  const executionProjects = projects.filter(p => p.status === 'In Progress' || p.status === 'Active');
  const evaluationProjects = projects.filter(p => isEvaluationStatus(p.status));
  const totalBudget = executionProjects.reduce((acc, p) => acc + (Number(p.budget) || 0), 0);
  const evaluationBudget = evaluationProjects.reduce((acc, p) => acc + (Number(p.budget) || 0), 0);
  const evaluationSpent = evaluationProjects.reduce((acc, p) => acc + (Number(p.spent) || 0), 0);
  const totalSpent = transactions.filter(t => t.type === 'Expense').reduce((acc, t) => acc + (t.amount || 0), 0);
  const totalIncome = transactions.filter(t => t.type === 'Income').reduce((acc, t) => acc + (t.amount || 0), 0);
  const globalProfit = totalIncome - totalSpent;
  const activeProjects = executionProjects.length;

  const projectHealthData = projects.map(p => {
    const projectExpenses = transactions
      .filter(t => t.projectId === p.id && t.type === 'Expense')
      .reduce((acc, t) => acc + (t.amount || 0), 0);
    const projectIncome = transactions
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

  const expenseByCategory = transactions
    .filter(t => t.type === 'Expense')
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
    { name: 'En Evaluación', value: projects.filter(p => p.status === 'Evaluation').length },
    { name: 'En Planeación', value: projects.filter(p => p.status === 'Planning').length },
    { name: 'En Ejecución', value: projects.filter(p => p.status === 'In Progress').length },
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

  const projectHealthChartData = (isMobileChartView
    ? [...projectHealthData]
      .sort((a, b) => Math.max(b.presupuesto, b.gastado) - Math.max(a.presupuesto, a.gastado))
      .slice(0, MOBILE_MAX_CHART_ITEMS)
    : projectHealthData
  ).map((item) => ({
    ...item,
    chartName: isMobileChartView ? truncateChartLabel(item.name, 13) : item.name,
  }));

  const progressComparisonDisplayData = (isMobileChartView
    ? progressComparisonChartData.slice(0, MOBILE_MAX_CHART_ITEMS)
    : progressComparisonChartData
  ).map((item) => ({
    ...item,
    chartName: isMobileChartView ? truncateChartLabel(item.name, 12) : item.name,
  }));
  
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
    
    const spentUpToDate = transactions
      .filter(t => t.type === 'Expense' && t.date <= dateStr)
      .reduce((acc, t) => acc + (t.amount || 0), 0);
      
    const incomeUpToDate = transactions
      .filter(t => t.type === 'Income' && t.date <= dateStr)
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
    totalIncome,
    totalExpense: totalSpent,
  };

  const financialSplitData = [
    { name: 'Ingresos', value: financialSummary.totalIncome, color: '#10b981' },
    { name: 'Gastos', value: financialSummary.totalExpense, color: '#ef4444' },
  ].filter((item) => item.value > 0);

  return (
    <div className="space-y-6 lg:space-y-5 min-w-0 overflow-x-hidden lg:h-[calc(100dvh-9.5rem)] lg:overflow-y-auto lg:pr-2 custom-scrollbar">
      <header>
        <h1 className="text-3xl font-bold text-slate-900 dark:text-white">Tablero de Control</h1>
        <p className="text-slate-500 dark:text-slate-400">Resumen ejecutivo y salud de proyectos</p>
      </header>

      <div className="bento-grid">
        <StatCard 
          title="Presupuesto Total (Ejecución)" 
          value={formatCurrency(totalBudget)} 
          icon={HandCoins} 
          trend="up" 
          trendValue="+12.0%" 
          color="bg-primary shadow-primary/20"
        />
        <StatCard 
          title="Costos en Evaluación" 
          value={formatCurrency(evaluationBudget)} 
          icon={Clock} 
          trend="up" 
          trendValue={`${formatCurrency(evaluationSpent)} gastado`} 
          color="bg-violet-600 shadow-violet-600/20"
        />
        <StatCard 
          title="Total Gastado" 
          value={formatCurrency(totalSpent)} 
          icon={TrendingDown} 
          trend="up" 
          trendValue="+8.0%" 
          color="bg-blue-600 shadow-blue-600/20"
        />
        <StatCard 
          title="Ganancia Estimada" 
          value={formatCurrency(globalProfit)} 
          icon={TrendingUp} 
          trend="up" 
          trendValue="+15.0%" 
          color="bg-emerald-600 shadow-emerald-600/20"
        />
        <StatCard 
          title="Obras Activas" 
          value={activeProjects} 
          icon={Construction} 
          color="bg-purple-600 shadow-purple-600/20"
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-4 gap-6 lg:gap-5 min-w-0">
        <div className="xl:col-span-3 space-y-6 lg:space-y-5 min-w-0">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 lg:gap-5 min-w-0">
            <div className="bg-white dark:bg-slate-900 p-8 rounded-3xl shadow-sm border border-slate-100 dark:border-slate-800 transition-all duration-300">
              <div className="mb-6 flex items-center justify-between gap-3">
                <h3 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-widest">Tendencia de Ganancia Global</h3>
                <select
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
                      <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 700 }} tickFormatter={(value) => `Q${value >= 1000 ? (value/1000).toFixed(0) + 'k' : value}`} />
                      <Tooltip contentStyle={{ backgroundColor: 'rgba(15, 23, 42, 0.9)', borderRadius: '16px', border: 'none', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)', backdropFilter: 'blur(8px)' }} itemStyle={{ color: '#fff', fontSize: '12px', fontWeight: 700 }} labelStyle={{ color: '#94a3b8', fontSize: '10px', fontWeight: 800, textTransform: 'uppercase', marginBottom: '4px' }} formatter={(value: number) => [formatCurrency(value), 'Ganancia']} />
                      <Line type="monotone" dataKey="profit" stroke="#10b981" strokeWidth={3} dot={{ r: 2 }} activeDot={{ r: 6 }} />
                    </LineChart>
                  ) : chartPreferences.profitTrend === 'bar' ? (
                    <BarChart data={profitTrendData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" className="dark:stroke-slate-800/50" />
                      <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 700 }} dy={10} />
                      <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 700 }} tickFormatter={(value) => `Q${value >= 1000 ? (value/1000).toFixed(0) + 'k' : value}`} />
                      <Tooltip contentStyle={{ backgroundColor: 'rgba(15, 23, 42, 0.9)', borderRadius: '16px', border: 'none', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)', backdropFilter: 'blur(8px)' }} itemStyle={{ color: '#fff', fontSize: '12px', fontWeight: 700 }} labelStyle={{ color: '#94a3b8', fontSize: '10px', fontWeight: 800, textTransform: 'uppercase', marginBottom: '4px' }} formatter={(value: number) => [formatCurrency(value), 'Ganancia']} />
                      <Bar dataKey="profit" fill="#10b981" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  ) : chartPreferences.profitTrend === 'composed' ? (
                    <ComposedChart data={profitTrendData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" className="dark:stroke-slate-800/50" />
                      <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 700 }} dy={10} />
                      <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 700 }} tickFormatter={(value) => `Q${value >= 1000 ? (value/1000).toFixed(0) + 'k' : value}`} />
                      <Tooltip contentStyle={{ backgroundColor: 'rgba(15, 23, 42, 0.9)', borderRadius: '16px', border: 'none', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)', backdropFilter: 'blur(8px)' }} itemStyle={{ color: '#fff', fontSize: '12px', fontWeight: 700 }} labelStyle={{ color: '#94a3b8', fontSize: '10px', fontWeight: 800, textTransform: 'uppercase', marginBottom: '4px' }} formatter={(value: number) => [formatCurrency(value), 'Ganancia']} />
                      <Bar dataKey="profit" fill="#34d399" radius={[6, 6, 0, 0]} opacity={0.55} />
                      <Line type="monotone" dataKey="profit" stroke="#059669" strokeWidth={3} dot={false} />
                    </ComposedChart>
                  ) : chartPreferences.profitTrend === 'step' ? (
                    <LineChart data={profitTrendData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" className="dark:stroke-slate-800/50" />
                      <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 700 }} dy={10} />
                      <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 700 }} tickFormatter={(value) => `Q${value >= 1000 ? (value/1000).toFixed(0) + 'k' : value}`} />
                      <Tooltip contentStyle={{ backgroundColor: 'rgba(15, 23, 42, 0.9)', borderRadius: '16px', border: 'none', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)', backdropFilter: 'blur(8px)' }} itemStyle={{ color: '#fff', fontSize: '12px', fontWeight: 700 }} labelStyle={{ color: '#94a3b8', fontSize: '10px', fontWeight: 800, textTransform: 'uppercase', marginBottom: '4px' }} formatter={(value: number) => [formatCurrency(value), 'Ganancia']} />
                      <Line type="stepAfter" dataKey="profit" stroke="#10b981" strokeWidth={3} dot={{ r: 2 }} />
                    </LineChart>
                  ) : (
                    <AreaChart data={profitTrendData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id="colorProfit" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                          <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" className="dark:stroke-slate-800/50" />
                      <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 700 }} dy={10} />
                      <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 700 }} tickFormatter={(value) => `Q${value >= 1000 ? (value/1000).toFixed(0) + 'k' : value}`} />
                      <Tooltip contentStyle={{ backgroundColor: 'rgba(15, 23, 42, 0.9)', borderRadius: '16px', border: 'none', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)', backdropFilter: 'blur(8px)' }} itemStyle={{ color: '#fff', fontSize: '12px', fontWeight: 700 }} labelStyle={{ color: '#94a3b8', fontSize: '10px', fontWeight: 800, textTransform: 'uppercase', marginBottom: '4px' }} formatter={(value: number) => [formatCurrency(value), 'Ganancia']} />
                      <Area type="monotone" dataKey="profit" stroke="#10b981" strokeWidth={4} fillOpacity={1} fill="url(#colorProfit)" dot={{ r: 0 }} activeDot={{ r: 6, fill: '#10b981', stroke: '#fff', strokeWidth: 2 }} name="Ganancia" />
                    </AreaChart>
                  )}
                </ResponsiveContainer>
              </div>
            </div>

            <div className="bg-white dark:bg-slate-900 p-8 rounded-[var(--radius-theme)] shadow-[var(--shadow-theme)] border border-slate-100 dark:border-slate-800 transition-all duration-300 hover:shadow-lg">
              <div className="mb-6 flex items-center justify-between gap-3">
                <h3 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-widest">Salud Financiera por Proyecto</h3>
                <select
                  value={chartPreferences.projectHealth}
                  onChange={(e) => updateChartPreference('projectHealth', e.target.value)}
                  className="px-3 py-2 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-200 focus:ring-2 focus:ring-primary outline-none"
                >
                  {CHART_TYPE_OPTIONS.projectHealth.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </div>
              {isMobileChartView && projectHealthData.length > MOBILE_MAX_CHART_ITEMS && (
                <p className="mb-3 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  Mostrando top {MOBILE_MAX_CHART_ITEMS} obras por monto para evitar solapamiento.
                </p>
              )}
              <div className="h-64 min-w-0">
                <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={220}>
                  {chartPreferences.projectHealth === 'line' ? (
                    <LineChart data={projectHealthChartData} margin={{ top: 10, right: 10, left: 0, bottom: isMobileChartView ? 48 : 30 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" className="dark:stroke-slate-800/50" />
                      <XAxis dataKey="chartName" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: isMobileChartView ? 8 : 9, fontWeight: 700 }} interval={0} minTickGap={isMobileChartView ? 24 : 10} angle={isMobileChartView ? -32 : -45} textAnchor="end" height={isMobileChartView ? 66 : 80} />
                      <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 9, fontWeight: 700 }} tickFormatter={(value) => `Q${value >= 1000 ? (value/1000).toFixed(0) + 'k' : value}`} />
                      <Tooltip contentStyle={{ backgroundColor: 'rgba(15, 23, 42, 0.9)', borderRadius: '16px', border: 'none', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)', backdropFilter: 'blur(8px)' }} itemStyle={{ color: '#fff', fontSize: '12px', fontWeight: 700 }} labelStyle={{ color: '#94a3b8', fontSize: '10px', fontWeight: 800, textTransform: 'uppercase', marginBottom: '4px' }} labelFormatter={(_, payload) => payload?.[0]?.payload?.name || ''} formatter={(value: number) => [formatCurrency(value), '']} />
                      <Legend verticalAlign="top" align="right" iconType="circle" wrapperStyle={{ fontSize: '9px', fontWeight: 800, textTransform: 'uppercase', paddingBottom: '20px' }} />
                      <Line type="monotone" dataKey="presupuesto" stroke="#3b82f6" strokeWidth={2.5} name="Presupuesto" />
                      <Line type="monotone" dataKey="gastado" stroke="#ef4444" strokeWidth={2.5} name="Gastado" />
                    </LineChart>
                  ) : chartPreferences.projectHealth === 'area' ? (
                    <AreaChart data={projectHealthChartData} margin={{ top: 10, right: 10, left: 0, bottom: isMobileChartView ? 48 : 30 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" className="dark:stroke-slate-800/50" />
                      <XAxis dataKey="chartName" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: isMobileChartView ? 8 : 9, fontWeight: 700 }} interval={0} minTickGap={isMobileChartView ? 24 : 10} angle={isMobileChartView ? -32 : -45} textAnchor="end" height={isMobileChartView ? 66 : 80} />
                      <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 9, fontWeight: 700 }} tickFormatter={(value) => `Q${value >= 1000 ? (value/1000).toFixed(0) + 'k' : value}`} />
                      <Tooltip contentStyle={{ backgroundColor: 'rgba(15, 23, 42, 0.9)', borderRadius: '16px', border: 'none', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)', backdropFilter: 'blur(8px)' }} itemStyle={{ color: '#fff', fontSize: '12px', fontWeight: 700 }} labelStyle={{ color: '#94a3b8', fontSize: '10px', fontWeight: 800, textTransform: 'uppercase', marginBottom: '4px' }} labelFormatter={(_, payload) => payload?.[0]?.payload?.name || ''} formatter={(value: number) => [formatCurrency(value), '']} />
                      <Legend verticalAlign="top" align="right" iconType="circle" wrapperStyle={{ fontSize: '9px', fontWeight: 800, textTransform: 'uppercase', paddingBottom: '20px' }} />
                      <Area type="monotone" dataKey="presupuesto" stroke="#3b82f6" fill="#93c5fd" fillOpacity={0.3} name="Presupuesto" />
                      <Area type="monotone" dataKey="gastado" stroke="#ef4444" fill="#fda4af" fillOpacity={0.3} name="Gastado" />
                    </AreaChart>
                  ) : chartPreferences.projectHealth === 'composed' ? (
                    <ComposedChart data={projectHealthChartData} margin={{ top: 10, right: 10, left: 0, bottom: isMobileChartView ? 48 : 30 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" className="dark:stroke-slate-800/50" />
                      <XAxis dataKey="chartName" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: isMobileChartView ? 8 : 9, fontWeight: 700 }} interval={0} minTickGap={isMobileChartView ? 24 : 10} angle={isMobileChartView ? -32 : -45} textAnchor="end" height={isMobileChartView ? 66 : 80} />
                      <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 9, fontWeight: 700 }} tickFormatter={(value) => `Q${value >= 1000 ? (value/1000).toFixed(0) + 'k' : value}`} />
                      <Tooltip contentStyle={{ backgroundColor: 'rgba(15, 23, 42, 0.9)', borderRadius: '16px', border: 'none', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)', backdropFilter: 'blur(8px)' }} itemStyle={{ color: '#fff', fontSize: '12px', fontWeight: 700 }} labelStyle={{ color: '#94a3b8', fontSize: '10px', fontWeight: 800, textTransform: 'uppercase', marginBottom: '4px' }} labelFormatter={(_, payload) => payload?.[0]?.payload?.name || ''} formatter={(value: number) => [formatCurrency(value), '']} />
                      <Legend verticalAlign="top" align="right" iconType="circle" wrapperStyle={{ fontSize: '9px', fontWeight: 800, textTransform: 'uppercase', paddingBottom: '20px' }} />
                      <Bar dataKey="gastado" fill="#ef4444" radius={[4, 4, 0, 0]} name="Gastado" barSize={16} />
                      <Line type="monotone" dataKey="presupuesto" stroke="#2563eb" strokeWidth={3} name="Presupuesto" />
                    </ComposedChart>
                  ) : (
                    <BarChart data={projectHealthChartData} margin={{ top: 10, right: 10, left: 0, bottom: isMobileChartView ? 48 : 30 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" className="dark:stroke-slate-800/50" />
                      <XAxis dataKey="chartName" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: isMobileChartView ? 8 : 9, fontWeight: 700 }} interval={0} minTickGap={isMobileChartView ? 24 : 10} angle={isMobileChartView ? -32 : -45} textAnchor="end" height={isMobileChartView ? 66 : 80} />
                      <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 9, fontWeight: 700 }} tickFormatter={(value) => `Q${value >= 1000 ? (value/1000).toFixed(0) + 'k' : value}`} />
                      <Tooltip contentStyle={{ backgroundColor: 'rgba(15, 23, 42, 0.9)', borderRadius: '16px', border: 'none', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)', backdropFilter: 'blur(8px)' }} itemStyle={{ color: '#fff', fontSize: '12px', fontWeight: 700 }} labelStyle={{ color: '#94a3b8', fontSize: '10px', fontWeight: 800, textTransform: 'uppercase', marginBottom: '4px' }} labelFormatter={(_, payload) => payload?.[0]?.payload?.name || ''} formatter={(value: number) => [formatCurrency(value), '']} />
                      <Legend verticalAlign="top" align="right" iconType="circle" wrapperStyle={{ fontSize: '9px', fontWeight: 800, textTransform: 'uppercase', paddingBottom: '20px' }} />
                      <Bar dataKey="presupuesto" fill="#3b82f6" radius={[4, 4, 0, 0]} name="Presupuesto" barSize={chartPreferences.projectHealth === 'stacked-bar' ? 22 : 20} stackId={chartPreferences.projectHealth === 'stacked-bar' ? 'health' : undefined} />
                      <Bar dataKey="gastado" fill="#ef4444" radius={[4, 4, 0, 0]} name="Gastado" barSize={chartPreferences.projectHealth === 'stacked-bar' ? 22 : 20} stackId={chartPreferences.projectHealth === 'stacked-bar' ? 'health' : undefined} />
                    </BarChart>
                  )}
                </ResponsiveContainer>
              </div>
            </div>

            <div className="bg-white dark:bg-slate-900 p-8 rounded-[var(--radius-theme)] shadow-[var(--shadow-theme)] border border-slate-100 dark:border-slate-800 transition-all duration-300 hover:shadow-lg">
              <div className="mb-6 flex items-center justify-between gap-3">
                <h3 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-widest">Estado de los Proyectos</h3>
                <select
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

            <div className="bg-white dark:bg-slate-900 p-8 rounded-[var(--radius-theme)] shadow-[var(--shadow-theme)] border border-slate-100 dark:border-slate-800 transition-all duration-300 hover:shadow-lg">
              <div className="mb-6 flex items-center justify-between gap-3">
                <h3 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-widest">Gastos por Categoría</h3>
                <select
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
                      <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 9, fontWeight: 700 }} tickFormatter={(value) => `Q${value >= 1000 ? (value/1000).toFixed(0) + 'k' : value}`} />
                      <Tooltip contentStyle={{ backgroundColor: 'rgba(15, 23, 42, 0.9)', borderRadius: '16px', border: 'none', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)', backdropFilter: 'blur(8px)' }} itemStyle={{ color: '#fff', fontSize: '12px', fontWeight: 700 }} formatter={(value: number) => [formatCurrency(value), 'Total']} />
                      <Bar dataKey="value" radius={[8, 8, 0, 0]}>
                        {expenseByCategoryData.map((entry, index) => <Cell key={`expense-bar-${index}`} fill={COLORS[index % COLORS.length]} />)}
                      </Bar>
                    </BarChart>
                  ) : chartPreferences.expenseCategory === 'radar' ? (
                    <RadarChart data={expenseRadarData} outerRadius={90}>
                      <PolarGrid stroke="#334155" strokeOpacity={0.3} />
                      <PolarAngleAxis dataKey="subject" tick={{ fill: '#94a3b8', fontSize: 9, fontWeight: 700 }} />
                      <PolarRadiusAxis tick={{ fill: '#94a3b8', fontSize: 9 }} />
                      <Tooltip contentStyle={{ backgroundColor: 'rgba(15, 23, 42, 0.9)', borderRadius: '16px', border: 'none', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)', backdropFilter: 'blur(8px)' }} itemStyle={{ color: '#fff', fontSize: '12px', fontWeight: 700 }} formatter={(value: number) => [formatCurrency(value), 'Total']} />
                      <Radar name="Total" dataKey="value" stroke="#f97316" fill="#f97316" fillOpacity={0.3} />
                    </RadarChart>
                  ) : chartPreferences.expenseCategory === 'line' ? (
                    <LineChart data={expenseByCategoryData} margin={{ top: 10, right: 10, left: 0, bottom: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" className="dark:stroke-slate-800/50" />
                      <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 9, fontWeight: 700 }} interval={0} angle={-30} textAnchor="end" height={70} />
                      <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 9, fontWeight: 700 }} tickFormatter={(value) => `Q${value >= 1000 ? (value/1000).toFixed(0) + 'k' : value}`} />
                      <Tooltip contentStyle={{ backgroundColor: 'rgba(15, 23, 42, 0.9)', borderRadius: '16px', border: 'none', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)', backdropFilter: 'blur(8px)' }} itemStyle={{ color: '#fff', fontSize: '12px', fontWeight: 700 }} formatter={(value: number) => [formatCurrency(value), 'Total']} />
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
                      <Tooltip contentStyle={{ backgroundColor: 'rgba(15, 23, 42, 0.9)', borderRadius: '16px', border: 'none', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)', backdropFilter: 'blur(8px)' }} itemStyle={{ color: '#fff', fontSize: '12px', fontWeight: 700 }} formatter={(value: number) => [formatCurrency(value), 'Total']} />
                      <Legend verticalAlign="bottom" align="center" iconType="circle" wrapperStyle={{ fontSize: '9px', fontWeight: 800, textTransform: 'uppercase', paddingTop: '20px' }} />
                    </PieChart>
                  )}
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Stacked Bar Chart for Progress Comparison */}
          <div className="bg-white dark:bg-slate-900 p-6 lg:p-7 rounded-[var(--radius-theme)] shadow-[var(--shadow-theme)] border border-slate-100 dark:border-slate-800 transition-all duration-300 hover:shadow-lg">
            <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <h3 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-widest flex items-center gap-2">
                <TrendingUp size={18} className="text-primary" />
                Comparativa de Avance (Físico vs Financiero)
              </h3>
              <div className="flex items-center gap-2">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Vista</label>
                <select
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
            {isMobileChartView && progressChartScope !== 'selected' && progressComparisonChartData.length > MOBILE_MAX_CHART_ITEMS && (
              <p className="mb-3 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                Vista móvil resumida: top {MOBILE_MAX_CHART_ITEMS} obras con mayor avance.
              </p>
            )}
            <div className="h-80 min-w-0">
              <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={220}>
                {chartPreferences.progressComparison === 'line' ? (
                  <LineChart data={progressComparisonDisplayData} margin={{ top: 20, right: 30, left: 20, bottom: isMobileChartView ? 52 : 60 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" className="dark:stroke-slate-800/50" />
                    <XAxis dataKey="chartName" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: isMobileChartView ? 8 : 10, fontWeight: 700 }} angle={isMobileChartView ? -32 : -45} textAnchor="end" interval={0} minTickGap={isMobileChartView ? 24 : 10} height={isMobileChartView ? 56 : 62} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 700 }} tickFormatter={(value) => `${value.toFixed(1)}%`} domain={[0, 100]} />
                    <Tooltip contentStyle={{ backgroundColor: 'rgba(15, 23, 42, 0.9)', borderRadius: '16px', border: 'none', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)', backdropFilter: 'blur(8px)' }} itemStyle={{ color: '#fff', fontSize: '12px', fontWeight: 700 }} labelStyle={{ color: '#94a3b8', fontSize: '10px', fontWeight: 800, textTransform: 'uppercase', marginBottom: '4px' }} labelFormatter={(_, payload) => payload?.[0]?.payload?.name || ''} formatter={(value: number) => [`${value.toFixed(1)}%`, '']} />
                    <Legend verticalAlign="top" align="right" iconType="circle" wrapperStyle={{ fontSize: '10px', fontWeight: 800, textTransform: 'uppercase', paddingBottom: '20px' }} />
                    <Line type="monotone" dataKey="fisico" stroke="#3b82f6" name="Avance Físico" strokeWidth={3} />
                    <Line type="monotone" dataKey="financiero" stroke="#ef4444" name="Avance Financiero" strokeWidth={3} />
                  </LineChart>
                ) : chartPreferences.progressComparison === 'area' ? (
                  <AreaChart data={progressComparisonDisplayData} margin={{ top: 20, right: 30, left: 20, bottom: isMobileChartView ? 52 : 60 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" className="dark:stroke-slate-800/50" />
                    <XAxis dataKey="chartName" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: isMobileChartView ? 8 : 10, fontWeight: 700 }} angle={isMobileChartView ? -32 : -45} textAnchor="end" interval={0} minTickGap={isMobileChartView ? 24 : 10} height={isMobileChartView ? 56 : 62} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 700 }} tickFormatter={(value) => `${value.toFixed(1)}%`} domain={[0, 100]} />
                    <Tooltip contentStyle={{ backgroundColor: 'rgba(15, 23, 42, 0.9)', borderRadius: '16px', border: 'none', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)', backdropFilter: 'blur(8px)' }} itemStyle={{ color: '#fff', fontSize: '12px', fontWeight: 700 }} labelStyle={{ color: '#94a3b8', fontSize: '10px', fontWeight: 800, textTransform: 'uppercase', marginBottom: '4px' }} labelFormatter={(_, payload) => payload?.[0]?.payload?.name || ''} formatter={(value: number) => [`${value.toFixed(1)}%`, '']} />
                    <Legend verticalAlign="top" align="right" iconType="circle" wrapperStyle={{ fontSize: '10px', fontWeight: 800, textTransform: 'uppercase', paddingBottom: '20px' }} />
                    <Area type="monotone" dataKey="fisico" stroke="#3b82f6" fill="#93c5fd" fillOpacity={0.3} name="Avance Físico" />
                    <Area type="monotone" dataKey="financiero" stroke="#ef4444" fill="#fda4af" fillOpacity={0.3} name="Avance Financiero" />
                  </AreaChart>
                ) : chartPreferences.progressComparison === 'radar' ? (
                  <RadarChart data={progressComparisonDisplayData.slice(0, 8)} outerRadius={95}>
                    <PolarGrid stroke="#334155" strokeOpacity={0.3} />
                    <PolarAngleAxis dataKey="chartName" tick={{ fill: '#94a3b8', fontSize: 9, fontWeight: 700 }} />
                    <PolarRadiusAxis domain={[0, 100]} tick={{ fill: '#94a3b8', fontSize: 9 }} />
                    <Tooltip contentStyle={{ backgroundColor: 'rgba(15, 23, 42, 0.9)', borderRadius: '16px', border: 'none', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)', backdropFilter: 'blur(8px)' }} itemStyle={{ color: '#fff', fontSize: '12px', fontWeight: 700 }} labelStyle={{ color: '#94a3b8', fontSize: '10px', fontWeight: 800, textTransform: 'uppercase', marginBottom: '4px' }} labelFormatter={(_, payload) => payload?.[0]?.payload?.name || ''} formatter={(value: number) => [`${value.toFixed(1)}%`, '']} />
                    <Legend verticalAlign="top" align="right" iconType="circle" wrapperStyle={{ fontSize: '10px', fontWeight: 800, textTransform: 'uppercase', paddingBottom: '20px' }} />
                    <Radar dataKey="fisico" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.25} name="Avance Físico" />
                    <Radar dataKey="financiero" stroke="#ef4444" fill="#ef4444" fillOpacity={0.2} name="Avance Financiero" />
                  </RadarChart>
                ) : (
                  <BarChart data={progressComparisonDisplayData} margin={{ top: 20, right: 30, left: 20, bottom: isMobileChartView ? 52 : 60 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" className="dark:stroke-slate-800/50" />
                    <XAxis dataKey="chartName" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: isMobileChartView ? 8 : 10, fontWeight: 700 }} angle={isMobileChartView ? -32 : -45} textAnchor="end" interval={0} minTickGap={isMobileChartView ? 24 : 10} height={isMobileChartView ? 56 : 62} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 700 }} tickFormatter={(value) => `${value.toFixed(1)}%`} domain={[0, 100]} />
                    <Tooltip contentStyle={{ backgroundColor: 'rgba(15, 23, 42, 0.9)', borderRadius: '16px', border: 'none', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)', backdropFilter: 'blur(8px)' }} itemStyle={{ color: '#fff', fontSize: '12px', fontWeight: 700 }} labelStyle={{ color: '#94a3b8', fontSize: '10px', fontWeight: 800, textTransform: 'uppercase', marginBottom: '4px' }} labelFormatter={(_, payload) => payload?.[0]?.payload?.name || ''} formatter={(value: number, name: string) => {
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
          <div className="bg-white dark:bg-slate-900 p-5 lg:p-6 rounded-[var(--radius-theme)] shadow-[var(--shadow-theme)] border border-slate-100 dark:border-slate-800 transition-all duration-300 hover:shadow-lg">
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
                  value={chartPreferences.scheduleProgress}
                  onChange={(e) => updateChartPreference('scheduleProgress', e.target.value)}
                  className="px-3 py-2 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-200 focus:ring-2 focus:ring-primary outline-none"
                >
                  {CHART_TYPE_OPTIONS.scheduleProgress.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-gradient-to-r from-sky-500 to-indigo-500" />
                  <span className="text-[10px] font-bold text-slate-500 uppercase">Físico</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-gradient-to-r from-rose-500 to-amber-500" />
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
                    <Tooltip contentStyle={{ backgroundColor: 'rgba(15, 23, 42, 0.9)', borderRadius: '16px', border: 'none', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)', backdropFilter: 'blur(8px)' }} itemStyle={{ color: '#fff', fontSize: '12px', fontWeight: 700 }} formatter={(value: number) => [`${value.toFixed(1)}%`, '']} />
                    <Legend verticalAlign="top" align="right" iconType="circle" wrapperStyle={{ fontSize: '10px', fontWeight: 800, textTransform: 'uppercase', paddingBottom: '20px' }} />
                    <Line type="monotone" dataKey="physical" stroke="#0ea5e9" name="Físico" strokeWidth={3} />
                    <Line type="monotone" dataKey="financial" stroke="#f43f5e" name="Financiero" strokeWidth={3} />
                  </LineChart>
                ) : chartPreferences.scheduleProgress === 'area' ? (
                  <AreaChart data={scheduleTrendData} margin={{ top: 10, right: 24, left: 12, bottom: 42 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" className="dark:stroke-slate-800/50" />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 9, fontWeight: 700 }} angle={-25} textAnchor="end" height={56} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 9, fontWeight: 700 }} domain={[0, 100]} tickFormatter={(value) => `${value}%`} />
                    <Tooltip contentStyle={{ backgroundColor: 'rgba(15, 23, 42, 0.9)', borderRadius: '16px', border: 'none', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)', backdropFilter: 'blur(8px)' }} itemStyle={{ color: '#fff', fontSize: '12px', fontWeight: 700 }} formatter={(value: number) => [`${value.toFixed(1)}%`, '']} />
                    <Legend verticalAlign="top" align="right" iconType="circle" wrapperStyle={{ fontSize: '10px', fontWeight: 800, textTransform: 'uppercase', paddingBottom: '20px' }} />
                    <Area type="monotone" dataKey="physical" stroke="#0ea5e9" fill="#7dd3fc" fillOpacity={0.3} name="Físico" />
                    <Area type="monotone" dataKey="financial" stroke="#f43f5e" fill="#fda4af" fillOpacity={0.22} name="Financiero" />
                  </AreaChart>
                ) : chartPreferences.scheduleProgress === 'horizontal-bars' ? (
                  <BarChart data={scheduleTrendData} layout="vertical" margin={{ top: 10, right: 24, left: 12, bottom: 12 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" className="dark:stroke-slate-800/50" />
                    <XAxis type="number" domain={[0, 100]} tickFormatter={(value) => `${value}%`} axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 9, fontWeight: 700 }} />
                    <YAxis dataKey="name" type="category" width={140} axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 9, fontWeight: 800 }} />
                    <Tooltip contentStyle={{ backgroundColor: 'rgba(15, 23, 42, 0.9)', borderRadius: '16px', border: 'none', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)', backdropFilter: 'blur(8px)' }} itemStyle={{ color: '#fff', fontSize: '12px', fontWeight: 700 }} formatter={(value: number) => [`${value.toFixed(1)}%`, '']} />
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
                                    <div className="w-2 h-2 bg-gradient-to-r from-sky-500 to-indigo-500 rounded-full" />
                                    <span className="text-xs font-bold text-white">Avance Físico</span>
                                  </div>
                                  <span className="text-xs font-black text-blue-300">{data.physical.toFixed(1)}%</span>
                                </div>
                                <div className="flex items-center justify-between gap-8">
                                  <div className="flex items-center gap-2">
                                    <div className="w-2 h-2 bg-gradient-to-r from-rose-500 to-amber-500 rounded-full" />
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

        <div className="space-y-6 lg:space-y-5">
          <div className="bg-white dark:bg-slate-900 p-5 rounded-[var(--radius-theme)] shadow-[var(--shadow-theme)] border border-slate-100 dark:border-slate-800 transition-all duration-300 hover:shadow-lg">
            <h3 className="text-base font-bold text-slate-900 dark:text-white mb-4">Balance General</h3>
            <div className="h-52 min-w-0">
              <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={180}>
                <PieChart>
                  <Pie
                    data={financialSplitData.length > 0 ? financialSplitData : [{ name: 'Sin datos', value: 1, color: '#94a3b8' }]}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="45%"
                    innerRadius={55}
                    outerRadius={78}
                    paddingAngle={4}
                  >
                    {(financialSplitData.length > 0 ? financialSplitData : [{ name: 'Sin datos', value: 1, color: '#94a3b8' }]).map((entry, index) => (
                      <Cell key={`financial-split-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ backgroundColor: 'rgba(15, 23, 42, 0.9)', borderRadius: '16px', border: 'none', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)', backdropFilter: 'blur(8px)' }}
                    itemStyle={{ color: '#fff', fontSize: '12px', fontWeight: 700 }}
                    formatter={(value: number) => [formatCurrency(value), '']}
                  />
                  <Legend verticalAlign="bottom" align="center" iconType="circle" wrapperStyle={{ fontSize: '10px', fontWeight: 800, textTransform: 'uppercase', paddingTop: '12px' }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 p-6 rounded-[var(--radius-theme)] shadow-[var(--shadow-theme)] border border-slate-100 dark:border-slate-800 transition-all duration-300 hover:shadow-lg">
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
              {inactiveProjects.length === 0 && lowStockItems.length === 0 && (
                <p className="text-sm text-slate-400 dark:text-slate-500 italic">No hay alertas críticas en este momento.</p>
              )}
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 p-6 rounded-[var(--radius-theme)] shadow-[var(--shadow-theme)] border border-slate-100 dark:border-slate-800 transition-all duration-300 hover:shadow-lg">
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
      {/* Floating Action Button for Mobile */}
      <div className="lg:hidden fixed bottom-24 right-6 z-50">
        <AnimatePresence>
          {isFabOpen && (
            <motion.div
              initial={{ opacity: 0, scale: 0.8, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.8, y: 20 }}
              className="absolute bottom-16 right-0 w-64 space-y-3"
            >
              <QuickActionButton 
                icon={ConstructionIcon} 
                label="Nueva Obra" 
                color="bg-primary"
                onClick={() => {
                  setIsFabOpen(false);
                  navigate('/projects');
                }}
              />
              <QuickActionButton 
                icon={ShoppingBag} 
                label="Nueva Compra" 
                color="bg-amber-500"
                onClick={() => {
                  setIsFabOpen(false);
                  navigate('/purchase-orders');
                }}
              />
              <QuickActionButton 
                icon={PackageIcon} 
                label="Mover Inventario" 
                color="bg-emerald-500"
                onClick={() => {
                  setIsFabOpen(false);
                  navigate('/inventory');
                }}
              />
            </motion.div>
          )}
        </AnimatePresence>
        
        <button
          title={isFabOpen ? 'Cerrar acciones rapidas' : 'Abrir acciones rapidas'}
          aria-label={isFabOpen ? 'Cerrar acciones rapidas' : 'Abrir acciones rapidas'}
          onClick={() => setIsFabOpen(!isFabOpen)}
          className={cn(
            "w-14 h-14 rounded-full shadow-2xl flex items-center justify-center transition-all duration-300",
            isFabOpen ? "bg-slate-800 dark:bg-white text-white dark:text-slate-900 rotate-45" : "bg-primary text-white shadow-primary-shadow"
          )}
        >
          <Plus size={24} />
        </button>
      </div>

      {/* Quick Progress Update Modal */}
      <AnimatePresence>
        {isQuickProgressModalOpen && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-950/50 backdrop-blur-sm">
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
