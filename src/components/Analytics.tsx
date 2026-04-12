import React, { useState, useMemo, useEffect } from 'react';
import { 
  BarChart3, 
  PieChart as PieChartIcon, 
  LineChart as LineChartIcon, 
  TrendingUp, 
  TrendingDown, 
  DollarSign, 
  Calendar,
  Filter,
  Download,
  ArrowUpRight,
  ArrowDownRight,
  Activity,
  Layers,
  Target,
  Sparkles,
  Loader2,
  X
} from 'lucide-react';
import { GoogleGenAI, Type } from "@google/genai";
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  LineChart, 
  Line, 
  AreaChart, 
  Area,
  PieChart,
  Pie,
  Cell,
  Legend
} from 'recharts';
import { motion, AnimatePresence } from 'motion/react';
import { cn, formatCurrency, handleApiError, OperationType } from '../lib/utils';
import { toast } from 'sonner';
import { listProjects } from '../lib/projectsApi';
import { listTransactions } from '../lib/financialsApi';
import { listRisks } from '../lib/risksApi';
import './Analytics.css';

export default function Analytics() {
  const [timeRange, setTimeRange] = useState('6m');
  const [projects, setProjects] = useState<any[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [risks, setRisks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [aiInsight, setAiInsight] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const loadAnalyticsData = async () => {
      try {
        const [projectsData, transactionsData, risksData] = await Promise.all([
          listProjects(),
          listTransactions({ limit: 2000, offset: 0 }),
          listRisks(),
        ]);

        if (cancelled) {
          return;
        }

        setProjects(projectsData);
        setTransactions(transactionsData.items);
        setRisks(risksData);
      } catch (error) {
        handleApiError(error, OperationType.GET, 'analytics');
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    loadAnalyticsData();

    return () => {
      cancelled = true;
    };
  }, []);

  const rangeStartDate = useMemo(() => {
    const now = new Date();
    const monthsByRange: Record<string, number> = {
      '1m': 1,
      '3m': 3,
      '6m': 6,
      '1y': 12,
    };

    const months = monthsByRange[timeRange] || 6;
    return new Date(now.getFullYear(), now.getMonth() - (months - 1), 1);
  }, [timeRange]);

  const filteredTransactions = useMemo(() => {
    return transactions.filter((item) => {
      const date = new Date(item.date);
      if (Number.isNaN(date.getTime())) return false;
      return date >= rangeStartDate;
    });
  }, [transactions, rangeStartDate]);

  const filteredProjects = useMemo(() => {
    return projects.filter((project) => {
      const candidateDate = project.startDate || project.createdAt || project.updatedAt;
      if (!candidateDate) return true;
      const parsed = new Date(candidateDate);
      if (Number.isNaN(parsed.getTime())) return true;
      return parsed >= rangeStartDate;
    });
  }, [projects, rangeStartDate]);

  const filteredRisks = useMemo(() => {
    return risks.filter((risk) => {
      const candidateDate = risk.date || risk.createdAt || risk.updatedAt;
      if (!candidateDate) return true;
      const parsed = new Date(candidateDate);
      if (Number.isNaN(parsed.getTime())) return true;
      return parsed >= rangeStartDate;
    });
  }, [risks, rangeStartDate]);

  const monthlyData = useMemo(() => {
    const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    const now = new Date();
    const monthsByRange: Record<string, number> = {
      '1m': 1,
      '3m': 3,
      '6m': 6,
      '1y': 12,
    };
    const totalMonths = monthsByRange[timeRange] || 6;

    const historicalMonths = Array.from({ length: totalMonths }).map((_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - ((totalMonths - 1) - i), 1);
      return {
        month: months[d.getMonth()],
        year: d.getFullYear(),
        monthIndex: d.getMonth(),
        income: 0,
        expense: 0,
        profit: 0
      };
    });

    filteredTransactions.forEach(t => {
      const tDate = new Date(t.date);
      const monthData = historicalMonths.find(m => m.monthIndex === tDate.getMonth() && m.year === tDate.getFullYear());
      if (monthData) {
        if (t.type === 'Income') monthData.income += (t.amount || 0);
        if (t.type === 'Expense') monthData.expense += (t.amount || 0);
      }
    });

    return historicalMonths.map(m => ({
      ...m,
      profit: m.income - m.expense
    }));
  }, [filteredTransactions, timeRange]);

  const projectDistribution = useMemo(() => {
    const counts: Record<string, number> = {};
    filteredProjects.forEach(p => {
      const type = p.typology || 'Otros';
      counts[type] = (counts[type] || 0) + 1;
    });

    const colors = [
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
    return Object.keys(counts).map((name, i) => ({
      name,
      value: counts[name],
      color: colors[i % colors.length]
    }));
  }, [filteredProjects]);

  const expenseByCategoryData = useMemo(() => {
    const expenses = filteredTransactions.filter(t => t.type === 'Expense');
    const counts: Record<string, number> = {};
    expenses.forEach(t => {
      const cat = t.category || 'Otros';
      counts[cat] = (counts[cat] || 0) + (t.amount || 0);
    });
    
    const colors = [
      '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', 
      '#ec4899', '#06b6d4', '#f97316', '#6366f1', '#14b8a6'
    ];

    return Object.keys(counts).map((name, i) => ({
      name,
      value: counts[name],
      color: colors[i % colors.length]
    })).sort((a, b) => b.value - a.value);
  }, [filteredTransactions]);

  const riskDistributionData = useMemo(() => {
    const activeProjectIds = filteredProjects.filter(p => p.status === 'In Progress').map(p => p.id);
    const activeRisks = filteredRisks.filter(r => activeProjectIds.includes(r.projectId));
    
    const counts: Record<string, number> = {
      'Técnico': 0,
      'Financiero': 0,
      'Operacional': 0,
      'Externo': 0,
      'Legal': 0
    };

    const categoryMap: Record<string, string> = {
      'Technical': 'Técnico',
      'Financial': 'Financiero',
      'Operational': 'Operacional',
      'External': 'Externo',
      'Legal': 'Legal'
    };

    activeRisks.forEach(r => {
      const spanishCategory = categoryMap[r.category] || r.category;
      if (counts[spanishCategory] !== undefined) {
        counts[spanishCategory]++;
      } else {
        counts['Otros'] = (counts['Otros'] || 0) + 1;
      }
    });

    return Object.entries(counts).map(([name, value]) => ({ name, value }));
  }, [filteredRisks, filteredProjects]);

  const handleGenerateInsight = async () => {
    setIsGenerating(true);
    try {
      const ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_GEMINI_API_KEY });
      
      const summaryData = {
        totalProjects: filteredProjects.length,
        activeProjects: filteredProjects.filter(p => p.status === 'In Progress').length,
        totalIncome: filteredTransactions.filter(t => t.type === 'Income').reduce((acc, t) => acc + (t.amount || 0), 0),
        totalExpense: filteredTransactions.filter(t => t.type === 'Expense').reduce((acc, t) => acc + (t.amount || 0), 0),
        activeRisks: filteredRisks.length,
        riskTypes: riskDistributionData.map(d => `${d.name}: ${d.value}`).join(', ')
      };

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: `Como consultor experto en gestión de construcción, analiza los siguientes datos de la empresa y proporciona 3 recomendaciones estratégicas clave. Datos: ${JSON.stringify(summaryData)}. Proporciona la respuesta en español.`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              insights: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: "Lista de recomendaciones estratégicas."
              }
            },
            required: ["insights"]
          }
        }
      });

      const result = JSON.parse(response.text || '{}');
      setAiInsight(result.insights.join('\n\n'));
      toast.success('Análisis de IA completado');
    } catch (error) {
      console.error('Error generating AI insights:', error);
      toast.error('Error al generar análisis con IA');
    } finally {
      setIsGenerating(false);
    }
  };

  const kpis = useMemo(() => {
    const totalIncome = filteredTransactions.filter(t => t.type === 'Income').reduce((acc, t) => acc + (t.amount || 0), 0);
    const totalExpense = filteredTransactions.filter(t => t.type === 'Expense').reduce((acc, t) => acc + (t.amount || 0), 0);
    const totalProfit = totalIncome - totalExpense;
    
    const margin = totalIncome > 0 ? (totalProfit / totalIncome) * 100 : 0;
    const roi = totalExpense > 0 ? (totalProfit / totalExpense) * 100 : 0;
    const avgCost = filteredProjects.length > 0 ? totalExpense / filteredProjects.length : 0;
    
    // Calculate efficiency (average physical progress / average financial progress)
    const avgPhysical = filteredProjects.length > 0 ? filteredProjects.reduce((acc, p) => acc + (p.physicalProgress || 0), 0) / filteredProjects.length : 0;
    const avgFinancial = filteredProjects.length > 0 ? filteredProjects.reduce((acc, p) => {
      const projectExpenses = filteredTransactions.filter(t => t.projectId === p.id && t.type === 'Expense').reduce((sum, t) => sum + (t.amount || 0), 0);
      return acc + (p.budget > 0 ? (projectExpenses / p.budget) * 100 : 0);
    }, 0) / filteredProjects.length : 0;
    
    const efficiency = avgFinancial > 0 ? (avgPhysical / avgFinancial) * 100 : 0;

    return [
      { label: 'Margen de Utilidad', value: `${margin.toFixed(1)}%`, trend: '+2.4%', up: true, icon: TrendingUp, color: 'text-emerald-500' },
      { label: 'Eficiencia Operativa', value: `${efficiency.toFixed(1)}%`, trend: '+5.0%', up: true, icon: Activity, color: 'text-blue-500' },
      { label: 'Retorno de Inversión', value: `${roi.toFixed(1)}%`, trend: '-1.2%', up: roi > 0, icon: Target, color: 'text-amber-500' },
      { label: 'Costo Promedio', value: formatCurrency(avgCost), trend: '+8.0%', up: false, icon: Layers, color: 'text-purple-500' },
    ];
  }, [filteredProjects, filteredTransactions]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-8 pb-20 min-w-0 overflow-x-hidden">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-3xl font-black text-slate-900 dark:text-white tracking-tight">Business Intelligence</h1>
          <p className="text-[10px] sm:text-sm font-bold text-slate-500 dark:text-slate-300 uppercase tracking-widest">Análisis de Rendimiento</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <div className="flex bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-1 shadow-sm">
            {['1m', '3m', '6m', '1y'].map((range) => (
              <button
                key={range}
                onClick={() => setTimeRange(range)}
                className={cn(
                  "px-2.5 sm:px-3 py-1 sm:py-1.5 text-[8px] sm:text-[10px] font-black uppercase tracking-widest rounded-lg transition-all",
                  timeRange === range 
                    ? "bg-primary text-white shadow-md" 
                    : "text-slate-500 dark:text-slate-300 hover:text-primary"
                )}
              >
                {range}
              </button>
            ))}
          </div>
          <button 
            onClick={handleGenerateInsight}
            disabled={isGenerating}
            title="Generar análisis con IA"
            className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 sm:py-2.5 bg-indigo-600 text-white rounded-xl text-[10px] sm:text-sm font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-500/20 disabled:opacity-50"
          >
            {isGenerating ? (
              <Loader2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 animate-spin" />
            ) : (
              <Sparkles size={14} className="sm:w-4.5 sm:h-4.5" />
            )}
            IA
          </button>
          <button title="Exportar datos" className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 sm:py-2.5 bg-primary text-white rounded-xl text-[10px] sm:text-sm font-bold hover:bg-primary/90 transition-all shadow-lg shadow-primary/20">
            <Download size={14} className="sm:w-4.5 sm:h-4.5" />
            Exportar
          </button>
        </div>
      </div>

      <AnimatePresence>
        {aiInsight && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="p-4 sm:p-6 bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-100 dark:border-indigo-500/20 rounded-2xl relative"
          >
            <button 
              onClick={() => setAiInsight(null)}
              title="Cerrar recomendaciones"
              className="absolute top-3 sm:top-4 right-3 sm:right-4 text-indigo-400 hover:text-indigo-600 transition-colors"
            >
              <X size={14} className="sm:w-4 sm:h-4" />
            </button>
            <div className="flex items-start gap-3 sm:gap-4">
              <div className="p-2 sm:p-3 bg-indigo-600 text-white rounded-xl shadow-lg">
                <Sparkles size={16} className="sm:w-5 sm:h-5" />
              </div>
              <div>
                <h3 className="text-[10px] sm:text-sm font-black text-indigo-900 dark:text-indigo-300 uppercase tracking-widest mb-1 sm:mb-2">Recomendaciones (IA)</h3>
                <div className="text-[10px] sm:text-sm text-indigo-700 dark:text-indigo-400 font-medium whitespace-pre-wrap leading-relaxed">
                  {aiInsight}
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* KPI Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {kpis.map((kpi, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            className="p-4 sm:p-6 bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm"
          >
            <div className="flex items-center justify-between mb-3 sm:mb-4">
              <div className={cn("p-1.5 sm:p-2 rounded-lg bg-slate-50 dark:bg-slate-800", kpi.color)}>
                <kpi.icon size={16} className="sm:w-5 sm:h-5" />
              </div>
              <div className={cn(
                "flex items-center gap-0.5 sm:gap-1 text-[8px] sm:text-[10px] font-black uppercase tracking-tighter px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-full",
                kpi.up ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400" : "bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-400"
              )}>
                {kpi.up ? <ArrowUpRight size={10} className="sm:w-3 sm:h-3" /> : <ArrowDownRight size={10} className="sm:w-3 sm:h-3" />}
                {kpi.trend}
              </div>
            </div>
            <p className="text-[9px] sm:text-[10px] font-black text-slate-400 dark:text-slate-300 uppercase tracking-widest mb-0.5 sm:mb-1">{kpi.label}</p>
            <p className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white">{kpi.value}</p>
          </motion.div>
        ))}
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 min-w-0">
        {/* Income vs Expenses */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm p-4 sm:p-6">
          <div className="flex items-center justify-between mb-4 sm:mb-8">
            <h3 className="font-black text-[10px] sm:text-xs uppercase tracking-widest text-slate-900 dark:text-white">Flujo de Caja Mensual</h3>
            <div className="flex items-center gap-2 sm:gap-4">
              <div className="flex items-center gap-1 sm:gap-2">
                <div className="w-2 h-2 sm:w-3 sm:h-3 rounded-full bg-primary" />
                <span className="text-[8px] sm:text-[10px] font-bold text-slate-400 dark:text-slate-300 uppercase">Ingresos</span>
              </div>
              <div className="flex items-center gap-1 sm:gap-2">
                <div className="w-2 h-2 sm:w-3 sm:h-3 rounded-full bg-rose-500" />
                <span className="text-[8px] sm:text-[10px] font-bold text-slate-400 dark:text-slate-300 uppercase">Egresos</span>
              </div>
            </div>
          </div>
          <div className="h-60 sm:h-80 w-full min-w-0">
            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={220}>
              <AreaChart data={monthlyData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorIncome" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.1}/>
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" opacity={0.5} />
                <XAxis 
                  dataKey="month" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fontSize: 8, fontWeight: 700, fill: '#94a3b8' }}
                  dy={10}
                />
                <YAxis 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fontSize: 8, fontWeight: 700, fill: '#94a3b8' }}
                  tickFormatter={(value) => `$${value >= 1000 ? (value/1000).toFixed(0) + 'k' : value}`}
                />
                <Tooltip 
                  contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)', backgroundColor: '#fff' }}
                  itemStyle={{ fontSize: '12px', fontWeight: 700 }}
                  formatter={(value) => [typeof value === 'number' ? formatCurrency(value) : value, ""]}
                />
                <Area type="monotone" dataKey="income" stroke="#3b82f6" strokeWidth={3} fillOpacity={1} fill="url(#colorIncome)" name="Ingresos" />
                <Area type="monotone" dataKey="expense" stroke="#f43f5e" strokeWidth={3} fill="transparent" name="Egresos" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Project Distribution */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm p-6">
          <h3 className="font-black text-xs uppercase tracking-widest text-slate-900 dark:text-white mb-8">Distribución por Tipo de Proyecto</h3>
          <div className="h-80 w-full flex flex-col sm:flex-row items-center min-w-0">
            <div className="h-full w-full sm:w-2/3 min-w-0">
              <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={220}>
                <PieChart margin={{ top: 0, right: 0, left: 0, bottom: 20 }}>
                  <Pie
                    data={projectDistribution}
                    cx="50%"
                    cy="45%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {projectDistribution.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip 
                    contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)' }}
                  />
                  <Legend 
                    verticalAlign="bottom" 
                    align="center"
                    iconType="circle" 
                    wrapperStyle={{ paddingTop: '20px' }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="w-full sm:w-1/3 space-y-4 mt-6 sm:mt-0">
              {projectDistribution.slice(0, 4).map((item, i) => (
                <div key={i} className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-100 dark:border-slate-800/50">
                  <div className="flex items-center gap-2">
                    <svg className="color-indicator" viewBox="0 0 8 8" aria-hidden="true" focusable="false">
                      <circle cx="4" cy="4" r="4" fill={item.color} />
                    </svg>
                    <span className="text-[10px] font-black text-slate-600 dark:text-slate-300 uppercase tracking-tighter">{item.name}</span>
                  </div>
                  <span className="text-xs font-black text-slate-900 dark:text-white">{((item.value / Math.max(filteredProjects.length, 1)) * 100).toFixed(1)}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Risk Distribution */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm p-6">
          <h3 className="font-black text-xs uppercase tracking-widest text-slate-900 dark:text-white mb-8">Distribución de Riesgos por Tipo (Proyectos Activos)</h3>
          <div className="h-80 w-full min-w-0">
            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={220}>
              <BarChart data={riskDistributionData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" opacity={0.5} />
                <XAxis 
                  dataKey="name" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fontSize: 10, fontWeight: 700, fill: '#94a3b8' }}
                />
                <YAxis 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fontSize: 10, fontWeight: 700, fill: '#94a3b8' }}
                  allowDecimals={false}
                />
                <Tooltip 
                  contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)', backgroundColor: '#fff' }}
                  itemStyle={{ fontSize: '12px', fontWeight: 700 }}
                />
                <Bar dataKey="value" fill="#3b82f6" radius={[4, 4, 0, 0]} name="Cantidad de Riesgos" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}
