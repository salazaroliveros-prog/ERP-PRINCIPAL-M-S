import React, { useCallback, useEffect, useState, useMemo } from 'react';
import { 
  Plus, 
  Search, 
  HardHat, 
  Calendar, 
  DollarSign, 
  Clock,
  CheckCircle2,
  AlertCircle,
  X,
  Trash2,
  Construction,
  Edit2,
  Info,
  ChevronLeft,
  ChevronRight,
  LayoutGrid,
  List,
  Sparkles,
  Loader2
} from 'lucide-react';
import { GoogleGenAI, Type } from "@google/genai";
import { StepForm, FormSection, FormInput, FormSelect } from './FormLayout';
import { formatCurrency, formatDate, cn, handleApiError, OperationType } from '../lib/utils';
import { logAction } from '../lib/audit';
import { toast } from 'sonner';
import { sendNotification } from '../lib/notifications';
import { FormModal } from './FormModal';
import { motion } from 'motion/react';
import DatePicker from 'react-datepicker';
import "react-datepicker/dist/react-datepicker.css";
import ConfirmModal from './ConfirmModal';
import { listProjects, listProjectBudgetItemsDetailed } from '../lib/projectsApi';
import { createSubcontract, deleteSubcontract, listSubcontracts, updateSubcontract } from '../lib/subcontractsApi';
import { createTransaction, listTransactions } from '../lib/financialsApi';

export default function Subcontracts() {
  const projectCardEffectClass = 'rounded-[var(--radius-theme)] shadow-[var(--shadow-theme)] border border-slate-100 dark:border-slate-800 hover:shadow-lg hover:border-primary/30 hover:-translate-y-0.5 transition-all duration-500';

  const toLocalISODate = (date: Date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  };

  const parseLocalISODate = (value: string) => {
    if (!value) return null;
    const [y, m, d] = value.split('-').map(Number);
    if (!y || !m || !d) return null;
    return new Date(y, m - 1, d);
  };

  const [subcontracts, setSubcontracts] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [budgetItems, setBudgetItems] = useState<any[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingSub, setEditingSub] = useState<any>(null);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [selectedSubForPayment, setSelectedSubForPayment] = useState<any>(null);
  const [selectedSubDetails, setSelectedSubDetails] = useState<any>(null);
  const [subTransactions, setSubTransactions] = useState<any[]>([]);
  const [paymentAmount, setPaymentAmount] = useState<number>(0);
  const [paymentDate, setPaymentDate] = useState<string>(toLocalISODate(new Date()));
  const [subToDelete, setSubToDelete] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');
  const [isGenerating, setIsGenerating] = useState(false);

  const validateField = (name: string, value: any) => {
    let error = '';
    if (!value && value !== 0) {
      error = 'Este campo es obligatorio';
    } else if (name === 'total' && Number(value) <= 0) {
      error = 'El monto total debe ser mayor a cero';
    } else if (name === 'paid' && Number(value) < 0) {
      error = 'El monto pagado no puede ser negativo';
    }
    setValidationErrors(prev => ({ ...prev, [name]: error }));
    return !error;
  };

  const [newSub, setNewSub] = useState({
    projectId: '',
    budgetItemId: '',
    contractor: '',
    service: '',
    startDate: '',
    endDate: '',
    total: 0,
    paid: 0,
    status: 'Active'
  });

  const loadSubcontracts = useCallback(async () => {
    try {
      const items = await listSubcontracts();
      setSubcontracts(items);
    } catch (error) {
      handleApiError(error, OperationType.GET, 'subcontracts');
    }
  }, []);

  const loadProjects = useCallback(async () => {
    try {
      const items = await listProjects();
      setProjects(items);
    } catch (error) {
      handleApiError(error, OperationType.GET, 'projects');
    }
  }, []);

  useEffect(() => {
    if (!newSub.projectId) {
      setBudgetItems([]);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const items = await listProjectBudgetItemsDetailed(newSub.projectId);
        if (!cancelled) setBudgetItems(items);
      } catch (error) {
        if (!cancelled) handleApiError(error, OperationType.GET, `projects/${newSub.projectId}/budgetItems`);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [newSub.projectId]);

  useEffect(() => {
    (async () => {
      await Promise.all([loadSubcontracts(), loadProjects()]);
    })();
  }, [loadProjects, loadSubcontracts]);

  const filteredSubcontracts = useMemo(() => {
    return subcontracts.filter(sub => 
      sub.contractor.toLowerCase().includes(searchTerm.toLowerCase()) ||
      sub.service.toLowerCase().includes(searchTerm.toLowerCase()) ||
      projects.find(p => p.id === sub.projectId)?.name.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [subcontracts, searchTerm, projects]);

  const totalPages = Math.ceil(filteredSubcontracts.length / itemsPerPage);
  const paginatedSubcontracts = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredSubcontracts.slice(start, start + itemsPerPage);
  }, [filteredSubcontracts, currentPage, itemsPerPage]);

  const getProgressWidthClass = (value: number) => {
    if (!Number.isFinite(value) || value <= 0) return 'w-0';
    if (value >= 100) return 'w-full';
    if (value >= 95) return 'w-[95%]';
    if (value >= 90) return 'w-[90%]';
    if (value >= 85) return 'w-[85%]';
    if (value >= 80) return 'w-[80%]';
    if (value >= 75) return 'w-[75%]';
    if (value >= 70) return 'w-[70%]';
    if (value >= 65) return 'w-[65%]';
    if (value >= 60) return 'w-[60%]';
    if (value >= 55) return 'w-[55%]';
    if (value >= 50) return 'w-1/2';
    if (value >= 45) return 'w-[45%]';
    if (value >= 40) return 'w-2/5';
    if (value >= 35) return 'w-[35%]';
    if (value >= 30) return 'w-[30%]';
    if (value >= 25) return 'w-1/4';
    if (value >= 20) return 'w-1/5';
    if (value >= 15) return 'w-[15%]';
    if (value >= 10) return 'w-[10%]';
    if (value >= 5) return 'w-[5%]';
    return 'w-[1%]';
  };

  useEffect(() => {
    const checkExpirations = () => {
      const today = new Date();
      const nextWeek = new Date();
      nextWeek.setDate(today.getDate() + 7);

      subcontracts.forEach(sub => {
        if (sub.status === 'Active' && sub.endDate) {
          const endDate = new Date(sub.endDate);
          if (endDate > today && endDate <= nextWeek) {
            // Check if we already notified for this sub recently (e.g., today)
            // For simplicity, we'll just send it, but in a real app we'd track last notification date
            sendNotification(
              'Subcontrato por Vencer',
              `El subcontrato de ${sub.contractor} para ${sub.service} vence el ${formatDate(sub.endDate)}.`,
              'subcontract'
            );
          }
        }
      });
    };

    if (subcontracts.length > 0) {
      checkExpirations();
    }
  }, [subcontracts]);

  const handleDeleteSub = (id: string) => {
    setSubToDelete(id);
    setIsDeleteConfirmOpen(true);
  };

  const confirmDeleteSub = async () => {
    if (!subToDelete) return;
    try {
      const sub = subcontracts.find(s => s.id === subToDelete);
      await deleteSubcontract(subToDelete);
      setSubToDelete(null);
      setIsDeleteConfirmOpen(false);
      toast.success('Subcontrato eliminado exitosamente');
      await logAction('Eliminación de Subcontrato', 'Subcontratos', `Subcontrato con ${sub?.contractor || subToDelete} eliminado`, 'delete', { subcontractId: subToDelete });
      await loadSubcontracts();
    } catch (error) {
      handleApiError(error, OperationType.DELETE, `subcontracts/${subToDelete}`);
    }
  };

  const subcontractPendingDelete = subcontracts.find((sub) => sub.id === subToDelete);

  const handleAISuggestions = async () => {
    if (!newSub.service || !newSub.projectId) {
      toast.error('Por favor seleccione un proyecto e ingrese un servicio antes de sugerir');
      return;
    }

    setIsGenerating(true);
    try {
      const project = projects.find(p => p.id === newSub.projectId);
      const ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_GEMINI_API_KEY });
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: `Como experto en gestión de subcontratos de construcción, sugiere un monto total estimado en dólares para el servicio de "${newSub.service}" en el proyecto "${project?.name || 'seleccionado'}". Proporciona la respuesta en español.`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              suggestedTotal: {
                type: Type.NUMBER,
                description: "Monto total sugerido para el subcontrato."
              }
            },
            required: ["suggestedTotal"]
          }
        }
      });

      const suggestions = JSON.parse(response.text);
      toast.success('Sugerencia generada con éxito');
      if (suggestions.suggestedTotal) {
        setNewSub(prev => ({ ...prev, total: suggestions.suggestedTotal }));
      }
    } catch (error) {
      console.error('Error generating AI suggestions:', error);
      toast.error('Error al generar sugerencias con IA');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleAddSub = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    
    // Final validation
    const errors: Record<string, string> = {};
    if (!newSub.projectId) errors.projectId = 'El proyecto es obligatorio';
    if (!newSub.contractor) errors.contractor = 'El contratista es obligatorio';
    if (!newSub.service) errors.service = 'El servicio es obligatorio';
    if (!newSub.startDate) errors.startDate = 'La fecha de inicio de adquisición es obligatoria';
    if (!newSub.total || Number(newSub.total) <= 0) errors.total = 'El monto total debe ser mayor a cero';
    if (Number(newSub.paid) < 0) errors.paid = 'El monto pagado no puede ser negativo';
    if (Number(newSub.paid) > Number(newSub.total)) errors.paid = 'El monto pagado no puede exceder el total del contrato';
    
    if (newSub.startDate && newSub.endDate) {
      const start = new Date(newSub.startDate);
      const end = new Date(newSub.endDate);
      if (end < start) errors.endDate = 'La fecha de fin no puede ser anterior a la fecha de inicio';
    }
    
    if (Object.keys(errors).length > 0) {
      setValidationErrors(errors);
      toast.error('Por favor, corrija los errores en el formulario');
      return;
    }

    try {
      const budgetItem = budgetItems.find(i => i.id === newSub.budgetItemId);
      const subData = {
        ...newSub,
        budgetItemName: budgetItem?.description || '',
        total: Number(newSub.total),
        paid: Number(newSub.paid),
        status: Number(newSub.paid) >= Number(newSub.total) ? 'Finished' : newSub.status
      };

      if (editingSub) {
        await updateSubcontract(editingSub.id, subData);
        toast.success('Subcontrato actualizado exitosamente');
        await logAction('Edición de Subcontrato', 'Subcontratos', `Subcontrato con ${subData.contractor} actualizado`, 'update', { subcontractId: editingSub.id });
      } else {
        const duplicated = subcontracts.some(
          sub => sub.projectId === newSub.projectId && String(sub.service || '').trim().toLowerCase() === newSub.service.trim().toLowerCase()
        );
        if (duplicated) {
          toast.error(`Ya existe un subcontrato para el servicio "${newSub.service}" en este proyecto.`);
          return;
        }

        const created = await createSubcontract(subData);
        toast.success('Subcontrato registrado exitosamente');
        await logAction('Registro de Subcontrato', 'Subcontratos', `Nuevo subcontrato con ${subData.contractor} registrado`, 'create', { subcontractId: created.id });
      }

      await loadSubcontracts();
      setIsModalOpen(false);
      setEditingSub(null);
      setNewSub({ projectId: '', budgetItemId: '', contractor: '', service: '', startDate: '', endDate: '', total: 0, paid: 0, status: 'Active' });
      setCurrentStep(0);
    } catch (error) {
      handleApiError(error, OperationType.WRITE, 'subcontracts');
    }
  };

  useEffect(() => {
    if (!selectedSubDetails) {
      setSubTransactions([]);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const result = await listTransactions({ subcontractId: selectedSubDetails.id, limit: 200, offset: 0 });
        if (!cancelled) setSubTransactions(result.items);
      } catch (error) {
        if (!cancelled) handleApiError(error, OperationType.GET, `transactions (subcontract: ${selectedSubDetails.id})`);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedSubDetails]);

  const handleMarkAsPaid = async (sub: any) => {
    try {
      const remaining = sub.total - sub.paid;
      if (remaining > 0) {
        await createTransaction({
          projectId: sub.projectId,
          budgetItemId: sub.budgetItemId || '',
          subcontractId: sub.id,
          type: 'Expense',
          category: 'Subcontratos',
          amount: remaining,
          date: new Date().toISOString().split('T')[0],
          description: `Pago final - ${sub.service} (${sub.contractor})`,
        });
      }

      await updateSubcontract(sub.id, {
        paid: sub.total,
        status: 'Finished',
      });
      await loadSubcontracts();
      toast.success('Subcontrato saldado correctamente');
    } catch (error) {
      handleApiError(error, OperationType.UPDATE, `subcontracts/${sub.id}`);
    }
  };

  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSubForPayment || paymentAmount <= 0) return;
    if (!paymentDate) {
      toast.error('Selecciona una fecha de pago');
      return;
    }

    if (selectedSubForPayment.paid + paymentAmount > selectedSubForPayment.total) {
      toast.error('El monto total pagado no puede exceder el total del contrato');
      return;
    }

    const newPaid = selectedSubForPayment.paid + paymentAmount;
    try {
      await createTransaction({
        projectId: selectedSubForPayment.projectId,
        budgetItemId: selectedSubForPayment.budgetItemId || '',
        subcontractId: selectedSubForPayment.id,
        type: 'Expense',
        category: 'Subcontratos',
        amount: paymentAmount,
        date: paymentDate,
        description: `Pago parcial - ${selectedSubForPayment.service} (${selectedSubForPayment.contractor})`,
      });

      await updateSubcontract(selectedSubForPayment.id, {
        paid: newPaid,
        status: newPaid >= selectedSubForPayment.total ? 'Finished' : selectedSubForPayment.status,
      });
      await loadSubcontracts();
      setIsPaymentModalOpen(false);
      setSelectedSubForPayment(null);
      setPaymentAmount(0);
      setPaymentDate(toLocalISODate(new Date()));
      toast.success('Pago registrado correctamente');
    } catch (error) {
      handleApiError(error, OperationType.UPDATE, `subcontracts/${selectedSubForPayment.id}`);
    }
  };

  const openEditModal = (sub: any) => {
    setEditingSub(sub);
    setNewSub({
      projectId: sub.projectId,
      budgetItemId: sub.budgetItemId || '',
      contractor: sub.contractor,
      service: sub.service,
      startDate: sub.startDate || '',
      endDate: sub.endDate || '',
      total: sub.total,
      paid: sub.paid || 0,
      status: sub.status
    });
    setCurrentStep(0);
    setIsModalOpen(true);
  };

  return (
    <>
      <ConfirmModal
        isOpen={isDeleteConfirmOpen}
        onClose={() => {
          setIsDeleteConfirmOpen(false);
          setSubToDelete(null);
        }}
        onConfirm={confirmDeleteSub}
        title="Eliminar Subcontrato"
        message={`¿Seguro que deseas eliminar el subcontrato de ${subcontractPendingDelete?.contractor || 'contratista seleccionado'}? Esta acción no se puede deshacer.`}
      />

      <div className="space-y-4 sm:space-y-8">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4 sm:mb-8">
        <div>
          <h1 className="text-xl sm:text-3xl font-bold text-slate-900 dark:text-white">Subcontratos</h1>
          <p className="text-[10px] sm:text-sm text-slate-500 dark:text-slate-400 font-medium">Control de servicios externos y mano de obra</p>
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="flex items-center bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-1 shadow-sm">
            <button 
              title="Vista de tarjetas"
              aria-label="Vista de tarjetas"
              onClick={() => setViewMode('grid')}
              className={cn(
                "p-1.5 sm:p-2 rounded-lg transition-all",
                viewMode === 'grid' ? "bg-primary text-white shadow-md" : "text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
              )}
            >
              <LayoutGrid size={16} className="sm:w-4.5 sm:h-4.5" />
            </button>
            <button 
              title="Vista de tabla"
              aria-label="Vista de tabla"
              onClick={() => setViewMode('table')}
              className={cn(
                "p-1.5 sm:p-2 rounded-lg transition-all",
                viewMode === 'table' ? "bg-primary text-white shadow-md" : "text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
              )}
            >
              <List size={16} className="sm:w-4.5 sm:h-4.5" />
            </button>
          </div>
          <div className="relative flex-1 sm:flex-none">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 sm:w-4.5 sm:h-4.5" size={14} />
            <input 
              type="text" 
              placeholder="Buscar..." 
              className="w-full sm:w-64 pl-9 sm:pl-10 pr-4 py-2 sm:py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-[10px] sm:text-sm focus:outline-none focus:ring-2 focus:ring-primary transition-all shadow-sm text-slate-900 dark:text-white"
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
            />
          </div>
          <button 
            onClick={() => setIsModalOpen(true)}
            className="flex items-center justify-center gap-1.5 sm:gap-2 bg-primary text-white font-black py-2 sm:py-2.5 px-4 sm:px-6 rounded-xl hover:bg-primary-hover transition-all shadow-lg shadow-primary-shadow whitespace-nowrap text-[10px] sm:text-sm uppercase tracking-widest"
          >
            <Plus size={16} className="sm:w-5 sm:h-5" />
            <span className="hidden xs:inline">Nuevo Subcontrato</span>
            <span className="xs:hidden">Nuevo</span>
          </button>
        </div>
      </header>

      {viewMode === 'grid' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {paginatedSubcontracts.map((sub) => {
            const project = projects.find(p => p.id === sub.projectId);
            const progress = (sub.paid / sub.total) * 100;
            const daysLeft = sub.endDate ? Math.ceil((new Date(sub.endDate).getTime() - new Date().getTime()) / (1000 * 3600 * 24)) : null;

            return (
              <motion.div 
                key={sub.id}
                data-testid={`subcontract-card-${sub.id}`}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                onClick={() => {
                  setSelectedSubDetails(sub);
                  setIsDetailsModalOpen(true);
                }}
                className={cn(
                  "bg-white dark:bg-slate-900 glass-card p-6 cursor-pointer group relative overflow-hidden",
                  projectCardEffectClass,
                  sub.status === 'Active'
                    ? 'hover:border-emerald-300 dark:hover:border-emerald-500/40'
                    : 'hover:border-slate-300 dark:hover:border-slate-600'
                )}
              >
                <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:scale-110 transition-transform duration-500">
                  <HardHat size={64} className="text-slate-400" />
                </div>

                <div className="flex items-start justify-between mb-3 sm:mb-4">
                  <div className="p-2 sm:p-3 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded-lg sm:rounded-xl group-hover:bg-primary group-hover:text-white transition-colors">
                    <HardHat size={18} className="sm:w-6 sm:h-6" />
                  </div>
                  <div className="flex flex-col items-end gap-1.5 sm:gap-2">
                    <span className={cn(
                      "text-[8px] sm:text-micro font-bold uppercase tracking-wider px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-full border",
                      sub.status === 'Active' ? "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 border-emerald-100 dark:border-emerald-500/20" : "bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-100 dark:border-slate-700"
                    )}>
                      {sub.status === 'Active' ? 'Activo' : 'Finalizado'}
                    </span>
                    {daysLeft !== null && daysLeft <= 7 && daysLeft > 0 && (
                      <span className="flex items-center gap-1 text-[8px] sm:text-micro font-bold text-rose-600 bg-rose-50 dark:bg-rose-500/10 px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-full border border-rose-100 dark:border-rose-500/20 animate-pulse">
                        <AlertCircle size={8} className="sm:w-2.5 sm:h-2.5" />
                        Vence en {daysLeft} días
                      </span>
                    )}
                  </div>
                </div>

                <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white mb-0.5 sm:mb-1 group-hover:text-primary transition-colors truncate">{sub.contractor}</h3>
                <p className="text-[8px] sm:text-micro text-primary font-bold uppercase tracking-widest mb-3 sm:mb-4 truncate">{sub.service}</p>
                
                <div className="flex items-center gap-2 text-[10px] sm:text-xs text-slate-500 dark:text-slate-400 mb-1.5 sm:mb-2">
                  <Construction size={12} className="sm:w-3.5 sm:h-3.5" />
                  <span className="font-medium truncate">{project?.name || 'Proyecto no encontrado'}</span>
                </div>

                <div className="flex items-center gap-2 text-[9px] sm:text-[10px] text-slate-400 dark:text-slate-500 mb-4 sm:mb-6 font-bold uppercase tracking-wider">
                  <div className="w-1 h-1 sm:w-1.5 sm:h-1.5 rounded-full bg-primary/40" />
                  <span className="truncate">Renglón: {sub.budgetItemName || 'No vinculado'}</span>
                </div>

                <div className="space-y-3 sm:space-y-4">
                  <div>
                    <div className="flex justify-between text-[8px] sm:text-micro font-bold mb-1.5 sm:mb-2">
                      <span className="text-slate-500 dark:text-slate-400 uppercase tracking-wider">Pago Ejecutado</span>
                      <span className="text-slate-900 dark:text-white">{(progress || 0).toFixed(1)}%</span>
                    </div>
                    <div className="h-1.5 sm:h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                      <div className={cn(
                        "h-full transition-all duration-500",
                        progress >= 100 ? "bg-emerald-500" : "bg-primary"
                      , getProgressWidthClass(progress))} />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 sm:gap-4 pt-3 sm:pt-4 border-t border-slate-50 dark:border-slate-800">
                    <div>
                      <p className="text-[8px] sm:text-micro text-slate-400 dark:text-slate-500 font-bold uppercase tracking-wider mb-0.5 sm:mb-1">Monto Total</p>
                      <p className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white">{formatCurrency(sub.total)}</p>
                    </div>
                    <div>
                      <p className="text-[8px] sm:text-micro text-slate-400 dark:text-slate-500 font-bold uppercase tracking-wider mb-0.5 sm:mb-1">Pagado</p>
                      <p className="text-xs sm:text-sm font-bold text-emerald-600 dark:text-emerald-400">{formatCurrency(sub.paid)}</p>
                    </div>
                  </div>

                  {sub.status !== 'Finished' && (
                    <div className="flex gap-2 pt-2">
                      <button
                        type="button"
                        data-testid={`subcontract-card-pay-${sub.id}`}
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedSubForPayment(sub);
                          setPaymentDate(toLocalISODate(new Date()));
                          setPaymentAmount(0);
                          setIsPaymentModalOpen(true);
                        }}
                        className="flex-1 py-2 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-micro font-bold rounded-lg hover:bg-emerald-100 dark:hover:bg-emerald-500/20 transition-all border border-emerald-100 dark:border-emerald-500/20"
                      >
                        Pago Parcial
                      </button>
                      <button
                        type="button"
                        data-testid={`subcontract-card-settle-${sub.id}`}
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleMarkAsPaid(sub);
                        }}
                        className="flex-1 py-2 bg-slate-900 dark:bg-slate-800 text-white text-micro font-bold rounded-lg hover:bg-slate-800 dark:hover:bg-slate-700 transition-all"
                      >
                        Saldar Total
                      </button>
                    </div>
                  )}

                  <div className="flex items-center justify-between pt-4 text-xs text-slate-500 dark:text-slate-400 border-t border-slate-50 dark:border-slate-800">
                    <div className="flex items-center gap-1">
                      <Calendar size={14} />
                      <span className="text-micro font-bold uppercase tracking-wider">Vence: {sub.endDate ? formatDate(sub.endDate) : 'N/A'}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        data-testid={`subcontract-card-edit-${sub.id}`}
                        onPointerDown={(e) => e.stopPropagation()}
                        title={`Editar subcontrato ${sub.contractor}`}
                        aria-label={`Editar subcontrato ${sub.contractor}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          openEditModal(sub);
                        }}
                        className="text-slate-400 hover:text-blue-600 transition-colors"
                      >
                        <Edit2 size={16} />
                      </button>
                      <button
                        type="button"
                        data-testid={`subcontract-card-delete-${sub.id}`}
                        onPointerDown={(e) => e.stopPropagation()}
                        title={`Eliminar subcontrato ${sub.contractor}`}
                        aria-label={`Eliminar subcontrato ${sub.contractor}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteSub(sub.id);
                        }} 
                        className="text-slate-400 hover:text-rose-600 transition-colors"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-900 glass-card rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-100 dark:border-slate-800">
                  <th className="px-6 py-4 text-micro font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Contratista</th>
                  <th className="px-6 py-4 text-micro font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Servicio</th>
                  <th className="px-6 py-4 text-micro font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Proyecto</th>
                  <th className="px-6 py-4 text-micro font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Renglón</th>
                  <th className="px-6 py-4 text-micro font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Total</th>
                  <th className="px-6 py-4 text-micro font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Pagado</th>
                  <th className="px-6 py-4 text-micro font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Saldo</th>
                  <th className="px-6 py-4 text-micro font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Estado</th>
                  <th className="px-6 py-4 text-micro font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
                {paginatedSubcontracts.map((sub) => {
                  const project = projects.find(p => p.id === sub.projectId);
                  return (
                    <tr 
                      key={sub.id} 
                      onClick={() => {
                        setSelectedSubDetails(sub);
                        setIsDetailsModalOpen(true);
                      }}
                      className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors cursor-pointer group"
                    >
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded-lg group-hover:bg-primary group-hover:text-white transition-colors">
                            <HardHat size={16} />
                          </div>
                          <span className="font-bold text-slate-900 dark:text-white group-hover:text-primary transition-colors">{sub.contractor}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-600 dark:text-slate-400 font-medium">{sub.service}</td>
                      <td className="px-6 py-4 text-sm text-slate-600 dark:text-slate-400 font-medium truncate max-w-[150px]">{project?.name || 'N/A'}</td>
                      <td className="px-6 py-4 text-sm text-slate-600 dark:text-slate-400 font-medium truncate max-w-[150px]">{sub.budgetItemName || 'N/A'}</td>
                      <td className="px-6 py-4 text-sm font-bold text-slate-900 dark:text-white">{formatCurrency(sub.total)}</td>
                      <td className="px-6 py-4 text-sm font-bold text-emerald-600 dark:text-emerald-400">{formatCurrency(sub.paid)}</td>
                      <td className="px-6 py-4 text-sm font-bold text-rose-600 dark:text-rose-400">{formatCurrency(sub.total - sub.paid)}</td>
                      <td className="px-6 py-4">
                        <span className={cn(
                          "text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full border",
                          sub.status === 'Active' ? "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 border-emerald-100 dark:border-emerald-500/20" : "bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-100 dark:border-slate-700"
                        )}>
                          {sub.status === 'Active' ? 'Activo' : 'Finalizado'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {sub.status !== 'Finished' && (
                            <>
                              <button 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedSubForPayment(sub);
                                  setPaymentDate(toLocalISODate(new Date()));
                                  setPaymentAmount(0);
                                  setIsPaymentModalOpen(true);
                                }}
                                className="p-2 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 rounded-lg transition-all"
                                title="Pago Parcial"
                              >
                                <DollarSign size={16} />
                              </button>
                              <button 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleMarkAsPaid(sub);
                                }}
                                className="p-2 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-all"
                                title="Saldar Total"
                              >
                                <CheckCircle2 size={16} />
                              </button>
                            </>
                          )}
                          <button 
                            title={`Editar subcontrato ${sub.contractor}`}
                            aria-label={`Editar subcontrato ${sub.contractor}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              openEditModal(sub);
                            }}
                            className="p-2 text-slate-400 hover:text-blue-600 transition-colors"
                          >
                            <Edit2 size={16} />
                          </button>
                          <button 
                            title={`Eliminar subcontrato ${sub.contractor}`}
                            aria-label={`Eliminar subcontrato ${sub.contractor}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteSub(sub.id);
                            }} 
                            className="p-2 text-slate-400 hover:text-rose-600 transition-colors"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex flex-col md:flex-row items-center justify-between gap-4 bg-white dark:bg-slate-900 glass-card p-6 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm mt-8">
          <div className="flex items-center gap-4">
            <span className="text-sm text-slate-500 dark:text-slate-400 font-medium">
              Mostrando {paginatedSubcontracts.length} de {filteredSubcontracts.length} subcontratos
            </span>
            <div className="flex items-center gap-2">
              <label className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Por página:</label>
              <select 
                title="Cantidad por pagina"
                aria-label="Cantidad por pagina"
                className="px-2 py-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-bold outline-none text-slate-900 dark:text-white"
                value={itemsPerPage}
                onChange={(e) => {
                  setItemsPerPage(Number(e.target.value));
                  setCurrentPage(1);
                }}
              >
                <option value={6}>6</option>
                <option value={12}>12</option>
                <option value={24}>24</option>
              </select>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button 
              title="Pagina anterior"
              aria-label="Pagina anterior"
              disabled={currentPage === 1}
              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
              className="p-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 transition-all disabled:opacity-50 disabled:cursor-not-allowed text-slate-600 dark:text-slate-400"
            >
              <ChevronLeft size={20} />
            </button>
            <div className="flex items-center gap-1">
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                let pageNum;
                if (totalPages <= 5) pageNum = i + 1;
                else if (currentPage <= 3) pageNum = i + 1;
                else if (currentPage >= totalPages - 2) pageNum = totalPages - 4 + i;
                else pageNum = currentPage - 2 + i;

                return (
                  <button
                    key={pageNum}
                    onClick={() => setCurrentPage(pageNum)}
                    className={cn(
                      "w-10 h-10 rounded-xl text-sm font-bold transition-all",
                      currentPage === pageNum 
                        ? "bg-primary text-white shadow-lg shadow-primary-shadow" 
                        : "bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700"
                    )}
                  >
                    {pageNum}
                  </button>
                );
              })}
            </div>
            <button 
              title="Pagina siguiente"
              aria-label="Pagina siguiente"
              disabled={currentPage === totalPages}
              onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
              className="p-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 transition-all disabled:opacity-50 disabled:cursor-not-allowed text-slate-600 dark:text-slate-400"
            >
              <ChevronRight size={20} />
            </button>
          </div>
        </div>
      )}

      <FormModal
        isOpen={isPaymentModalOpen}
        onClose={() => setIsPaymentModalOpen(false)}
        title="Registrar Pago"
        maxWidth="max-w-md"
        footer={
          <div className="flex flex-col sm:flex-row gap-4">
            <button 
              type="button"
              onClick={() => {
                setIsPaymentModalOpen(false);
                setPaymentDate(toLocalISODate(new Date()));
                setPaymentAmount(0);
              }}
              className="flex-1 py-4 px-6 bg-white text-slate-600 font-bold rounded-xl border border-slate-200 hover:bg-slate-50 transition-all order-2 sm:order-1"
            >
              Cancelar
            </button>
            <button 
              type="submit"
              form="payment-form"
              className="flex-1 py-4 px-6 bg-emerald-600 text-white font-bold rounded-xl hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-200 order-1 sm:order-2"
            >
              Confirmar Pago
            </button>
          </div>
        }
      >
        <form id="payment-form" onSubmit={handleRecordPayment} className="space-y-6">
          <div className="space-y-2">
            <label className="text-sm font-bold text-slate-700">Fecha de Pago</label>
            <DatePicker
              selected={parseLocalISODate(paymentDate)}
              onChange={(date) => setPaymentDate(date ? toLocalISODate(date) : '')}
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
              placeholderText="Seleccionar fecha de pago"
              dateFormat="dd/MM/yyyy"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-bold text-slate-700">Monto del Pago (GTQ)</label>
            <input 
              required
              type="number" 
              min="0"
              step="any"
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
              value={paymentAmount}
              onChange={(e) => setPaymentAmount(Number(e.target.value))}
              placeholder="0.00"
            />
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
              Saldo pendiente: {formatCurrency(selectedSubForPayment?.total - selectedSubForPayment?.paid)}
            </p>
          </div>
        </form>
      </FormModal>

      <FormModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setEditingSub(null);
          setNewSub({ projectId: '', budgetItemId: '', contractor: '', service: '', startDate: '', endDate: '', total: 0, paid: 0, status: 'Active' });
          setCurrentStep(0);
        }}
        title={editingSub ? 'Editar Subcontrato' : 'Nuevo Subcontrato'}
        maxWidth="max-w-2xl"
        fullVertical
        footer={
          <div className="flex flex-col sm:flex-row justify-between items-center gap-4 w-full">
            <div className="flex gap-2 order-2 sm:order-1">
              <button 
                type="button"
                onClick={() => {
                  setIsModalOpen(false);
                  setEditingSub(null);
                  setNewSub({ projectId: '', budgetItemId: '', contractor: '', service: '', startDate: '', endDate: '', total: 0, paid: 0, status: 'Active' });
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
              {currentStep < 2 ? (
                <button 
                  type="button"
                  onClick={() => {
                    // Basic validation for current step
                    if (currentStep === 0) {
                      if (!newSub.projectId || !newSub.contractor || !newSub.service) {
                        validateField('projectId', newSub.projectId);
                        validateField('contractor', newSub.contractor);
                        validateField('service', newSub.service);
                        toast.error('Por favor complete los campos obligatorios');
                        return;
                      }
                    }
                    if (currentStep === 1 && Number(newSub.total) <= 0) {
                      validateField('total', newSub.total);
                      toast.error('El monto total debe ser mayor a cero');
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
                  form="subcontract-form"
                  className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-10 py-3 bg-primary text-white font-bold rounded-xl hover:bg-primary-hover transition-all shadow-lg shadow-primary-shadow"
                >
                  {editingSub ? 'Guardar Cambios' : 'Registrar Subcontrato'}
                  <CheckCircle2 size={18} />
                </button>
              )}
            </div>
          </div>
        }
      >
        <StepForm
          formId="subcontract-form"
          currentStep={currentStep}
          onStepChange={setCurrentStep}
          onSubmit={handleAddSub}
          steps={[
            {
              title: "General",
              content: (
                <FormSection title="Información General" icon={Info} description="Datos básicos del subcontrato">
                  <FormSelect 
                    label="Proyecto"
                    required
                    value={newSub.projectId}
                    onChange={(e) => {
                      setNewSub({...newSub, projectId: e.target.value});
                      validateField('projectId', e.target.value);
                    }}
                    error={validationErrors.projectId}
                  >
                    <option value="">Seleccionar Proyecto</option>
                    {projects.map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </FormSelect>
                  <FormSelect 
                    label="Renglón del Presupuesto"
                    required
                    value={newSub.budgetItemId}
                    onChange={(e) => {
                      setNewSub({...newSub, budgetItemId: e.target.value});
                      validateField('budgetItemId', e.target.value);
                    }}
                    error={validationErrors.budgetItemId}
                    disabled={!newSub.projectId}
                  >
                    <option value="">{newSub.projectId ? 'Seleccionar Renglón' : 'Primero seleccione un proyecto'}</option>
                    {budgetItems.map(item => (
                      <option key={item.id} value={item.id}>{item.description}</option>
                    ))}
                  </FormSelect>
                  <FormInput 
                    label="Contratista / Empresa"
                    required
                    value={newSub.contractor}
                    onChange={(e) => {
                      setNewSub({...newSub, contractor: e.target.value});
                      validateField('contractor', e.target.value);
                    }}
                    error={validationErrors.contractor}
                    placeholder="Ej: Instalaciones S.A."
                  />
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Servicio / Especialidad</label>
                      <button
                        type="button"
                        onClick={handleAISuggestions}
                        disabled={isGenerating || !newSub.service || !newSub.projectId}
                        className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-blue-600 hover:text-blue-700 disabled:opacity-50 transition-colors"
                      >
                        {isGenerating ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <Sparkles className="w-3 h-3" />
                        )}
                        Sugerir Monto
                      </button>
                    </div>
                    <input
                      required
                      type="text"
                      value={newSub.service}
                      onChange={(e) => {
                        setNewSub({...newSub, service: e.target.value});
                        validateField('service', e.target.value);
                      }}
                      className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                      placeholder="Ej: Instalaciones Eléctricas"
                    />
                    {validationErrors.service && (
                      <p className="text-[10px] text-rose-500 font-bold mt-1 uppercase tracking-wider">{validationErrors.service}</p>
                    )}
                  </div>
                </FormSection>
              )
            },
            {
              title: "Finanzas",
              content: (
                <FormSection title="Monto y Estado" icon={DollarSign} description="Control financiero del contrato">
                  <FormInput 
                    label="Monto Total (GTQ)"
                    required
                    type="number" 
                    min="0"
                    step="any"
                    value={newSub.total}
                    onChange={(e) => {
                      setNewSub({...newSub, total: Number(e.target.value)});
                      validateField('total', e.target.value);
                    }}
                    error={validationErrors.total}
                  />
                  <FormInput 
                    label="Monto Pagado (GTQ)"
                    type="number" 
                    min="0"
                    step="any"
                    value={newSub.paid}
                    onChange={(e) => {
                      setNewSub({...newSub, paid: Number(e.target.value)});
                      validateField('paid', e.target.value);
                    }}
                    error={validationErrors.paid}
                  />
                  <FormSelect 
                    label="Estado"
                    value={newSub.status}
                    onChange={(e) => setNewSub({...newSub, status: e.target.value})}
                  >
                    <option value="Active">Activo</option>
                    <option value="Finished">Finalizado</option>
                  </FormSelect>
                </FormSection>
              )
            },
            {
              title: "Cronograma",
              content: (
                <FormSection title="Fechas de Ejecución" icon={Calendar} description="Plazos estimados del servicio">
                  <div className="space-y-2 group">
                    <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] ml-1 group-focus-within:text-primary transition-colors">
                      Fecha Inicio de Adquisición
                    </label>
                    <div className="relative">
                      <DatePicker
                        selected={parseLocalISODate(newSub.startDate)}
                        onChange={(date) => {
                          const val = date ? toLocalISODate(date) : '';
                          setNewSub({ ...newSub, startDate: val });
                          setValidationErrors((prev) => ({ ...prev, startDate: val ? '' : 'La fecha de inicio de adquisición es obligatoria' }));
                          if (val && newSub.endDate) {
                            const start = parseLocalISODate(val);
                            const end = parseLocalISODate(newSub.endDate);
                            if (start && end && end < start) {
                              setValidationErrors((prev) => ({ ...prev, endDate: 'La fecha de fin no puede ser anterior a la fecha de inicio' }));
                            } else {
                              setValidationErrors((prev) => ({ ...prev, endDate: '' }));
                            }
                          }
                        }}
                        className="w-full px-5 py-4 bg-white dark:bg-slate-900 border-2 border-slate-100 dark:border-slate-800 rounded-2xl focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/5 transition-all font-medium text-slate-900 dark:text-white"
                        placeholderText="Seleccionar fecha de inicio"
                        dateFormat="dd/MM/yyyy"
                      />
                      {validationErrors.startDate && <p className="text-[10px] text-rose-500 font-black mt-1.5 ml-1 uppercase tracking-wider">{validationErrors.startDate}</p>}
                    </div>
                  </div>
                  <div className="space-y-2 group">
                    <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] ml-1 group-focus-within:text-primary transition-colors">
                      Fecha Vencimiento
                    </label>
                    <div className="relative">
                      <DatePicker
                        selected={parseLocalISODate(newSub.endDate)}
                        onChange={(date) => {
                          const val = date ? toLocalISODate(date) : '';
                          setNewSub({...newSub, endDate: val});
                          if (newSub.startDate && date) {
                            const start = parseLocalISODate(newSub.startDate);
                            if (start && date < start) {
                              setValidationErrors(prev => ({ ...prev, endDate: 'La fecha de fin no puede ser anterior a la fecha de inicio' }));
                            } else {
                              setValidationErrors(prev => ({ ...prev, endDate: '' }));
                            }
                          }
                        }}
                        className={cn(
                          "w-full px-5 py-4 bg-white dark:bg-slate-900 border-2 rounded-2xl focus:outline-none transition-all duration-300 font-medium text-slate-900 dark:text-white",
                          validationErrors.endDate ? "border-rose-100 bg-rose-50/30 focus:border-rose-500" : "border-slate-100 dark:border-slate-800 focus:border-primary focus:ring-4 focus:ring-primary/5 shadow-sm"
                        )}
                        placeholderText="Seleccionar fecha"
                        dateFormat="dd/MM/yyyy"
                      />
                      {validationErrors.endDate && <p className="text-[10px] text-rose-500 font-black mt-1.5 ml-1 uppercase tracking-wider">{validationErrors.endDate}</p>}
                    </div>
                  </div>
                </FormSection>
              )
            }
          ]}
        />
      </FormModal>

      <FormModal
        isOpen={isDetailsModalOpen}
        onClose={() => setIsDetailsModalOpen(false)}
        title={selectedSubDetails?.contractor || 'Detalles del Subcontrato'}
        maxWidth="max-w-2xl"
        footer={
          <div className="flex justify-end">
            <button 
              onClick={() => setIsDetailsModalOpen(false)}
              className="py-3 px-8 bg-white text-slate-600 font-bold rounded-xl border border-slate-200 hover:bg-slate-50 transition-all"
            >
              Cerrar
            </button>
          </div>
        }
      >
        {selectedSubDetails && (
          <div className="space-y-8">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
              <div className="space-y-1">
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Proyecto</p>
                <p className="text-sm font-bold text-slate-900 dark:text-white">
                  {projects.find(p => p.id === selectedSubDetails.projectId)?.name || 'N/A'}
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Renglón Presupuesto</p>
                <p className="text-sm font-bold text-slate-900 dark:text-white">
                  {selectedSubDetails.budgetItemName || 'No vinculado'}
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Estado</p>
                <span className={cn(
                  "inline-block text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full border",
                  selectedSubDetails.status === 'Active' ? "bg-emerald-50 text-emerald-600 border-emerald-100" : "bg-slate-50 text-slate-600 border-slate-100"
                )}>
                  {selectedSubDetails.status === 'Active' ? 'Activo' : 'Finalizado'}
                </span>
              </div>
              <div className="space-y-1">
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Fecha Inicio</p>
                <p className="text-sm font-bold text-slate-900">{selectedSubDetails.startDate ? formatDate(selectedSubDetails.startDate) : 'N/A'}</p>
              </div>
              <div className="space-y-1">
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Fecha Fin</p>
                <p className="text-sm font-bold text-slate-900">{selectedSubDetails.endDate ? formatDate(selectedSubDetails.endDate) : 'N/A'}</p>
              </div>
            </div>

            <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="space-y-1">
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Monto Total</p>
                  <p className="text-xl font-black text-slate-900">{formatCurrency(selectedSubDetails.total)}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Pagado</p>
                  <p className="text-xl font-black text-emerald-600">{formatCurrency(selectedSubDetails.paid)}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Pendiente</p>
                  <p className="text-xl font-black text-rose-600">{formatCurrency(selectedSubDetails.total - selectedSubDetails.paid)}</p>
                </div>
              </div>
              <div className="mt-6">
                <div className="flex justify-between text-xs font-bold mb-2">
                  <span className="text-slate-500 uppercase tracking-wider">Progreso de Pago</span>
                  <span className="text-slate-900">{((selectedSubDetails.paid / selectedSubDetails.total) * 100).toFixed(1)}%</span>
                </div>
                <div className="h-3 bg-white rounded-full overflow-hidden border border-slate-200">
                  <div className={cn(
                    "h-full bg-emerald-500 transition-all duration-500",
                    getProgressWidthClass((selectedSubDetails.paid / selectedSubDetails.total) * 100)
                  )} />
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <DollarSign className="text-primary" size={20} />
                <h3 className="text-lg font-bold text-slate-900">Historial de Pagos</h3>
              </div>
              
              <div className="border border-slate-100 rounded-2xl overflow-hidden">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-100">
                      <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Fecha</th>
                      <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Descripción</th>
                      <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider text-right">Monto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {subTransactions.length > 0 ? (
                      subTransactions.map((t) => (
                        <tr key={t.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                          <td className="px-4 py-3 text-xs font-medium text-slate-600">{formatDate(t.date)}</td>
                          <td className="px-4 py-3 text-xs text-slate-600">{t.description}</td>
                          <td className="px-4 py-3 text-xs font-bold text-emerald-600 text-right">{formatCurrency(t.amount)}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={3} className="px-4 py-8 text-center text-sm text-slate-400 italic">
                          No hay registros de pagos para este subcontrato.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </FormModal>

    </div>
    </>
  );
}
