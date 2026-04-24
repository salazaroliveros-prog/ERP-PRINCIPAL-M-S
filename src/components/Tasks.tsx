import React, { useEffect, useState, useCallback } from 'react';
import { Plus, Trash2, CheckCircle2, Circle, Clock, AlertCircle, Search, Filter } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'sonner';
import { cn } from '../lib/utils';
import {
  Task,
  TaskStatus,
  TaskPriority,
  fetchTasks,
  createTask,
  updateTask,
  deleteTask,
} from '../lib/tasksApi';
import { listProjects } from '../lib/projectsApi';

const STATUS_LABELS: Record<TaskStatus, string> = {
  pending: 'Pendiente',
  in_progress: 'En Progreso',
  done: 'Completada',
  cancelled: 'Cancelada',
};

const PRIORITY_LABELS: Record<TaskPriority, string> = {
  low: 'Baja',
  medium: 'Media',
  high: 'Alta',
  critical: 'Crítica',
};

const STATUS_COLORS: Record<TaskStatus, string> = {
  pending: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  in_progress: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  done: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  cancelled: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300',
};

const PRIORITY_COLORS: Record<TaskPriority, string> = {
  low: 'text-slate-400',
  medium: 'text-amber-500',
  high: 'text-rose-500',
  critical: 'text-red-600',
};

const PRIORITY_BADGE: Record<TaskPriority, string> = {
  low: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
  medium: 'bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-300',
  high: 'bg-rose-100 text-rose-600 dark:bg-rose-900/40 dark:text-rose-300',
  critical: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
};

// Ciclo de estados al hacer click en el ícono
const STATUS_CYCLE: Record<TaskStatus, TaskStatus> = {
  pending: 'in_progress',
  in_progress: 'done',
  done: 'pending',
  cancelled: 'pending',
};

const EMPTY_FORM = {
  title: '',
  description: '',
  status: 'pending' as TaskStatus,
  priority: 'medium' as TaskPriority,
  projectId: '',
  assigneeName: '',
  dueDate: '',
};

export default function Tasks() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<TaskStatus | ''>('');
  const [filterPriority, setFilterPriority] = useState<TaskPriority | ''>('');
  const [filterProjectId, setFilterProjectId] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [tasksRes, projectsRes] = await Promise.all([
        fetchTasks({
          status: filterStatus || undefined,
          priority: filterPriority || undefined,
          projectId: filterProjectId || undefined,
        }),
        listProjects(),
      ]);
      setTasks(tasksRes.items);
      setProjects(projectsRes.map((p) => ({ id: p.id, name: p.name })));
    } catch {
      toast.error('No se pudieron cargar las tareas');
    } finally {
      setLoading(false);
    }
  }, [filterStatus, filterPriority, filterProjectId]);

  useEffect(() => { void load(); }, [load]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) { toast.error('El título es obligatorio'); return; }
    setSaving(true);
    try {
      const payload = {
        title: form.title.trim(),
        description: form.description.trim() || undefined,
        status: form.status,
        priority: form.priority,
        projectId: form.projectId || undefined,
        assigneeName: form.assigneeName.trim() || undefined,
        dueDate: form.dueDate || undefined,
      };
      if (editingId) {
        const updated = await updateTask(editingId, payload);
        setTasks((prev) => prev.map((t) => (t.id === editingId ? updated : t)));
        toast.success('Tarea actualizada');
      } else {
        const created = await createTask(payload);
        setTasks((prev) => [created, ...prev]);
        toast.success('Tarea creada');
      }
      setForm(EMPTY_FORM);
      setShowForm(false);
      setEditingId(null);
    } catch {
      toast.error('No se pudo guardar la tarea');
    } finally {
      setSaving(false);
    }
  };

  const handleCycleStatus = async (task: Task) => {
    const next = STATUS_CYCLE[task.status];
    try {
      const updated = await updateTask(task.id, { status: next });
      setTasks((prev) => prev.map((t) => (t.id === task.id ? updated : t)));
    } catch {
      toast.error('No se pudo actualizar el estado');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteTask(id);
      setTasks((prev) => prev.filter((t) => t.id !== id));
      toast.success('Tarea eliminada');
    } catch {
      toast.error('No se pudo eliminar la tarea');
    }
  };

  const handleEdit = (task: Task) => {
    setForm({
      title: task.title,
      description: task.description || '',
      status: task.status,
      priority: task.priority,
      projectId: task.projectId || '',
      assigneeName: task.assigneeName || '',
      dueDate: task.dueDate || '',
    });
    setEditingId(task.id);
    setShowForm(true);
  };

  const today = new Date().toISOString().split('T')[0];

  const visibleTasks = searchTerm.trim()
    ? tasks.filter((t) =>
        t.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (t.description || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (t.assigneeName || '').toLowerCase().includes(searchTerm.toLowerCase())
      )
    : tasks;

  const counts = {
    pending: tasks.filter((t) => t.status === 'pending').length,
    in_progress: tasks.filter((t) => t.status === 'in_progress').length,
    done: tasks.filter((t) => t.status === 'done').length,
    overdue: tasks.filter((t) => t.dueDate && t.status !== 'done' && t.status !== 'cancelled' && t.dueDate < today).length,
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight">
            Gestión de Tareas
          </h1>
          <div className="flex flex-wrap gap-3 mt-1">
            {[
              { label: 'Pendientes', count: counts.pending, color: 'text-slate-500' },
              { label: 'En Progreso', count: counts.in_progress, color: 'text-blue-500' },
              { label: 'Completadas', count: counts.done, color: 'text-emerald-500' },
              ...(counts.overdue > 0 ? [{ label: 'Vencidas', count: counts.overdue, color: 'text-red-500' }] : []),
            ].map(({ label, count, color }) => (
              <span key={label} className={cn('text-xs font-bold', color)}>
                {count} {label}
              </span>
            ))}
          </div>
        </div>
        <button
          onClick={() => { setForm(EMPTY_FORM); setEditingId(null); setShowForm(true); }}
          className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-xl text-xs font-black uppercase tracking-wider hover:bg-primary-hover transition-colors shadow-sm"
        >
          <Plus size={15} /> Nueva Tarea
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar tareas..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-8 pr-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-primary/30 w-44"
          />
        </div>
        <Filter size={14} className="text-slate-400 shrink-0" />
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value as TaskStatus | '')}
          className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-primary/30"
        >
          <option value="">Todos los estados</option>
          {(Object.keys(STATUS_LABELS) as TaskStatus[]).map((s) => (
            <option key={s} value={s}>{STATUS_LABELS[s]}</option>
          ))}
        </select>
        <select
          value={filterPriority}
          onChange={(e) => setFilterPriority(e.target.value as TaskPriority | '')}
          className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-primary/30"
        >
          <option value="">Todas las prioridades</option>
          {(Object.keys(PRIORITY_LABELS) as TaskPriority[]).map((p) => (
            <option key={p} value={p}>{PRIORITY_LABELS[p]}</option>
          ))}
        </select>
        <select
          value={filterProjectId}
          onChange={(e) => setFilterProjectId(e.target.value)}
          className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-primary/30"
        >
          <option value="">Todos los proyectos</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        {(filterStatus || filterPriority || filterProjectId || searchTerm) && (
          <button
            onClick={() => { setFilterStatus(''); setFilterPriority(''); setFilterProjectId(''); setSearchTerm(''); }}
            className="text-[10px] font-black uppercase tracking-wider text-slate-400 hover:text-rose-500 transition-colors"
          >
            Limpiar filtros
          </button>
        )}
      </div>

      {/* Form Modal */}
      <AnimatePresence>
        {showForm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm"
            onClick={(e) => { if (e.target === e.currentTarget) { setShowForm(false); setEditingId(null); } }}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="w-full max-w-lg bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-100 dark:border-slate-800 p-6"
            >
              <h2 className="text-sm font-black uppercase tracking-widest text-slate-900 dark:text-white mb-5">
                {editingId ? 'Editar Tarea' : 'Nueva Tarea'}
              </h2>
              <form onSubmit={handleSubmit} className="space-y-4">
                <input
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  placeholder="Título de la tarea *"
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-semibold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
                <textarea
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  placeholder="Descripción (opcional)"
                  rows={2}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
                />
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1 block">Estado</label>
                    <select
                      value={form.status}
                      onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as TaskStatus }))}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-primary/30"
                    >
                      {(Object.keys(STATUS_LABELS) as TaskStatus[]).map((s) => (
                        <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1 block">Prioridad</label>
                    <select
                      value={form.priority}
                      onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value as TaskPriority }))}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-primary/30"
                    >
                      {(Object.keys(PRIORITY_LABELS) as TaskPriority[]).map((p) => (
                        <option key={p} value={p}>{PRIORITY_LABELS[p]}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1 block">Proyecto</label>
                    <select
                      value={form.projectId}
                      onChange={(e) => setForm((f) => ({ ...f, projectId: e.target.value }))}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-primary/30"
                    >
                      <option value="">Sin proyecto</option>
                      {projects.map((p) => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1 block">Fecha límite</label>
                    <input
                      type="date"
                      value={form.dueDate}
                      onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                  </div>
                </div>
                <input
                  value={form.assigneeName}
                  onChange={(e) => setForm((f) => ({ ...f, assigneeName: e.target.value }))}
                  placeholder="Responsable (nombre)"
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
                <div className="flex justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => { setShowForm(false); setEditingId(null); }}
                    className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-black uppercase tracking-wider text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="px-4 py-2 rounded-xl bg-primary text-white text-xs font-black uppercase tracking-wider hover:bg-primary-hover transition-colors disabled:opacity-50"
                  >
                    {saving ? 'Guardando...' : editingId ? 'Actualizar' : 'Crear'}
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Task List */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="h-8 w-8 rounded-full border-2 border-primary/25 border-t-primary animate-spin" />
        </div>
      ) : visibleTasks.length === 0 ? (
        <div className="text-center py-16 text-slate-400 dark:text-slate-500">
          <CheckCircle2 size={40} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm font-semibold">No hay tareas</p>
          <p className="text-xs mt-1">
            {searchTerm || filterStatus || filterPriority || filterProjectId
              ? 'Prueba ajustando los filtros'
              : 'Crea la primera tarea con el botón de arriba'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          <AnimatePresence initial={false}>
            {visibleTasks.map((task) => {
              const project = projects.find((p) => p.id === task.projectId);
              const isOverdue = task.dueDate && task.status !== 'done' && task.status !== 'cancelled' && task.dueDate < today;
              const isCritical = task.priority === 'critical';
              return (
                <motion.div
                  key={task.id}
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className={cn(
                    'flex items-start gap-3 p-4 rounded-2xl border bg-white dark:bg-slate-900 transition-all group',
                    task.status === 'done' && 'opacity-60',
                    isCritical && task.status !== 'done' ? 'border-red-200 dark:border-red-900/50' : 'border-slate-100 dark:border-slate-800 hover:border-primary/30',
                    isOverdue && 'border-rose-200 dark:border-rose-900/40'
                  )}
                >
                  {/* Status cycle button */}
                  <button
                    onClick={() => handleCycleStatus(task)}
                    className="mt-0.5 shrink-0 transition-colors"
                    title={`Estado: ${STATUS_LABELS[task.status]} → click para avanzar`}
                  >
                    {task.status === 'done'
                      ? <CheckCircle2 size={20} className="text-emerald-500" />
                      : task.status === 'in_progress'
                        ? <Clock size={20} className="text-blue-500" />
                        : task.status === 'cancelled'
                          ? <Circle size={20} className="text-slate-300" />
                          : <Circle size={20} className="text-slate-300 hover:text-primary dark:text-slate-600 dark:hover:text-primary" />
                    }
                  </button>

                  <div className="flex-1 min-w-0 cursor-pointer" onClick={() => handleEdit(task)}>
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <p className={cn('text-sm font-black text-slate-900 dark:text-white truncate', task.status === 'done' && 'line-through')}>
                        {task.title}
                      </p>
                      <span className={cn('text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full', STATUS_COLORS[task.status])}>
                        {STATUS_LABELS[task.status]}
                      </span>
                      <span className={cn('text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full flex items-center gap-1', PRIORITY_BADGE[task.priority])}>
                        <AlertCircle size={10} className={PRIORITY_COLORS[task.priority]} />
                        {PRIORITY_LABELS[task.priority]}
                      </span>
                    </div>
                    {task.description && (
                      <p className="text-xs text-slate-500 dark:text-slate-400 truncate mb-1">{task.description}</p>
                    )}
                    <div className="flex flex-wrap gap-3 text-[10px] text-slate-400 dark:text-slate-500 font-semibold">
                      {project && <span>📁 {project.name}</span>}
                      {task.assigneeName && <span>👤 {task.assigneeName}</span>}
                      {task.dueDate && (
                        <span className={cn(isOverdue && 'text-rose-500 font-black')}>
                          📅 {new Date(task.dueDate + 'T00:00:00').toLocaleDateString('es-GT')}
                          {isOverdue && ' · Vencida'}
                        </span>
                      )}
                    </div>
                  </div>

                  <button
                    onClick={() => handleDelete(task.id)}
                    className="shrink-0 p-1.5 text-slate-300 hover:text-rose-500 dark:text-slate-600 dark:hover:text-rose-400 transition-colors opacity-0 group-hover:opacity-100"
                    title="Eliminar tarea"
                  >
                    <Trash2 size={15} />
                  </button>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
