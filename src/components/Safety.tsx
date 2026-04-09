import React, { useCallback, useState, useMemo, useEffect } from 'react';
import { 
  ShieldAlert, 
  CheckCircle2, 
  AlertTriangle, 
  FileCheck, 
  HardHat, 
  Stethoscope, 
  Flame, 
  Wind,
  Search,
  MoreVertical,
  TrendingDown,
  Activity,
  Calendar,
  Clock,
  ChevronLeft,
  ChevronRight,
  Plus,
  X,
  Sparkles,
  Loader2,
  Trash2,
  Edit2
} from 'lucide-react';
import { GoogleGenAI, Type } from "@google/genai";
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'sonner';
import { cn, handleApiError, OperationType } from '../lib/utils';
import { auth } from '../lib/authStorageClient';
import ConfirmModal from './ConfirmModal';
import { logAction } from '../lib/audit';
import { createSafetyIncident, deleteSafetyIncident, listSafetyIncidents, updateSafetyIncident } from '../lib/safetyApi';

export default function Safety() {
  const [incidents, setIncidents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(5);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editingIncidentId, setEditingIncidentId] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [incidentToDelete, setIncidentToDelete] = useState<string | null>(null);

  const [newIncident, setNewIncident] = useState({
    title: '',
    type: 'Accidente',
    severity: 'Baja',
    location: '',
    date: new Date().toISOString().split('T')[0],
    description: '',
    measures: '',
    status: 'Open'
  });

  const loadIncidents = useCallback(async () => {
    try {
      const items = await listSafetyIncidents();
      setIncidents(items);
    } catch (error) {
      handleApiError(error, OperationType.GET, 'safety_incidents');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadIncidents();
  }, [loadIncidents]);

  const handleAddIncident = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (isEditMode && editingIncidentId) {
        await updateSafetyIncident(editingIncidentId, newIncident);
        toast.success('Incidente actualizado');
        await logAction('Edición de Incidente', 'Seguridad', `Incidente ${newIncident.title} actualizado`, 'update', { incidentId: editingIncidentId });
      } else {
        const created = await createSafetyIncident({
          ...newIncident,
          authorEmail: auth.currentUser?.email || 'salazaroliveros@gmail.com'
        });
        toast.success('Incidente registrado exitosamente');
        await logAction('Reporte de Incidente', 'Seguridad', `Nuevo incidente reportado: ${newIncident.title}`, 'create', { incidentId: created.id });
      }
      await loadIncidents();
      setIsModalOpen(false);
      resetForm();
    } catch (error) {
      handleApiError(error, isEditMode ? OperationType.UPDATE : OperationType.WRITE, 'safety_incidents');
    }
  };

  const resetForm = () => {
    setNewIncident({
      title: '',
      type: 'Accidente',
      severity: 'Baja',
      location: '',
      date: new Date().toISOString().split('T')[0],
      description: '',
      measures: '',
      status: 'Open'
    });
    setIsEditMode(false);
    setEditingIncidentId(null);
  };

  const handleEdit = (inc: any) => {
    setNewIncident({
      title: inc.title,
      type: inc.type,
      severity: inc.severity,
      location: inc.location,
      date: inc.date,
      description: inc.description,
      measures: inc.measures || '',
      status: inc.status
    });
    setEditingIncidentId(inc.id);
    setIsEditMode(true);
    setIsModalOpen(true);
  };

  const handleDelete = (id: string) => {
    setIncidentToDelete(id);
    setIsDeleteConfirmOpen(true);
  };

  const confirmDelete = async () => {
    if (!incidentToDelete) return;
    try {
      const inc = incidents.find(i => i.id === incidentToDelete);
      await deleteSafetyIncident(incidentToDelete);
      toast.success('Incidente eliminado');
      await logAction('Eliminación de Incidente', 'Seguridad', `Incidente ${inc?.title} eliminado`, 'delete', { incidentId: incidentToDelete });
      await loadIncidents();
      setIsDeleteConfirmOpen(false);
      setIncidentToDelete(null);
    } catch (error) {
      handleApiError(error, OperationType.DELETE, 'safety_incidents');
    }
  };

  const handleAISuggestions = async () => {
    if (!newIncident.title) {
      toast.error('Por favor ingrese un título para el incidente antes de sugerir');
      return;
    }

    setIsGenerating(true);
    try {
      const ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_GEMINI_API_KEY });
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: `Como experto en seguridad industrial en construcción, sugiere medidas preventivas y correctivas para un incidente titulado "${newIncident.title}" de tipo "${newIncident.type}" y severidad "${newIncident.severity}". Proporciona la respuesta en español.`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              suggestedMeasures: {
                type: Type.STRING,
                description: "Medidas preventivas y correctivas sugeridas."
              }
            },
            required: ["suggestedMeasures"]
          }
        }
      });

      const suggestions = JSON.parse(response.text);
      toast.success('Sugerencias generadas con éxito');
      if (suggestions.suggestedMeasures) {
        setNewIncident(prev => ({ ...prev, measures: suggestions.suggestedMeasures }));
      }
    } catch (error) {
      console.error('Error generating AI suggestions:', error);
      toast.error('Error al generar sugerencias con IA');
    } finally {
      setIsGenerating(false);
    }
  };

  const filteredIncidents = useMemo(() => {
    return incidents.filter(incident => 
      incident.type.toLowerCase().includes(searchTerm.toLowerCase()) ||
      incident.location.toLowerCase().includes(searchTerm.toLowerCase()) ||
      incident.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
      incident.title?.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [incidents, searchTerm]);

  const totalPages = Math.ceil(filteredIncidents.length / itemsPerPage);
  const paginatedIncidents = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredIncidents.slice(start, start + itemsPerPage);
  }, [filteredIncidents, currentPage, itemsPerPage]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-20">
      <ConfirmModal
        isOpen={isDeleteConfirmOpen}
        onClose={() => setIsDeleteConfirmOpen(false)}
        onConfirm={confirmDelete}
        title="Eliminar Incidente"
        message="¿Estás seguro de que deseas eliminar este reporte de incidente? Esta acción no se puede deshacer."
      />

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight">Seguridad y Salud (HSE)</h1>
          <p className="text-slate-500 dark:text-slate-400 font-medium">Control de riesgos, incidentes y cumplimiento</p>
        </div>
        <div className="flex items-center gap-3">
          <button className="flex items-center gap-2 px-4 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-sm font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-50 transition-all shadow-sm">
            <FileCheck size={18} />
            Nueva Inspección
          </button>
          <button 
            onClick={() => {
              resetForm();
              setIsModalOpen(true);
            }}
            className="flex items-center gap-2 px-4 py-2.5 bg-rose-500 text-white rounded-xl text-sm font-bold hover:bg-rose-600 transition-all shadow-lg shadow-rose-500/20"
          >
            <ShieldAlert size={18} />
            Reportar Incidente
          </button>
        </div>
      </div>

      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden border border-slate-100 dark:border-slate-800"
            >
              <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                <h3 className="text-xl font-black text-slate-900 dark:text-white">
                  {isEditMode ? 'Editar Incidente' : 'Reportar Incidente'}
                </h3>
                <button title="Cerrar formulario de incidente" aria-label="Cerrar formulario de incidente" onClick={() => setIsModalOpen(false)} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors">
                  <X size={20} className="text-slate-500" />
                </button>
              </div>
              <form onSubmit={handleAddIncident} className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Título del Incidente</label>
                    <button
                      type="button"
                      onClick={handleAISuggestions}
                      disabled={isGenerating || !newIncident.title}
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
                    required
                    type="text"
                    value={newIncident.title}
                    onChange={(e) => setNewIncident({ ...newIncident, title: e.target.value })}
                    className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                    placeholder="Ej: Caída de material desde altura"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Tipo</label>
                    <select
                      title="Tipo de incidente"
                      aria-label="Tipo de incidente"
                      value={newIncident.type}
                      onChange={(e) => setNewIncident({ ...newIncident, type: e.target.value })}
                      className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                    >
                      <option value="Accidente">Accidente</option>
                      <option value="Casi Accidente">Casi Accidente</option>
                      <option value="Acto Inseguro">Acto Inseguro</option>
                      <option value="Condición Insegura">Condición Insegura</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Severidad</label>
                    <select
                      title="Severidad del incidente"
                      aria-label="Severidad del incidente"
                      value={newIncident.severity}
                      onChange={(e) => setNewIncident({ ...newIncident, severity: e.target.value })}
                      className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                    >
                      <option value="Baja">Baja</option>
                      <option value="Media">Media</option>
                      <option value="Alta">Alta</option>
                      <option value="Crítica">Crítica</option>
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Ubicación</label>
                    <input
                      required
                      type="text"
                      title="Ubicacion del incidente"
                      placeholder="Ubicacion del incidente"
                      value={newIncident.location}
                      onChange={(e) => setNewIncident({ ...newIncident, location: e.target.value })}
                      className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Fecha</label>
                    <input
                      required
                      type="date"
                      title="Fecha del incidente"
                      placeholder="Fecha del incidente"
                      value={newIncident.date}
                      onChange={(e) => setNewIncident({ ...newIncident, date: e.target.value })}
                      className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Estado</label>
                  <select
                    title="Estado del incidente"
                    aria-label="Estado del incidente"
                    value={newIncident.status}
                    onChange={(e) => setNewIncident({ ...newIncident, status: e.target.value })}
                    className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                  >
                    <option value="Open">Abierto</option>
                    <option value="Under Investigation">Bajo Investigación</option>
                    <option value="Closed">Cerrado</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Descripción</label>
                  <textarea
                    required
                    title="Descripcion del incidente"
                    placeholder="Descripcion del incidente"
                    value={newIncident.description}
                    onChange={(e) => setNewIncident({ ...newIncident, description: e.target.value })}
                    className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:ring-2 focus:ring-primary/20 outline-none transition-all h-20 resize-none"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Medidas Sugeridas (IA)</label>
                  <textarea
                    value={newIncident.measures}
                    onChange={(e) => setNewIncident({ ...newIncident, measures: e.target.value })}
                    className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:ring-2 focus:ring-primary/20 outline-none transition-all h-24 resize-none"
                    placeholder="Las medidas sugeridas por la IA aparecerán aquí..."
                  />
                </div>
                <button type="submit" className="w-full py-4 bg-rose-500 text-white rounded-2xl font-black uppercase tracking-widest shadow-lg shadow-rose-500/20 hover:bg-rose-600 transition-all mt-4">
                  {isEditMode ? 'Guardar Cambios' : 'Registrar Incidente'}
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {[
          { label: 'Días Sin Accidentes', value: '142', icon: CheckCircle2, color: 'bg-emerald-500' },
          { label: 'Incidentes Abiertos', value: incidents.filter(i => i.status !== 'Closed').length.toString(), icon: AlertTriangle, color: 'bg-rose-500' },
          { label: 'Inspecciones Mes', value: '24', icon: FileCheck, color: 'bg-blue-500' },
          { label: 'Cumplimiento EPP', value: '98.0%', icon: HardHat, color: 'bg-amber-500' },
        ].map((stat, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            className="p-4 sm:p-6 bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm"
          >
            <div className="flex items-center justify-between mb-3 sm:mb-4">
              <div className={cn("p-2 sm:p-3 rounded-xl text-white shadow-lg", stat.color)}>
                <stat.icon size={16} className="sm:w-5 sm:h-5" />
              </div>
              <TrendingDown size={14} className="text-emerald-500 sm:w-4 sm:h-4" />
            </div>
            <p className="text-[9px] sm:text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">{stat.label}</p>
            <p className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white">{stat.value}</p>
          </motion.div>
        ))}
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Incident Log */}
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm overflow-hidden">
            <div className="p-4 sm:p-6 border-b border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <h3 className="font-black text-[10px] sm:text-xs uppercase tracking-widest text-slate-900 dark:text-white">Registro de Incidentes</h3>
              <div className="relative w-full sm:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 sm:w-4 sm:h-4" size={14} />
                <input
                  type="text"
                  placeholder="Buscar incidente..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                />
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50/50 dark:bg-slate-800/50">
                    <th className="px-4 sm:px-6 py-3 sm:py-4 text-[9px] sm:text-[10px] font-black text-slate-400 uppercase tracking-widest">Incidente</th>
                    <th className="px-4 sm:px-6 py-3 sm:py-4 text-[9px] sm:text-[10px] font-black text-slate-400 uppercase tracking-widest">Ubicación</th>
                    <th className="px-4 sm:px-6 py-3 sm:py-4 text-[9px] sm:text-[10px] font-black text-slate-400 uppercase tracking-widest">Severidad</th>
                    <th className="px-4 sm:px-6 py-3 sm:py-4 text-[9px] sm:text-[10px] font-black text-slate-400 uppercase tracking-widest">Estado</th>
                    <th className="px-4 sm:px-6 py-3 sm:py-4 text-[9px] sm:text-[10px] font-black text-slate-400 uppercase tracking-widest"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {paginatedIncidents.map((inc) => (
                    <tr key={inc.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors group">
                      <td className="px-4 sm:px-6 py-3 sm:py-4">
                        <div>
                          <p className="text-[10px] sm:text-sm font-bold text-slate-900 dark:text-white truncate max-w-[120px] sm:max-w-none">{inc.title || inc.type}</p>
                          <p className="text-[8px] sm:text-[10px] text-slate-400 font-medium tracking-tighter">{inc.date}</p>
                        </div>
                      </td>
                      <td className="px-4 sm:px-6 py-3 sm:py-4">
                        <p className="text-[10px] sm:text-xs font-bold text-slate-700 dark:text-slate-300 truncate max-w-[100px] sm:max-w-none">{inc.location}</p>
                      </td>
                      <td className="px-4 sm:px-6 py-3 sm:py-4">
                        <span className={cn(
                          "px-1.5 sm:px-2.5 py-0.5 sm:py-1 rounded-full text-[8px] sm:text-[10px] font-black uppercase tracking-tighter",
                          inc.severity === 'Alta' || inc.severity === 'Crítica' ? "bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-400" :
                          inc.severity === 'Media' ? "bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400" :
                          "bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400"
                        )}>
                          {inc.severity}
                        </span>
                      </td>
                      <td className="px-4 sm:px-6 py-3 sm:py-4">
                        <span className={cn(
                          "px-1.5 sm:px-2.5 py-0.5 sm:py-1 rounded-full text-[8px] sm:text-[10px] font-black uppercase tracking-tighter",
                          inc.status === 'Closed' ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400" : 
                          inc.status === 'Under Investigation' ? "bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400" :
                          "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400"
                        )}>
                          {inc.status === 'Open' ? 'Abierto' : inc.status === 'Under Investigation' ? 'Investigando' : 'Cerrado'}
                        </span>
                      </td>
                      <td className="px-4 sm:px-6 py-3 sm:py-4 text-right">
                        <div className="flex items-center justify-end gap-1 sm:gap-2">
                          <button 
                            title={`Editar incidente ${inc.title || inc.type}`}
                            aria-label={`Editar incidente ${inc.title || inc.type}`}
                            onClick={() => handleEdit(inc)}
                            className="p-1.5 sm:p-2 text-slate-400 hover:text-primary transition-colors"
                          >
                            <Edit2 size={14} className="sm:w-4 sm:h-4" />
                          </button>
                          <button 
                            title={`Eliminar incidente ${inc.title || inc.type}`}
                            aria-label={`Eliminar incidente ${inc.title || inc.type}`}
                            onClick={() => handleDelete(inc.id)}
                            className="p-1.5 sm:p-2 text-slate-400 hover:text-rose-600 transition-colors"
                          >
                            <Trash2 size={14} className="sm:w-4 sm:h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {paginatedIncidents.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-6 py-12 text-center text-slate-500 dark:text-slate-400">
                        No se encontraron incidentes registrados.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="p-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/30 dark:bg-slate-800/30">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                  Página {currentPage} de {totalPages}
                </p>
                <div className="flex items-center gap-2">
                  <button
                    title="Pagina anterior"
                    aria-label="Pagina anterior"
                    disabled={currentPage === 1}
                    onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                    className="p-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg disabled:opacity-50 text-slate-600 dark:text-slate-400"
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <button
                    title="Pagina siguiente"
                    aria-label="Pagina siguiente"
                    disabled={currentPage === totalPages}
                    onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                    className="p-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg disabled:opacity-50 text-slate-600 dark:text-slate-400"
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Sidebar Widgets */}
        <div className="space-y-6">
          {/* Safety Checklist */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm p-4 sm:p-6">
            <h3 className="font-black text-[10px] sm:text-xs uppercase tracking-widest text-slate-900 dark:text-white mb-4 sm:mb-6 flex items-center gap-2">
              <Activity size={14} className="text-primary sm:w-4 sm:h-4" />
              Checklist Diario
            </h3>
            <div className="space-y-3 sm:space-y-4">
              {[
                { label: 'Uso de Casco y Chaleco', checked: true },
                { label: 'Inspección de Andamios', checked: true },
                { label: 'Señalización de Áreas', checked: false },
                { label: 'Extintores Vigentes', checked: true },
              ].map((item, i) => (
                <div key={i} className="flex items-center gap-2.5 sm:gap-3">
                  <div className={cn(
                    "w-4 h-4 sm:w-5 sm:h-5 rounded-lg border flex items-center justify-center transition-colors",
                    item.checked ? "bg-primary border-primary text-white" : "border-slate-200 dark:border-slate-700"
                  )}>
                    {item.checked && <CheckCircle2 size={10} className="sm:w-3 sm:h-3" />}
                  </div>
                  <span className={cn(
                    "text-[10px] sm:text-xs font-bold transition-colors",
                    item.checked ? "text-slate-900 dark:text-white" : "text-slate-400"
                  )}>
                    {item.label}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Emergency Contacts */}
          <div className="bg-slate-900 rounded-2xl p-4 sm:p-6 text-white">
            <h3 className="font-black text-[10px] sm:text-xs uppercase tracking-widest opacity-80 mb-4 sm:mb-6">Emergencia</h3>
            <div className="space-y-3 sm:space-y-4">
              {[
                { label: 'Médico', value: '911', icon: Stethoscope },
                { label: 'Bomberos', value: '068', icon: Flame },
                { label: 'Seguridad', value: 'Ext 104', icon: HardHat },
              ].map((contact, i) => (
                <div key={i} className="flex items-center justify-between">
                  <div className="flex items-center gap-2 sm:gap-3">
                    <div className="p-1.5 sm:p-2 bg-white/10 rounded-lg">
                      <contact.icon size={14} className="sm:w-4 sm:h-4" />
                    </div>
                    <span className="text-[8px] sm:text-[10px] font-black uppercase tracking-widest opacity-70">{contact.label}</span>
                  </div>
                  <span className="text-xs sm:text-sm font-black">{contact.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
