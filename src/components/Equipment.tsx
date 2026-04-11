import React, { useCallback, useEffect, useState, useMemo } from 'react';
import { 
  Plus, 
  Wrench, 
  Truck, 
  Settings, 
  AlertCircle, 
  CheckCircle2, 
  Search,
  X,
  Trash2,
  Construction,
  FileText,
  Download,
  ChevronLeft,
  ChevronRight,
  Check,
  Info,
  LayoutGrid,
  List
} from 'lucide-react';
import { formatCurrency, cn, handleApiError, OperationType, formatDate } from '../lib/utils';
import { logAction } from '../lib/audit';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'motion/react';
import ConfirmModal from './ConfirmModal';
import { FormModal } from './FormModal';
import { StepForm, FormSection, FormInput, FormSelect } from './FormLayout';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { drawReportHeader } from '../lib/pdfUtils';
import { listProjects } from '../lib/projectsApi';
import { createEquipment, deleteEquipment, listEquipment, updateEquipment } from '../lib/equipmentApi';

export default function Equipment() {
  const projectCardEffectClass = 'rounded-[var(--radius-theme)] shadow-[var(--shadow-theme)] border border-slate-100 dark:border-slate-800 hover:shadow-lg hover:border-primary/30 hover:-translate-y-0.5 transition-all duration-500';

  const [equipment, setEquipment] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingEquip, setEditingEquip] = useState<any>(null);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [equipToDelete, setEquipToDelete] = useState<string | null>(null);
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');
  const [newEquip, setNewEquip] = useState({
    name: '',
    type: 'Owned',
    projectId: '',
    dailyRate: 0,
    estimatedDays: 0,
    status: 'Available'
  });

  const loadEquipmentData = useCallback(async () => {
    try {
      const [equipmentItems, projectItems] = await Promise.all([listEquipment(), listProjects()]);
      setEquipment(equipmentItems);
      setProjects(projectItems);
    } catch (error) {
      handleApiError(error, OperationType.GET, 'equipment');
    }
  }, []);

  useEffect(() => {
    loadEquipmentData();
  }, [loadEquipmentData]);

  const filteredEquipment = useMemo(() => {
    return equipment.filter(item => 
      item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      projects.find(p => p.id === item.projectId)?.name.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [equipment, searchTerm, projects]);

  const totalPages = Math.ceil(filteredEquipment.length / itemsPerPage);
  const paginatedEquipment = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredEquipment.slice(start, start + itemsPerPage);
  }, [filteredEquipment, currentPage, itemsPerPage]);

  const handleAddEquip = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validation
    if (!newEquip.name.trim()) {
      toast.error('El nombre del equipo es obligatorio');
      return;
    }
    if (!newEquip.type) {
      toast.error('El tipo de equipo es obligatorio');
      return;
    }
    if (Number(newEquip.dailyRate) < 0) {
      toast.error('El costo diario no puede ser negativo');
      return;
    }
    if (newEquip.projectId && Number(newEquip.estimatedDays) <= 0) {
      toast.error('Por favor ingrese los días estimados de uso');
      return;
    }

    // Status and Project consistency
    if (newEquip.status === 'In Use' && !newEquip.projectId) {
      toast.error('Debe asignar un proyecto si el equipo está en obra');
      return;
    }
    if (newEquip.projectId && newEquip.status !== 'In Use') {
      toast.error('El estado debe ser "En Obra" si el equipo tiene un proyecto asignado');
      return;
    }

    setIsSubmitting(true);
    try {
      const equipData = {
        ...newEquip,
        name: newEquip.name.trim(),
        dailyRate: Number(newEquip.dailyRate),
        estimatedDays: Number(newEquip.estimatedDays || 0),
        status: newEquip.projectId ? 'In Use' : newEquip.status
      };

      if (editingEquip) {
        await updateEquipment(editingEquip.id, equipData);
        toast.success('Equipo actualizado con éxito');
        await logAction('Edición de Equipo', 'Maquinaria', `Equipo ${equipData.name} actualizado`, 'update', { equipmentId: editingEquip.id });
      } else {
        const created = await createEquipment(equipData);
        toast.success('Equipo registrado con éxito');
        await logAction('Registro de Equipo', 'Maquinaria', `Nuevo equipo ${equipData.name} registrado`, 'create', { equipmentId: created.id });
      }
      await loadEquipmentData();
      setIsModalOpen(false);
      setEditingEquip(null);
      setNewEquip({ name: '', type: 'Owned', projectId: '', dailyRate: 0, estimatedDays: 0, status: 'Available' });
      setCurrentStep(0);
      setValidationErrors({});
    } catch (error) {
      handleApiError(error, OperationType.WRITE, 'equipment');
    } finally {
      setIsSubmitting(false);
    }
  };

  const generateEquipmentReport = async () => {
    setIsGeneratingReport(true);
    try {
      const doc = new jsPDF();
      
      const headerBottom = drawReportHeader(doc, 'REPORTE DE ASIGNACION DE EQUIPO', {
        dateText: `Fecha: ${formatDate(new Date().toISOString())}`,
        x: 20,
        y: 10,
      });

      // Group equipment by project
      const assignedEquipment = equipment.filter(e => e.projectId);
      const groupedByProject: { [key: string]: any[] } = {};
      
      assignedEquipment.forEach(e => {
        if (!groupedByProject[e.projectId]) {
          groupedByProject[e.projectId] = [];
        }
        groupedByProject[e.projectId].push(e);
      });

      let currentY = headerBottom + 8;

      Object.entries(groupedByProject).forEach(([projectId, items], index) => {
        const project = projects.find(p => p.id === projectId);
        
        if (currentY > 250) {
          doc.addPage();
          currentY = 20;
        }

        doc.setFontSize(12);
        doc.setTextColor(15, 23, 42);
        doc.text(`Proyecto: ${project?.name || 'N/A'}`, 20, currentY);
        currentY += 5;

        autoTable(doc, {
          startY: currentY,
          head: [['Equipo', 'Tipo', 'Costo Diario', 'Días Est.', 'Costo Est.']],
          body: items.map(item => [
            item.name,
            item.type === 'Owned' ? 'Propio' : 'Rentado',
            formatCurrency(item.dailyRate),
            `${item.estimatedDays || 0} días`,
            formatCurrency((item.dailyRate || 0) * (item.estimatedDays || 0))
          ]),
          theme: 'striped',
          headStyles: { fillColor: [37, 99, 235] },
          margin: { left: 20, right: 20 }
        });

        currentY = (doc as any).lastAutoTable.finalY + 15;
      });

      if (assignedEquipment.length === 0) {
        doc.setFontSize(12);
        doc.setTextColor(100, 116, 139);
        doc.text('No hay equipo asignado a obras actualmente.', 105, 60, { align: 'center' });
      }

      doc.save(`Reporte_Equipo_${new Date().toISOString().split('T')[0]}.pdf`);
      toast.success('Reporte generado con éxito');
    } catch (error) {
      console.error('Error generating report:', error);
      toast.error('Error al generar el reporte');
    } finally {
      setIsGeneratingReport(false);
    }
  };

  const openEditModal = (item: any) => {
    setEditingEquip(item);
    setNewEquip({
      name: item.name,
      type: item.type,
      projectId: item.projectId || '',
      dailyRate: item.dailyRate,
      estimatedDays: item.estimatedDays || 0,
      status: item.status
    });
    setIsModalOpen(true);
  };

  const handleDeleteEquip = (id: string) => {
    setEquipToDelete(id);
    setIsDeleteConfirmOpen(true);
  };

  const confirmDeleteEquip = async () => {
    if (!equipToDelete) return;
    try {
      const equip = equipment.find(e => e.id === equipToDelete);
      await deleteEquipment(equipToDelete);
      setEquipToDelete(null);
      setIsDeleteConfirmOpen(false);
      toast.success('Equipo eliminado con éxito');
      await logAction('Eliminación de Equipo', 'Maquinaria', `Equipo ${equip?.name || equipToDelete} eliminado`, 'delete', { equipmentId: equipToDelete });
      await loadEquipmentData();
    } catch (error) {
      handleApiError(error, OperationType.DELETE, `equipment/${equipToDelete}`);
    }
  };

  const equipmentPendingDelete = equipment.find((item) => item.id === equipToDelete);

  return (
    <>
      <ConfirmModal
        isOpen={isDeleteConfirmOpen}
        onClose={() => {
          setIsDeleteConfirmOpen(false);
          setEquipToDelete(null);
        }}
        onConfirm={confirmDeleteEquip}
        title="Eliminar Equipo"
        message={`¿Seguro que deseas eliminar el equipo ${equipmentPendingDelete?.name || 'seleccionado'}? Esta acción no se puede deshacer.`}
      />

      <div className="space-y-8 min-w-0 overflow-x-hidden">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-3 sm:gap-4 mb-4 sm:mb-8">
        <div>
          <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-slate-900 dark:text-white">Maquinaria</h1>
          <p className="text-slate-500 dark:text-slate-400 text-[10px] sm:text-sm">Control de herramientas y maquinaria</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:gap-4">
          <div className="relative flex-1 sm:flex-none">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 sm:w-4.5 sm:h-4.5" size={16} />
            <input 
              type="text" 
              placeholder="Buscar equipo..." 
              className="pl-9 pr-4 py-2 sm:py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-primary transition-all shadow-sm text-slate-900 dark:text-white w-full sm:w-64"
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
            />
          </div>
          <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
            <button 
              onClick={() => setViewMode('grid')}
              className={cn(
                "p-2 rounded-lg transition-all",
                viewMode === 'grid' ? "bg-white dark:bg-slate-700 text-primary shadow-sm border border-slate-100 dark:border-slate-600" : "text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
              )}
              title="Vista Cuadrícula"
            >
              <LayoutGrid size={18} />
            </button>
            <button 
              onClick={() => setViewMode('table')}
              className={cn(
                "p-2 rounded-lg transition-all",
                viewMode === 'table' ? "bg-white dark:bg-slate-700 text-primary shadow-sm border border-slate-100 dark:border-slate-600" : "text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
              )}
              title="Vista Tabla"
            >
              <List size={18} />
            </button>
          </div>
          <button 
            onClick={generateEquipmentReport}
            disabled={isGeneratingReport}
            className="flex items-center justify-center gap-1.5 sm:gap-2 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 font-bold py-2 sm:py-2.5 px-3 sm:px-6 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all shadow-sm text-[10px] sm:text-sm"
          >
            {isGeneratingReport ? (
              <div className="h-4 w-4 sm:h-5 sm:w-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            ) : (
              <FileText size={16} className="sm:w-5 sm:h-5" />
            )}
            <span className="hidden xs:inline">Reporte</span>
          </button>
          <button 
            onClick={() => setIsModalOpen(true)}
            className="flex items-center justify-center gap-1.5 sm:gap-2 bg-primary text-white font-bold py-2 sm:py-2.5 px-3 sm:px-6 rounded-xl hover:bg-primary-hover transition-all shadow-lg shadow-primary-shadow whitespace-nowrap text-[10px] sm:text-sm flex-1 sm:flex-none"
          >
            <Plus size={16} className="sm:w-5 sm:h-5" />
            Nuevo Equipo
          </button>
        </div>
      </header>

      {viewMode === 'table' ? (
        <div className="bg-white dark:bg-slate-900 glass-card rounded-[var(--radius-theme)] shadow-[var(--shadow-theme)] border border-slate-100 dark:border-slate-800 overflow-hidden min-w-0">
          <div className="overflow-x-auto lg:overflow-x-hidden">
            <table className="w-full text-left border-collapse table-fixed">
              <thead>
                <tr className="bg-slate-50/50 dark:bg-slate-800/50 border-b border-slate-100 dark:border-slate-800">
                  <th className="px-6 py-5 text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Equipo</th>
                  <th className="px-6 py-5 text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Tipo</th>
                  <th className="px-6 py-5 text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Estado</th>
                  <th className="px-6 py-5 text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Costo Diario</th>
                  <th className="px-6 py-5 text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Proyecto</th>
                  <th className="px-6 py-5 text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
                {paginatedEquipment.map((item) => {
                  const project = projects.find(p => p.id === item.projectId);
                  return (
                    <tr key={item.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors group">
                      <td className="px-6 py-5">
                        <div className="flex items-center gap-3">
                          <div className={cn(
                            "p-2 rounded-xl",
                            item.type === 'Owned' ? "bg-blue-100 dark:bg-blue-500/10 text-blue-600" : "bg-primary-light dark:bg-primary/10 text-primary"
                          )}>
                            {item.type === 'Owned' ? <Wrench size={16} /> : <Truck size={16} />}
                          </div>
                          <span className="text-sm font-bold text-slate-900 dark:text-white group-hover:text-primary transition-colors">{item.name}</span>
                        </div>
                      </td>
                      <td className="px-6 py-5 text-sm text-slate-600 dark:text-slate-400">
                        {item.type === 'Owned' ? 'Propio' : 'Rentado'}
                      </td>
                      <td className="px-6 py-5">
                        <span className={cn(
                          "text-[8px] sm:text-micro font-bold uppercase tracking-wider px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-full border",
                          item.status === 'Available' ? "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 border-emerald-100 dark:border-emerald-500/20" : 
                          item.status === 'In Use' ? "bg-blue-50 dark:bg-blue-500/10 text-blue-600 border-blue-100 dark:border-blue-500/20" : 
                          "bg-rose-50 dark:bg-rose-500/10 text-rose-600 border-rose-100 dark:border-rose-500/20"
                        )}>
                          {item.status === 'Available' ? 'Disponible' : item.status === 'In Use' ? 'En Obra' : 'Mantenimiento'}
                        </span>
                      </td>
                      <td className="px-6 py-5 text-sm font-bold text-slate-900 dark:text-white">
                        {formatCurrency(item.dailyRate)}
                      </td>
                      <td className="px-6 py-5">
                        <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
                          <Construction size={14} />
                          <span className="truncate max-w-[150px]">{project?.name || 'No asignado'}</span>
                        </div>
                      </td>
                      <td className="px-6 py-5 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button 
                            onClick={() => openEditModal(item)}
                            title="Editar equipo"
                            className="p-2 text-slate-400 dark:text-slate-500 hover:text-primary dark:hover:text-primary transition-colors"
                          >
                            <Settings size={16} />
                          </button>
                          <button 
                            onClick={() => handleDeleteEquip(item.id)}
                            title="Eliminar equipo"
                            className="p-2 text-slate-400 dark:text-slate-500 hover:text-rose-600 dark:hover:text-rose-400 transition-colors"
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
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-6">
          {paginatedEquipment.map((item) => {
            const project = projects.find(p => p.id === item.projectId);
            return (
              <motion.div 
                key={item.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className={cn(
                  "bg-white dark:bg-slate-900 glass-card p-4 sm:p-6 relative overflow-hidden group",
                  projectCardEffectClass,
                  item.status === 'Available'
                    ? 'hover:border-emerald-300 dark:hover:border-emerald-500/40'
                    : item.status === 'In Use'
                      ? 'hover:border-blue-300 dark:hover:border-blue-500/40'
                      : 'hover:border-rose-300 dark:hover:border-rose-500/40'
                )}
              >
              <div className="absolute top-0 right-0 p-3 sm:p-4 opacity-5 group-hover:scale-110 transition-transform duration-500">
                {item.type === 'Owned' ? <Wrench size={48} className="sm:w-16 sm:h-16" /> : <Truck size={48} className="sm:w-16 sm:h-16" />}
              </div>

              <div className="flex items-start justify-between mb-3 sm:mb-4">
                <div className={cn(
                  "p-2 sm:p-3 rounded-xl",
                  item.type === 'Owned' ? "bg-blue-100 dark:bg-blue-500/10 text-blue-600" : "bg-primary-light dark:bg-primary/10 text-primary"
                )}>
                  {item.type === 'Owned' ? <Wrench size={18} className="sm:w-6 sm:h-6" /> : <Truck size={18} className="sm:w-6 sm:h-6" />}
                </div>
                <span className={cn(
                  "text-[8px] sm:text-micro font-bold uppercase tracking-wider px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-full border",
                  item.status === 'Available' ? "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 border-emerald-100 dark:border-emerald-500/20" : 
                  item.status === 'In Use' ? "bg-blue-50 dark:bg-blue-500/10 text-blue-600 border-blue-100 dark:border-blue-500/20" : 
                  "bg-rose-50 dark:bg-rose-500/10 text-rose-600 border-rose-100 dark:border-rose-500/20"
                )}>
                  {item.status === 'Available' ? 'Disponible' : item.status === 'In Use' ? 'En Obra' : 'Mantenimiento'}
                </span>
              </div>

              <h3 className="text-sm sm:text-lg font-bold text-slate-900 dark:text-white mb-0.5 sm:mb-1 group-hover:text-primary transition-colors truncate">{item.name}</h3>
              <p className="text-[8px] sm:text-micro text-slate-500 dark:text-slate-400 font-bold uppercase tracking-widest mb-3 sm:mb-4">{item.type === 'Owned' ? 'Propio' : 'Rentado'}</p>
              
              <div className="space-y-2 sm:space-y-3 pt-3 sm:pt-4 border-t border-slate-50 dark:border-slate-800">
                <div className="flex items-center justify-between text-[10px] sm:text-sm">
                  <span className="text-slate-500 dark:text-slate-400">Costo Diario:</span>
                  <span className="font-bold text-slate-900 dark:text-white">{formatCurrency(item.dailyRate)}</span>
                </div>
                <div className="flex items-center gap-1.5 sm:gap-2 text-[10px] sm:text-xs text-slate-500 dark:text-slate-400">
                  <Construction size={12} className="sm:w-3.5 sm:h-3.5" />
                  <span className="truncate font-medium">{project?.name || 'No asignado'}</span>
                </div>
              </div>

              <div className="flex gap-1.5 sm:gap-2 pt-3 sm:pt-4 mt-3 sm:mt-4 border-t border-slate-50 dark:border-slate-800">
                <button 
                  onClick={() => openEditModal(item)}
                  title="Editar equipo"
                  className="flex-1 py-1.5 sm:py-2 bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-[10px] sm:text-xs font-bold rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-all border border-slate-100 dark:border-slate-700"
                >
                  Asignar / Editar
                </button>
                <button 
                  onClick={() => handleDeleteEquip(item.id)}
                  title="Eliminar equipo"
                  className="p-1.5 sm:p-2 text-slate-400 dark:text-slate-500 hover:text-rose-600 dark:hover:text-rose-400 transition-colors"
                >
                  <Trash2 size={14} className="sm:w-4 sm:h-4" />
                </button>
              </div>
            </motion.div>
          );
        })}
      </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex flex-col md:flex-row items-center justify-between gap-4 bg-white dark:bg-slate-900 glass-card p-6 rounded-[var(--radius-theme)] border border-slate-100 dark:border-slate-800 shadow-[var(--shadow-theme)] mt-8">
          <div className="flex items-center gap-4">
            <span className="text-sm text-slate-500 dark:text-slate-400 font-medium">
              Mostrando {paginatedEquipment.length} de {filteredEquipment.length} equipos
            </span>
            <div className="flex items-center gap-2">
              <label className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Por página:</label>
              <select 
                aria-label="Cantidad de equipos por pagina"
                title="Cantidad de equipos por pagina"
                className="px-2 py-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-bold outline-none text-slate-900 dark:text-white"
                value={itemsPerPage}
                onChange={(e) => {
                  setItemsPerPage(Number(e.target.value));
                  setCurrentPage(1);
                }}
              >
                <option value={8}>8</option>
                <option value={16}>16</option>
                <option value={32}>32</option>
              </select>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button 
              disabled={currentPage === 1}
              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
              aria-label="Pagina anterior"
              title="Pagina anterior"
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
              disabled={currentPage === totalPages}
              onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
              aria-label="Pagina siguiente"
              title="Pagina siguiente"
              className="p-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 transition-all disabled:opacity-50 disabled:cursor-not-allowed text-slate-600 dark:text-slate-400"
            >
              <ChevronRight size={20} />
            </button>
          </div>
        </div>
      )}

      <FormModal
        isOpen={isModalOpen}
        onClose={() => { setIsModalOpen(false); setEditingEquip(null); setCurrentStep(0); }}
        title={editingEquip ? 'Editar / Asignar Equipo' : 'Nuevo Equipo / Maquinaria'}
        fullVertical
        footer={
          <div className="flex flex-col sm:flex-row gap-4 w-full">
            <button 
              type="button"
              onClick={() => {
                if (currentStep > 0) {
                  setCurrentStep(prev => prev - 1);
                } else {
                  setIsModalOpen(false);
                  setEditingEquip(null);
                }
              }}
              className="flex-1 py-4 px-6 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 font-bold rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all order-2 sm:order-1 flex items-center justify-center gap-2"
            >
              {currentStep === 0 ? 'Cancelar' : (
                <>
                  <ChevronLeft size={20} />
                  Anterior
                </>
              )}
            </button>
            <button 
              type="button"
              onClick={() => {
                if (currentStep < 1) {
                  // Validate current step
                  if (!newEquip.name.trim()) {
                    toast.error('El nombre del equipo es obligatorio');
                    return;
                  }
                  setCurrentStep(prev => prev + 1);
                } else {
                  const form = document.getElementById('equip-form') as HTMLFormElement;
                  form?.requestSubmit();
                }
              }}
              disabled={isSubmitting}
              className="flex-1 py-4 px-6 bg-primary text-white font-bold rounded-xl hover:bg-primary-hover transition-all shadow-lg shadow-primary-shadow order-1 sm:order-2 flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {isSubmitting ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : currentStep === 1 ? (
                <>
                  <Check size={20} />
                  {editingEquip ? 'Guardar Cambios' : 'Registrar Equipo'}
                </>
              ) : (
                <>
                  Siguiente
                  <ChevronRight size={20} />
                </>
              )}
            </button>
          </div>
        }
      >
        <StepForm
          formId="equip-form"
          currentStep={currentStep}
          onStepChange={setCurrentStep}
          onSubmit={handleAddEquip}
          steps={[
            {
              title: "Básico",
              content: (
                <FormSection title="Información Básica" icon={Wrench} description="Datos principales del equipo">
                  <FormInput 
                    label="Nombre del Equipo"
                    required
                    value={newEquip.name}
                    onChange={(e) => setNewEquip({...newEquip, name: e.target.value})}
                    placeholder="Ej: Excavadora Caterpillar"
                  />
                  <FormSelect 
                    label="Tipo de Equipo"
                    value={newEquip.type}
                    onChange={(e) => setNewEquip({...newEquip, type: e.target.value})}
                  >
                    <option value="Owned">Propio</option>
                    <option value="Rented">Rentado</option>
                  </FormSelect>
                  <FormInput 
                    label="Costo Diario (GTQ)"
                    required
                    type="number"
                    min="0"
                    step="any"
                    value={newEquip.dailyRate}
                    onChange={(e) => setNewEquip({...newEquip, dailyRate: Number(e.target.value)})}
                  />
                </FormSection>
              )
            },
            {
              title: "Asignación",
              content: (
                <FormSection title="Asignación y Estado" icon={Construction} description="Ubicación y disponibilidad">
                  <FormSelect 
                    label="Asignar a Proyecto"
                    value={newEquip.projectId}
                    onChange={(e) => setNewEquip({...newEquip, projectId: e.target.value})}
                  >
                    <option value="">No asignado</option>
                    {projects.map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </FormSelect>
                  <FormInput 
                    label="Días Est. Uso"
                    type="number"
                    min="0"
                    value={newEquip.estimatedDays}
                    onChange={(e) => setNewEquip({...newEquip, estimatedDays: Number(e.target.value)})}
                    placeholder="Ej: 30"
                  />
                  <FormSelect 
                    label="Estado Actual"
                    disabled={!!newEquip.projectId}
                    value={newEquip.projectId ? 'In Use' : newEquip.status}
                    onChange={(e) => setNewEquip({...newEquip, status: e.target.value})}
                  >
                    <option value="Available">Disponible</option>
                    <option value="In Use">En Obra</option>
                    <option value="Maintenance">Mantenimiento</option>
                  </FormSelect>
                  {newEquip.projectId && (
                    <div className="col-span-full flex items-center gap-2 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-xl text-blue-600 dark:text-blue-400 text-xs font-bold">
                      <Info size={14} />
                      <span>Estado forzado a 'En Obra' por asignación activa</span>
                    </div>
                  )}
                </FormSection>
              )
            }
          ]}
        />
      </FormModal>
    </div>
    </>
  );
}
