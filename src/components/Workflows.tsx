import React, { useCallback, useState, useEffect, useMemo } from 'react';
import { 
  CheckSquare, 
  Clock, 
  CheckCircle2, 
  XCircle, 
  AlertCircle,
  FileText,
  ShoppingBag,
  User,
  ArrowRight,
  Filter,
  Search,
  MoreVertical,
  Eye,
  Edit2,
  Trash2,
  Plus,
  AlertTriangle
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn, handleApiError, OperationType } from '../lib/utils';
import { logAction } from '../lib/audit';
import { toast } from 'sonner';
import { createWorkflow, deleteWorkflow, listWorkflows, updateWorkflow, updateWorkflowStatus } from '../lib/workflowsApi';

interface WorkflowTask {
  id: string;
  title: string;
  type: 'quote' | 'purchase_order' | 'subcontract' | 'other';
  referenceId: string;
  status: 'pending' | 'approved' | 'rejected';
  requestedBy: string;
  requestedAt: string;
  priority: 'low' | 'medium' | 'high';
  description: string;
  amount?: number;
}

const Workflows = () => {
  const [tasks, setTasks] = useState<WorkflowTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('pending');
  const [searchTerm, setSearchTerm] = useState('');
  
  // Modal states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<WorkflowTask | null>(null);
  const [taskToDelete, setTaskToDelete] = useState<string | null>(null);
  
  // Form state
  const [formData, setFormData] = useState({
    title: '',
    type: 'other' as WorkflowTask['type'],
    referenceId: '',
    priority: 'medium' as WorkflowTask['priority'],
    description: '',
    amount: 0,
    requestedBy: ''
  });

  const loadWorkflows = useCallback(async () => {
    try {
      const items = await listWorkflows();
      setTasks(items as WorkflowTask[]);
    } catch (error) {
      handleApiError(error, OperationType.GET, 'workflows');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadWorkflows();
  }, [loadWorkflows]);

  const handleAction = async (taskId: string, action: 'approved' | 'rejected') => {
    try {
      const task = tasks.find(t => t.id === taskId);
      await updateWorkflowStatus(taskId, action);

      if (task) {
        await logAction(
          action === 'approved' ? 'Aprobación de Flujo' : 'Rechazo de Flujo',
          'Workflows',
          `Tarea: ${task.title} - Acción: ${action === 'approved' ? 'Aprobado' : 'Rechazado'}`,
          action === 'approved' ? 'update' : 'delete',
          { referenceId: task.referenceId, type: task.type }
        );
      }

      toast.success(`Tarea ${action === 'approved' ? 'aprobada' : 'rechazada'} correctamente`);
      await loadWorkflows();
    } catch (error) {
      handleApiError(error, OperationType.UPDATE, `workflows/${taskId}`);
    }
  };

  const handleSaveTask = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingTask) {
        await updateWorkflow(editingTask.id, formData);
        await logAction('Editar Tarea de Flujo', 'Workflows', `Se editó la tarea: ${formData.title}`, 'update');
        toast.success('Tarea actualizada correctamente');
      } else {
        await createWorkflow(formData);
        await logAction('Crear Tarea de Flujo', 'Workflows', `Se creó una nueva tarea: ${formData.title}`, 'create');
        toast.success('Tarea creada correctamente');
      }
      await loadWorkflows();
      setIsModalOpen(false);
      setEditingTask(null);
      resetForm();
    } catch (error) {
      handleApiError(error, editingTask ? OperationType.UPDATE : OperationType.CREATE, 'workflows');
    }
  };

  const handleDeleteTask = async () => {
    if (!taskToDelete) return;
    try {
      await deleteWorkflow(taskToDelete);
      await logAction('Eliminar Tarea de Flujo', 'Workflows', `Se eliminó la tarea ID: ${taskToDelete}`, 'delete');
      toast.success('Tarea eliminada correctamente');
      await loadWorkflows();
      setIsDeleteModalOpen(false);
      setTaskToDelete(null);
    } catch (error) {
      handleApiError(error, OperationType.DELETE, `workflows/${taskToDelete}`);
    }
  };

  const resetForm = () => {
    setFormData({
      title: '',
      type: 'other',
      referenceId: '',
      priority: 'medium',
      description: '',
      amount: 0,
      requestedBy: ''
    });
  };

  const openEditModal = (task: WorkflowTask) => {
    setEditingTask(task);
    setFormData({
      title: task.title,
      type: task.type,
      referenceId: task.referenceId,
      priority: task.priority,
      description: task.description,
      amount: task.amount || 0,
      requestedBy: task.requestedBy
    });
    setIsModalOpen(true);
  };

  const filteredTasks = useMemo(() => 
    tasks.filter(task => {
      const matchesFilter = filter === 'all' || task.status === filter;
      const matchesSearch = task.title.toLowerCase().includes(searchTerm.toLowerCase()) || 
                           task.referenceId.toLowerCase().includes(searchTerm.toLowerCase());
      return matchesFilter && matchesSearch;
    }), 
    [tasks, filter, searchTerm]
  );

  const stats = useMemo(() => ({
    pending: tasks.filter(t => t.status === 'pending').length,
    approved: tasks.filter(t => t.status === 'approved').length,
    rejected: tasks.filter(t => t.status === 'rejected').length
  }), [tasks]);

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight uppercase">
            Flujos de Trabajo
          </h1>
          <p className="text-slate-500 dark:text-slate-400 font-medium">
            Gestión de aprobaciones y procesos operativos
          </p>
        </div>
        <button
          onClick={() => {
            setEditingTask(null);
            resetForm();
            setIsModalOpen(true);
          }}
          className="flex items-center gap-2 bg-primary text-white font-bold py-3 px-6 rounded-2xl hover:bg-primary-hover transition-all shadow-lg shadow-primary-shadow"
        >
          <Plus size={20} />
          Nueva Tarea
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {[
          { label: 'Pendientes', value: stats.pending, icon: Clock, color: 'text-amber-500', bg: 'bg-amber-50 dark:bg-amber-500/10' },
          { label: 'Aprobados', value: stats.approved, icon: CheckCircle2, color: 'text-emerald-500', bg: 'bg-emerald-50 dark:bg-emerald-500/10' },
          { label: 'Rechazados', value: stats.rejected, icon: XCircle, color: 'text-rose-500', bg: 'bg-rose-50 dark:bg-rose-500/10' }
        ].map((stat, i) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-100 dark:border-slate-800 shadow-sm"
          >
            <div className="flex items-center gap-4">
              <div className={cn("p-3 rounded-2xl", stat.bg)}>
                <stat.icon className={stat.color} size={24} />
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{stat.label}</p>
                <p className="text-2xl font-black text-slate-900 dark:text-white">{stat.value}</p>
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-100 dark:border-slate-800 shadow-xl overflow-hidden">
        <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-800 p-1 rounded-2xl w-fit">
            {(['pending', 'approved', 'rejected', 'all'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={cn(
                  "px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
                  filter === f 
                    ? "bg-white dark:bg-slate-700 text-primary shadow-sm" 
                    : "text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                )}
              >
                {f === 'pending' ? 'Pendientes' : f === 'approved' ? 'Aprobados' : f === 'rejected' ? 'Rechazados' : 'Todos'}
              </button>
            ))}
          </div>

          <div className="relative flex-1 md:max-w-xs">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input
              type="text"
              placeholder="Buscar por título o ID..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-12 pr-4 py-3 bg-slate-50 dark:bg-slate-800 border-none rounded-2xl text-sm focus:ring-2 focus:ring-primary/20 transition-all"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/50 dark:bg-slate-800/50">
                <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Tarea / Referencia</th>
                <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Solicitante</th>
                <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Prioridad</th>
                <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Monto</th>
                <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Estado</th>
                <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
                  </td>
                </tr>
              ) : filteredTasks.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-slate-400 italic text-sm">
                    No se encontraron tareas de flujo de trabajo
                  </td>
                </tr>
              ) : (
                filteredTasks.map((task) => (
                  <tr key={task.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors group">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className={cn(
                          "w-10 h-10 rounded-xl flex items-center justify-center",
                          task.type === 'quote' ? "bg-blue-50 dark:bg-blue-500/10 text-blue-500" :
                          task.type === 'purchase_order' ? "bg-amber-50 dark:bg-amber-500/10 text-amber-500" :
                          "bg-purple-50 dark:bg-purple-500/10 text-purple-500"
                        )}>
                          {task.type === 'quote' ? <FileText size={20} /> : 
                           task.type === 'purchase_order' ? <ShoppingBag size={20} /> : 
                           <CheckSquare size={20} />}
                        </div>
                        <div>
                          <p className="text-sm font-black text-slate-900 dark:text-white leading-tight">{task.title}</p>
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">ID: {task.referenceId}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                          <User size={12} className="text-slate-400" />
                        </div>
                        <span className="text-xs font-bold text-slate-600 dark:text-slate-300">{task.requestedBy}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={cn(
                        "px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-tighter",
                        task.priority === 'high' ? "bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-400" :
                        task.priority === 'medium' ? "bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400" :
                        "bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400"
                      )}>
                        {task.priority === 'high' ? 'Alta' : task.priority === 'medium' ? 'Media' : 'Baja'}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm font-black text-slate-900 dark:text-white">
                        {task.amount ? `$${task.amount.toLocaleString()}` : '-'}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <div className={cn(
                          "w-2 h-2 rounded-full",
                          task.status === 'approved' ? "bg-emerald-500" :
                          task.status === 'rejected' ? "bg-rose-500" :
                          "bg-amber-500 animate-pulse"
                        )} />
                        <span className={cn(
                          "text-[10px] font-black uppercase tracking-widest",
                          task.status === 'approved' ? "text-emerald-600" :
                          task.status === 'rejected' ? "text-rose-600" :
                          "text-amber-600"
                        )}>
                          {task.status === 'approved' ? 'Aprobado' : task.status === 'rejected' ? 'Rechazado' : 'Pendiente'}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        {task.status === 'pending' && (
                          <>
                            <button
                              onClick={() => handleAction(task.id, 'approved')}
                              className="p-2 bg-emerald-50 text-emerald-600 hover:bg-emerald-100 rounded-xl transition-colors"
                              title="Aprobar"
                            >
                              <CheckCircle2 size={18} />
                            </button>
                            <button
                              onClick={() => handleAction(task.id, 'rejected')}
                              className="p-2 bg-rose-50 text-rose-600 hover:bg-rose-100 rounded-xl transition-colors"
                              title="Rechazar"
                            >
                              <XCircle size={18} />
                            </button>
                          </>
                        )}
                        <button
                          onClick={() => openEditModal(task)}
                          className="p-2 bg-blue-50 text-blue-600 hover:bg-blue-100 rounded-xl transition-colors"
                          title="Editar"
                        >
                          <Edit2 size={18} />
                        </button>
                        <button
                          onClick={() => {
                            setTaskToDelete(task.id);
                            setIsDeleteModalOpen(true);
                          }}
                          className="p-2 bg-rose-50 text-rose-600 hover:bg-rose-100 rounded-xl transition-colors"
                          title="Eliminar"
                        >
                          <Trash2 size={18} />
                        </button>
                        <button
                          className="p-2 bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700 rounded-xl transition-colors"
                          title="Ver Detalles"
                        >
                          <Eye size={18} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit/Add Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden"
            >
              <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                <h2 className="text-xl font-black text-slate-900 dark:text-white uppercase tracking-tight">
                  {editingTask ? 'Editar Tarea' : 'Nueva Tarea de Flujo'}
                </h2>
                <button title="Cerrar formulario" aria-label="Cerrar formulario" onClick={() => setIsModalOpen(false)} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors">
                  <XCircle size={20} className="text-slate-400" />
                </button>
              </div>

              <form onSubmit={handleSaveTask} className="p-6 space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Título de la Tarea</label>
                    <input
                      required
                      type="text"
                      value={formData.title}
                      onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                      className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border-none rounded-2xl text-sm focus:ring-2 focus:ring-primary/20 transition-all"
                      placeholder="Ej: Aprobación de Compra de Cemento"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Tipo de Proceso</label>
                    <select
                      title="Tipo de proceso"
                      aria-label="Tipo de proceso"
                      value={formData.type}
                      onChange={(e) => setFormData({ ...formData, type: e.target.value as any })}
                      className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border-none rounded-2xl text-sm focus:ring-2 focus:ring-primary/20 transition-all"
                    >
                      <option value="quote">Cotización</option>
                      <option value="purchase_order">Orden de Compra</option>
                      <option value="subcontract">Subcontrato</option>
                      <option value="other">Otro</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">ID de Referencia</label>
                    <input
                      required
                      type="text"
                      value={formData.referenceId}
                      onChange={(e) => setFormData({ ...formData, referenceId: e.target.value })}
                      className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border-none rounded-2xl text-sm focus:ring-2 focus:ring-primary/20 transition-all"
                      placeholder="Ej: OC-2024-001"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Prioridad</label>
                    <select
                      title="Prioridad"
                      aria-label="Prioridad"
                      value={formData.priority}
                      onChange={(e) => setFormData({ ...formData, priority: e.target.value as any })}
                      className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border-none rounded-2xl text-sm focus:ring-2 focus:ring-primary/20 transition-all"
                    >
                      <option value="low">Baja</option>
                      <option value="medium">Media</option>
                      <option value="high">Alta</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Monto (Opcional)</label>
                    <input
                      type="number"
                      title="Monto"
                      placeholder="Monto"
                      value={formData.amount}
                      onChange={(e) => setFormData({ ...formData, amount: Number(e.target.value) })}
                      className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border-none rounded-2xl text-sm focus:ring-2 focus:ring-primary/20 transition-all"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Solicitante</label>
                    <input
                      required
                      type="text"
                      value={formData.requestedBy}
                      onChange={(e) => setFormData({ ...formData, requestedBy: e.target.value })}
                      className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border-none rounded-2xl text-sm focus:ring-2 focus:ring-primary/20 transition-all"
                      placeholder="Nombre del solicitante"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Descripción / Detalles</label>
                  <textarea
                    required
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    rows={3}
                    className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border-none rounded-2xl text-sm focus:ring-2 focus:ring-primary/20 transition-all resize-none"
                    placeholder="Detalles adicionales sobre la solicitud de aprobación..."
                  />
                </div>

                <div className="flex justify-end gap-3 pt-4">
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="px-6 py-3 text-sm font-bold text-slate-500 hover:text-slate-700 transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="px-8 py-3 bg-primary text-white font-bold rounded-2xl hover:bg-primary-hover transition-all shadow-lg shadow-primary-shadow"
                  >
                    {editingTask ? 'Guardar Cambios' : 'Crear Tarea'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {isDeleteModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl w-full max-w-md overflow-hidden"
            >
              <div className="p-8 text-center">
                <div className="w-20 h-20 bg-rose-50 dark:bg-rose-500/10 text-rose-500 rounded-full flex items-center justify-center mx-auto mb-6">
                  <AlertTriangle size={40} />
                </div>
                <h2 className="text-2xl font-black text-slate-900 dark:text-white uppercase tracking-tight mb-2">
                  ¿Eliminar Tarea?
                </h2>
                <p className="text-slate-500 dark:text-slate-400 mb-8">
                  Esta acción no se puede deshacer. La tarea de flujo de trabajo será eliminada permanentemente.
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={() => setIsDeleteModalOpen(false)}
                    className="flex-1 px-6 py-4 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold rounded-2xl hover:bg-slate-200 dark:hover:bg-slate-700 transition-all"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleDeleteTask}
                    className="flex-1 px-6 py-4 bg-rose-500 text-white font-bold rounded-2xl hover:bg-rose-600 transition-all shadow-lg shadow-rose-500/20"
                  >
                    Eliminar
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default Workflows;
