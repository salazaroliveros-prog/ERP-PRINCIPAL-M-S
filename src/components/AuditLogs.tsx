import React, { useState, useEffect, useMemo } from 'react';
import { 
  History, 
  Search, 
  Filter, 
  Calendar as CalendarIcon,
  User,
  Activity,
  Database,
  Shield,
  ArrowRight,
  Download,
  Trash2,
  Edit3,
  PlusCircle,
  LogIn,
  LogOut,
  X,
  AlertTriangle,
  Info
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import { listAuditLogs } from '../lib/auditApi';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { toast } from 'sonner';
import ConfirmModal from './ConfirmModal';
import { FormModal } from './FormModal';
import { FormSection, FormInput } from './FormLayout';

interface AuditLog {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  action: string;
  module: string;
  details: string;
  timestamp: any;
  ipAddress?: string;
  userAgent?: string;
  type: 'create' | 'update' | 'delete' | 'auth' | 'system';
}

const AuditLogs = () => {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'create' | 'update' | 'delete' | 'auth' | 'system'>('all');
  const [hasMore, setHasMore] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const loadInitial = async () => {
      try {
        setLoading(true);
        const response = await listAuditLogs({ limit: 20, offset: 0 });
        if (cancelled) return;
        setLogs(response.items as AuditLog[]);
        setHasMore(Boolean(response.hasMore));
      } catch (error) {
        if (!cancelled) {
          toast.error('No se pudieron cargar los logs de auditoria');
          console.error('Error loading audit logs:', error);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    loadInitial();
    return () => {
      cancelled = true;
    };
  }, []);

  const loadMore = async () => {
    if (!hasMore) return;

    try {
      const response = await listAuditLogs({ limit: 20, offset: logs.length });
      setLogs(prev => [...prev, ...(response.items as AuditLog[])]);
      setHasMore(Boolean(response.hasMore));
    } catch (error) {
      toast.error('No se pudieron cargar mas registros');
      console.error('Error loading more audit logs:', error);
    }
  };

  const filteredLogs = useMemo(() => 
    logs.filter(log => {
      const matchesType = filterType === 'all' || log.type === filterType;
      const matchesSearch = 
        log.userName.toLowerCase().includes(searchTerm.toLowerCase()) || 
        log.action.toLowerCase().includes(searchTerm.toLowerCase()) ||
        log.module.toLowerCase().includes(searchTerm.toLowerCase());
      return matchesType && matchesSearch;
    }), [logs, filterType, searchTerm]
  );

  const getActionIcon = (type: string) => {
    switch (type) {
      case 'create': return <PlusCircle size={14} className="text-emerald-500" />;
      case 'update': return <Edit3 size={14} className="text-amber-500" />;
      case 'delete': return <Trash2 size={14} className="text-rose-500" />;
      case 'auth': return <LogIn size={14} className="text-blue-500" />;
      case 'system': return <Shield size={14} className="text-purple-500" />;
      default: return <Activity size={14} className="text-slate-400" />;
    }
  };

  return (
    <div className="space-y-4 sm:space-y-8 min-w-0 overflow-x-hidden">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-3xl font-black text-slate-900 dark:text-white tracking-tight uppercase">
            Auditoría
          </h1>
          <p className="text-[10px] sm:text-sm text-slate-500 dark:text-slate-400 font-medium">
            Trazabilidad completa de acciones y cambios en el sistema
          </p>
        </div>
        <button className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 sm:px-6 py-2.5 sm:py-3 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-xl sm:rounded-2xl text-[10px] sm:text-sm font-black uppercase tracking-widest text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all shadow-sm">
          <Download size={14} className="sm:w-4.5 sm:h-4.5" />
          Exportar Logs
        </button>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-2xl sm:rounded-3xl border border-slate-100 dark:border-slate-800 shadow-xl overflow-hidden">
        <div className="p-4 sm:p-6 border-b border-slate-100 dark:border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-1.5 sm:gap-2 bg-slate-50 dark:bg-slate-800 p-1 rounded-xl sm:rounded-2xl overflow-x-auto custom-scrollbar no-scrollbar">
            {(['all', 'create', 'update', 'delete', 'auth', 'system'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setFilterType(t)}
                className={cn(
                  "px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg sm:rounded-xl text-[8px] sm:text-[9px] font-black uppercase tracking-widest transition-all whitespace-nowrap",
                  filterType === t 
                    ? "bg-white dark:bg-slate-700 text-primary shadow-sm" 
                    : "text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                )}
              >
                {t === 'all' ? 'Todos' : t === 'create' ? 'Creación' : t === 'update' ? 'Edición' : t === 'delete' ? 'Eliminación' : t === 'auth' ? 'Acceso' : 'Sistema'}
              </button>
            ))}
          </div>

          <div className="relative flex-1 md:max-w-xs">
            <Search className="absolute left-3 sm:left-4 top-1/2 -translate-y-1/2 text-slate-400 sm:w-4.5 sm:h-4.5" size={14} />
            <input
              type="text"
              placeholder="Buscar por usuario, acción..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 sm:pl-12 pr-4 py-2 sm:py-3 bg-slate-50 dark:bg-slate-800 border-none rounded-xl sm:rounded-2xl text-xs sm:text-sm focus:ring-2 focus:ring-primary/20 transition-all"
            />
          </div>
        </div>

        <div className="overflow-x-auto lg:overflow-x-hidden">
          <table className="w-full text-left border-collapse table-fixed">
            <thead>
              <tr className="bg-slate-50/50 dark:bg-slate-800/50">
                <th className="px-4 sm:px-6 py-3 sm:py-4 text-[9px] sm:text-[10px] font-black uppercase tracking-widest text-slate-400">Fecha y Hora</th>
                <th className="px-4 sm:px-6 py-3 sm:py-4 text-[9px] sm:text-[10px] font-black uppercase tracking-widest text-slate-400">Usuario</th>
                <th className="px-4 sm:px-6 py-3 sm:py-4 text-[9px] sm:text-[10px] font-black uppercase tracking-widest text-slate-400">Acción</th>
                <th className="px-4 sm:px-6 py-3 sm:py-4 text-[9px] sm:text-[10px] font-black uppercase tracking-widest text-slate-400">Módulo</th>
                <th className="px-4 sm:px-6 py-3 sm:py-4 text-[9px] sm:text-[10px] font-black uppercase tracking-widest text-slate-400">Detalles</th>
                <th className="px-4 sm:px-6 py-3 sm:py-4 text-[9px] sm:text-[10px] font-black uppercase tracking-widest text-slate-400">Tipo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-4 sm:px-6 py-8 sm:py-12 text-center">
                    <div className="animate-spin rounded-full h-6 w-6 sm:h-8 sm:w-8 border-b-2 border-primary mx-auto"></div>
                  </td>
                </tr>
              ) : filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 sm:px-6 py-8 sm:py-12 text-center text-slate-400 italic text-[10px] sm:text-sm">
                    No se encontraron registros de auditoría
                  </td>
                </tr>
              ) : (
                filteredLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors group">
                    <td className="px-4 sm:px-6 py-3 sm:py-4 whitespace-nowrap">
                      <div className="flex items-center gap-1.5 sm:gap-2">
                        <CalendarIcon size={12} className="text-slate-400 sm:w-3.5 sm:h-3.5" />
                        <span className="text-[10px] sm:text-xs font-bold text-slate-600 dark:text-slate-300">
                          {log.timestamp ? format(new Date(log.timestamp), "dd MMM yyyy, HH:mm", { locale: es }) : 'Reciente'}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 sm:px-6 py-3 sm:py-4">
                      <div className="flex items-center gap-2 sm:gap-3">
                        <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                          <User size={12} className="text-slate-400 sm:w-3.5 sm:h-3.5" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-[10px] sm:text-xs font-black text-slate-900 dark:text-white truncate leading-tight">{log.userName}</p>
                          <p className="text-[8px] sm:text-[9px] font-bold text-slate-400 uppercase truncate tracking-tighter">{log.userEmail}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 sm:px-6 py-3 sm:py-4">
                      <div className="flex items-center gap-1.5 sm:gap-2">
                        {getActionIcon(log.type)}
                        <span className="text-[10px] sm:text-xs font-bold text-slate-700 dark:text-slate-200">{log.action}</span>
                      </div>
                    </td>
                    <td className="px-4 sm:px-6 py-3 sm:py-4">
                      <span className="text-[8px] sm:text-[10px] font-black uppercase tracking-widest text-slate-400 bg-slate-100 dark:bg-slate-800 px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-md">
                        {log.module}
                      </span>
                    </td>
                    <td className="px-4 sm:px-6 py-3 sm:py-4">
                      <p className="text-[10px] sm:text-xs text-slate-500 dark:text-slate-400 max-w-[120px] sm:max-w-xs truncate" title={log.details}>
                        {log.details}
                      </p>
                    </td>
                    <td className="px-4 sm:px-6 py-3 sm:py-4">
                      <span className={cn(
                        "px-1.5 sm:px-2.5 py-0.5 sm:py-1 rounded-full text-[8px] sm:text-[9px] font-black uppercase tracking-tighter",
                        log.type === 'create' ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400" :
                        log.type === 'update' ? "bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400" :
                        log.type === 'delete' ? "bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-400" :
                        log.type === 'auth' ? "bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400" :
                        "bg-purple-50 text-purple-600 dark:bg-purple-500/10 dark:text-purple-400"
                      )}>
                        {log.type}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {hasMore && !loading && (
          <div className="p-4 sm:p-6 text-center border-t border-slate-100 dark:border-slate-800">
            <button
              onClick={loadMore}
              className="px-4 sm:px-6 py-2 bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded-xl text-[10px] sm:text-xs font-black uppercase tracking-widest hover:bg-slate-100 dark:hover:bg-slate-700 transition-all"
            >
              Cargar más registros
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default AuditLogs;
