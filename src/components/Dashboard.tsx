import React, { useEffect, useMemo, useRef, useState } from 'react';
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
import { createPurchaseOrder, listInventory, listPurchaseOrders } from '../lib/operationsApi';
import { listSubcontracts } from '../lib/subcontractsApi';
import { createWorkflow, listWorkflows } from '../lib/workflowsApi';
import { useTheme } from '../contexts/ThemeContext';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { drawReportHeader } from '../lib/pdfUtils';
import { getThresholdSettings } from '../lib/settingsApi';
import { listOcrValidations, validateDocumentOCR } from '../lib/aiOpsApi';
import { auth } from '../lib/authStorageClient';

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

const MARKET_RATE_BY_TYPOLOGY: Record<string, number> = {
  RESIDENCIAL: 4500,
  COMERCIAL: 6500,
  INDUSTRIAL: 5500,
  CIVIL: 3500,
  PUBLICA: 4000,
  SALUD: 8500,
  EDUCACION: 5000,
  DEPORTIVA: 4800,
  INFRAESTRUCTURA: 7500,
  TURISMO: 7000,
};

const MATERIAL_WEEKLY_SPIKE_THRESHOLD_STORAGE_KEY = 'material_weekly_spike_threshold_pct';
const PHYSICAL_FINANCIAL_DEVIATION_THRESHOLD_STORAGE_KEY = 'physical_financial_deviation_threshold_pct';

type DashboardChartKey =
  | 'profitTrend'
  | 'projectHealth'
  | 'projectStatus'
  | 'expenseCategory'
  | 'progressComparison'
  | 'scheduleProgress';

type DashboardChartPreferences = Record<DashboardChartKey, string>;

type OcrHistoryColumnKey =
  | 'id'
  | 'date'
  | 'projectId'
  | 'purchaseOrderId'
  | 'invoiceNumber'
  | 'supplier'
  | 'detectedTotal'
  | 'score'
  | 'resultStatus'
  | 'decision'
  | 'autoApply'
  | 'autoActionSummary';

const OCR_HISTORY_COLUMN_OPTIONS: Array<{ key: OcrHistoryColumnKey; label: string }> = [
  { key: 'invoiceNumber', label: 'Factura' },
  { key: 'supplier', label: 'Proveedor' },
  { key: 'detectedTotal', label: 'Monto detectado' },
  { key: 'score', label: 'Score' },
  { key: 'resultStatus', label: 'Resultado' },
  { key: 'decision', label: 'Decisión' },
  { key: 'date', label: 'Fecha' },
  { key: 'projectId', label: 'Proyecto' },
  { key: 'purchaseOrderId', label: 'Orden de compra' },
  { key: 'autoApply', label: 'Auto-aplicar' },
  { key: 'autoActionSummary', label: 'Auto-acción' },
  { key: 'id', label: 'ID' },
];

const OCR_HISTORY_DEFAULT_COLUMNS: OcrHistoryColumnKey[] = [
  'invoiceNumber',
  'supplier',
  'detectedTotal',
  'score',
  'resultStatus',
  'decision',
  'date',
  'autoActionSummary',
];

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
  const executiveControlRef = useRef<HTMLDivElement>(null);
  const [projects, setProjects] = useState<any[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [inventory, setInventory] = useState<any[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<any[]>([]);
  const [portfolioBudgetItemsByProject, setPortfolioBudgetItemsByProject] = useState<Record<string, any[]>>({});
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
  const [inflationScenarioPct, setInflationScenarioPct] = useState(0);
  const [selectedProviderVolatility, setSelectedProviderVolatility] = useState('all');
  const [selectedMarginProjectId, setSelectedMarginProjectId] = useState('all');
  const [materialWeeklySpikeThreshold, setMaterialWeeklySpikeThreshold] = useState<number>(() => {
    const saved = Number(localStorage.getItem(MATERIAL_WEEKLY_SPIKE_THRESHOLD_STORAGE_KEY) || 10);
    if (!Number.isFinite(saved)) return 10;
    return Math.max(3, Math.min(40, saved));
  });
  const [physicalFinancialDeviationThreshold, setPhysicalFinancialDeviationThreshold] = useState<number>(() => {
    const saved = Number(localStorage.getItem(PHYSICAL_FINANCIAL_DEVIATION_THRESHOLD_STORAGE_KEY) || 15);
    if (!Number.isFinite(saved)) return 15;
    return Math.max(5, Math.min(40, saved));
  });
  const [progressChartScope, setProgressChartScope] = useState<'all' | 'selected'>('all');
  const [executingRecommendationId, setExecutingRecommendationId] = useState<string | null>(null);
  const [executedRecommendationIds, setExecutedRecommendationIds] = useState<string[]>([]);
  const [ocrRawText, setOcrRawText] = useState('');
  const [ocrImageDataUrl, setOcrImageDataUrl] = useState<string | null>(null);
  const [ocrFileName, setOcrFileName] = useState<string | null>(null);
  const [ocrSelectedPurchaseOrderId, setOcrSelectedPurchaseOrderId] = useState('');
  const [ocrSelectedProjectId, setOcrSelectedProjectId] = useState('');
  const [ocrValidationResult, setOcrValidationResult] = useState<any | null>(null);
  const [isValidatingDocument, setIsValidatingDocument] = useState(false);
  const [ocrAutoApply, setOcrAutoApply] = useState(true);
  const [cashflowScenario, setCashflowScenario] = useState<'base' | 'inflation' | 'stress'>('base');
  const [ocrValidationHistory, setOcrValidationHistory] = useState<any[]>([]);
  const [ocrHistoryProjectFilter, setOcrHistoryProjectFilter] = useState('all');
  const [ocrHistoryDecisionFilter, setOcrHistoryDecisionFilter] = useState<'all' | 'approved' | 'review' | 'rejected'>('all');
  const [ocrHistoryDateRange, setOcrHistoryDateRange] = useState<'7' | '30' | '90' | 'all'>('30');
  const [ocrHistorySupplierFilter, setOcrHistorySupplierFilter] = useState('');
  const [ocrHistoryInvoiceFilter, setOcrHistoryInvoiceFilter] = useState('');
  const [ocrHistoryViewMode, setOcrHistoryViewMode] = useState<'cards' | 'table'>('cards');
  const [ocrHistorySortBy, setOcrHistorySortBy] = useState<'date' | 'score' | 'amount' | 'supplier' | 'invoiceNumber' | 'decision' | 'resultStatus'>('date');
  const [ocrHistorySortDirection, setOcrHistorySortDirection] = useState<'asc' | 'desc'>('desc');
  const [ocrHistorySelectedColumns, setOcrHistorySelectedColumns] = useState<OcrHistoryColumnKey[]>(OCR_HISTORY_DEFAULT_COLUMNS);
  const [ocrHistoryStickyColumnsEnabled, setOcrHistoryStickyColumnsEnabled] = useState(true);
  const [ocrHistoryOffset, setOcrHistoryOffset] = useState(0);
  const [ocrHistoryHasMore, setOcrHistoryHasMore] = useState(false);
  const [isLoadingMoreOcrHistory, setIsLoadingMoreOcrHistory] = useState(false);
  const [chartPreferences, setChartPreferences] = useState<DashboardChartPreferences>(
    THEME_DEFAULT_CHARTS.sunset
  );
  const [isMobileChartView, setIsMobileChartView] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.innerWidth < MOBILE_CHART_BREAKPOINT;
  });
  const navigate = useNavigate();

  const ocrHistoryPreferencesStorageKey = useMemo(() => {
    const actor = auth.currentUser?.email || auth.currentUser?.displayName || 'default';
    return `dashboard_ocr_history_preferences_${actor}`;
  }, [auth.currentUser?.email, auth.currentUser?.displayName]);

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
    try {
      const raw = localStorage.getItem(ocrHistoryPreferencesStorageKey);
      if (!raw) return;

      const parsed = JSON.parse(raw);
      if (typeof parsed?.projectFilter === 'string') setOcrHistoryProjectFilter(parsed.projectFilter);
      if (parsed?.decisionFilter === 'all' || parsed?.decisionFilter === 'approved' || parsed?.decisionFilter === 'review' || parsed?.decisionFilter === 'rejected') {
        setOcrHistoryDecisionFilter(parsed.decisionFilter);
      }
      if (parsed?.dateRange === '7' || parsed?.dateRange === '30' || parsed?.dateRange === '90' || parsed?.dateRange === 'all') {
        setOcrHistoryDateRange(parsed.dateRange);
      }
      if (typeof parsed?.supplierFilter === 'string') setOcrHistorySupplierFilter(parsed.supplierFilter);
      if (typeof parsed?.invoiceFilter === 'string') setOcrHistoryInvoiceFilter(parsed.invoiceFilter);
      if (parsed?.viewMode === 'cards' || parsed?.viewMode === 'table') {
        setOcrHistoryViewMode(parsed.viewMode);
      }
      if (
        parsed?.sortBy === 'date' ||
        parsed?.sortBy === 'score' ||
        parsed?.sortBy === 'amount' ||
        parsed?.sortBy === 'supplier' ||
        parsed?.sortBy === 'invoiceNumber' ||
        parsed?.sortBy === 'decision' ||
        parsed?.sortBy === 'resultStatus'
      ) {
        setOcrHistorySortBy(parsed.sortBy);
      }
      if (parsed?.sortDirection === 'asc' || parsed?.sortDirection === 'desc') {
        setOcrHistorySortDirection(parsed.sortDirection);
      }
      if (Array.isArray(parsed?.selectedColumns)) {
        const allowed = new Set<OcrHistoryColumnKey>(OCR_HISTORY_COLUMN_OPTIONS.map((option) => option.key));
        const normalized = parsed.selectedColumns
          .filter((key: unknown): key is OcrHistoryColumnKey => typeof key === 'string' && allowed.has(key as OcrHistoryColumnKey));
        if (normalized.length > 0) {
          setOcrHistorySelectedColumns(normalized);
        }
      }
      if (typeof parsed?.stickyColumnsEnabled === 'boolean') {
        setOcrHistoryStickyColumnsEnabled(parsed.stickyColumnsEnabled);
      }
    } catch {
      // Ignore malformed preference payloads.
    }
  }, [ocrHistoryPreferencesStorageKey]);

  useEffect(() => {
    const payload = {
      projectFilter: ocrHistoryProjectFilter,
      decisionFilter: ocrHistoryDecisionFilter,
      dateRange: ocrHistoryDateRange,
      supplierFilter: ocrHistorySupplierFilter,
      invoiceFilter: ocrHistoryInvoiceFilter,
      viewMode: ocrHistoryViewMode,
      sortBy: ocrHistorySortBy,
      sortDirection: ocrHistorySortDirection,
      selectedColumns: ocrHistorySelectedColumns,
      stickyColumnsEnabled: ocrHistoryStickyColumnsEnabled,
    };
    localStorage.setItem(ocrHistoryPreferencesStorageKey, JSON.stringify(payload));
  }, [
    ocrHistoryPreferencesStorageKey,
    ocrHistoryProjectFilter,
    ocrHistoryDecisionFilter,
    ocrHistoryDateRange,
    ocrHistorySupplierFilter,
    ocrHistoryInvoiceFilter,
    ocrHistoryViewMode,
    ocrHistorySortBy,
    ocrHistorySortDirection,
    ocrHistorySelectedColumns,
    ocrHistoryStickyColumnsEnabled,
  ]);

  const ocrHistoryProjectOptions = useMemo(() => {
    const unique = new Map<string, string>();

    for (const project of projects) {
      if (!project?.id) continue;
      unique.set(String(project.id), project.name || String(project.id));
    }

    for (const row of ocrValidationHistory) {
      if (!row?.projectId || unique.has(String(row.projectId))) continue;
      unique.set(String(row.projectId), String(row.projectId));
    }

    return Array.from(unique.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [projects, ocrValidationHistory]);

  const visibleOcrValidationHistory = useMemo(() => {
    return ocrValidationHistory.filter((row: any) => {
      if (ocrHistoryDecisionFilter !== 'all' && row.decision !== ocrHistoryDecisionFilter) {
        return false;
      }
      const supplierFilter = ocrHistorySupplierFilter.trim().toLowerCase();
      if (supplierFilter) {
        const supplierValue = String(row.supplier || '').toLowerCase();
        if (!supplierValue.includes(supplierFilter)) {
          return false;
        }
      }

      const invoiceFilter = ocrHistoryInvoiceFilter.trim().toLowerCase();
      if (invoiceFilter) {
        const invoiceValue = String(row.invoiceNumber || '').toLowerCase();
        if (!invoiceValue.includes(invoiceFilter)) {
          return false;
        }
      }
      return true;
    });
  }, [ocrValidationHistory, ocrHistoryDecisionFilter, ocrHistorySupplierFilter, ocrHistoryInvoiceFilter]);

  const sortedVisibleOcrValidationHistory = useMemo(() => {
    const sorted = [...visibleOcrValidationHistory];
    sorted.sort((a: any, b: any) => {
      const direction = ocrHistorySortDirection === 'asc' ? 1 : -1;

      if (ocrHistorySortBy === 'score') {
        return (Number(a.score || 0) - Number(b.score || 0)) * direction;
      }

      if (ocrHistorySortBy === 'amount') {
        return (Number(a.detectedTotal || 0) - Number(b.detectedTotal || 0)) * direction;
      }

      if (ocrHistorySortBy === 'supplier') {
        return String(a.supplier || '').localeCompare(String(b.supplier || '')) * direction;
      }

      if (ocrHistorySortBy === 'invoiceNumber') {
        return String(a.invoiceNumber || '').localeCompare(String(b.invoiceNumber || '')) * direction;
      }

      if (ocrHistorySortBy === 'decision') {
        return String(a.decision || '').localeCompare(String(b.decision || '')) * direction;
      }

      if (ocrHistorySortBy === 'resultStatus') {
        return String(a.resultStatus || '').localeCompare(String(b.resultStatus || '')) * direction;
      }

      const aDate = new Date(a.createdAt || 0).getTime();
      const bDate = new Date(b.createdAt || 0).getTime();
      return (aDate - bDate) * direction;
    });
    return sorted;
  }, [visibleOcrValidationHistory, ocrHistorySortBy, ocrHistorySortDirection]);

  const ocrHistoryColumnLabelMap = useMemo(
    () => Object.fromEntries(OCR_HISTORY_COLUMN_OPTIONS.map((option) => [option.key, option.label])) as Record<OcrHistoryColumnKey, string>,
    []
  );

  const ocrStickyColumnLeftMap = useMemo(() => {
    const stickyOrder: OcrHistoryColumnKey[] = ['invoiceNumber', 'supplier', 'score'];
    const widthByColumn: Record<OcrHistoryColumnKey, number> = {
      id: 180,
      date: 180,
      projectId: 170,
      purchaseOrderId: 170,
      invoiceNumber: 220,
      supplier: 200,
      detectedTotal: 140,
      score: 110,
      resultStatus: 140,
      decision: 120,
      autoApply: 120,
      autoActionSummary: 220,
    };

    const map: Partial<Record<OcrHistoryColumnKey, number>> = {};
    if (!ocrHistoryStickyColumnsEnabled) {
      return map;
    }

    let left = 0;
    for (const columnKey of stickyOrder) {
      if (!ocrHistorySelectedColumns.includes(columnKey)) continue;
      map[columnKey] = left;
      left += widthByColumn[columnKey];
    }

    return map;
  }, [ocrHistorySelectedColumns, ocrHistoryStickyColumnsEnabled]);

  const handleOcrTableHeaderSort = (columnKey: OcrHistoryColumnKey) => {
    const map: Partial<Record<OcrHistoryColumnKey, 'date' | 'score' | 'amount' | 'supplier' | 'invoiceNumber' | 'decision' | 'resultStatus'>> = {
      date: 'date',
      score: 'score',
      detectedTotal: 'amount',
      supplier: 'supplier',
      invoiceNumber: 'invoiceNumber',
      decision: 'decision',
      resultStatus: 'resultStatus',
    };

    const mappedSortBy = map[columnKey];
    if (!mappedSortBy) return;

    setOcrHistorySortBy((prevSortBy) => {
      if (prevSortBy === mappedSortBy) {
        setOcrHistorySortDirection((prevDirection) => (prevDirection === 'asc' ? 'desc' : 'asc'));
        return prevSortBy;
      }

      setOcrHistorySortDirection('desc');
      return mappedSortBy;
    });
  };

  const getOcrColumnRawValue = (row: any, key: OcrHistoryColumnKey): string | number => {
    switch (key) {
      case 'id':
        return row.id || '';
      case 'date':
        return row.createdAt || '';
      case 'projectId':
        return row.projectId || '';
      case 'purchaseOrderId':
        return row.purchaseOrderId || '';
      case 'invoiceNumber':
        return row.invoiceNumber || '';
      case 'supplier':
        return row.supplier || '';
      case 'detectedTotal':
        return Number(row.detectedTotal || 0);
      case 'score':
        return Number(row.score || 0);
      case 'resultStatus':
        return row.resultStatus || '';
      case 'decision':
        return row.decision || '';
      case 'autoApply':
        return row.autoApply ? 'true' : 'false';
      case 'autoActionSummary':
        return row.autoActionSummary || '';
      default:
        return '';
    }
  };

  const getOcrColumnDisplayValue = (row: any, key: OcrHistoryColumnKey): string => {
    if (key === 'detectedTotal') {
      return formatCurrency(Number(row.detectedTotal || 0));
    }
    if (key === 'date') {
      return row.createdAt ? new Date(row.createdAt).toLocaleString('es-GT') : 'N/A';
    }
    if (key === 'autoApply') {
      return row.autoApply ? 'Sí' : 'No';
    }
    const value = getOcrColumnRawValue(row, key);
    return String(value || 'N/A');
  };

  const toggleOcrHistoryColumn = (columnKey: OcrHistoryColumnKey) => {
    setOcrHistorySelectedColumns((prev) => {
      if (prev.includes(columnKey)) {
        if (prev.length === 1) {
          toast.info('Debes mantener al menos una columna visible.');
          return prev;
        }
        return prev.filter((key) => key !== columnKey);
      }
      return [...prev, columnKey];
    });
  };

  const ocrEffectiveness = useMemo(() => {
    const total = visibleOcrValidationHistory.length;
    if (total === 0) {
      return {
        total,
        approved: 0,
        review: 0,
        rejected: 0,
        autoApplied: 0,
        avgScore: 0,
      };
    }

    const approved = visibleOcrValidationHistory.filter((row: any) => row.decision === 'approved').length;
    const review = visibleOcrValidationHistory.filter((row: any) => row.decision === 'review').length;
    const rejected = visibleOcrValidationHistory.filter((row: any) => row.decision === 'rejected').length;
    const autoApplied = visibleOcrValidationHistory.filter((row: any) => Boolean(row.autoApply)).length;
    const avgScore =
      visibleOcrValidationHistory.reduce((acc: number, row: any) => acc + Number(row.score || 0), 0) /
      Math.max(1, total);

    return {
      total,
      approved,
      review,
      rejected,
      autoApplied,
      avgScore: Number(avgScore.toFixed(1)),
    };
  }, [visibleOcrValidationHistory]);

  useEffect(() => {
    const focusExecutiveControl = () => {
      executiveControlRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };

    window.addEventListener('FOCUS_EXECUTIVE_CONTROL_CENTER', focusExecutiveControl);
    return () => window.removeEventListener('FOCUS_EXECUTIVE_CONTROL_CENTER', focusExecutiveControl);
  }, []);

  useEffect(() => {
    const refreshThreshold = () => {
      const saved = Number(localStorage.getItem(MATERIAL_WEEKLY_SPIKE_THRESHOLD_STORAGE_KEY) || 10);
      if (!Number.isFinite(saved)) {
        setMaterialWeeklySpikeThreshold(10);
        return;
      }
      setMaterialWeeklySpikeThreshold(Math.max(3, Math.min(40, saved)));
    };

    window.addEventListener('MATERIAL_ALERT_THRESHOLD_CHANGED', refreshThreshold);
    return () => window.removeEventListener('MATERIAL_ALERT_THRESHOLD_CHANGED', refreshThreshold);
  }, []);

  useEffect(() => {
    const refreshThreshold = () => {
      const saved = Number(localStorage.getItem(PHYSICAL_FINANCIAL_DEVIATION_THRESHOLD_STORAGE_KEY) || 15);
      if (!Number.isFinite(saved)) {
        setPhysicalFinancialDeviationThreshold(15);
        return;
      }
      setPhysicalFinancialDeviationThreshold(Math.max(5, Math.min(40, saved)));
    };

    window.addEventListener('PHYSICAL_FINANCIAL_DEVIATION_THRESHOLD_CHANGED', refreshThreshold);
    return () => window.removeEventListener('PHYSICAL_FINANCIAL_DEVIATION_THRESHOLD_CHANGED', refreshThreshold);
  }, []);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const remote = await getThresholdSettings();
        if (cancelled) return;

        setMaterialWeeklySpikeThreshold(remote.materialWeeklySpikeThresholdPct);
        setPhysicalFinancialDeviationThreshold(remote.physicalFinancialDeviationThresholdPct);

        localStorage.setItem(MATERIAL_WEEKLY_SPIKE_THRESHOLD_STORAGE_KEY, String(remote.materialWeeklySpikeThresholdPct));
        localStorage.setItem(PHYSICAL_FINANCIAL_DEVIATION_THRESHOLD_STORAGE_KEY, String(remote.physicalFinancialDeviationThresholdPct));
      } catch {
        // Keep local thresholds when remote settings are unavailable.
      }
    })();

    return () => {
      cancelled = true;
    };
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
        const [projectsItems, transactionsResult, inventoryResult, purchaseOrdersItems, subcontractsItems, workflowsItems] = await Promise.all([
          listProjects(),
          listTransactions({ limit: 100, offset: 0 }),
          listInventory({ limit: 500, offset: 0 }),
          listPurchaseOrders(),
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
        setPurchaseOrders(purchaseOrdersItems);
        setSubcontracts(subcontractsItems);
        setPendingWorkflows(workflowsItems.slice(0, 5));
        setRecentLogs([]);

        const projectsForBaseline = normalizedProjects
          .filter((project: any) => {
            const status = String(project?.status || '').toLowerCase();
            return status !== 'completed' && status !== 'cancelled';
          })
          .slice(0, 15);

        const budgetDetailPairs = await Promise.all(
          projectsForBaseline.map(async (project: any) => {
            try {
              const items = await listProjectBudgetItemsDetailed(project.id);
              return [project.id, items] as const;
            } catch {
              return [project.id, []] as const;
            }
          })
        );

        if (!cancelled) {
          setPortfolioBudgetItemsByProject(
            budgetDetailPairs.reduce((acc, [projectId, items]) => {
              acc[projectId] = items;
              return acc;
            }, {} as Record<string, any[]>)
          );
        }
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

        if (progressDeviation > physicalFinancialDeviationThreshold && !notifiedItems[projectId]) {
          sendNotification(
            'Alerta de Desviación Financiera',
            `La obra ${p.name} tiene una desviación del ${progressDeviation.toFixed(1)}% (umbral ${physicalFinancialDeviationThreshold}%).`,
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
  }, [projects, subcontracts, loading, physicalFinancialDeviationThreshold]);

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
    return progressDeviation > physicalFinancialDeviationThreshold;
  });

  const physicalFinancialGapRanking = useMemo(() => {
    return projects
      .filter((project: any) => project.status === 'In Progress' || project.status === 'Active')
      .map((project: any) => {
        const physicalProgress = clampPercent(project.physicalProgress || 0);
        const financialProgress = getFinancialProgress(project);
        const gap = Number((financialProgress - physicalProgress).toFixed(1));
        return {
          projectId: project.id,
          projectName: project.name,
          shortName: String(project.name || '').length > 22 ? `${String(project.name).slice(0, 21)}...` : String(project.name || 'Proyecto'),
          physicalProgress,
          financialProgress,
          gap,
          recommendation: getMitigationSuggestions(gap)[0] || 'Revisar control de ejecución y flujo de caja de obra.',
        };
      })
      .filter((row) => row.gap > 0)
      .sort((left, right) => right.gap - left.gap)
      .slice(0, 6);
  }, [projects]);

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

  const portfolioSemaforo = useMemo(() => {
    const active = projects.filter((project: any) => {
      const status = String(project?.status || '').toLowerCase();
      return status !== 'completed' && status !== 'cancelled';
    });

    let high = 0;
    let medium = 0;
    const risks: string[] = [];
    const strengths: string[] = [];

    active.forEach((project: any) => {
      const name = String(project?.name || 'Proyecto');
      const budget = Number(project?.budget || 0);
      const spent = Number(project?.spent || 0);
      const physical = clampPercent(project?.physicalProgress || 0);
      const financial = budget > 0 ? clampPercent((spent / budget) * 100) : clampPercent(project?.financialProgress || 0);
      const gap = financial - physical;

      if (gap > 12) {
        high += 1;
        risks.push(`${name}: sobreconsumo financiero (${gap.toFixed(1)}% sobre avance físico).`);
      } else if (gap > 6) {
        medium += 1;
      } else if (physical > 30) {
        strengths.push(`${name}: balance físico-financiero saludable.`);
      }

      const area = Number(project?.area || 0);
      const typology = String(project?.typology || '').toUpperCase();
      const rate = MARKET_RATE_BY_TYPOLOGY[typology];
      if (area > 0 && budget > 0 && rate) {
        const expected = area * rate;
        if (budget < expected * 0.8) {
          high += 1;
          risks.push(`${name}: presupuesto base bajo para ${typology}.`);
        } else if (budget < expected * 0.9) {
          medium += 1;
        } else if (budget <= expected * 1.1) {
          strengths.push(`${name}: baseline consistente con benchmark de ${typology}.`);
        }
      }

      const startDate = project?.startDate ? new Date(project.startDate) : null;
      const endDate = project?.endDate ? new Date(project.endDate) : null;
      if (startDate && endDate && !Number.isNaN(startDate.getTime()) && !Number.isNaN(endDate.getTime())) {
        const totalDuration = endDate.getTime() - startDate.getTime();
        const elapsed = Date.now() - startDate.getTime();
        if (totalDuration > 0 && elapsed > 0) {
          const expectedPhysical = clampPercent((elapsed / totalDuration) * 100);
          const delayGap = expectedPhysical - physical;
          if (delayGap > 15) {
            high += 1;
            risks.push(`${name}: atraso crítico (${delayGap.toFixed(1)}% bajo cronograma esperado).`);
          } else if (delayGap > 8) {
            medium += 1;
          }
        }
      }
    });

    if (lowStockItems.length >= 5) {
      high += 1;
      risks.push(`Inventario: ${lowStockItems.length} materiales en nivel crítico.`);
    } else if (lowStockItems.length > 0) {
      medium += 1;
      risks.push(`Inventario: ${lowStockItems.length} materiales cerca de stock mínimo.`);
    } else {
      strengths.push('Inventario: sin alertas críticas de abastecimiento.');
    }

    const score = Math.max(0, Math.min(100, 100 - (high * 18) - (medium * 8)));
    const status = high > 0 ? 'rojo' : medium > 0 ? 'amarillo' : 'verde';

    return {
      status,
      score,
      high,
      medium,
      risks: risks.slice(0, 4),
      strengths: strengths.slice(0, 4),
    };
  }, [projects, lowStockItems]);

  const financialSplitData = [
    { name: 'Ingresos', value: financialSummary.totalIncome, color: '#10b981' },
    { name: 'Gastos', value: financialSummary.totalExpense, color: '#ef4444' },
  ].filter((item) => item.value > 0);

  const materialPriceSignals = useMemo(() => {
    return [...inventory]
      .filter((item: any) => Number(item.unitPrice || 0) > 0)
      .sort((left: any, right: any) => Number(right.unitPrice || 0) - Number(left.unitPrice || 0))
      .slice(0, 5)
      .map((item: any) => {
        const minStock = Number(item.minStock || 0);
        const stock = Number(item.stock || 0);
        const critical = minStock > 0 && stock <= minStock;
        return {
          id: item.id,
          name: item.name,
          unitPrice: Number(item.unitPrice || 0),
          stock,
          minStock,
          critical,
        };
      });
  }, [inventory]);

  const materialBudgetBaseline = useMemo(() => {
    const baseline: Record<string, { name: string; weightedUnitPrice: number; sampleCount: number }> = {};

    Object.values(portfolioBudgetItemsByProject).forEach((items) => {
      (items || []).forEach((item: any) => {
        const rowQty = Number(item?.quantity || 0);
        const materials = Array.isArray(item?.materials) ? item.materials : [];

        materials.forEach((material: any) => {
          const materialName = String(material?.name || '').trim();
          const expectedUnitPrice = Number(material?.unitPrice || 0);
          const materialQtyPerItem = Number(material?.quantity || 0);
          if (!materialName || expectedUnitPrice <= 0 || materialQtyPerItem <= 0 || rowQty <= 0) return;

          const key = materialName.toLowerCase();
          const weight = materialQtyPerItem * rowQty;
          if (!baseline[key]) {
            baseline[key] = { name: materialName, weightedUnitPrice: 0, sampleCount: 0 };
          }

          baseline[key].weightedUnitPrice += expectedUnitPrice * weight;
          baseline[key].sampleCount += weight;
        });
      });
    });

    Object.keys(baseline).forEach((key) => {
      const entry = baseline[key];
      if (entry.sampleCount > 0) {
        entry.weightedUnitPrice = entry.weightedUnitPrice / entry.sampleCount;
      }
    });

    return baseline;
  }, [portfolioBudgetItemsByProject]);

  const recentMaterialPriceHistory = useMemo(() => {
    const validOrders = purchaseOrders
      .filter((order: any) => Number(order?.quantity || 0) > 0 && Number(order?.estimatedCost || 0) > 0)
      .map((order: any) => {
        const quantity = Number(order.quantity || 0);
        const totalCost = Number(order.estimatedCost || 0);
        const unitPrice = quantity > 0 ? totalCost / quantity : 0;
        const dateValue = String(order.datePaid || order.dateReceived || order.date || '');
        return {
          materialName: String(order.materialName || 'Material').trim(),
          unitPrice,
          dateValue,
          timestamp: Date.parse(dateValue),
        };
      })
      .filter((item: any) => item.materialName && item.unitPrice > 0 && Number.isFinite(item.timestamp));

    const byMaterial = validOrders.reduce((acc: Record<string, any[]>, item: any) => {
      const key = item.materialName.toLowerCase();
      if (!acc[key]) acc[key] = [];
      acc[key].push(item);
      return acc;
    }, {});

    const topMaterialKey = Object.keys(byMaterial)
      .sort((left, right) => byMaterial[right].length - byMaterial[left].length)[0];

    if (!topMaterialKey) {
      return {
        materialName: '',
        points: [] as Array<{ dateLabel: string; unitPrice: number }>,
        weeklyChangePct: 0,
        monthlyChangePct: 0,
      };
    }

    const pointsRaw = [...byMaterial[topMaterialKey]]
      .sort((left, right) => left.timestamp - right.timestamp)
      .slice(-10);

    const points = pointsRaw.map((item) => ({
      dateLabel: formatDateFns(new Date(item.timestamp), 'dd/MM'),
      unitPrice: Number(item.unitPrice.toFixed(2)),
    }));

    const latest = pointsRaw[pointsRaw.length - 1]?.unitPrice || 0;
    const weeklyBaseline = pointsRaw[Math.max(0, pointsRaw.length - 4)]?.unitPrice || latest;
    const monthlyBaseline = pointsRaw[0]?.unitPrice || latest;

    const weeklyChangePct = weeklyBaseline > 0 ? ((latest - weeklyBaseline) / weeklyBaseline) * 100 : 0;
    const monthlyChangePct = monthlyBaseline > 0 ? ((latest - monthlyBaseline) / monthlyBaseline) * 100 : 0;

    return {
      materialName: byMaterial[topMaterialKey][0]?.materialName || '',
      points,
      weeklyChangePct: Number(weeklyChangePct.toFixed(1)),
      monthlyChangePct: Number(monthlyChangePct.toFixed(1)),
    };
  }, [purchaseOrders]);

  const materialDeviationAlerts = useMemo(() => {
    return inventory
      .map((item: any) => {
        const key = String(item?.name || '').toLowerCase();
        const expected = Number(materialBudgetBaseline[key]?.weightedUnitPrice || 0);
        const current = Number(item?.unitPrice || 0);
        if (expected <= 0 || current <= 0) return null;

        const deviationPct = ((current - expected) / expected) * 100;
        if (Math.abs(deviationPct) < 12) return null;

        return {
          id: item.id,
          name: item.name,
          expected,
          current,
          deviationPct: Number(deviationPct.toFixed(1)),
          severity: deviationPct >= 25 ? 'high' : 'medium',
        };
      })
      .filter(Boolean)
      .sort((left: any, right: any) => Math.abs(right.deviationPct) - Math.abs(left.deviationPct))
      .slice(0, 6) as Array<{
        id: string;
        name: string;
        expected: number;
        current: number;
        deviationPct: number;
        severity: 'high' | 'medium';
      }>;
  }, [inventory, materialBudgetBaseline]);

  const projectedCostOverrunByProject = useMemo(() => {
    const rows = projects
      .map((project: any) => {
        const budgetRows = portfolioBudgetItemsByProject[project.id] || [];
        let projectedOverrun = 0;

        budgetRows.forEach((row: any) => {
          const rowQty = Number(row?.quantity || 0);
          const materials = Array.isArray(row?.materials) ? row.materials : [];

          materials.forEach((material: any) => {
            const nameKey = String(material?.name || '').toLowerCase();
            const expectedPrice = Number(material?.unitPrice || 0);
            const inventoryPrice = Number(
              inventory.find((inv: any) => String(inv?.name || '').toLowerCase() === nameKey)?.unitPrice || 0
            );
            const currentInventoryPrice = inventoryPrice * (1 + (inflationScenarioPct / 100));
            const plannedQty = Number(material?.quantity || 0) * rowQty;
            if (expectedPrice <= 0 || currentInventoryPrice <= 0 || plannedQty <= 0) return;

            const delta = currentInventoryPrice - expectedPrice;
            if (delta > 0) {
              projectedOverrun += delta * plannedQty;
            }
          });
        });

        const projectBudget = Number(project?.budget || 0);
        const overrunPctBudget = projectBudget > 0 ? (projectedOverrun / projectBudget) * 100 : 0;

        return {
          projectId: project.id,
          projectName: project.name,
          projectedOverrun,
          overrunPctBudget: Number(overrunPctBudget.toFixed(2)),
          recommendation:
            overrunPctBudget >= 8
              ? 'Cerrar compras anticipadas y renegociar proveedores críticos de inmediato.'
              : overrunPctBudget >= 3
                ? 'Programar compras por lote y revisar alternativas de marca/proveedor.'
                : 'Mantener monitoreo quincenal de precios para proteger margen.',
        };
      })
      .filter((row) => row.projectedOverrun > 0)
      .sort((left, right) => right.projectedOverrun - left.projectedOverrun)
      .slice(0, 5);

    return rows;
  }, [inflationScenarioPct, inventory, portfolioBudgetItemsByProject, projects]);

  const providerVolatilityRanking = useMemo(() => {
    const normalized = purchaseOrders
      .filter((order: any) => Number(order?.quantity || 0) > 0 && Number(order?.estimatedCost || 0) > 0)
      .map((order: any) => ({
        supplierName: String(order?.supplier || 'Proveedor sin nombre').trim(),
        materialName: String(order?.materialName || 'Material').trim(),
        unitPrice: Number(order.estimatedCost || 0) / Math.max(1, Number(order.quantity || 1)),
        timestamp: Date.parse(String(order.datePaid || order.dateReceived || order.date || '')),
      }))
      .filter((item: any) => Number.isFinite(item.timestamp) && item.unitPrice > 0);

    const bySupplier = normalized.reduce((acc: Record<string, any[]>, row: any) => {
      const key = row.supplierName;
      if (!acc[key]) acc[key] = [];
      acc[key].push(row);
      return acc;
    }, {});

    return Object.entries(bySupplier)
      .map(([supplierName, rows]) => {
        const byMaterial = (rows as any[]).reduce((acc: Record<string, any[]>, row: any) => {
          const materialKey = row.materialName.toLowerCase();
          if (!acc[materialKey]) acc[materialKey] = [];
          acc[materialKey].push(row);
          return acc;
        }, {});

        let totalAbsChangePct = 0;
        let transitions = 0;

        Object.values(byMaterial).forEach((materialRows: any[]) => {
          const sorted = [...materialRows].sort((left, right) => left.timestamp - right.timestamp);
          for (let index = 1; index < sorted.length; index += 1) {
            const previous = Number(sorted[index - 1].unitPrice || 0);
            const current = Number(sorted[index].unitPrice || 0);
            if (previous <= 0 || current <= 0) continue;
            totalAbsChangePct += Math.abs(((current - previous) / previous) * 100);
            transitions += 1;
          }
        });

        const volatilityPct = transitions > 0 ? totalAbsChangePct / transitions : 0;
        return {
          supplierName,
          volatilityPct: Number(volatilityPct.toFixed(1)),
          records: (rows as any[]).length,
          risk: volatilityPct >= 18 ? 'alto' : volatilityPct >= 10 ? 'medio' : 'bajo',
        };
      })
      .filter((row) => row.records >= 2)
      .sort((left, right) => right.volatilityPct - left.volatilityPct)
      .slice(0, 5);
  }, [purchaseOrders]);

  const projectMarginRisk = useMemo(() => {
    return projects
      .map((project: any) => {
        const budget = Number(project?.budget || 0);
        const spent = Number(project?.spent || 0);
        const overrun = Number(
          projectedCostOverrunByProject.find((item) => item.projectId === project.id)?.projectedOverrun || 0
        );

        const remainingBudget = budget - spent - overrun;
        const remainingPct = budget > 0 ? (remainingBudget / budget) * 100 : 0;

        let risk: 'verde' | 'amarillo' | 'rojo' = 'verde';
        if (remainingPct < 5) risk = 'rojo';
        else if (remainingPct < 12) risk = 'amarillo';

        return {
          projectId: project.id,
          projectName: project.name,
          remainingBudget,
          remainingPct: Number(remainingPct.toFixed(2)),
          risk,
        };
      })
      .sort((left, right) => left.remainingPct - right.remainingPct)
      .slice(0, 6);
  }, [projects, projectedCostOverrunByProject]);

  const filteredProviderVolatilityRanking = useMemo(() => {
    if (selectedProviderVolatility === 'all') return providerVolatilityRanking;
    return providerVolatilityRanking.filter((item) => item.supplierName === selectedProviderVolatility);
  }, [providerVolatilityRanking, selectedProviderVolatility]);

  const filteredProjectMarginRisk = useMemo(() => {
    if (selectedMarginProjectId === 'all') return projectMarginRisk;
    return projectMarginRisk.filter((project) => project.projectId === selectedMarginProjectId);
  }, [projectMarginRisk, selectedMarginProjectId]);

  const cashflowForecastByHorizon = useMemo(() => {
    const horizons = [4, 8, 12];
    const weeksSample = 12;
    const now = Date.now();
    const windowStart = now - (weeksSample * 7 * 24 * 60 * 60 * 1000);

    const activeProjects = projects.filter((project: any) => {
      const status = String(project?.status || '').toLowerCase();
      return status === 'in progress' || status === 'active';
    });

    const scenario =
      cashflowScenario === 'inflation'
        ? { expenseMultiplier: 1.14, incomeMultiplier: 0.96 }
        : cashflowScenario === 'stress'
          ? { expenseMultiplier: 1.22, incomeMultiplier: 0.86 }
          : { expenseMultiplier: 1, incomeMultiplier: 1 };

    const projectForecast = activeProjects.map((project: any) => {
      const projectTransactions = transactions.filter((tx: any) => {
        const txDate = Date.parse(String(tx?.date || ''));
        return String(tx?.projectId || '') === String(project.id) && Number.isFinite(txDate) && txDate >= windowStart;
      });

      const sampleExpense = projectTransactions
        .filter((tx: any) => tx.type === 'Expense')
        .reduce((acc: number, tx: any) => acc + Number(tx.amount || 0), 0);

      const sampleIncome = projectTransactions
        .filter((tx: any) => tx.type === 'Income')
        .reduce((acc: number, tx: any) => acc + Number(tx.amount || 0), 0);

      const avgExpenseWeekly = (sampleExpense / weeksSample) * scenario.expenseMultiplier;
      const avgIncomeWeekly = (sampleIncome / weeksSample) * scenario.incomeMultiplier;

      const budget = Number(project?.budget || 0);
      const spent = Number(project?.spent || 0);
      const remainingBudget = budget - spent;

      return {
        projectId: project.id,
        projectName: project.name,
        remainingBudget,
        avgExpenseWeekly,
        avgIncomeWeekly,
      };
    });

    const summary = horizons.map((weeks) => {
      const rows = projectForecast.map((project) => {
        const projectedExpense = project.avgExpenseWeekly * weeks;
        const projectedIncome = project.avgIncomeWeekly * weeks;
        const projectedNet = projectedIncome - projectedExpense;
        const projectedRemaining = project.remainingBudget - projectedExpense;

        return {
          ...project,
          weeks,
          projectedExpense,
          projectedIncome,
          projectedNet,
          projectedRemaining,
          risk:
            projectedRemaining < 0
              ? 'alto'
              : projectedRemaining < project.remainingBudget * 0.2
                ? 'medio'
                : 'bajo',
        };
      });

      return {
        weeks,
        projectedExpense: rows.reduce((acc, row) => acc + row.projectedExpense, 0),
        projectedIncome: rows.reduce((acc, row) => acc + row.projectedIncome, 0),
        projectedNet: rows.reduce((acc, row) => acc + row.projectedNet, 0),
        projectedRemaining: rows.reduce((acc, row) => acc + row.projectedRemaining, 0),
        highRiskProjects: rows.filter((row) => row.risk === 'alto').length,
        rows,
      };
    });

    return summary;
  }, [cashflowScenario, projects, transactions]);

  const actionableRecommendations = useMemo(() => {
    const rows: Array<{
      id: string;
      title: string;
      detail: string;
      impact: 'alto' | 'medio';
      actionKind: 'workflow' | 'purchase_order' | 'notification';
      projectId?: string;
      materialName?: string;
      quantity?: number;
      estimatedCost?: number;
    }> = [];

    riskProjects.slice(0, 2).forEach((project: any) => {
      const deviation = (Number(project.spent || 0) / Math.max(1, Number(project.budget || 0))) * 100 - Number(project.physicalProgress || 0);
      rows.push({
        id: `risk_workflow_${project.id}`,
        title: `Plan correctivo para ${project.name}`,
        detail: `Desviación físico-financiera de ${deviation.toFixed(1)}%. Crear flujo de aprobación urgente.`,
        impact: 'alto',
        actionKind: 'workflow',
        projectId: project.id,
      });
    });

    lowStockItems.slice(0, 2).forEach((item: any) => {
      const quantityNeeded = Math.max(1, Number(item.minStock || 0) - Number(item.stock || 0));
      rows.push({
        id: `stock_po_${item.id}`,
        title: `Generar OC para ${item.name}`,
        detail: `Stock crítico (${item.stock}/${item.minStock}). Crear orden de compra sugerida.`,
        impact: 'alto',
        actionKind: 'purchase_order',
        materialName: item.name,
        quantity: quantityNeeded,
        estimatedCost: quantityNeeded * Number(item.unitPrice || 0),
      });
    });

    projectedCostOverrunByProject.slice(0, 2).forEach((project) => {
      rows.push({
        id: `overrun_notify_${project.projectId}`,
        title: `Escalar sobrecosto ${project.projectName}`,
        detail: `Sobre-costo proyectado ${formatCurrency(project.projectedOverrun)}. Notificar al comité ejecutivo.`,
        impact: 'medio',
        actionKind: 'notification',
        projectId: project.projectId,
      });
    });

    return rows.slice(0, 6);
  }, [lowStockItems, projectedCostOverrunByProject, riskProjects]);

  const handleExecuteRecommendation = async (recommendation: {
    id: string;
    title: string;
    detail: string;
    actionKind: 'workflow' | 'purchase_order' | 'notification';
    projectId?: string;
    materialName?: string;
    quantity?: number;
    estimatedCost?: number;
  }) => {
    try {
      setExecutingRecommendationId(recommendation.id);

      if (recommendation.actionKind === 'workflow') {
        await createWorkflow({
          title: recommendation.title,
          type: 'other',
          referenceId: recommendation.projectId || recommendation.id,
          priority: 'high',
          description: recommendation.detail,
          requestedBy: 'IA Copiloto',
          amount: recommendation.estimatedCost,
        });
      } else if (recommendation.actionKind === 'purchase_order') {
        await createPurchaseOrder({
          projectId: recommendation.projectId,
          materialName: recommendation.materialName || 'Material crítico',
          quantity: Math.max(1, Number(recommendation.quantity || 1)),
          unit: 'unidad',
          estimatedCost: Number(recommendation.estimatedCost || 0),
          supplier: 'Pendiente definir por IA',
          notes: `Generado automáticamente desde recomendación IA: ${recommendation.detail}`,
          status: 'Pending',
          budgetApplied: false,
          stockApplied: false,
        });
      } else {
        await sendNotification('Acción Ejecutiva IA', recommendation.detail, 'project');
      }

      await logAction(
        'Ejecución de recomendación IA',
        'Dashboard',
        `${recommendation.title} ejecutada desde Centro de Control`,
        'update',
        { recommendationId: recommendation.id, actionKind: recommendation.actionKind }
      );

      setExecutedRecommendationIds((prev) => [...prev, recommendation.id]);
      toast.success('Acción ejecutada correctamente');
    } catch (error) {
      handleApiError(error, OperationType.WRITE, 'dashboard/recommendations/execute');
    } finally {
      setExecutingRecommendationId(null);
    }
  };

  const handleOcrFileChange = async (file: File | null) => {
    if (!file) {
      setOcrFileName(null);
      setOcrImageDataUrl(null);
      return;
    }

    setOcrFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      if (result.startsWith('data:image/')) {
        setOcrImageDataUrl(result);
      } else {
        setOcrImageDataUrl(null);
      }
    };
    reader.readAsDataURL(file);
  };

  const buildOcrHistoryQuery = () => {
    const query: {
      limit: number;
      offset?: number;
      projectId?: string;
      supplier?: string;
      invoiceNumber?: string;
      from?: string;
      to?: string;
    } = { limit: 150 };

    if (ocrHistoryProjectFilter !== 'all') {
      query.projectId = ocrHistoryProjectFilter;
    }

    const supplierFilter = ocrHistorySupplierFilter.trim();
    if (supplierFilter) {
      query.supplier = supplierFilter;
    }

    const invoiceFilter = ocrHistoryInvoiceFilter.trim();
    if (invoiceFilter) {
      query.invoiceNumber = invoiceFilter;
    }

    if (ocrHistoryDateRange !== 'all') {
      const days = Number(ocrHistoryDateRange);
      const fromDate = new Date();
      fromDate.setHours(0, 0, 0, 0);
      fromDate.setDate(fromDate.getDate() - Math.max(0, days - 1));

      query.from = fromDate.toISOString();
      query.to = new Date().toISOString();
    }

    return query;
  };

  const refreshOcrValidationHistory = async (mode: 'reset' | 'append' = 'reset') => {
    const currentOffset = mode === 'append' ? ocrHistoryOffset : 0;
    const history = await listOcrValidations({
      ...buildOcrHistoryQuery(),
      offset: currentOffset,
    });
    const incomingItems = history.items || [];

    if (mode === 'append') {
      setOcrValidationHistory((prev) => {
        const existingIds = new Set(prev.map((item: any) => item.id));
        const merged = [...prev];
        for (const row of incomingItems) {
          if (!existingIds.has(row.id)) {
            merged.push(row);
          }
        }
        return merged;
      });
    } else {
      setOcrValidationHistory(incomingItems);
    }

    setOcrHistoryOffset(currentOffset + incomingItems.length);
    setOcrHistoryHasMore(Boolean(history.hasMore));
  };

  const loadMoreOcrHistory = async () => {
    if (!ocrHistoryHasMore || isLoadingMoreOcrHistory) return;

    try {
      setIsLoadingMoreOcrHistory(true);
      await refreshOcrValidationHistory('append');
    } catch (error) {
      handleApiError(error, OperationType.READ, 'documents/ocr-validations/load-more');
    } finally {
      setIsLoadingMoreOcrHistory(false);
    }
  };

  const exportVisibleOcrHistoryCsv = () => {
    if (sortedVisibleOcrValidationHistory.length === 0) {
      toast.info('No hay validaciones OCR para exportar con los filtros actuales.');
      return;
    }

    const selectedColumns = ocrHistorySelectedColumns;
    const headers = selectedColumns.map((column) => ocrHistoryColumnLabelMap[column]);

    const escapeCell = (value: unknown) => {
      const text = String(value ?? '');
      if (text.includes('"') || text.includes(',') || text.includes('\n')) {
        return `"${text.replace(/"/g, '""')}"`;
      }
      return text;
    };

    const lines = [
      headers.join(','),
      ...sortedVisibleOcrValidationHistory.map((row: any) =>
        selectedColumns
          .map((columnKey) => getOcrColumnRawValue(row, columnKey))
          .map(escapeCell)
          .join(',')
      ),
    ];

    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    link.href = url;
    link.download = `ocr-validaciones-${stamp}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const exportVisibleOcrHistoryXlsx = () => {
    if (sortedVisibleOcrValidationHistory.length === 0) {
      toast.info('No hay validaciones OCR para exportar con los filtros actuales.');
      return;
    }

    const selectedColumns = ocrHistorySelectedColumns;
    const rows = sortedVisibleOcrValidationHistory.map((row: any) => {
      const entry: Record<string, string | number> = {};
      for (const columnKey of selectedColumns) {
        entry[ocrHistoryColumnLabelMap[columnKey]] = getOcrColumnRawValue(row, columnKey);
      }
      return entry;
    });

    const workbook = XLSX.utils.book_new();
    const sheet = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(workbook, sheet, 'OCR');
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    XLSX.writeFile(workbook, `ocr-validaciones-${stamp}.xlsx`);
  };

  const handleValidateDocumentOcr = async () => {
    if (!ocrRawText.trim() && !ocrImageDataUrl) {
      toast.error('Proporciona texto OCR o una imagen del documento.');
      return;
    }

    try {
      setIsValidatingDocument(true);
      const result = await validateDocumentOCR({
        rawText: ocrRawText,
        imageDataUrl: ocrImageDataUrl || undefined,
        purchaseOrderId: ocrSelectedPurchaseOrderId || undefined,
        projectId: ocrSelectedProjectId || undefined,
        autoApply: ocrAutoApply,
        requestedBy: auth.currentUser?.email || auth.currentUser?.displayName || 'IA Copiloto',
      });
      setOcrValidationResult(result);
      try {
        await refreshOcrValidationHistory('reset');
      } catch {
        // Ignore history refresh failures.
      }
      toast.success('Validación documental completada');
    } catch (error) {
      setOcrValidationResult(null);
      handleApiError(error, OperationType.WRITE, 'documents/ocr-validate');
    } finally {
      setIsValidatingDocument(false);
    }
  };

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const history = await listOcrValidations({
          ...buildOcrHistoryQuery(),
          offset: 0,
        });
        if (!cancelled) {
          const items = history.items || [];
          setOcrValidationHistory(items);
          setOcrHistoryOffset(items.length);
          setOcrHistoryHasMore(Boolean(history.hasMore));
        }
      } catch {
        if (!cancelled) {
          setOcrValidationHistory([]);
          setOcrHistoryOffset(0);
          setOcrHistoryHasMore(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [ocrHistoryProjectFilter, ocrHistoryDateRange, ocrHistorySupplierFilter, ocrHistoryInvoiceFilter]);

  useEffect(() => {
    if (loading || !recentMaterialPriceHistory.materialName || recentMaterialPriceHistory.points.length < 2) return;

    const notifiedKey = `material_price_spike_${new Date().toISOString().slice(0, 10)}`;
    const notifiedItems = JSON.parse(localStorage.getItem(notifiedKey) || '{}');
    const materialKey = recentMaterialPriceHistory.materialName.toLowerCase();

    if (
      recentMaterialPriceHistory.weeklyChangePct >= materialWeeklySpikeThreshold &&
      !notifiedItems[materialKey]
    ) {
      void sendNotification(
        'Alerta de Precio de Material',
        `${recentMaterialPriceHistory.materialName} subió ${recentMaterialPriceHistory.weeklyChangePct}% en la última semana (umbral ${materialWeeklySpikeThreshold}%). Recomendado: anticipar compra o renegociar proveedor.`,
        'inventory'
      );

      notifiedItems[materialKey] = true;
      localStorage.setItem(notifiedKey, JSON.stringify(notifiedItems));
    }
  }, [loading, materialWeeklySpikeThreshold, recentMaterialPriceHistory]);

  useEffect(() => {
    if (loading) return;

    const runScheduledAlerts = () => {
      const now = new Date();
      const hour = now.getHours();
      const slot = hour === 8 ? '08' : hour === 16 ? '16' : null;
      if (!slot) return;

      const dateKey = now.toISOString().slice(0, 10);
      const sentKey = `scheduled_cost_intel_alert_${dateKey}_${slot}`;
      if (localStorage.getItem(sentKey) === '1') return;

      const topOverrun = projectedCostOverrunByProject[0];
      const redProjects = projectMarginRisk.filter((item) => item.risk === 'rojo').length;
      const volatileSupplier = providerVolatilityRanking[0];

      const bodyParts: string[] = [];
      if (topOverrun) {
        bodyParts.push(`Proyecto crítico: ${topOverrun.projectName} (${formatCurrency(topOverrun.projectedOverrun)}).`);
      }
      if (redProjects > 0) {
        bodyParts.push(`Proyectos en rojo: ${redProjects}.`);
      }
      if (volatileSupplier) {
        bodyParts.push(`Proveedor más volátil: ${volatileSupplier.supplierName} (${volatileSupplier.volatilityPct}%).`);
      }

      if (bodyParts.length > 0) {
        void sendNotification(
          `Resumen programado de costos (${slot}:00)`,
          bodyParts.join(' '),
          'project'
        );
      }

      localStorage.setItem(sentKey, '1');
    };

    runScheduledAlerts();
    const intervalId = window.setInterval(runScheduledAlerts, 60 * 1000);
    return () => window.clearInterval(intervalId);
  }, [loading, projectMarginRisk, projectedCostOverrunByProject, providerVolatilityRanking]);

  const handleExportMaterialIntelligenceReport = () => {
    const doc = new jsPDF() as any;
    const startY = drawReportHeader(doc, 'INTELIGENCIA DE COSTOS DE MATERIALES', {
      subtitle: `Escenario de inflación aplicado: ${inflationScenarioPct}%`,
      dateText: `Fecha: ${new Date().toLocaleDateString('es-GT')}`,
    });

    const trendRows = recentMaterialPriceHistory.points.length
      ? recentMaterialPriceHistory.points.map((point) => [
          point.dateLabel,
          formatCurrency(point.unitPrice),
        ])
      : [['Sin datos', '-', '-']];

    doc.setFont('helvetica', 'bold');
    doc.setTextColor(30, 41, 59);
    doc.setFontSize(11);
    doc.text('1. Tendencia de precio unitario', 14, startY + 6);

    autoTable(doc, {
      startY: startY + 10,
      head: [['Fecha', 'Precio unitario']],
      body: trendRows,
      theme: 'striped',
      headStyles: { fillColor: [15, 118, 110] },
      styles: { fontSize: 9 },
    });

    const deviationRows = materialDeviationAlerts.length
      ? materialDeviationAlerts.map((alert) => [
          alert.name,
          formatCurrency(alert.expected),
          formatCurrency(alert.current),
          `${alert.deviationPct > 0 ? '+' : ''}${alert.deviationPct}%`,
        ])
      : [['Sin alertas relevantes', '-', '-', '-']];

    const afterTrendY = (doc as any).lastAutoTable.finalY + 8;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('2. Desvíos vs presupuesto', 14, afterTrendY);

    autoTable(doc, {
      startY: afterTrendY + 4,
      head: [['Material', 'Presupuesto', 'Actual', 'Desvío']],
      body: deviationRows,
      theme: 'striped',
      headStyles: { fillColor: [220, 38, 38] },
      styles: { fontSize: 9 },
    });

    const overrunRows = projectedCostOverrunByProject.length
      ? projectedCostOverrunByProject.map((item) => [
          item.projectName,
          formatCurrency(item.projectedOverrun),
          `${item.overrunPctBudget.toFixed(2)}%`,
          item.recommendation,
        ])
      : [['Sin sobrecosto proyectado', '-', '-', '-']];

    const afterDeviationY = (doc as any).lastAutoTable.finalY + 8;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('3. Proyección de sobrecosto por proyecto', 14, afterDeviationY);

    autoTable(doc, {
      startY: afterDeviationY + 4,
      head: [['Proyecto', 'Sobre-costo', '% Presupuesto', 'Recomendación']],
      body: overrunRows,
      theme: 'striped',
      headStyles: { fillColor: [217, 119, 6] },
      styles: { fontSize: 8.5, cellPadding: 2.2 },
      columnStyles: {
        0: { cellWidth: 42 },
        1: { cellWidth: 32 },
        2: { cellWidth: 26 },
        3: { cellWidth: 86 },
      },
    });

    const fileName = `Inteligencia_Materiales_${new Date().toISOString().slice(0, 10)}.pdf`;
    doc.save(fileName);
    toast.success('Reporte gerencial exportado');
  };

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

      <div id="executive-control-center" ref={executiveControlRef} className="bg-white dark:bg-slate-900 p-5 sm:p-6 rounded-3xl border border-slate-100 dark:border-slate-800 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
          <div>
            <h3 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-widest">Semáforo Ejecutivo IA</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">Control integral de costos, cronograma e inventario</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                window.dispatchEvent(new CustomEvent('OPEN_AI_CHAT'));
                window.dispatchEvent(new CustomEvent('AI_COMMAND', {
                  detail: {
                    command: 'CONTROL_TOTAL_PORTFOLIO',
                    params: {},
                  },
                }));
              }}
              className="px-3 py-1.5 rounded-full bg-primary text-white text-[10px] font-black uppercase tracking-widest hover:bg-primary-hover transition-all"
            >
              Abrir Copiloto
            </button>
            <span className={cn(
              "px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border",
              portfolioSemaforo.status === 'verde' && "bg-emerald-50 text-emerald-700 border-emerald-200",
              portfolioSemaforo.status === 'amarillo' && "bg-amber-50 text-amber-700 border-amber-200",
              portfolioSemaforo.status === 'rojo' && "bg-rose-50 text-rose-700 border-rose-200"
            )}>
              {portfolioSemaforo.status}
            </span>
            <span className="text-sm font-black text-slate-900 dark:text-white">{portfolioSemaforo.score}%</span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
          <div className="p-3 rounded-2xl bg-rose-50 border border-rose-100">
            <p className="text-[10px] font-black uppercase tracking-widest text-rose-700">Alertas críticas</p>
            <p className="text-2xl font-black text-rose-700">{portfolioSemaforo.high}</p>
          </div>
          <div className="p-3 rounded-2xl bg-amber-50 border border-amber-100">
            <p className="text-[10px] font-black uppercase tracking-widest text-amber-700">Alertas moderadas</p>
            <p className="text-2xl font-black text-amber-700">{portfolioSemaforo.medium}</p>
          </div>
          <div className="p-3 rounded-2xl bg-emerald-50 border border-emerald-100">
            <p className="text-[10px] font-black uppercase tracking-widest text-emerald-700">Fortalezas detectadas</p>
            <p className="text-2xl font-black text-emerald-700">{portfolioSemaforo.strengths.length}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="p-3 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/40">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">Riesgos principales</p>
            {portfolioSemaforo.risks.length === 0 ? (
              <p className="text-xs font-semibold text-slate-500">Sin riesgos relevantes en este corte.</p>
            ) : (
              <ul className="space-y-1.5">
                {portfolioSemaforo.risks.map((risk, idx) => (
                  <li key={idx} className="text-xs text-slate-700 dark:text-slate-200">• {risk}</li>
                ))}
              </ul>
            )}
          </div>
          <div className="p-3 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/40">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">Pros detectados</p>
            {portfolioSemaforo.strengths.length === 0 ? (
              <p className="text-xs font-semibold text-slate-500">Sin fortalezas destacadas todavía.</p>
            ) : (
              <ul className="space-y-1.5">
                {portfolioSemaforo.strengths.map((strength, idx) => (
                  <li key={idx} className="text-xs text-slate-700 dark:text-slate-200">• {strength}</li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="mt-4 p-3 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/40">
          <div className="flex items-center justify-between gap-2 mb-2">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Brecha físico-financiera crítica</p>
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-600">Umbral {physicalFinancialDeviationThreshold}%</span>
          </div>
          {physicalFinancialGapRanking.length === 0 ? (
            <p className="text-xs font-semibold text-slate-500">Sin brechas positivas relevantes en obras activas.</p>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              <div className="h-44">
                <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={120}>
                  <BarChart data={physicalFinancialGapRanking} layout="vertical" margin={{ top: 4, right: 8, left: 8, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
                    <XAxis type="number" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 10, fontWeight: 700 }} unit="%" />
                    <YAxis type="category" dataKey="shortName" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 10, fontWeight: 700 }} width={92} />
                    <Tooltip formatter={(value: number) => [`+${value.toFixed(1)}%`, 'Brecha']} />
                    <Bar dataKey="gap" fill="#f97316" radius={[0, 8, 8, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="space-y-2">
                {physicalFinancialGapRanking.slice(0, 3).map((row) => (
                  <div key={row.projectId} className="rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2 bg-white/80 dark:bg-slate-900/30">
                    <p className="text-xs font-black text-slate-900 dark:text-white">{row.projectName}</p>
                    <p className="text-[11px] text-slate-600 dark:text-slate-300">
                      Físico {row.physicalProgress.toFixed(1)}% • Financiero {row.financialProgress.toFixed(1)}% • <span className="font-black text-rose-600">Brecha +{row.gap.toFixed(1)}%</span>
                    </p>
                    <p className="text-[10px] text-slate-500 mt-1">{row.recommendation}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 p-5 sm:p-6 rounded-3xl border border-slate-100 dark:border-slate-800 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
          <div>
            <h3 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-widest">Vigilancia de Precios de Materiales</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">Materiales de mayor impacto en costo unitario para presupuestar y controlar compras</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => navigate('/inventory')}
              className="px-3 py-1.5 rounded-full bg-slate-900 text-white text-[10px] font-black uppercase tracking-widest hover:bg-slate-700 transition-all"
            >
              Abrir Inventario
            </button>
            <button
              type="button"
              onClick={handleExportMaterialIntelligenceReport}
              className="px-3 py-1.5 rounded-full bg-primary text-white text-[10px] font-black uppercase tracking-widest hover:bg-primary-hover transition-all"
            >
              Exportar PDF
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2 mb-4 flex-wrap">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Escenario What-if inflación</p>
          {[0, 5, 10, 15].map((pct) => (
            <button
              key={pct}
              type="button"
              onClick={() => setInflationScenarioPct(pct)}
              className={cn(
                'px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border transition-all',
                inflationScenarioPct === pct
                  ? 'bg-slate-900 text-white border-slate-900'
                  : 'bg-white text-slate-600 border-slate-300 hover:border-slate-500'
              )}
            >
              {pct}%
            </button>
          ))}
          <span className="text-[10px] text-slate-500">Aplicado sobre precio actual de inventario para proyección.</span>
          <span className="text-[10px] text-slate-500">Umbral alerta semanal actual: {materialWeeklySpikeThreshold}%</span>
        </div>

        {materialPriceSignals.length === 0 ? (
          <p className="text-xs font-semibold text-slate-500">Aún no hay materiales con precio unitario registrado.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3 mb-4">
            {materialPriceSignals.map((item) => (
              <div
                key={item.id}
                className={cn(
                  'rounded-2xl border p-3',
                  item.critical
                    ? 'border-rose-200 bg-rose-50/70 dark:border-rose-500/40 dark:bg-rose-500/10'
                    : 'border-slate-200 bg-slate-50/70 dark:border-slate-700 dark:bg-slate-800/40'
                )}
              >
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 line-clamp-2">{item.name}</p>
                <p className="text-lg font-black text-slate-900 dark:text-white mt-1">{formatCurrency(item.unitPrice)}</p>
                <p className="text-[11px] text-slate-600 dark:text-slate-300 mt-1">
                  Stock: <span className="font-black">{item.stock}</span>
                </p>
                <p className="text-[11px] text-slate-600 dark:text-slate-300">
                  Mínimo: <span className="font-black">{item.minStock}</span>
                </p>
                <p className={cn(
                  'text-[10px] font-black uppercase tracking-wider mt-2',
                  item.critical ? 'text-rose-600' : 'text-emerald-600'
                )}>
                  {item.critical ? 'Priorizar compra' : 'Stock aceptable'}
                </p>
              </div>
            ))}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-2">
          <div className="p-3 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/40">
            <div className="flex items-center justify-between gap-2 mb-2">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Historial de precio (compras)</p>
              {recentMaterialPriceHistory.materialName && (
                <span className="text-[10px] font-bold text-slate-600 dark:text-slate-300">{recentMaterialPriceHistory.materialName}</span>
              )}
            </div>

            {recentMaterialPriceHistory.points.length >= 2 ? (
              <>
                <div className="h-44">
                  <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={120}>
                    <LineChart data={recentMaterialPriceHistory.points} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                      <XAxis dataKey="dateLabel" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 10, fontWeight: 700 }} />
                      <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 10, fontWeight: 700 }} tickFormatter={(value) => `Q${value}`} />
                      <Tooltip formatter={(value: number) => [formatCurrency(value), 'Precio unitario']} />
                      <Line type="monotone" dataKey="unitPrice" stroke="#0f766e" strokeWidth={3} dot={{ r: 2 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                <div className="grid grid-cols-2 gap-2 mt-2">
                  <div className="rounded-xl border border-slate-200 dark:border-slate-700 px-2 py-1.5">
                    <p className="text-[9px] uppercase font-black tracking-wider text-slate-500">Variación semanal</p>
                    <p className={cn('text-xs font-black', recentMaterialPriceHistory.weeklyChangePct > 0 ? 'text-rose-600' : 'text-emerald-600')}>
                      {recentMaterialPriceHistory.weeklyChangePct > 0 ? '+' : ''}{recentMaterialPriceHistory.weeklyChangePct}%
                    </p>
                  </div>
                  <div className="rounded-xl border border-slate-200 dark:border-slate-700 px-2 py-1.5">
                    <p className="text-[9px] uppercase font-black tracking-wider text-slate-500">Variación mensual</p>
                    <p className={cn('text-xs font-black', recentMaterialPriceHistory.monthlyChangePct > 0 ? 'text-rose-600' : 'text-emerald-600')}>
                      {recentMaterialPriceHistory.monthlyChangePct > 0 ? '+' : ''}{recentMaterialPriceHistory.monthlyChangePct}%
                    </p>
                  </div>
                </div>
              </>
            ) : (
              <p className="text-xs text-slate-500">No hay suficiente historial de órdenes de compra para generar tendencia.</p>
            )}
          </div>

          <div className="p-3 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/40">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">Desvío automático vs presupuesto</p>
            {materialDeviationAlerts.length === 0 ? (
              <p className="text-xs text-slate-500">Sin desvíos relevantes por ahora (umbral ±12%).</p>
            ) : (
              <ul className="space-y-1.5">
                {materialDeviationAlerts.slice(0, 4).map((alert) => (
                  <li key={alert.id} className="text-xs text-slate-700 dark:text-slate-200">
                    <span className={cn('font-black', alert.deviationPct > 0 ? 'text-rose-600' : 'text-emerald-600')}>
                      {alert.name}: {alert.deviationPct > 0 ? '+' : ''}{alert.deviationPct}%
                    </span>{' '}
                    (Presupuesto {formatCurrency(alert.expected)} vs actual {formatCurrency(alert.current)})
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="mt-4 p-3 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/40">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">Proyección de sobrecosto por proyecto</p>
          {projectedCostOverrunByProject.length === 0 ? (
            <p className="text-xs text-slate-500">No se detecta sobrecosto proyectado con los precios actuales.</p>
          ) : (
            <div className="space-y-2">
              {projectedCostOverrunByProject.slice(0, 3).map((project) => (
                <div key={project.projectId} className="rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2 bg-white/80 dark:bg-slate-900/30">
                  <p className="text-xs font-black text-slate-900 dark:text-white">{project.projectName}</p>
                  <p className="text-xs text-rose-600 font-black">Sobre-costo proyectado: {formatCurrency(project.projectedOverrun)} ({project.overrunPctBudget.toFixed(2)}% del presupuesto)</p>
                  <p className="text-[11px] text-slate-600 dark:text-slate-300 mt-0.5">{project.recommendation}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
          <div className="p-3 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/40">
            <div className="flex items-center justify-between gap-2 mb-2">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Volatilidad de precios por proveedor</p>
              <select
                value={selectedProviderVolatility}
                onChange={(e) => setSelectedProviderVolatility(e.target.value)}
                className="px-2 py-1 rounded-lg border border-slate-300 bg-white text-[10px] font-bold text-slate-700"
              >
                <option value="all">Todos</option>
                {providerVolatilityRanking.map((item) => (
                  <option key={item.supplierName} value={item.supplierName}>{item.supplierName}</option>
                ))}
              </select>
            </div>
            {filteredProviderVolatilityRanking.length === 0 ? (
              <p className="text-xs text-slate-500">Sin suficientes órdenes para calcular volatilidad por proveedor.</p>
            ) : (
              <div className="space-y-2">
                {filteredProviderVolatilityRanking.map((item) => (
                  <div key={item.supplierName} className="rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2 bg-white/80 dark:bg-slate-900/30">
                    <p className="text-xs font-black text-slate-900 dark:text-white">{item.supplierName}</p>
                    <p className="text-[11px] text-slate-600 dark:text-slate-300">
                      Volatilidad promedio: <span className="font-black">{item.volatilityPct}%</span> • registros: {item.records}
                    </p>
                    <p className={cn(
                      'text-[10px] font-black uppercase tracking-wider mt-1',
                      item.risk === 'alto' && 'text-rose-600',
                      item.risk === 'medio' && 'text-amber-600',
                      item.risk === 'bajo' && 'text-emerald-600'
                    )}>
                      Riesgo {item.risk}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="p-3 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/40">
            <div className="flex items-center justify-between gap-2 mb-2">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Semáforo de margen por proyecto</p>
              <select
                value={selectedMarginProjectId}
                onChange={(e) => setSelectedMarginProjectId(e.target.value)}
                className="px-2 py-1 rounded-lg border border-slate-300 bg-white text-[10px] font-bold text-slate-700"
              >
                <option value="all">Todos</option>
                {projectMarginRisk.map((project) => (
                  <option key={project.projectId} value={project.projectId}>{project.projectName}</option>
                ))}
              </select>
            </div>
            {filteredProjectMarginRisk.length === 0 ? (
              <p className="text-xs text-slate-500">Sin proyectos para evaluar margen.</p>
            ) : (
              <div className="space-y-2">
                {filteredProjectMarginRisk.map((project) => (
                  <div key={project.projectId} className="rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2 bg-white/80 dark:bg-slate-900/30">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-black text-slate-900 dark:text-white">{project.projectName}</p>
                      <span className={cn(
                        'px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider border',
                        project.risk === 'verde' && 'bg-emerald-50 text-emerald-700 border-emerald-200',
                        project.risk === 'amarillo' && 'bg-amber-50 text-amber-700 border-amber-200',
                        project.risk === 'rojo' && 'bg-rose-50 text-rose-700 border-rose-200'
                      )}>
                        {project.risk}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-600 dark:text-slate-300 mt-1">
                      Margen disponible: <span className="font-black">{formatCurrency(project.remainingBudget)}</span> ({project.remainingPct.toFixed(2)}% del presupuesto)
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 p-5 sm:p-6 rounded-3xl border border-slate-100 dark:border-slate-800 shadow-sm">
        <div className="flex items-center justify-between gap-3 mb-4">
          <div>
            <h3 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-widest">Recomendaciones IA Ejecutables</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">Acciones inmediatas que el sistema puede ejecutar desde este panel</p>
          </div>
        </div>
        {actionableRecommendations.length === 0 ? (
          <p className="text-xs text-slate-500">Sin acciones urgentes detectadas por ahora.</p>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {actionableRecommendations.map((recommendation) => {
              const isExecuted = executedRecommendationIds.includes(recommendation.id);
              const isRunning = executingRecommendationId === recommendation.id;

              return (
                <div key={recommendation.id} className="rounded-2xl border border-slate-200 dark:border-slate-700 px-3 py-3 bg-slate-50/70 dark:bg-slate-800/40">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-black text-slate-900 dark:text-white">{recommendation.title}</p>
                    <span className={cn(
                      'px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider border',
                      recommendation.impact === 'alto' ? 'bg-rose-50 text-rose-700 border-rose-200' : 'bg-amber-50 text-amber-700 border-amber-200'
                    )}>
                      {recommendation.impact}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-600 dark:text-slate-300 mt-1">{recommendation.detail}</p>
                  <div className="mt-2 flex justify-end">
                    <button
                      type="button"
                      disabled={isExecuted || isRunning}
                      onClick={() => void handleExecuteRecommendation(recommendation)}
                      className="px-3 py-1.5 rounded-full bg-slate-900 text-white text-[10px] font-black uppercase tracking-widest disabled:opacity-50"
                    >
                      {isExecuted ? 'Aplicada' : isRunning ? 'Ejecutando...' : 'Aplicar ahora'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="bg-white dark:bg-slate-900 p-5 sm:p-6 rounded-3xl border border-slate-100 dark:border-slate-800 shadow-sm">
        <div className="flex items-center justify-between gap-3 mb-4">
          <div>
            <h3 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-widest">Forecast de Flujo de Caja (4/8/12 semanas)</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">Proyección de caja con tendencia histórica por obra activa</p>
          </div>
          <div className="flex items-center gap-2">
            {[
              { key: 'base', label: 'Base' },
              { key: 'inflation', label: 'Inflación alta' },
              { key: 'stress', label: 'Estrés' },
            ].map((option) => (
              <button
                key={option.key}
                type="button"
                onClick={() => setCashflowScenario(option.key as 'base' | 'inflation' | 'stress')}
                className={cn(
                  'px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border transition-all',
                  cashflowScenario === option.key
                    ? 'bg-slate-900 text-white border-slate-900'
                    : 'bg-white text-slate-600 border-slate-300 hover:border-slate-500'
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
          {cashflowForecastByHorizon.map((forecast) => (
            <div key={forecast.weeks} className="rounded-2xl border border-slate-200 dark:border-slate-700 p-3 bg-slate-50/70 dark:bg-slate-800/40">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">{forecast.weeks} semanas</p>
              <p className={cn('text-lg font-black mt-1', forecast.projectedNet >= 0 ? 'text-emerald-600' : 'text-rose-600')}>
                {formatCurrency(forecast.projectedNet)}
              </p>
              <p className="text-[11px] text-slate-600 dark:text-slate-300">Ingreso: {formatCurrency(forecast.projectedIncome)}</p>
              <p className="text-[11px] text-slate-600 dark:text-slate-300">Egreso: {formatCurrency(forecast.projectedExpense)}</p>
              <p className="text-[11px] text-slate-600 dark:text-slate-300">Riesgo alto: {forecast.highRiskProjects} obras</p>
            </div>
          ))}
        </div>
        <div className="h-52">
          <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={120}>
            <LineChart data={cashflowForecastByHorizon} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
              <XAxis dataKey="weeks" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 10, fontWeight: 700 }} tickFormatter={(value) => `${value}w`} />
              <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 10, fontWeight: 700 }} tickFormatter={(value) => `Q${Math.round(value / 1000)}k`} />
              <Tooltip formatter={(value: number, name: string) => [formatCurrency(value), name === 'projectedNet' ? 'Neto proyectado' : 'Saldo proyectado']} />
              <Line type="monotone" dataKey="projectedNet" stroke="#0f766e" strokeWidth={3} dot={{ r: 2 }} />
              <Line type="monotone" dataKey="projectedRemaining" stroke="#1d4ed8" strokeWidth={2} dot={{ r: 2 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 p-5 sm:p-6 rounded-3xl border border-slate-100 dark:border-slate-800 shadow-sm">
        <div className="flex items-center justify-between gap-3 mb-4">
          <div>
            <h3 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-widest">Validación Documental OCR</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">Extrae datos de factura/orden y valida contra OC y presupuesto del proyecto</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-3">
          <select
            value={ocrSelectedProjectId}
            onChange={(e) => setOcrSelectedProjectId(e.target.value)}
            className="px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs font-bold text-slate-700"
          >
            <option value="">Proyecto (opcional)</option>
            {projects.map((project: any) => (
              <option key={project.id} value={project.id}>{project.name}</option>
            ))}
          </select>

          <select
            value={ocrSelectedPurchaseOrderId}
            onChange={(e) => setOcrSelectedPurchaseOrderId(e.target.value)}
            className="px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs font-bold text-slate-700"
          >
            <option value="">Orden de compra (opcional)</option>
            {purchaseOrders.slice(0, 100).map((order: any) => (
              <option key={order.id} value={order.id}>{order.materialName} • {order.supplier || 'N/A'} • {formatCurrency(Number(order.estimatedCost || 0))}</option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-3">
          <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-3 bg-slate-50/70 dark:bg-slate-800/40">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">Imagen para OCR (opcional)</p>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => void handleOcrFileChange(e.target.files?.[0] || null)}
              className="text-xs"
            />
            <p className="text-[10px] text-slate-500 mt-2">{ocrFileName || 'Sin archivo seleccionado'}</p>
          </div>
          <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-3 bg-slate-50/70 dark:bg-slate-800/40">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">Texto OCR / factura</p>
            <textarea
              value={ocrRawText}
              onChange={(e) => setOcrRawText(e.target.value)}
              rows={5}
              placeholder="Pega aquí el texto del documento (si ya tienes OCR)..."
              className="w-full px-2 py-2 rounded-lg border border-slate-300 bg-white text-xs text-slate-700"
            />
          </div>
        </div>

        <div className="mb-3 rounded-xl border border-slate-200 dark:border-slate-700 p-3 bg-slate-50/70 dark:bg-slate-800/40">
          <label className="inline-flex items-center gap-2 text-xs font-bold text-slate-700 dark:text-slate-200">
            <input
              type="checkbox"
              checked={ocrAutoApply}
              onChange={(e) => setOcrAutoApply(e.target.checked)}
              className="accent-primary"
            />
            Auto-aplicar decisión del motor de reglas OCR
          </label>
          <p className="text-[10px] text-slate-500 mt-1">
            Reglas: aprobar si score alto y consistencia OC; revisar en zona media; rechazar alto riesgo.
          </p>
        </div>

        <div className="flex justify-end mb-3">
          <button
            type="button"
            onClick={() => void handleValidateDocumentOcr()}
            disabled={isValidatingDocument}
            className="px-3 py-1.5 rounded-full bg-primary text-white text-[10px] font-black uppercase tracking-widest disabled:opacity-50"
          >
            {isValidatingDocument ? 'Validando...' : 'Validar documento'}
          </button>
        </div>

        {ocrValidationResult && (
          <div className="rounded-2xl border border-slate-200 dark:border-slate-700 p-3 bg-slate-50/70 dark:bg-slate-800/40">
            <div className="flex items-center justify-between gap-2 mb-2">
              <p className="text-xs font-black text-slate-900 dark:text-white">Resultado: {ocrValidationResult.status}</p>
              <span className={cn(
                'px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider border',
                ocrValidationResult.score >= 80 ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : ocrValidationResult.score >= 60 ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-rose-50 text-rose-700 border-rose-200'
              )}>
                score {ocrValidationResult.score}
              </span>
            </div>
            <div className="mb-2 flex items-center gap-2 flex-wrap">
              <span className={cn(
                'px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider border',
                ocrValidationResult.decision === 'approved' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : ocrValidationResult.decision === 'review' ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-rose-50 text-rose-700 border-rose-200'
              )}>
                decisión {ocrValidationResult.decision || 'N/A'}
              </span>
              {ocrValidationResult.autoAction && (
                <span className="text-[10px] text-slate-600 dark:text-slate-300">
                  {ocrValidationResult.autoAction.applied ? 'Auto-acción aplicada' : 'Auto-acción no aplicada'}: {ocrValidationResult.autoAction.summary}
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-600 dark:text-slate-300 mb-2">
              Extraído: proveedor {ocrValidationResult.extracted?.supplier || 'N/A'} • total {formatCurrency(Number(ocrValidationResult.extracted?.total || 0))} • factura {ocrValidationResult.extracted?.invoiceNumber || 'N/A'}
            </p>
            <ul className="space-y-1.5">
              {(ocrValidationResult.checks || []).map((check: any, index: number) => (
                <li key={`${check.name}_${index}`} className="text-[11px] text-slate-700 dark:text-slate-200">
                  <span className={cn('font-black uppercase', check.status === 'pass' ? 'text-emerald-600' : check.status === 'warn' ? 'text-amber-600' : 'text-rose-600')}>
                    {check.status}
                  </span>{' '}
                  {check.name}: {check.detail}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-4 rounded-2xl border border-slate-200 dark:border-slate-700 p-3 bg-slate-50/70 dark:bg-slate-800/40">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">Efectividad OCR (últimas validaciones)</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2 mb-3">
            <div className="rounded-xl border border-slate-200 dark:border-slate-700 px-2.5 py-2 bg-white/80 dark:bg-slate-900/30">
              <p className="text-[9px] uppercase tracking-wider font-black text-slate-500">Total</p>
              <p className="text-sm font-black text-slate-900 dark:text-white">{ocrEffectiveness.total}</p>
            </div>
            <div className="rounded-xl border border-emerald-200 px-2.5 py-2 bg-emerald-50/60">
              <p className="text-[9px] uppercase tracking-wider font-black text-emerald-700">Aprobadas</p>
              <p className="text-sm font-black text-emerald-700">{ocrEffectiveness.approved}</p>
            </div>
            <div className="rounded-xl border border-amber-200 px-2.5 py-2 bg-amber-50/60">
              <p className="text-[9px] uppercase tracking-wider font-black text-amber-700">En revisión</p>
              <p className="text-sm font-black text-amber-700">{ocrEffectiveness.review}</p>
            </div>
            <div className="rounded-xl border border-rose-200 px-2.5 py-2 bg-rose-50/60">
              <p className="text-[9px] uppercase tracking-wider font-black text-rose-700">Rechazadas</p>
              <p className="text-sm font-black text-rose-700">{ocrEffectiveness.rejected}</p>
            </div>
            <div className="rounded-xl border border-indigo-200 px-2.5 py-2 bg-indigo-50/60">
              <p className="text-[9px] uppercase tracking-wider font-black text-indigo-700">Auto / Score</p>
              <p className="text-sm font-black text-indigo-700">{ocrEffectiveness.autoApplied} / {ocrEffectiveness.avgScore}</p>
            </div>
          </div>

          <div className="mb-3 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-9 gap-2">
            <div className="lg:col-span-2 flex items-center gap-1 rounded-xl border border-slate-200 dark:border-slate-700 p-1 bg-white dark:bg-slate-900">
              <button
                type="button"
                onClick={() => setOcrHistoryViewMode('cards')}
                className={cn(
                  'flex-1 px-2 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-colors',
                  ocrHistoryViewMode === 'cards'
                    ? 'bg-primary text-white'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                )}
              >
                Tarjetas
              </button>
              <button
                type="button"
                onClick={() => setOcrHistoryViewMode('table')}
                className={cn(
                  'flex-1 px-2 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-colors',
                  ocrHistoryViewMode === 'table'
                    ? 'bg-primary text-white'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                )}
              >
                Tabla
              </button>
            </div>

            <select
              value={ocrHistoryProjectFilter}
              onChange={(e) => setOcrHistoryProjectFilter(e.target.value)}
              className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-bold text-slate-700 dark:text-slate-200"
            >
              <option value="all">Todos los proyectos</option>
              {ocrHistoryProjectOptions.map((project) => (
                <option key={project.id} value={project.id}>{project.name}</option>
              ))}
            </select>

            <select
              value={ocrHistoryDecisionFilter}
              onChange={(e) => setOcrHistoryDecisionFilter(e.target.value as 'all' | 'approved' | 'review' | 'rejected')}
              className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-bold text-slate-700 dark:text-slate-200"
            >
              <option value="all">Todas las decisiones</option>
              <option value="approved">Aprobadas</option>
              <option value="review">En revisión</option>
              <option value="rejected">Rechazadas</option>
            </select>

            <select
              value={ocrHistoryDateRange}
              onChange={(e) => setOcrHistoryDateRange(e.target.value as '7' | '30' | '90' | 'all')}
              className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-bold text-slate-700 dark:text-slate-200"
            >
              <option value="7">Últimos 7 días</option>
              <option value="30">Últimos 30 días</option>
              <option value="90">Últimos 90 días</option>
              <option value="all">Todo el historial</option>
            </select>

            <input
              type="text"
              value={ocrHistorySupplierFilter}
              onChange={(e) => setOcrHistorySupplierFilter(e.target.value)}
              placeholder="Proveedor (contiene...)"
              className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-bold text-slate-700 dark:text-slate-200"
            />

            <input
              type="text"
              value={ocrHistoryInvoiceFilter}
              onChange={(e) => setOcrHistoryInvoiceFilter(e.target.value)}
              placeholder="Factura (contiene...)"
              className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-bold text-slate-700 dark:text-slate-200"
            />

            <select
              value={ocrHistorySortBy}
              onChange={(e) => setOcrHistorySortBy(e.target.value as 'date' | 'score' | 'amount' | 'supplier' | 'invoiceNumber' | 'decision' | 'resultStatus')}
              className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-bold text-slate-700 dark:text-slate-200"
            >
              <option value="date">Ordenar por fecha</option>
              <option value="score">Ordenar por score</option>
              <option value="amount">Ordenar por monto</option>
              <option value="supplier">Ordenar por proveedor</option>
              <option value="invoiceNumber">Ordenar por factura</option>
              <option value="decision">Ordenar por decisión</option>
              <option value="resultStatus">Ordenar por resultado</option>
            </select>

            <select
              value={ocrHistorySortDirection}
              onChange={(e) => setOcrHistorySortDirection(e.target.value as 'asc' | 'desc')}
              className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-bold text-slate-700 dark:text-slate-200"
            >
              <option value="desc">Descendente</option>
              <option value="asc">Ascendente</option>
            </select>

            <button
              onClick={exportVisibleOcrHistoryCsv}
              className="px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-xs font-black uppercase tracking-wider text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              Exportar CSV
            </button>

            <button
              onClick={exportVisibleOcrHistoryXlsx}
              className="px-3 py-2 rounded-xl border border-emerald-300 dark:border-emerald-700 bg-emerald-50/80 dark:bg-emerald-900/20 text-xs font-black uppercase tracking-wider text-emerald-700 dark:text-emerald-200 hover:bg-emerald-100 dark:hover:bg-emerald-900/40"
            >
              Exportar XLSX
            </button>
          </div>

          <div className="mb-3 rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2 bg-white/80 dark:bg-slate-900/30">
            <p className="text-[9px] font-black uppercase tracking-widest text-slate-500 mb-2">Columnas visibles y exportables</p>
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-1.5">
              {OCR_HISTORY_COLUMN_OPTIONS.map((column) => {
                const checked = ocrHistorySelectedColumns.includes(column.key);
                return (
                  <label key={column.key} className="inline-flex items-center gap-1.5 text-[10px] font-bold text-slate-700 dark:text-slate-200">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleOcrHistoryColumn(column.key)}
                      className="accent-primary"
                    />
                    {column.label}
                  </label>
                );
              })}
            </div>
            <div className="mt-2 pt-2 border-t border-slate-200 dark:border-slate-700">
              <label className="inline-flex items-center gap-2 text-[10px] font-bold text-slate-700 dark:text-slate-200">
                <input
                  type="checkbox"
                  checked={ocrHistoryStickyColumnsEnabled}
                  onChange={(e) => setOcrHistoryStickyColumnsEnabled(e.target.checked)}
                  className="accent-primary"
                />
                Fijar columnas clave (Factura, Proveedor, Score) en vista tabla
              </label>
            </div>
          </div>

          <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">Trazabilidad OCR reciente</p>
          {sortedVisibleOcrValidationHistory.length === 0 ? (
            <p className="text-xs text-slate-500">Sin validaciones registradas todavía.</p>
          ) : ocrHistoryViewMode === 'table' ? (
            <div className="max-h-64 overflow-auto rounded-xl border border-slate-200 dark:border-slate-700 bg-white/80 dark:bg-slate-900/30">
              <table className="min-w-full text-[11px]">
                <thead className="bg-slate-100/90 dark:bg-slate-800/80 sticky top-0">
                  <tr>
                    {ocrHistorySelectedColumns.map((columnKey) => {
                      const sortableByColumn: Partial<Record<OcrHistoryColumnKey, string>> = {
                        date: 'date',
                        score: 'score',
                        detectedTotal: 'amount',
                        supplier: 'supplier',
                        invoiceNumber: 'invoiceNumber',
                        decision: 'decision',
                        resultStatus: 'resultStatus',
                      };
                      const active = sortableByColumn[columnKey] === ocrHistorySortBy;
                      const isSortable = Boolean(sortableByColumn[columnKey]);
                      const stickyLeft = ocrStickyColumnLeftMap[columnKey];
                      const isSticky = typeof stickyLeft === 'number';

                      return (
                        <th
                          key={columnKey}
                          className={cn(
                            'px-2.5 py-2 text-left text-[10px] uppercase tracking-wider font-black text-slate-600 dark:text-slate-200 whitespace-nowrap',
                            isSticky && 'sticky z-20 bg-slate-100/95 dark:bg-slate-800/95'
                          )}
                          style={isSticky ? { left: stickyLeft } : undefined}
                        >
                          <button
                            type="button"
                            disabled={!isSortable}
                            onClick={() => handleOcrTableHeaderSort(columnKey)}
                            className={cn(
                              'inline-flex items-center gap-1',
                              isSortable ? 'hover:text-slate-900 dark:hover:text-white' : 'cursor-default opacity-80'
                            )}
                          >
                            {ocrHistoryColumnLabelMap[columnKey]}
                            {active && (
                              <span className="text-[9px]">{ocrHistorySortDirection === 'asc' ? '▲' : '▼'}</span>
                            )}
                          </button>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {sortedVisibleOcrValidationHistory.map((row: any) => (
                    <tr key={row.id} className="border-t border-slate-100 dark:border-slate-800">
                      {ocrHistorySelectedColumns.map((columnKey) => {
                        const stickyLeft = ocrStickyColumnLeftMap[columnKey];
                        const isSticky = typeof stickyLeft === 'number';
                        return (
                          <td
                            key={`${row.id}_${columnKey}`}
                            className={cn(
                              'px-2.5 py-2 text-slate-700 dark:text-slate-200 whitespace-nowrap align-top',
                              isSticky && 'sticky z-10 bg-white/95 dark:bg-slate-900/95'
                            )}
                            style={isSticky ? { left: stickyLeft } : undefined}
                          >
                            {getOcrColumnDisplayValue(row, columnKey)}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="space-y-2 max-h-56 overflow-y-auto pr-1 custom-scrollbar">
              {sortedVisibleOcrValidationHistory.map((row: any) => (
                <div key={row.id} className="rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2 bg-white/80 dark:bg-slate-900/30">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-black text-slate-900 dark:text-white">
                      {ocrHistorySelectedColumns.includes('invoiceNumber')
                        ? (row.invoiceNumber || 'Documento sin número')
                        : `Documento ${String(row.id || '').slice(0, 8) || 'N/A'}`}
                    </p>
                    <span className={cn(
                      'px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider border',
                      row.decision === 'approved' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : row.decision === 'review' ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-rose-50 text-rose-700 border-rose-200'
                    )}>
                      {row.decision}
                    </span>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {ocrHistorySelectedColumns
                      .filter((columnKey) => columnKey !== 'decision')
                      .map((columnKey) => {
                        const value = getOcrColumnDisplayValue(row, columnKey);
                        if (!value || value === 'N/A') return null;
                        return (
                          <span key={`${row.id}_${columnKey}`} className="px-1.5 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-[10px] text-slate-600 dark:text-slate-300">
                            <span className="font-black">{ocrHistoryColumnLabelMap[columnKey]}:</span> {value}
                          </span>
                        );
                      })}
                  </div>
                </div>
              ))}
            </div>
          )}
          {ocrHistoryHasMore && (
            <div className="mt-3 flex justify-end">
              <button
                type="button"
                onClick={() => void loadMoreOcrHistory()}
                disabled={isLoadingMoreOcrHistory}
                className="px-3 py-1.5 rounded-full border border-slate-300 dark:border-slate-600 text-[10px] font-black uppercase tracking-widest text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50"
              >
                {isLoadingMoreOcrHistory ? 'Cargando...' : 'Cargar más'}
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:gap-5 min-w-0">
        <div className="space-y-6 lg:space-y-5 min-w-0">
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

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5 lg:gap-5">
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
                  <p className="text-[10px] uppercase tracking-wider font-black text-amber-600 dark:text-amber-400 mb-2">Umbral activo: {physicalFinancialDeviationThreshold}%</p>
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
