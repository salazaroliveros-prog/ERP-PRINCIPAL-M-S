import React, { useEffect, useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Plus, 
  Search, 
  HandCoins, 
  TrendingUp, 
  TrendingDown, 
  Filter, 
  Calendar,
  ArrowUpRight,
  ArrowDownRight,
  X,
  FileText,
  BarChart as BarChartIcon,
  Download,
  Percent,
  Maximize,
  Sparkles,
  Loader2,
  CheckCircle2,
  Trash2,
  Pencil
} from 'lucide-react';
import ConfirmModal from './ConfirmModal';
import { StepForm, FormSection, FormInput, FormSelect } from './FormLayout';
import { formatCurrency, formatDate, cn, parseAIClientError } from '../lib/utils';
import { logAction } from '../lib/audit';
import { drawReportHeader } from '../lib/pdfUtils';
import { FormModal } from './FormModal';
import { toast } from 'sonner';
import { createTransaction, deleteTransactionById, listTransactions, updateTransactionById } from '../lib/financialsApi';
import { listBudgetItems, listProjects } from '../lib/projectsApi';
import { sendNotification } from '../lib/notifications';
import { GoogleGenAI, Type } from "@google/genai";
import { 
  AreaChart, 
  Area, 
  LineChart,
  Line,
  ComposedChart,
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  Legend,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar
} from 'recharts';
import { 
  startOfWeek, 
  endOfWeek, 
  startOfMonth, 
  endOfMonth, 
  isWithinInterval, 
  parseISO,
  subDays,
  subMonths,
  isSameMonth,
  isSameYear,
  format
} from 'date-fns';
import { es } from 'date-fns/locale';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Calculator, FileBarChart, Info, DollarSign, ChevronLeft, ChevronRight } from 'lucide-react';

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
  return normalized === 'in progress' || normalized === 'inprogress' || normalized === 'active' || normalized === 'en ejecucion' || normalized === 'execution';
};
import { getBrandedCsvPreamble, escapeCsvCell } from '../lib/reportBranding';
import { useTheme } from '../contexts/ThemeContext';

const EXPENSE_CATEGORIES = [
  'Materiales',
  'Mano de Obra',
  'Maquinaria y Equipo',
  'Subcontratos',
  'Permisos y Licencias',
  'Gastos Indirectos',
  'Servicios Públicos',
  'Logística y Transporte',
  'Seguridad y Salud',
  'Otros'
];

const ADMINISTRATIVE_EXPENSE_CATEGORIES = [
  'Gastos Administrativos',
  'Gastos Personales',
  'Gastos del Hogar',
  'Viáticos',
  'Combustible',
  'Pago de Luz',
  'Renta',
  'Internet',
  'Plataformas TV',
  'Gastos Oficina',
  'Préstamos',
  'Telefonía',
  'Software y Suscripciones',
  'Impuestos y Tasas',
  'Servicios Profesionales',
  'Papelería y Útiles',
  'Mantenimiento Oficina'
];

const PERSONAL_EXPENSE_CATEGORIES = [
  'Gastos Personales',
  'Gastos del Hogar',
  'Viáticos',
  'Combustible',
  'Pago de Luz',
  'Renta',
  'Internet',
  'Plataformas TV',
  'Préstamos'
];

const ALL_EXPENSE_CATEGORIES = Array.from(new Set([
  ...EXPENSE_CATEGORIES,
  ...ADMINISTRATIVE_EXPENSE_CATEGORIES,
]));

const INCOME_CATEGORIES = [
  'Venta de Inmueble',
  'Anticipo de Cliente',
  'Pago por Avance',
  'Inversión Propia',
  'Otros'
];

const OWNER_SERVICE_ORIGINS = [
  'Proyectos en ejecución',
  'Ante-Proyecto',
  'Plano Registro',
  'Planificación',
  'Diseños Urb',
  'Supervisión',
  'Otros servicios',
];

const OWNER_FUNDING_SOURCES = [
  'Cuenta Ganancias del Propietario',
  ...OWNER_SERVICE_ORIGINS,
  'Caja Chica',
  'Banco',
  'Otro',
];

const ADAPTIVE_CHIP_CLASS = 'inline-flex items-center w-fit max-w-full whitespace-normal break-words leading-tight';

const FINANCE_ALERT_STORAGE_PREFIX = 'finance_traffic_light';

const FINANCIAL_THEME_VISUALS: Record<string, {
  trendType: 'area' | 'line' | 'bar' | 'composed';
  expenseType: 'donut' | 'pie' | 'bar';
  incomeColor: string;
  expenseColor: string;
  balanceColor: string;
}> = {
  sunset: {
    trendType: 'area',
    expenseType: 'donut',
    incomeColor: '#ea580c',
    expenseColor: '#dc2626',
    balanceColor: '#7c3aed',
  },
  ocean: {
    trendType: 'line',
    expenseType: 'pie',
    incomeColor: '#0ea5e9',
    expenseColor: '#ef4444',
    balanceColor: '#2563eb',
  },
  forest: {
    trendType: 'bar',
    expenseType: 'bar',
    incomeColor: '#10b981',
    expenseColor: '#f97316',
    balanceColor: '#059669',
  },
  aurora: {
    trendType: 'composed',
    expenseType: 'donut',
    incomeColor: '#8b5cf6',
    expenseColor: '#f43f5e',
    balanceColor: '#3b82f6',
  },
  ember: {
    trendType: 'bar',
    expenseType: 'pie',
    incomeColor: '#f59e0b',
    expenseColor: '#ef4444',
    balanceColor: '#f97316',
  },
};

function getDateKey(date: Date) {
  return date.toISOString().split('T')[0];
}

export default function Financials() {
  const { currentTheme } = useTheme();
  const projectCardEffectClass = 'rounded-[var(--radius-theme)] shadow-[var(--shadow-theme)] border border-slate-100 dark:border-slate-800 hover:shadow-lg hover:border-primary/30 transition-all duration-500';

  const PAGE_SIZE = 50;
  const getDefaultTransactionForm = () => ({
    projectId: '',
    budgetItemId: '',
    accountType: 'project',
    incomeOrigin: OWNER_SERVICE_ORIGINS[0],
    fundingSource: OWNER_FUNDING_SOURCES[0],
    type: 'Expense',
    category: ALL_EXPENSE_CATEGORIES[0],
    amount: '',
    date: new Date().toISOString().split('T')[0],
    description: ''
  });
  const [transactions, setTransactions] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTransactionId, setEditingTransactionId] = useState<string | null>(null);
  const [currentStep, setCurrentStep] = useState(0);
  const [filterProject, setFilterProject] = useState('all');
  const [dateFilter, setDateFilter] = useState('all'); // all, week, month, custom
  const [quickExpenseFilter, setQuickExpenseFilter] = useState<'all' | 'admin' | 'personal'>('all');
  const [customRange, setCustomRange] = useState({ start: '', end: '' });
  
  const [budgetItems, setBudgetItems] = useState<any[]>([]);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [transactionToDelete, setTransactionToDelete] = useState<string | null>(null);
  const [isMobileChartView, setIsMobileChartView] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.innerWidth < 640;
  });
  
  const [newTransaction, setNewTransaction] = useState(getDefaultTransactionForm());

  const refreshTransactionsFromServer = async () => {
    const response = await listTransactions({ limit: PAGE_SIZE, offset: 0 });
    setTransactions(response.items);
    setOffset(response.items.length);
    setHasMore(response.hasMore);
  };

  const resetTransactionForm = () => {
    setEditingTransactionId(null);
    setNewTransaction(getDefaultTransactionForm());
    setCurrentStep(0);
  };

  useEffect(() => {
    const onResize = () => {
      setIsMobileChartView(window.innerWidth < 640);
    };

    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    const loadBudgetItemsForProject = async () => {
      if (!newTransaction.projectId) {
        setBudgetItems([]);
        return;
      }

      try {
        const items = await listBudgetItems(newTransaction.projectId);
        setBudgetItems(items);
      } catch (error: any) {
        toast.error('Error en la base de datos', {
          description: `No se pudieron cargar partidas del proyecto: ${error?.message || 'Error desconocido'}`,
        });
        setBudgetItems([]);
      }
    };

    loadBudgetItemsForProject();
  }, [newTransaction.projectId]);

  useEffect(() => {
    let isActive = true;

    const loadInitialData = async () => {
      try {
        const [response, projectItems] = await Promise.all([listTransactions({ limit: PAGE_SIZE, offset: 0 }), listProjects()]);
        if (!isActive) return;
        setTransactions(response.items);
        setOffset(response.items.length);
        setHasMore(response.hasMore);
        setProjects(projectItems);
      } catch (error: any) {
        toast.error('Error en la base de datos', {
          description: `No se pudieron cargar datos iniciales: ${error?.message || 'Error desconocido'}`,
        });
      }
    };

    loadInitialData();

    return () => {
      isActive = false;
    };
  }, []);

  useEffect(() => {
    const handleQuickActionTrigger = (event: Event) => {
      const customEvent = event as CustomEvent<{ action?: string }>;
      const action = customEvent.detail?.action;
      if (action !== 'new-income' && action !== 'new-expense') return;

      const type = action === 'new-income' ? 'Income' : 'Expense';
      const category = type === 'Income' ? INCOME_CATEGORIES[0] : ALL_EXPENSE_CATEGORIES[0];

      setNewTransaction({
        ...getDefaultTransactionForm(),
        accountType: 'owner',
        type,
        category,
        incomeOrigin: OWNER_SERVICE_ORIGINS[0],
        fundingSource: OWNER_FUNDING_SOURCES[0],
      });
      setEditingTransactionId(null);
      setCurrentStep(0);
      setIsModalOpen(true);
    };

    window.addEventListener('QUICK_ACTION_TRIGGER', handleQuickActionTrigger as EventListener);
    return () => window.removeEventListener('QUICK_ACTION_TRIGGER', handleQuickActionTrigger as EventListener);
  }, []);

  const loadMoreTransactions = async () => {
    if (isLoadingMore || !hasMore) return;
    setIsLoadingMore(true);
    try {
      const response = await listTransactions({ limit: PAGE_SIZE, offset });
      setTransactions(prev => [...prev, ...response.items]);
      setOffset(prev => prev + response.items.length);
      setHasMore(response.hasMore);
    } catch (error) {
      toast.error('Error en la base de datos', {
        description: `No se pudieron cargar más transacciones: ${error instanceof Error ? error.message : String(error)}`,
      });
    } finally {
      setIsLoadingMore(false);
    }
  };

  const handleExportCSV = () => {
    if (filteredTransactions.length === 0) {
      toast.error('No hay transacciones para exportar');
      return;
    }

    const headers = ['Fecha', 'Cuenta', 'Origen/Fuente', 'Proyecto', 'Tipo', 'Categoría', 'Descripción', 'Monto (GTQ)'];
    const rows = filteredTransactions.map(t => [
      t.date,
      t.accountType === 'owner' ? 'Ganancias del Propietario' : 'Proyecto',
      t.type === 'Income' ? (t.incomeOrigin || 'N/A') : (t.fundingSource || 'N/A'),
      projects.find(p => p.id === t.projectId)?.name || 'N/A',
      t.type === 'Income' ? 'Ingreso' : 'Gasto',
      t.category,
      t.description.replace(/,/g, ';'), // Avoid CSV break
      t.amount
    ]);

    const csvRows = [
      ...getBrandedCsvPreamble('Transacciones financieras'),
      headers,
      ...rows,
    ];
    const csvContent = csvRows.map((row) => row.map(escapeCsvCell).join(',')).join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `transacciones_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('CSV exportado correctamente');
    logAction('Exportación CSV', 'Finanzas', `Se exportaron ${filteredTransactions.length} transacciones a CSV`, 'read');
  };

  const handleGenerateMonthlyReport = () => {
    const now = new Date();
    const currentMonthStart = startOfMonth(now);
    const currentMonthEnd = endOfMonth(now);
    const prevMonthStart = startOfMonth(subMonths(now, 1));
    const prevMonthEnd = endOfMonth(subMonths(now, 1));

    const currentMonthTransactions = transactions.filter(t => {
      const d = parseISO(t.date);
      return isWithinInterval(d, { start: currentMonthStart, end: currentMonthEnd });
    });

    const prevMonthTransactions = transactions.filter(t => {
      const d = parseISO(t.date);
      return isWithinInterval(d, { start: prevMonthStart, end: prevMonthEnd });
    });

    const currentIncome = currentMonthTransactions.filter(t => t.type === 'Income').reduce((acc, t) => acc + t.amount, 0);
    const currentExpense = currentMonthTransactions.filter(t => t.type === 'Expense').reduce((acc, t) => acc + t.amount, 0);
    const currentBalance = currentIncome - currentExpense;

    const prevIncome = prevMonthTransactions.filter(t => t.type === 'Income').reduce((acc, t) => acc + t.amount, 0);
    const prevExpense = prevMonthTransactions.filter(t => t.type === 'Expense').reduce((acc, t) => acc + t.amount, 0);
    const prevBalance = prevIncome - prevExpense;

    const doc = new jsPDF();
    
    const headerBottom = drawReportHeader(doc, 'REPORTE FINANCIERO DETALLADO', {
      subtitle: `Comparativo mensual: ${format(currentMonthStart, 'MMMM yyyy', { locale: es })}`,
      dateText: `Generado el: ${format(now, "dd 'de' MMMM, yyyy", { locale: es })}`,
    });

    // Comparison Table
    const tableData = [
      ['Concepto', format(prevMonthStart, 'MMMM yyyy', { locale: es }).toUpperCase(), format(currentMonthStart, 'MMMM yyyy', { locale: es }).toUpperCase(), 'Variación'],
      ['Ingresos Totales', formatCurrency(prevIncome), formatCurrency(currentIncome), `${(((currentIncome - prevIncome) / (prevIncome || 1)) * 100).toFixed(1)}%`],
      ['Gastos Totales', formatCurrency(prevExpense), formatCurrency(currentExpense), `${(((currentExpense - prevExpense) / (prevExpense || 1)) * 100).toFixed(1)}%`],
      ['Balance Neto', formatCurrency(prevBalance), formatCurrency(currentBalance), `${(((currentBalance - prevBalance) / (Math.abs(prevBalance) || 1)) * 100).toFixed(1)}%`]
    ];

    autoTable(doc, {
      startY: headerBottom + 6,
      head: [tableData[0]],
      body: tableData.slice(1),
      theme: 'grid',
      headStyles: { fillColor: [37, 99, 235], textColor: [255, 255, 255], fontStyle: 'bold' },
      styles: { fontSize: 10, cellPadding: 5 },
      columnStyles: {
        0: { fontStyle: 'bold', cellWidth: 50 },
        1: { halign: 'right' },
        2: { halign: 'right' },
        3: { halign: 'right', fontStyle: 'bold' }
      }
    });

    // Bar Chart in PDF
    const chartStartY = (doc as any).lastAutoTable.finalY + 12;
    const chartHeight = 40;
    const barWidth = 15;
    const groupSpacing = 45;
    const barSpacing = 2;
    const chartX = 25;

    doc.setFontSize(12);
    doc.setTextColor(30, 41, 59);
    doc.text('Comparativa Mensual (Ingresos, Gastos y Balance)', chartX, chartStartY);

    const maxVal = Math.max(
      currentIncome, currentExpense, Math.abs(currentBalance),
      prevIncome, prevExpense, Math.abs(prevBalance),
      1
    );
    const scale = chartHeight / maxVal;

    // Helper to draw a bar with value label
    const drawBar = (x: number, value: number, color: [number, number, number], label: string) => {
      const h = Math.abs(value) * scale;
      const y = chartStartY + 10 + (chartHeight - h);
      doc.setFillColor(...color);
      doc.rect(x, y, barWidth, h, 'F');
      
      doc.setFontSize(6);
      doc.setTextColor(100, 116, 139);
      doc.text(formatCurrency(value), x + barWidth / 2, y - 2, { align: 'center' });
    };

    // Previous Month Bars
    drawBar(chartX + 5, prevIncome, [200, 200, 200], 'Ingresos');
    drawBar(chartX + 5 + barWidth + barSpacing, prevExpense, [254, 202, 202], 'Gastos');
    drawBar(chartX + 5 + (barWidth + barSpacing) * 2, prevBalance, [191, 219, 254], 'Balance');

    // Current Month Bars
    drawBar(chartX + 5 + groupSpacing, currentIncome, [16, 185, 129], 'Ingresos');
    drawBar(chartX + 5 + groupSpacing + barWidth + barSpacing, currentExpense, [239, 68, 68], 'Gastos');
    drawBar(chartX + 5 + groupSpacing + (barWidth + barSpacing) * 2, currentBalance, [59, 130, 246], 'Balance');

    doc.setFontSize(8);
    doc.setTextColor(30, 41, 59);
    doc.text('Mes Anterior', chartX + 5 + (barWidth * 1.5), chartStartY + 15 + chartHeight);
    doc.text('Mes Actual', chartX + 5 + groupSpacing + (barWidth * 1.5), chartStartY + 15 + chartHeight);

    // Legend
    const legendX = chartX + groupSpacing * 2 + 10;
    const legendY = chartStartY + 15;
    
    const drawLegendItem = (x: number, y: number, color: [number, number, number], text: string) => {
      doc.setFillColor(...color);
      doc.rect(x, y, 4, 4, 'F');
      doc.setFontSize(8);
      doc.text(text, x + 6, y + 3.5);
    };

    drawLegendItem(legendX, legendY, [16, 185, 129], 'Ingresos');
    drawLegendItem(legendX, legendY + 7, [239, 68, 68], 'Gastos');
    drawLegendItem(legendX, legendY + 14, [59, 130, 246], 'Balance');

    // Detailed breakdown for current month
    doc.setTextColor(30, 41, 59);
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text(`Detalle de Transacciones - ${format(currentMonthStart, 'MMMM yyyy', { locale: es })}`, 20, chartStartY + 35);

    const detailedData = currentMonthTransactions.map(t => [
      formatDate(t.date),
      projects.find(p => p.id === t.projectId)?.name || 'N/A',
      t.category,
      t.description,
      t.type === 'Income' ? '+' + formatCurrency(t.amount) : '-' + formatCurrency(t.amount)
    ]);

    autoTable(doc, {
      startY: chartStartY + 40,
      head: [['Fecha', 'Proyecto', 'Categoría', 'Descripción', 'Monto']],
      body: detailedData,
      theme: 'striped',
      headStyles: { fillColor: [71, 85, 105], textColor: [255, 255, 255] },
      styles: { fontSize: 8 },
      columnStyles: {
        4: { halign: 'right', fontStyle: 'bold' }
      }
    });

    // New Page for Insights
    doc.addPage();
    doc.setFillColor(30, 41, 59);
    doc.rect(0, 0, 210, 20, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(12);
    doc.text('ANÁLISIS DE DESVIACIONES Y RENTABILIDAD', 20, 13);

    doc.setTextColor(30, 41, 59);
    doc.setFontSize(14);
    doc.text('Top 3 Desviaciones de Presupuesto', 20, 35);

    const deviationData = deviationAnalysis.map(item => [
      item.category,
      formatCurrency(item.budgeted),
      formatCurrency(item.spent),
      `${item.deviation > 0 ? '+' : ''}${item.deviation.toFixed(1)}%`,
      item.deviation > 10 ? 'Revisar proveedores' : item.deviation > 0 ? 'Monitorear' : 'Buen control'
    ]);

    autoTable(doc, {
      startY: 40,
      head: [['Categoría', 'Presupuesto', 'Gastado', 'Desviación', 'Sugerencia']],
      body: deviationData,
      theme: 'grid',
      headStyles: { fillColor: [239, 68, 68] },
      styles: { fontSize: 9 }
    });

    const profitabilityStartY = (doc as any).lastAutoTable.finalY + 20;
    doc.setFontSize(14);
    doc.text('Top 5 Proyectos más Rentables (Último Trimestre)', 20, profitabilityStartY);

    const profitData = profitabilityRanking.map(p => [
      p.name,
      formatCurrency(p.profit),
      `${p.margin.toFixed(1)}%`
    ]);

    autoTable(doc, {
      startY: profitabilityStartY + 5,
      head: [['Proyecto', 'Utilidad', 'Margen de Ganancia']],
      body: profitData,
      theme: 'grid',
      headStyles: { fillColor: [16, 185, 129] },
      styles: { fontSize: 9 },
      columnStyles: {
        1: { halign: 'right' },
        2: { halign: 'right', fontStyle: 'bold' }
      }
    });

    doc.save(`reporte_financiero_detallado_${format(now, 'yyyy_MM')}.pdf`);
    toast.success('Reporte PDF generado correctamente');
    logAction('Generación de Reporte', 'Finanzas', 'Se generó un reporte financiero mensual en PDF', 'read');
  };

  const [isGenerating, setIsGenerating] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState<any>(null);
  const [isAnalysisModalOpen, setIsAnalysisModalOpen] = useState(false);

  const handleAIAnalysis = async () => {
    if (transactions.length === 0) {
      toast.error('No hay transacciones para analizar');
      return;
    }

    setIsGenerating(true);
    try {
      const ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_GEMINI_API_KEY });
      
      // Prepare data for AI
      const recentTransactions = transactions.slice(0, 20).map(t => ({
        date: t.date,
        type: t.type,
        category: t.category,
        amount: t.amount,
        description: t.description
      }));

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: `Como analista financiero experto en construcción, analiza las siguientes transacciones recientes y proporciona un resumen ejecutivo, identificación de tendencias y recomendaciones de optimización. Datos: ${JSON.stringify(recentTransactions)}. Proporciona la respuesta en español.`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              summary: {
                type: Type.STRING,
                description: "Resumen ejecutivo del estado financiero."
              },
              trends: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: "Tendencias identificadas."
              },
              recommendations: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: "Recomendaciones de optimización."
              }
            },
            required: ["summary", "trends", "recommendations"]
          }
        }
      });

      const analysis = JSON.parse(response.text);
      setAiAnalysis(analysis);
      setIsAnalysisModalOpen(true);
      toast.success('Análisis financiero generado con éxito');
      await logAction('Análisis IA', 'Finanzas', 'Se generó un análisis financiero utilizando IA', 'read');
    } catch (error) {
      const aiError = parseAIClientError(error);
      console.error('Error generating AI analysis:', aiError.technicalMessage, error);
      toast.error(aiError.userMessage);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDeleteTransaction = (id: string) => {
    setTransactionToDelete(id);
    setIsDeleteConfirmOpen(true);
  };

  const handleEditTransaction = (transaction: any) => {
    setEditingTransactionId(String(transaction.id));
    setNewTransaction({
      projectId: String(transaction.projectId || ''),
      budgetItemId: String(transaction.budgetItemId || ''),
      accountType: transaction.accountType === 'owner' ? 'owner' : 'project',
      incomeOrigin: String(transaction.incomeOrigin || OWNER_SERVICE_ORIGINS[0]),
      fundingSource: String(transaction.fundingSource || OWNER_FUNDING_SOURCES[0]),
      type: transaction.type === 'Income' ? 'Income' : 'Expense',
      category: String(
        transaction.category ||
        (transaction.type === 'Income' ? INCOME_CATEGORIES[0] : ALL_EXPENSE_CATEGORIES[0])
      ),
      amount: String(transaction.amount ?? ''),
      date: String(transaction.date || '').split('T')[0] || new Date().toISOString().split('T')[0],
      description: String(transaction.description || '')
    });
    setCurrentStep(0);
    setIsModalOpen(true);
  };

  const confirmDeleteTransaction = async () => {
    if (!transactionToDelete) return;
    try {
      const transaction = transactions.find(t => t.id === transactionToDelete);
      await deleteTransactionById(transactionToDelete);
      await refreshTransactionsFromServer();
      toast.success('Transacción eliminada con éxito');
      await logAction('Eliminación de Transacción', 'Finanzas', `Transacción de ${formatCurrency(transaction?.amount || 0)} eliminada`, 'delete', { transactionId: transactionToDelete });
      setTransactionToDelete(null);
    } catch (error) {
      toast.error('Error al eliminar transacción', {
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setIsDeleteConfirmOpen(false);
    }
  };

  const handleSubmitTransaction = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    
    // Validation
    if (newTransaction.accountType === 'project' && !newTransaction.projectId) {
      return toast.error('Por favor seleccione un proyecto');
    }
    if (!newTransaction.category) return toast.error('Por favor ingrese una categoría');
    if (!newTransaction.amount || Number(newTransaction.amount) <= 0) return toast.error('Por favor ingrese un monto válido');
    if (!newTransaction.date) return toast.error('Por favor seleccione una fecha');
    if (newTransaction.type === 'Income' && newTransaction.accountType === 'owner' && !newTransaction.incomeOrigin) {
      return toast.error('Seleccione el origen del ingreso');
    }
    if (newTransaction.type === 'Expense' && !newTransaction.fundingSource) {
      return toast.error('Seleccione la fuente de fondos del gasto');
    }

    if (!newTransaction.amount || isNaN(Number(newTransaction.amount)) || Number(newTransaction.amount) <= 0) {
      toast.error('Por favor ingrese un monto válido y mayor a cero.');
      return;
    }

    try {
      const payload = {
        ...newTransaction,
        accountType: newTransaction.accountType as 'project' | 'owner',
        projectId: newTransaction.accountType === 'owner' ? '' : newTransaction.projectId,
        type: newTransaction.type as 'Income' | 'Expense',
        amount: Number(newTransaction.amount)
      };

      if (editingTransactionId) {
        const updated = await updateTransactionById(editingTransactionId, payload);
        await refreshTransactionsFromServer();
        toast.success('Transacción actualizada con éxito');
        await logAction(
          'Edición de Transacción',
          'Finanzas',
          `${updated.type === 'Income' ? 'Ingreso' : 'Egreso'} de ${formatCurrency(updated.amount)} actualizado`,
          'update',
          { transactionId: updated.id }
        );
      } else {
        const created = await createTransaction(payload);
        await refreshTransactionsFromServer();
        toast.success('Transacción registrada con éxito');
        await logAction('Registro de Transacción', 'Finanzas', `${newTransaction.type === 'Income' ? 'Ingreso' : 'Egreso'} de ${formatCurrency(Number(newTransaction.amount))} registrado`, 'create', { transactionId: created.id });
      }

      setIsModalOpen(false);
      resetTransactionForm();
    } catch (error) {
      toast.error(editingTransactionId ? 'Error al actualizar transacción' : 'Error al registrar transacción', {
        description: error instanceof Error ? error.message : String(error),
      });
    }
  };

  const projectKPIs = useMemo(() => {
    return projects
      .filter((project) => isExecutionStatus(project.status))
      .map(project => {
      const projectTransactions = transactions.filter(t => t.projectId === project.id);
      const income = projectTransactions.filter(t => t.type === 'Income').reduce((acc, t) => acc + t.amount, 0);
      const expense = projectTransactions.filter(t => t.type === 'Expense').reduce((acc, t) => acc + t.amount, 0);
      const profit = income - expense;
      const profitMargin = income > 0 ? (profit / income) * 100 : 0;
      const costPerM2 = project.area > 0 ? expense / project.area : 0;

      return {
        id: project.id,
        name: project.name,
        income,
        expense,
        profit,
        profitMargin,
        costPerM2,
        area: project.area || 0
      };
    });
  }, [projects, transactions]);

  const HIGH_CONTRAST_COLORS = [
    '#000000', // Black
    '#E6194B', // Red
    '#3CB44B', // Green
    '#FFE119', // Yellow
    '#4363D8', // Blue
    '#F58231', // Orange
    '#911EB4', // Purple
    '#42D4F4', // Cyan
    '#F032E6', // Magenta
    '#BFEF45', // Lime
  ];

  const [allBudgetItems, setAllBudgetItems] = useState<any[]>([]);

  useEffect(() => {
    const fetchAllBudgetItems = async () => {
      try {
        const allItems = await listBudgetItems();
        setAllBudgetItems(allItems);
      } catch (error: any) {
        toast.error('Error en la base de datos', {
          description: `No se pudieron cargar partidas presupuestarias: ${error?.message || 'Error desconocido'}`,
        });
      }
    };

    fetchAllBudgetItems();
  }, []);

  const deviationAnalysis = useMemo(() => {
    const categories = ALL_EXPENSE_CATEGORIES;
    const analysis = categories.map(category => {
      const budgeted = allBudgetItems
        .filter(item => item.category === category)
        .reduce((acc, item) => acc + (item.totalItemPrice || item.total || 0), 0);
      
      const spent = transactions
        .filter(t => t.type === 'Expense' && t.category === category)
        .reduce((acc, t) => acc + (t.amount || 0), 0);
      
      const deviation = budgeted > 0 ? ((spent - budgeted) / budgeted) * 100 : 0;
      const absoluteDeviation = spent - budgeted;

      return {
        category,
        budgeted,
        spent,
        deviation,
        absoluteDeviation
      };
    });

    return analysis
      .filter(a => a.budgeted > 0 || a.spent > 0)
      .sort((a, b) => Math.abs(b.deviation) - Math.abs(a.deviation))
      .slice(0, 3);
  }, [allBudgetItems, transactions]);

  const profitabilityRanking = useMemo(() => {
    const threeMonthsAgo = subMonths(new Date(), 3);
    const recentProjects = projects
      .filter((project) => isExecutionStatus(project.status))
      .map(project => {
      const projectTransactions = transactions.filter(t => 
        t.projectId === project.id && 
        parseISO(t.date) >= threeMonthsAgo
      );
      
      const income = projectTransactions.filter(t => t.type === 'Income').reduce((acc, t) => acc + t.amount, 0);
      const expense = projectTransactions.filter(t => t.type === 'Expense').reduce((acc, t) => acc + t.amount, 0);
      const profit = income - expense;
      const margin = income > 0 ? (profit / income) * 100 : 0;

      return {
        name: project.name,
        profit,
        margin
      };
    });

    return recentProjects
      .filter(p => p.profit !== 0)
      .sort((a, b) => b.margin - a.margin)
      .slice(0, 5);
  }, [projects, transactions]);

  const filteredTransactions = useMemo(() => {
    const now = new Date();
    const weekInterval = { start: startOfWeek(now), end: endOfWeek(now) };
    const monthInterval = { start: startOfMonth(now), end: endOfMonth(now) };
    const customInterval =
      dateFilter === 'custom' && customRange.start && customRange.end
        ? { start: parseISO(customRange.start), end: parseISO(customRange.end) }
        : null;

    return transactions.filter((t) => {
      const matchesProject = filterProject === 'all' || t.projectId === filterProject;
      const matchesExpenseCategory =
        quickExpenseFilter === 'all'
          ? true
          : quickExpenseFilter === 'admin'
            ? t.type === 'Expense' && ADMINISTRATIVE_EXPENSE_CATEGORIES.includes(t.category)
            : t.type === 'Expense' && PERSONAL_EXPENSE_CATEGORIES.includes(t.category);

      let matchesDate = true;
      const tDate = parseISO(t.date);

      if (dateFilter === 'week') {
        matchesDate = isWithinInterval(tDate, weekInterval);
      } else if (dateFilter === 'month') {
        matchesDate = isWithinInterval(tDate, monthInterval);
      } else if (customInterval) {
        matchesDate = isWithinInterval(tDate, customInterval);
      }

      return matchesProject && matchesDate && matchesExpenseCategory;
    });
  }, [transactions, filterProject, quickExpenseFilter, dateFilter, customRange.start, customRange.end]);

  // Prepare chart data
  const chartData = useMemo(() => {
    const last30Days = Array.from({ length: 30 }, (_, i) => {
      const d = subDays(new Date(), 29 - i);
      return format(d, 'yyyy-MM-dd');
    });

    return last30Days.map(date => {
      const dayTransactions = transactions.filter(t => t.date === date && (filterProject === 'all' || t.projectId === filterProject));
      const ingresos = dayTransactions.filter(t => t.type === 'Income').reduce((acc, t) => acc + t.amount, 0);
      const gastos = dayTransactions.filter(t => t.type === 'Expense').reduce((acc, t) => acc + t.amount, 0);
      return {
        date: format(parseISO(date), 'dd MMM', { locale: es }),
        ingresos,
        gastos,
        profit: ingresos - gastos
      };
    });
  }, [transactions, filterProject]);

  const expenseByCategoryData = useMemo(() => {
    const expenses = filteredTransactions.filter(t => t.type === 'Expense');
    const counts: Record<string, number> = {};
    expenses.forEach(t => {
      const cat = t.category || 'Otros';
      counts[cat] = (counts[cat] || 0) + (t.amount || 0);
    });
    return Object.keys(counts).map(name => ({
      name,
      value: counts[name]
    })).sort((a, b) => b.value - a.value);
  }, [filteredTransactions]);

  const COLORS = HIGH_CONTRAST_COLORS;
  const colorDotClasses = [
    'bg-emerald-500',
    'bg-rose-500',
    'bg-blue-500',
    'bg-amber-500',
    'bg-violet-500',
    'bg-cyan-500',
    'bg-lime-500',
  ];

  const financialThemeVisual = FINANCIAL_THEME_VISUALS[currentTheme.id] || FINANCIAL_THEME_VISUALS.sunset;
  const trendChartMargin = isMobileChartView
    ? { top: 6, right: 4, left: -22, bottom: 2 }
    : { top: 10, right: 30, left: 0, bottom: 0 };

  const financialTotals = useMemo(() => {
    let totalIncome = 0;
    let totalExpense = 0;

    for (const transaction of filteredTransactions) {
      if (transaction.type === 'Income') {
        totalIncome += transaction.amount;
      } else if (transaction.type === 'Expense') {
        totalExpense += transaction.amount;
      }
    }

    return {
      totalIncome,
      totalExpense,
      balance: totalIncome - totalExpense,
    };
  }, [filteredTransactions]);

  const { totalIncome, totalExpense, balance } = financialTotals;

  const ownerIncomeTransactions = useMemo(
    () => transactions.filter(t => t.type === 'Income'),
    [transactions]
  );
  const ownerExpenseTransactions = useMemo(
    () => transactions.filter(
      t => t.type === 'Expense' && (
        t.accountType === 'owner' ||
        String(t.fundingSource || '').toLowerCase() === 'cuenta ganancias del propietario'.toLowerCase()
      )
    ),
    [transactions]
  );
  const ownerIncomeTotal = ownerIncomeTransactions.reduce((acc, t) => acc + t.amount, 0);
  const ownerExpenseTotal = ownerExpenseTransactions.reduce((acc, t) => acc + t.amount, 0);
  const ownerBalance = ownerIncomeTotal - ownerExpenseTotal;
  const ownerIncomeByOrigin = useMemo(() => {
    const totals = new Map<string, number>();
    ownerIncomeTransactions.forEach((t) => {
      const key = String(t.incomeOrigin || 'Sin origen');
      totals.set(key, (totals.get(key) || 0) + (t.amount || 0));
    });
    return Array.from(totals.entries())
      .map(([origin, total]) => ({ origin, total }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 6);
  }, [ownerIncomeTransactions]);

  const projectCostSummary = useMemo(() => {
    const executionProjects = projects.filter((project) => isExecutionStatus(project.status));
    const evaluationProjects = projects.filter((project) => isEvaluationStatus(project.status));

    const executionBudget = executionProjects.reduce((sum, project) => sum + (Number(project.budget) || 0), 0);
    const executionSpent = executionProjects.reduce((sum, project) => sum + (Number(project.spent) || 0), 0);
    const evaluationBudget = evaluationProjects.reduce((sum, project) => sum + (Number(project.budget) || 0), 0);
    const evaluationSpent = evaluationProjects.reduce((sum, project) => sum + (Number(project.spent) || 0), 0);

    return {
      executionCount: executionProjects.length,
      evaluationCount: evaluationProjects.length,
      executionBudget,
      executionSpent,
      evaluationBudget,
      evaluationSpent,
    };
  }, [projects]);

  const administrativeCategorySet = useMemo(() => new Set(ADMINISTRATIVE_EXPENSE_CATEGORIES), []);
  const personalCategorySet = useMemo(() => new Set(PERSONAL_EXPENSE_CATEGORIES), []);

  const administrativeExpenseTotal = filteredTransactions
    .filter(t => t.type === 'Expense' && administrativeCategorySet.has(t.category))
    .reduce((acc, t) => acc + t.amount, 0);

  const personalExpenseTotal = filteredTransactions
    .filter(t => t.type === 'Expense' && personalCategorySet.has(t.category))
    .reduce((acc, t) => acc + t.amount, 0);

  const administrativeExpenseTotalGlobal = transactions
    .filter(t => t.type === 'Expense' && administrativeCategorySet.has(t.category))
    .reduce((acc, t) => acc + t.amount, 0);

  const personalExpenseTotalGlobal = transactions
    .filter(t => t.type === 'Expense' && personalCategorySet.has(t.category))
    .reduce((acc, t) => acc + t.amount, 0);

  const activeProjectIds = useMemo(() => new Set(
    projects
      .filter((p: any) => isExecutionStatus(p.status))
      .map((p: any) => p.id)
  ), [projects]);

  const activeProjectsProfit = transactions
    .filter(t => activeProjectIds.has(t.projectId))
    .reduce((acc, t) => acc + (t.type === 'Income' ? t.amount : -t.amount), 0);

  const adminExpenseVsProfit = activeProjectsProfit > 0
    ? (administrativeExpenseTotalGlobal / activeProjectsProfit) * 100
    : 0;

  const personalExpenseVsProfit = activeProjectsProfit > 0
    ? (personalExpenseTotalGlobal / activeProjectsProfit) * 100
    : 0;

  const getTrafficLightState = (ratio: number) => {
    if (ratio <= 40) {
      return {
        label: 'Verde',
        classes: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/30',
      };
    }
    if (ratio <= 70) {
      return {
        label: 'Amarillo',
        classes: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/30',
      };
    }
    return {
      label: 'Rojo',
      classes: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-500/10 dark:text-rose-400 dark:border-rose-500/30',
    };
  };

  const adminTrafficLight = getTrafficLightState(adminExpenseVsProfit);
  const personalTrafficLight = getTrafficLightState(personalExpenseVsProfit);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (activeProjectsProfit <= 0) return;

    const today = new Date();
    const todayKey = getDateKey(today);
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const twoDaysAgo = new Date(today);
    twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);

    const yKey = getDateKey(yesterday);
    const d2Key = getDateKey(twoDaysAgo);

    const persistState = (scope: 'admin' | 'personal', state: 'green' | 'yellow' | 'red') => {
      const stateKey = `${FINANCE_ALERT_STORAGE_PREFIX}_${scope}_state_${todayKey}`;
      window.localStorage.setItem(stateKey, state);
    };

    const evaluateAlert = (scope: 'admin' | 'personal', ratio: number, label: string) => {
      const state = ratio > 70 ? 'red' : ratio > 40 ? 'yellow' : 'green';
      persistState(scope, state);

      if (state !== 'red') return;

      const yesterdayState = window.localStorage.getItem(`${FINANCE_ALERT_STORAGE_PREFIX}_${scope}_state_${yKey}`);
      const twoDaysAgoState = window.localStorage.getItem(`${FINANCE_ALERT_STORAGE_PREFIX}_${scope}_state_${d2Key}`);
      if (yesterdayState !== 'red' || twoDaysAgoState !== 'red') return;

      const alertKey = `${FINANCE_ALERT_STORAGE_PREFIX}_${scope}_alert_${todayKey}`;
      if (window.localStorage.getItem(alertKey)) return;

      void sendNotification(
        `Alerta: ${label} en rojo 3 días`,
        `${label} representa ${ratio.toFixed(1)}% de la utilidad activa y permanece en rojo por 3 días consecutivos. Revisa gastos y ajusta presupuesto.` ,
        'system'
      );
      window.localStorage.setItem(alertKey, '1');
    };

    evaluateAlert('admin', adminExpenseVsProfit, 'Gasto administrativo');
    evaluateAlert('personal', personalExpenseVsProfit, 'Gasto personal');
  }, [adminExpenseVsProfit, personalExpenseVsProfit, activeProjectsProfit]);

  // KPIs
  const profitMargin = totalIncome > 0 ? (balance / totalIncome) * 100 : 0;
  
  const selectedProjectData = filterProject !== 'all' ? projects.find(p => p.id === filterProject) : null;
  const projectArea = selectedProjectData?.area || 0;
  const costPerM2 = projectArea > 0 ? totalExpense / projectArea : 0;

  return (
    <div className="space-y-8 min-w-0 overflow-x-hidden">
      <ConfirmModal
        isOpen={isDeleteConfirmOpen}
        onClose={() => setIsDeleteConfirmOpen(false)}
        onConfirm={confirmDeleteTransaction}
        title="Eliminar Transacción"
        message="¿Estás seguro de que deseas eliminar esta transacción? Esta acción no se puede deshacer."
      />
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-10 text-center md:text-left">
        <div className="space-y-1">
          <h1 className="text-3xl md:text-4xl font-black text-slate-900 dark:text-white uppercase tracking-tight">Control Financiero</h1>
          <p className="text-sm md:text-base text-slate-500 dark:text-slate-400 font-medium">Seguimiento de ingresos, gastos y rentabilidad</p>
        </div>
        <div className="grid grid-cols-1 sm:flex sm:items-center gap-3 w-full md:w-auto">
          <div className="grid grid-cols-2 gap-2 w-full sm:w-auto">
            <button 
              onClick={handleAIAnalysis}
              disabled={isGenerating}
              className="flex items-center justify-center gap-2 px-3 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-bold text-primary hover:bg-slate-50 transition-all shadow-sm disabled:opacity-50"
            >
              {isGenerating ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Sparkles className="w-4 h-4" />
              )}
              <span className="truncate">Análisis IA</span>
            </button>
            <button 
              onClick={handleGenerateMonthlyReport}
              className="flex items-center justify-center gap-2 px-3 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-50 transition-all shadow-sm"
            >
              <FileText size={16} />
              <span className="truncate">Reporte PDF</span>
            </button>
          </div>
          <button 
            onClick={() => setIsModalOpen(true)}
            className="w-full sm:w-auto flex items-center justify-center gap-2 bg-primary text-white font-bold py-3 px-6 rounded-xl hover:bg-primary-hover transition-all shadow-lg shadow-primary-shadow"
          >
            <Plus size={20} />
            Nuevo Registro
          </button>
        </div>
      </header>

      <AnimatePresence>
        {isAnalysisModalOpen && aiAnalysis && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden border border-slate-100 dark:border-slate-800"
            >
              <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-primary/5">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-primary/10 rounded-xl">
                    <Sparkles className="w-5 h-5 text-primary" />
                  </div>
                  <h3 className="text-xl font-black text-slate-900 dark:text-white uppercase tracking-tight">Análisis Financiero IA</h3>
                </div>
                <button onClick={() => setIsAnalysisModalOpen(false)} title="Cerrar analisis" aria-label="Cerrar analisis" className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors">
                  <X size={20} className="text-slate-500" />
                </button>
              </div>
              <div className="p-8 space-y-6 max-h-[70vh] overflow-y-auto custom-scrollbar">
                <div className="space-y-2">
                  <h4 className="text-[10px] font-black text-primary uppercase tracking-widest">Resumen Ejecutivo</h4>
                  <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed font-medium">
                    {aiAnalysis.summary}
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-3">
                    <h4 className="text-[10px] font-black text-amber-500 uppercase tracking-widest">Tendencias</h4>
                    <ul className="space-y-2">
                      {aiAnalysis.trends.map((trend: string, i: number) => (
                        <li key={i} className="flex items-start gap-2 text-xs text-slate-600 dark:text-slate-400">
                          <TrendingUp className="w-3.5 h-3.5 text-amber-500 mt-0.5 shrink-0" />
                          <span>{trend}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="space-y-3">
                    <h4 className="text-[10px] font-black text-emerald-500 uppercase tracking-widest">Recomendaciones</h4>
                    <ul className="space-y-2">
                      {aiAnalysis.recommendations.map((rec: string, i: number) => (
                        <li key={i} className="flex items-start gap-2 text-xs text-slate-600 dark:text-slate-400">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 mt-0.5 shrink-0" />
                          <span>{rec}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
              <div className="p-6 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-100 dark:border-slate-800 flex justify-end">
                <button
                  onClick={() => setIsAnalysisModalOpen(false)}
                  className="px-6 py-2.5 bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-xl text-xs font-black uppercase tracking-widest hover:opacity-90 transition-all"
                >
                  Entendido
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-6 mb-8">
        <div className={cn("bg-white dark:bg-slate-900 glass-card p-6 relative overflow-hidden group flex flex-col items-center sm:items-start text-center sm:text-left min-h-[168px] hover:border-emerald-300 dark:hover:border-emerald-500/40", projectCardEffectClass)}>
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:scale-110 transition-transform duration-500 hidden sm:block">
            <TrendingUp size={64} className="text-emerald-600" />
          </div>
          <div className="flex flex-col sm:flex-row items-center gap-3 mb-4 w-full">
            <div className="p-2 bg-emerald-100 dark:bg-emerald-500/10 text-emerald-600 rounded-lg group-hover:scale-105 sm:group-hover:scale-110 group-hover:shadow-md sm:group-hover:shadow-lg group-hover:shadow-emerald-500/20 transition-all duration-200 sm:duration-300">
              <TrendingUp size={20} />
            </div>
            <p className="text-micro text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider leading-tight break-words">Ingresos Totales</p>
          </div>
          <p className="text-xl sm:text-2xl font-bold text-emerald-600 leading-tight break-words">{formatCurrency(totalIncome)}</p>
        </div>

        <div className={cn("bg-white dark:bg-slate-900 glass-card p-6 relative overflow-hidden group flex flex-col items-center sm:items-start text-center sm:text-left min-h-[168px] hover:border-rose-300 dark:hover:border-rose-500/40", projectCardEffectClass)}>
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:scale-110 transition-transform duration-500 hidden sm:block">
            <TrendingDown size={64} className="text-rose-600" />
          </div>
          <div className="flex flex-col sm:flex-row items-center gap-3 mb-4 w-full">
            <div className="p-2 bg-rose-100 dark:bg-rose-500/10 text-rose-600 rounded-lg group-hover:scale-105 sm:group-hover:scale-110 group-hover:shadow-md sm:group-hover:shadow-lg group-hover:shadow-rose-500/20 transition-all duration-200 sm:duration-300">
              <TrendingDown size={20} />
            </div>
            <p className="text-micro text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider leading-tight break-words">Gastos Totales</p>
          </div>
          <p className="text-xl sm:text-2xl font-bold text-rose-600 leading-tight break-words">{formatCurrency(totalExpense)}</p>
        </div>

        <div className={cn(
          "bg-white dark:bg-slate-900 glass-card p-6 relative overflow-hidden group flex flex-col items-center sm:items-start text-center sm:text-left min-h-[168px]",
          balance >= 0 ? "hover:border-emerald-300 dark:hover:border-emerald-500/40" : "hover:border-rose-300 dark:hover:border-rose-500/40",
          projectCardEffectClass
        )}>
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:scale-110 transition-transform duration-500 hidden sm:block">
            <HandCoins size={64} className={balance >= 0 ? "text-emerald-600" : "text-rose-600"} />
          </div>
          <div className="flex flex-col sm:flex-row items-center gap-3 mb-4 w-full">
            <div className="p-2 bg-blue-100 dark:bg-blue-500/10 text-blue-600 rounded-lg group-hover:scale-105 sm:group-hover:scale-110 group-hover:shadow-md sm:group-hover:shadow-lg group-hover:shadow-blue-500/20 transition-all duration-200 sm:duration-300">
              <HandCoins size={20} />
            </div>
            <p className="text-micro text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider leading-tight break-words">Balance Neto</p>
          </div>
          <p className={cn(
            "text-xl sm:text-2xl font-bold leading-tight break-words",
            balance >= 0 ? "text-emerald-600" : "text-rose-600"
          )}>{formatCurrency(balance)}</p>
        </div>

        <div className={cn("bg-white dark:bg-slate-900 glass-card p-6 relative overflow-hidden group flex flex-col items-center sm:items-start text-center sm:text-left min-h-[168px] hover:border-amber-300 dark:hover:border-amber-500/40", projectCardEffectClass)}>
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:scale-110 transition-transform duration-500 hidden sm:block">
            <Percent size={64} className="text-amber-600" />
          </div>
          <div className="flex flex-col sm:flex-row items-center gap-3 mb-4 w-full">
            <div className="p-2 bg-amber-100 dark:bg-amber-500/10 text-amber-600 rounded-lg group-hover:scale-105 sm:group-hover:scale-110 group-hover:shadow-md sm:group-hover:shadow-lg group-hover:shadow-amber-500/20 transition-all duration-200 sm:duration-300">
              <Percent size={20} />
            </div>
            <p className="text-micro text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider leading-tight break-words">Margen de Ganancia</p>
          </div>
          <div className="flex flex-wrap items-baseline justify-center sm:justify-start gap-2">
            <p className={cn(
              "text-xl sm:text-2xl font-bold leading-tight",
              profitMargin >= 20 ? "text-emerald-600" : profitMargin >= 10 ? "text-amber-600" : "text-rose-600"
            )}>{profitMargin.toFixed(1)}%</p>
            <span className="text-micro font-bold text-slate-400 dark:text-slate-500 uppercase leading-tight">Sobre Ingresos</span>
          </div>
        </div>

        <div className={cn("bg-white dark:bg-slate-900 glass-card p-6 relative overflow-hidden group flex flex-col items-center sm:items-start text-center sm:text-left min-h-[168px] hover:border-violet-300 dark:hover:border-violet-500/40", projectCardEffectClass)}>
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:scale-110 transition-transform duration-500 hidden sm:block">
            <Calculator size={64} className="text-violet-600" />
          </div>
          <div className="flex flex-col sm:flex-row items-center gap-3 mb-4 w-full">
            <div className="p-2 bg-violet-100 dark:bg-violet-500/10 text-violet-600 rounded-lg group-hover:scale-105 sm:group-hover:scale-110 group-hover:shadow-md sm:group-hover:shadow-lg group-hover:shadow-violet-500/20 transition-all duration-200 sm:duration-300">
              <Calculator size={20} />
            </div>
            <p className="text-micro text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider leading-tight break-words">Rubro Gastos Administrativos</p>
          </div>
          <p className="text-xl sm:text-2xl font-bold text-violet-600 leading-tight break-words">{formatCurrency(administrativeExpenseTotalGlobal)}</p>
          <p className={cn(
            "mt-2 text-micro font-black uppercase tracking-wider leading-tight break-words",
            adminExpenseVsProfit <= 40 ? "text-emerald-600" : adminExpenseVsProfit <= 70 ? "text-amber-600" : "text-rose-600"
          )}>
            {activeProjectsProfit > 0
              ? `${adminExpenseVsProfit.toFixed(1)}% de utilidad activa`
              : 'Sin utilidad activa para comparar'}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
        <div className="bg-white dark:bg-slate-900 p-4 sm:p-5 rounded-2xl border border-emerald-100 dark:border-emerald-900/30 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[10px] font-black uppercase tracking-widest text-emerald-600 dark:text-emerald-400">Costo Proyectos en Ejecución</p>
            <span className="text-[10px] font-black text-emerald-600 dark:text-emerald-400">{projectCostSummary.executionCount} proyectos</span>
          </div>
          <p className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white">{formatCurrency(projectCostSummary.executionBudget)}</p>
          <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 mt-1">Ejecutado: {formatCurrency(projectCostSummary.executionSpent)}</p>
        </div>

        <div className="bg-white dark:bg-slate-900 p-4 sm:p-5 rounded-2xl border border-violet-100 dark:border-violet-900/30 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[10px] font-black uppercase tracking-widest text-violet-600 dark:text-violet-400">Costos en Evaluación (Aparte)</p>
            <span className="text-[10px] font-black text-violet-600 dark:text-violet-400">{projectCostSummary.evaluationCount} proyectos</span>
          </div>
          <p className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white">{formatCurrency(projectCostSummary.evaluationBudget)}</p>
          <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 mt-1">Ejecutado: {formatCurrency(projectCostSummary.evaluationSpent)}</p>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800 p-6 sm:p-8 mb-8">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div>
            <h3 className="text-lg sm:text-xl font-black text-slate-900 dark:text-white uppercase tracking-tight">Módulo de Ganancias del Propietario</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">Consolida ingresos de proyectos en ejecución y servicios, y controla egresos por fuente de fondos.</p>
          </div>
          <span className={cn(
            ADAPTIVE_CHIP_CLASS,
            "px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-wider border",
            ownerBalance >= 0
              ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/30"
              : "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-500/10 dark:text-rose-400 dark:border-rose-500/30"
          )}>
            Balance Cuenta: {formatCurrency(ownerBalance)}
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="rounded-2xl border border-emerald-100 dark:border-emerald-500/20 bg-emerald-50/70 dark:bg-emerald-500/10 p-4">
            <p className="text-[10px] font-black uppercase tracking-widest text-emerald-700 dark:text-emerald-400">Ingresos en Cuenta</p>
            <p className="text-2xl font-black text-emerald-600 mt-2">{formatCurrency(ownerIncomeTotal)}</p>
          </div>
          <div className="rounded-2xl border border-rose-100 dark:border-rose-500/20 bg-rose-50/70 dark:bg-rose-500/10 p-4">
            <p className="text-[10px] font-black uppercase tracking-widest text-rose-700 dark:text-rose-400">Gastos desde Cuenta</p>
            <p className="text-2xl font-black text-rose-600 mt-2">{formatCurrency(ownerExpenseTotal)}</p>
          </div>
          <div className="rounded-2xl border border-blue-100 dark:border-blue-500/20 bg-blue-50/70 dark:bg-blue-500/10 p-4">
            <p className="text-[10px] font-black uppercase tracking-widest text-blue-700 dark:text-blue-400">Movimientos</p>
            <p className="text-2xl font-black text-blue-600 mt-2">{ownerIncomeTransactions.length + ownerExpenseTransactions.length}</p>
          </div>
        </div>

        <div>
          <h4 className="text-[11px] font-black text-slate-700 dark:text-slate-300 uppercase tracking-widest mb-3">Origen principal de ingresos</h4>
          <div className="flex flex-wrap gap-2">
            {ownerIncomeByOrigin.length > 0 ? ownerIncomeByOrigin.map((item) => (
              <span
                key={item.origin}
                className={cn(
                  ADAPTIVE_CHIP_CLASS,
                  "px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-wider border bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700"
                )}
              >
                {item.origin}: {formatCurrency(item.total)}
              </span>
            )) : (
              <p className="text-sm text-slate-500 dark:text-slate-400">Aún no hay ingresos enviados a la cuenta del propietario.</p>
            )}
          </div>
        </div>
      </div>

      {/* Insights Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8 min-w-0">
        {/* Budget Deviations */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="bg-white dark:bg-slate-900 rounded-3xl p-8 border border-slate-100 dark:border-slate-800 shadow-sm min-w-0"
        >
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 bg-red-100 dark:bg-red-900/30 rounded-xl">
              <TrendingUp className="w-5 h-5 text-red-600 dark:text-red-400" />
            </div>
            <h3 className="text-xl font-black text-slate-900 dark:text-white uppercase tracking-tight">Mayores Desviaciones</h3>
          </div>
          
          <div className="space-y-6">
            {deviationAnalysis.map((item, index) => (
              <div key={index} className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-800">
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <span className="text-sm font-bold text-slate-900 dark:text-white">{item.category}</span>
                    <p className="text-xs text-slate-500 mt-1">
                      Presupuestado: {formatCurrency(item.budgeted)} | Gastado: {formatCurrency(item.spent)}
                    </p>
                  </div>
                  <span className={cn(
                    ADAPTIVE_CHIP_CLASS,
                    "px-2 py-1 rounded-lg text-xs font-black",
                    item.deviation > 0 ? "bg-red-100 text-red-700" : "bg-emerald-100 text-emerald-700"
                  )}>
                    {item.deviation > 0 ? '+' : ''}{item.deviation.toFixed(1)}%
                  </span>
                </div>
                <div className="mt-3 p-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-100 dark:border-slate-800">
                  <div className="flex gap-2">
                    <Sparkles className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                    <p className="text-xs text-slate-600 dark:text-slate-400 italic">
                      {item.deviation > 10 
                        ? `Sugerencia: Revisar proveedores de ${item.category.toLowerCase()} y negociar descuentos por volumen o buscar alternativas locales.`
                        : item.deviation > 0 
                        ? `Sugerencia: Monitorear de cerca los gastos de ${item.category.toLowerCase()} para evitar que la desviación aumente.`
                        : `Sugerencia: Excelente control en ${item.category.toLowerCase()}. Considerar aplicar estas prácticas en otras áreas.`}
                    </p>
                  </div>
                </div>
              </div>
            ))}
            {deviationAnalysis.length === 0 && (
              <p className="text-center text-slate-500 py-8 italic">No hay datos suficientes para el análisis de desviaciones.</p>
            )}
          </div>
        </motion.div>

        {/* Profitability Ranking */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.1 }}
          className="bg-white dark:bg-slate-900 rounded-3xl p-8 border border-slate-100 dark:border-slate-800 shadow-sm"
        >
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 bg-emerald-100 dark:bg-emerald-900/30 rounded-xl">
              <BarChartIcon className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <h3 className="text-xl font-black text-slate-900 dark:text-white uppercase tracking-tight">Rentabilidad (Último Trimestre)</h3>
          </div>

          <div className="h-[300px] min-w-0">
            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={220}>
              <BarChart data={profitabilityRanking} layout="vertical" margin={{ left: 40, right: 40 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
                <XAxis type="number" hide />
                <YAxis 
                  dataKey="name" 
                  type="category" 
                  width={100} 
                  tick={{ fontSize: 10, fontWeight: 700 }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip 
                  cursor={{ fill: 'transparent' }}
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      return (
                        <div className="bg-white dark:bg-slate-900 p-3 rounded-xl shadow-xl border border-slate-100 dark:border-slate-800">
                          <p className="text-xs font-black text-slate-900 dark:text-white mb-1">{payload[0].payload.name}</p>
                          <p className="text-xs text-emerald-600 font-bold">Margen: {Number(payload[0].value).toFixed(1)}%</p>
                          <p className="text-xs text-slate-500">Utilidad: {formatCurrency(payload[0].payload.profit)}</p>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Bar 
                  dataKey="margin" 
                  fill="#3CB44B" 
                  radius={[0, 8, 8, 0]}
                  barSize={30}
                >
                  {profitabilityRanking.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={HIGH_CONTRAST_COLORS[index % HIGH_CONTRAST_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </motion.div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-8 mb-6 sm:mb-8 min-w-0">
        <div className="lg:col-span-2 bg-white dark:bg-slate-900 p-4 sm:p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800 min-w-0">
          <div className="flex items-center justify-between mb-4 sm:mb-6">
            <div>
              <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">Tendencia Financiera</h3>
              <p className="text-[10px] sm:text-xs text-slate-500 font-bold uppercase tracking-widest mt-1">Últimos 30 días</p>
            </div>
            <div className="hidden sm:flex items-center gap-4 text-micro font-bold uppercase tracking-wider">
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: financialThemeVisual.incomeColor }}></div>
                <span className="text-slate-500 dark:text-slate-400">Ingresos</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: financialThemeVisual.expenseColor }}></div>
                <span className="text-slate-500 dark:text-slate-400">Gastos</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: financialThemeVisual.balanceColor }}></div>
                <span className="text-slate-500 dark:text-slate-400">Balance Neto</span>
              </div>
            </div>
          </div>
          <div className="h-64 sm:h-80 min-w-0">
            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={220}>
              {financialThemeVisual.trendType === 'line' ? (
                <LineChart data={chartData} margin={trendChartMargin}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" className="dark:stroke-slate-800" />
                  <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: isMobileChartView ? 8 : 10 }} minTickGap={isMobileChartView ? 56 : 30} dy={isMobileChartView ? 6 : 10} interval={isMobileChartView ? 5 : 'preserveStartEnd'} />
                  <YAxis width={isMobileChartView ? 42 : 60} axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: isMobileChartView ? 8 : 10 }} tickFormatter={(value) => `Q${value >= 1000 ? (value/1000).toFixed(1) + 'k' : value}`} />
                  <Tooltip contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)', padding: '12px', backgroundColor: 'rgba(255, 255, 255, 0.95)', backdropFilter: 'blur(8px)' }} itemStyle={{ padding: '2px 0' }} formatter={(value: number) => [formatCurrency(value), '']} labelStyle={{ fontWeight: 'bold', marginBottom: '8px', color: '#1e293b' }} cursor={{ stroke: '#cbd5e1', strokeWidth: 2, strokeDasharray: '5 5' }} />
                  <Line type="monotone" dataKey="ingresos" stroke={financialThemeVisual.incomeColor} strokeWidth={2.5} dot={false} name="Ingresos" />
                  <Line type="monotone" dataKey="gastos" stroke={financialThemeVisual.expenseColor} strokeWidth={2.5} dot={false} name="Gastos" />
                  <Line type="monotone" dataKey="profit" stroke={financialThemeVisual.balanceColor} strokeWidth={3} dot={{ r: 2 }} name="Balance Neto" />
                </LineChart>
              ) : financialThemeVisual.trendType === 'bar' ? (
                <BarChart data={chartData} margin={trendChartMargin}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" className="dark:stroke-slate-800" />
                  <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: isMobileChartView ? 8 : 10 }} minTickGap={isMobileChartView ? 56 : 30} dy={isMobileChartView ? 6 : 10} interval={isMobileChartView ? 5 : 'preserveStartEnd'} />
                  <YAxis width={isMobileChartView ? 42 : 60} axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: isMobileChartView ? 8 : 10 }} tickFormatter={(value) => `Q${value >= 1000 ? (value/1000).toFixed(1) + 'k' : value}`} />
                  <Tooltip contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)', padding: '12px', backgroundColor: 'rgba(255, 255, 255, 0.95)', backdropFilter: 'blur(8px)' }} itemStyle={{ padding: '2px 0' }} formatter={(value: number) => [formatCurrency(value), '']} labelStyle={{ fontWeight: 'bold', marginBottom: '8px', color: '#1e293b' }} cursor={{ stroke: '#cbd5e1', strokeWidth: 2, strokeDasharray: '5 5' }} />
                  {!isMobileChartView && <Legend />}
                  <Bar dataKey="ingresos" fill={financialThemeVisual.incomeColor} radius={[4, 4, 0, 0]} name="Ingresos" />
                  <Bar dataKey="gastos" fill={financialThemeVisual.expenseColor} radius={[4, 4, 0, 0]} name="Gastos" />
                  <Bar dataKey="profit" fill={financialThemeVisual.balanceColor} radius={[4, 4, 0, 0]} name="Balance Neto" />
                </BarChart>
              ) : financialThemeVisual.trendType === 'composed' ? (
                <ComposedChart data={chartData} margin={trendChartMargin}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" className="dark:stroke-slate-800" />
                  <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: isMobileChartView ? 8 : 10 }} minTickGap={isMobileChartView ? 56 : 30} dy={isMobileChartView ? 6 : 10} interval={isMobileChartView ? 5 : 'preserveStartEnd'} />
                  <YAxis width={isMobileChartView ? 42 : 60} axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: isMobileChartView ? 8 : 10 }} tickFormatter={(value) => `Q${value >= 1000 ? (value/1000).toFixed(1) + 'k' : value}`} />
                  <Tooltip contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)', padding: '12px', backgroundColor: 'rgba(255, 255, 255, 0.95)', backdropFilter: 'blur(8px)' }} itemStyle={{ padding: '2px 0' }} formatter={(value: number) => [formatCurrency(value), '']} labelStyle={{ fontWeight: 'bold', marginBottom: '8px', color: '#1e293b' }} cursor={{ stroke: '#cbd5e1', strokeWidth: 2, strokeDasharray: '5 5' }} />
                  {!isMobileChartView && <Legend />}
                  <Bar dataKey="ingresos" fill={financialThemeVisual.incomeColor} radius={[4, 4, 0, 0]} name="Ingresos" opacity={0.45} />
                  <Bar dataKey="gastos" fill={financialThemeVisual.expenseColor} radius={[4, 4, 0, 0]} name="Gastos" opacity={0.45} />
                  <Line type="monotone" dataKey="profit" stroke={financialThemeVisual.balanceColor} strokeWidth={3} name="Balance Neto" dot={{ r: 2 }} />
                </ComposedChart>
              ) : (
                <AreaChart data={chartData} margin={trendChartMargin}>
                  <defs>
                    <linearGradient id="colorIngresos" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={financialThemeVisual.incomeColor} stopOpacity={0.1}/>
                      <stop offset="95%" stopColor={financialThemeVisual.incomeColor} stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="colorGastos" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={financialThemeVisual.expenseColor} stopOpacity={0.1}/>
                      <stop offset="95%" stopColor={financialThemeVisual.expenseColor} stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="colorBalance" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={financialThemeVisual.balanceColor} stopOpacity={0.2}/>
                      <stop offset="95%" stopColor={financialThemeVisual.balanceColor} stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" className="dark:stroke-slate-800" />
                  <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: isMobileChartView ? 8 : 10 }} minTickGap={isMobileChartView ? 56 : 30} dy={isMobileChartView ? 6 : 10} interval={isMobileChartView ? 5 : 'preserveStartEnd'} />
                  <YAxis width={isMobileChartView ? 42 : 60} axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: isMobileChartView ? 8 : 10 }} tickFormatter={(value) => `Q${value >= 1000 ? (value/1000).toFixed(1) + 'k' : value}`} />
                  <Tooltip contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)', padding: '12px', backgroundColor: 'rgba(255, 255, 255, 0.95)', backdropFilter: 'blur(8px)' }} itemStyle={{ padding: '2px 0' }} formatter={(value: number) => [formatCurrency(value), '']} labelStyle={{ fontWeight: 'bold', marginBottom: '8px', color: '#1e293b' }} cursor={{ stroke: '#cbd5e1', strokeWidth: 2, strokeDasharray: '5 5' }} />
                  <Area type="monotone" dataKey="ingresos" stroke={financialThemeVisual.incomeColor} strokeWidth={2} fillOpacity={1} fill="url(#colorIngresos)" name="Ingresos" activeDot={{ r: 6, strokeWidth: 0, fill: financialThemeVisual.incomeColor }} />
                  <Area type="monotone" dataKey="gastos" stroke={financialThemeVisual.expenseColor} strokeWidth={2} fillOpacity={1} fill="url(#colorGastos)" name="Gastos" activeDot={{ r: 6, strokeWidth: 0, fill: financialThemeVisual.expenseColor }} />
                  <Area type="monotone" dataKey="profit" stroke={financialThemeVisual.balanceColor} strokeWidth={3} fillOpacity={1} fill="url(#colorBalance)" name="Balance Neto" activeDot={{ r: 8, strokeWidth: 2, stroke: '#fff', fill: financialThemeVisual.balanceColor }} />
                </AreaChart>
              )}
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-4 sm:p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800">
          <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white mb-4 sm:mb-6">Gastos por Categoría</h3>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-8 items-center">
            <div className="h-48 sm:h-64 min-w-0">
              <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={220}>
                {financialThemeVisual.expenseType === 'bar' ? (
                  <BarChart data={expenseByCategoryData} margin={{ top: 8, right: 8, left: 0, bottom: 30 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" className="dark:stroke-slate-800" />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 9 }} angle={-22} textAnchor="end" height={55} interval={0} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 9 }} tickFormatter={(value) => `Q${value >= 1000 ? (value/1000).toFixed(0) + 'k' : value}`} />
                    <Tooltip contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)', backgroundColor: 'rgba(255, 255, 255, 0.95)', backdropFilter: 'blur(8px)' }} formatter={(value: number) => [formatCurrency(value), 'Total']} />
                    <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                      {expenseByCategoryData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                ) : (
                  <PieChart margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                    <Pie
                      data={expenseByCategoryData}
                      cx="50%"
                      cy="50%"
                      innerRadius={financialThemeVisual.expenseType === 'pie' ? 0 : 60}
                      outerRadius={80}
                      paddingAngle={5}
                      dataKey="value"
                    >
                      {expenseByCategoryData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip 
                      contentStyle={{ 
                        borderRadius: '16px', 
                        border: 'none', 
                        boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)',
                        backgroundColor: 'rgba(255, 255, 255, 0.95)',
                        backdropFilter: 'blur(8px)'
                      }}
                      formatter={(value: number) => [formatCurrency(value), "Total"]}
                    />
                  </PieChart>
                )}
              </ResponsiveContainer>
            </div>
            <div className="space-y-3 max-h-64 overflow-y-auto pr-2 custom-scrollbar">
              {expenseByCategoryData.map((entry, index) => (
                <div key={entry.name} className="flex items-center justify-between p-2 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors group">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className={cn("w-2.5 h-2.5 rounded-full", colorDotClasses[index % colorDotClasses.length])}></div>
                    <span className="text-xs font-bold text-slate-600 dark:text-slate-400 group-hover:text-slate-900 dark:group-hover:text-white transition-colors uppercase tracking-wider truncate">{entry.name}</span>
                  </div>
                  <span className="ml-2 shrink-0 text-xs font-black text-slate-900 dark:text-white text-right">{formatCurrency(entry.value)}</span>
                </div>
              ))}
              {expenseByCategoryData.length === 0 && (
                <div className="text-center py-8">
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Sin datos de gastos</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-col md:flex-row gap-4 sm:gap-6 items-center justify-between bg-white dark:bg-slate-900 p-4 sm:p-6 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm mb-6 sm:mb-8">
        <div className="flex flex-col sm:flex-row items-center gap-3 sm:gap-4 w-full md:w-auto">
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <Filter className="text-slate-400 shrink-0" size={16} />
            <select 
              className="w-full sm:w-48 px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg sm:rounded-xl focus:outline-none focus:ring-2 focus:ring-primary text-xs sm:text-sm text-slate-900 dark:text-white"
              value={filterProject}
              onChange={(e) => setFilterProject(e.target.value)}
              title="Filtrar por proyecto"
              aria-label="Filtrar por proyecto"
            >
              <option value="all">Todos los Proyectos</option>
              {projects.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <Calendar className="text-slate-400 shrink-0" size={16} />
            <select 
              className="w-full sm:w-48 px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg sm:rounded-xl focus:outline-none focus:ring-2 focus:ring-primary text-xs sm:text-sm text-slate-900 dark:text-white"
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              title="Filtrar por rango de fechas"
              aria-label="Filtrar por rango de fechas"
            >
              <option value="all">Todo el tiempo</option>
              <option value="week">Esta semana</option>
              <option value="month">Este mes</option>
              <option value="year">Este año</option>
              <option value="custom">Personalizado</option>
            </select>
          </div>

          {dateFilter === 'custom' && (
            <div className="flex items-center gap-2 w-full sm:w-auto justify-center">
              <input 
                type="date" 
                className="flex-1 sm:w-32 px-2 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg sm:rounded-xl text-[10px] sm:text-xs text-slate-900 dark:text-white"
                value={customRange.start}
                onChange={(e) => setCustomRange({...customRange, start: e.target.value})}
                title="Fecha inicial"
                aria-label="Fecha inicial"
              />
              <span className="text-slate-400">-</span>
              <input 
                type="date" 
                className="flex-1 sm:w-32 px-2 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg sm:rounded-xl text-[10px] sm:text-xs text-slate-900 dark:text-white"
                value={customRange.end}
                onChange={(e) => setCustomRange({...customRange, end: e.target.value})}
                title="Fecha final"
                aria-label="Fecha final"
              />
            </div>
          )}

          <div className="flex items-center gap-2 w-full sm:w-auto justify-center sm:justify-start">
            <button
              type="button"
              onClick={() => setQuickExpenseFilter('all')}
              className={cn(
                "px-3 py-2 rounded-xl text-[10px] sm:text-xs font-black uppercase tracking-wider border transition-all",
                quickExpenseFilter === 'all'
                  ? "bg-slate-900 text-white border-slate-900"
                  : "bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-300 border-slate-200 dark:border-slate-700"
              )}
            >
              Todo
            </button>
            <button
              type="button"
              onClick={() => setQuickExpenseFilter('admin')}
              className={cn(
                "px-3 py-2 rounded-xl text-[10px] sm:text-xs font-black uppercase tracking-wider border transition-all",
                quickExpenseFilter === 'admin'
                  ? "bg-violet-600 text-white border-violet-600"
                  : "bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-300 border-slate-200 dark:border-slate-700"
              )}
            >
              Administrativos
            </button>
            <button
              type="button"
              onClick={() => setQuickExpenseFilter('personal')}
              className={cn(
                "px-3 py-2 rounded-xl text-[10px] sm:text-xs font-black uppercase tracking-wider border transition-all",
                quickExpenseFilter === 'personal'
                  ? "bg-amber-600 text-white border-amber-600"
                  : "bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-300 border-slate-200 dark:border-slate-700"
              )}
            >
              Personales
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto justify-center sm:justify-start">
            <span className={cn(
              ADAPTIVE_CHIP_CLASS,
              "px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider border",
              adminTrafficLight.classes
            )}>
              Admin {adminTrafficLight.label}: {activeProjectsProfit > 0 ? `${adminExpenseVsProfit.toFixed(1)}%` : 'N/A'}
            </span>
            <span className={cn(
              ADAPTIVE_CHIP_CLASS,
              "px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider border",
              personalTrafficLight.classes
            )}>
              Personal {personalTrafficLight.label}: {activeProjectsProfit > 0 ? `${personalExpenseVsProfit.toFixed(1)}%` : 'N/A'}
            </span>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-center gap-3 sm:gap-4 w-full md:w-auto">
          <div className="text-[10px] sm:text-sm text-slate-500 font-bold uppercase tracking-wider text-center sm:text-left">
            {filteredTransactions.length} transacciones
          </div>
          <div className="grid grid-cols-2 gap-2 w-full sm:w-auto">
            <button 
              onClick={handleGenerateMonthlyReport}
              className="flex items-center justify-center gap-2 px-3 py-2 bg-primary-light dark:bg-primary/10 text-primary text-[10px] sm:text-xs font-black uppercase tracking-widest rounded-lg sm:rounded-xl hover:bg-primary-light/80 dark:hover:bg-primary/20 transition-all border border-primary-light dark:border-primary/20"
            >
              <FileBarChart size={14} />
              PDF
            </button>
            <button 
              onClick={handleExportCSV}
              className="flex items-center justify-center gap-2 px-3 py-2.5 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 text-xs font-black uppercase tracking-widest rounded-xl hover:bg-emerald-100 dark:hover:bg-emerald-500/20 transition-all border border-emerald-100 dark:border-emerald-500/20"
            >
              <Download size={16} />
              CSV
            </button>
          </div>
        </div>
      </div>

      {/* Project KPIs Table */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800 overflow-hidden mb-8 min-w-0">
        <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center gap-3">
          <div className="p-2 bg-primary/10 text-primary rounded-lg">
            <TrendingUp size={20} />
          </div>
          <h3 className="text-lg font-bold text-slate-900 dark:text-white">KPIs por Proyecto</h3>
        </div>
        <div className="overflow-x-hidden">
          <table className="w-full text-left table-fixed">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-100 dark:border-slate-800">
                <th className="px-3 lg:px-4 py-4 text-micro font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider w-[30%]">Proyecto</th>
                <th className="px-3 lg:px-4 py-4 text-micro font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-right w-[14%]">Ingresos</th>
                <th className="px-3 lg:px-4 py-4 text-micro font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-right w-[14%]">Gastos</th>
                <th className="px-3 lg:px-4 py-4 text-micro font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-right w-[14%]">Utilidad</th>
                <th className="px-3 lg:px-4 py-4 text-micro font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-right w-[12%]">Margen</th>
                <th className="px-3 lg:px-4 py-4 text-micro font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-right w-[16%]">Costo/m²</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
              {projectKPIs.map(kpi => (
                <tr key={kpi.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-all duration-200 group">
                  <td className="px-3 lg:px-4 py-4 align-top">
                    <p className="text-sm font-bold text-slate-900 dark:text-white group-hover:text-primary transition-colors break-words">{kpi.name}</p>
                    <p className="text-micro font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">{kpi.area} m²</p>
                  </td>
                  <td className="px-3 lg:px-4 py-4 text-right text-xs lg:text-sm font-bold text-emerald-600">{formatCurrency(kpi.income)}</td>
                  <td className="px-3 lg:px-4 py-4 text-right text-xs lg:text-sm font-bold text-rose-600">{formatCurrency(kpi.expense)}</td>
                  <td className={cn(
                    "px-3 lg:px-4 py-4 text-right text-xs lg:text-sm font-bold",
                    kpi.profit >= 0 ? "text-emerald-600" : "text-rose-600"
                  )}>
                    {formatCurrency(kpi.profit)}
                  </td>
                  <td className="px-3 lg:px-4 py-4 text-right">
                    <span className={cn(
                      ADAPTIVE_CHIP_CLASS,
                      "px-2 py-1 rounded-full text-micro font-bold uppercase tracking-wider border",
                      kpi.profitMargin >= 20 ? "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 border-emerald-100 dark:border-emerald-500/20" : 
                      kpi.profitMargin >= 10 ? "bg-blue-50 dark:bg-blue-500/10 text-blue-600 border-blue-100 dark:border-blue-500/20" : 
                      "bg-rose-50 dark:bg-rose-500/10 text-rose-600 border-rose-100 dark:border-rose-500/20"
                    )}>
                      {kpi.profitMargin.toFixed(1)}%
                    </span>
                  </td>
                  <td className="px-3 lg:px-4 py-4 text-right text-xs lg:text-sm font-bold text-slate-900 dark:text-white">
                    {kpi.costPerM2 > 0 ? formatCurrency(kpi.costPerM2) : 'N/A'}
                  </td>
                </tr>
              ))}
              {projectKPIs.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-slate-400 dark:text-slate-500 italic">No hay datos de proyectos disponibles</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800 overflow-hidden min-w-0">
        <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center gap-3">
          <div className="p-2 bg-primary/10 text-primary rounded-lg">
            <HandCoins size={20} />
          </div>
          <h3 className="text-lg font-bold text-slate-900 dark:text-white">Transacciones Recientes</h3>
        </div>
        <div className="overflow-x-hidden hidden md:block">
          <table className="w-full text-left table-fixed">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-100 dark:border-slate-800">
                <th className="px-3 lg:px-4 py-4 text-micro font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider w-[9%]">Fecha</th>
                <th className="px-3 lg:px-4 py-4 text-micro font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider w-[16%]">Proyecto</th>
                <th className="px-3 lg:px-4 py-4 text-micro font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider w-[13%]">Cuenta</th>
                <th className="px-3 lg:px-4 py-4 text-micro font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider w-[16%]">Origen/Fuente</th>
                <th className="px-3 lg:px-4 py-4 text-micro font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider w-[14%]">Categoría</th>
                <th className="px-3 lg:px-4 py-4 text-micro font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider w-[18%]">Descripción</th>
                <th className="px-3 lg:px-4 py-4 text-micro font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-right w-[10%]">Monto</th>
                <th className="px-3 lg:px-4 py-4 text-micro font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-right w-[4%]">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
              {filteredTransactions.map((t) => (
                <tr key={t.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-all duration-200 group">
                  <td className="px-3 lg:px-4 py-4 text-xs text-slate-600 dark:text-slate-400 align-top">{formatDate(t.date)}</td>
                  <td className="px-3 lg:px-4 py-4 align-top">
                    <span className="text-xs lg:text-sm font-bold text-slate-900 dark:text-white group-hover:text-primary transition-colors break-words">
                      {projects.find(p => p.id === t.projectId)?.name || 'N/A'}
                    </span>
                  </td>
                  <td className="px-3 lg:px-4 py-4 align-top">
                    <span className={cn(
                      ADAPTIVE_CHIP_CLASS,
                      "text-micro font-bold uppercase tracking-wider px-2 py-1 rounded-full border",
                      t.accountType === 'owner'
                        ? "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/30"
                        : "bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-500/30"
                    )}>
                      {t.accountType === 'owner' ? 'Ganancias Propietario' : 'Proyecto'}
                    </span>
                  </td>
                  <td className="px-3 lg:px-4 py-4 text-[11px] text-slate-500 dark:text-slate-400 break-words align-top">
                    {(t.type === 'Income' ? t.incomeOrigin : t.fundingSource) || 'N/A'}
                  </td>
                  <td className="px-3 lg:px-4 py-4 align-top">
                    <span className={cn(ADAPTIVE_CHIP_CLASS, "text-micro font-bold uppercase tracking-wider px-2 py-1 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded-full border border-slate-200 dark:border-slate-700")}>
                      {t.category}
                    </span>
                  </td>
                  <td className="px-3 lg:px-4 py-4 text-xs text-slate-500 dark:text-slate-400 break-words align-top">{t.description}</td>
                  <td className="px-3 lg:px-4 py-4 text-right align-top">
                    <div className={cn(
                      "flex items-center justify-end gap-1 font-bold",
                      t.type === 'Income' ? "text-emerald-600" : "text-rose-600"
                    )}>
                      {t.type === 'Income' ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                      {formatCurrency(t.amount)}
                    </div>
                  </td>
                  <td className="px-3 lg:px-4 py-4 text-right align-top">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => handleEditTransaction(t)}
                        className="p-1.5 text-slate-400 hover:text-primary transition-colors"
                        title="Editar"
                      >
                        <Pencil size={15} />
                      </button>
                      <button 
                        onClick={() => handleDeleteTransaction(t.id)}
                        className="p-1.5 text-slate-400 hover:text-rose-600 transition-colors"
                        title="Eliminar"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filteredTransactions.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-6 py-12 text-center text-slate-400 dark:text-slate-500 italic">No se encontraron transacciones</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile Card View */}
        <div className="md:hidden divide-y divide-slate-100 dark:divide-slate-800">
          {filteredTransactions.map(t => (
            <div key={t.id} className="p-4 space-y-3">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-sm font-bold text-slate-900 dark:text-white">
                    {projects.find(p => p.id === t.projectId)?.name || 'N/A'}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{formatDate(t.date)}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    {t.accountType === 'owner' ? 'Cuenta: Ganancias del Propietario' : 'Cuenta: Proyecto'}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    {t.type === 'Income' ? `Origen: ${t.incomeOrigin || 'N/A'}` : `Fuente: ${t.fundingSource || 'N/A'}`}
                  </p>
                </div>
                <div className={cn(ADAPTIVE_CHIP_CLASS, "text-micro font-bold uppercase tracking-wider px-2 py-1 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded-full border border-slate-200 dark:border-slate-700")}>
                  {t.category}
                </div>
              </div>
              <p className="text-sm text-slate-500 dark:text-slate-400">{t.description}</p>
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => handleEditTransaction(t)}
                  className="p-2 text-slate-400 hover:text-primary transition-colors"
                  title="Editar"
                >
                  <Pencil size={18} />
                </button>
                <button 
                  onClick={() => handleDeleteTransaction(t.id)}
                  className="p-2 text-slate-400 hover:text-rose-600 transition-colors"
                  title="Eliminar"
                >
                  <Trash2 size={18} />
                </button>
                <div className={cn(
                  "flex items-center gap-1 font-black text-lg",
                  t.type === 'Income' ? "text-emerald-600" : "text-rose-600"
                )}>
                  {t.type === 'Income' ? <ArrowUpRight size={18} /> : <ArrowDownRight size={18} />}
                  {formatCurrency(t.amount)}
                </div>
              </div>
            </div>
          ))}
          {filteredTransactions.length === 0 && (
            <div className="p-8 text-center text-slate-400 dark:text-slate-500 italic">No se encontraron transacciones</div>
          )}
        </div>
        {hasMore && (
          <div className="p-4 border-t border-slate-100 dark:border-slate-800 flex justify-center">
            <button
              onClick={loadMoreTransactions}
              disabled={isLoadingMore}
              className="px-6 py-2 text-sm font-bold text-primary hover:bg-primary/5 rounded-xl transition-all disabled:opacity-50 flex items-center gap-2"
            >
              {isLoadingMore ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
                  Cargando...
                </>
              ) : (
                'Cargar más transacciones'
              )}
            </button>
          </div>
        )}
      </div>

      <FormModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          resetTransactionForm();
        }}
        title={editingTransactionId ? 'Editar Registro Financiero' : 'Nuevo Registro Financiero'}
        maxWidth="max-w-2xl"
        fullVertical
        closeOnOverlayClick={false}
        footer={
          <div className="flex flex-col sm:flex-row justify-between items-center gap-4 w-full">
            <div className="flex gap-2 order-2 sm:order-1">
              <button 
                type="button"
                onClick={() => {
                  setIsModalOpen(false);
                    resetTransactionForm();
                }}
                className="px-6 py-3 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 transition-all"
              >
                Cancelar
              </button>
            </div>
            <div className="flex gap-3 w-full sm:w-auto order-1 sm:order-2">
              {currentStep > 0 && (
                <button 
                  type="button"
                  onClick={() => setCurrentStep(prev => prev - 1)}
                  className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-6 py-3 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold rounded-xl hover:bg-slate-200 dark:hover:bg-slate-700 transition-all border border-slate-200 dark:border-slate-700"
                >
                  <ChevronLeft size={18} />
                  Anterior
                </button>
              )}
              {currentStep < 1 ? (
                <button 
                  type="button"
                  onClick={() => {
                    if (newTransaction.accountType === 'project' && !newTransaction.projectId) {
                      toast.error('Por favor seleccione un proyecto');
                      return;
                    }
                    if (newTransaction.type === 'Income' && newTransaction.accountType === 'owner' && !newTransaction.incomeOrigin) {
                      toast.error('Seleccione el origen del ingreso');
                      return;
                    }
                    if (newTransaction.type === 'Expense' && !newTransaction.fundingSource) {
                      toast.error('Seleccione la fuente de fondos del gasto');
                      return;
                    }
                    setCurrentStep(prev => prev + 1);
                  }}
                  className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-8 py-3 bg-primary text-white font-bold rounded-xl hover:bg-primary-hover transition-all shadow-lg shadow-primary-shadow group"
                >
                  Siguiente
                  <ChevronRight size={18} className="group-hover:translate-x-1 transition-transform" />
                </button>
              ) : (
                <button 
                  type="submit"
                  form="transaction-form"
                  className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-10 py-3 bg-primary text-white font-bold rounded-xl hover:bg-primary-hover transition-all shadow-lg shadow-primary-shadow"
                >
                  {editingTransactionId ? 'Guardar Cambios' : 'Guardar Registro'}
                  <CheckCircle2 size={18} />
                </button>
              )}
            </div>
          </div>
        }
      >
        <StepForm
          formId="transaction-form"
          currentStep={currentStep}
          onStepChange={setCurrentStep}
          onSubmit={handleSubmitTransaction}
          steps={[
            {
              title: "Clasificación",
              content: (
                <FormSection title="Origen de Fondos" icon={Info} description="Define cuenta, origen del ingreso y fuente de fondos para gastos">
                  <FormSelect
                    label="Cuenta de Movimiento"
                    value={newTransaction.accountType}
                    onChange={(e) => {
                      const accountType = e.target.value as 'project' | 'owner';
                      setNewTransaction({
                        ...newTransaction,
                        accountType,
                        projectId: accountType === 'owner' ? '' : newTransaction.projectId,
                        budgetItemId: accountType === 'owner' ? '' : newTransaction.budgetItemId,
                        incomeOrigin: accountType === 'owner' ? (newTransaction.incomeOrigin || OWNER_SERVICE_ORIGINS[0]) : 'Proyectos en ejecución',
                        fundingSource: accountType === 'owner' ? OWNER_FUNDING_SOURCES[0] : newTransaction.fundingSource,
                      });
                    }}
                  >
                    <option value="project">Proyecto</option>
                    <option value="owner">Ganancias del Propietario</option>
                  </FormSelect>
                  <FormSelect 
                    label="Proyecto"
                    required={newTransaction.accountType === 'project'}
                    value={newTransaction.projectId}
                    onChange={(e) => setNewTransaction({...newTransaction, projectId: e.target.value})}
                    disabled={newTransaction.accountType === 'owner'}
                  >
                    <option value="">{newTransaction.accountType === 'owner' ? 'No aplica (Cuenta Propietario)' : 'Seleccionar Proyecto'}</option>
                    {projects.map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </FormSelect>
                  <FormSelect 
                    label="Renglón de Presupuesto (Opcional)"
                    value={newTransaction.budgetItemId}
                    onChange={(e) => setNewTransaction({...newTransaction, budgetItemId: e.target.value})}
                    disabled={!newTransaction.projectId || newTransaction.accountType === 'owner'}
                  >
                    <option value="">General / No especificado</option>
                    {budgetItems.map(item => (
                      <option key={item.id} value={item.id}>{item.order}. {item.description}</option>
                    ))}
                  </FormSelect>
                  <FormSelect 
                    label="Tipo de Transacción"
                    value={newTransaction.type}
                    onChange={(e) => {
                      const type = e.target.value;
                      setNewTransaction({
                        ...newTransaction, 
                        type,
                        category: type === 'Income' ? INCOME_CATEGORIES[0] : ALL_EXPENSE_CATEGORIES[0],
                        incomeOrigin: type === 'Income' ? (newTransaction.incomeOrigin || OWNER_SERVICE_ORIGINS[0]) : newTransaction.incomeOrigin,
                        fundingSource: type === 'Expense' ? (newTransaction.fundingSource || OWNER_FUNDING_SOURCES[0]) : newTransaction.fundingSource,
                      });
                    }}
                  >
                    <option value="Expense">Gasto (-)</option>
                    <option value="Income">Ingreso (+)</option>
                  </FormSelect>
                  {newTransaction.type === 'Income' && (
                    <FormSelect
                      label="Origen del Ingreso"
                      value={newTransaction.incomeOrigin}
                      onChange={(e) => setNewTransaction({ ...newTransaction, incomeOrigin: e.target.value })}
                    >
                      {OWNER_SERVICE_ORIGINS.map((origin) => (
                        <option key={origin} value={origin}>{origin}</option>
                      ))}
                    </FormSelect>
                  )}
                  {newTransaction.type === 'Expense' && (
                    <FormSelect
                      label="Fuente de Fondos para Gasto"
                      value={newTransaction.fundingSource}
                      onChange={(e) => setNewTransaction({ ...newTransaction, fundingSource: e.target.value })}
                    >
                      {OWNER_FUNDING_SOURCES.map((source) => (
                        <option key={source} value={source}>{source}</option>
                      ))}
                    </FormSelect>
                  )}
                </FormSection>
              )
            },
            {
              title: "Detalles",
              content: (
                <FormSection title="Información del Movimiento" icon={DollarSign} description="Monto y descripción de la transacción">
                  <FormInput 
                    label="Monto (GTQ)"
                    required
                    type="number" 
                    min="0"
                    step="any"
                    value={newTransaction.amount}
                    onChange={(e) => setNewTransaction({...newTransaction, amount: e.target.value})}
                  />
                  <FormSelect 
                    label="Categoría"
                    required
                    value={newTransaction.category}
                    onChange={(e) => setNewTransaction({...newTransaction, category: e.target.value})}
                  >
                    {(newTransaction.type === 'Income' ? INCOME_CATEGORIES : ALL_EXPENSE_CATEGORIES).map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </FormSelect>
                  <FormInput 
                    label="Fecha"
                    required
                    type="date" 
                    value={newTransaction.date}
                    onChange={(e) => setNewTransaction({...newTransaction, date: e.target.value})}
                  />
                  <div className="space-y-2 group">
                    <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] ml-1 group-focus-within:text-primary transition-colors">
                      Descripción Detallada
                    </label>
                    <textarea 
                      className="w-full px-5 py-4 bg-white dark:bg-slate-900 border-2 border-slate-100 dark:border-slate-800 rounded-2xl focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/5 transition-all font-medium text-slate-900 dark:text-white h-32 resize-none"
                      value={newTransaction.description}
                      onChange={(e) => setNewTransaction({...newTransaction, description: e.target.value})}
                      placeholder="Detalles adicionales de la transacción..."
                    ></textarea>
                  </div>
                </FormSection>
              )
            }
          ]}
        />
      </FormModal>

    </div>
  );
}
