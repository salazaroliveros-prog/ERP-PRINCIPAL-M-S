import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { 
  X, 
  Plus, 
  Trash2, 
  Save, 
  Calculator, 
  ChevronDown, 
  ChevronUp, 
  ChevronLeft,
  ChevronRight,
  AlertCircle,
  Clock,
  Package,
  Users as UsersIcon,
  Info,
  TrendingUp,
  Download,
  Zap,
  Droplets,
  Box,
  GripVertical,
  Check,
  FileText,
  FileSpreadsheet,
  ArrowUp,
  Edit3,
  Search,
  Sparkles,
  Loader2,
  CheckCircle2,
  Circle,
  Calendar,
  User
} from 'lucide-react';
import { GoogleGenAI, Type } from "@google/genai";
import { formatCurrency, formatDate, cn, handleApiError, OperationType } from '../lib/utils';
import { motion, AnimatePresence, Reorder } from 'motion/react';
import {
  APU_TEMPLATES,
  MARKET_DATA,
  AREA_FACTORS,
  buildBudgetSeedFromTemplate,
  findTemplateByDescription,
  getBudgetCategoryFromDescription,
  getAreaFactorByDescription,
} from '../constants/apuData';
import { toast } from 'sonner';
import { logAction } from '../lib/audit';
import { drawReportHeader } from '../lib/pdfUtils';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { FormModal } from './FormModal';
import ConfirmModal from './ConfirmModal';
import { CostCalculatorModal } from './CostCalculatorModal';
import {
  createProjectBudgetItem,
  deleteProjectBudgetItem,
  listProjects,
  listProjectBudgetItemsDetailed,
  reorderProjectBudgetItems,
  updateProjectBudgetItem,
  updateProjectBudgetSummary,
} from '../lib/projectsApi';
import { listTransactions } from '../lib/financialsApi';
import { createQuote, listInventoryByProject, syncInventoryFromBudget } from '../lib/operationsApi';
import { getBrandedCsvPreamble, escapeCsvCell } from '../lib/reportBranding';

interface ProjectBudgetProps {
  project: any;
  onClose: () => void;
  onProjectChange?: (nextProject: any) => void;
}

export default function ProjectBudget({ project, onClose, onProjectChange }: ProjectBudgetProps) {
  const [budgetItems, setBudgetItems] = useState<any[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [inventory, setInventory] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isInitializing, setIsInitializing] = useState(false);
  const [expandedItem, setExpandedItem] = useState<string | null>(null);
  const [isQuickView, setIsQuickView] = useState(false);
  const [isAddItemModalOpen, setIsAddItemModalOpen] = useState(false);
  const [isAPUImportModalOpen, setIsAPUImportModalOpen] = useState(false);
  const [apuImportTypology, setApuImportTypology] = useState<string>(project.typology || 'RESIDENCIAL');
  const [apuImportSearchTerm, setApuImportSearchTerm] = useState('');
  const [apuImportScrollTop, setApuImportScrollTop] = useState(0);
  const [editingItem, setEditingItem] = useState<any | null>(null);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const scrollContainerRef = React.useRef<HTMLDivElement>(null);
  const apuTemplatesListRef = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const handleScroll = () => {
      setShowScrollTop(container.scrollTop > 300);
    };

    container.addEventListener('scroll', handleScroll);
    return () => container.removeEventListener('scroll', handleScroll);
  }, []);

  const scrollToTop = () => {
    scrollContainerRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const [isSyncing, setIsSyncing] = useState(false);
  const [isMaterialExplosionOpen, setIsMaterialExplosionOpen] = useState(false);
  const [isGeneratingQuote, setIsGeneratingQuote] = useState(false);
  const [newItem, setNewItem] = useState({
    description: '',
    unit: '',
    quantity: 0,
    materialCost: 0,
    laborCost: 0,
    indirectFactor: 0.2,
    notes: '',
    category: 'General',
    materials: [] as any[],
    labor: [] as any[],
    subtasks: [] as any[]
  });
  const [viewingTransactionsForItem, setViewingTransactionsForItem] = useState<any | null>(null);
  const [viewingTransactionsForMaterial, setViewingTransactionsForMaterial] = useState<{item: any, material: any} | null>(null);
  const [isQuickActionsOpen, setIsQuickActionsOpen] = useState(false);
  const [projectSelectorItems, setProjectSelectorItems] = useState<any[]>([]);
  const [projectSelectorSearch, setProjectSelectorSearch] = useState('');
  const [isProjectPanelCollapsed, setIsProjectPanelCollapsed] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem('project-budget-side-panel-collapsed') === '1';
  });
  const [isMobileProjectPanelOpen, setIsMobileProjectPanelOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isCostCalculatorOpen, setIsCostCalculatorOpen] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [isRepairingDefaultRows, setIsRepairingDefaultRows] = useState(false);
  const [budgetStatus, setBudgetStatus] = useState(project.budgetStatus || 'Draft');
  const [budgetValidatedAt, setBudgetValidatedAt] = useState<any>(project.budgetValidatedAt || null);
  const [wasValidated, setWasValidated] = useState(
    project.budgetStatus === 'Validated' || Boolean(project.budgetValidatedAt)
  );

  useEffect(() => {
    setBudgetStatus(project.budgetStatus || 'Draft');
    setBudgetValidatedAt(project.budgetValidatedAt || null);
    if (project.budgetStatus === 'Validated' || Boolean(project.budgetValidatedAt)) {
      setWasValidated(true);
    }
  }, [project.budgetStatus, project.budgetValidatedAt]);

  const isBudgetLocked = budgetStatus === 'Validated';

  const guardBudgetLocked = useCallback(() => {
    if (!isBudgetLocked) return false;
    toast.info('El presupuesto está validado y bloqueado. Use "Desbloquear" para editar.');
    return true;
  }, [isBudgetLocked]);

  const loadBudgetItems = useCallback(async () => {
    if (!project.id) return;

    setIsLoading(true);
    try {
      const items = await listProjectBudgetItemsDetailed(project.id);
      setBudgetItems(items as any[]);
    } catch (error) {
      console.error('Error loading budget items from API:', error);
      toast.error('No se pudieron cargar los renglones del presupuesto');
    } finally {
      setIsLoading(false);
    }
  }, [project.id]);

  const patchBudgetItem = useCallback(
    async (itemId: string, payload: Record<string, any>) => {
      await updateProjectBudgetItem(project.id, itemId, payload);
    },
    [project.id]
  );

  const patchProjectBudget = useCallback(
    async (payload: {
      budget?: number;
      budgetStatus?: string;
      budgetValidationMessage?: string;
      budgetValidationType?: string;
      budgetValidatedAt?: string | null;
      typology?: string;
    }) => {
      await updateProjectBudgetSummary(project.id, payload);
    },
    [project.id]
  );

  const loadProjectTransactions = useCallback(async () => {
    if (!project.id) {
      setTransactions([]);
      return;
    }

    try {
      const pageSize = 200;
      let nextOffset = 0;
      let keepGoing = true;
      const allItems: any[] = [];

      while (keepGoing) {
        const response = await listTransactions({
          projectId: project.id,
          limit: pageSize,
          offset: nextOffset,
        });

        allItems.push(...response.items);
        nextOffset += response.items.length;
        keepGoing = response.hasMore;
      }

      setTransactions(allItems);
    } catch (error) {
      console.error('Error loading project transactions from API:', error);
      toast.error('No se pudieron cargar las transacciones del proyecto');
      setTransactions([]);
    }
  }, [project.id]);

  const loadProjectInventory = useCallback(async () => {
    if (!project.id) {
      setInventory([]);
      return;
    }

    try {
      const items = await listInventoryByProject(project.id);
      setInventory(items as any[]);
    } catch (error) {
      console.error('Error loading inventory from API:', error);
      setInventory([]);
    }
  }, [project.id]);

  const handleAutoCalculateQuantities = async () => {
    if (guardBudgetLocked()) return;

    if (!project.area || project.area <= 0) {
      toast.error('El proyecto debe tener un área (m2) definida para auto-calcular cantidades');
      return;
    }

    const factors = AREA_FACTORS[project.typology as keyof typeof AREA_FACTORS];
    if (!factors) {
      toast.error(`No hay factores de área definidos para la tipología ${project.typology}`);
      return;
    }

    setIsInitializing(true);
    try {
      const recalculatedItems: any[] = [];

      for (const item of budgetItems) {
        const factor = getAreaFactorByDescription(project.typology, item.description);
        const newQuantity = factor !== undefined ? project.area * factor : (Number(item.quantity) || 0);
        const recalculatedItem = recalculateItemTotals({ ...item, quantity: newQuantity });

        await patchBudgetItem(item.id, {
          quantity: recalculatedItem.quantity,
          materialCost: recalculatedItem.materialCost,
          laborCost: recalculatedItem.laborCost,
          indirectCost: recalculatedItem.indirectCost,
          totalUnitPrice: recalculatedItem.totalUnitPrice,
          totalItemPrice: recalculatedItem.totalItemPrice,
          estimatedDays: recalculatedItem.estimatedDays,
        });

        recalculatedItems.push(recalculatedItem);
      }

      const newTotalBudget = sumProjectBudget(recalculatedItems);

      await loadBudgetItems();
      
      await patchProjectBudget({
        budget: newTotalBudget,
      });

      toast.success('Cantidades calculadas automáticamente según el área del proyecto');
    } catch (error) {
      handleApiError(error, OperationType.WRITE, `projects/${project.id}/budgetItems`);
    } finally {
      setIsInitializing(false);
    }
  };

  const syncToInventory = async () => {
    if (!project.id) return;
    
    setIsSyncing(true);
    try {
      const materialSummary: { [key: string]: any } = {};
      budgetItems.forEach((item: any) => {
        const itemQty = item.quantity || 0;
        if (item.materials && Array.isArray(item.materials)) {
          item.materials.forEach((m: any) => {
            const key = m.name.toLowerCase();
            if (!materialSummary[key]) {
              materialSummary[key] = {
                name: m.name,
                unit: m.unit,
                totalQuantity: 0,
                unitPrice: m.unitPrice,
                category: 'Material de Obra'
              };
            }
            materialSummary[key].totalQuantity += (m.quantity * itemQty);
          });
        }
      });

      const payload = Object.values(materialSummary)
        .filter((mat: any) => String(mat?.name || '').trim().length > 0 && Number(mat?.totalQuantity || 0) > 0)
        .map((mat: any) => ({
          name: mat.name,
          unit: mat.unit,
          totalQuantity: mat.totalQuantity,
          unitPrice: mat.unitPrice,
          category: mat.category,
        }));

      if (payload.length === 0) {
        toast.info('No hay materiales presupuestados para sincronizar al inventario');
        return;
      }

      await syncInventoryFromBudget(
        project.id,
        payload
      );

      await loadProjectInventory();
      
      toast.success('Materiales sincronizados con el inventario del proyecto');
      await logAction('Sincronización de Inventario', 'Presupuesto', `Se sincronizaron ${Object.keys(materialSummary).length} materiales con el inventario del proyecto ${project.name}`, 'update', { projectId: project.id, materialCount: Object.keys(materialSummary).length });
    } catch (error) {
      console.error('Error syncing materials:', error);
      toast.error('Error al sincronizar materiales');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleValidateAndActivate = async () => {
    setIsValidating(true);
    try {
      const marketInfo = MARKET_DATA[project.typology as keyof typeof MARKET_DATA];
      const currentCostPerM2 = project.area > 0 ? totalBudget / project.area : 0;
      
      let message = '';
      let type: 'success' | 'warning' | 'error' = 'success';

      if (!marketInfo) {
        message = 'No hay datos de mercado para esta tipología. El presupuesto se marcará como validado manualmente.';
      } else {
        const diff = Math.abs(currentCostPerM2 - marketInfo.pricePerM2) / marketInfo.pricePerM2;
        if (diff < 0.15) {
          message = `Presupuesto saludable. El costo por m2 (${formatCurrency(currentCostPerM2)}) está dentro del rango esperado para ${project.typology}.`;
        } else if (diff < 0.30) {
          message = `Desviación moderada. El costo por m2 (${formatCurrency(currentCostPerM2)}) difiere un ${(diff * 100).toFixed(1)}% del promedio de mercado (${formatCurrency(marketInfo.pricePerM2)}).`;
          type = 'warning';
        } else {
          message = `Desviación crítica. El costo por m2 (${formatCurrency(currentCostPerM2)}) difiere un ${(diff * 100).toFixed(1)}% del promedio de mercado (${formatCurrency(marketInfo.pricePerM2)}). Por favor revise los rendimientos y precios unitarios.`;
          type = 'error';
        }
      }

      await patchProjectBudget({
        budgetStatus: 'Validated',
        budgetValidationMessage: message,
        budgetValidationType: type,
        budgetValidatedAt: new Date().toISOString(),
        budget: totalBudget
      });

      setBudgetStatus('Validated');
      setBudgetValidatedAt(new Date().toISOString());
      setWasValidated(true);
      setEditingItem(null);

      // Sync materials to inventory automatically on validation
      await syncToInventory();

      if (type === 'success') toast.success('Presupuesto validado y activado correctamente');
      else if (type === 'warning') toast.warning('Presupuesto activado con advertencias');
      else toast.error('Presupuesto activado con desviaciones críticas');

    } catch (error) {
      handleApiError(error, OperationType.WRITE, 'projects');
    } finally {
      setIsValidating(false);
    }
  };

  const handleUnlockBudget = async () => {
    try {
      await patchProjectBudget({
        budgetStatus: 'Draft',
        budgetValidatedAt: null,
      });
      setBudgetStatus('Draft');
      setBudgetValidatedAt(null);
      toast.success('Presupuesto desbloqueado para edición');
    } catch (error) {
      handleApiError(error, OperationType.WRITE, 'projects');
    }
  };

  const handleGenerateQuote = async () => {
    if (budgetItems.length === 0) {
      toast.error('No hay items en el presupuesto para generar una cotización');
      return;
    }

    const clientId = project.clientUid || project.clientId;
    if (!clientId) {
      toast.error('El proyecto no tiene un cliente asociado');
      return;
    }

    setIsGeneratingQuote(true);
    try {
      const quoteData = {
        clientId: clientId,
        projectId: project.id,
        date: new Date().toISOString(),
        items: budgetItems.map(item => ({
          description: item.description,
          quantity: item.quantity,
          unitPrice: (item.materialCost + item.laborCost) * (1 + (item.indirectFactor || 0.2)),
          materials: item.materials || [],
          labor: item.labor || [],
          indirectFactor: item.indirectFactor || 0.2,
          materialCost: item.materialCost || 0,
          laborCost: item.laborCost || 0
        })),
        status: 'Pending',
        total: budgetItems.reduce((acc, item) => {
          const unitPrice = (item.materialCost + item.laborCost) * (1 + (item.indirectFactor || 0.2));
          return acc + (item.quantity * unitPrice);
        }, 0)
      };

      await createQuote(quoteData);
      toast.success('Cotización generada con éxito');
      setIsQuickActionsOpen(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error desconocido';
      toast.error('No se pudo generar la cotización', { description: message });
    } finally {
      setIsGeneratingQuote(false);
    }
  };

  const materialLibrary = useMemo(() => {
    const allMaterials: any[] = [];
    Object.values(APU_TEMPLATES).forEach((templates: any) => {
      templates.forEach((t: any) => {
        t.materials.forEach((m: any) => {
          if (!allMaterials.find(am => am.name === m.name)) {
            allMaterials.push({ ...m, quantity: 1 }); // Default quantity for adding
          }
        });
      });
    });
    return allMaterials.sort((a, b) => a.name.localeCompare(b.name));
  }, []);

  const filteredApuTemplates = useMemo(() => {
    const templates = APU_TEMPLATES[apuImportTypology] || [];
    const normalizedQuery = apuImportSearchTerm.toLowerCase().trim();
    if (!normalizedQuery) {
      return templates;
    }

    return templates.filter((template: any) =>
      String(template.description || '').toLowerCase().includes(normalizedQuery)
    );
  }, [apuImportSearchTerm, apuImportTypology]);

  const openApuImportModal = useCallback(() => {
    setIsAPUImportModalOpen(true);
  }, []);

  useEffect(() => {
    if (!isAPUImportModalOpen || !apuTemplatesListRef.current) return;
    apuTemplatesListRef.current.scrollTop = apuImportScrollTop;
  }, [isAPUImportModalOpen]);

  const importFromApuTemplate = useCallback((template: any) => {
    const autoCategory = getBudgetCategoryFromDescription(template.description);
    setNewItem((prev) => ({
      ...prev,
      description: template.description,
      category: autoCategory,
      unit: template.unit,
      materials: template.materials,
      labor: template.labor,
      indirectFactor: template.indirectFactor,
      materialCost: template.materials.reduce((sum: number, m: any) => sum + (m.quantity * m.unitPrice), 0),
      laborCost: template.labor.reduce((sum: number, l: any) => sum + (l.dailyRate / l.yield), 0)
    }));
    setIsAPUImportModalOpen(false);
    toast.success('Plantilla cargada correctamente');
  }, []);

  const laborLibrary = useMemo(() => {
    const allLabor: any[] = [];
    Object.values(APU_TEMPLATES).forEach((templates: any) => {
      templates.forEach((t: any) => {
        t.labor.forEach((l: any) => {
          if (!allLabor.find(al => al.role === l.role)) {
            allLabor.push(l);
          }
        });
      });
    });
    return allLabor.sort((a, b) => a.role.localeCompare(b.role));
  }, []);

  const [materialSearch, setMaterialSearch] = useState("");
  const [showMaterialLibrary, setShowMaterialLibrary] = useState<string | null>(null); // itemId or 'new'

  const sumProjectBudget = useCallback((items: any[]) => {
    return items.reduce((sum, item) => sum + (item.totalItemPrice || 0), 0);
  }, []);

  const buildMaterialExplosion = useCallback((items: any[]) => {
    const exploded: Record<string, { name: string; unit: string; quantity: number; unitPrice: number; total: number }> = {};

    items.forEach((item) => {
      const itemQuantity = Number(item.quantity) || 0;
      const materials = Array.isArray(item.materials) ? item.materials : [];

      materials.forEach((m: any) => {
        const name = String(m?.name || '').trim() || 'Material sin nombre';
        const unit = String(m?.unit || '').trim() || 'u';
        const unitQty = Number(m?.quantity) || 0;
        const unitPrice = Number(m?.unitPrice) || 0;
        const totalQty = unitQty * itemQuantity;
        const totalAmount = totalQty * unitPrice;
        const key = `${name}_${unit}`;

        if (!exploded[key]) {
          exploded[key] = { name, unit, quantity: 0, unitPrice, total: 0 };
        }

        exploded[key].quantity += totalQty;
        exploded[key].unitPrice = unitPrice;
        exploded[key].total += totalAmount;
      });
    });

    return exploded;
  }, []);

  const recalculateItemTotals = useCallback((item: any) => {
    const safeMaterials = Array.isArray(item.materials) ? item.materials : [];
    const safeLabor = Array.isArray(item.labor) ? item.labor : [];
    const safeQuantity = Number.isFinite(Number(item.quantity)) ? Number(item.quantity) : 0;
    const safeIndirectFactor = Number.isFinite(Number(item.indirectFactor))
      ? Number(item.indirectFactor)
      : 0.2;

    const materialCost = safeMaterials.reduce(
      (sum: number, m: any) => sum + ((Number(m.quantity) || 0) * (Number(m.unitPrice) || 0)),
      0
    );
    const laborCost = safeLabor.reduce((sum: number, l: any) => {
      const dailyRate = Number(l.dailyRate) || 0;
      const yieldValue = Number(l.yield) || 0;
      if (yieldValue <= 0) return sum;
      return sum + (dailyRate / yieldValue);
    }, 0);

    const directCost = materialCost + laborCost;
    const indirectCost = directCost * safeIndirectFactor;
    const totalUnitPrice = directCost + indirectCost;
    const totalItemPrice = safeQuantity * totalUnitPrice;

    let estimatedDays = 0;
    if (safeLabor.length > 0) {
      const daysPerRole = safeLabor
        .map((l: any) => {
          const yieldValue = Number(l.yield) || 0;
          if (yieldValue <= 0) return 0;
          return safeQuantity / yieldValue;
        })
        .filter((days: number) => Number.isFinite(days));
      estimatedDays = daysPerRole.length > 0 ? Math.max(...daysPerRole) : 0;
    }

    return {
      ...item,
      quantity: safeQuantity,
      indirectFactor: safeIndirectFactor,
      materialCost,
      laborCost,
      indirectCost,
      totalUnitPrice,
      totalItemPrice,
      estimatedDays,
    };
  }, []);

  const repairIncompleteDefaultRows = useCallback(async () => {
    if (isRepairingDefaultRows || budgetItems.length === 0 || isBudgetLocked) {
      return;
    }

    const rowsToFix = budgetItems
      .map((item) => {
        const template = findTemplateByDescription(project.typology, item.description);
        if (!template) {
          return null;
        }

        const expectedMaterials = Array.isArray(template.materials) ? template.materials.length : 0;
        const expectedLabor = Array.isArray(template.labor) ? template.labor.length : 0;
        const hasMaterials = Array.isArray(item.materials) && item.materials.length >= expectedMaterials;
        const hasLabor = Array.isArray(item.labor) && item.labor.length >= expectedLabor;
        const hasUnitPrice = (Number(item.totalUnitPrice) || 0) > 0;
        const hasUnit = String(item.unit || '').trim().length > 0;
        const isComplete =
          (!expectedMaterials || hasMaterials) &&
          (!expectedLabor || hasLabor) &&
          hasUnitPrice &&
          hasUnit;
        if (isComplete) {
          return null;
        }

        const seed = buildBudgetSeedFromTemplate(
          template,
          Number(item.quantity) || 0,
          project.location
        );

        return {
          id: item.id,
          unit: template.unit,
          ...seed,
        };
      })
      .filter(Boolean) as Array<{
        id: string;
        unit: string;
        materials: any[];
        labor: any[];
        materialCost: number;
        laborCost: number;
        indirectFactor: number;
        indirectCost: number;
        totalUnitPrice: number;
        totalItemPrice: number;
        estimatedDays: number;
      }>;

    if (rowsToFix.length === 0) {
      return;
    }

    setIsRepairingDefaultRows(true);
    try {
      for (const row of rowsToFix) {
        await patchBudgetItem(row.id, {
          unit: row.unit,
          materials: row.materials,
          labor: row.labor,
          materialCost: row.materialCost,
          laborCost: row.laborCost,
          indirectFactor: row.indirectFactor,
          indirectCost: row.indirectCost,
          totalUnitPrice: row.totalUnitPrice,
          totalItemPrice: row.totalItemPrice,
          estimatedDays: row.estimatedDays,
        });
      }

      const mergedItems = budgetItems.map((item) => {
        const fixed = rowsToFix.find((row) => row.id === item.id);
        if (!fixed) return item;
        return {
          ...item,
          ...fixed,
        };
      });

      await patchProjectBudget({
        budget: sumProjectBudget(mergedItems),
        typology: project.typology,
      });

      await loadBudgetItems();
      toast.success(`Se completaron costos y rendimientos automáticos en ${rowsToFix.length} renglón(es)`);
    } catch (error) {
      await loadBudgetItems();
      handleApiError(error, OperationType.WRITE, `projects/${project.id}/budgetItems`);
    } finally {
      setIsRepairingDefaultRows(false);
    }
  }, [
    budgetItems,
    isRepairingDefaultRows,
    loadBudgetItems,
    patchBudgetItem,
    patchProjectBudget,
    project.id,
    project.location,
    project.typology,
    sumProjectBudget,
    isBudgetLocked,
  ]);

  const addSubtaskToNewItem = () => {
    setNewItem({
      ...newItem,
      subtasks: [...newItem.subtasks, { name: '', assignee: '', status: 'Pendiente' }]
    });
  };

  const removeSubtaskFromNewItem = (index: number) => {
    const updated = [...newItem.subtasks];
    updated.splice(index, 1);
    setNewItem({ ...newItem, subtasks: updated });
  };

  const updateSubtaskInNewItem = (index: number, field: string, value: any) => {
    const updated = [...newItem.subtasks];
    updated[index] = { ...updated[index], [field]: value };
    setNewItem({ ...newItem, subtasks: updated });
  };

  const addSubtaskToItem = async (itemId: string, subtask: any) => {
    if (guardBudgetLocked()) return;

    const item = budgetItems.find(i => i.id === itemId);
    if (!item) return;

    const updatedSubtasks = [...(item.subtasks || []), subtask];
    const updatedItems = budgetItems.map((budgetItem) =>
      budgetItem.id === itemId
        ? { ...budgetItem, subtasks: updatedSubtasks }
        : budgetItem
    );
    setBudgetItems(updatedItems);
    
    if (editingItem?.id === itemId) {
      setEditingItem({ ...editingItem, subtasks: updatedSubtasks });
    }

    try {
      await patchBudgetItem(itemId, {
        subtasks: updatedSubtasks
      });
      toast.success('Subtarea agregada correctamente');
    } catch (error) {
      await loadBudgetItems();
      handleApiError(error, OperationType.WRITE, `projects/${project.id}/budgetItems/${itemId}`);
    }
  };

  const removeSubtaskFromItem = async (itemId: string, index: number) => {
    if (guardBudgetLocked()) return;

    const item = budgetItems.find(i => i.id === itemId);
    if (!item) return;

    const updatedSubtasks = (item.subtasks || []).filter((_: any, i: number) => i !== index);
    const updatedItems = budgetItems.map((budgetItem) =>
      budgetItem.id === itemId
        ? { ...budgetItem, subtasks: updatedSubtasks }
        : budgetItem
    );
    setBudgetItems(updatedItems);
    
    if (editingItem?.id === itemId) {
      setEditingItem({ ...editingItem, subtasks: updatedSubtasks });
    }

    try {
      await patchBudgetItem(itemId, {
        subtasks: updatedSubtasks
      });
      toast.success('Subtarea eliminada correctamente');
    } catch (error) {
      await loadBudgetItems();
      handleApiError(error, OperationType.WRITE, `projects/${project.id}/budgetItems/${itemId}`);
    }
  };

  const updateSubtaskInItem = async (itemId: string, index: number, field: string, value: any) => {
    if (guardBudgetLocked()) return;

    const item = budgetItems.find(i => i.id === itemId);
    if (!item) return;

    const updatedSubtasks = [...(item.subtasks || [])];
    updatedSubtasks[index] = { ...updatedSubtasks[index], [field]: value };
    const updatedItems = budgetItems.map((budgetItem) =>
      budgetItem.id === itemId
        ? { ...budgetItem, subtasks: updatedSubtasks }
        : budgetItem
    );
    setBudgetItems(updatedItems);
    
    if (editingItem?.id === itemId) {
      setEditingItem({ ...editingItem, subtasks: updatedSubtasks });
    }

    try {
      await patchBudgetItem(itemId, {
        subtasks: updatedSubtasks
      });
    } catch (error) {
      await loadBudgetItems();
      handleApiError(error, OperationType.WRITE, `projects/${project.id}/budgetItems/${itemId}`);
    }
  };

  const addMaterialToNewItem = () => {
    setNewItem({
      ...newItem,
      materials: [...newItem.materials, { name: '', unit: '', quantity: 0, unitPrice: 0 }]
    });
  };

  const removeMaterialFromNewItem = (index: number) => {
    const updated = [...newItem.materials];
    updated.splice(index, 1);
    setNewItem({ ...newItem, materials: updated });
  };

  const updateMaterialInNewItem = (index: number, field: string, value: any) => {
    if ((field === 'quantity' || field === 'unitPrice') && Number(value) < 0) {
      toast.error('El valor no puede ser negativo');
      return;
    }
    const updated = [...newItem.materials];
    updated[index] = { ...updated[index], [field]: value };
    
    // Recalculate materialCost if we want it to be automatic
    const totalMatCost = updated.reduce((sum, m) => sum + (m.quantity * m.unitPrice), 0);
    setNewItem({ ...newItem, materials: updated, materialCost: totalMatCost });
  };

  const addLaborToNewItem = () => {
    setNewItem({
      ...newItem,
      labor: [...newItem.labor, { role: '', yield: 1, dailyRate: 0 }]
    });
  };

  const removeLaborFromNewItem = (index: number) => {
    const updated = [...newItem.labor];
    updated.splice(index, 1);
    setNewItem({ ...newItem, labor: updated });
  };

  const updateLaborInNewItem = (index: number, field: string, value: any) => {
    if ((field === 'yield' || field === 'dailyRate') && Number(value) < 0) {
      toast.error('El valor no puede ser negativo');
      return;
    }
    if (field === 'yield' && Number(value) === 0) {
      toast.error('El rendimiento no puede ser cero');
      return;
    }
    const updated = [...newItem.labor];
    updated[index] = { ...updated[index], [field]: value };
    
    // Recalculate laborCost
    const totalLaborCost = updated.reduce((sum, l) => sum + (l.yield > 0 ? l.dailyRate / l.yield : 0), 0);
    setNewItem({ ...newItem, labor: updated, laborCost: totalLaborCost });
  };

  useEffect(() => {
    loadBudgetItems();
    loadProjectInventory();
  }, [loadBudgetItems, loadProjectInventory]);

  useEffect(() => {
    loadProjectTransactions();
  }, [loadProjectTransactions]);

  useEffect(() => {
    if (isLoading || isInitializing || budgetItems.length === 0) {
      return;
    }

    void repairIncompleteDefaultRows();
  }, [budgetItems, isInitializing, isLoading, repairIncompleteDefaultRows]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const items = await listProjects();
        if (!cancelled) {
          setProjectSelectorItems(items);
        }
      } catch {
        if (!cancelled) {
          setProjectSelectorItems([]);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem('project-budget-side-panel-collapsed', isProjectPanelCollapsed ? '1' : '0');
  }, [isProjectPanelCollapsed]);

  useEffect(() => {
    setIsMobileProjectPanelOpen(false);
  }, [project?.id]);

  const filteredProjectSelectorItems = useMemo(() => {
    const query = projectSelectorSearch.trim().toLowerCase();
    if (!query) return projectSelectorItems;
    return projectSelectorItems.filter((item) =>
      String(item.name || '').toLowerCase().includes(query) ||
      String(item.location || '').toLowerCase().includes(query)
    );
  }, [projectSelectorItems, projectSelectorSearch]);

  const handleExportMaterialSummary = () => {
    if (budgetItems.length === 0) {
      toast.error('No hay items en el presupuesto');
      return;
    }

    const doc = new jsPDF();
    const date = new Date().toLocaleDateString();
    
    // Aggregating materials
    const materialSummary: { [key: string]: { name: string, unit: string, totalQuantity: number, unitPrice: number, totalCost: number } } = {};
    
    budgetItems.forEach(item => {
      const itemQty = item.quantity || 0;
      if (item.materials && Array.isArray(item.materials)) {
        item.materials.forEach((m: any) => {
          const key = `${m.name}_${m.unit}`;
          if (!materialSummary[key]) {
            materialSummary[key] = {
              name: m.name,
              unit: m.unit,
              totalQuantity: 0,
              unitPrice: m.unitPrice,
              totalCost: 0
            };
          }
          const totalQty = m.quantity * itemQty;
          materialSummary[key].totalQuantity += totalQty;
          materialSummary[key].totalCost += totalQty * m.unitPrice;
        });
      }
    });

    const summaryRows = Object.values(materialSummary)
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(m => [
        m.name,
        m.unit,
        m.totalQuantity.toFixed(2),
        formatCurrency(m.unitPrice),
        formatCurrency(m.totalCost)
      ]);

    const totalMaterialCost = Object.values(materialSummary).reduce((sum, m) => sum + m.totalCost, 0);

    const headerBottom = drawReportHeader(doc, 'RESUMEN DE MATERIALES CONSUMIDOS', {
      subtitle: `Proyecto: ${project.name}`,
      dateText: `Fecha: ${date}`,
      x: 20,
      y: 10,
    });

    autoTable(doc, {
      startY: headerBottom + 8,
      head: [['Material', 'Unidad', 'Cantidad Total', 'Precio Unit.', 'Costo Total']],
      body: summaryRows,
      theme: 'grid',
      headStyles: { fillColor: [242, 125, 38], textColor: [255, 255, 255], fontStyle: 'bold' },
      styles: { fontSize: 9, cellPadding: 3 },
      columnStyles: {
        2: { halign: 'right' },
        3: { halign: 'right' },
        4: { halign: 'right' }
      },
      foot: [['TOTAL MATERIALES', '', '', '', formatCurrency(totalMaterialCost)]],
      footStyles: { fillColor: [241, 245, 249], textColor: [30, 41, 59], fontStyle: 'bold', halign: 'right' }
    });

    doc.save(`resumen_materiales_${project.name.replace(/\s+/g, '_')}.pdf`);
    toast.success('Resumen de materiales exportado con éxito');
  };

  const initializeBudget = async () => {
    if (guardBudgetLocked()) return;

    setIsInitializing(true);
    try {
      const templates = APU_TEMPLATES[project.typology] || APU_TEMPLATES.RESIDENCIAL;
      for (let index = 0; index < templates.length; index += 1) {
        const template = templates[index];
        const seed = buildBudgetSeedFromTemplate(template, 0, project.location);

        await createProjectBudgetItem(project.id, {
          description: template.description,
          category: getBudgetCategoryFromDescription(template.description),
          unit: template.unit,
          quantity: 0, // User will input this
          materialCost: seed.materialCost,
          laborCost: seed.laborCost,
          indirectCost: seed.indirectCost,
          totalUnitPrice: seed.totalUnitPrice,
          totalItemPrice: 0,
          estimatedDays: 0,
          order: index + 1,
          materials: seed.materials,
          labor: seed.labor,
          indirectFactor: seed.indirectFactor,
          subtasks: [],
        });
      }

      await loadBudgetItems();
    } catch (error) {
      handleApiError(error, OperationType.WRITE, `projects/${project.id}/budgetItems`);
    } finally {
      setIsInitializing(false);
    }
  };

  const handleReorder = async (newOrder: any[]) => {
    if (guardBudgetLocked()) return;

    setBudgetItems(newOrder);
    
    try {
      await reorderProjectBudgetItems(project.id, newOrder.map(item => item.id));
      await loadBudgetItems();
    } catch (error) {
      handleApiError(error, OperationType.WRITE, `projects/${project.id}/budgetItems/reorder`);
    }
  };

  const updateQuantity = async (itemId: string, quantity: number) => {
    if (guardBudgetLocked()) return;

    if (!Number.isFinite(quantity)) {
      return;
    }
    if (quantity < 0) {
      toast.error('La cantidad debe ser un número válido y no negativo');
      return;
    }
    const item = budgetItems.find(i => i.id === itemId);
    if (!item) return;

    const recalculatedItem = recalculateItemTotals({
      ...item,
      quantity,
    });

    const updatedBudgetItems = budgetItems.map((budgetItem) =>
      budgetItem.id === itemId
        ? recalculatedItem
        : budgetItem
    );

    setBudgetItems(updatedBudgetItems);

    if (editingItem?.id === itemId) {
      setEditingItem(recalculatedItem);
    }

    const newTotalBudget = updatedBudgetItems.reduce(
      (sum, budgetItem) => sum + (budgetItem.totalItemPrice || 0),
      0
    );

    try {
      await patchBudgetItem(itemId, {
        quantity: recalculatedItem.quantity,
        materialCost: recalculatedItem.materialCost,
        laborCost: recalculatedItem.laborCost,
        indirectCost: recalculatedItem.indirectCost,
        totalUnitPrice: recalculatedItem.totalUnitPrice,
        totalItemPrice: recalculatedItem.totalItemPrice,
        estimatedDays: recalculatedItem.estimatedDays,
      });

      await patchProjectBudget({
        budget: newTotalBudget,
        typology: project.typology,
      });
    } catch (error) {
      await loadBudgetItems();
      handleApiError(error, OperationType.WRITE, `projects/${project.id}/budgetItems/${itemId}`);
    }
  };

  const handleQuantityInputChange = (itemId: string, rawValue: string) => {
    if (rawValue.trim() === '') {
      return;
    }

    const parsedQuantity = Number(rawValue.replace(',', '.'));
    if (!Number.isFinite(parsedQuantity)) {
      return;
    }

    updateQuantity(itemId, parsedQuantity);
  };

  const handleDeleteItem = (itemId: string) => {
    if (guardBudgetLocked()) return;

    setItemToDelete(itemId);
    setIsDeleteConfirmOpen(true);
  };

  const confirmDeleteItem = async () => {
    if (guardBudgetLocked()) return;

    if (!itemToDelete) return;
    try {
      await deleteProjectBudgetItem(project.id, itemToDelete);
      const updatedItems = budgetItems.filter((i) => i.id !== itemToDelete);
      setBudgetItems(updatedItems);
      
      const deletedItem = budgetItems.find(i => i.id === itemToDelete);
      await logAction(
        'Eliminación de Renglón',
        'Presupuesto',
        `Renglón "${deletedItem?.description || itemToDelete}" eliminado del proyecto "${project.name}"`,
        'delete',
        { projectId: project.id, itemId: itemToDelete }
      );

      await patchProjectBudget({
        budget: sumProjectBudget(updatedItems),
        typology: project.typology,
      });

      toast.success('Renglón eliminado correctamente');
      setItemToDelete(null);
      setIsDeleteConfirmOpen(false);
    } catch (error) {
      await loadBudgetItems();
      handleApiError(error, OperationType.DELETE, `projects/${project.id}/budgetItems/${itemToDelete}`);
    }
  };

  const handleImportFromCalculator = async (items: any[]) => {
    if (guardBudgetLocked()) return;

    try {
      const currentCount = budgetItems.length;

      for (let index = 0; index < items.length; index += 1) {
        const item = items[index];
        await createProjectBudgetItem(project.id, {
          description: item.description,
          category: item.category || getBudgetCategoryFromDescription(item.description),
          unit: item.unit,
          quantity: item.quantity,
          materialCost: item.materialCost,
          laborCost: item.laborCost,
          indirectCost: item.indirectCost,
          totalUnitPrice: item.totalUnitPrice,
          totalItemPrice: item.totalItemPrice,
          estimatedDays: 0, // Will be calculated below
          order: currentCount + index + 1,
          materials: item.materials || [],
          labor: item.labor || [],
          indirectFactor: item.indirectFactor || 0.2,
          subtasks: item.subtasks || [],
        });
      }
      
      await logAction(
        'Importación de Calculadora',
        'Presupuesto',
        `Se importaron ${items.length} renglones desde la calculadora al proyecto "${project.name}"`,
        'create',
        { projectId: project.id, itemCount: items.length }
      );

      // Update project total budget
      const newTotalBudget = budgetItems.reduce((sum, i) => sum + (i.totalItemPrice || 0), 0) + 
                             items.reduce((sum, i) => sum + i.totalItemPrice, 0);

      await patchProjectBudget({
        budget: newTotalBudget,
      });

      await loadBudgetItems();
    } catch (error) {
      handleApiError(error, OperationType.WRITE, `projects/${project.id}/budgetItems/import`);
    }
  };

  const handleAISuggestions = async () => {
    if (!newItem.description) {
      toast.error('Por favor ingrese una descripción antes de sugerir');
      return;
    }

    setIsGenerating(true);
    try {
      const ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_GEMINI_API_KEY });
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: `Como experto en presupuestos de construcción, sugiere costos estimados de materiales y mano de obra por unidad para el item "${newItem.description}" en un proyecto de tipo "${project.typology || 'General'}". Proporciona la respuesta en español.`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              materialCost: {
                type: Type.NUMBER,
                description: "Costo estimado de materiales por unidad."
              },
              laborCost: {
                type: Type.NUMBER,
                description: "Costo estimado de mano de obra por unidad."
              },
              unit: {
                type: Type.STRING,
                description: "Unidad de medida sugerida (m2, m3, ml, etc.)."
              }
            },
            required: ["materialCost", "laborCost", "unit"]
          }
        }
      });

      if (!response.text) {
        throw new Error('No se recibieron sugerencias de IA');
      }

      const suggestions = JSON.parse(response.text);
      toast.success('Sugerencias generadas con éxito');
      setNewItem(prev => ({
        ...prev,
        materialCost: suggestions.materialCost,
        laborCost: suggestions.laborCost,
        unit: suggestions.unit
      }));
    } catch (error) {
      console.error('Error generating AI suggestions:', error);
      toast.error('Error al generar sugerencias con IA');
    } finally {
      setIsGenerating(false);
    }
  };

  const updateItemYield = async (itemId: string, type: 'material' | 'labor', index: number, field: string, newValue: any) => {
    if (guardBudgetLocked()) return;

    if (typeof newValue === 'number' && (isNaN(newValue) || newValue < 0)) {
      toast.error('El valor debe ser un número válido y no negativo');
      return;
    }
    if (type === 'labor' && field === 'yield' && newValue === 0) {
      toast.error('El rendimiento de mano de obra no puede ser cero');
      return;
    }
    const item = budgetItems.find(i => i.id === itemId);
    if (!item) return;

    const updatedMaterials = [...item.materials];
    const updatedLabor = [...item.labor];

    if (type === 'material') {
      updatedMaterials[index] = { ...updatedMaterials[index], [field]: newValue };
    } else if (type === 'labor') {
      updatedLabor[index] = { ...updatedLabor[index], [field]: newValue };
    }

    const recalculatedItem = recalculateItemTotals({
      ...item,
      materials: updatedMaterials,
      labor: updatedLabor,
    });

    const updatedItems = budgetItems.map((budgetItem) =>
      budgetItem.id === itemId ? recalculatedItem : budgetItem
    );
    setBudgetItems(updatedItems);

    if (editingItem?.id === itemId) {
      setEditingItem(recalculatedItem);
    }

    try {
      await patchBudgetItem(itemId, {
        materials: updatedMaterials,
        labor: updatedLabor,
        materialCost: recalculatedItem.materialCost,
        laborCost: recalculatedItem.laborCost,
        indirectCost: recalculatedItem.indirectCost,
        totalUnitPrice: recalculatedItem.totalUnitPrice,
        totalItemPrice: recalculatedItem.totalItemPrice,
        estimatedDays: recalculatedItem.estimatedDays,
      });

      await logAction(
        'Actualización de Renglón',
        'Presupuesto',
        `Costos actualizados para el renglón "${item.description}" en el proyecto "${project.name}"`,
        'update',
        { projectId: project.id, itemId }
      );

      // Update project total budget
      await patchProjectBudget({
        budget: sumProjectBudget(updatedItems),
        typology: project.typology,

      });
    } catch (error) {
      await loadBudgetItems();
      handleApiError(error, OperationType.WRITE, `projects/${project.id}/budgetItems/${itemId}`);
    }
  };

  const updateItemDetails = async (itemId: string, details: string) => {
    if (guardBudgetLocked()) return;

    try {
      await patchBudgetItem(itemId, {
        materialDetails: details,
        projectId: project.id
      });
    } catch (error) {
      handleApiError(error, OperationType.WRITE, `projects/${project.id}/budgetItems/${itemId}`);
    }
  };

  const addMaterialToItem = async (itemId: string, material: any) => {
    if (guardBudgetLocked()) return;

    const item = budgetItems.find(i => i.id === itemId);
    if (!item) return;

    const updatedMaterials = [...item.materials, material];
    
    const recalculatedItem = recalculateItemTotals({
      ...item,
      materials: updatedMaterials,
    });

    const updatedItems = budgetItems.map((budgetItem) =>
      budgetItem.id === itemId ? recalculatedItem : budgetItem
    );
    setBudgetItems(updatedItems);

    if (editingItem?.id === itemId) {
      setEditingItem(recalculatedItem);
    }

    try {
      await patchBudgetItem(itemId, {
        materials: updatedMaterials,
        materialCost: recalculatedItem.materialCost,
        totalUnitPrice: recalculatedItem.totalUnitPrice,
        totalItemPrice: recalculatedItem.totalItemPrice,
      });

      await logAction(
        'Adición de Material',
        'Presupuesto',
        `Material "${material.name}" añadido al renglón "${item.description}" en el proyecto "${project.name}"`,
        'create',
        { projectId: project.id, itemId, materialName: material.name }
      );

      // Update project total budget
      await patchProjectBudget({
        budget: sumProjectBudget(updatedItems),
        typology: project.typology,

      });

      toast.success('Material agregado correctamente');
    } catch (error) {
      await loadBudgetItems();
      handleApiError(error, OperationType.WRITE, `projects/${project.id}/budgetItems/${itemId}`);
    }
  };

  const removeMaterialFromItem = async (itemId: string, index: number) => {
    if (guardBudgetLocked()) return;

    const item = budgetItems.find(i => i.id === itemId);
    if (!item) return;

    const updatedMaterials = item.materials.filter((_: any, i: number) => i !== index);
    
    const recalculatedItem = recalculateItemTotals({
      ...item,
      materials: updatedMaterials,
    });

    const updatedItems = budgetItems.map((budgetItem) =>
      budgetItem.id === itemId ? recalculatedItem : budgetItem
    );
    setBudgetItems(updatedItems);

    if (editingItem?.id === itemId) {
      setEditingItem(recalculatedItem);
    }

    try {
      await patchBudgetItem(itemId, {
        materials: updatedMaterials,
        materialCost: recalculatedItem.materialCost,
        totalUnitPrice: recalculatedItem.totalUnitPrice,
        totalItemPrice: recalculatedItem.totalItemPrice,
      });

      await patchProjectBudget({
        budget: sumProjectBudget(updatedItems),
        typology: project.typology,

      });

      toast.success('Material eliminado correctamente');
    } catch (error) {
      await loadBudgetItems();
      handleApiError(error, OperationType.WRITE, `projects/${project.id}/budgetItems/${itemId}`);
    }
  };

  const addLaborToItem = async (itemId: string, labor: any) => {
    if (guardBudgetLocked()) return;

    const item = budgetItems.find(i => i.id === itemId);
    if (!item) return;

    const updatedLabor = [...item.labor, labor];
    
    const recalculatedItem = recalculateItemTotals({
      ...item,
      labor: updatedLabor,
    });

    const updatedItems = budgetItems.map((budgetItem) =>
      budgetItem.id === itemId ? recalculatedItem : budgetItem
    );
    setBudgetItems(updatedItems);

    if (editingItem?.id === itemId) {
      setEditingItem(recalculatedItem);
    }

    try {
      await patchBudgetItem(itemId, {
        labor: updatedLabor,
        laborCost: recalculatedItem.laborCost,
        totalUnitPrice: recalculatedItem.totalUnitPrice,
        totalItemPrice: recalculatedItem.totalItemPrice,
        estimatedDays: recalculatedItem.estimatedDays,
      });

      await logAction(
        'Adición de Mano de Obra',
        'Presupuesto',
        `Mano de obra "${labor.role}" añadida al renglón "${item.description}" en el proyecto "${project.name}"`,
        'create',
        { projectId: project.id, itemId, laborRole: labor.role }
      );

      // Update project total budget
      await patchProjectBudget({
        budget: sumProjectBudget(updatedItems),
        typology: project.typology,

      });

      toast.success('Mano de obra agregada correctamente');
    } catch (error) {
      await loadBudgetItems();
      handleApiError(error, OperationType.WRITE, `projects/${project.id}/budgetItems/${itemId}`);
    }
  };

  const removeLaborFromItem = async (itemId: string, index: number) => {
    if (guardBudgetLocked()) return;

    const item = budgetItems.find(i => i.id === itemId);
    if (!item) return;

    const updatedLabor = item.labor.filter((_: any, i: number) => i !== index);
    
    const recalculatedItem = recalculateItemTotals({
      ...item,
      labor: updatedLabor,
    });

    const updatedItems = budgetItems.map((budgetItem) =>
      budgetItem.id === itemId ? recalculatedItem : budgetItem
    );
    setBudgetItems(updatedItems);

    if (editingItem?.id === itemId) {
      setEditingItem(recalculatedItem);
    }

    try {
      await patchBudgetItem(itemId, {
        labor: updatedLabor,
        laborCost: recalculatedItem.laborCost,
        totalUnitPrice: recalculatedItem.totalUnitPrice,
        totalItemPrice: recalculatedItem.totalItemPrice,
        estimatedDays: recalculatedItem.estimatedDays,
      });

      await patchProjectBudget({
        budget: sumProjectBudget(updatedItems),
        typology: project.typology,

      });

      toast.success('Mano de obra eliminada correctamente');
    } catch (error) {
      await loadBudgetItems();
      handleApiError(error, OperationType.WRITE, `projects/${project.id}/budgetItems/${itemId}`);
    }
  };

  const handleAddItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (guardBudgetLocked()) return;
    
    // Validation
    if (!newItem.description.trim()) {
      toast.error('La descripción es obligatoria');
      return;
    }
    if (!newItem.unit.trim()) {
      toast.error('La unidad es obligatoria');
      return;
    }
    if (newItem.quantity < 0) {
      toast.error('La cantidad no puede ser negativa');
      return;
    }
    if (newItem.materialCost < 0 || newItem.laborCost < 0) {
      toast.error('Los costos no pueden ser negativos');
      return;
    }
    if (newItem.indirectFactor < 0) {
      toast.error('El factor indirecto no puede ser negativo');
      return;
    }

    try {
      const matCost = newItem.materials.length > 0 
        ? newItem.materials.reduce((sum, m) => sum + (m.quantity * m.unitPrice), 0)
        : newItem.materialCost;
      
      const labCost = newItem.labor.length > 0
        ? newItem.labor.reduce((sum, l) => sum + (l.yield > 0 ? l.dailyRate / l.yield : 0), 0)
        : newItem.laborCost;

      const directCost = matCost + labCost;
      const indirectCost = directCost * newItem.indirectFactor;
      const totalUnitPrice = directCost + indirectCost;
      const totalItemPrice = newItem.quantity * totalUnitPrice;

      // Calculate estimated days if labor is provided
      let estimatedDays = 0;
      if (newItem.labor.length > 0) {
        const daysPerRole = newItem.labor.map((l: any) => l.yield > 0 ? newItem.quantity / l.yield : 0);
        estimatedDays = Math.max(...daysPerRole);
      }

      const createdItem = await createProjectBudgetItem(project.id, {
        ...newItem,
        category: newItem.category || getBudgetCategoryFromDescription(newItem.description),
        materialCost: matCost,
        laborCost: labCost,
        indirectCost,
        totalUnitPrice,
        totalItemPrice,
        estimatedDays,
        order: budgetItems.length + 1,
        subtasks: newItem.subtasks || [],
      });

      await logAction(
        'Registro de Renglón',
        'Presupuesto',
        `Nuevo renglón "${newItem.description}" registrado en el proyecto "${project.name}"`,
        'create',
        { projectId: project.id, itemId: createdItem.id }
      );

      // Update project total budget
      const newTotalBudget = budgetItems.reduce((sum, i) => sum + (i.totalItemPrice || 0), 0) + totalItemPrice;
      await patchProjectBudget({
        budget: newTotalBudget,
      });

      await loadBudgetItems();

      setIsAddItemModalOpen(false);
      setNewItem({
        description: '',
        unit: '',
        quantity: 0,
        materialCost: 0,
        laborCost: 0,
        indirectFactor: 0.2,
        notes: '',
        category: 'General',
        materials: [],
        labor: [],
        subtasks: []
      });
    } catch (error) {
      handleApiError(error, OperationType.WRITE, `projects/${project.id}/budgetItems`);
    }
  };

  const addSanitaryInstallation = async () => {
    if (guardBudgetLocked()) return;

    try {
      // Standard costs for sanitary installation
      const matCost = 120; 
      const labCost = 80;
      const directCost = matCost + labCost;
      const indirectFactor = 0.25;
      const indirectCost = directCost * indirectFactor;
      const totalUnitPrice = directCost + indirectCost;

      await createProjectBudgetItem(project.id, {
        description: 'Instalación sanitaria',
        category: 'Instalaciones',
        unit: 'ml',
        quantity: 0,
        materialCost: matCost,
        laborCost: labCost,
        indirectCost,
        totalUnitPrice,
        totalItemPrice: 0,
        estimatedDays: 0,
        order: budgetItems.length + 1,
        materials: [
          { name: 'Tubo PVC 2"', unit: 'tubo', quantity: 0.5, unitPrice: 45 },
          { name: 'Pegamento PVC', unit: 'bote', quantity: 0.05, unitPrice: 60 },
          { name: 'Accesorios', unit: 'global', quantity: 1, unitPrice: 20 }
        ],
        labor: [
          { role: 'Plomero', yield: 8, dailyRate: 180 },
          { role: 'Ayudante', yield: 8, dailyRate: 110 }
        ],
        indirectFactor,
      });
      await loadBudgetItems();
      toast.success('Instalación sanitaria agregada al presupuesto');
    } catch (error) {
      handleApiError(error, OperationType.WRITE, `projects/${project.id}/budgetItems`);
    }
  };

  const addConcretoMaterial = async (itemId: string) => {
    const material = { 
      name: 'Concreto F-2500', 
      unit: 'm3', 
      quantity: 0, 
      unitPrice: 950 
    };
    await addMaterialToItem(itemId, material);
  };

  const itemTechnicalCodeById = useMemo(() => {
    const groups: Record<string, any[]> = {};

    budgetItems.forEach((item) => {
      const category = String(item.category || 'General');
      if (!groups[category]) groups[category] = [];
      groups[category].push(item);
    });

    const getCategoryOrder = (category: string) => {
      const match = String(category).match(/^(\d{2})\b/);
      if (match) return Number(match[1]);
      return Number.MAX_SAFE_INTEGER;
    };

    const orderedCategories = Object.keys(groups).sort((left, right) => {
      const orderDiff = getCategoryOrder(left) - getCategoryOrder(right);
      if (orderDiff !== 0) return orderDiff;
      return left.localeCompare(right, 'es', { sensitivity: 'base' });
    });

    const normalizeSubchapter = (description: string) =>
      String(description || '')
        .replace(/^\d{2}\s+[^|]+\|\s*/i, '')
        .replace(/\s*\[[A-Z_]+\]\s*$/g, '')
        .replace(/\s*\|\s*Paquete\s+\d+\s*$/i, '')
        .replace(/\s*\(Frente[^)]*\)\s*$/i, '')
        .trim()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase();

    const codeMap: Record<string, string> = {};
    orderedCategories.forEach((category, categoryIndex) => {
      const chapterMatch = String(category).match(/^(\d{2})\b/);
      const chapterNumber = chapterMatch ? Number(chapterMatch[1]) : categoryIndex + 1;
      const chapterCode = String(chapterNumber).padStart(2, '0');

      const orderedItems = [...groups[category]].sort(
        (left, right) => (Number(left.order) || 0) - (Number(right.order) || 0)
      );

      const subchapterIndexByKey = new Map<string, number>();
      const itemIndexBySubchapter = new Map<string, number>();

      orderedItems.forEach((item) => {
        const subchapterKey = normalizeSubchapter(item.description);

        if (!subchapterIndexByKey.has(subchapterKey)) {
          subchapterIndexByKey.set(subchapterKey, subchapterIndexByKey.size + 1);
        }

        const currentItemIndex = (itemIndexBySubchapter.get(subchapterKey) || 0) + 1;
        itemIndexBySubchapter.set(subchapterKey, currentItemIndex);

        const subchapterCode = String(subchapterIndexByKey.get(subchapterKey) || 1).padStart(2, '0');
        const itemCode = String(currentItemIndex).padStart(3, '0');
        codeMap[item.id] = `${chapterCode}.${subchapterCode}.${itemCode}`;
      });
    });

    return codeMap;
  }, [budgetItems]);

  const getItemTechnicalCode = useCallback(
    (item: any) => itemTechnicalCodeById[item.id] || String(item.order || ''),
    [itemTechnicalCodeById]
  );

  const exportToCSV = () => {
    const rowHeaders = ['Código', 'Descripción', 'Unidad', 'Cantidad', 'Precio Unitario', 'Total', 'Días Estimados'];
    const rowData = budgetItems.map((item) => [
      getItemTechnicalCode(item),
      item.description,
      item.unit,
      Number(item.quantity || 0).toFixed(2),
      Number(item.totalUnitPrice || 0).toFixed(2),
      Number(item.totalItemPrice || 0).toFixed(2),
      Number(item.estimatedDays || 0).toFixed(2),
    ]);

    const breakdownHeaders = ['Renglón', 'Material', 'Unidad', 'Cantidad x Unidad', 'Cantidad Total', 'Precio Unitario', 'Total Material'];
    const breakdownRows = budgetItems.flatMap((item) => {
      const materials = Array.isArray(item.materials) ? item.materials : [];
      return materials.map((m: any) => {
        const qtyPerUnit = Number(m.quantity || 0);
        const itemQty = Number(item.quantity || 0);
        const totalQty = qtyPerUnit * itemQty;
        const unitPrice = Number(m.unitPrice || 0);
        return [
          `${getItemTechnicalCode(item)} ${item.description}`,
          m.name || '',
          m.unit || '',
          qtyPerUnit.toFixed(4),
          totalQty.toFixed(4),
          unitPrice.toFixed(2),
          (totalQty * unitPrice).toFixed(2),
        ];
      });
    });

    const materialExplosion = buildMaterialExplosion(budgetItems);
    const materialSummaryHeaders = ['Material', 'Unidad', 'Cantidad Total', 'Precio Unitario', 'Total'];
    const materialSummaryRows = Object.values(materialExplosion)
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((m) => [
        m.name,
        m.unit,
        m.quantity.toFixed(4),
        m.unitPrice.toFixed(2),
        m.total.toFixed(2),
      ]);

    const totalExplosionCost = Object.values(materialExplosion).reduce((sum, m) => sum + m.total, 0);

    const csvSections = [
      ...getBrandedCsvPreamble('Presupuesto detallado', [`Proyecto: ${project.name}`]),
      [],
      ['RESUMEN DE RENGLONES'],
      rowHeaders,
      ...rowData,
      [],
      ['DESGLOSE DE MATERIALES POR RENGLÓN'],
      breakdownHeaders,
      ...breakdownRows,
      [],
      ['RESUMEN TOTAL POR MATERIAL'],
      materialSummaryHeaders,
      ...materialSummaryRows,
      ['TOTAL MATERIALES', '', '', '', totalExplosionCost.toFixed(2)],
    ];

    const csvContent = csvSections
      .map((row) => row.map(escapeCsvCell).join(','))
      .join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `presupuesto_${project.name.replace(/\s+/g, '_')}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const totalBudget = budgetItems.reduce((sum, item) => sum + (item.totalItemPrice || 0), 0);
  const totalEstimatedDays = budgetItems.reduce((sum, item) => sum + (item.estimatedDays || 0), 0);

  const exportToPDF = useCallback(() => {
    const docPdf = new jsPDF();
    const now = new Date();

    const headerBottom = drawReportHeader(docPdf, 'PRESUPUESTO DE OBRA DETALLADO', {
      subtitle: `Proyecto: ${project.name} · Ubicación: ${project.location}`,
      dateText: `Fecha: ${formatDate(now)}`,
    });

    // Summary Stats
    docPdf.setFillColor(248, 250, 252);
    docPdf.rect(14, headerBottom + 4, 182, 20, 'F');
    
    docPdf.setFontSize(9);
    docPdf.setTextColor(71, 85, 105);
    docPdf.text('TOTAL PRESUPUESTADO', 20, headerBottom + 12);
    docPdf.setFontSize(12);
    docPdf.setTextColor(234, 88, 12);
    docPdf.text(formatCurrency(totalBudget), 20, headerBottom + 19);

    docPdf.setFontSize(9);
    docPdf.setTextColor(71, 85, 105);
    docPdf.text('ITEMS TOTALES', 100, headerBottom + 12);
    docPdf.setFontSize(12);
    docPdf.setTextColor(15, 23, 42);
    docPdf.text(budgetItems.length.toString(), 100, headerBottom + 19);

    let currentY = headerBottom + 34;

    // Resumen de Renglones
    docPdf.setFontSize(14);
    docPdf.setTextColor(15, 23, 42);
    docPdf.setFont('helvetica', 'bold');
    docPdf.text('RESUMEN DE RENGLONES', 14, currentY);
    currentY += 8;

    const budgetSummaryData = budgetItems.map(item => [
      getItemTechnicalCode(item),
      item.description,
      item.unit,
      item.quantity.toFixed(2),
      formatCurrency(item.totalUnitPrice),
      formatCurrency(item.totalItemPrice)
    ]);

    autoTable(docPdf, {
      startY: currentY,
      head: [['Código', 'Descripción', 'Unid', 'Cant', 'P. Unit', 'Total']],
      body: budgetSummaryData,
      theme: 'grid',
      headStyles: { fillColor: [15, 23, 42], fontSize: 9 },
      bodyStyles: { fontSize: 8 },
      columnStyles: {
        0: { cellWidth: 10 },
        3: { halign: 'right' },
        4: { halign: 'right' },
        5: { halign: 'right' }
      }
    });

    currentY = (docPdf as any).lastAutoTable.finalY + 15;

    // Detalle de Renglones
    docPdf.setFontSize(14);
    docPdf.setTextColor(15, 23, 42);
    docPdf.setFont('helvetica', 'bold');
    docPdf.text('DETALLE DE RENGLONES', 14, currentY);
    currentY += 10;

    budgetItems.forEach((item) => {
      // Check for page break
      if (currentY > 250) {
        docPdf.addPage();
        currentY = 20;
      }

      docPdf.setFontSize(11);
      docPdf.setTextColor(15, 23, 42);
      docPdf.setFont('helvetica', 'bold');
      docPdf.text(`${getItemTechnicalCode(item)} ${item.description}`, 14, currentY);
      currentY += 5;

      docPdf.setFontSize(9);
      docPdf.setFont('helvetica', 'normal');
      docPdf.text(`Unidad: ${item.unit} | Cantidad: ${item.quantity.toFixed(2)} | P. Unitario: ${formatCurrency(item.totalUnitPrice)} | Total: ${formatCurrency(item.totalItemPrice)}`, 14, currentY);
      currentY += 7;

      // Materials Table
      if (item.materials && item.materials.length > 0) {
        const materialData = item.materials.map((m: any) => [
          m.name,
          m.unit,
          m.quantity.toFixed(2),
          formatCurrency(m.unitPrice),
          formatCurrency(m.quantity * m.unitPrice),
          formatCurrency(item.quantity * m.quantity * m.unitPrice)
        ]);

        autoTable(docPdf, {
          startY: currentY,
          head: [['Material', 'Unid', 'Cant', 'P. Unit', 'Subtotal', 'Total Renglón']],
          body: materialData,
          theme: 'grid',
          headStyles: { fillColor: [241, 245, 249], textColor: [71, 85, 105], fontSize: 8 },
          bodyStyles: { fontSize: 7 },
          margin: { left: 20 },
          styles: { cellPadding: 1 }
        });
        currentY = (docPdf as any).lastAutoTable.finalY + 5;
      }

      // Labor Table
      if (item.labor && item.labor.length > 0) {
        const laborData = item.labor.map((l: any) => [
          l.role,
          l.yield.toFixed(2),
          formatCurrency(l.dailyRate),
          formatCurrency(l.dailyRate / l.yield)
        ]);

        autoTable(docPdf, {
          startY: currentY,
          head: [['Mano de Obra', 'Rend', 'Jornal', 'C. Unit']],
          body: laborData,
          theme: 'grid',
          headStyles: { fillColor: [239, 246, 255], textColor: [37, 99, 235], fontSize: 8 },
          bodyStyles: { fontSize: 7 },
          margin: { left: 20 },
          styles: { cellPadding: 1 }
        });
        currentY = (docPdf as any).lastAutoTable.finalY + 10;
      } else {
        currentY += 5;
      }
    });

    // Resumen de Materiales (Explosión)
    if (currentY > 200) {
      docPdf.addPage();
      currentY = 20;
    } else {
      currentY += 10;
    }

    docPdf.setFontSize(14);
    docPdf.setTextColor(15, 23, 42);
    docPdf.setFont('helvetica', 'bold');
    docPdf.text('RESUMEN DE MATERIALES (EXPLOSIÓN)', 14, currentY);
    currentY += 8;

    const materialExplosion = buildMaterialExplosion(budgetItems);

    const materialExplosionData = Object.values(materialExplosion).map((m: any) => [
      m.name,
      m.unit,
      m.quantity.toFixed(2),
      formatCurrency(m.unitPrice),
      formatCurrency(m.total)
    ]);

    autoTable(docPdf, {
      startY: currentY,
      head: [['Material', 'Unid', 'Cant Total', 'P. Unit', 'Monto Total']],
      body: materialExplosionData,
      theme: 'grid',
      headStyles: { fillColor: [51, 65, 85], fontSize: 9 },
      bodyStyles: { fontSize: 8 },
      columnStyles: {
        2: { halign: 'right' },
        3: { halign: 'right' },
        4: { halign: 'right' }
      }
    });

    currentY = (docPdf as any).lastAutoTable.finalY + 15;

    const totalMaterials = Object.values(materialExplosion).reduce((sum: number, m: any) => sum + (m.total || 0), 0);
    const totalLabor = budgetItems.reduce((sum, item) => sum + (item.laborCost || 0), 0);
    const totalIndirect = budgetItems.reduce((sum, item) => sum + (item.indirectCost || 0), 0);

    // Add General Summary Section
    if (currentY > 200) {
      docPdf.addPage();
      currentY = 20;
    } else {
      currentY += 10;
    }

    docPdf.setFontSize(14);
    docPdf.setTextColor(15, 23, 42);
    docPdf.setFont('helvetica', 'bold');
    docPdf.text('RESUMEN GENERAL', 14, currentY);
    currentY += 8;

    autoTable(docPdf, {
      startY: currentY,
      head: [['Concepto', 'Monto (GTQ)', 'Porcentaje']],
      body: [
        ['Total Materiales', formatCurrency(totalMaterials), `${((totalMaterials / totalBudget) * 100).toFixed(1)}%`],
        ['Total Mano de Obra', formatCurrency(totalLabor), `${((totalLabor / totalBudget) * 100).toFixed(1)}%`],
        ['Total Costos Indirectos', formatCurrency(totalIndirect), `${((totalIndirect / totalBudget) * 100).toFixed(1)}%`],
        ['TOTAL PRESUPUESTO', formatCurrency(totalBudget), '100%']
      ],
      theme: 'striped',
      headStyles: { fillColor: [15, 23, 42], fontSize: 10 },
      bodyStyles: { fontSize: 9, fontStyle: 'bold' },
      columnStyles: {
        1: { halign: 'right' },
        2: { halign: 'right' }
      }
    });

    currentY = (docPdf as any).lastAutoTable.finalY + 30;

    // Authorized Signatures Section
    if (currentY > 250) {
      docPdf.addPage();
      currentY = 40;
    }

    const signatureWidth = 50;
    const spacing = 15;
    
    // Prepared by
    docPdf.setDrawColor(100, 116, 139);
    docPdf.line(14, currentY, 14 + signatureWidth, currentY);
    docPdf.setFontSize(8);
    docPdf.setTextColor(100, 116, 139);
    docPdf.text('ELABORADO POR', 14 + (signatureWidth / 2), currentY + 5, { align: 'center' });
    docPdf.text('Firma y Sello', 14 + (signatureWidth / 2), currentY + 10, { align: 'center' });

    // Reviewed by
    docPdf.line(14 + signatureWidth + spacing, currentY, 14 + signatureWidth * 2 + spacing, currentY);
    docPdf.text('REVISADO POR', 14 + signatureWidth + spacing + (signatureWidth / 2), currentY + 5, { align: 'center' });
    docPdf.text('Firma y Sello', 14 + signatureWidth + spacing + (signatureWidth / 2), currentY + 10, { align: 'center' });

    // Approved by (Client)
    docPdf.line(14 + signatureWidth * 2 + spacing * 2, currentY, 14 + signatureWidth * 3 + spacing * 2, currentY);
    docPdf.text('APROBADO POR (CLIENTE)', 14 + signatureWidth * 2 + spacing * 2 + (signatureWidth / 2), currentY + 5, { align: 'center' });
    docPdf.text('Firma y Sello', 14 + signatureWidth * 2 + spacing * 2 + (signatureWidth / 2), currentY + 10, { align: 'center' });

    docPdf.save(`Presupuesto_Detallado_${project.name.replace(/\s+/g, '_')}.pdf`);
    toast.success('Presupuesto detallado exportado a PDF');
  }, [project, budgetItems, totalBudget, getItemTechnicalCode]);

  const handleOpenCalculator = useCallback(() => {
    if (guardBudgetLocked()) return;
    setIsCostCalculatorOpen(true);
  }, [guardBudgetLocked]);

  // Listen for AI Chat commands
  useEffect(() => {
    const handleGenerateReport = () => exportToPDF();

    window.addEventListener('OPEN_COST_CALCULATOR', handleOpenCalculator);
    window.addEventListener('GENERATE_BUDGET_REPORT', handleGenerateReport);

    return () => {
      window.removeEventListener('OPEN_COST_CALCULATOR', handleOpenCalculator);
      window.removeEventListener('GENERATE_BUDGET_REPORT', handleGenerateReport);
    };
  }, [exportToPDF, handleOpenCalculator]);

  const totalRealCost = useMemo(() => {
    return transactions.reduce((sum, t) => sum + (t.amount || 0), 0);
  }, [transactions]);

  const budgetHealth = useMemo(() => {
    if (totalBudget === 0) return 100;
    const ratio = totalRealCost / totalBudget;
    return Math.max(0, 100 - (ratio * 100));
  }, [totalBudget, totalRealCost]);

  const materialExplosion = useMemo(() => {
    const explosion: { [key: string]: { name: string; unit: string; quantity: number; unitPrice: number; total: number; realCost: number; globalStock: number; shortage: number; riskLevel: 'Low' | 'Medium' | 'High' } } = {};
    budgetItems.forEach(item => {
      if (item.quantity > 0 && item.materials) {
        item.materials.forEach((m: any) => {
          const key = `${m.name}-${m.unit}`;
          if (!explosion[key]) {
            const invItem = inventory.find(i => i.name.toLowerCase() === m.name.toLowerCase());
            const globalStock = invItem ? invItem.stock : 0;
            
            explosion[key] = {
              name: m.name,
              unit: m.unit,
              quantity: 0,
              unitPrice: m.unitPrice,
              total: 0,
              realCost: 0,
              globalStock,
              shortage: 0,
              riskLevel: 'Low'
            };
          }
          explosion[key].quantity += m.quantity * item.quantity;
          explosion[key].total += m.quantity * item.quantity * m.unitPrice;
          
          // Add real cost from transactions for this material in this item
          const itemTransactions = transactions.filter(t => t.budgetItemId === item.id);
          const materialTransactions = itemTransactions.filter(t => 
            (t.description || '').toLowerCase().includes(m.name.toLowerCase())
          );
          explosion[key].realCost += materialTransactions.reduce((sum, t) => sum + (t.amount || 0), 0);
        });
      }
    });

    // Calculate shortage and risk level for all materials
    Object.values(explosion).forEach(m => {
      m.shortage = Math.max(0, m.quantity - m.globalStock);
      if (m.shortage > 0) {
        const shortageRatio = m.shortage / m.quantity;
        if (shortageRatio > 0.5) m.riskLevel = 'High';
        else if (shortageRatio > 0.2) m.riskLevel = 'Medium';
      }
    });

    return Object.values(explosion).sort((a, b) => b.total - a.total);
  }, [budgetItems, transactions, inventory]);

  const syncableMaterialCount = useMemo(() => {
    return materialExplosion.filter((m) => Number(m.quantity || 0) > 0).length;
  }, [materialExplosion]);

  const filteredBudgetItems = useMemo(() => {
    return budgetItems.filter(item => 
      item.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (item.category || '').toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [budgetItems, searchTerm]);

  const groupedItems = useMemo(() => {
    const groups: { [key: string]: any[] } = {};
    filteredBudgetItems.forEach(item => {
      const cat = item.category || 'General';
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(item);
    });

    const getCategoryOrder = (category: string) => {
      const match = String(category).match(/^(\d{2})\b/);
      if (!match) return Number.MAX_SAFE_INTEGER;
      return Number(match[1]);
    };

    return Object.fromEntries(
      Object.entries(groups).sort((left, right) => {
        const chapterOrderDiff = getCategoryOrder(left[0]) - getCategoryOrder(right[0]);
        if (chapterOrderDiff !== 0) return chapterOrderDiff;
        return left[0].localeCompare(right[0], 'es', { sensitivity: 'base' });
      })
    );
  }, [filteredBudgetItems]);

  return (
    <>
      <ConfirmModal
        isOpen={isDeleteConfirmOpen}
        onClose={() => {
          setIsDeleteConfirmOpen(false);
          setItemToDelete(null);
        }}
        onConfirm={confirmDeleteItem}
        title="Eliminar Renglón"
        message="¿Estás seguro de que deseas eliminar este renglón del presupuesto? Esta acción no se puede deshacer."
      />
      <div className="fixed inset-0 z-[140] flex items-center justify-center bg-slate-100 dark:bg-slate-950 overflow-hidden budget-module-contrast">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white dark:bg-slate-900 w-full h-[100dvh] md:h-screen flex flex-col overflow-hidden transition-colors duration-300"
      >
        {/* Header */}
        <div className="p-3 sm:p-4 bg-gradient-to-r from-primary to-primary-hover text-white flex justify-between items-center flex-shrink-0 shadow-lg">
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="p-1.5 sm:p-2 bg-white/20 rounded-lg sm:rounded-xl backdrop-blur-md">
              <Calculator size={20} className="sm:w-6 sm:h-6" />
            </div>
            <div>
              <div className="flex items-center gap-1.5 sm:gap-2">
                <h2 className="text-sm sm:text-lg font-black tracking-tight leading-tight truncate max-w-[120px] sm:max-w-none">{project.name}</h2>
                {isBudgetLocked && (
                  <span className="flex items-center gap-1 px-1.5 py-0.5 bg-emerald-400/20 text-emerald-100 text-[7px] sm:text-[8px] font-black uppercase tracking-widest rounded-full border border-emerald-400/30">
                    <CheckCircle2 size={8} className="sm:w-2.5 sm:h-2.5" />
                    Validado
                  </span>
                )}
              </div>
              <p className="text-primary-light text-[8px] sm:text-[10px] font-medium opacity-90 uppercase tracking-wider">Presupuesto - {project.typology}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 sm:gap-4 flex-1 justify-end">
            <div className="relative hidden md:block w-full max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-white/60" size={16} />
              <input 
                type="text"
                placeholder="Buscar en presupuesto..."
                className="w-full pl-10 pr-4 py-2 bg-white/10 border border-white/20 rounded-xl text-sm text-white placeholder:text-white/60 focus:bg-white/20 focus:outline-none focus:ring-2 focus:ring-white/30 transition-all"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <div className="text-right hidden lg:block">
              <p className="text-[8px] font-bold uppercase tracking-widest opacity-70">Salud Presupuestaria</p>
              <div className="flex items-center gap-2">
                <div className="w-20 h-1.5 bg-white/20 rounded-full overflow-hidden">
                  <motion.div 
                    initial={{ width: 0 }}
                    animate={{ width: `${budgetHealth}%` }}
                    className={cn(
                      "h-full rounded-full transition-all duration-500",
                      budgetHealth < 20 ? "bg-rose-400" : budgetHealth < 50 ? "bg-amber-400" : "bg-emerald-400"
                    )}
                  />
                </div>
                <span className="text-xs font-black">{budgetHealth.toFixed(1)}%</span>
              </div>
            </div>
            <div className="text-right hidden sm:block">
              <p className="text-[7px] sm:text-[8px] font-bold uppercase tracking-widest opacity-70">Total</p>
              <p className="text-sm sm:text-xl font-black">{formatCurrency(totalBudget)}</p>
            </div>
            <button 
              onClick={() => setIsQuickActionsOpen(!isQuickActionsOpen)}
              className={cn(
                "p-1.5 sm:p-2 rounded-lg sm:rounded-xl transition-all border",
                isQuickActionsOpen ? "bg-white/20 border-white/30" : "hover:bg-white/10 border-white/10"
              )}
              title="Acciones Rápidas"
            >
              <Zap size={18} className="sm:w-5 sm:h-5" />
            </button>
            <button
              onClick={onClose}
              title="Regresar a proyectos"
              className="flex items-center gap-1.5 px-2.5 py-1.5 sm:px-3 sm:py-2 hover:bg-white/20 rounded-lg sm:rounded-xl transition-all border border-white/10 text-[11px] sm:text-xs font-black uppercase tracking-widest"
            >
              <ChevronLeft size={14} />
              <span className="hidden sm:inline">Regresar</span>
            </button>
            <button 
              onClick={onClose} 
              title="Cerrar presupuesto"
              className="p-1.5 sm:p-2 hover:bg-white/20 rounded-lg sm:rounded-xl transition-all border border-white/10"
            >
              <X size={18} className="sm:w-5 sm:h-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden flex flex-col bg-slate-50/50 min-h-0">
          {isLoading ? (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-400 gap-4">
              <div className="w-12 h-12 border-4 border-primary-light border-t-primary rounded-full animate-spin" />
              <p className="font-bold animate-pulse">Cargando presupuesto...</p>
            </div>
          ) : budgetItems.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center max-w-md mx-auto p-8">
              <div className="p-6 bg-primary-light text-primary rounded-full mb-6 shadow-inner">
                <AlertCircle size={64} />
              </div>
              <h3 className="text-2xl font-black text-slate-900 mb-3">Presupuesto Vacío</h3>
              <p className="text-slate-500 mb-8 leading-relaxed">
                Este proyecto aún no tiene renglones de presupuesto. ¿Deseas inicializarlo con un catálogo ampliado y ordenado cronológicamente para la tipología <strong>{project.typology}</strong>?
              </p>
              <button 
                onClick={initializeBudget}
                disabled={isInitializing}
                className="w-full flex items-center justify-center gap-3 bg-primary text-white font-black py-5 px-8 rounded-2xl hover:bg-primary-hover transition-all shadow-xl shadow-primary-shadow disabled:opacity-50"
              >
                {isInitializing ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Inicializando...
                  </>
                ) : (
                  <>
                    <Plus size={24} />
                    Inicializar Presupuesto Estándar
                  </>
                )}
              </button>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto p-4 md:p-8 space-y-6 custom-scrollbar min-h-0">
              <div className="md:hidden mb-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                  <input 
                    type="text"
                    placeholder="Buscar en presupuesto..."
                    className="w-full pl-10 pr-4 py-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:ring-2 focus:ring-primary outline-none transition-all"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>
              </div>
              
              {budgetItems.length > 0 && budgetItems.every(i => i.quantity === 0) && !isInitializing && !isBudgetLocked && (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="bg-amber-50 border border-amber-200 p-4 rounded-2xl flex items-center justify-between gap-4 shadow-sm"
                >
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-amber-100 text-amber-600 rounded-xl">
                      <Zap size={20} className="animate-pulse" />
                    </div>
                    <div>
                      <p className="text-sm font-black text-amber-900">Cantidades en Cero</p>
                      <p className="text-[10px] text-amber-700 font-medium">¿Deseas calcular automáticamente las cantidades basadas en el área de {project.area} m²?</p>
                    </div>
                  </div>
                  <button 
                    onClick={handleAutoCalculateQuantities}
                    className="px-4 py-2 bg-amber-600 text-white text-xs font-black rounded-xl hover:bg-amber-700 transition-all shadow-md shadow-amber-200"
                  >
                    Calcular Ahora
                  </button>
                </motion.div>
              )}

              <div className="lg:hidden">
                <button
                  type="button"
                  onClick={() => setIsMobileProjectPanelOpen((prev) => !prev)}
                  className="w-full flex items-center justify-between px-4 py-3 rounded-2xl border border-slate-200 bg-white shadow-sm text-slate-700"
                >
                  <span className="text-[10px] font-black uppercase tracking-widest">
                    {isMobileProjectPanelOpen ? 'Ocultar selector de proyecto' : 'Cambiar proyecto'}
                  </span>
                  {isMobileProjectPanelOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </button>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-[300px_minmax(0,1fr)] gap-4 lg:items-start">
              <div className={cn(
                "bg-white rounded-2xl border border-slate-100 shadow-sm p-3 sm:p-4 space-y-3 lg:sticky lg:top-4 transition-all",
                isProjectPanelCollapsed ? "lg:w-[88px]" : "lg:w-[300px]",
                "hidden lg:block",
                isMobileProjectPanelOpen && "block"
              )}>
                <div className="flex items-center justify-between gap-2">
                  {!isProjectPanelCollapsed && (
                    <h3 className="text-[10px] sm:text-xs font-black text-slate-500 uppercase tracking-widest">Lista de Proyectos</h3>
                  )}
                  <button
                    type="button"
                    onClick={() => setIsProjectPanelCollapsed((prev) => !prev)}
                    className="hidden lg:flex items-center justify-center w-8 h-8 rounded-lg border border-slate-200 bg-slate-50 text-slate-600 hover:text-primary hover:border-primary/30 transition-all"
                    title={isProjectPanelCollapsed ? 'Expandir panel de proyectos' : 'Colapsar panel de proyectos'}
                  >
                    {isProjectPanelCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
                  </button>
                </div>

                {!isProjectPanelCollapsed && (
                  <div className="relative w-full">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                    <input
                      type="text"
                      placeholder="Buscar proyecto..."
                      className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 outline-none focus:ring-2 focus:ring-primary/20"
                      value={projectSelectorSearch}
                      onChange={(e) => setProjectSelectorSearch(e.target.value)}
                    />
                  </div>
                )}

                <div className={cn(
                  "overflow-y-auto custom-scrollbar space-y-2 pr-1",
                  isProjectPanelCollapsed ? "max-h-72" : "max-h-40"
                )}>
                  {filteredProjectSelectorItems.map((item) => {
                    const isActive = String(item.id) === String(project.id);
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => {
                          if (isActive) return;
                          onProjectChange?.(item);
                        }}
                        title={`${item.name} - ${item.location || 'Sin ubicación'}`}
                        className={cn(
                          "w-full rounded-xl border transition-all",
                          isProjectPanelCollapsed
                            ? "px-0 py-2 flex items-center justify-center"
                            : "text-left px-3 py-2",
                          isActive
                            ? "bg-primary-light border-primary/30 text-primary"
                            : "bg-slate-50 border-slate-200 text-slate-700 hover:border-primary/30 hover:bg-primary-light/40"
                        )}
                      >
                        {isProjectPanelCollapsed ? (
                          <span className="text-xs font-black uppercase">{String(item.name || '?').charAt(0)}</span>
                        ) : (
                          <>
                            <p className="text-xs font-black truncate">{item.name}</p>
                            <p className="text-[10px] font-medium opacity-70 truncate">{item.location || 'Sin ubicación'}</p>
                          </>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="min-w-0 space-y-4">

              {/* Summary Cards */}
              {isBudgetLocked && (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={cn(
                    "p-4 rounded-2xl border flex items-start gap-4 mb-6",
                    project.budgetValidationType === 'success' ? "bg-emerald-50 border-emerald-100 text-emerald-800" :
                    project.budgetValidationType === 'warning' ? "bg-amber-50 border-amber-100 text-amber-800" :
                    "bg-rose-50 border-rose-100 text-rose-800"
                  )}
                >
                  <div className={cn(
                    "p-2 rounded-xl",
                    project.budgetValidationType === 'success' ? "bg-emerald-100 text-emerald-600" :
                    project.budgetValidationType === 'warning' ? "bg-amber-100 text-amber-600" :
                    "bg-rose-100 text-rose-600"
                  )}>
                    {project.budgetValidationType === 'success' ? <CheckCircle2 size={20} /> : <AlertCircle size={20} />}
                  </div>
                  <div>
                    <h4 className="text-sm font-black uppercase tracking-wider mb-1">Presupuesto Validado</h4>
                    <p className="text-xs font-medium leading-relaxed">{project.budgetValidationMessage}</p>
                    {budgetValidatedAt && (
                      <p className="text-[10px] opacity-60 mt-2 font-bold uppercase tracking-widest">
                        Validado el: {formatDate(budgetValidatedAt.toDate?.()?.toISOString() || budgetValidatedAt)}
                      </p>
                    )}
                  </div>
                </motion.div>
              )}

              {/* Items List Container */}
              <div className="flex-shrink-0 min-h-[300px] md:flex-1 bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden flex flex-col">
                {/* Desktop Table Header */}
                <div className={cn(
                  "hidden md:grid bg-slate-50/50 border-b border-slate-100 px-6 py-3 sticky top-0 z-10",
                  isQuickView ? "grid-cols-12" : "grid-cols-12"
                )}>
                  {isQuickView ? (
                    <>
                      <div className="col-span-1 text-[9px] font-black text-slate-400 uppercase tracking-widest">Cod.</div>
                      <div className="col-span-6 text-[9px] font-black text-slate-400 uppercase tracking-widest">Descripción</div>
                      <div className="col-span-1 text-[9px] font-black text-slate-400 uppercase tracking-widest">Unidad</div>
                      <div className="col-span-2 text-[9px] font-black text-slate-400 uppercase tracking-widest">Cantidad</div>
                      <div className="col-span-2 text-[9px] font-black text-slate-400 uppercase tracking-widest text-right">Total</div>
                    </>
                  ) : (
                    <>
                      <div className="col-span-1 text-[9px] font-black text-slate-400 uppercase tracking-widest">Cod.</div>
                      <div className="col-span-3 text-[9px] font-black text-slate-400 uppercase tracking-widest">Descripción</div>
                      <div className="col-span-1 text-[9px] font-black text-slate-400 uppercase tracking-widest">Unidad</div>
                      <div className="col-span-1 text-[9px] font-black text-slate-400 uppercase tracking-widest">Cantidad</div>
                      <div className="col-span-1 text-[9px] font-black text-slate-400 uppercase tracking-widest text-right">M.O. Unit</div>
                      <div className="col-span-1 text-[9px] font-black text-slate-400 uppercase tracking-widest text-right">Días</div>
                      <div className="col-span-2 text-[9px] font-black text-slate-400 uppercase tracking-widest text-right">P. Unitario</div>
                      <div className="col-span-2 text-[9px] font-black text-slate-400 uppercase tracking-widest text-right">Total</div>
                    </>
                  )}
                </div>

                {/* Scrollable Items List */}
                <div 
                  ref={scrollContainerRef}
                  className="flex-1 overflow-y-auto custom-scrollbar bg-slate-50/30 relative"
                >
                  {Object.entries(groupedItems).map(([category, items]) => (
                    <div key={category} className="mb-8 last:mb-0">
                      <div className="sticky top-0 z-20 bg-slate-100/80 backdrop-blur-md px-6 py-2.5 border-y border-slate-200 flex justify-between items-center">
                        <div className="flex items-center gap-3">
                          <div className="w-1.5 h-6 bg-primary rounded-full" />
                          <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest">{category}</h3>
                          <span className="text-[10px] font-bold text-slate-400 bg-white px-2 py-0.5 rounded-full border border-slate-200">
                            {items.length} {items.length === 1 ? 'Renglón' : 'Renglones'}
                          </span>
                        </div>
                        <div className="text-right">
                          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Subtotal Capítulo</p>
                          <p className="text-sm font-black text-primary leading-none">
                            {formatCurrency(items.reduce((sum, i) => sum + (i.totalItemPrice || 0), 0))}
                          </p>
                        </div>
                      </div>

                      <Reorder.Group 
                        axis="y" 
                        values={items} 
                        onReorder={(newItems) => {
                          // Find index of first item of this category in the main list
                          const firstIdx = budgetItems.findIndex(i => i.id === items[0].id);
                          const updated = [...budgetItems];
                          updated.splice(firstIdx, items.length, ...newItems);
                          handleReorder(updated);
                        }}
                        className="divide-y divide-slate-100"
                      >
                        {items.map((item) => (
                          <Reorder.Item 
                            key={item.id} 
                            value={item}
                            className={cn(
                              "bg-white transition-all duration-200",
                              expandedItem === item.id && "bg-primary-light/10 ring-1 ring-primary/10 z-10"
                            )}
                          >
                        {/* Desktop Row - More Compact */}
                        <div className={cn(
                          "hidden md:grid md:grid-cols-12 items-center px-6 py-1.5 hover:bg-slate-50 transition-colors group relative",
                          expandedItem === item.id && "bg-primary-light/20"
                        )}>
                          {isQuickView ? (
                            <>
                              <div className="col-span-1 flex items-center gap-2">
                                <GripVertical size={12} className="text-slate-300 cursor-grab active:cursor-grabbing" />
                                <span className="text-[10px] font-bold text-slate-400">{getItemTechnicalCode(item)}</span>
                              </div>
                              <div className="col-span-6">
                                <p className="text-[11px] font-bold text-slate-900 truncate">{item.description}</p>
                              </div>
                              <div className="col-span-1 text-[10px] text-slate-500 font-medium">{item.unit}</div>
                              <div className="col-span-2 pr-4">
                                <input 
                                  type="number" 
                                  min="0"
                                  step="any"
                                  title="Cantidad del renglón"
                                  className="w-full px-2 py-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded text-[11px] font-black text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-primary outline-none transition-all"
                                  value={item.quantity}
                                  onChange={(e) => handleQuantityInputChange(item.id, e.target.value)}
                                />
                              </div>
                              <div className="col-span-2 flex items-center justify-end gap-1.5">
                                <p className="text-[12px] font-black text-primary">{formatCurrency(item.totalItemPrice)}</p>
                                <button 
                                  onClick={() => handleDeleteItem(item.id)}
                                  title="Eliminar renglón"
                                  className="p-1 text-slate-300 hover:text-rose-600 transition-all rounded-md hover:bg-white border border-transparent hover:border-slate-100 opacity-0 group-hover:opacity-100"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </div>
                            </>
                          ) : (
                            <>
                              <div className="col-span-1 flex items-center gap-2">
                                <GripVertical size={12} className="text-slate-300 cursor-grab active:cursor-grabbing" />
                                <span className="text-[10px] font-bold text-slate-400">{getItemTechnicalCode(item)}</span>
                              </div>
                              <div className="col-span-3">
                                <p className="text-[11px] font-bold text-slate-900 truncate">{item.description}</p>
                              </div>
                              <div className="col-span-1 text-[10px] text-slate-500 font-medium">{item.unit}</div>
                              <div className="col-span-1 pr-2">
                                <input 
                                  type="number" 
                                  min="0"
                                  step="any"
                                  title="Cantidad del renglón"
                                  className="w-full px-1.5 py-0.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded text-[10px] font-bold text-slate-900 dark:text-slate-100 focus:ring-1 focus:ring-primary outline-none transition-all"
                                  value={item.quantity}
                                  onChange={(e) => handleQuantityInputChange(item.id, e.target.value)}
                                />
                              </div>
                              <div className="col-span-1 text-[10px] font-bold text-blue-600 text-right">{formatCurrency(item.laborCost || 0)}</div>
                              <div className="col-span-1 text-[10px] font-bold text-slate-500 text-right">{Math.ceil(item.estimatedDays || 0)}d</div>
                              <div className="col-span-2 text-[10px] font-bold text-slate-700 text-right">{formatCurrency(item.totalUnitPrice)}</div>
                              <div className="col-span-2 flex items-center justify-end gap-1.5">
                                <p className="text-[11px] font-black text-primary">{formatCurrency(item.totalItemPrice)}</p>
                                <button 
                                  onClick={() => setEditingItem(item)}
                                  className="p-1 text-slate-400 hover:text-primary hover:bg-white border border-transparent hover:border-slate-100 rounded-md transition-all"
                                  title="Editar Renglón"
                                >
                                  <Edit3 size={14} />
                                </button>
                                <button 
                                  onClick={() => setExpandedItem(expandedItem === item.id ? null : item.id)}
                                  title={expandedItem === item.id ? "Contraer renglón" : "Expandir renglón"}
                                  className={cn(
                                    "p-1 transition-all rounded-md",
                                    expandedItem === item.id ? "bg-primary text-white" : "text-slate-400 hover:text-primary hover:bg-white border border-transparent hover:border-slate-100"
                                  )}
                                >
                                  {expandedItem === item.id ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                                </button>
                                <button 
                                  onClick={() => handleDeleteItem(item.id)}
                                  title="Eliminar renglón"
                                  className="p-1 text-slate-300 hover:text-rose-600 transition-all rounded-md hover:bg-white border border-transparent hover:border-slate-100 opacity-0 group-hover:opacity-100"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </div>
                            </>
                          )}
                        </div>

                      {/* Mobile Card */}
                      <div className={cn(
                        "md:hidden p-2.5 space-y-2 transition-colors border-b border-slate-100",
                        expandedItem === item.id && "bg-primary-light/40"
                      )}>
                        {isQuickView ? (
                          <div className="flex justify-between items-center gap-2">
                            <div className="flex-1 min-w-0">
                              <h4 className="text-[10px] font-bold text-slate-900 leading-tight truncate">{item.description}</h4>
                              <p className="text-[8px] font-black text-primary mt-0.5">{formatCurrency(item.totalItemPrice)}</p>
                            </div>
                            <div className="flex items-center gap-1">
                              <div className="w-16">
                                <input 
                                  type="number" 
                                  min="0"
                                  step="any"
                                  title="Cantidad del renglón"
                                  className="w-full px-1 py-0.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded text-[10px] font-black text-slate-900 dark:text-slate-100 focus:ring-1 focus:ring-primary outline-none transition-all"
                                  value={item.quantity}
                                  onChange={(e) => handleQuantityInputChange(item.id, e.target.value)}
                                />
                              </div>
                              <button 
                                onClick={() => handleDeleteItem(item.id)}
                                title="Eliminar renglón"
                                className="p-1 text-slate-300 hover:text-rose-600 transition-all"
                              >
                                <Trash2 size={12} />
                              </button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <div className="flex justify-between items-start gap-2">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1 mb-0.5">
                                  <GripVertical size={10} className="text-slate-300" />
                                  <span className="text-[7px] font-black bg-slate-100 text-slate-500 px-1 py-0.5 rounded-full">{getItemTechnicalCode(item)}</span>
                                  <span className="text-[7px] font-bold text-slate-400 uppercase tracking-wider">{item.unit}</span>
                                </div>
                                <h4 className="text-[10px] font-bold text-slate-900 leading-tight mb-1">{item.description}</h4>
                                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                                  <div className="flex flex-col">
                                    <span className="text-[6px] font-bold text-slate-400 uppercase">P. Unit</span>
                                    <span className="text-[8px] font-bold text-slate-700">{formatCurrency(item.totalUnitPrice)}</span>
                                  </div>
                                  <div className="w-px h-2 bg-slate-200" />
                                  <div className="flex flex-col">
                                    <span className="text-[6px] font-bold text-slate-400 uppercase">Total</span>
                                    <span className="text-[8px] font-black text-primary">{formatCurrency(item.totalItemPrice)}</span>
                                  </div>
                                  <div className="w-px h-2 bg-slate-200" />
                                  <div className="flex flex-col">
                                    <span className="text-[6px] font-bold text-slate-400 uppercase">M.O.</span>
                                    <span className="text-[8px] font-bold text-blue-600">{formatCurrency(item.laborCost || 0)}</span>
                                  </div>
                                  <div className="w-px h-2 bg-slate-200" />
                                  <div className="flex flex-col">
                                    <span className="text-[6px] font-bold text-slate-400 uppercase">Días</span>
                                    <span className="text-[8px] font-bold text-slate-500">{Math.ceil(item.estimatedDays || 0)}d</span>
                                  </div>
                                </div>
                              </div>
                              <div className="flex flex-col gap-1">
                                <div className="flex gap-1">
                                  <button 
                                    onClick={() => setEditingItem(item)}
                                    className="p-1 bg-white text-primary rounded border border-primary/20 active:scale-95 transition-all"
                                    title="Editar Renglón"
                                  >
                                    <Edit3 size={12} />
                                  </button>
                                  <button 
                                    onClick={() => setExpandedItem(expandedItem === item.id ? null : item.id)}
                                    title={expandedItem === item.id ? "Contraer renglón" : "Expandir renglón"}
                                    className={cn(
                                      "p-1 rounded transition-all",
                                      expandedItem === item.id ? "bg-primary text-white shadow-sm shadow-primary-shadow" : "bg-slate-50 text-slate-400 border border-slate-100"
                                    )}
                                  >
                                    {expandedItem === item.id ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                                  </button>
                                  <button 
                                    onClick={() => handleDeleteItem(item.id)}
                                    title="Eliminar renglón"
                                    className="p-1 bg-rose-50 text-rose-600 rounded border border-rose-100 active:scale-95 transition-all"
                                  >
                                    <Trash2 size={12} />
                                  </button>
                                </div>
                                <div className="relative mt-1">
                                  <input 
                                    type="number" 
                                    min="0"
                                    step="any"
                                    title="Cantidad del renglón"
                                    className="w-full pl-2 pr-6 py-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded text-[10px] font-black text-slate-900 dark:text-slate-100 focus:ring-1 focus:ring-primary outline-none transition-all"
                                    value={item.quantity}
                                    onChange={(e) => handleQuantityInputChange(item.id, e.target.value)}
                                  />
                                  <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[6px] font-black text-slate-400 uppercase pointer-events-none">{item.unit}</span>
                                </div>
                              </div>
                            </div>
                          </>
                        )}
                      </div>

                      {/* Expanded Content (Shared) */}
                      <AnimatePresence>
                        {expandedItem === item.id && (
                          <div className="bg-slate-50/80 border-b border-slate-100">
                            <motion.div 
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: 'auto' }}
                              exit={{ opacity: 0, height: 0 }}
                              className="p-3 md:p-4 grid grid-cols-1 lg:grid-cols-2 gap-4"
                            >
                              {/* Materials Breakdown */}
                              <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-2 text-slate-900 font-black text-[9px] md:text-[10px] uppercase tracking-widest">
                                    <Package size={12} className="text-primary" />
                                    Materiales
                                    <span className="ml-2 px-2 py-0.5 bg-slate-100 text-slate-500 rounded-full text-[8px] font-bold">
                                      P: {formatCurrency(item.materialCost)} | R: {formatCurrency(item.materials.reduce((sum: number, m: any) => {
                                        const materialTransactions = transactions.filter(t => 
                                          t.budgetItemId === item.id && 
                                          t.description?.toLowerCase().includes(m.name.toLowerCase())
                                        );
                                        return sum + materialTransactions.reduce((s, t) => s + t.amount, 0);
                                      }, 0))}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <div className="relative">
                                      <button 
                                        onClick={() => setShowMaterialLibrary(showMaterialLibrary === item.id ? null : item.id)}
                                        className="text-[8px] font-bold text-primary hover:bg-primary/5 px-1.5 py-0.5 rounded-md border border-primary/20 transition-colors flex items-center gap-1"
                                      >
                                        <Search size={8} />
                                        Biblioteca
                                      </button>
                                      
                                      <AnimatePresence>
                                        {showMaterialLibrary === item.id && (
                                          <motion.div 
                                            initial={{ opacity: 0, y: 10, scale: 0.95 }}
                                            animate={{ opacity: 1, y: 0, scale: 1 }}
                                            exit={{ opacity: 0, y: 10, scale: 0.95 }}
                                            className="absolute right-0 top-full mt-1 w-64 bg-white rounded-xl shadow-2xl border border-slate-200 z-[100] overflow-hidden"
                                          >
                                            <div className="p-2 border-b border-slate-100 bg-slate-50">
                                              <div className="relative">
                                                <Search className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" size={10} />
                                                <input 
                                                  type="text"
                                                  placeholder="Buscar material..."
                                                  className="w-full pl-6 pr-2 py-1 text-[9px] border border-slate-200 rounded-md focus:ring-1 focus:ring-primary outline-none"
                                                  value={materialSearch}
                                                  onChange={(e) => setMaterialSearch(e.target.value)}
                                                  autoFocus
                                                />
                                              </div>
                                            </div>
                                            <div className="max-h-48 overflow-y-auto p-1">
                                              {materialLibrary
                                                .filter(m => m.name.toLowerCase().includes(materialSearch.toLowerCase()))
                                                .map((m, idx) => (
                                                  <button
                                                    key={idx}
                                                    onClick={() => {
                                                      addMaterialToItem(item.id, { ...m, quantity: 1 });
                                                      setShowMaterialLibrary(null);
                                                      setMaterialSearch("");
                                                    }}
                                                    className="w-full text-left px-2 py-1.5 hover:bg-slate-50 rounded-md transition-colors flex flex-col gap-0.5"
                                                  >
                                                    <span className="text-[9px] font-bold text-slate-900">{m.name}</span>
                                                    <div className="flex justify-between items-center">
                                                      <span className="text-[8px] text-slate-500">{m.unit}</span>
                                                      <span className="text-[8px] font-black text-primary">{formatCurrency(m.unitPrice)}</span>
                                                    </div>
                                                  </button>
                                                ))
                                              }
                                              {materialLibrary.filter(m => m.name.toLowerCase().includes(materialSearch.toLowerCase())).length === 0 && (
                                                <div className="p-4 text-center text-[9px] text-slate-400">No se encontraron materiales</div>
                                              )}
                                            </div>
                                          </motion.div>
                                        )}
                                      </AnimatePresence>
                                    </div>
                                    <button 
                                      onClick={() => addMaterialToItem(item.id, { name: 'Nuevo Material', unit: 'u', quantity: 0, unitPrice: 0 })}
                                      className="text-[8px] font-bold text-primary hover:bg-primary/5 px-1.5 py-0.5 rounded-md border border-primary/20 transition-colors"
                                    >
                                      + Personalizado
                                    </button>
                                  </div>
                                </div>

                                <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto shadow-sm max-h-[300px] overflow-y-auto">
                                  <table className="w-full text-[9px] md:text-[10px] min-w-[300px]">
                                    <thead className="bg-slate-50 border-b border-slate-100 sticky top-0 z-10">
                                      <tr>
                                        <th className="px-2 py-1 text-center font-bold text-slate-500 w-8"></th>
                                        <th className="px-2 py-1 text-left font-bold text-slate-500">Material</th>
                                        <th className="px-2 py-1 text-center font-bold text-slate-500">Unid.</th>
                                        <th className="px-2 py-1 text-center font-bold text-slate-500">Cant.</th>
                                        <th className="px-2 py-1 text-right font-bold text-slate-500">P. Unit</th>
                                        <th className="px-2 py-1 text-right font-bold text-primary">Subtotal Unit.</th>
                                        <th className="px-2 py-1 text-right font-bold text-orange-600">Total Renglón</th>
                                        <th className="px-2 py-1 text-right font-bold text-emerald-600">Real</th>
                                        <th className="px-2 py-1 text-center font-bold text-slate-500"></th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-50">
                                      {item.materials.map((m: any, idx: number) => {
                                        const itemTransactions = transactions.filter(t => t.budgetItemId === item.id);
                                        const materialTransactions = itemTransactions.filter(t => 
                                          t.description.toLowerCase().includes(m.name.toLowerCase())
                                        );
                                        const materialRealCost = materialTransactions.reduce((sum, t) => sum + t.amount, 0);
                                        const isPurchased = m.purchased || false;

                                        return (
                                          <tr key={idx} className={cn(isPurchased && "bg-emerald-50/30")}>
                                            <td className="px-2 py-1 text-center">
                                              <button 
                                                onClick={() => updateItemYield(item.id, 'material', idx, 'purchased', !isPurchased)}
                                                className={cn(
                                                  "p-1 rounded-md transition-all",
                                                  isPurchased ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-400 hover:bg-slate-200"
                                                )}
                                                title={isPurchased ? "Marcar como no comprado" : "Marcar como comprado"}
                                              >
                                                <Check size={10} />
                                              </button>
                                            </td>
                                            <td className="px-2 py-1">
                                              <input 
                                                type="text"
                                                title="Nombre de material"
                                                className={cn(
                                                  "w-full px-1 py-0.5 bg-white border border-slate-100 rounded text-[9px] font-bold",
                                                  isPurchased && "text-emerald-700"
                                                )}
                                                value={m.name}
                                                onChange={(e) => updateItemYield(item.id, 'material', idx, 'name', e.target.value)}
                                              />
                                            </td>
                                            <td className="px-2 py-1 text-center">
                                              <input 
                                                type="text"
                                                title="Unidad de material"
                                                className="w-8 px-0.5 py-0.5 bg-white border border-slate-100 rounded text-center font-bold"
                                                value={m.unit}
                                                onChange={(e) => updateItemYield(item.id, 'material', idx, 'unit', e.target.value)}
                                              />
                                            </td>
                                            <td className="px-2 py-1 text-center">
                                              <input 
                                                type="number" 
                                                title="Cantidad de material"
                                                className="w-10 px-0.5 py-0.5 bg-white border border-slate-100 rounded text-center font-bold"
                                                value={m.quantity}
                                                onChange={(e) => updateItemYield(item.id, 'material', idx, 'quantity', Number(e.target.value))}
                                              />
                                            </td>
                                            <td className="px-2 py-1 text-right">
                                              <input 
                                                type="number" 
                                                title="Precio unitario de material"
                                                className="w-12 px-0.5 py-0.5 bg-white border border-slate-100 rounded text-right font-bold"
                                                value={m.unitPrice}
                                                onChange={(e) => updateItemYield(item.id, 'material', idx, 'unitPrice', Number(e.target.value))}
                                              />
                                            </td>
                                            <td className="px-2 py-1 text-right font-black text-primary">{formatCurrency(m.quantity * m.unitPrice)}</td>
                                            <td className="px-2 py-1 text-right font-black text-orange-600">{formatCurrency(item.quantity * m.quantity * m.unitPrice)}</td>
                                            <td className="px-2 py-1 text-right font-black text-emerald-600">
                                              <div className="flex items-center justify-end gap-1">
                                                {formatCurrency(materialRealCost)}
                                                <button 
                                                  onClick={() => setViewingTransactionsForMaterial({ item, material: m })} 
                                                  title="Ver transacciones"
                                                  className="p-0.5 hover:bg-emerald-50 rounded text-emerald-600"
                                                >
                                                  <Info size={8} />
                                                </button>
                                              </div>
                                            </td>
                                            <td className="px-2 py-1 text-center">
                                              <button onClick={() => removeMaterialFromItem(item.id, idx)} title="Eliminar material" className="p-0.5 text-slate-300 hover:text-red-600">
                                                <Trash2 size={10} />
                                              </button>
                                            </td>
                                          </tr>
                                        );
                                      })}
                                    </tbody>
                                    <tfoot className="bg-slate-50/50 font-bold border-t border-slate-100 sticky bottom-0 z-10">
                                      <tr>
                                        <td colSpan={5} className="px-2 py-1 text-right text-slate-500">Total Materiales</td>
                                        <td className="px-2 py-1 text-right text-primary">{formatCurrency(item.materialCost)}</td>
                                        <td className="px-2 py-1 text-right text-orange-600">{formatCurrency(item.materialCost * item.quantity)}</td>
                                        <td className="px-2 py-1"></td>
                                      </tr>
                                    </tfoot>
                                  </table>
                                </div>
                              </div>

                              {/* Labor Breakdown */}
                              <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-2 text-slate-900 font-black text-[9px] md:text-[10px] uppercase tracking-widest">
                                    <UsersIcon size={12} className="text-blue-600" />
                                    Mano de Obra
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <div className="relative">
                                      <button 
                                        onClick={() => setShowMaterialLibrary(showMaterialLibrary === `labor-${item.id}` ? null : `labor-${item.id}`)}
                                        className="text-[8px] font-bold text-blue-600 hover:bg-blue-50 px-1.5 py-0.5 rounded-md border border-blue-100 transition-colors flex items-center gap-1"
                                      >
                                        <Search size={8} />
                                        Biblioteca
                                      </button>
                                      
                                      <AnimatePresence>
                                        {showMaterialLibrary === `labor-${item.id}` && (
                                          <motion.div 
                                            initial={{ opacity: 0, y: 10, scale: 0.95 }}
                                            animate={{ opacity: 1, y: 0, scale: 1 }}
                                            exit={{ opacity: 0, y: 10, scale: 0.95 }}
                                            className="absolute right-0 top-full mt-1 w-64 bg-white rounded-xl shadow-2xl border border-slate-200 z-[100] overflow-hidden"
                                          >
                                            <div className="p-2 border-b border-slate-100 bg-slate-50">
                                              <div className="relative">
                                                <Search className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" size={10} />
                                                <input 
                                                  type="text"
                                                  placeholder="Buscar rol..."
                                                  className="w-full pl-6 pr-2 py-1 text-[9px] border border-slate-200 rounded-md focus:ring-1 focus:ring-blue-500 outline-none"
                                                  value={materialSearch}
                                                  onChange={(e) => setMaterialSearch(e.target.value)}
                                                  autoFocus
                                                />
                                              </div>
                                            </div>
                                            <div className="max-h-48 overflow-y-auto p-1">
                                              {laborLibrary
                                                .filter(l => l.role.toLowerCase().includes(materialSearch.toLowerCase()))
                                                .map((l, idx) => (
                                                  <button
                                                    key={idx}
                                                    onClick={() => {
                                                      addLaborToItem(item.id, { ...l });
                                                      setShowMaterialLibrary(null);
                                                      setMaterialSearch("");
                                                    }}
                                                    className="w-full text-left px-2 py-1.5 hover:bg-slate-50 rounded-md transition-colors flex flex-col gap-0.5"
                                                  >
                                                    <span className="text-[9px] font-bold text-slate-900">{l.role}</span>
                                                    <div className="flex justify-between items-center">
                                                      <span className="text-[8px] text-slate-500">Rend: {l.yield} {item.unit}/D</span>
                                                      <span className="text-[8px] font-black text-blue-600">{formatCurrency(l.dailyRate)}/D</span>
                                                    </div>
                                                  </button>
                                                ))
                                              }
                                              {laborLibrary.filter(l => l.role.toLowerCase().includes(materialSearch.toLowerCase())).length === 0 && (
                                                <div className="p-4 text-center text-[9px] text-slate-400">No se encontraron roles</div>
                                              )}
                                            </div>
                                          </motion.div>
                                        )}
                                      </AnimatePresence>
                                    </div>
                                    <button 
                                      onClick={() => addLaborToItem(item.id, { role: 'Nuevo Rol', yield: 1, dailyRate: 0 })}
                                      className="text-[8px] font-bold text-blue-600 hover:bg-blue-50 px-1.5 py-0.5 rounded-md border border-blue-100 transition-colors"
                                    >
                                      + Personalizado
                                    </button>
                                  </div>
                                </div>
                                
                                <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto shadow-sm max-h-[300px] overflow-y-auto">
                                  <table className="w-full text-[9px] md:text-[10px] min-w-[300px]">
                                    <thead className="bg-slate-50 border-b border-slate-100 sticky top-0 z-10">
                                      <tr>
                                        <th className="px-2 py-1 text-left font-bold text-slate-500">Rol</th>
                                        <th className="px-2 py-1 text-center font-bold text-slate-500">Rend. ({item.unit}/D)</th>
                                        <th className="px-2 py-1 text-right font-bold text-slate-500">Jornal</th>
                                        <th className="px-2 py-1 text-right font-bold text-slate-500">C. Unit.</th>
                                        <th className="px-2 py-1 text-center font-bold text-slate-500 w-8"></th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-50">
                                      {item.labor.map((l: any, idx: number) => (
                                        <tr key={idx}>
                                          <td className="px-2 py-1">
                                            <input 
                                              type="text"
                                              title="Rol de mano de obra"
                                              className="w-full px-1 py-0.5 bg-white border border-slate-100 rounded text-[9px] font-bold"
                                              value={l.role}
                                              onChange={(e) => updateItemYield(item.id, 'labor', idx, 'role', e.target.value)}
                                            />
                                          </td>
                                          <td className="px-2 py-1 text-center">
                                            <input 
                                              type="number" 
                                              title="Rendimiento de mano de obra"
                                              className="w-10 px-0.5 py-0.5 bg-white border border-slate-100 rounded text-center font-bold"
                                              value={l.yield}
                                              onChange={(e) => updateItemYield(item.id, 'labor', idx, 'yield', Number(e.target.value))}
                                            />
                                          </td>
                                          <td className="px-2 py-1 text-right">
                                            <input 
                                              type="number" 
                                              title="Tarifa diaria de mano de obra"
                                              className="w-12 px-0.5 py-0.5 bg-white border border-slate-100 rounded text-right font-bold"
                                              value={l.dailyRate}
                                              onChange={(e) => updateItemYield(item.id, 'labor', idx, 'dailyRate', Number(e.target.value))}
                                            />
                                          </td>
                                          <td className="px-2 py-1 text-right font-bold text-slate-900">{formatCurrency(l.dailyRate / l.yield)}</td>
                                          <td className="px-2 py-1 text-center">
                                            <button 
                                              onClick={() => removeLaborFromItem(item.id, idx)}
                                              title="Eliminar mano de obra"
                                              className="p-0.5 text-slate-300 hover:text-red-600"
                                            >
                                              <Trash2 size={10} />
                                            </button>
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                    <tfoot className="bg-slate-50/50 font-bold border-t border-slate-100 sticky bottom-0 z-10">
                                      <tr>
                                        <td colSpan={3} className="px-2 py-1 text-right text-slate-500">Total Mano de Obra</td>
                                        <td className="px-2 py-1 text-right text-blue-600">{formatCurrency(item.laborCost)}</td>
                                      </tr>
                                    </tfoot>
                                  </table>
                                </div>

                                {/* Cost Breakdown Visualization */}
                                <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 space-y-2">
                                  <div className="flex justify-between items-center">
                                    <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Desglose de Costos</span>
                                    <span className="text-[10px] font-black text-primary">{formatCurrency(item.totalUnitPrice)}</span>
                                  </div>
                                  <div className="space-y-1">
                                    <progress
                                      className="w-full h-1.5 [&::-webkit-progress-bar]:bg-slate-200 [&::-webkit-progress-value]:bg-primary [&::-moz-progress-bar]:bg-primary rounded-full overflow-hidden"
                                      value={item.totalUnitPrice > 0 ? (item.materialCost / item.totalUnitPrice) * 100 : 0}
                                      max={100}
                                      title={`Materiales: ${item.totalUnitPrice > 0 ? ((item.materialCost / item.totalUnitPrice) * 100).toFixed(1) : '0.0'}%`}
                                    />
                                    <progress
                                      className="w-full h-1.5 [&::-webkit-progress-bar]:bg-slate-200 [&::-webkit-progress-value]:bg-blue-500 [&::-moz-progress-bar]:bg-blue-500 rounded-full overflow-hidden"
                                      value={item.totalUnitPrice > 0 ? (item.laborCost / item.totalUnitPrice) * 100 : 0}
                                      max={100}
                                      title={`Mano de Obra: ${item.totalUnitPrice > 0 ? ((item.laborCost / item.totalUnitPrice) * 100).toFixed(1) : '0.0'}%`}
                                    />
                                    <progress
                                      className="w-full h-1.5 [&::-webkit-progress-bar]:bg-slate-200 [&::-webkit-progress-value]:bg-slate-400 [&::-moz-progress-bar]:bg-slate-400 rounded-full overflow-hidden"
                                      value={item.totalUnitPrice > 0 ? (item.indirectCost / item.totalUnitPrice) * 100 : 0}
                                      max={100}
                                      title={`Indirectos: ${item.totalUnitPrice > 0 ? ((item.indirectCost / item.totalUnitPrice) * 100).toFixed(1) : '0.0'}%`}
                                    />
                                  </div>
                                  <div className="flex gap-4 text-[8px] font-bold">
                                    <div className="flex items-center gap-1">
                                      <div className="w-2 h-2 rounded-full bg-primary" />
                                      <span className="text-slate-600">Materiales ({((item.materialCost / item.totalUnitPrice) * 100).toFixed(1)}%)</span>
                                    </div>
                                    <div className="flex items-center gap-1">
                                      <div className="w-2 h-2 rounded-full bg-blue-500" />
                                      <span className="text-slate-600">Mano de Obra ({((item.laborCost / item.totalUnitPrice) * 100).toFixed(1)}%)</span>
                                    </div>
                                    <div className="flex items-center gap-1">
                                      <div className="w-2 h-2 rounded-full bg-slate-400" />
                                      <span className="text-slate-600">Indirectos ({((item.indirectCost / item.totalUnitPrice) * 100).toFixed(1)}%)</span>
                                    </div>
                                  </div>
                                </div>

                                {/* Indirect Costs & Comparison */}
                                <div className="grid grid-cols-2 gap-2 mt-2">
                                  <div className="p-2 bg-white rounded-xl border border-slate-200 shadow-sm flex justify-between items-center">
                                    <div className="flex flex-col">
                                      <span className="text-[8px] font-bold text-slate-500 uppercase tracking-widest">Indirectos ({(item.indirectFactor * 100).toFixed(1)}%)</span>
                                      <span className="text-[10px] font-black text-slate-900">{formatCurrency(item.indirectCost)}</span>
                                    </div>
                                    <div className="h-6 w-px bg-slate-100 mx-2" />
                                    <div className="flex flex-col items-end">
                                      <span className="text-[8px] font-bold text-slate-500 uppercase tracking-widest">Total Unitario</span>
                                      <span className="text-[10px] font-black text-primary">{formatCurrency(item.totalUnitPrice)}</span>
                                    </div>
                                  </div>

                                  <div className="p-2 bg-white rounded-xl border border-slate-200 shadow-sm">
                                    {(() => {
                                      const itemTransactions = transactions.filter(t => t.budgetItemId === item.id);
                                      const realCost = itemTransactions.reduce((sum, t) => sum + t.amount, 0);
                                      const percentage = item.totalItemPrice > 0 ? (realCost / item.totalItemPrice) * 100 : 0;
                                      
                                      return (
                                        <div className="space-y-1">
                                          <div className="flex justify-between items-center">
                                            <span className="text-[8px] font-bold text-slate-500 uppercase tracking-widest">Ejecución Real</span>
                                            <span className={cn(
                                              "text-[10px] font-black",
                                              percentage > 100 ? "text-rose-600" : "text-emerald-600"
                                            )}>{percentage.toFixed(1)}%</span>
                                          </div>
                                          <progress
                                            className={cn(
                                              "w-full h-1 rounded-full overflow-hidden [&::-webkit-progress-bar]:bg-slate-100 [&::-moz-progress-bar]:bg-emerald-500",
                                              percentage > 100
                                                ? "[&::-webkit-progress-value]:bg-rose-500 [&::-moz-progress-bar]:bg-rose-500"
                                                : "[&::-webkit-progress-value]:bg-emerald-500 [&::-moz-progress-bar]:bg-emerald-500"
                                            )}
                                            value={Math.min(percentage, 100)}
                                            max={100}
                                            title="Ejecución real"
                                          />
                                        </div>
                                      );
                                    })()}
                                  </div>
                                </div>
                              </div>

                              {/* Subtasks Breakdown */}
                              <div className="lg:col-span-2 space-y-2 mt-4 pt-4 border-t border-slate-200">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-2 text-slate-900 font-black text-[9px] md:text-[10px] uppercase tracking-widest">
                                    <CheckCircle2 size={12} className="text-emerald-600" />
                                    Subtareas / Hitos
                                  </div>
                                  <button 
                                    onClick={() => addSubtaskToItem(item.id, { name: 'Nueva Subtarea', assignee: '', status: 'Pendiente' })}
                                    title="Agregar subtarea"
                                    className="text-[8px] font-bold text-emerald-600 hover:bg-emerald-50 px-1.5 py-0.5 rounded-md border border-emerald-100 transition-colors"
                                  >
                                    + Agregar
                                  </button>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                                  {(item.subtasks || []).map((st: any, idx: number) => (
                                    <div key={idx} className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm flex flex-col gap-2 group">
                                      <div className="flex justify-between items-start">
                                        <input 
                                          type="text"
                                          className="flex-1 text-[10px] font-bold text-slate-900 bg-transparent border-none p-0 outline-none focus:ring-0"
                                          value={st.name}
                                          onChange={(e) => updateSubtaskInItem(item.id, idx, 'name', e.target.value)}
                                          placeholder="Nombre..."
                                        />
                                        <button 
                                          onClick={() => removeSubtaskFromItem(item.id, idx)}
                                          title="Eliminar subtarea"
                                          className="p-1 text-slate-300 hover:text-rose-600 opacity-0 group-hover:opacity-100 transition-all"
                                        >
                                          <Trash2 size={10} />
                                        </button>
                                      </div>
                                      <div className="flex items-center justify-between gap-2">
                                        <div className="flex items-center gap-1 flex-1 min-w-0">
                                          <User size={10} className="text-slate-400 shrink-0" />
                                          <input 
                                            type="text"
                                            className="w-full text-[9px] text-slate-500 bg-transparent border-none p-0 outline-none focus:ring-0 truncate"
                                            value={st.assignee}
                                            onChange={(e) => updateSubtaskInItem(item.id, idx, 'assignee', e.target.value)}
                                            placeholder="Responsable"
                                          />
                                        </div>
                                        <select
                                          title="Estado de subtarea"
                                          className={cn(
                                            "text-[8px] font-bold px-1.5 py-0.5 rounded-md border outline-none transition-all",
                                            st.status === 'Completado' ? "bg-emerald-50 text-emerald-700 border-emerald-100" :
                                            st.status === 'En Proceso' ? "bg-blue-50 text-blue-700 border-blue-100" :
                                            "bg-slate-50 text-slate-600 border-slate-200"
                                          )}
                                          value={st.status}
                                          onChange={(e) => updateSubtaskInItem(item.id, idx, 'status', e.target.value)}
                                        >
                                          <option value="Pendiente">Pendiente</option>
                                          <option value="En Proceso">En Proceso</option>
                                          <option value="Completado">Completado</option>
                                        </select>
                                      </div>
                                    </div>
                                  ))}
                                  {(!item.subtasks || item.subtasks.length === 0) && (
                                    <div className="col-span-full py-6 text-center border border-dashed border-slate-200 rounded-xl">
                                      <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Sin subtareas definidas</p>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </motion.div>
                          </div>
                        )}
                      </AnimatePresence>
                    </Reorder.Item>
                  ))}
                      </Reorder.Group>
                    </div>
                  ))}

                  {showScrollTop && (
                    <button 
                      onClick={scrollToTop}
                      title="Subir al inicio"
                      className="fixed bottom-24 right-8 p-3 bg-primary text-white rounded-full shadow-2xl hover:scale-110 transition-all z-50"
                    >
                      <ArrowUp size={20} />
                    </button>
                  )}
                </div>
              </div>
              </div>
              </div>

              {isQuickActionsOpen && (
                <motion.div 
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-primary-light p-2 sm:p-4 rounded-xl sm:rounded-2xl border border-primary-light grid grid-cols-2 md:grid-cols-3 gap-2 sm:gap-4"
                >
                  <button 
                    onClick={handleAutoCalculateQuantities}
                    disabled={isInitializing || isBudgetLocked}
                    className="flex items-center gap-2 sm:gap-3 p-2 sm:p-3 bg-white rounded-lg sm:rounded-xl border border-primary-light hover:bg-primary-light transition-all text-left disabled:opacity-50"
                  >
                    <div className="p-1.5 sm:p-2 bg-amber-50 text-amber-600 rounded-lg">
                      <Zap size={16} className="sm:w-5 sm:h-5" />
                    </div>
                    <div>
                      <p className="text-[10px] sm:text-sm font-bold text-slate-900 leading-tight">Auto-calcular</p>
                      <p className="hidden sm:block text-[10px] text-slate-500">Basado en {project.area} m2</p>
                    </div>
                  </button>
                  <button 
                    onClick={isBudgetLocked ? handleUnlockBudget : handleValidateAndActivate}
                    disabled={isValidating}
                    className="flex items-center gap-2 sm:gap-3 p-2 sm:p-3 bg-white rounded-lg sm:rounded-xl border border-primary-light hover:bg-primary-light transition-all text-left disabled:opacity-50"
                  >
                    <div className={cn(
                      "p-1.5 sm:p-2 rounded-lg",
                      isBudgetLocked ? "bg-amber-50 text-amber-600" : "bg-emerald-50 text-emerald-600"
                    )}>
                      {isBudgetLocked ? <Edit3 size={16} className="sm:w-5 sm:h-5" /> : <CheckCircle2 size={16} className="sm:w-5 sm:h-5" />}
                    </div>
                    <div>
                      <p className="text-[10px] sm:text-sm font-bold text-slate-900 leading-tight">
                        {isBudgetLocked ? 'Desbloquear' : wasValidated ? 'Validar de nuevo' : 'Validar'}
                      </p>
                      <p className="hidden sm:block text-[10px] text-slate-500">Activar presupuesto</p>
                    </div>
                  </button>
                  <button 
                    onClick={handleExportMaterialSummary}
                    className="flex items-center gap-2 p-2 sm:p-3 bg-white rounded-lg sm:rounded-xl border border-primary-light hover:bg-primary-light transition-all text-left"
                  >
                    <div className="p-1.5 sm:p-2 bg-slate-50 text-slate-600 rounded-lg">
                      <FileText size={16} className="sm:w-[18px] sm:h-[18px]" />
                    </div>
                    <div>
                      <p className="text-[10px] sm:text-sm font-bold text-slate-900 leading-tight">Materiales</p>
                      <p className="hidden sm:block text-[10px] text-slate-500">Resumen PDF</p>
                    </div>
                  </button>
                  <button 
                    onClick={handleGenerateQuote}
                    disabled={isGeneratingQuote}
                    className="flex items-center gap-2 sm:gap-3 p-2 sm:p-3 bg-white rounded-lg sm:rounded-xl border border-primary-light hover:bg-primary-light transition-all text-left disabled:opacity-50"
                  >
                    <div className="p-1.5 sm:p-2 bg-primary-light text-primary rounded-lg">
                      <FileText size={16} className="sm:w-5 sm:h-5" />
                    </div>
                    <div>
                      <p className="text-[10px] sm:text-sm font-bold text-slate-900 leading-tight">Cotización</p>
                      <p className="hidden sm:block text-[10px] text-slate-500">Propuesta cliente</p>
                    </div>
                  </button>
                  <button 
                    onClick={addSanitaryInstallation}
                    className="flex items-center gap-2 sm:gap-3 p-2 sm:p-3 bg-white rounded-lg sm:rounded-xl border border-primary-light hover:bg-primary-light transition-all text-left"
                  >
                    <div className="p-1.5 sm:p-2 bg-primary-light text-primary rounded-lg">
                      <Droplets size={16} className="sm:w-5 sm:h-5" />
                    </div>
                    <div>
                      <p className="text-[10px] sm:text-sm font-bold text-slate-900 leading-tight">Inst. Sanitaria</p>
                      <p className="hidden sm:block text-[10px] text-slate-500">Nuevo renglón</p>
                    </div>
                  </button>
                  <div className="flex items-center gap-2 sm:gap-3 p-2 sm:p-3 bg-white rounded-lg sm:rounded-xl border border-primary-light text-left">
                    <div className="p-1.5 sm:p-2 bg-primary-light text-primary rounded-lg">
                      <Box size={16} className="sm:w-5 sm:h-5" />
                    </div>
                    <div className="flex-1">
                      <p className="text-[10px] sm:text-sm font-bold text-slate-900 leading-tight">Concreto</p>
                      <select 
                        title="Seleccionar renglón de concreto"
                        className="w-full mt-0.5 sm:mt-1 text-[8px] sm:text-[10px] bg-slate-50 border border-slate-100 rounded p-0.5 sm:p-1 outline-none"
                        onChange={(e) => {
                          if (e.target.value) {
                            addConcretoMaterial(e.target.value);
                            e.target.value = '';
                          }
                        }}
                      >
                        <option value="">Seleccionar...</option>
                        {budgetItems.map(item => (
                          <option key={item.id} value={item.id}>{item.description}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </motion.div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 md:p-6 bg-white dark:bg-slate-900 border-t border-slate-100 dark:border-slate-800 flex flex-col gap-4 flex-shrink-0 shadow-[0_-4px_20px_rgba(0,0,0,0.05)]">
          <div className="flex flex-col lg:flex-row justify-between items-center gap-4">
            <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
              <button 
                onClick={() => setIsMaterialExplosionOpen(true)}
                className="flex-1 lg:flex-none flex items-center justify-center gap-2 px-4 py-3 bg-emerald-500 text-white rounded-xl transition-all border border-emerald-400 text-sm font-bold shadow-lg hover:bg-emerald-600 active:scale-95"
              >
                <Package size={18} />
                <span className="hidden sm:inline">Explosión</span>
                <span className="sm:hidden">Explosión</span>
              </button>
              <button 
                onClick={() => setIsAddItemModalOpen(true)}
                disabled={isBudgetLocked}
                className="flex-1 lg:flex-none flex items-center justify-center gap-2 px-4 py-3 bg-primary text-white rounded-xl transition-all border border-primary/10 text-sm font-bold shadow-lg hover:bg-primary-hover active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Plus size={18} />
                Agregar Renglón
              </button>
              <button 
                onClick={handleOpenCalculator}
                disabled={isBudgetLocked}
                className="flex-1 lg:flex-none flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 text-white rounded-xl transition-all border border-blue-500 text-sm font-bold shadow-lg hover:bg-blue-700 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Calculator size={18} />
                Calculadora
              </button>
              <div className="flex gap-2 w-full sm:w-auto">
                <button 
                  onClick={() => setIsQuickView(!isQuickView)}
                  className={cn(
                    "flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-bold transition-all border text-sm",
                    isQuickView 
                      ? "bg-primary text-white border-primary shadow-lg shadow-primary-shadow" 
                      : "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700"
                  )}
                >
                  <Zap size={18} className={isQuickView ? "text-white" : "text-primary"} />
                  Vista Rápida
                </button>
                <button 
                  onClick={() => setIsQuickActionsOpen(!isQuickActionsOpen)}
                  className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 px-4 py-3 rounded-xl font-bold hover:bg-slate-200 dark:hover:bg-slate-700 transition-all border border-slate-200 dark:border-slate-700 text-sm"
                >
                  <Zap size={18} className="text-primary" />
                  Acciones
                </button>
              </div>
              <div className="flex gap-2 w-full sm:w-auto">
                <button 
                  onClick={exportToPDF}
                  className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-3 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl transition-all border border-slate-200 dark:border-slate-700 text-sm font-bold"
                >
                  <FileText size={18} />
                  PDF
                </button>
                <button 
                  onClick={exportToCSV}
                  disabled={budgetItems.length === 0}
                  className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-3 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl transition-all border border-slate-200 dark:border-slate-700 text-sm font-bold disabled:opacity-50"
                >
                  <FileSpreadsheet size={18} />
                  CSV
                </button>
              </div>
            </div>

            <div className="flex items-center gap-6 w-full lg:w-auto justify-between lg:justify-end border-t lg:border-t-0 pt-4 lg:pt-0 border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-6">
                <div className="text-right">
                  <p className="text-[8px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">M.O. Total</p>
                  <p className="text-base font-black text-blue-600 dark:text-blue-400">
                    {formatCurrency(budgetItems.reduce((sum, item) => sum + ((item.laborCost || 0) * (item.quantity || 0)), 0))}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[8px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">Días Totales</p>
                  <p className="text-base font-black text-slate-600 dark:text-slate-300">
                    {Math.ceil(budgetItems.reduce((sum, item) => sum + (item.estimatedDays || 0), 0))}d
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[8px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">Total</p>
                  <p className="text-xl font-black text-slate-900 dark:text-white">{formatCurrency(totalBudget)}</p>
                </div>
              </div>
              <button 
                onClick={onClose}
                className="hidden sm:block py-3 px-8 bg-slate-900 dark:bg-white dark:text-slate-900 text-white font-black rounded-xl hover:bg-slate-800 dark:hover:bg-slate-100 transition-all shadow-lg active:scale-95"
              >
                Cerrar
              </button>
            </div>
          </div>
          <div className="flex items-center gap-2 text-slate-400 dark:text-slate-500 text-[10px] font-medium border-t border-slate-50 dark:border-slate-800/50 pt-3">
            <Info size={12} />
            <span>Precios y rendimientos basados en estándares de la Cámara de Construcción de Guatemala.</span>
          </div>
        </div>
        {/* Add Item Modal */}
        <FormModal
          isOpen={isAddItemModalOpen}
          onClose={() => setIsAddItemModalOpen(false)}
          title="Nuevo Renglón de Presupuesto"
          fullVertical
          footer={
            <div className="flex flex-col md:flex-row justify-between items-center gap-4 w-full">
              <div className="flex flex-col items-center md:items-start">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Total Estimado Unitario</p>
                <p className="text-xl font-black text-primary">
                  {formatCurrency((newItem.materialCost + newItem.laborCost) * (1 + newItem.indirectFactor))}
                </p>
              </div>
              <div className="flex gap-3 w-full md:w-auto">
                <button 
                  type="button"
                  onClick={() => setIsAddItemModalOpen(false)}
                  className="flex-1 md:flex-none px-6 py-3 bg-white border border-slate-200 text-slate-600 font-bold rounded-2xl hover:bg-slate-50 transition-all"
                >
                  Cancelar
                </button>
                <button 
                  type="submit"
                  form="addItemForm"
                  className="flex-1 md:flex-none px-8 py-3 bg-primary text-white font-black rounded-2xl hover:bg-primary-hover transition-all shadow-lg shadow-primary-shadow"
                >
                  Guardar Renglón
                </button>
              </div>
            </div>
          }
        >
          <form id="addItemForm" onSubmit={handleAddItem} className="space-y-0">
            <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm mb-6">
              {/* Category Field */}
              <div className="flex flex-col md:flex-row md:items-center justify-between p-4 md:p-6 border-b border-slate-100 dark:border-slate-800 gap-2 md:gap-6 hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors">
                <div className="md:w-1/3">
                  <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest block mb-1">Categoría / Capítulo</label>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">Clasificación del concepto en el presupuesto</p>
                </div>
                <div className="md:w-2/3">
                  <select 
                    title="Categoría del renglón"
                    className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl focus:ring-2 focus:ring-primary focus:border-transparent outline-none font-bold text-slate-700 dark:text-slate-200 text-sm transition-all"
                    value={newItem.category}
                    onChange={(e) => setNewItem({...newItem, category: e.target.value})}
                  >
                    <option value="General">General</option>
                    <option value="Preliminares">Preliminares</option>
                    <option value="Cimentación">Cimentación</option>
                    <option value="Estructura">Estructura</option>
                    <option value="Albañilería">Albañilería</option>
                    <option value="Instalaciones">Instalaciones</option>
                    <option value="Acabados">Acabados</option>
                    <option value="Herrería">Herrería</option>
                    <option value="Carpintería">Carpintería</option>
                    <option value="Limpieza">Limpieza</option>
                  </select>
                </div>
              </div>

              {/* Template Field */}
              <div className="flex flex-col md:flex-row md:items-center justify-between p-4 md:p-6 border-b border-slate-100 dark:border-slate-800 gap-2 md:gap-6 hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors">
                <div className="md:w-1/3">
                  <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest block mb-1">Plantilla APU</label>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">Carga rápida desde biblioteca de análisis</p>
                </div>
                <div className="md:w-2/3">
                  <button
                    type="button"
                    onClick={openApuImportModal}
                    className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl focus:ring-2 focus:ring-primary focus:border-transparent outline-none font-bold text-slate-700 dark:text-slate-200 text-sm transition-all flex items-center justify-between group"
                  >
                    <span className={newItem.description ? "text-primary" : "text-slate-400"}>
                      {newItem.description ? "Plantilla Seleccionada" : "Seleccionar de la Biblioteca APU"}
                    </span>
                    <Search size={16} className="text-slate-400 group-hover:text-primary transition-colors" />
                  </button>
                </div>
              </div>

              {/* Description Field */}
              <div className="flex flex-col md:flex-row md:items-start justify-between p-4 md:p-6 border-b border-slate-100 dark:border-slate-800 gap-2 md:gap-6 hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors">
                <div className="md:w-1/3 pt-2">
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest block">Descripción del Renglón</label>
                    <button
                      type="button"
                      onClick={handleAISuggestions}
                      disabled={isGenerating || !newItem.description}
                      className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-blue-600 hover:text-blue-700 disabled:opacity-50 transition-colors"
                    >
                      {isGenerating ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <Sparkles className="w-3 h-3" />
                      )}
                      Sugerir Costos
                    </button>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">Nombre detallado del concepto</p>
                </div>
                <div className="md:w-2/3">
                  <textarea 
                    required
                    rows={2}
                    className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl focus:ring-2 focus:ring-primary focus:border-transparent outline-none font-bold text-slate-700 dark:text-slate-200 text-sm transition-all resize-none"
                    placeholder="Ej: Cimentación a base de zapata corrida..."
                    value={newItem.description}
                    onChange={(e) => setNewItem({...newItem, description: e.target.value})}
                  />
                </div>
              </div>

              {/* Unit and Quantity Group */}
              <div className="flex flex-col md:flex-row md:items-center justify-between p-4 md:p-6 border-b border-slate-100 dark:border-slate-800 gap-4 md:gap-6 hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors">
                <div className="md:w-1/3">
                  <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest block mb-1">Unidad y Cantidad</label>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">Medición y volumen de obra</p>
                </div>
                <div className="md:w-2/3 flex gap-4">
                  <div className="flex-1">
                    <input 
                      type="text"
                      required
                      placeholder="Unidad (m2, m3...)"
                      className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl focus:ring-2 focus:ring-primary focus:border-transparent outline-none font-bold text-slate-700 dark:text-slate-200 text-sm transition-all"
                      value={newItem.unit}
                      onChange={(e) => setNewItem({...newItem, unit: e.target.value})}
                    />
                  </div>
                  <div className="flex-1">
                    <input 
                      type="number"
                      required
                      min="0"
                      step="any"
                      placeholder="Cantidad"
                      className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl focus:ring-2 focus:ring-primary focus:border-transparent outline-none font-bold text-slate-700 dark:text-slate-200 text-sm transition-all"
                      value={newItem.quantity}
                      onChange={(e) => setNewItem({...newItem, quantity: Number(e.target.value)})}
                    />
                  </div>
                </div>
              </div>

              {/* Costs Group */}
              <div className="flex flex-col md:flex-row md:items-center justify-between p-4 md:p-6 border-b border-slate-100 dark:border-slate-800 gap-4 md:gap-6 hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors">
                <div className="md:w-1/3">
                  <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest block mb-1">Costos Directos</label>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">Materiales y Mano de Obra base</p>
                </div>
                <div className="md:w-2/3 flex gap-4">
                  <div className="flex-1">
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-primary font-bold text-xs">$</span>
                      <input 
                        type="number"
                        required
                        min="0"
                        step="any"
                        placeholder="C. Mat."
                        className="w-full pl-7 pr-4 py-3 bg-primary-light/30 dark:bg-primary/10 border border-primary-light dark:border-primary/20 rounded-2xl focus:ring-2 focus:ring-primary focus:border-transparent outline-none font-bold text-primary dark:text-primary-light text-sm transition-all"
                        value={newItem.materialCost}
                        onChange={(e) => setNewItem({...newItem, materialCost: Number(e.target.value)})}
                      />
                    </div>
                  </div>
                  <div className="flex-1">
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-blue-600 font-bold text-xs">$</span>
                      <input 
                        type="number"
                        required
                        min="0"
                        step="any"
                        placeholder="C. M.O."
                        className="w-full pl-7 pr-4 py-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800 rounded-2xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none font-bold text-blue-700 dark:text-blue-400 text-sm transition-all"
                        value={newItem.laborCost}
                        onChange={(e) => setNewItem({...newItem, laborCost: Number(e.target.value)})}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Indirects Field */}
              <div className="flex flex-col md:flex-row md:items-center justify-between p-4 md:p-6 border-b border-slate-100 dark:border-slate-800 gap-2 md:gap-6 hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors">
                <div className="md:w-1/3">
                  <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest block mb-1">Factor de Indirectos</label>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">Ej: 0.2 para un 20% adicional</p>
                </div>
                <div className="md:w-2/3">
                  <input 
                    type="number"
                    required
                    min="0"
                    step="any"
                    title="Factor de indirectos"
                    className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl focus:ring-2 focus:ring-primary focus:border-transparent outline-none font-bold text-slate-700 dark:text-slate-200 text-sm transition-all"
                    value={newItem.indirectFactor}
                    onChange={(e) => setNewItem({...newItem, indirectFactor: Number(e.target.value)})}
                  />
                </div>
              </div>

              {/* Notes Field */}
              <div className="flex flex-col md:flex-row md:items-start justify-between p-4 md:p-6 border-b border-slate-100 dark:border-slate-800 gap-2 md:gap-6 hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors">
                <div className="md:w-1/3 pt-2">
                  <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest block mb-1">Notas / Observaciones</label>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">Detalles técnicos o logísticos</p>
                </div>
                <div className="md:w-2/3">
                  <textarea 
                    rows={2}
                    className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl focus:ring-2 focus:ring-primary focus:border-transparent outline-none font-bold text-slate-700 dark:text-slate-200 text-sm transition-all resize-none"
                    placeholder="Detalles adicionales del renglón..."
                    value={newItem.notes}
                    onChange={(e) => setNewItem({...newItem, notes: e.target.value})}
                  />
                </div>
              </div>

              {/* Subtasks Section */}
              <div className="flex flex-col md:flex-row md:items-start justify-between p-4 md:p-6 border-b border-slate-100 dark:border-slate-800 gap-2 md:gap-6 hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors">
                <div className="md:w-1/3 pt-2">
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest block">Subtareas / Hitos</label>
                    <button
                      type="button"
                      onClick={addSubtaskToNewItem}
                      className="text-[10px] font-black text-primary hover:text-primary-hover uppercase tracking-widest"
                    >
                      + Agregar
                    </button>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">Desglose de ejecución del renglón</p>
                </div>
                <div className="md:w-2/3 space-y-3">
                  {newItem.subtasks.map((st, idx) => (
                    <div key={idx} className="flex gap-2 items-start bg-white dark:bg-slate-900 p-3 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm group">
                      <div className="flex-1 space-y-2">
                        <input 
                          type="text"
                          placeholder="Nombre de la subtarea"
                          className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-xl text-xs font-bold outline-none focus:ring-1 focus:ring-primary"
                          value={st.name}
                          onChange={(e) => updateSubtaskInNewItem(idx, 'name', e.target.value)}
                        />
                        <div className="flex gap-2">
                          <div className="flex-1 relative">
                            <User className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" size={12} />
                            <input 
                              type="text"
                              placeholder="Responsable"
                              className="w-full pl-7 pr-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-xl text-[10px] font-bold outline-none focus:ring-1 focus:ring-primary"
                              value={st.assignee}
                              onChange={(e) => updateSubtaskInNewItem(idx, 'assignee', e.target.value)}
                            />
                          </div>
                          <select
                            title="Estado de subtarea"
                            className="px-2 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-xl text-[10px] font-bold outline-none focus:ring-1 focus:ring-primary"
                            value={st.status}
                            onChange={(e) => updateSubtaskInNewItem(idx, 'status', e.target.value)}
                          >
                            <option value="Pendiente">Pendiente</option>
                            <option value="En Proceso">En Proceso</option>
                            <option value="Completado">Completado</option>
                          </select>
                        </div>
                      </div>
                      <button 
                        type="button"
                        onClick={() => removeSubtaskFromNewItem(idx)}
                        title="Eliminar subtarea"
                        className="p-2 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded-xl transition-colors opacity-0 group-hover:opacity-100"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                  {newItem.subtasks.length === 0 && (
                    <div className="text-center py-4 border border-dashed border-slate-200 dark:border-slate-800 rounded-2xl">
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Sin subtareas</p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Individual Materials Section - Synthesized */}
            <div className="space-y-2 pt-2">
              <div className="flex justify-between items-center">
                <h4 className="text-[10px] font-black text-slate-900 uppercase tracking-widest">Materiales</h4>
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <button 
                      type="button"
                      onClick={() => setShowMaterialLibrary(showMaterialLibrary === 'new' ? null : 'new')}
                      className="text-[10px] font-bold text-primary hover:bg-primary/5 px-2 py-1 rounded-lg border border-primary/20 transition-colors flex items-center gap-1"
                    >
                      <Search size={10} />
                      Biblioteca
                    </button>
                    
                    <AnimatePresence>
                      {showMaterialLibrary === 'new' && (
                        <motion.div 
                          initial={{ opacity: 0, y: 10, scale: 0.95 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, y: 10, scale: 0.95 }}
                          className="absolute right-0 top-full mt-1 w-64 bg-white rounded-xl shadow-2xl border border-slate-200 z-[110] overflow-hidden"
                        >
                          <div className="p-2 border-b border-slate-100 bg-slate-50">
                            <div className="relative">
                              <Search className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" size={12} />
                              <input 
                                type="text"
                                placeholder="Buscar material..."
                                className="w-full pl-7 pr-2 py-1.5 text-[10px] border border-slate-200 rounded-md focus:ring-1 focus:ring-primary outline-none"
                                value={materialSearch}
                                onChange={(e) => setMaterialSearch(e.target.value)}
                                autoFocus
                              />
                            </div>
                          </div>
                          <div className="max-h-48 overflow-y-auto p-1">
                            {materialLibrary
                              .filter(m => m.name.toLowerCase().includes(materialSearch.toLowerCase()))
                              .map((m, idx) => (
                                <button
                                  key={idx}
                                  type="button"
                                  onClick={() => {
                                    setNewItem({
                                      ...newItem,
                                      materials: [...newItem.materials, { ...m, quantity: 1 }]
                                    });
                                    setShowMaterialLibrary(null);
                                    setMaterialSearch("");
                                  }}
                                  className="w-full text-left px-2 py-2 hover:bg-slate-50 rounded-md transition-colors flex flex-col gap-0.5"
                                >
                                  <span className="text-[10px] font-bold text-slate-900">{m.name}</span>
                                  <div className="flex justify-between items-center">
                                    <span className="text-[9px] text-slate-500">{m.unit}</span>
                                    <span className="text-[9px] font-black text-primary">{formatCurrency(m.unitPrice)}</span>
                                  </div>
                                </button>
                              ))
                            }
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                  <button 
                    type="button"
                    onClick={addMaterialToNewItem}
                    className="text-[10px] font-bold text-primary hover:text-primary-hover"
                  >
                    + Personalizado
                  </button>
                </div>
              </div>
              <div className="max-h-[300px] overflow-y-auto space-y-3 custom-scrollbar pr-1">
                {newItem.materials.map((m, idx) => (
                  <div key={idx} className="bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-700 p-4 hover:border-primary/30 transition-all group">
                    <div className="flex flex-col md:flex-row gap-4">
                      <div className="flex-1">
                        <label className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest block mb-1">Nombre del Material</label>
                        <input 
                          type="text"
                          placeholder="Ej: Cemento Gris"
                          className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-200 outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                          value={m.name}
                          onChange={(e) => updateMaterialInNewItem(idx, 'name', e.target.value)}
                        />
                      </div>
                      <div className="grid grid-cols-3 md:grid-cols-4 gap-3 md:w-1/2">
                        <div>
                          <label className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest block mb-1 text-center">Unid.</label>
                          <input 
                            type="text"
                            placeholder="kg"
                            className="w-full px-2 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-center text-xs font-bold text-slate-700 dark:text-slate-200 outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                            value={m.unit}
                            onChange={(e) => updateMaterialInNewItem(idx, 'unit', e.target.value)}
                          />
                        </div>
                        <div>
                          <label className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest block mb-1 text-center">Cant.</label>
                          <input 
                            type="number"
                            title="Cantidad de material"
                            className="w-full px-2 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-center text-xs font-bold text-slate-700 dark:text-slate-200 outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                            value={m.quantity}
                            onChange={(e) => updateMaterialInNewItem(idx, 'quantity', Number(e.target.value))}
                          />
                        </div>
                        <div>
                          <label className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest block mb-1 text-right">P. Unit</label>
                          <input 
                            type="number"
                            title="Precio unitario de material"
                            className="w-full px-2 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-right text-xs font-bold text-slate-700 dark:text-slate-200 outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                            value={m.unitPrice}
                            onChange={(e) => updateMaterialInNewItem(idx, 'unitPrice', Number(e.target.value))}
                          />
                        </div>
                        <div className="hidden md:flex flex-col items-end justify-center">
                          <label className="text-[9px] font-black text-primary uppercase tracking-widest block mb-1">Subtotal</label>
                          <p className="text-xs font-black text-primary">
                            {formatCurrency(m.quantity * m.unitPrice)}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center justify-between md:justify-end gap-4 pt-2 md:pt-0 border-t md:border-t-0 border-slate-200 dark:border-slate-700">
                        <div className="md:hidden">
                          <p className="text-[9px] font-black text-primary uppercase tracking-widest mb-0.5">Subtotal</p>
                          <p className="text-xs font-black text-primary">
                            {formatCurrency(m.quantity * m.unitPrice)}
                          </p>
                        </div>
                        <button 
                          type="button"
                          onClick={() => removeMaterialFromNewItem(idx)}
                          title="Eliminar material"
                          className="p-2 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded-xl transition-colors"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
                {newItem.materials.length === 0 && (
                  <div className="text-center py-8 bg-slate-50 dark:bg-slate-800/30 rounded-3xl border border-dashed border-slate-200 dark:border-slate-700">
                    <Package className="mx-auto text-slate-300 dark:text-slate-600 mb-2" size={24} />
                    <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">No hay materiales agregados</p>
                  </div>
                )}
              </div>
            </div>

            {/* Individual Labor Section - Synthesized */}
            <div className="space-y-2 pt-2">
              <div className="flex justify-between items-center">
                <h4 className="text-[10px] font-black text-slate-900 uppercase tracking-widest">Mano de Obra</h4>
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <button 
                      type="button"
                      onClick={() => setShowMaterialLibrary(showMaterialLibrary === 'new-labor' ? null : 'new-labor')}
                      className="text-[10px] font-bold text-blue-600 hover:bg-blue-50 px-2 py-1 rounded-lg border border-blue-100 transition-colors flex items-center gap-1"
                    >
                      <Search size={10} />
                      Biblioteca
                    </button>
                    
                    <AnimatePresence>
                      {showMaterialLibrary === 'new-labor' && (
                        <motion.div 
                          initial={{ opacity: 0, y: 10, scale: 0.95 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, y: 10, scale: 0.95 }}
                          className="absolute right-0 top-full mt-1 w-64 bg-white rounded-xl shadow-2xl border border-slate-200 z-[110] overflow-hidden"
                        >
                          <div className="p-2 border-b border-slate-100 bg-slate-50">
                            <div className="relative">
                              <Search className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" size={12} />
                              <input 
                                type="text"
                                placeholder="Buscar rol..."
                                className="w-full pl-7 pr-2 py-1.5 text-[10px] border border-slate-200 rounded-md focus:ring-1 focus:ring-blue-500 outline-none"
                                value={materialSearch}
                                onChange={(e) => setMaterialSearch(e.target.value)}
                                autoFocus
                              />
                            </div>
                          </div>
                          <div className="max-h-48 overflow-y-auto p-1">
                            {laborLibrary
                              .filter(l => l.role.toLowerCase().includes(materialSearch.toLowerCase()))
                              .map((l, idx) => (
                                <button
                                  key={idx}
                                  type="button"
                                  onClick={() => {
                                    setNewItem({
                                      ...newItem,
                                      labor: [...newItem.labor, { ...l }]
                                    });
                                    setShowMaterialLibrary(null);
                                    setMaterialSearch("");
                                  }}
                                  className="w-full text-left px-2 py-2 hover:bg-slate-50 rounded-md transition-colors flex flex-col gap-0.5"
                                >
                                  <span className="text-[10px] font-bold text-slate-900">{l.role}</span>
                                  <div className="flex justify-between items-center">
                                    <span className="text-[9px] text-slate-500">Rend: {l.yield} {newItem.unit}/D</span>
                                    <span className="text-[9px] font-black text-blue-600">{formatCurrency(l.dailyRate)}/D</span>
                                  </div>
                                </button>
                              ))
                            }
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                  <button 
                    type="button"
                    onClick={addLaborToNewItem}
                    className="text-[10px] font-bold text-blue-600 hover:text-blue-700"
                  >
                    + Personalizado
                  </button>
                </div>
              </div>
              <div className="max-h-[250px] overflow-y-auto space-y-3 custom-scrollbar pr-1">
                {newItem.labor.map((l, idx) => (
                  <div key={idx} className="bg-blue-50/50 dark:bg-blue-900/10 rounded-2xl border border-blue-100 dark:border-blue-900/30 p-4 hover:border-blue-300 transition-all group">
                    <div className="flex flex-col md:flex-row gap-4">
                      <div className="flex-1">
                        <label className="text-[9px] font-black text-blue-400 dark:text-blue-500 uppercase tracking-widest block mb-1">Rol / Cuadrilla</label>
                        <input 
                          type="text"
                          placeholder="Ej: Oficial Albañil + Ayudante"
                          className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-blue-100 dark:border-blue-900/30 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-200 outline-none focus:ring-2 focus:ring-blue-500/20 transition-all"
                          value={l.role}
                          onChange={(e) => updateLaborInNewItem(idx, 'role', e.target.value)}
                        />
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:w-1/2">
                        <div>
                          <label className="text-[9px] font-black text-blue-400 dark:text-blue-500 uppercase tracking-widest block mb-1 text-center">Rendimiento</label>
                          <div className="relative">
                            <input 
                              type="number"
                              title="Rendimiento de mano de obra"
                              className="w-full px-2 py-2 bg-white dark:bg-slate-900 border border-blue-100 dark:border-blue-900/30 rounded-xl text-center text-xs font-bold text-slate-700 dark:text-slate-200 outline-none focus:ring-2 focus:ring-blue-500/20 transition-all"
                              value={l.yield}
                              onChange={(e) => updateLaborInNewItem(idx, 'yield', Number(e.target.value))}
                            />
                            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[8px] font-black text-slate-400 uppercase">{newItem.unit}/D</span>
                          </div>
                        </div>
                        <div>
                          <label className="text-[9px] font-black text-blue-400 dark:text-blue-500 uppercase tracking-widest block mb-1 text-right">Tarifa Diaria</label>
                          <input 
                            type="number"
                            title="Tarifa diaria de mano de obra"
                            className="w-full px-2 py-2 bg-white dark:bg-slate-900 border border-blue-100 dark:border-blue-900/30 rounded-xl text-right text-xs font-bold text-slate-700 dark:text-slate-200 outline-none focus:ring-2 focus:ring-blue-500/20 transition-all"
                            value={l.dailyRate}
                            onChange={(e) => updateLaborInNewItem(idx, 'dailyRate', Number(e.target.value))}
                          />
                        </div>
                        <div className="hidden md:flex flex-col items-end justify-center">
                          <label className="text-[9px] font-black text-blue-600 uppercase tracking-widest block mb-1">Costo Unit.</label>
                          <p className="text-xs font-black text-blue-600">
                            {formatCurrency(l.yield > 0 ? l.dailyRate / l.yield : 0)}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center justify-between md:justify-end gap-4 pt-2 md:pt-0 border-t md:border-t-0 border-blue-100 dark:border-blue-900/30">
                        <div className="md:hidden">
                          <p className="text-[9px] font-black text-blue-600 uppercase tracking-widest mb-0.5">Costo Unit.</p>
                          <p className="text-xs font-black text-blue-600">
                            {formatCurrency(l.yield > 0 ? l.dailyRate / l.yield : 0)}
                          </p>
                        </div>
                        <button 
                          type="button"
                          onClick={() => removeLaborFromNewItem(idx)}
                          title="Eliminar mano de obra"
                          className="p-2 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded-xl transition-colors"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
                {newItem.labor.length === 0 && (
                  <div className="text-center py-8 bg-blue-50/30 dark:bg-blue-900/5 rounded-3xl border border-dashed border-blue-100 dark:border-blue-900/20">
                    <UsersIcon className="mx-auto text-blue-200 dark:text-blue-800 mb-2" size={24} />
                    <p className="text-[10px] font-bold text-blue-400 dark:text-blue-500 uppercase tracking-widest">No hay mano de obra agregada</p>
                  </div>
                )}
              </div>
            </div>
          </form>
        </FormModal>

        {/* APU Import Modal */}
        <FormModal
          isOpen={isAPUImportModalOpen}
          onClose={() => setIsAPUImportModalOpen(false)}
          title="Importar desde Plantillas APU"
          maxWidth="max-w-4xl"
        >
          <div className="space-y-6">
            <div className="flex flex-col md:flex-row gap-4">
              <div className="flex-1">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">Tipología</label>
                <div className="flex gap-2 overflow-x-auto pb-2 custom-scrollbar">
                  {Object.keys(APU_TEMPLATES).map(t => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setApuImportTypology(t)}
                      className={cn(
                        "px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all border",
                        apuImportTypology === t
                          ? "bg-primary text-white border-primary shadow-lg shadow-primary-shadow"
                          : "bg-white text-slate-600 border-slate-200 hover:border-primary/30"
                      )}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>
              <div className="md:w-1/3">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">Buscar Item</label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                  <input
                    type="text"
                    placeholder="Ej: Cimentación..."
                    className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                    value={apuImportSearchTerm}
                    onChange={(e) => setApuImportSearchTerm(e.target.value)}
                  />
                </div>
              </div>
            </div>

            <div
              ref={apuTemplatesListRef}
              onScroll={(e) => setApuImportScrollTop(e.currentTarget.scrollTop)}
              className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[500px] overflow-y-auto pr-2 custom-scrollbar"
            >
              {filteredApuTemplates.map((template: any) => (
                <button
                  key={`${apuImportTypology}-${template.description}`}
                  type="button"
                  onClick={() => importFromApuTemplate(template)}
                  className="text-left p-4 bg-white border border-slate-200 rounded-2xl hover:border-primary hover:shadow-md transition-all group"
                >
                  <div className="flex justify-between items-start mb-2">
                    <h4 className="text-sm font-black text-slate-900 group-hover:text-primary transition-colors">{template.description}</h4>
                    <span className="px-2 py-0.5 bg-slate-100 text-slate-500 text-[10px] font-bold rounded-md uppercase">{template.unit}</span>
                  </div>
                  <div className="flex gap-4 text-[10px] text-slate-500 font-medium">
                    <div className="flex items-center gap-1">
                      <Package size={12} />
                      {template.materials.length} Materiales
                    </div>
                    <div className="flex items-center gap-1">
                      <UsersIcon size={12} />
                      {template.labor.length} Roles M.O.
                    </div>
                  </div>
                  <div className="mt-3 pt-3 border-t border-slate-50 flex justify-between items-center">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Costo Estimado Unit.</span>
                    <span className="text-xs font-black text-primary">
                      {formatCurrency((template.materials.reduce((sum: number, m: any) => sum + (m.quantity * m.unitPrice), 0) + template.labor.reduce((sum: number, l: any) => sum + (l.dailyRate / l.yield), 0)) * (1 + template.indirectFactor))}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </FormModal>

        {/* Edit Item Modal */}
        <FormModal
          isOpen={!!editingItem}
          onClose={() => setEditingItem(null)}
          title={`Editar Renglón: ${editingItem?.description}`}
          fullVertical
          footer={
            <div className="flex flex-col md:flex-row justify-between items-center gap-4 w-full">
              <div className="flex flex-col items-center md:items-start">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Total Estimado Unitario</p>
                <p className="text-xl font-black text-primary">
                  {editingItem && formatCurrency((editingItem.materialCost + editingItem.laborCost) * (1 + (editingItem.indirectFactor || 0.2)))}
                </p>
              </div>
              <div className="flex gap-3 w-full md:w-auto">
                <button 
                  type="button"
                  onClick={() => setEditingItem(null)}
                  className="flex-1 md:flex-none px-6 py-3 bg-white border border-slate-200 text-slate-600 font-bold rounded-2xl hover:bg-slate-50 transition-all"
                >
                  Cerrar
                </button>
                <button 
                  type="button"
                  onClick={() => setEditingItem(null)}
                  className="flex-1 md:flex-none px-8 py-3 bg-primary text-white font-black rounded-2xl hover:bg-primary-hover transition-all shadow-lg shadow-primary-shadow"
                >
                  Guardar Cambios
                </button>
              </div>
            </div>
          }
        >
          {editingItem && (
            <div className="space-y-0 pb-12">
              <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm mb-8">
                {/* Description Field */}
                <div className="flex flex-col md:flex-row md:items-start justify-between p-4 md:p-6 border-b border-slate-100 dark:border-slate-800 gap-2 md:gap-6 hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors">
                  <div className="md:w-1/3 pt-2">
                    <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest block mb-1">Descripción</label>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">Nombre detallado del concepto</p>
                  </div>
                  <div className="md:w-2/3">
                    <textarea 
                      rows={2}
                      title="Descripción del renglón"
                      className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl focus:ring-2 focus:ring-primary focus:border-transparent outline-none font-bold text-slate-700 dark:text-slate-200 text-sm transition-all resize-none"
                      value={editingItem.description}
                      onChange={(e) => {
                        const updated = { ...editingItem, description: e.target.value };
                        setEditingItem(updated);
                        patchBudgetItem(editingItem.id, { description: e.target.value });
                      }}
                    />
                  </div>
                </div>

                {/* Category Field */}
                <div className="flex flex-col md:flex-row md:items-center justify-between p-4 md:p-6 border-b border-slate-100 dark:border-slate-800 gap-2 md:gap-6 hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors">
                  <div className="md:w-1/3">
                    <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest block mb-1">Categoría</label>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">Clasificación del concepto</p>
                  </div>
                  <div className="md:w-2/3">
                    <select 
                      title="Categoría del renglón"
                      className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl focus:ring-2 focus:ring-primary focus:border-transparent outline-none font-bold text-slate-700 dark:text-slate-200 text-sm transition-all"
                      value={editingItem.category}
                      onChange={(e) => {
                        const updated = { ...editingItem, category: e.target.value };
                        setEditingItem(updated);
                        patchBudgetItem(editingItem.id, { category: e.target.value });
                      }}
                    >
                      <option value="General">General</option>
                      <option value="Preliminares">Preliminares</option>
                      <option value="Cimentación">Cimentación</option>
                      <option value="Estructura">Estructura</option>
                      <option value="Albañilería">Albañilería</option>
                      <option value="Instalaciones">Instalaciones</option>
                      <option value="Acabados">Acabados</option>
                      <option value="Herrería">Herrería</option>
                      <option value="Carpintería">Carpintería</option>
                      <option value="Limpieza">Limpieza</option>
                    </select>
                  </div>
                </div>

                {/* Unit and Quantity Group */}
                <div className="flex flex-col md:flex-row md:items-center justify-between p-4 md:p-6 gap-4 md:gap-6 hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors">
                  <div className="md:w-1/3">
                    <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest block mb-1">Unidad y Cantidad</label>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">Medición y volumen de obra</p>
                  </div>
                  <div className="md:w-2/3 flex gap-4">
                    <div className="flex-1">
                      <input 
                        type="text"
                        title="Unidad del renglón"
                        className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl focus:ring-2 focus:ring-primary focus:border-transparent outline-none font-bold text-slate-700 dark:text-slate-200 text-sm transition-all"
                        value={editingItem.unit}
                        onChange={(e) => {
                          const updated = { ...editingItem, unit: e.target.value };
                          setEditingItem(updated);
                          patchBudgetItem(editingItem.id, { unit: e.target.value });
                        }}
                      />
                    </div>
                    <div className="flex-1">
                      <input 
                        type="number"
                        title="Cantidad del renglón"
                        className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl focus:ring-2 focus:ring-primary focus:border-transparent outline-none font-bold text-slate-700 dark:text-slate-200 text-sm transition-all"
                        value={editingItem.quantity}
                        onChange={(e) => {
                          const qty = Number(e.target.value.replace(',', '.'));
                          if (!Number.isFinite(qty)) {
                            return;
                          }
                          const updated = { ...editingItem, quantity: qty };
                          setEditingItem(updated);
                          updateQuantity(editingItem.id, qty);
                        }}
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm mt-8">
                <div className="flex flex-col md:flex-row md:items-start justify-between p-4 md:p-6 gap-2 md:gap-6 hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors">
                  <div className="md:w-1/3 pt-2">
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest block">Subtareas / Hitos</label>
                      <button
                        type="button"
                        onClick={() => addSubtaskToItem(editingItem.id, { name: '', assignee: '', status: 'Pendiente' })}
                        title="Agregar subtarea"
                        className="text-[10px] font-black text-primary hover:text-primary-hover uppercase tracking-widest"
                      >
                        + Agregar
                      </button>
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">Desglose de ejecución del renglón</p>
                  </div>
                  <div className="md:w-2/3 space-y-3">
                    {(editingItem.subtasks || []).map((st: any, idx: number) => (
                      <div key={idx} className="flex gap-2 items-start bg-slate-50 dark:bg-slate-800/50 p-3 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm group">
                        <div className="flex-1 space-y-2">
                          <input 
                            type="text"
                            placeholder="Nombre de la subtarea"
                            className="w-full px-3 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold outline-none focus:ring-1 focus:ring-primary"
                            value={st.name}
                            onChange={(e) => updateSubtaskInItem(editingItem.id, idx, 'name', e.target.value)}
                          />
                          <div className="flex gap-2">
                            <div className="flex-1 relative">
                              <User className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" size={12} />
                              <input 
                                type="text"
                                placeholder="Responsable"
                                className="w-full pl-7 pr-3 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-[10px] font-bold outline-none focus:ring-1 focus:ring-primary"
                                value={st.assignee}
                                onChange={(e) => updateSubtaskInItem(editingItem.id, idx, 'assignee', e.target.value)}
                              />
                            </div>
                            <select
                              title="Estado de subtarea"
                              className="px-2 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-[10px] font-bold outline-none focus:ring-1 focus:ring-primary"
                              value={st.status}
                              onChange={(e) => updateSubtaskInItem(editingItem.id, idx, 'status', e.target.value)}
                            >
                              <option value="Pendiente">Pendiente</option>
                              <option value="En Proceso">En Proceso</option>
                              <option value="Completado">Completado</option>
                            </select>
                          </div>
                        </div>
                        <button 
                          type="button"
                          onClick={() => removeSubtaskFromItem(editingItem.id, idx)}
                          title="Eliminar subtarea"
                          className="p-2 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded-xl transition-colors opacity-0 group-hover:opacity-100"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                    {(!editingItem.subtasks || editingItem.subtasks.length === 0) && (
                      <div className="text-center py-4 border border-dashed border-slate-200 dark:border-slate-700 rounded-2xl">
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Sin subtareas</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Materials Section */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest flex items-center gap-2">
                      <Package className="text-primary" size={18} />
                      Materiales
                    </h3>
                    <div className="flex gap-2">
                      <div className="relative">
                        <button 
                          onClick={() => setShowMaterialLibrary(showMaterialLibrary === editingItem.id ? null : editingItem.id)}
                          className="text-[10px] font-bold text-primary hover:bg-primary/5 px-3 py-1.5 rounded-xl border border-primary/20 transition-colors flex items-center gap-1"
                        >
                          <Search size={12} />
                          Biblioteca
                        </button>
                        <AnimatePresence>
                          {showMaterialLibrary === editingItem.id && (
                            <motion.div 
                              initial={{ opacity: 0, y: 10, scale: 0.95 }}
                              animate={{ opacity: 1, y: 0, scale: 1 }}
                              exit={{ opacity: 0, y: 10, scale: 0.95 }}
                              className="absolute right-0 top-full mt-2 w-72 bg-white rounded-2xl shadow-2xl border border-slate-200 z-[100] overflow-hidden"
                            >
                              <div className="p-3 border-b border-slate-100 bg-slate-50">
                                <div className="relative">
                                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                                  <input 
                                    type="text"
                                    placeholder="Buscar material..."
                                    className="w-full pl-9 pr-3 py-2 text-xs border border-slate-200 rounded-xl focus:ring-2 focus:ring-primary outline-none"
                                    value={materialSearch}
                                    onChange={(e) => setMaterialSearch(e.target.value)}
                                    autoFocus
                                  />
                                </div>
                              </div>
                              <div className="max-h-64 overflow-y-auto p-2">
                                {materialLibrary
                                  .filter(m => m.name.toLowerCase().includes(materialSearch.toLowerCase()))
                                  .map((m, idx) => (
                                    <button
                                      key={idx}
                                      onClick={() => {
                                        addMaterialToItem(editingItem.id, { ...m, quantity: 1 });
                                        setShowMaterialLibrary(null);
                                        setMaterialSearch("");
                                      }}
                                      className="w-full text-left px-3 py-2.5 hover:bg-slate-50 rounded-xl transition-colors flex flex-col gap-1"
                                    >
                                      <span className="text-xs font-bold text-slate-900">{m.name}</span>
                                      <div className="flex justify-between items-center">
                                        <span className="text-[10px] text-slate-500">{m.unit}</span>
                                        <span className="text-[10px] font-black text-primary">{formatCurrency(m.unitPrice)}</span>
                                      </div>
                                    </button>
                                  ))
                                }
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                      <button 
                        onClick={() => addMaterialToItem(editingItem.id, { name: 'Nuevo Material', unit: 'u', quantity: 0, unitPrice: 0 })}
                        className="text-[10px] font-bold text-primary hover:bg-primary/5 px-3 py-1.5 rounded-xl border border-primary/20 transition-colors"
                      >
                        + Personalizado
                      </button>
                    </div>
                  </div>

                  <div className="space-y-3 max-h-[400px] overflow-y-auto custom-scrollbar pr-1">
                    {editingItem.materials.map((m: any, idx: number) => (
                      <div key={idx} className="bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-700 p-4 hover:border-primary/30 transition-all group">
                        <div className="flex flex-col md:flex-row gap-4">
                          <div className="flex-1">
                            <label className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest block mb-1">Nombre del Material</label>
                            <input 
                              type="text"
                              title="Nombre de material"
                              className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-200 outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                              value={m.name}
                              onChange={(e) => updateItemYield(editingItem.id, 'material', idx, 'name', e.target.value)}
                            />
                          </div>
                          <div className="grid grid-cols-3 md:grid-cols-4 gap-3 md:w-1/2">
                            <div>
                              <label className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest block mb-1 text-center">Unid.</label>
                              <input 
                                type="text"
                                title="Unidad de material"
                                className="w-full px-2 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-center text-xs font-bold text-slate-700 dark:text-slate-200 outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                                value={m.unit}
                                onChange={(e) => updateItemYield(editingItem.id, 'material', idx, 'unit', e.target.value)}
                              />
                            </div>
                            <div>
                              <label className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest block mb-1 text-center">Cant.</label>
                              <input 
                                type="number"
                                title="Cantidad de material"
                                className="w-full px-2 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-center text-xs font-bold text-slate-700 dark:text-slate-200 outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                                value={m.quantity}
                                onChange={(e) => updateItemYield(editingItem.id, 'material', idx, 'quantity', Number(e.target.value))}
                              />
                            </div>
                            <div>
                              <label className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest block mb-1 text-right">P. Unit</label>
                              <input 
                                type="number"
                                title="Precio unitario de material"
                                className="w-full px-2 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-right text-xs font-bold text-slate-700 dark:text-slate-200 outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                                value={m.unitPrice}
                                onChange={(e) => updateItemYield(editingItem.id, 'material', idx, 'unitPrice', Number(e.target.value))}
                              />
                            </div>
                            <div className="hidden md:flex flex-col items-end justify-center">
                              <label className="text-[9px] font-black text-primary uppercase tracking-widest block mb-1">Subtotal</label>
                              <p className="text-xs font-black text-primary">
                                {formatCurrency(m.quantity * m.unitPrice)}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center justify-between md:justify-end gap-4 pt-2 md:pt-0 border-t md:border-t-0 border-slate-200 dark:border-slate-700">
                            <div className="md:hidden">
                              <p className="text-[9px] font-black text-primary uppercase tracking-widest mb-0.5">Subtotal</p>
                              <p className="text-xs font-black text-primary">
                                {formatCurrency(m.quantity * m.unitPrice)}
                              </p>
                            </div>
                            <button 
                              type="button"
                              onClick={() => removeMaterialFromItem(editingItem.id, idx)}
                              title="Eliminar material"
                              className="p-2 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded-xl transition-colors"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                    {editingItem.materials.length === 0 && (
                      <div className="text-center py-8 bg-slate-50 dark:bg-slate-800/30 rounded-3xl border border-dashed border-slate-200 dark:border-slate-700">
                        <Package className="mx-auto text-slate-300 dark:text-slate-600 mb-2" size={24} />
                        <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">No hay materiales agregados</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Labor Section */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest flex items-center gap-2">
                      <UsersIcon className="text-blue-600" size={18} />
                      Mano de Obra
                    </h3>
                    <button 
                      onClick={() => addLaborToItem(editingItem.id, { role: 'Nuevo Rol', yield: 1, dailyRate: 0 })}
                      className="text-[10px] font-bold text-blue-600 hover:bg-blue-50 px-3 py-1.5 rounded-xl border border-blue-100 transition-colors"
                    >
                      + Personalizado
                    </button>
                  </div>

                  <div className="space-y-3 max-h-[400px] overflow-y-auto custom-scrollbar pr-1">
                    {editingItem.labor.map((l: any, idx: number) => (
                      <div key={idx} className="bg-blue-50/50 dark:bg-blue-900/10 rounded-2xl border border-blue-100 dark:border-blue-900/30 p-4 hover:border-blue-300 transition-all group">
                        <div className="flex flex-col md:flex-row gap-4">
                          <div className="flex-1">
                            <label className="text-[9px] font-black text-blue-400 dark:text-blue-500 uppercase tracking-widest block mb-1">Rol / Cuadrilla</label>
                            <input 
                              type="text"
                              title="Rol de mano de obra"
                              className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-blue-100 dark:border-blue-900/30 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-200 outline-none focus:ring-2 focus:ring-blue-500/20 transition-all"
                              value={l.role}
                              onChange={(e) => updateItemYield(editingItem.id, 'labor', idx, 'role', e.target.value)}
                            />
                          </div>
                          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:w-1/2">
                            <div>
                              <label className="text-[9px] font-black text-blue-400 dark:text-blue-500 uppercase tracking-widest block mb-1 text-center">Rendimiento</label>
                              <div className="relative">
                                <input 
                                  type="number"
                                  title="Rendimiento de mano de obra"
                                  className="w-full px-2 py-2 bg-white dark:bg-slate-900 border border-blue-100 dark:border-blue-900/30 rounded-xl text-center text-xs font-bold text-slate-700 dark:text-slate-200 outline-none focus:ring-2 focus:ring-blue-500/20 transition-all"
                                  value={l.yield}
                                  onChange={(e) => updateItemYield(editingItem.id, 'labor', idx, 'yield', Number(e.target.value))}
                                />
                                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[8px] font-black text-slate-400 uppercase">{editingItem.unit}/D</span>
                              </div>
                            </div>
                            <div>
                              <label className="text-[9px] font-black text-blue-400 dark:text-blue-500 uppercase tracking-widest block mb-1 text-right">Tarifa Diaria</label>
                              <input 
                                type="number"
                                title="Tarifa diaria de mano de obra"
                                className="w-full px-2 py-2 bg-white dark:bg-slate-900 border border-blue-100 dark:border-blue-900/30 rounded-xl text-right text-xs font-bold text-slate-700 dark:text-slate-200 outline-none focus:ring-2 focus:ring-blue-500/20 transition-all"
                                value={l.dailyRate}
                                onChange={(e) => updateItemYield(editingItem.id, 'labor', idx, 'dailyRate', Number(e.target.value))}
                              />
                            </div>
                            <div className="hidden md:flex flex-col items-end justify-center">
                              <label className="text-[9px] font-black text-blue-600 uppercase tracking-widest block mb-1">Costo Unit.</label>
                              <p className="text-xs font-black text-blue-600">
                                {formatCurrency(l.yield > 0 ? l.dailyRate / l.yield : 0)}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center justify-between md:justify-end gap-4 pt-2 md:pt-0 border-t md:border-t-0 border-blue-100 dark:border-blue-900/30">
                            <div className="md:hidden">
                              <p className="text-[9px] font-black text-blue-600 uppercase tracking-widest mb-0.5">Costo Unit.</p>
                              <p className="text-xs font-black text-blue-600">
                                {formatCurrency(l.yield > 0 ? l.dailyRate / l.yield : 0)}
                              </p>
                            </div>
                            <button 
                              type="button"
                              onClick={() => removeLaborFromItem(editingItem.id, idx)}
                              title="Eliminar mano de obra"
                              className="p-2 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded-xl transition-colors"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                    {editingItem.labor.length === 0 && (
                      <div className="text-center py-8 bg-blue-50/30 dark:bg-blue-900/5 rounded-3xl border border-dashed border-blue-100 dark:border-blue-900/20">
                        <UsersIcon className="mx-auto text-blue-200 dark:text-blue-800 mb-2" size={24} />
                        <p className="text-[10px] font-bold text-blue-400 dark:text-blue-500 uppercase tracking-widest">No hay mano de obra agregada</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </FormModal>

        {/* Material Explosion Modal */}
        <FormModal
          isOpen={isMaterialExplosionOpen}
          onClose={() => setIsMaterialExplosionOpen(false)}
          title="Explosión de Materiales"
          fullVertical
          footer={
            <div className="flex justify-between items-center w-full">
              <div className="flex items-center gap-3">
                <button 
                  onClick={syncToInventory}
                  disabled={isSyncing || syncableMaterialCount === 0}
                  className="flex items-center gap-2 px-6 py-3 bg-primary text-white font-black rounded-2xl hover:bg-primary/90 transition-all shadow-lg disabled:opacity-50"
                  title={
                    syncableMaterialCount === 0
                      ? 'No hay materiales válidos para sincronizar'
                      : `Sincronizar ${syncableMaterialCount} material(es) con inventario`
                  }
                >
                  {isSyncing ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
                  Sincronizar con Inventario
                </button>
                <span className="px-3 py-1.5 bg-primary/10 text-primary rounded-xl text-[10px] font-black uppercase tracking-widest border border-primary/20">
                  {syncableMaterialCount} Material(es)
                </span>
              </div>
              <button 
                onClick={() => setIsMaterialExplosionOpen(false)}
                className="px-8 py-3 bg-slate-900 dark:bg-slate-700 text-white font-black rounded-2xl hover:bg-slate-800 dark:hover:bg-slate-600 transition-all shadow-lg"
              >
                Cerrar
              </button>
            </div>
          }
        >
          <div className="space-y-8 pb-12">
            {/* Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-6">
              <div className="p-4 md:p-6 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm">
                <p className="text-[9px] md:text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1">Insumos Diferentes</p>
                <p className="text-xl md:text-2xl font-black text-slate-900 dark:text-white">{materialExplosion.length}</p>
              </div>
              <div className="p-4 md:p-6 bg-emerald-50 dark:bg-emerald-900/10 rounded-3xl border border-emerald-100 dark:border-emerald-900/30 shadow-sm">
                <p className="text-[9px] md:text-[10px] font-black text-emerald-600 dark:text-emerald-500 uppercase tracking-widest mb-1">Costo Materiales</p>
                <p className="text-xl md:text-2xl font-black text-emerald-600 dark:text-emerald-400">
                  {formatCurrency(materialExplosion.reduce((sum, m) => sum + m.total, 0))}
                </p>
              </div>
              <div className="p-4 md:p-6 bg-blue-50 dark:bg-blue-900/10 rounded-3xl border border-blue-100 dark:border-blue-900/30 shadow-sm">
                <p className="text-[9px] md:text-[10px] font-black text-blue-600 dark:text-blue-500 uppercase tracking-widest mb-1">Mano de Obra</p>
                <p className="text-xl md:text-2xl font-black text-blue-600 dark:text-blue-400">
                  {formatCurrency(budgetItems.reduce((sum, item) => sum + ((item.laborCost || 0) * (item.quantity || 0)), 0))}
                </p>
              </div>
              <div className="p-4 md:p-6 bg-rose-50 dark:bg-rose-900/10 rounded-3xl border border-rose-100 dark:border-rose-900/30 shadow-sm">
                <p className="text-[9px] md:text-[10px] font-black text-rose-600 dark:text-rose-500 uppercase tracking-widest mb-1">Costo Real Total</p>
                <p className="text-xl md:text-2xl font-black text-rose-600 dark:text-rose-400">
                  {formatCurrency(totalRealCost)}
                </p>
              </div>
              <div className="p-4 md:p-6 bg-slate-900 dark:bg-slate-800 rounded-3xl shadow-sm">
                <p className="text-[9px] md:text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1">Presupuesto Total</p>
                <p className="text-xl md:text-2xl font-black text-white">{formatCurrency(totalBudget)}</p>
              </div>
            </div>

            {/* List of Materials */}
            <div className="space-y-4">
              <div className="flex items-center justify-between px-2">
                <h3 className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-widest">Detalle de Insumos</h3>
                <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">{materialExplosion.length} items</span>
              </div>

              <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
                <div className="hidden md:grid grid-cols-12 gap-4 px-6 py-4 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-100 dark:border-slate-800">
                  <div className="col-span-4 text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Insumo</div>
                  <div className="col-span-1 text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest text-center">Unid.</div>
                  <div className="col-span-2 text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest text-center">Cant. Total</div>
                  <div className="col-span-2 text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest text-center">Riesgo</div>
                  <div className="col-span-3 text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest text-right">Total Presup.</div>
                </div>

                <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-[500px] overflow-y-auto custom-scrollbar">
                  {materialExplosion.map((m, idx) => (
                    <div key={idx} className="p-4 md:px-6 md:py-4 hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors">
                      <div className="grid grid-cols-1 md:grid-cols-12 gap-3 md:gap-4 items-center">
                        <div className="col-span-4">
                          <p className="text-sm font-bold text-slate-900 dark:text-white">{m.name}</p>
                          <p className="md:hidden text-[10px] text-slate-500 dark:text-slate-400 font-medium mt-0.5">{m.unit} • {m.quantity.toLocaleString()} total</p>
                        </div>
                        <div className="hidden md:col-span-1 text-center text-xs font-medium text-slate-500 dark:text-slate-400">
                          {m.unit}
                        </div>
                        <div className="hidden md:col-span-2 text-center text-xs font-black text-slate-900 dark:text-white">
                          {m.quantity.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </div>
                        <div className="col-span-2 flex md:justify-center">
                          <span className={cn(
                            "px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-wider",
                            m.riskLevel === 'High' ? "bg-rose-100 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400" :
                            m.riskLevel === 'Medium' ? "bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400" :
                            "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400"
                          )}>
                            {m.riskLevel === 'High' ? 'Crítico' : m.riskLevel === 'Medium' ? 'Medio' : 'Bajo'}
                          </span>
                        </div>
                        <div className="col-span-3 text-right">
                          <p className="text-sm font-black text-slate-900 dark:text-white">{formatCurrency(m.total)}</p>
                          <p className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold">Costo Real: {formatCurrency(m.realCost)}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                  {materialExplosion.length === 0 && (
                    <div className="px-6 py-12 text-center">
                      <Package className="mx-auto text-slate-200 dark:text-slate-700 mb-2" size={32} />
                      <p className="text-xs text-slate-400 dark:text-slate-500 italic font-medium">
                        No hay materiales presupuestados. Asigne cantidades a los renglones de trabajo.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </FormModal>

        {/* Material Transactions Modal */}
        <FormModal
          isOpen={!!viewingTransactionsForMaterial}
          onClose={() => setViewingTransactionsForMaterial(null)}
          title="Costo Real de Material"
          maxWidth="max-w-lg"
          fullVertical
          footer={
            <div className="flex justify-between items-center w-full gap-4">
              <div className="flex flex-col">
                <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Total Acumulado</span>
                <span className="text-xl font-black text-emerald-600 dark:text-emerald-400">
                  {viewingTransactionsForMaterial && formatCurrency(
                    transactions
                      .filter(t => 
                        t.budgetItemId === viewingTransactionsForMaterial.item.id && 
                        t.description?.toLowerCase().includes(viewingTransactionsForMaterial.material.name.toLowerCase())
                      )
                      .reduce((sum, t) => sum + t.amount, 0)
                  )}
                </span>
              </div>
              <button 
                onClick={() => setViewingTransactionsForMaterial(null)}
                className="px-8 py-3 bg-slate-900 dark:bg-slate-700 text-white font-black rounded-2xl hover:bg-slate-800 dark:hover:bg-slate-600 transition-all shadow-lg"
              >
                Cerrar
              </button>
            </div>
          }
        >
          {viewingTransactionsForMaterial && (
            <div className="space-y-6 pb-4">
              <div className="flex items-center gap-4 p-5 bg-emerald-50 dark:bg-emerald-900/10 rounded-3xl border border-emerald-100 dark:border-emerald-900/30">
                <div className="p-3 bg-emerald-600 dark:bg-emerald-500 text-white rounded-2xl shadow-lg shadow-emerald-200 dark:shadow-none">
                  <Package size={24} />
                </div>
                <div>
                  <p className="text-[10px] font-black text-emerald-600 dark:text-emerald-500 uppercase tracking-widest">Material</p>
                  <p className="text-lg font-black text-slate-900 dark:text-white">{viewingTransactionsForMaterial.material.name}</p>
                </div>
              </div>

              <div className="space-y-3">
                <h4 className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest px-2">Transacciones de Compra</h4>
                <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-100 dark:border-slate-800 rounded-3xl overflow-hidden bg-white dark:bg-slate-900 shadow-sm max-h-[400px] overflow-y-auto custom-scrollbar">
                  {transactions
                    .filter(t => 
                      t.budgetItemId === viewingTransactionsForMaterial.item.id && 
                      t.description?.toLowerCase().includes(viewingTransactionsForMaterial.material.name.toLowerCase())
                    )
                    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                    .map((t) => (
                      <div key={t.id} className="p-4 flex justify-between items-center hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                        <div>
                          <p className="text-sm font-bold text-slate-900 dark:text-white">{t.description}</p>
                          <p className="text-[10px] text-slate-400 dark:text-slate-500 font-medium">{new Date(t.date).toLocaleDateString()}</p>
                        </div>
                        <p className="text-sm font-black text-emerald-600 dark:text-emerald-400">{formatCurrency(t.amount)}</p>
                      </div>
                    ))}
                  {transactions.filter(t => 
                    t.budgetItemId === viewingTransactionsForMaterial.item.id && 
                    t.description?.toLowerCase().includes(viewingTransactionsForMaterial.material.name.toLowerCase())
                  ).length === 0 && (
                    <div className="p-10 text-center text-slate-400 dark:text-slate-600 italic text-sm">
                      No hay transacciones registradas para este material.
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </FormModal>

        {/* Transactions Detail Modal */}
        <FormModal
          isOpen={!!viewingTransactionsForItem}
          onClose={() => setViewingTransactionsForItem(null)}
          title="Detalle de Ejecución"
          maxWidth="max-w-2xl"
          fullVertical
          footer={
            <div className="flex justify-end w-full">
              <button 
                onClick={() => setViewingTransactionsForItem(null)}
                className="px-8 py-3 bg-slate-900 dark:bg-slate-700 text-white font-black rounded-2xl hover:bg-slate-800 dark:hover:bg-slate-600 transition-all shadow-lg"
              >
                Cerrar
              </button>
            </div>
          }
        >
          {viewingTransactionsForItem && (
            <div className="space-y-6 pb-4">
              <div className="p-5 bg-slate-900 dark:bg-slate-800 text-white rounded-3xl shadow-xl">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Actividad</p>
                <p className="text-lg font-bold leading-tight">{viewingTransactionsForItem.description}</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="p-5 bg-white dark:bg-slate-900 rounded-3xl border border-slate-100 dark:border-slate-800 shadow-sm">
                  <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1">Presupuestado</p>
                  <p className="text-xl font-black text-slate-900 dark:text-white">{formatCurrency(viewingTransactionsForItem.totalItemPrice)}</p>
                </div>
                <div className="p-5 bg-primary-light/30 dark:bg-primary/10 rounded-3xl border border-primary-light dark:border-primary/20 shadow-sm">
                  <p className="text-[10px] font-black text-primary dark:text-primary-light opacity-60 uppercase tracking-widest mb-1">Ejecutado</p>
                  <p className="text-xl font-black text-primary dark:text-primary-light">
                    {formatCurrency(transactions.filter(t => t.budgetItemId === viewingTransactionsForItem.id).reduce((sum, t) => sum + t.amount, 0))}
                  </p>
                </div>
              </div>

              <div className="space-y-3">
                <h4 className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest px-2">Transacciones Asociadas</h4>
                <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-100 dark:border-slate-800 rounded-3xl overflow-hidden bg-white dark:bg-slate-900 shadow-sm max-h-[400px] overflow-y-auto custom-scrollbar">
                  {transactions
                    .filter(t => t.budgetItemId === viewingTransactionsForItem.id)
                    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                    .map((t) => (
                      <div key={t.id} className="p-4 flex justify-between items-center hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                        <div>
                          <p className="text-sm font-bold text-slate-900 dark:text-white">{t.description}</p>
                          <p className="text-[10px] text-slate-400 dark:text-slate-500 font-medium">{new Date(t.date).toLocaleDateString()}</p>
                        </div>
                        <p className="text-sm font-black text-slate-900 dark:text-white">{formatCurrency(t.amount)}</p>
                      </div>
                    ))}
                  {transactions.filter(t => t.budgetItemId === viewingTransactionsForItem.id).length === 0 && (
                    <div className="p-10 text-center text-slate-400 dark:text-slate-600 italic text-sm">
                      No hay transacciones registradas para este renglón.
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </FormModal>

        <ConfirmModal
          isOpen={isDeleteConfirmOpen}
          onClose={() => setIsDeleteConfirmOpen(false)}
          onConfirm={confirmDeleteItem}
          title="Eliminar Renglón"
          message="¿Estás seguro de que deseas eliminar este renglón? Esta acción no se puede deshacer."
        />

        <CostCalculatorModal
          isOpen={isCostCalculatorOpen}
          onClose={() => setIsCostCalculatorOpen(false)}
          onImport={handleImportFromCalculator}
          initialTypology={project.typology}
        />
      </motion.div>
    </div>
    </>
  );
}
