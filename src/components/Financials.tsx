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
  Trash2
} from 'lucide-react';
import ConfirmModal from './ConfirmModal';
import { StepForm, FormSection, FormInput, FormSelect } from './FormLayout';
import { formatCurrency, formatDate, cn } from '../lib/utils';
import { logAction } from '../lib/audit';
import { drawLogo } from '../lib/pdfUtils';
import { FormModal } from './FormModal';
import { toast } from 'sonner';
import { createTransaction, deleteTransactionById, listTransactions } from '../lib/financialsApi';
import { listBudgetItems, listProjects } from '../lib/projectsApi';
import { GoogleGenAI, Type } from "@google/genai";
import { 
  AreaChart, 
  Area, 
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

const INCOME_CATEGORIES = [
  'Venta de Inmueble',
  'Anticipo de Cliente',
  'Pago por Avance',
  'Inversión Propia',
  'Otros'
];

export default function Financials() {
  const PAGE_SIZE = 50;
  const [transactions, setTransactions] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [filterProject, setFilterProject] = useState('all');
  const [dateFilter, setDateFilter] = useState('all'); // all, week, month, custom
  const [customRange, setCustomRange] = useState({ start: '', end: '' });
  
  const [budgetItems, setBudgetItems] = useState<any[]>([]);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [transactionToDelete, setTransactionToDelete] = useState<string | null>(null);
  
  const [newTransaction, setNewTransaction] = useState({
    projectId: '',
    budgetItemId: '',
    type: 'Expense',
    category: EXPENSE_CATEGORIES[0],
    amount: '',
    date: new Date().toISOString().split('T')[0],
    description: ''
  });

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
        const [response, projectItems] = await Promise.all([
          listTransactions({ limit: PAGE_SIZE, offset: 0 }),
          listProjects(),
        ]);
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

    const headers = ['Fecha', 'Proyecto', 'Tipo', 'Categoría', 'Descripción', 'Monto (GTQ)'];
    const rows = filteredTransactions.map(t => [
      t.date,
      projects.find(p => p.id === t.projectId)?.name || 'N/A',
      t.type === 'Income' ? 'Ingreso' : 'Gasto',
      t.category,
      t.description.replace(/,/g, ';'), // Avoid CSV break
      t.amount
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.join(','))
    ].join('\n');

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
    
    // Header
    doc.setFillColor(30, 41, 59);
    doc.rect(0, 0, 210, 40, 'F');
    
    // Draw Logo in Header
    drawLogo(doc, 20, 10, 1.5);
    
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`Generado el: ${format(now, "dd 'de' MMMM, yyyy", { locale: es })}`, 20, 32);

    // Comparison Table
    const tableData = [
      ['Concepto', format(prevMonthStart, 'MMMM yyyy', { locale: es }).toUpperCase(), format(currentMonthStart, 'MMMM yyyy', { locale: es }).toUpperCase(), 'Variación'],
      ['Ingresos Totales', formatCurrency(prevIncome), formatCurrency(currentIncome), `${(((currentIncome - prevIncome) / (prevIncome || 1)) * 100).toFixed(1)}%`],
      ['Gastos Totales', formatCurrency(prevExpense), formatCurrency(currentExpense), `${(((currentExpense - prevExpense) / (prevExpense || 1)) * 100).toFixed(1)}%`],
      ['Balance Neto', formatCurrency(prevBalance), formatCurrency(currentBalance), `${(((currentBalance - prevBalance) / (Math.abs(prevBalance) || 1)) * 100).toFixed(1)}%`]
    ];

    autoTable(doc, {
      startY: 50,
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
    const chartStartY = (doc as any).lastAutoTable.finalY + 15;
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
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      
      // Prepare data for AI
      const recentTransactions = transactions.slice(0, 20).map(t => ({
        date: t.date,
        type: t.type,
        category: t.category,
        amount: t.amount,
        description: t.description
      }));

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
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
      console.error('Error generating AI analysis:', error);
      toast.error('Error al generar análisis con IA');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDeleteTransaction = (id: string) => {
    setTransactionToDelete(id);
    setIsDeleteConfirmOpen(true);
  };

  const confirmDeleteTransaction = async () => {
    if (!transactionToDelete) return;
    try {
      const transaction = transactions.find(t => t.id === transactionToDelete);
      await deleteTransactionById(transactionToDelete);
      setTransactions(prev => prev.filter(t => t.id !== transactionToDelete));
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

  const handleAddTransaction = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    
    // Validation
    if (!newTransaction.projectId) return toast.error('Por favor seleccione un proyecto');
    if (!newTransaction.category) return toast.error('Por favor ingrese una categoría');
    if (!newTransaction.amount || Number(newTransaction.amount) <= 0) return toast.error('Por favor ingrese un monto válido');
    if (!newTransaction.date) return toast.error('Por favor seleccione una fecha');

    if (!newTransaction.amount || isNaN(Number(newTransaction.amount)) || Number(newTransaction.amount) <= 0) {
      toast.error('Por favor ingrese un monto válido y mayor a cero.');
      return;
    }

    try {
      const created = await createTransaction({
        ...newTransaction,
        type: newTransaction.type as 'Income' | 'Expense',
        amount: Number(newTransaction.amount)
      });
      setTransactions(prev => [created, ...prev]);
      setOffset(prev => prev + 1);
      toast.success('Transacción registrada con éxito');
      await logAction('Registro de Transacción', 'Finanzas', `${newTransaction.type === 'Income' ? 'Ingreso' : 'Egreso'} de ${formatCurrency(Number(newTransaction.amount))} registrado`, 'create', { transactionId: created.id });
      setIsModalOpen(false);
      setNewTransaction({
        projectId: '',
        budgetItemId: '',
        type: 'Expense',
        category: '',
        amount: '',
        date: new Date().toISOString().split('T')[0],
        description: ''
      });
    } catch (error) {
      toast.error('Error al registrar transacción', {
        description: error instanceof Error ? error.message : String(error),
      });
    }
  };

  const projectKPIs = useMemo(() => {
    return projects.map(project => {
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
    const categories = EXPENSE_CATEGORIES;
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
    const recentProjects = projects.map(project => {
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

  const filteredTransactions = transactions.filter(t => {
    const matchesProject = filterProject === 'all' || t.projectId === filterProject;
    
    let matchesDate = true;
    const tDate = parseISO(t.date);
    const now = new Date();

    if (dateFilter === 'week') {
      matchesDate = isWithinInterval(tDate, { start: startOfWeek(now), end: endOfWeek(now) });
    } else if (dateFilter === 'month') {
      matchesDate = isWithinInterval(tDate, { start: startOfMonth(now), end: endOfMonth(now) });
    } else if (dateFilter === 'custom' && customRange.start && customRange.end) {
      matchesDate = isWithinInterval(tDate, { 
        start: parseISO(customRange.start), 
        end: parseISO(customRange.end) 
      });
    }

    return matchesProject && matchesDate;
  });

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

  const totalIncome = filteredTransactions.filter(t => t.type === 'Income').reduce((acc, t) => acc + t.amount, 0);
  const totalExpense = filteredTransactions.filter(t => t.type === 'Expense').reduce((acc, t) => acc + t.amount, 0);
  const balance = totalIncome - totalExpense;

  // KPIs
  const profitMargin = totalIncome > 0 ? (balance / totalIncome) * 100 : 0;
  
  const selectedProjectData = filterProject !== 'all' ? projects.find(p => p.id === filterProject) : null;
  const projectArea = selectedProjectData?.area || 0;
  const costPerM2 = projectArea > 0 ? totalExpense / projectArea : 0;

  return (
    <div className="space-y-8">
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
                <button onClick={() => setIsAnalysisModalOpen(false)} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors">
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

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800 relative overflow-hidden group flex flex-col items-center sm:items-start text-center sm:text-left">
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:scale-110 transition-transform duration-500 hidden sm:block">
            <TrendingUp size={64} className="text-emerald-600" />
          </div>
          <div className="flex flex-col sm:flex-row items-center gap-3 mb-4">
            <div className="p-2 bg-emerald-100 dark:bg-emerald-500/10 text-emerald-600 rounded-lg">
              <TrendingUp size={20} />
            </div>
            <p className="text-micro text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider">Ingresos Totales</p>
          </div>
          <p className="text-2xl font-bold text-emerald-600">{formatCurrency(totalIncome)}</p>
        </div>

        <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800 relative overflow-hidden group flex flex-col items-center sm:items-start text-center sm:text-left">
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:scale-110 transition-transform duration-500 hidden sm:block">
            <TrendingDown size={64} className="text-rose-600" />
          </div>
          <div className="flex flex-col sm:flex-row items-center gap-3 mb-4">
            <div className="p-2 bg-rose-100 dark:bg-rose-500/10 text-rose-600 rounded-lg">
              <TrendingDown size={20} />
            </div>
            <p className="text-micro text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider">Gastos Totales</p>
          </div>
          <p className="text-2xl font-bold text-rose-600">{formatCurrency(totalExpense)}</p>
        </div>

        <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800 relative overflow-hidden group flex flex-col items-center sm:items-start text-center sm:text-left">
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:scale-110 transition-transform duration-500 hidden sm:block">
            <HandCoins size={64} className={balance >= 0 ? "text-emerald-600" : "text-rose-600"} />
          </div>
          <div className="flex flex-col sm:flex-row items-center gap-3 mb-4">
            <div className="p-2 bg-blue-100 dark:bg-blue-500/10 text-blue-600 rounded-lg">
              <HandCoins size={20} />
            </div>
            <p className="text-micro text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider">Balance Neto</p>
          </div>
          <p className={cn(
            "text-2xl font-bold",
            balance >= 0 ? "text-emerald-600" : "text-rose-600"
          )}>{formatCurrency(balance)}</p>
        </div>

        <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800 relative overflow-hidden group flex flex-col items-center sm:items-start text-center sm:text-left">
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:scale-110 transition-transform duration-500 hidden sm:block">
            <Percent size={64} className="text-amber-600" />
          </div>
          <div className="flex flex-col sm:flex-row items-center gap-3 mb-4">
            <div className="p-2 bg-amber-100 dark:bg-amber-500/10 text-amber-600 rounded-lg">
              <Percent size={20} />
            </div>
            <p className="text-micro text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider">Margen de Ganancia</p>
          </div>
          <div className="flex items-baseline gap-2">
            <p className={cn(
              "text-2xl font-bold",
              profitMargin >= 20 ? "text-emerald-600" : profitMargin >= 10 ? "text-amber-600" : "text-rose-600"
            )}>{profitMargin.toFixed(1)}%</p>
            <span className="text-micro font-bold text-slate-400 dark:text-slate-500 uppercase">Sobre Ingresos</span>
          </div>
        </div>
      </div>

      {/* Insights Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
        {/* Budget Deviations */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="bg-white dark:bg-slate-900 rounded-3xl p-8 border border-slate-100 dark:border-slate-800 shadow-sm"
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

          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-8 mb-6 sm:mb-8">
        <div className="lg:col-span-2 bg-white dark:bg-slate-900 p-4 sm:p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800">
          <div className="flex items-center justify-between mb-4 sm:mb-6">
            <div>
              <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">Tendencia Financiera</h3>
              <p className="text-[10px] sm:text-xs text-slate-500 font-bold uppercase tracking-widest mt-1">Últimos 30 días</p>
            </div>
            <div className="hidden sm:flex items-center gap-4 text-micro font-bold uppercase tracking-wider">
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-full bg-emerald-500"></div>
                <span className="text-slate-500 dark:text-slate-400">Ingresos</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-full bg-rose-500"></div>
                <span className="text-slate-500 dark:text-slate-400">Gastos</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-full bg-blue-500"></div>
                <span className="text-slate-500 dark:text-slate-400">Balance Neto</span>
              </div>
            </div>
          </div>
          <div className="h-64 sm:h-80">
            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
              <AreaChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorIngresos" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3CB44B" stopOpacity={0.1}/>
                    <stop offset="95%" stopColor="#3CB44B" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorGastos" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#E6194B" stopOpacity={0.1}/>
                    <stop offset="95%" stopColor="#E6194B" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorBalance" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#4363D8" stopOpacity={0.2}/>
                    <stop offset="95%" stopColor="#4363D8" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" className="dark:stroke-slate-800" />
                <XAxis 
                  dataKey="date" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fill: '#64748b', fontSize: 10 }}
                  minTickGap={30}
                  dy={10}
                />
                <YAxis 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fill: '#64748b', fontSize: 10 }}
                  tickFormatter={(value) => `Q${value >= 1000 ? (value/1000).toFixed(1) + 'k' : value}`}
                />
                <Tooltip 
                  contentStyle={{ 
                    borderRadius: '16px', 
                    border: 'none', 
                    boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)',
                    padding: '12px',
                    backgroundColor: 'rgba(255, 255, 255, 0.95)',
                    backdropFilter: 'blur(8px)'
                  }}
                  itemStyle={{ padding: '2px 0' }}
                  formatter={(value: number, name: string) => [
                    <span className="font-bold text-slate-900">{formatCurrency(value)}</span>,
                    <span className="text-slate-500 font-medium">{name}</span>
                  ]}
                  labelStyle={{ fontWeight: 'bold', marginBottom: '8px', color: '#1e293b' }}
                  cursor={{ stroke: '#cbd5e1', strokeWidth: 2, strokeDasharray: '5 5' }}
                />
                <Area 
                  type="monotone" 
                  dataKey="ingresos" 
                  stroke="#3CB44B" 
                  strokeWidth={2}
                  fillOpacity={1} 
                  fill="url(#colorIngresos)" 
                  name="Ingresos" 
                  activeDot={{ r: 6, strokeWidth: 0, fill: '#3CB44B' }}
                />
                <Area 
                  type="monotone" 
                  dataKey="gastos" 
                  stroke="#E6194B" 
                  strokeWidth={2}
                  fillOpacity={1} 
                  fill="url(#colorGastos)" 
                  name="Gastos" 
                  activeDot={{ r: 6, strokeWidth: 0, fill: '#E6194B' }}
                />
                <Area 
                  type="monotone" 
                  dataKey="profit" 
                  stroke="#4363D8" 
                  strokeWidth={3}
                  fillOpacity={1} 
                  fill="url(#colorBalance)" 
                  name="Balance Neto" 
                  activeDot={{ r: 8, strokeWidth: 2, stroke: '#fff', fill: '#4363D8' }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-4 sm:p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800">
          <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white mb-4 sm:mb-6">Gastos por Categoría</h3>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-8 items-center">
            <div className="h-48 sm:h-64">
              <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                <PieChart margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                  <Pie
                    data={expenseByCategoryData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
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
              </ResponsiveContainer>
            </div>
            <div className="space-y-3 max-h-64 overflow-y-auto pr-2 custom-scrollbar">
              {expenseByCategoryData.map((entry, index) => (
                <div key={entry.name} className="flex items-center justify-between p-2 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors group">
                  <div className="flex items-center gap-3">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }}></div>
                    <span className="text-xs font-bold text-slate-600 dark:text-slate-400 group-hover:text-slate-900 dark:group-hover:text-white transition-colors uppercase tracking-wider">{entry.name}</span>
                  </div>
                  <span className="text-xs font-black text-slate-900 dark:text-white">{formatCurrency(entry.value)}</span>
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
              />
              <span className="text-slate-400">-</span>
              <input 
                type="date" 
                className="flex-1 sm:w-32 px-2 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg sm:rounded-xl text-[10px] sm:text-xs text-slate-900 dark:text-white"
                value={customRange.end}
                onChange={(e) => setCustomRange({...customRange, end: e.target.value})}
              />
            </div>
          )}
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
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800 overflow-hidden mb-8">
        <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center gap-3">
          <div className="p-2 bg-primary/10 text-primary rounded-lg">
            <TrendingUp size={20} />
          </div>
          <h3 className="text-lg font-bold text-slate-900 dark:text-white">KPIs por Proyecto</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-100 dark:border-slate-800">
                <th className="px-6 py-4 text-micro font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Proyecto</th>
                <th className="px-6 py-4 text-micro font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-right">Ingresos</th>
                <th className="px-6 py-4 text-micro font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-right">Gastos</th>
                <th className="px-6 py-4 text-micro font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-right">Utilidad</th>
                <th className="px-6 py-4 text-micro font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-right">Margen</th>
                <th className="px-6 py-4 text-micro font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-right">Costo/m²</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
              {projectKPIs.map(kpi => (
                <tr key={kpi.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-all duration-200 group">
                  <td className="px-6 py-4">
                    <p className="text-sm font-bold text-slate-900 dark:text-white group-hover:text-primary transition-colors">{kpi.name}</p>
                    <p className="text-micro font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">{kpi.area} m²</p>
                  </td>
                  <td className="px-6 py-4 text-right text-sm font-bold text-emerald-600">{formatCurrency(kpi.income)}</td>
                  <td className="px-6 py-4 text-right text-sm font-bold text-rose-600">{formatCurrency(kpi.expense)}</td>
                  <td className={cn(
                    "px-6 py-4 text-right text-sm font-bold",
                    kpi.profit >= 0 ? "text-emerald-600" : "text-rose-600"
                  )}>
                    {formatCurrency(kpi.profit)}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <span className={cn(
                      "px-2 py-1 rounded-full text-micro font-bold uppercase tracking-wider border",
                      kpi.profitMargin >= 20 ? "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 border-emerald-100 dark:border-emerald-500/20" : 
                      kpi.profitMargin >= 10 ? "bg-blue-50 dark:bg-blue-500/10 text-blue-600 border-blue-100 dark:border-blue-500/20" : 
                      "bg-rose-50 dark:bg-rose-500/10 text-rose-600 border-rose-100 dark:border-rose-500/20"
                    )}>
                      {kpi.profitMargin.toFixed(1)}%
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right text-sm font-bold text-slate-900 dark:text-white">
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

      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800 overflow-hidden">
        <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center gap-3">
          <div className="p-2 bg-primary/10 text-primary rounded-lg">
            <HandCoins size={20} />
          </div>
          <h3 className="text-lg font-bold text-slate-900 dark:text-white">Transacciones Recientes</h3>
        </div>
        <div className="overflow-x-auto hidden md:block">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-100 dark:border-slate-800">
                <th className="px-6 py-4 text-micro font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Fecha</th>
                <th className="px-6 py-4 text-micro font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Proyecto</th>
                <th className="px-6 py-4 text-micro font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Categoría</th>
                <th className="px-6 py-4 text-micro font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Descripción</th>
                <th className="px-6 py-4 text-micro font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-right">Monto</th>
                <th className="px-6 py-4 text-micro font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
              {filteredTransactions.map((t) => (
                <tr key={t.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-all duration-200 group">
                  <td className="px-6 py-4 text-sm text-slate-600 dark:text-slate-400">{formatDate(t.date)}</td>
                  <td className="px-6 py-4">
                    <span className="text-sm font-bold text-slate-900 dark:text-white group-hover:text-primary transition-colors">
                      {projects.find(p => p.id === t.projectId)?.name || 'N/A'}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-micro font-bold uppercase tracking-wider px-2 py-1 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded-full border border-slate-200 dark:border-slate-700">
                      {t.category}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-500 dark:text-slate-400 max-w-xs truncate">{t.description}</td>
                  <td className="px-6 py-4 text-right">
                    <div className={cn(
                      "flex items-center justify-end gap-1 font-bold",
                      t.type === 'Income' ? "text-emerald-600" : "text-rose-600"
                    )}>
                      {t.type === 'Income' ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                      {formatCurrency(t.amount)}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button 
                      onClick={() => handleDeleteTransaction(t.id)}
                      className="p-2 text-slate-400 hover:text-rose-600 transition-colors"
                      title="Eliminar"
                    >
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              ))}
              {filteredTransactions.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-slate-400 dark:text-slate-500 italic">No se encontraron transacciones</td>
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
                </div>
                <div className="text-micro font-bold uppercase tracking-wider px-2 py-1 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded-full border border-slate-200 dark:border-slate-700">
                  {t.category}
                </div>
              </div>
              <p className="text-sm text-slate-500 dark:text-slate-400">{t.description}</p>
              <div className="flex justify-end gap-2">
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
          setNewTransaction({
            projectId: '',
            budgetItemId: '',
            amount: '',
            type: 'Expense',
            category: '',
            description: '',
            date: new Date().toISOString().split('T')[0]
          });
          setCurrentStep(0);
        }}
        title="Nuevo Registro Financiero"
        maxWidth="max-w-2xl"
        fullVertical
        footer={
          <div className="flex flex-col sm:flex-row justify-between items-center gap-4 w-full">
            <div className="flex gap-2 order-2 sm:order-1">
              <button 
                type="button"
                onClick={() => {
                  setIsModalOpen(false);
                  setNewTransaction({
                    projectId: '',
                    budgetItemId: '',
                    amount: '',
                    type: 'Expense',
                    category: '',
                    description: '',
                    date: new Date().toISOString().split('T')[0]
                  });
                  setCurrentStep(0);
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
                    if (!newTransaction.projectId) {
                      toast.error('Por favor seleccione un proyecto');
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
                  Guardar Registro
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
          onSubmit={handleAddTransaction}
          steps={[
            {
              title: "Clasificación",
              content: (
                <FormSection title="Origen de Fondos" icon={Info} description="Vincular transacción a un proyecto">
                  <FormSelect 
                    label="Proyecto"
                    required
                    value={newTransaction.projectId}
                    onChange={(e) => setNewTransaction({...newTransaction, projectId: e.target.value})}
                  >
                    <option value="">Seleccionar Proyecto</option>
                    {projects.map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </FormSelect>
                  <FormSelect 
                    label="Renglón de Presupuesto (Opcional)"
                    value={newTransaction.budgetItemId}
                    onChange={(e) => setNewTransaction({...newTransaction, budgetItemId: e.target.value})}
                    disabled={!newTransaction.projectId}
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
                        category: type === 'Income' ? INCOME_CATEGORIES[0] : EXPENSE_CATEGORIES[0]
                      });
                    }}
                  >
                    <option value="Expense">Gasto (-)</option>
                    <option value="Income">Ingreso (+)</option>
                  </FormSelect>
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
                    {(newTransaction.type === 'Income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES).map(cat => (
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
