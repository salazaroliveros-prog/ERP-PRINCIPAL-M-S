import React, { useCallback, useEffect, useState, useMemo } from 'react';
import { 
  AlertTriangle, 
  ShieldAlert, 
  CheckCircle2, 
  Clock, 
  Plus, 
  Search, 
  Filter, 
  MoreVertical,
  Trash2,
  Edit2,
  X,
  Info,
  ChevronRight,
  ChevronLeft,
  Target,
  Zap,
  ShieldCheck,
  AlertCircle,
  Layers,
  PieChart as PieChartIcon,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Loader2
} from 'lucide-react';
import { GoogleGenAI, Type } from "@google/genai";
import { formatCurrency, formatDate, cn, handleApiError, OperationType } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, PieChart, Pie, Legend } from 'recharts';
import { toast } from 'sonner';
import { FormModal } from './FormModal';
import { logAction } from '../lib/audit';
import ConfirmModal from './ConfirmModal';
import { listProjects } from '../lib/projectsApi';
import { createRisk, deleteRisk, listRisks, updateRisk } from '../lib/risksApi';

interface Risk {
  id: string;
  projectId: string;
  title: string;
  description: string;
  category: 'Technical' | 'Financial' | 'Operational' | 'External' | 'Legal';
  impact: 'Low' | 'Medium' | 'High' | 'Critical';
  probability: 'Low' | 'Medium' | 'High' | 'Certain';
  status: 'Identified' | 'Active' | 'Mitigated' | 'Occurred' | 'Closed';
  mitigationPlan: string;
  contingencyPlan: string;
  owner: string;
  createdAt: string;
  updatedAt: string;
}

export default function RiskManagement() {
  const [risks, setRisks] = useState<Risk[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterProject, setFilterProject] = useState('all');
  const [filterImpact, setFilterImpact] = useState('all');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingRisk, setEditingRisk] = useState<Risk | null>(null);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [riskToDelete, setRiskToDelete] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(10);
  const [isGenerating, setIsGenerating] = useState(false);

  const [formData, setFormData] = useState({
    projectId: '',
    title: '',
    description: '',
    category: 'Technical',
    impact: 'Medium',
    probability: 'Medium',
    status: 'Identified',
    mitigationPlan: '',
    contingencyPlan: '',
    owner: ''
  });

  const loadData = useCallback(async () => {
    try {
      const [riskItems, projectItems] = await Promise.all([listRisks(), listProjects()]);
      setRisks(riskItems as Risk[]);
      setProjects(projectItems);
    } catch (error) {
      handleApiError(error, OperationType.GET, 'risks');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const [expandedRisk, setExpandedRisk] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.projectId || !formData.title) {
      toast.error('Por favor complete los campos obligatorios');
      return;
    }

    try {
      if (editingRisk) {
        await updateRisk(editingRisk.id, formData);
        await logAction('Actualización de Riesgo', 'Riesgos', `Riesgo actualizado: ${formData.title}`, 'update', { projectId: formData.projectId });
        toast.success('Riesgo actualizado con éxito');
      } else {
        const created = await createRisk(formData);
        await logAction('Creación de Riesgo', 'Riesgos', `Nuevo riesgo identificado: ${formData.title}`, 'create', { projectId: formData.projectId, riskId: created.id });
        toast.success('Riesgo registrado con éxito');
      }
      await loadData();
      setIsModalOpen(false);
      resetForm();
    } catch (error) {
      handleApiError(error, editingRisk ? OperationType.UPDATE : OperationType.WRITE, editingRisk ? `risks/${editingRisk.id}` : 'risks');
    }
  };

  const resetForm = () => {
    setFormData({
      projectId: '',
      title: '',
      description: '',
      category: 'Technical',
      impact: 'Medium',
      probability: 'Medium',
      status: 'Identified',
      mitigationPlan: '',
      contingencyPlan: '',
      owner: ''
    });
    setEditingRisk(null);
  };

  const handleEdit = (risk: Risk) => {
    setEditingRisk(risk);
    setFormData({
      projectId: risk.projectId,
      title: risk.title,
      description: risk.description || '',
      category: risk.category,
      impact: risk.impact,
      probability: risk.probability,
      status: risk.status,
      mitigationPlan: risk.mitigationPlan || '',
      contingencyPlan: risk.contingencyPlan || '',
      owner: risk.owner || ''
    });
    setIsModalOpen(true);
  };

  const handleDelete = (id: string) => {
    setRiskToDelete(id);
    setIsDeleteConfirmOpen(true);
  };

  const confirmDelete = async () => {
    if (!riskToDelete) return;
    try {
      const risk = risks.find(item => item.id === riskToDelete);
      await deleteRisk(riskToDelete);
      await logAction('Eliminación de Riesgo', 'Riesgos', `Riesgo eliminado: ${risk?.title || riskToDelete}`, 'delete');
      toast.success('Riesgo eliminado');
      await loadData();
      setIsDeleteConfirmOpen(false);
      setRiskToDelete(null);
    } catch (error) {
      handleApiError(error, OperationType.DELETE, `risks/${riskToDelete}`);
    }
  };

  const handleAISuggestions = async () => {
    if (!formData.title) {
      toast.error('Por favor ingrese un título para el riesgo antes de sugerir');
      return;
    }

    setIsGenerating(true);
    try {
      const ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_GEMINI_API_KEY });
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: `Como experto en gestión de riesgos en construcción, sugiere un plan de mitigación y un plan de contingencia detallados para el siguiente riesgo: "${formData.title}" (Categoría: ${formData.category}). Proporciona respuestas claras y profesionales en español.`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              mitigationPlan: {
                type: Type.STRING,
                description: "Acciones preventivas para reducir la probabilidad o impacto del riesgo."
              },
              contingencyPlan: {
                type: Type.STRING,
                description: "Acciones correctivas a tomar si el riesgo llega a materializarse."
              }
            },
            required: ["mitigationPlan", "contingencyPlan"]
          }
        }
      });

      const suggestions = JSON.parse(response.text);
      setFormData(prev => ({
        ...prev,
        mitigationPlan: suggestions.mitigationPlan,
        contingencyPlan: suggestions.contingencyPlan
      }));
      toast.success('Sugerencias generadas con éxito');
    } catch (error) {
      console.error('Error generating AI suggestions:', error);
      toast.error('Error al generar sugerencias con IA');
    } finally {
      setIsGenerating(false);
    }
  };

  const filteredRisks = risks.filter(risk => {
    const matchesSearch = risk.title.toLowerCase().includes(searchTerm.toLowerCase()) || 
                         risk.description?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesProject = filterProject === 'all' || risk.projectId === filterProject;
    const matchesImpact = filterImpact === 'all' || risk.impact === filterImpact;
    return matchesSearch && matchesProject && matchesImpact;
  });

  const totalPages = Math.ceil(filteredRisks.length / itemsPerPage);
  const currentRisks = filteredRisks.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const riskDistributionData = useMemo(() => {
    const counts: Record<string, number> = {};
    risks.forEach(risk => {
      const projectName = projects.find(p => p.id === risk.projectId)?.name || 'Desconocido';
      counts[projectName] = (counts[projectName] || 0) + 1;
    });
    return Object.entries(counts).map(([name, value]) => ({ name, value }));
  }, [risks, projects]);

  const riskCategoryData = useMemo(() => {
    const counts: Record<string, number> = {};
    risks.forEach(risk => {
      counts[risk.category] = (counts[risk.category] || 0) + 1;
    });
    return Object.entries(counts).map(([name, value]) => ({ name, value }));
  }, [risks]);

  const COLORS = ['#3b82f6', '#ef4444', '#f59e0b', '#10b981', '#8b5cf6', '#6366f1'];

  const getImpactColor = (impact: string) => {
    switch (impact) {
      case 'Low': return 'bg-blue-100 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400';
      case 'Medium': return 'bg-amber-100 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400';
      case 'High': return 'bg-orange-100 text-orange-700 dark:bg-orange-500/10 dark:text-orange-400';
      case 'Critical': return 'bg-rose-100 text-rose-700 dark:bg-rose-500/10 dark:text-rose-400';
      default: return 'bg-slate-100 text-slate-700 dark:bg-slate-500/10 dark:text-slate-400';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'Identified': return <Info className="w-4 h-4" />;
      case 'Active': return <AlertTriangle className="w-4 h-4" />;
      case 'Mitigated': return <ShieldCheck className="w-4 h-4" />;
      case 'Occurred': return <Zap className="w-4 h-4" />;
      case 'Closed': return <CheckCircle2 className="w-4 h-4" />;
      default: return <Clock className="w-4 h-4" />;
    }
  };

  return (
    <div className="space-y-8 min-w-0 overflow-x-hidden">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight uppercase">
            Gestión de Riesgos
          </h1>
          <p className="text-slate-500 dark:text-slate-400 font-medium">
            Identificación, evaluación y mitigación de problemas potenciales
          </p>
        </div>
        <button
          onClick={() => { resetForm(); setIsModalOpen(true); }}
          className="flex items-center justify-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold transition-all shadow-lg shadow-blue-500/25 active:scale-95"
        >
          <Plus className="w-5 h-5" />
          Identificar Riesgo
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 min-w-0">
        <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm">
          <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-6 flex items-center gap-2">
            <PieChartIcon className="w-5 h-5 text-blue-500" />
            Distribución por Proyecto
          </h3>
          <div className="h-[300px] min-w-0">
            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={220}>
              <BarChart data={riskDistributionData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis 
                  dataKey="name" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fill: '#64748b', fontSize: 12 }}
                />
                <YAxis 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fill: '#64748b', fontSize: 12 }}
                />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: '#fff', 
                    borderRadius: '12px', 
                    border: 'none', 
                    boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' 
                  }} 
                />
                <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                  {riskDistributionData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm">
          <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-6 flex items-center gap-2">
            <Layers className="w-5 h-5 text-purple-500" />
            Riesgos por Categoría
          </h3>
          <div className="h-[300px] min-w-0">
            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={220}>
              <PieChart>
                <Pie
                  data={riskCategoryData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {riskCategoryData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: '#fff', 
                    borderRadius: '12px', 
                    border: 'none', 
                    boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' 
                  }} 
                />
                <Legend verticalAlign="bottom" height={36}/>
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="relative md:col-span-2">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar riesgos..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-12 pr-4 py-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all"
          />
        </div>
        <select
          title="Filtrar por proyecto"
          aria-label="Filtrar por proyecto"
          value={filterProject}
          onChange={(e) => setFilterProject(e.target.value)}
          className="px-4 py-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all"
        >
          <option value="all">Todos los Proyectos</option>
          {projects.map(p => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        <select
          title="Filtrar por impacto"
          aria-label="Filtrar por impacto"
          value={filterImpact}
          onChange={(e) => setFilterImpact(e.target.value)}
          className="px-4 py-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all"
        >
          <option value="all">Todos los Impactos</option>
          <option value="Low">Bajo</option>
          <option value="Medium">Medio</option>
          <option value="High">Alto</option>
          <option value="Critical">Crítico</option>
        </select>
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-900/50 border-bottom border-slate-200 dark:border-slate-700">
                <th className="px-6 py-4 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Riesgo</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Proyecto</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Impacto / Prob.</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Estado</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
              {currentRisks.map((risk) => (
                <React.Fragment key={risk.id}>
                  <motion.tr
                    layout
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  key={risk.id}
                  className="hover:bg-slate-50 dark:hover:bg-slate-900/30 transition-colors group cursor-pointer"
                  onClick={() => setExpandedRisk(expandedRisk === risk.id ? null : risk.id)}
                >
                  <td className="px-6 py-4">
                    <div className="flex flex-col">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-900 dark:text-white group-hover:text-blue-600 transition-colors">
                          {risk.title}
                        </span>
                        {expandedRisk === risk.id ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                      </div>
                      <span className="text-xs text-slate-500 dark:text-slate-400 line-clamp-1">
                        {risk.category}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-sm text-slate-600 dark:text-slate-300 font-medium">
                      {projects.find(p => p.id === risk.projectId)?.name || 'N/A'}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <span className={cn("px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider", getImpactColor(risk.impact))}>
                        {risk.impact}
                      </span>
                      <span className="text-xs text-slate-400 font-medium">
                        / {risk.probability}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <span className={cn(
                        "flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold",
                        risk.status === 'Closed' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400' :
                        risk.status === 'Active' ? 'bg-rose-100 text-rose-700 dark:bg-rose-500/10 dark:text-rose-400' :
                        'bg-slate-100 text-slate-700 dark:bg-slate-500/10 dark:text-slate-400'
                      )}>
                        {getStatusIcon(risk.status)}
                        {risk.status}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        title={`Editar riesgo ${risk.title}`}
                        aria-label={`Editar riesgo ${risk.title}`}
                        onClick={() => handleEdit(risk)}
                        className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-500/10 rounded-lg transition-all"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        title={`Eliminar riesgo ${risk.title}`}
                        aria-label={`Eliminar riesgo ${risk.title}`}
                        onClick={() => handleDelete(risk.id)}
                        className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/10 rounded-lg transition-all"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </motion.tr>
                <AnimatePresence>
                  {expandedRisk === risk.id && (
                    <motion.tr
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="bg-slate-50/50 dark:bg-slate-900/20"
                    >
                      <td colSpan={5} className="px-6 py-4 border-t border-slate-100 dark:border-slate-800">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          <div className="space-y-3">
                            <h4 className="text-xs font-black uppercase tracking-widest text-slate-400 flex items-center gap-2">
                              <Target className="w-3 h-3" />
                              Plan de Mitigación
                            </h4>
                            <p className="text-sm text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-800 p-3 rounded-xl border border-slate-100 dark:border-slate-700">
                              {risk.mitigationPlan || 'No se ha definido un plan de mitigación.'}
                            </p>
                          </div>
                          <div className="space-y-3">
                            <h4 className="text-xs font-black uppercase tracking-widest text-slate-400 flex items-center gap-2">
                              <ShieldAlert className="w-3 h-3" />
                              Plan de Contingencia
                            </h4>
                            <p className="text-sm text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-800 p-3 rounded-xl border border-slate-100 dark:border-slate-700">
                              {risk.contingencyPlan || 'No se ha definido un plan de contingencia.'}
                            </p>
                          </div>
                          <div className="md:col-span-2 space-y-3">
                            <h4 className="text-xs font-black uppercase tracking-widest text-slate-400 flex items-center gap-2">
                              <Info className="w-3 h-3" />
                              Descripción Completa
                            </h4>
                            <p className="text-sm text-slate-600 dark:text-slate-300">
                              {risk.description || 'Sin descripción adicional.'}
                            </p>
                          </div>
                        </div>
                      </td>
                    </motion.tr>
                  )}
                </AnimatePresence>
              </React.Fragment>
            ))}
              {currentRisks.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <div className="p-4 bg-slate-50 dark:bg-slate-900/50 rounded-full">
                        <ShieldAlert className="w-8 h-8 text-slate-300" />
                      </div>
                      <p className="text-slate-500 dark:text-slate-400 font-medium">No se encontraron riesgos registrados</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="px-6 py-4 bg-slate-50 dark:bg-slate-900/30 border-t border-slate-200 dark:border-slate-700 flex items-center justify-between">
            <span className="text-sm text-slate-500 dark:text-slate-400">
              Mostrando {currentRisks.length} de {filteredRisks.length} riesgos
            </span>
            <div className="flex items-center gap-2">
              <button
                title="Pagina anterior"
                aria-label="Pagina anterior"
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                disabled={currentPage === 1}
                className="p-2 text-slate-500 hover:text-blue-600 disabled:opacity-50 transition-colors"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <span className="text-sm font-bold text-slate-700 dark:text-slate-300">
                {currentPage} / {totalPages}
              </span>
              <button
                title="Pagina siguiente"
                aria-label="Pagina siguiente"
                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                disabled={currentPage === totalPages}
                className="p-2 text-slate-500 hover:text-blue-600 disabled:opacity-50 transition-colors"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          </div>
        )}
      </div>

      <FormModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingRisk ? 'Editar Riesgo' : 'Identificar Nuevo Riesgo'}
      >
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-sm font-bold text-slate-700 dark:text-slate-300">Proyecto *</label>
              <select
                title="Proyecto del riesgo"
                aria-label="Proyecto del riesgo"
                value={formData.projectId}
                onChange={(e) => setFormData({ ...formData, projectId: e.target.value })}
                className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                required
              >
                <option value="">Seleccionar Proyecto</option>
                {projects.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-bold text-slate-700 dark:text-slate-300">Título del Riesgo *</label>
                <button
                  type="button"
                  onClick={handleAISuggestions}
                  disabled={isGenerating || !formData.title}
                  className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-blue-600 hover:text-blue-700 disabled:opacity-50 transition-colors"
                >
                  {isGenerating ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <Sparkles className="w-3 h-3" />
                  )}
                  Sugerir con IA
                </button>
              </div>
              <input
                type="text"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                placeholder="Ej: Retraso en entrega de materiales"
                required
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-bold text-slate-700 dark:text-slate-300">Categoría</label>
              <select
                title="Categoria del riesgo"
                aria-label="Categoria del riesgo"
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value as any })}
                className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all"
              >
                <option value="Technical">Técnico</option>
                <option value="Financial">Financiero</option>
                <option value="Operational">Operativo</option>
                <option value="External">Externo</option>
                <option value="Legal">Legal</option>
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-bold text-slate-700 dark:text-slate-300">Responsable</label>
              <input
                type="text"
                value={formData.owner}
                onChange={(e) => setFormData({ ...formData, owner: e.target.value })}
                className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                placeholder="Nombre del responsable"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-bold text-slate-700 dark:text-slate-300">Impacto</label>
              <select
                title="Impacto del riesgo"
                aria-label="Impacto del riesgo"
                value={formData.impact}
                onChange={(e) => setFormData({ ...formData, impact: e.target.value as any })}
                className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all"
              >
                <option value="Low">Bajo</option>
                <option value="Medium">Medio</option>
                <option value="High">Alto</option>
                <option value="Critical">Crítico</option>
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-bold text-slate-700 dark:text-slate-300">Probabilidad</label>
              <select
                title="Probabilidad del riesgo"
                aria-label="Probabilidad del riesgo"
                value={formData.probability}
                onChange={(e) => setFormData({ ...formData, probability: e.target.value as any })}
                className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all"
              >
                <option value="Low">Baja</option>
                <option value="Medium">Media</option>
                <option value="High">Alta</option>
                <option value="Certain">Cierta / Inminente</option>
              </select>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-bold text-slate-700 dark:text-slate-300">Descripción</label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all min-h-[100px]"
              placeholder="Detalles del riesgo..."
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-sm font-bold text-slate-700 dark:text-slate-300">Plan de Mitigación</label>
              <textarea
                value={formData.mitigationPlan}
                onChange={(e) => setFormData({ ...formData, mitigationPlan: e.target.value })}
                className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all min-h-[80px]"
                placeholder="Acciones para reducir la probabilidad o impacto..."
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-bold text-slate-700 dark:text-slate-300">Plan de Contingencia</label>
              <textarea
                value={formData.contingencyPlan}
                onChange={(e) => setFormData({ ...formData, contingencyPlan: e.target.value })}
                className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all min-h-[80px]"
                placeholder="Acciones si el riesgo llega a ocurrir..."
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-bold text-slate-700 dark:text-slate-300">Estado</label>
            <select
              title="Estado del riesgo"
              aria-label="Estado del riesgo"
              value={formData.status}
              onChange={(e) => setFormData({ ...formData, status: e.target.value as any })}
              className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all"
            >
              <option value="Identified">Identificado</option>
              <option value="Active">Activo / En Observación</option>
              <option value="Mitigated">Mitigado</option>
              <option value="Occurred">Ocurrido</option>
              <option value="Closed">Cerrado</option>
            </select>
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <button
              type="button"
              onClick={() => setIsModalOpen(false)}
              className="px-6 py-2.5 text-slate-600 dark:text-slate-400 font-bold hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-all"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-8 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold transition-all shadow-lg shadow-blue-500/25 active:scale-95"
            >
              {editingRisk ? 'Guardar Cambios' : 'Registrar Riesgo'}
            </button>
          </div>
        </form>
      </FormModal>

      <ConfirmModal
        isOpen={isDeleteConfirmOpen}
        onClose={() => setIsDeleteConfirmOpen(false)}
        onConfirm={confirmDelete}
        title="Eliminar Riesgo"
        message="¿Estás seguro de que deseas eliminar este registro de riesgo? Esta acción no se puede deshacer."
      />
    </div>
  );
}
