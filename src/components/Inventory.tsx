import React, { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { 
  Plus, 
  Search, 
  Package, 
  AlertTriangle, 
  ArrowUpRight, 
  ArrowDownRight, 
  MoreVertical,
  Trash2,
  Edit2,
  X,
  Layers,
  ShoppingBag,
  Download,
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  XCircle,
  ChevronLeft,
  ChevronRight,
  Wrench,
  HardHat,
  Wifi,
  Construction,
  Sparkles,
  Loader2,
  QrCode
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { GoogleGenAI, Type } from "@google/genai";
import { StepForm, FormSection, FormInput, FormSelect } from './FormLayout';
import { formatCurrency, formatDate, cn, handleApiError, OperationType, parseAIClientError } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { sendNotification } from '../lib/notifications';
import { logAction } from '../lib/audit';
import { toast } from 'sonner';
import ConfirmModal from './ConfirmModal';
import Papa from 'papaparse';
import { FormModal } from './FormModal';
import { Info, Tag, DollarSign, AlertCircle, ShoppingCart, History, RotateCcw } from 'lucide-react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { QRScanner } from './QRScanner';
import { drawReportHeader } from '../lib/pdfUtils';
import { getBrandedCsvPreamble, escapeCsvCell } from '../lib/reportBranding';
import {
  adjustInventoryStock,
  createDeletedRecord,
  createInventoryTransaction,
  createPurchaseOrder,
  deleteDeletedRecord,
  deleteInventoryItem,
  deleteInventoryTransaction,
  listDeletedRecords,
  listInventory,
  listInventoryTransactions,
  syncInventoryFromBudget,
  updateInventoryItem,
  upsertInventoryItem,
} from '../lib/operationsApi';
import { listProjects, listProjectBudgetItemsDetailed, updateProjectBudgetItem } from '../lib/projectsApi';

export default function Inventory() {
  const [inventory, setInventory] = useState<any[]>([]);
  const [inventoryOffset, setInventoryOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [projects, setProjects] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [isSyncing, setIsSyncing] = useState(false);
  const [projectBudgetItems, setProjectBudgetItems] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'global' | 'projects'>('global');
  const [currentStep, setCurrentStep] = useState(0);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isGeneratingPO, setIsGeneratingPO] = useState(false);
  const [selectedItemDetails, setSelectedItemDetails] = useState<any>(null);
  const [itemTransactions, setItemTransactions] = useState<any[]>([]);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
  const [isPOModalOpen, setIsPOModalOpen] = useState(false);
  const [isShortageModalOpen, setIsShortageModalOpen] = useState(false);
  const [shortageItems, setShortageItems] = useState<any[]>([]);
  const [isOptimizationModalOpen, setIsOptimizationModalOpen] = useState(false);
  const [optimizationResults, setOptimizationResults] = useState<any>(null);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [isGeneratingPOs, setIsGeneratingPOs] = useState(false);
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const lowStockAlertCacheRef = React.useRef<Record<string, number>>({});

  useEffect(() => {
    if (selectedItemDetails) {
      listInventoryTransactions({ materialId: selectedItemDetails.id, limit: 200 })
        .then(setItemTransactions)
        .catch((error) => handleApiError(error, OperationType.GET, 'inventoryTransactions'));
    }
  }, [selectedItemDetails]);

  const handleScanResult = (decodedText: string) => {
    setIsScannerOpen(false);
    try {
      const data = JSON.parse(decodedText);
      if (data.id) {
        const item = inventory.find(i => i.id === data.id);
        if (item) {
          setSelectedItemForBatch(item);
          setIsBatchModalOpen(true);
          toast.success(`Material identificado: ${item.name}`);
        } else {
          toast.error('Material no encontrado en el inventario local.');
        }
      }
    } catch (error) {
      console.error('Error parsing scan result:', error);
      toast.error('Código QR no válido para el sistema de inventario.');
    }
  };
  const [selectedItemForPO, setSelectedItemForPO] = useState<any>(null);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<string | null>(null);
  const [poData, setPoData] = useState({
    quantity: 0,
    supplier: '',
    notes: ''
  });
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(12);
  const [searchTerm, setSearchTerm] = useState('');
  const deferredSearchTerm = useDeferredValue(searchTerm);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [filterType, setFilterType] = useState<'all' | 'critical' | 'expiring'>('all');
  const [editingMaterialId, setEditingMaterialId] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});

  const [isBatchModalOpen, setIsBatchModalOpen] = useState(false);
  const [selectedItemForBatch, setSelectedItemForBatch] = useState<any>(null);
  const [isCSVResultModalOpen, setIsCSVResultModalOpen] = useState(false);
  const [isBatchDeleteConfirmOpen, setIsBatchDeleteConfirmOpen] = useState(false);
  const [isTransactionDeleteConfirmOpen, setIsTransactionDeleteConfirmOpen] = useState(false);
  const [itemToDeleteBatch, setItemToDeleteBatch] = useState<{materialId: string, batchId: string} | null>(null);
  const [itemToDeleteTransaction, setItemToDeleteTransaction] = useState<string | null>(null);

  const [isTrashModalOpen, setIsTrashModalOpen] = useState(false);
  const [deletedRecords, setDeletedRecords] = useState<any[]>([]);

  const loadInventoryPage = React.useCallback(async (reset = false, offsetOverride?: number) => {
    const nextOffset = reset ? 0 : (offsetOverride ?? 0);
    const response = await listInventory({
      projectId: selectedProjectId || undefined,
      limit: 50,
      offset: nextOffset,
    });

    setInventory((prev) => (reset ? response.items : [...prev, ...response.items]));
    setInventoryOffset(reset ? response.items.length : nextOffset + response.items.length);
    setHasMore(response.hasMore);

    response.items.forEach((item: any) => {
      if (item.stock <= item.minStock) {
        const stockSignature = Number(item.stock || 0);
        if (lowStockAlertCacheRef.current[item.id] === stockSignature) {
          return;
        }

        lowStockAlertCacheRef.current[item.id] = stockSignature;
        sendNotification(
          'Alerta de Stock Bajo',
          `El material ${item.name} tiene solo ${item.stock} ${item.unit} en existencia.`,
          'inventory'
        );
      }
    });
  }, [selectedProjectId]);

  const loadDeletedRecords = React.useCallback(async () => {
    try {
      const items = await listDeletedRecords();
      setDeletedRecords(items);
    } catch (error) {
      handleApiError(error, OperationType.GET, 'deletedRecords');
    }
  }, []);

  useEffect(() => {
    loadDeletedRecords();
  }, [loadDeletedRecords]);

  const [reorderList, setReorderList] = useState<string[]>([]);

  const toggleReorderItem = (materialId: string) => {
    setReorderList(prev => 
      prev.includes(materialId) 
        ? prev.filter(id => id !== materialId) 
        : [...prev, materialId]
    );
  };

  const generateReorderPOs = async () => {
    const itemsToReorder = inventory.filter(item => reorderList.includes(item.id));
    
    if (itemsToReorder.length === 0) {
      toast.info('No hay materiales marcados para reordenar.');
      return;
    }

    toast.loading(`Generando ${itemsToReorder.length} órdenes de compra...`, { id: 'reorder-po' });

    let successCount = 0;
    for (const item of itemsToReorder) {
      try {
        const quantityToOrder = Math.max(item.minStock * 2, (item.minStock * 2) - item.stock);
        const supplier = (item.suppliers && item.suppliers.length > 0) ? item.suppliers[0] : 'Proveedor por definir';
        
        await createPurchaseOrder({
          projectId: selectedProjectId || '',
          budgetItemId: '',
          materialId: item.id,
          materialName: item.name,
          quantity: quantityToOrder,
          unit: item.unit,
          estimatedCost: quantityToOrder * item.unitPrice,
          supplier: supplier,
          notes: 'Generado manualmente desde lista de reordenamiento',
          status: 'Pending',
          date: new Date().toISOString().split('T')[0],
        });

        // Deduct from stock as requested by user
        await adjustInventoryStock(item.id, { delta: -quantityToOrder });

        successCount++;
      } catch (error) {
        console.error(`Error generating PO for ${item.name}:`, error);
      }
    }

    toast.dismiss('reorder-po');
    if (successCount > 0) {
      setReorderList([]);
      toast.success(`${successCount} órdenes de compra generadas exitosamente.`);
      await logAction('Generación de POs Reorden', 'Inventario', `Se generaron ${successCount} órdenes de compra desde la lista de reordenamiento`, 'create');
    } else {
      toast.error('No se pudieron generar las órdenes de compra.');
    }
  };

  const [editingBatchId, setEditingBatchId] = useState<string | null>(null);

  const getCategoryIcon = (category: string) => {
    const cat = category.toLowerCase();
    if (cat.includes('material') || cat.includes('cemento') || cat.includes('arena')) return <Layers size={16} />;
    if (cat.includes('herramienta') || cat.includes('pala') || cat.includes('martillo')) return <Wrench size={16} />;
    if (cat.includes('epp') || cat.includes('seguridad') || cat.includes('casco')) return <HardHat size={16} />;
    if (cat.includes('eléctrico') || cat.includes('cable')) return <Wifi size={16} />;
    if (cat.includes('tubería') || cat.includes('pvc')) return <Construction size={16} />;
    if (cat.includes('pintura') || cat.includes('acabado')) return <ShoppingBag size={16} />;
    return <Package size={16} />;
  };

  const [csvImportResults, setCsvImportResults] = useState<{
    success: number;
    errors: { row: number; error: string; data?: any }[];
    total: number;
  }>({ success: 0, errors: [], total: 0 });
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const handleDownloadTemplate = () => {
    const headers = ['Nombre', 'Categoría', 'Unidad', 'Precio Unitario', 'Stock Inicial', 'Stock Mínimo'];
    const examples = [
      ['Cemento Portland', 'Materiales', 'Bolsa', '85.50', '100', '20'],
      ['Varilla 3/8"', 'Materiales', 'Unidad', '42.00', '500', '50'],
      ['Pala Punta Redonda', 'Herramientas', 'Unidad', '120.00', '10', '2'],
      ['Casco de Seguridad', 'EPP', 'Unidad', '65.00', '25', '5']
    ];

    const csvContent = [
      ...getBrandedCsvPreamble('Plantilla de Inventario'),
      headers.map(escapeCsvCell).join(','),
      ...examples.map((row) => row.map(escapeCsvCell).join(',')),
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', 'plantilla_inventario_wm.csv');
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('Plantilla descargada con éxito');
  };

  const handleCSVImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        const data = results.data as any[];
        let successCount = 0;
        const errorList: { row: number; error: string; data?: any }[] = [];

        toast.loading('Importando materiales...', { id: 'csv-import' });

        for (let i = 0; i < data.length; i++) {
          const row = data[i];
          const rowNum = i + 2; // +1 for header, +1 for 0-indexing

          try {
            // Validation
            const name = row['Nombre'] || row['name'];
            const category = row['Categoría'] || row['category'];
            const unit = row['Unidad'] || row['unit'];
            const unitPrice = Number(row['Precio Unitario'] || row['unitPrice']);
            const stock = Number(row['Stock Inicial'] || row['stock'] || 0);
            const minStock = Number(row['Stock Mínimo'] || row['minStock'] || 0);

            if (!name) throw new Error('El nombre es obligatorio');
            if (!category) throw new Error('La categoría es obligatoria');
            if (!unit) throw new Error('La unidad es obligatoria');
            if (isNaN(unitPrice) || unitPrice <= 0) throw new Error('El precio unitario debe ser un número mayor a cero');
            if (isNaN(stock) || stock < 0) throw new Error('El stock inicial debe ser un número no negativo');
            if (isNaN(minStock) || minStock < 0) throw new Error('El stock mínimo debe ser un número no negativo');

            await upsertInventoryItem({
              name,
              category,
              unit,
              unitPrice,
              stock,
              minStock,
              projectId: selectedProjectId || '',
              suppliers: [],
              batches: [],
            });
            successCount++;
          } catch (error: any) {
            errorList.push({
              row: rowNum,
              error: error.message,
              data: row
            });
          }
        }

        setCsvImportResults({
          success: successCount,
          errors: errorList,
          total: data.length
        });
        setIsCSVResultModalOpen(true);
        toast.dismiss('csv-import');
        
        if (errorList.length === 0) {
          toast.success(`Importación completada: ${successCount} materiales procesados.`);
          await logAction('Importación CSV', 'Inventario', `Se importaron ${successCount} materiales correctamente desde CSV`, 'create');
        } else {
          toast.warning(`Importación finalizada con ${errorList.length} errores.`);
          await logAction('Importación CSV Parcial', 'Inventario', `Se importaron ${successCount} materiales con ${errorList.length} errores desde CSV`, 'create');
        }
        
        // Reset file input
        if (fileInputRef.current) fileInputRef.current.value = '';
      },
      error: (error) => {
        toast.error(`Error al procesar el archivo CSV: ${error.message}`);
      }
    });
  };

  const generateInventoryReport = () => {
    const doc = new jsPDF();
    const date = new Date().toLocaleDateString();
    
    drawReportHeader(doc, 'REPORTE DE INVENTARIO POR CATEGORIA', {
      dateText: `Fecha: ${date}`,
    });

    // Grouping logic by Category
    const categoryGroups: { [key: string]: any[] } = {};
    const lowStockItems: any[] = [];
    
    inventory.forEach(item => {
      const category = item.category || 'Sin Categoría';
      if (!categoryGroups[category]) categoryGroups[category] = [];
      
      const totalValue = item.stock * item.unitPrice;
      categoryGroups[category].push({
        name: item.name,
        unit: item.unit,
        stock: item.stock,
        unitPrice: item.unitPrice,
        totalValue: totalValue,
        minStock: item.minStock
      });

      if (item.stock <= item.minStock) {
        lowStockItems.push({
          name: item.name,
          stock: item.stock,
          minStock: item.minStock,
          missing: Math.max(0, item.minStock - item.stock)
        });
      }
    });

    let currentY = 50;

    // Render Categories
    Object.keys(categoryGroups).sort().forEach(category => {
      const items = categoryGroups[category];
      const categoryTotal = items.reduce((sum, item) => sum + item.totalValue, 0);

      doc.setFontSize(14);
      doc.setTextColor(242, 125, 38); // Primary color
      doc.text(`Categoría: ${category}`, 14, currentY);
      doc.setTextColor(0, 0, 0);
      
      autoTable(doc, {
        startY: currentY + 5,
        head: [['Material', 'Unidad', 'Stock', 'Costo Unit.', 'Valor Total']],
        body: items.map(i => [
          i.name,
          i.unit,
          i.stock.toString(),
          formatCurrency(i.unitPrice),
          formatCurrency(i.totalValue)
        ]),
        foot: [[
          { content: 'Total Categoría:', colSpan: 4, styles: { halign: 'right', fontStyle: 'bold' } },
          { content: formatCurrency(categoryTotal), styles: { fontStyle: 'bold' } }
        ]],
        theme: 'striped',
        headStyles: { fillColor: [20, 20, 20] },
        margin: { left: 14, right: 14 }
      });

      currentY = (doc as any).lastAutoTable.finalY + 15;
      
      if (currentY > 250) {
        doc.addPage();
        currentY = 20;
      }
    });

    // Low Stock Alerts Section
    if (lowStockItems.length > 0) {
      if (currentY > 220) {
        doc.addPage();
        currentY = 20;
      }

      doc.setFontSize(16);
      doc.setTextColor(220, 38, 38); // Rose-600
      doc.text('ALERTAS DE STOCK BAJO', 14, currentY);
      doc.setTextColor(0, 0, 0);

      autoTable(doc, {
        startY: currentY + 5,
        head: [['Material', 'Stock Actual', 'Stock Mínimo', 'Faltante']],
        body: lowStockItems.map(i => [
          i.name,
          i.stock.toString(),
          i.minStock.toString(),
          i.missing.toString()
        ]),
        theme: 'grid',
        headStyles: { fillColor: [220, 38, 38] },
        margin: { left: 14, right: 14 }
      });
    }

    doc.save(`reporte_inventario_${new Date().getTime()}.pdf`);
    toast.success('Reporte de inventario generado con éxito');
    logAction('Generación de Reporte', 'Inventario', 'Se generó un reporte de inventario en PDF', 'read');
  };

  const generateCriticalPurchaseOrders = async () => {
    const criticalItems = inventory.filter(item => item.stock < item.minStock);
    
    if (criticalItems.length === 0) {
      toast.info('No hay materiales con stock crítico.');
      return;
    }

    toast.loading(`Generando ${criticalItems.length} órdenes de compra...`, { id: 'critical-po' });

    let successCount = 0;
    for (const item of criticalItems) {
      try {
        const quantityToOrder = (item.minStock * 2) - item.stock;
        const supplier = (item.suppliers && item.suppliers.length > 0) ? item.suppliers[0] : 'Proveedor por definir';
        
        await createPurchaseOrder({
          projectId: selectedProjectId || '',
          budgetItemId: '',
          materialId: item.id,
          materialName: item.name,
          quantity: quantityToOrder,
          unit: item.unit,
          estimatedCost: quantityToOrder * item.unitPrice,
          supplier: supplier,
          notes: 'Generado automáticamente por stock crítico (Reponer a 2x Stock Mínimo)',
          status: 'Pending',
          date: new Date().toISOString().split('T')[0],
        });

        // Deduct from stock as requested by user
        await adjustInventoryStock(item.id, { delta: -quantityToOrder });

        successCount++;
      } catch (error) {
        console.error(`Error generating PO for ${item.name}:`, error);
      }
    }

    toast.dismiss('critical-po');
    if (successCount > 0) {
      toast.success(`${successCount} órdenes de compra generadas exitosamente.`);
      await logAction('Generación de POs Críticas', 'Inventario', `Se generaron ${successCount} órdenes de compra automáticas por stock crítico`, 'create');
    } else {
      toast.error('No se pudieron generar las órdenes de compra.');
    }
  };
  const [newBatch, setNewBatch] = useState({
    quantity: 0,
    batchNumber: '',
    expirationDate: '',
    manufacturingDate: '',
    location: '',
    type: 'In' as 'In' | 'Out',
    projectId: '',
    reason: '',
    materialId: '',
    price: 0,
    supplier: ''
  });

  const validateField = (name: string, value: any) => {
    let error = '';
    if (!value && value !== 0) {
      error = 'Este campo es obligatorio';
    } else if (name === 'unitPrice' && Number(value) <= 0) {
      error = 'El precio debe ser mayor a cero';
    } else if ((name === 'stock' || name === 'minStock') && Number(value) < 0) {
      error = 'El valor no puede ser negativo';
    }
    setValidationErrors(prev => ({ ...prev, [name]: error }));
    return !error;
  };

  const [newMaterial, setNewMaterial] = useState({
    name: '',
    unit: '',
    category: '',
    stock: 0,
    minStock: 0,
    unitPrice: 0,
    suppliers: [] as string[],
    batches: [] as any[]
  });

  const handleAISuggestions = async () => {
    if (!newMaterial.name) {
      toast.error('Por favor ingrese un nombre para el material antes de sugerir');
      return;
    }

    setIsGenerating(true);
    try {
      const ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_GEMINI_API_KEY });
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: `Como experto en materiales de construcción, sugiere una descripción técnica breve y un stock mínimo recomendado para un material llamado "${newMaterial.name}" de la categoría "${newMaterial.category}". Proporciona la respuesta en español.`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              description: {
                type: Type.STRING,
                description: "Descripción técnica breve."
              },
              recommendedMinStock: {
                type: Type.NUMBER,
                description: "Stock mínimo recomendado."
              }
            },
            required: ["description", "recommendedMinStock"]
          }
        }
      });

      const suggestions = JSON.parse(response.text);
      toast.success('Sugerencias generadas con éxito');
      if (suggestions.description) {
        toast.info(`Descripción sugerida: ${suggestions.description}`, { duration: 6000 });
      }
      if (suggestions.recommendedMinStock) {
        setNewMaterial(prev => ({ ...prev, minStock: suggestions.recommendedMinStock }));
      }
    } catch (error) {
      const aiError = parseAIClientError(error);
      console.error('Error generating AI suggestions:', aiError.technicalMessage, error);
      toast.error(aiError.userMessage);
    } finally {
      setIsGenerating(false);
    }
  };

  const handlePOAISuggestions = async () => {
    if (!selectedItemForPO) return;

    setIsGeneratingPO(true);
    try {
      const ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_GEMINI_API_KEY });
      
      // Get historical consumption (simulated or from inventoryTransactions)
      const history = await listInventoryTransactions({
        materialId: selectedItemForPO.id,
        type: 'Out',
        limit: 50,
      });
      
      const activeProjects = projects.filter(p => p.status === 'In Progress');
      
      const priceHistory = selectedItemForPO.priceHistory || [];
      const bestSupplier = priceHistory.length > 0 
        ? priceHistory.reduce((prev: any, curr: any) => prev.price < curr.price ? prev : curr)
        : null;

      const prompt = `
        Analiza la necesidad de reabastecimiento para el material: "${selectedItemForPO.name}".
        Stock Actual: ${selectedItemForPO.stock} ${selectedItemForPO.unit}.
        Stock Mínimo: ${selectedItemForPO.minStock} ${selectedItemForPO.unit}.
        Historial de consumo reciente: ${JSON.stringify(history.slice(0, 10))}.
        Proyectos activos: ${JSON.stringify(activeProjects.map(p => ({ name: p.name, typology: p.typology }))) }.
        Historial de precios: ${JSON.stringify(priceHistory)}.
        Mejor proveedor histórico: ${bestSupplier ? `${bestSupplier.supplier} a ${formatCurrency(bestSupplier.price)}` : 'Ninguno'}.
        
        Sugiere la cantidad óptima de reordenamiento para cubrir los próximos 30 días basándote en el historial y los proyectos activos.
        También sugiere el mejor proveedor basado en el historial de precios si existe.
        Responde en formato JSON.
      `;

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              suggestedQuantity: {
                type: Type.NUMBER,
                description: "Cantidad sugerida para reordenar."
              },
              suggestedSupplier: {
                type: Type.STRING,
                description: "Nombre del proveedor sugerido."
              },
              reasoning: {
                type: Type.STRING,
                description: "Breve explicación de la sugerencia."
              }
            },
            required: ["suggestedQuantity", "reasoning"]
          }
        }
      });

      const suggestions = JSON.parse(response.text);
      setPoData(prev => ({ 
        ...prev, 
        quantity: suggestions.suggestedQuantity,
        supplier: suggestions.suggestedSupplier || prev.supplier
      }));
      toast.success('Sugerencia de IA generada');
      toast.info(`Razón: ${suggestions.reasoning}`, { duration: 8000 });
    } catch (error) {
      const aiError = parseAIClientError(error);
      console.error('Error generating PO AI suggestions:', aiError.technicalMessage, error);
      toast.error(aiError.userMessage);
    } finally {
      setIsGeneratingPO(false);
    }
  };

  useEffect(() => {
    setInventoryOffset(0);
    setHasMore(true);
    lowStockAlertCacheRef.current = {};

    loadInventoryPage(true, 0).catch((error) => {
      console.error('Error loading inventory from API:', error);
      toast.error('No se pudo cargar inventario desde SQL');
    });
  }, [selectedProjectId, loadInventoryPage]);

  useEffect(() => {
    listProjects()
      .then(setProjects)
      .catch((error) => {
        console.error('Error loading projects from API:', error);
      });
  }, []);

  useEffect(() => {
    const supplierNames = Array.from(
      new Set(
        inventory.flatMap((item: any) => (Array.isArray(item.suppliers) ? item.suppliers : []))
      )
    ).filter(Boolean);

    setSuppliers(
      supplierNames.map((name: string) => ({
        id: name,
        name,
        category: 'General',
        status: 'Active',
      }))
    );
  }, [inventory]);

  const incrementBudgetItemUsedQuantity = async (projectId: string, materialName: string, quantity: number) => {
    if (!projectId || quantity <= 0) return;

    try {
      const budgetItems = await listProjectBudgetItemsDetailed(projectId);
      const targetItem = budgetItems.find((item: any) =>
        Array.isArray(item.materials) &&
        item.materials.some((m: any) => m.name?.toLowerCase() === materialName.toLowerCase())
      );

      if (!targetItem) return;

      const updatedMaterials = (targetItem.materials || []).map((m: any) => {
        if (m.name?.toLowerCase() === materialName.toLowerCase()) {
          return { ...m, usedQuantity: (m.usedQuantity || 0) + quantity };
        }
        return m;
      });

      await updateProjectBudgetItem(projectId, targetItem.id, { materials: updatedMaterials });
    } catch (error) {
      console.error('Error updating budget material used quantity:', error);
    }
  };

  useEffect(() => {
    if (selectedProjectId) {
      syncProjectMaterials();
    }
  }, [selectedProjectId]);

  const syncProjectMaterials = async () => {
    if (!selectedProjectId) return;
    
    setIsSyncing(true);
    try {
      const projectName = projects.find(p => p.id === selectedProjectId)?.name || 'Proyecto';
      const payload = syncableProjectMaterials.map((budgeted: any) => ({
        name: budgeted.name,
        unit: budgeted.unit,
        totalQuantity: budgeted.budgeted,
        unitPrice: budgeted.unitPrice || 0,
        category: 'Material de Obra',
      }));

      if (payload.length === 0) {
        toast.info('No hay materiales en el presupuesto para sincronizar al almacén.');
        return;
      }

      await syncInventoryFromBudget(
        selectedProjectId,
        payload
      );

      const addedCount = payload.length;
      await loadInventoryPage(true, 0);
      
      if (addedCount > 0) {
        toast.success(`${addedCount} materiales agregados desde el presupuesto.`);
        await logAction('Sincronización de Materiales', 'Inventario', `Se agregaron ${addedCount} materiales del presupuesto del proyecto ${projectName}`, 'create');
      } else {
        toast.success('Materiales sincronizados con el presupuesto.');
      }
    } catch (error) {
      console.error('Error syncing materials:', error);
      toast.error('Error al sincronizar materiales');
    } finally {
      setIsSyncing(false);
    }
  };

  const loadMoreInventory = async () => {
    if (!hasMore || isLoadingMore) return;
    setIsLoadingMore(true);
    try {
      await loadInventoryPage(false, inventoryOffset);
    } catch (error) {
      handleApiError(error, OperationType.GET, 'inventory');
    } finally {
      setIsLoadingMore(false);
    }
  };

  useEffect(() => {
    if (!selectedProjectId) {
      setProjectBudgetItems([]);
      return;
    }

    listProjectBudgetItemsDetailed(selectedProjectId)
      .then((items) => setProjectBudgetItems(items as any[]))
      .catch((error) => {
        console.error('Error loading project budget items from API:', error);
        setProjectBudgetItems([]);
      });
  }, [selectedProjectId]);

  const projectMaterialSummary = React.useMemo(() => {
    const summary: { [key: string]: any } = {};
    projectBudgetItems.forEach(item => {
      if (item.materials && item.quantity > 0) {
        item.materials.forEach((m: any) => {
          const key = m.name.toLowerCase();
          if (!summary[key]) {
            const globalItem = inventory.find(inv => inv.name.toLowerCase() === key);
            summary[key] = {
              name: m.name,
              unit: m.unit,
              budgeted: 0,
              purchased: 0,
              used: 0,
              globalStock: globalItem ? globalItem.stock : 0,
              unitPrice: globalItem ? globalItem.unitPrice : 0
            };
          }
          summary[key].budgeted += m.quantity * item.quantity;
          summary[key].purchased += (m.purchasedQuantity || 0);
          summary[key].used += (m.usedQuantity || 0);
        });
      }
    });
    return Object.values(summary).map((m: any) => {
      const pendingToPurchase = Math.max(0, m.budgeted - m.purchased);
      const shortage = Math.max(0, pendingToPurchase - m.globalStock);
      return {
        ...m,
        pendingToPurchase,
        shortage,
        riskLevel: shortage > 0 ? 'High' : (m.globalStock < m.budgeted ? 'Medium' : 'Low')
      };
    });
  }, [projectBudgetItems, inventory]);

  const syncableProjectMaterials = React.useMemo(() => {
    return projectMaterialSummary.filter((item: any) =>
      String(item?.name || '').trim().length > 0 && Number(item?.budgeted || 0) > 0
    );
  }, [projectMaterialSummary]);

  const openAddModal = () => {
    setEditingMaterialId(null);
    setNewMaterial({
      name: '',
      unit: '',
      unitPrice: 0,
      stock: 0,
      category: '',
      minStock: 0,
      suppliers: [],
      batches: []
    });
    setValidationErrors({});
    setCurrentStep(0);
    setIsModalOpen(true);
  };

  const openEditModal = (material: any) => {
    setEditingMaterialId(material.id);
    setNewMaterial({
      name: material.name,
      unit: material.unit,
      unitPrice: material.unitPrice,
      stock: material.stock,
      category: material.category,
      minStock: material.minStock,
      suppliers: material.suppliers || [],
      batches: material.batches || []
    });
    setValidationErrors({});
    setCurrentStep(0);
    setIsModalOpen(true);
  };

  const handleAddMaterial = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Final validation
    const errors: Record<string, string> = {};
    if (!newMaterial.name) errors.name = 'El nombre es obligatorio';
    if (!newMaterial.unit) errors.unit = 'La unidad es obligatoria';
    if (!newMaterial.category) errors.category = 'La categoría es obligatoria';
    if (Number(newMaterial.unitPrice) <= 0) errors.unitPrice = 'El precio debe ser mayor a cero';
    if (Number(newMaterial.stock) < 0) errors.stock = 'El stock no puede ser negativo';
    if (Number(newMaterial.minStock) < 0) errors.minStock = 'El stock mínimo no puede ser negativo';
    
    if (Object.keys(errors).length > 0) {
      setValidationErrors(errors);
      toast.error('Por favor, corrija los errores en el formulario');
      return;
    }

    try {
      if (editingMaterialId) {
        // Update existing material
        await updateInventoryItem(editingMaterialId, {
          ...newMaterial,
          stock: Number(newMaterial.stock),
          minStock: Number(newMaterial.minStock),
          unitPrice: Number(newMaterial.unitPrice),
          projectId: selectedProjectId || '',
        });
        toast.success('Material actualizado exitosamente');
        await logAction('Edición de Material', 'Inventario', `Material ${newMaterial.name} actualizado`, 'update', { materialId: editingMaterialId });
      } else {
        const saved = await upsertInventoryItem({
          ...newMaterial,
          stock: Number(newMaterial.stock),
          minStock: Number(newMaterial.minStock),
          unitPrice: Number(newMaterial.unitPrice),
          projectId: selectedProjectId || '',
        });
        toast.success('Material agregado exitosamente');
        await logAction('Registro de Material', 'Inventario', `Nuevo material ${newMaterial.name} registrado`, 'create', { materialId: saved.id });
      }

      await loadInventoryPage(true, 0);
      
      setIsModalOpen(false);
      setEditingMaterialId(null);
      setNewMaterial({ 
        name: '', 
        unit: '', 
        category: '', 
        stock: 0, 
        minStock: 0, 
        unitPrice: 0,
        suppliers: [],
        batches: []
      });
      setValidationErrors({});
    } catch (error) {
      handleApiError(error, OperationType.WRITE, 'inventory');
    }
  };

  const handleDeleteMaterial = (id: string) => {
    setItemToDelete(id);
    setIsDeleteConfirmOpen(true);
  };

  const confirmDeleteMaterial = async () => {
    if (!itemToDelete) return;
    try {
      const materialToDelete = inventory.find(i => i.id === itemToDelete);
      if (materialToDelete) {
        await createDeletedRecord({
          type: 'material',
          originalId: itemToDelete,
          data: materialToDelete,
          reason: 'Eliminación de material completo'
        });
      }
      await deleteInventoryItem(itemToDelete);
      await loadInventoryPage(true, 0);
      await loadDeletedRecords();
      setItemToDelete(null);
      toast.success('Material movido a la papelera');
      await logAction('Eliminación de Material', 'Inventario', `Material ${materialToDelete?.name || itemToDelete} eliminado`, 'delete', { materialId: itemToDelete });
    } catch (error) {
      handleApiError(error, OperationType.DELETE, `inventory/${itemToDelete}`);
    }
  };

  const handleCreatePurchaseOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedItemForPO) return;

    try {
      const poQuantity = Number(poData.quantity);
      await createPurchaseOrder({
        projectId: selectedProjectId || '',
        materialId: selectedItemForPO.id,
        materialName: selectedItemForPO.name,
        quantity: poQuantity,
        unit: selectedItemForPO.unit,
        estimatedCost: poQuantity * selectedItemForPO.unitPrice,
        supplier: poData.supplier,
        notes: poData.notes,
        status: 'Pending',
        date: new Date().toISOString().split('T')[0],
      });

      // Deduct from stock as requested by user (Stock represents remaining requirement)
      await adjustInventoryStock(selectedItemForPO.id, { delta: -poQuantity });

      await createInventoryTransaction({
        materialId: selectedItemForPO.id,
        materialName: selectedItemForPO.name,
        type: 'Out',
        quantity: poQuantity,
        previousStock: selectedItemForPO.stock,
        newStock: Math.max(0, (selectedItemForPO.stock || 0) - poQuantity),
        reason: `Generación de orden de compra - ${poData.notes || 'Reposición automática'}`,
        projectId: selectedProjectId || null,
      });

      setIsPOModalOpen(false);
      setSelectedItemForPO(null);
      setPoData({ quantity: 0, supplier: '', notes: '' });
      toast.success(`Orden de compra generada y descontada del stock de requerimientos.`);
      await logAction('Creación de Orden de Compra', 'Inventario', `Orden de compra para ${selectedItemForPO.name} (${poQuantity} ${selectedItemForPO.unit})`, 'create', { materialId: selectedItemForPO.id });
    } catch (error) {
      handleApiError(error, OperationType.WRITE, 'purchaseOrders');
    }
  };

  const openPOModal = (item: any) => {
    setSelectedItemForPO(item);
    setPoData({
      quantity: Math.max(item.minStock * 2 - item.stock, 10),
      supplier: '',
      notes: `Reposición automática por stock bajo (Actual: ${item.stock} ${item.unit})`
    });
    setIsPOModalOpen(true);
  };

  const handleUpdateStock = async (id: string, amount: number, type: 'In' | 'Out' = 'In', reason: string = 'Ajuste manual', projectId?: string) => {
    const material = inventory.find(i => i.id === id);
    if (material) {
      try {
        const newStock = Math.max(0, material.stock + amount);
        await adjustInventoryStock(id, { delta: amount });

        // Record transaction
        await createInventoryTransaction({
          materialId: id,
          materialName: material.name,
          type: amount > 0 ? 'In' : 'Out',
          quantity: Math.abs(amount),
          previousStock: material.stock,
          newStock: newStock,
          reason: reason,
          projectId: projectId || null,
        });

        if (type === 'Out' && projectId) {
          await incrementBudgetItemUsedQuantity(projectId, material.name, Math.abs(amount));
        }

        await loadInventoryPage(true, 0);
        toast.success(`Stock actualizado: ${material.name}`);
      } catch (error) {
        handleApiError(error, OperationType.UPDATE, `inventory/${id}`);
      }
    }
  };

  const runInventoryOptimization = async () => {
    setIsOptimizing(true);
    setIsOptimizationModalOpen(true);
    setOptimizationResults(null);

    try {
      const ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_GEMINI_API_KEY });
      
      // Prepare data for AI
      const inventoryData = inventory.map(item => ({
        name: item.name,
        category: item.category,
        stock: item.stock,
        minStock: item.minStock,
        unit: item.unit,
        unitPrice: item.unitPrice,
        batches: item.batches?.map(b => ({
          batchNumber: b.batchNumber,
          quantity: b.quantity,
          expirationDate: b.expirationDate,
          location: b.location
        })) || []
      }));

      const projectRequirements = projects.map(p => ({
        name: p.name,
        status: p.status,
        progress: p.physicalProgress
      }));

      const prompt = `Como experto en logística y gestión de inventarios para construcción, analiza los siguientes datos de inventario (incluyendo lotes y fechas de caducidad) y proyectos activos.
      
      Inventario Actual: ${JSON.stringify(inventoryData)}
      Proyectos Activos: ${JSON.stringify(projectRequirements)}
      
      Identifica:
      1. Materiales con riesgo de desabastecimiento inminente basado en proyectos activos para los próximos 30 días.
      2. Materiales con sobre-stock (capital inmovilizado) que no tienen demanda proyectada.
      3. Materiales próximos a caducar (analiza las fechas de caducidad de los lotes).
      4. Sugerencias de reordenamiento y optimización de compras (cantidades exactas sugeridas).
      5. Predicción detallada de necesidades de materiales para el próximo mes.
      
      Proporciona un resumen ejecutivo y recomendaciones accionables en español.`;

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              executiveSummary: { type: Type.STRING },
              criticalShortages: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    material: { type: Type.STRING },
                    reason: { type: Type.STRING },
                    action: { type: Type.STRING }
                  },
                  required: ["material", "reason", "action"]
                }
              },
              overstockItems: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    material: { type: Type.STRING },
                    value: { type: Type.NUMBER },
                    suggestion: { type: Type.STRING }
                  },
                  required: ["material", "value", "suggestion"]
                }
              },
              recommendations: {
                type: Type.ARRAY,
                items: { type: Type.STRING }
              }
            },
            required: ["executiveSummary", "criticalShortages", "overstockItems", "recommendations"]
          }
        }
      });

      const results = JSON.parse(response.text);
      setOptimizationResults(results);
      toast.success('Optimización de inventario completada');
    } catch (error) {
      const aiError = parseAIClientError(error);
      console.error('Error in inventory optimization:', aiError.technicalMessage, error);
      toast.error(aiError.userMessage);
      setIsOptimizationModalOpen(false);
    } finally {
      setIsOptimizing(false);
    }
  };

  const generateAISuggestedPOs = async () => {
    if (!optimizationResults?.criticalShortages || optimizationResults.criticalShortages.length === 0) {
      toast.error('No hay sugerencias críticas para generar órdenes');
      return;
    }

    setIsGeneratingPOs(true);
    try {
      const ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_GEMINI_API_KEY });
      
      const prompt = `Basado en estos resultados de optimización de inventario:
      ${JSON.stringify(optimizationResults)}
      
      Y estos proveedores disponibles:
      ${JSON.stringify(suppliers.map(s => ({ id: s.id, name: s.name, category: s.category })))}
      
      Genera una lista de Órdenes de Compra (PO) sugeridas. Para cada PO, incluye:
      - materialId (busca el nombre del material en el inventario actual: ${JSON.stringify(inventory.map(i => ({ id: i.id, name: i.name })))})
      - supplierId (selecciona el mejor proveedor frecuente o adecuado de la lista)
      - quantity (cantidad sugerida para cubrir los próximos 30 días)
      - estimatedUnitCost (basado en historial si existe o estimado)
      - priority (Alta, Media, Baja)
      
      Responde estrictamente en formato JSON.`;

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              suggestedPOs: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    materialId: { type: Type.STRING },
                    materialName: { type: Type.STRING },
                    supplierId: { type: Type.STRING },
                    supplierName: { type: Type.STRING },
                    quantity: { type: Type.NUMBER },
                    estimatedUnitCost: { type: Type.NUMBER },
                    priority: { type: Type.STRING, enum: ["Alta", "Media", "Baja"] }
                  },
                  required: ["materialId", "materialName", "supplierId", "supplierName", "quantity", "estimatedUnitCost", "priority"]
                }
              }
            },
            required: ["suggestedPOs"]
          }
        }
      });

      const { suggestedPOs } = JSON.parse(response.text);
      
      // Create pending POs in SQL
      for (const po of suggestedPOs) {
        await createPurchaseOrder({
          projectId: selectedProjectId || '',
          materialId: po.materialId,
          materialName: po.materialName,
          quantity: po.quantity,
          estimatedCost: po.quantity * po.estimatedUnitCost,
          supplier: po.supplierName,
          notes: `PO sugerida por IA (${po.priority})`,
          status: 'Pending',
          date: new Date().toISOString().split('T')[0],
        });

        // Deduct from stock as requested by user
        if (po.materialId) {
          const material = inventory.find(i => i.id === po.materialId);
          if (material) {
            await adjustInventoryStock(po.materialId, { delta: -po.quantity });
          }
        }
      }

      toast.success(`${suggestedPOs.length} Órdenes de compra sugeridas generadas como pendientes`);
      setIsOptimizationModalOpen(false);
      await logAction('Generación de POs IA', 'Inventario', `Se generaron ${suggestedPOs.length} órdenes de compra sugeridas por IA`, 'create');
    } catch (error) {
      const aiError = parseAIClientError(error);
      console.error('Error generating AI POs:', aiError.technicalMessage, error);
      toast.error(aiError.userMessage);
    } finally {
      setIsGeneratingPOs(false);
    }
  };

  const handleAddBatch = async (e: React.FormEvent) => {
    e.preventDefault();
    const materialId = selectedItemForBatch?.id || newBatch.materialId;
    if (!materialId) {
      toast.error('Por favor seleccione un material');
      return;
    }

    try {
      const material = inventory.find(i => i.id === materialId);
      if (!material) return;

      let batches = [...(material.batches || [])];
      const quantity = Number(newBatch.quantity);
      let newStock = material.stock;
      
      if (editingBatchId) {
        const batchIndex = batches.findIndex(b => b.id === editingBatchId);
        if (batchIndex !== -1) {
          const oldBatch = batches[batchIndex];
          const diff = quantity - oldBatch.quantity;
          newStock += diff;
          batches[batchIndex] = {
            ...oldBatch,
            batchNumber: newBatch.batchNumber,
            quantity: quantity,
            expirationDate: newBatch.expirationDate,
            manufacturingDate: newBatch.manufacturingDate,
            location: newBatch.location,
            projectId: newBatch.projectId || null
          };
        }
      } else {
        if (newBatch.type === 'In') {
          batches.push({
            id: Math.random().toString(36).substr(2, 9),
            batchNumber: newBatch.batchNumber,
            quantity,
            expirationDate: newBatch.expirationDate,
            manufacturingDate: newBatch.manufacturingDate,
            location: newBatch.location,
            projectId: newBatch.projectId || null,
            createdAt: new Date().toISOString()
          });
          newStock += quantity;
        } else {
          // Simple FIFO for exit
          let remainingToSubtract = quantity;
          for (let i = 0; i < batches.length && remainingToSubtract > 0; i++) {
            if (batches[i].quantity >= remainingToSubtract) {
              batches[i].quantity -= remainingToSubtract;
              remainingToSubtract = 0;
            } else {
              remainingToSubtract -= batches[i].quantity;
              batches[i].quantity = 0;
            }
          }
          newStock = Math.max(0, newStock - quantity);
        }
      }

      const updateData: any = {
        stock: newStock,
        batches: batches.filter(b => b.quantity > 0),
      };

      if (!editingBatchId && newBatch.type === 'In' && newBatch.price > 0) {
        const history = material.priceHistory || [];
        history.push({
          supplier: newBatch.supplier || 'Desconocido',
          price: newBatch.price,
          date: new Date().toISOString()
        });
        updateData.priceHistory = history;
        updateData.unitPrice = newBatch.price;
      }

      await updateInventoryItem(material.id, updateData);

      await logAction(
        editingBatchId ? 'Edición de Lote' : 'Registro de Lote',
        'Inventario',
        `${editingBatchId ? 'Lote actualizado' : 'Nuevo lote'} para ${material.name} - Cantidad: ${quantity}`,
        editingBatchId ? 'update' : 'create',
        { materialId: material.id, batchNumber: newBatch.batchNumber }
      );

      // Record transaction
      const reason = newBatch.reason || (editingBatchId ? `Edición de lote ${newBatch.batchNumber ? `(${newBatch.batchNumber})` : ''}` : (newBatch.type === 'In' ? `Entrada de lote ${newBatch.batchNumber ? `(${newBatch.batchNumber})` : ''} - Ubicación: ${newBatch.location}` : `Salida de lote`));
      await createInventoryTransaction({
        materialId: material.id,
        materialName: material.name,
        type: editingBatchId ? 'Adjustment' : newBatch.type,
        quantity: quantity,
        batchNumber: newBatch.batchNumber || null,
        previousStock: material.stock,
        newStock: newStock,
        reason: reason,
        projectId: newBatch.projectId || null,
      });

      if (!editingBatchId && newBatch.type === 'Out' && newBatch.projectId) {
        await incrementBudgetItemUsedQuantity(newBatch.projectId, material.name, quantity);
      }

      setIsBatchModalOpen(false);
      setSelectedItemForBatch(null);
      setEditingBatchId(null);
      setNewBatch({ quantity: 0, batchNumber: '', expirationDate: '', manufacturingDate: '', location: '', type: 'In', projectId: '', reason: '', materialId: '', price: 0, supplier: '' });
      toast.success(editingBatchId ? 'Lote actualizado exitosamente' : 'Lote registrado exitosamente');
    } catch (error) {
      handleApiError(error, OperationType.UPDATE, `inventory/${materialId}`);
    }
  };

  const handleDeleteBatch = async () => {
    if (!itemToDeleteBatch) return;
    const { materialId, batchId } = itemToDeleteBatch;

    try {
      const materialDoc = inventory.find(i => i.id === materialId);
      if (!materialDoc) return;

      const batchToDelete = materialDoc.batches.find((b: any) => b.id === batchId);
      if (!batchToDelete) return;

      // Save to deletedRecords
      await createDeletedRecord({
        type: 'batch',
        materialId,
        materialName: materialDoc.name,
        batchId,
        data: batchToDelete,
        reason: `Eliminación de lote: ${batchToDelete.batchNumber || batchId}`
      });

      const newBatches = materialDoc.batches.filter((b: any) => b.id !== batchId);
      const newStock = Math.max(0, materialDoc.stock - batchToDelete.quantity);

      await updateInventoryItem(materialId, {
        batches: newBatches,
        stock: newStock,
      });

      await logAction(
        'Eliminación de Lote',
        'Inventario',
        `Lote ${batchToDelete.batchNumber || batchId} de ${materialDoc.name} eliminado`,
        'delete',
        { materialId, batchId }
      );

      // Record transaction for deletion
      await createInventoryTransaction({
        materialId,
        materialName: materialDoc.name,
        type: 'Out',
        quantity: batchToDelete.quantity,
        reason: `Eliminación de lote: ${batchToDelete.batchNumber || batchId}`,
        previousStock: materialDoc.stock,
        newStock: newStock,
      });

      toast.success('Lote movido a la papelera y stock actualizado');
      if (selectedItemDetails?.id === materialId) {
        setSelectedItemDetails({ ...materialDoc, batches: newBatches, stock: newStock });
      }
      await loadDeletedRecords();
      setIsBatchDeleteConfirmOpen(false);
      setItemToDeleteBatch(null);
    } catch (error) {
      handleApiError(error, OperationType.DELETE, `inventory/${materialId}/batches/${batchId}`);
    }
  };

  const handleDeleteTransaction = async () => {
    if (!itemToDeleteTransaction) return;

    try {
      const transactionToDelete = itemTransactions.find(t => t.id === itemToDeleteTransaction);
      if (transactionToDelete) {
        await createDeletedRecord({
          type: 'transaction',
          originalId: itemToDeleteTransaction,
          data: transactionToDelete,
          reason: `Eliminación de registro de kardex: ${transactionToDelete.reason}`
        });
      }
      await deleteInventoryTransaction(itemToDeleteTransaction);
      
      await logAction(
        'Eliminación de Transacción',
        'Inventario',
        `Transacción de ${transactionToDelete?.materialName || itemToDeleteTransaction} eliminada`,
        'delete',
        { transactionId: itemToDeleteTransaction }
      );

      toast.success('Registro movido a la papelera');
      await loadDeletedRecords();
      setIsTransactionDeleteConfirmOpen(false);
      setItemToDeleteTransaction(null);
    } catch (error) {
      handleApiError(error, OperationType.DELETE, `inventoryTransactions/${itemToDeleteTransaction}`);
    }
  };

  const handleRestoreRecord = async (record: any) => {
    try {
      if (record.type === 'material') {
        await upsertInventoryItem({
          projectId: record.data.projectId || selectedProjectId || '',
          name: record.data.name,
          category: record.data.category || 'Material de Obra',
          unit: record.data.unit || '',
          unitPrice: Number(record.data.unitPrice || 0),
          stock: Number(record.data.stock || 0),
          minStock: Number(record.data.minStock || 0),
          suppliers: Array.isArray(record.data.suppliers) ? record.data.suppliers : [],
          batches: Array.isArray(record.data.batches) ? record.data.batches : [],
        });
      } else if (record.type === 'batch') {
        // Restore batch
        const materialDoc = inventory.find(i => i.id === record.materialId);
        if (materialDoc) {
          const updatedBatches = [...(materialDoc.batches || []), record.data];
          const updatedStock = materialDoc.stock + record.data.quantity;
          await updateInventoryItem(record.materialId, {
            batches: updatedBatches,
            stock: updatedStock,
          });
          
          // Record transaction for restoration
          await createInventoryTransaction({
            materialId: record.materialId,
            materialName: record.materialName,
            type: 'In',
            quantity: record.data.quantity,
            reason: `Restauración de lote: ${record.data.batchNumber || record.batchId}`,
            previousStock: materialDoc.stock,
            newStock: updatedStock,
          });
        }
      } else if (record.type === 'transaction') {
        await createInventoryTransaction({
          materialId: record.data.materialId,
          materialName: record.data.materialName,
          type: record.data.type,
          quantity: Number(record.data.quantity || 0),
          batchNumber: record.data.batchNumber || null,
          previousStock: record.data.previousStock ?? null,
          newStock: record.data.newStock ?? null,
          reason: record.data.reason || 'Restauración de registro kardex',
          projectId: record.data.projectId || null,
        });
      }

      await deleteDeletedRecord(record.id);
      await loadDeletedRecords();
      toast.success('Registro restaurado exitosamente');
    } catch (error) {
      handleApiError(error, OperationType.UPDATE, `deletedRecords/${record.id}`);
    }
  };

  const handlePermanentDeleteRecord = async (recordId: string) => {
    try {
      await deleteDeletedRecord(recordId);
      await loadDeletedRecords();
      toast.success('Registro eliminado permanentemente');
    } catch (error) {
      handleApiError(error, OperationType.DELETE, `deletedRecords/${recordId}`);
    }
  };

  const handleDownloadCSV = () => {
    if (!selectedProjectId || projectMaterialSummary.length === 0) return;

    const project = projects.find(p => p.id === selectedProjectId);
    const projectName = project?.name || 'Proyecto';
    
    const headers = ['Material', 'Unidad', 'Presupuestado', 'Comprado', 'Pendiente', 'Estado'];
    const rows = projectMaterialSummary.map((m: any) => [
      m.name,
      m.unit,
      m.budgeted.toFixed(2),
      m.purchased.toFixed(2),
      Math.max(0, m.budgeted - m.purchased).toFixed(2),
      m.purchased >= m.budgeted ? 'Completo' : m.purchased > 0 ? 'En Proceso' : 'Pendiente'
    ]);

    const csvContent = [
      ...getBrandedCsvPreamble('Presupuesto de Materiales por Proyecto', [`Proyecto: ${projectName}`]),
      '',
      headers.map(escapeCsvCell).join(','),
      ...rows.map(row => row.map(escapeCsvCell).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `Presupuesto_Materiales_${projectName.replace(/\s+/g, '_')}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('Reporte CSV generado con éxito');
  };

  // Merge inventory with budgeted materials for the selected project
  const mergedInventory = React.useMemo(() => {
    let baseInventory = [...inventory];

    // Apply filters
    if (filterType === 'critical') {
      baseInventory = baseInventory.filter(i => i.stock <= i.minStock);
    } else if (filterType === 'expiring') {
      const soon = new Date();
      soon.setDate(soon.getDate() + 30); // 30 days
      baseInventory = baseInventory.filter(i => 
        i.batches?.some((b: any) => b.expirationDate && new Date(b.expirationDate) <= soon)
      );
    }

    if (!selectedProjectId) {
      return baseInventory.filter(i => selectedCategory === 'all' || i.category === selectedCategory);
    }

    // When a project is selected, the inventory is already filtered by projectId in the snapshot query
    // We just need to ensure we show the budgeted info if available
    const budgetedMaterials = projectMaterialSummary;
    
    return baseInventory.map(item => {
      const budgeted = budgetedMaterials.find(m => m.name.toLowerCase() === item.name.toLowerCase());
      if (budgeted) {
        return {
          ...item,
          budgetedQuantity: budgeted.budgeted,
          purchasedQuantity: budgeted.purchased
        };
      }
      return item;
    });
  }, [inventory, selectedProjectId, projectMaterialSummary, filterType, selectedCategory]);

  const filteredInventory = useMemo(() => {
    const normalizedSearch = deferredSearchTerm.toLowerCase();

    return mergedInventory.filter(i => 
      i.name.toLowerCase().includes(normalizedSearch) ||
      i.category.toLowerCase().includes(normalizedSearch)
    ).filter(i => {
      if (selectedCategory !== 'all' && i.category !== selectedCategory) return false;
      if (filterType === 'critical') return i.stock <= i.minStock;
      if (filterType === 'expiring') {
        if (!i.expiryDate) return false;
        const expiry = i.expiryDate.toDate ? i.expiryDate.toDate() : new Date(i.expiryDate);
        const diff = expiry.getTime() - new Date().getTime();
        return diff > 0 && diff < (30 * 24 * 60 * 60 * 1000); // 30 days
      }
      return true;
    });
  }, [mergedInventory, deferredSearchTerm, selectedCategory, filterType]);

  const totalPages = Math.ceil(filteredInventory.length / itemsPerPage);
  const paginatedInventory = React.useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredInventory.slice(start, start + itemsPerPage);
  }, [filteredInventory, currentPage, itemsPerPage]);

  return (
    <>
      {/* CSV Import Result Modal */}
      <FormModal
        isOpen={isCSVResultModalOpen}
        onClose={() => setIsCSVResultModalOpen(false)}
        title="Resultado de Importación CSV"
        maxWidth="max-w-2xl"
        footer={
          <div className="flex justify-end">
            <button
              onClick={() => setIsCSVResultModalOpen(false)}
              className="px-6 py-3 bg-primary text-white font-bold rounded-xl hover:bg-primary-hover transition-all shadow-lg shadow-primary-shadow"
            >
              Entendido
            </button>
          </div>
        }
      >
        <div className="space-y-6">
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-emerald-50 p-4 rounded-2xl border border-emerald-100 text-center">
              <CheckCircle2 className="mx-auto text-emerald-600 mb-2" size={24} />
              <p className="text-2xl font-black text-emerald-700">{csvImportResults.success}</p>
              <p className="text-[10px] font-bold text-emerald-600 uppercase">Exitosos</p>
            </div>
            <div className="bg-rose-50 p-4 rounded-2xl border border-rose-100 text-center">
              <XCircle className="mx-auto text-rose-600 mb-2" size={24} />
              <p className="text-2xl font-black text-rose-700">{csvImportResults.errors.length}</p>
              <p className="text-[10px] font-bold text-rose-600 uppercase">Errores</p>
            </div>
            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 text-center">
              <FileSpreadsheet className="mx-auto text-slate-600 mb-2" size={24} />
              <p className="text-2xl font-black text-slate-700">{csvImportResults.total}</p>
              <p className="text-[10px] font-bold text-slate-600 uppercase">Total Filas</p>
            </div>
          </div>

          {csvImportResults.errors.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <AlertTriangle size={18} className="text-rose-500" />
                Detalle de Errores
              </h3>
              <div className="bg-white border border-slate-100 rounded-2xl overflow-hidden">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-100">
                      <th className="px-4 py-3 font-bold text-slate-500">Fila</th>
                      <th className="px-4 py-3 font-bold text-slate-500">Error</th>
                      <th className="px-4 py-3 font-bold text-slate-500">Dato</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {csvImportResults.errors.map((err, idx) => (
                      <tr key={idx} className="hover:bg-rose-50/30 transition-colors">
                        <td className="px-4 py-3 font-bold text-slate-700">{err.row}</td>
                        <td className="px-4 py-3 text-rose-600 font-medium">{err.error}</td>
                        <td className="px-4 py-3 text-slate-500 text-xs truncate max-w-[200px]">
                          {err.data ? JSON.stringify(err.data) : 'N/A'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 flex flex-col md:flex-row items-center justify-between gap-4">
            <p className="text-xs text-slate-500 leading-relaxed">
              <span className="font-bold text-slate-700">Nota:</span> El archivo CSV debe contener las siguientes columnas (encabezados): 
              <code className="mx-1 px-1 bg-white border border-slate-200 rounded text-primary font-bold">Nombre</code>, 
              <code className="mx-1 px-1 bg-white border border-slate-200 rounded text-primary font-bold">Categoría</code>, 
              <code className="mx-1 px-1 bg-white border border-slate-200 rounded text-primary font-bold">Unidad</code>, 
              <code className="mx-1 px-1 bg-white border border-slate-200 rounded text-primary font-bold">Precio Unitario</code>, 
              <code className="mx-1 px-1 bg-white border border-slate-200 rounded text-primary font-bold">Stock Inicial</code>, 
              <code className="mx-1 px-1 bg-white border border-slate-200 rounded text-primary font-bold">Stock Mínimo</code>.
            </p>
            <button 
              onClick={handleDownloadTemplate}
              className="flex items-center gap-2 px-4 py-2 bg-white text-slate-600 text-xs font-bold rounded-lg border border-slate-200 hover:bg-slate-50 transition-all shrink-0"
            >
              <Download size={14} />
              Descargar Plantilla
            </button>
          </div>
        </div>
      </FormModal>

      <ConfirmModal
        isOpen={isDeleteConfirmOpen}
        onClose={() => setIsDeleteConfirmOpen(false)}
        onConfirm={confirmDeleteMaterial}
        title="Eliminar Material"
        message="¿Estás seguro de que deseas eliminar este material del inventario? Esta acción no se puede deshacer."
        confirmText="Eliminar"
        variant="danger"
      />

      <ConfirmModal
        isOpen={isBatchDeleteConfirmOpen}
        onClose={() => setIsBatchDeleteConfirmOpen(false)}
        onConfirm={handleDeleteBatch}
        title="Eliminar Lote"
        message="¿Está seguro de que desea eliminar este lote? El stock total del material se ajustará automáticamente restando la cantidad de este lote."
        confirmText="Eliminar Lote"
        variant="danger"
      />

      <ConfirmModal
        isOpen={isTransactionDeleteConfirmOpen}
        onClose={() => setIsTransactionDeleteConfirmOpen(false)}
        onConfirm={handleDeleteTransaction}
        title="Eliminar Registro de Kardex"
        message="¿Está seguro de que desea eliminar este registro? Esto eliminará la entrada del historial pero NO afectará el stock actual del material."
        confirmText="Eliminar Registro"
        variant="danger"
      />

      {/* Trash Modal */}
      <FormModal
        isOpen={isTrashModalOpen}
        onClose={() => setIsTrashModalOpen(false)}
        title="Papelera de Reciclaje"
        maxWidth="max-w-4xl"
        footer={
          <div className="flex justify-end">
            <button
              onClick={() => setIsTrashModalOpen(false)}
              className="px-6 py-3 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold rounded-xl hover:bg-slate-200 dark:hover:bg-slate-700 transition-all border border-slate-200 dark:border-slate-700"
            >
              Cerrar
            </button>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="bg-amber-50 dark:bg-amber-500/10 p-4 rounded-2xl border border-amber-100 dark:border-amber-500/20">
            <p className="text-xs text-amber-700 dark:text-amber-400 flex items-center gap-2">
              <Info size={14} />
              Los elementos eliminados se guardan aquí para su recuperación. Al restaurar un lote, el stock se ajustará automáticamente.
            </p>
          </div>

          <div className="overflow-x-auto lg:overflow-x-hidden">
            <table className="w-full text-left border-collapse table-fixed">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-800 border-b border-slate-100 dark:border-slate-800">
                  <th className="px-4 py-3 font-bold text-slate-500 dark:text-slate-400 text-xs uppercase tracking-wider">Tipo</th>
                  <th className="px-4 py-3 font-bold text-slate-500 dark:text-slate-400 text-xs uppercase tracking-wider">Detalle</th>
                  <th className="px-4 py-3 font-bold text-slate-500 dark:text-slate-400 text-xs uppercase tracking-wider">Fecha Eliminación</th>
                  <th className="px-4 py-3 font-bold text-slate-500 dark:text-slate-400 text-xs uppercase tracking-wider text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
                {deletedRecords.map((record) => (
                  <tr key={record.id} className="hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                    <td className="px-4 py-3">
                      <span className={cn(
                        "px-2 py-0.5 rounded-full text-[10px] font-bold uppercase",
                        record.type === 'material' ? "bg-blue-100 text-blue-700" :
                        record.type === 'batch' ? "bg-amber-100 text-amber-700" :
                        "bg-slate-100 text-slate-700"
                      )}>
                        {record.type === 'material' ? 'Material' : 
                         record.type === 'batch' ? 'Lote' : 'Kardex'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col">
                        <span className="text-sm font-bold text-slate-900 dark:text-white">
                          {record.type === 'material' ? record.data.name : 
                           record.type === 'batch' ? `${record.materialName} - Lote: ${record.data.batchNumber || 'N/A'}` :
                           record.data.materialName}
                        </span>
                        <span className="text-[10px] text-slate-500 dark:text-slate-400 italic">
                          {record.reason}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400">
                      {record.deletedAt ? formatDate(record.deletedAt) : 'Reciente'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-2">
                        <button 
                          onClick={() => handleRestoreRecord(record)}
                          className="p-2 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 rounded-lg hover:bg-emerald-100 transition-all"
                          title="Restaurar"
                        >
                          <RotateCcw size={16} />
                        </button>
                        <button 
                          onClick={() => handlePermanentDeleteRecord(record.id)}
                          className="p-2 bg-rose-50 dark:bg-rose-500/10 text-rose-600 rounded-lg hover:bg-rose-100 transition-all"
                          title="Eliminar Permanentemente"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {deletedRecords.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-12 text-center text-slate-400 italic">
                      La papelera está vacía.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </FormModal>
      <FormModal
        isOpen={isOptimizationModalOpen}
        onClose={() => setIsOptimizationModalOpen(false)}
        title="Optimización de Inventario IA"
        maxWidth="max-w-3xl"
        footer={
          <div className="flex justify-end gap-3">
            <button
              onClick={() => setIsOptimizationModalOpen(false)}
              className="px-6 py-3 text-slate-500 font-bold rounded-xl hover:bg-slate-100 transition-all"
            >
              Cerrar
            </button>
            <button
              onClick={generateAISuggestedPOs}
              disabled={isGeneratingPOs || !optimizationResults?.criticalShortages?.length}
              className="flex items-center gap-2 px-6 py-3 bg-primary text-white font-bold rounded-xl hover:bg-primary-hover transition-all shadow-lg shadow-primary-shadow disabled:opacity-50"
            >
              {isGeneratingPOs ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Generando Órdenes...
                </>
              ) : (
                <>
                  <Sparkles size={18} />
                  Generar Órdenes Sugeridas
                </>
              )}
            </button>
          </div>
        }
      >
        <div className="space-y-6">
          {isOptimizing ? (
            <div className="flex flex-col items-center justify-center py-12 space-y-4">
              <Loader2 size={48} className="text-primary animate-spin" />
              <div className="text-center">
                <h3 className="text-xl font-black text-slate-900 dark:text-white">Analizando Inventario...</h3>
                <p className="text-slate-500 dark:text-slate-400">Nuestra IA está procesando los niveles de stock y requerimientos de obra.</p>
              </div>
            </div>
          ) : optimizationResults ? (
            <div className="space-y-8">
              {/* Executive Summary */}
              <div className="bg-primary/5 dark:bg-primary/10 p-6 rounded-3xl border border-primary/10">
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-2 bg-primary text-white rounded-xl">
                    <Sparkles size={20} />
                  </div>
                  <h3 className="text-lg font-black text-slate-900 dark:text-white tracking-tight">Resumen Ejecutivo</h3>
                </div>
                <p className="text-slate-600 dark:text-slate-300 leading-relaxed italic">
                  "{optimizationResults.executiveSummary}"
                </p>
              </div>

              {/* Critical Shortages */}
              {optimizationResults.criticalShortages.length > 0 && (
                <div className="space-y-4">
                  <h3 className="text-sm font-black text-rose-600 uppercase tracking-wider flex items-center gap-2">
                    <AlertTriangle size={16} />
                    Riesgos de Desabastecimiento
                  </h3>
                  <div className="grid gap-4">
                    {optimizationResults.criticalShortages.map((item: any, idx: number) => (
                      <div key={idx} className="bg-rose-50 dark:bg-rose-500/10 p-4 rounded-2xl border border-rose-100 dark:border-rose-500/20 flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div>
                          <p className="font-bold text-rose-900 dark:text-rose-400">{item.material}</p>
                          <p className="text-xs text-rose-600 dark:text-rose-500/70">{item.reason}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="px-4 py-2 bg-white dark:bg-slate-900 rounded-xl border border-rose-200 dark:border-rose-500/30 text-xs font-bold text-rose-700 dark:text-rose-400">
                            Acción: {item.action}
                          </div>
                          {inventory.find(i => i.name.toLowerCase() === item.material.toLowerCase()) && (
                            <button 
                              onClick={() => {
                                const material = inventory.find(i => i.name.toLowerCase() === item.material.toLowerCase());
                                if (material) toggleReorderItem(material.id);
                              }}
                              className={cn(
                                "p-2 rounded-xl transition-all",
                                inventory.find(i => i.name.toLowerCase() === item.material.toLowerCase() && reorderList.includes(i.id))
                                  ? "bg-primary text-white"
                                  : "bg-white dark:bg-slate-900 text-primary border border-primary/20 hover:bg-primary-light"
                              )}
                              title="Añadir a lista de reorden"
                            >
                              <ShoppingCart size={16} />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Overstock */}
              {optimizationResults.overstockItems.length > 0 && (
                <div className="space-y-4">
                  <h3 className="text-sm font-black text-amber-600 uppercase tracking-wider flex items-center gap-2">
                    <Package size={16} />
                    Sobre-Stock Detectado
                  </h3>
                  <div className="grid gap-4">
                    {optimizationResults.overstockItems.map((item: any, idx: number) => (
                      <div key={idx} className="bg-amber-50 dark:bg-amber-500/10 p-4 rounded-2xl border border-amber-100 dark:border-amber-500/20 flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div>
                          <p className="font-bold text-amber-900 dark:text-amber-400">{item.material}</p>
                          <p className="text-xs text-amber-600 dark:text-amber-500/70">Valor inmovilizado: {formatCurrency(item.value)}</p>
                        </div>
                        <div className="px-4 py-2 bg-white dark:bg-slate-900 rounded-xl border border-amber-200 dark:border-amber-500/30 text-xs font-bold text-amber-700 dark:text-amber-400">
                          Sugerencia: {item.suggestion}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Recommendations */}
              <div className="space-y-4">
                <h3 className="text-sm font-black text-emerald-600 uppercase tracking-wider flex items-center gap-2">
                  <CheckCircle2 size={16} />
                  Recomendaciones Generales
                </h3>
                <div className="bg-emerald-50 dark:bg-emerald-500/10 p-6 rounded-3xl border border-emerald-100 dark:border-emerald-500/20">
                  <ul className="space-y-3">
                    {optimizationResults.recommendations.map((rec: string, idx: number) => (
                      <li key={idx} className="flex items-start gap-3 text-sm text-emerald-800 dark:text-emerald-400">
                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 mt-1.5 shrink-0" />
                        {rec}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </FormModal>

      <div className="space-y-4 sm:space-y-8">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4 sm:mb-8">
        <div>
          <h1 className="text-xl sm:text-3xl font-bold text-slate-900 dark:text-white">Almacén de Materiales</h1>
          <p className="text-[10px] sm:text-sm text-slate-500 dark:text-slate-400 font-medium">Gestión de stock, precios y alertas</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2 mr-2">
            <Construction size={18} className="text-slate-400" />
            <select 
              className="px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary transition-all shadow-sm text-xs font-bold text-slate-600 dark:text-slate-400"
              value={selectedProjectId}
              onChange={(e) => setSelectedProjectId(e.target.value)}
              title="Seleccionar proyecto de inventario"
              aria-label="Seleccionar proyecto de inventario"
            >
              <option value="">Inventario Global</option>
              {projects.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            {selectedProjectId && (
              <button
                onClick={syncProjectMaterials}
                disabled={isSyncing || syncableProjectMaterials.length === 0}
                className="p-2 bg-primary/10 text-primary rounded-xl hover:bg-primary/20 transition-all border border-primary/20"
                title={
                  syncableProjectMaterials.length === 0
                    ? 'No hay materiales válidos para sincronizar'
                    : `Sincronizar ${syncableProjectMaterials.length} material(es) del presupuesto`
                }
              >
                {isSyncing ? <Loader2 size={16} className="animate-spin" /> : <RotateCcw size={16} />}
              </button>
            )}
            {selectedProjectId && (
              <span className="px-2 py-1 bg-primary/10 text-primary rounded-lg text-[10px] font-black uppercase tracking-widest border border-primary/20">
                {syncableProjectMaterials.length} Material(es)
              </span>
            )}
          </div>
          <button 
            onClick={() => setIsScannerOpen(true)}
            title="Abrir escaner QR"
            aria-label="Abrir escaner QR"
            className="flex items-center justify-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 sm:py-2.5 bg-primary/10 text-primary font-black rounded-lg sm:rounded-xl hover:bg-primary/20 transition-all border border-primary/20 shadow-sm text-[10px] sm:text-xs uppercase tracking-widest"
          >
            <QrCode size={14} className="sm:w-4 sm:h-4" />
            <span>QR</span>
          </button>
          <button 
            onClick={runInventoryOptimization}
            disabled={isOptimizing}
            title="Ejecutar optimizacion con IA"
            aria-label="Ejecutar optimizacion con IA"
            className="flex items-center justify-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 sm:py-2.5 bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400 font-black rounded-lg sm:rounded-xl hover:bg-amber-100 dark:hover:bg-amber-500/20 transition-all border border-amber-100 dark:border-amber-500/20 shadow-sm text-[10px] sm:text-xs uppercase tracking-widest"
          >
            {isOptimizing ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} className="sm:w-4 sm:h-4" />}
            <span>IA</span>
          </button>
          <input 
            type="file" 
            accept=".csv" 
            className="hidden" 
            ref={fileInputRef}
            onChange={handleCSVImport}
            title="Importar inventario desde CSV"
            aria-label="Importar inventario desde CSV"
          />
          <button 
            onClick={() => setIsTrashModalOpen(true)}
            className="flex items-center justify-center gap-1.5 sm:gap-2 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-black py-2 sm:py-2.5 px-3 sm:px-4 rounded-lg sm:rounded-xl hover:bg-slate-200 dark:hover:bg-slate-700 transition-all border border-slate-200 dark:border-slate-700 text-[10px] sm:text-xs uppercase tracking-widest"
            title="Papelera de Reciclaje"
          >
            <Trash2 size={14} className="sm:w-4 sm:h-4" />
          </button>
          <button 
            onClick={() => {
              setSelectedItemForBatch(null);
              setIsBatchModalOpen(true);
              setNewBatch({ ...newBatch, type: 'In', materialId: '' });
            }}
            title="Registrar entrada de inventario"
            aria-label="Registrar entrada de inventario"
            className="flex items-center justify-center gap-1.5 sm:gap-2 bg-emerald-600 text-white font-black py-2 sm:py-2.5 px-4 sm:px-6 rounded-lg sm:rounded-xl hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-shadow text-[10px] sm:text-xs uppercase tracking-widest"
          >
            <ArrowUpRight size={14} className="sm:w-4 sm:h-4" />
            Entrada
          </button>
          <button 
            onClick={openAddModal}
            title="Crear nuevo material"
            aria-label="Crear nuevo material"
            className="flex items-center justify-center gap-1.5 sm:gap-2 bg-primary text-white font-black py-2 sm:py-2.5 px-4 sm:px-6 rounded-lg sm:rounded-xl hover:bg-primary-hover transition-all shadow-lg shadow-primary-shadow text-[10px] sm:text-xs uppercase tracking-widest"
          >
            <Plus size={14} className="sm:w-4 sm:h-4" />
            Nuevo
          </button>
        </div>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-6">
        <div className="bg-white dark:bg-slate-900 p-4 sm:p-6 rounded-xl sm:rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800 flex items-center gap-3 sm:gap-4 transition-colors duration-300">
          <div className="p-2 sm:p-3 bg-primary-light dark:bg-primary/10 text-primary rounded-lg sm:rounded-xl">
            <Layers size={18} className="sm:w-6 sm:h-6" />
          </div>
          <div>
            <p className="text-[10px] sm:text-xs text-slate-500 dark:text-slate-400 font-black uppercase tracking-wider">Total Items</p>
            <p className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white">{inventory.length}</p>
          </div>
        </div>
        <div className="bg-white dark:bg-slate-900 p-4 sm:p-6 rounded-xl sm:rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800 flex items-center gap-3 sm:gap-4 transition-colors duration-300">
          <div className="p-2 sm:p-3 bg-rose-100 dark:bg-rose-500/10 text-rose-600 rounded-lg sm:rounded-xl">
            <AlertTriangle size={18} className="sm:w-6 sm:h-6" />
          </div>
          <div>
            <p className="text-[10px] sm:text-xs text-slate-500 dark:text-slate-400 font-black uppercase tracking-wider">Stock Crítico</p>
            <p className="text-xl sm:text-2xl font-black text-rose-600">{inventory.filter(i => i.stock <= i.minStock).length}</p>
          </div>
        </div>
        <div className="bg-white dark:bg-slate-900 p-4 sm:p-6 rounded-xl sm:rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800 flex items-center gap-3 sm:gap-4 transition-colors duration-300">
          <div className="p-2 sm:p-3 bg-blue-100 dark:bg-blue-500/10 text-blue-600 rounded-lg sm:rounded-xl">
            <ShoppingBag size={18} className="sm:w-6 sm:h-6" />
          </div>
          <div>
            <p className="text-[10px] sm:text-xs text-slate-500 dark:text-slate-400 font-black uppercase tracking-wider">Valor Inventario</p>
            <p className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white truncate">{formatCurrency(inventory.reduce((acc, i) => acc + (i.stock * i.unitPrice), 0))}</p>
          </div>
        </div>
      </div>

      <div className="flex flex-col md:flex-row gap-3 sm:gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 sm:left-4 top-1/2 -translate-y-1/2 text-slate-400 sm:w-5 sm:h-5" size={16} />
          <input 
            type="text" 
            placeholder="Buscar material..." 
            className="w-full pl-10 sm:pl-12 pr-4 py-2.5 sm:py-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl sm:rounded-2xl focus:outline-none focus:ring-2 focus:ring-primary transition-all shadow-sm text-xs sm:text-sm text-slate-900 dark:text-white"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            title="Buscar material"
            aria-label="Buscar material"
          />
        </div>
        <div className="flex items-center gap-2">
          <Layers className="text-slate-400 sm:w-5 sm:h-5" size={16} />
          <select 
            className="flex-1 sm:flex-none px-3 sm:px-4 py-2.5 sm:py-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl sm:rounded-2xl focus:outline-none focus:ring-2 focus:ring-primary transition-all shadow-sm text-[10px] sm:text-sm font-bold text-slate-600 dark:text-slate-400"
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            title="Filtrar por categoria"
            aria-label="Filtrar por categoria"
          >
            <option value="all">Todas las Categorías</option>
            <option value="Materiales">Materiales</option>
            <option value="Herramientas">Herramientas</option>
            <option value="Equipo">Equipo</option>
            <option value="EPP">EPP</option>
            <option value="Otros">Otros</option>
          </select>
        </div>
        <div className="flex items-center gap-2">
          <AlertTriangle className="text-slate-400 sm:w-5 sm:h-5" size={16} />
          <select 
            className="flex-1 sm:flex-none px-3 sm:px-4 py-2.5 sm:py-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl sm:rounded-2xl focus:outline-none focus:ring-2 focus:ring-primary transition-all shadow-sm text-[10px] sm:text-sm font-bold text-slate-600 dark:text-slate-400"
            value={filterType}
            onChange={(e) => setFilterType(e.target.value as any)}
            title="Filtrar por estado de stock"
            aria-label="Filtrar por estado de stock"
          >
            <option value="all">Todos los Estados</option>
            <option value="critical">Stock Crítico</option>
            <option value="expiring">Próximos a Vencer</option>
          </select>
        </div>
      </div>

      <div className="flex gap-4 border-b border-slate-200 dark:border-slate-800">
        <button 
          onClick={() => setActiveTab('global')}
          className={cn(
            "pb-4 px-4 text-sm font-bold transition-all border-b-2",
            activeTab === 'global' ? "border-primary text-primary" : "border-transparent text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-400"
          )}
        >
          Inventario Global
        </button>
        <button 
          onClick={() => setActiveTab('projects')}
          className={cn(
            "pb-4 px-4 text-sm font-bold transition-all border-b-2",
            activeTab === 'projects' ? "border-primary text-primary" : "border-transparent text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-400"
          )}
        >
          Presupuesto por Proyecto
        </button>
      </div>

      {activeTab === 'global' ? (
        <div className="bg-white dark:bg-slate-900 rounded-[var(--radius-theme)] shadow-[var(--shadow-theme)] border border-slate-100 dark:border-slate-800 overflow-hidden flex flex-col min-h-0">
          {/* Desktop Header */}
          <div className="hidden md:grid md:grid-cols-12 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-100 dark:border-slate-800 px-6 py-4">
            <div className="col-span-3 text-micro font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Material</div>
            <div className="col-span-1 text-micro font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Unidad</div>
            <div className="col-span-2 text-micro font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Stock Actual</div>
            <div className="col-span-1 text-micro font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Mínimo</div>
            <div className="col-span-2 text-micro font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Precio Unit.</div>
            <div className="col-span-3 text-micro font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-right">Acciones</div>
          </div>

          {/* Scrollable List */}
          <div className="divide-y divide-slate-50 dark:divide-slate-800 overflow-y-auto max-h-[600px] custom-scrollbar">
            {paginatedInventory.map((item) => (
              <React.Fragment key={item.id}>
                {/* Desktop Row */}
                <div 
                  onClick={() => {
                    setSelectedItemDetails(item);
                    setIsDetailsModalOpen(true);
                  }}
                  className={cn(
                    "hidden md:grid md:grid-cols-12 items-center px-6 py-4 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-all duration-200 group border-l-4 cursor-pointer",
                    item.stock <= item.minStock ? "border-l-rose-500 bg-rose-50/20 dark:bg-rose-500/5" : "border-l-transparent"
                  )}
                >
                  <div className="col-span-3">
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        "p-2 rounded-xl transition-transform duration-200 group-hover:scale-110",
                        item.stock <= item.minStock ? "bg-rose-100 dark:bg-rose-500/20 text-rose-600" : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400"
                      )}>
                        {getCategoryIcon(item.category)}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-900 dark:text-white group-hover:text-primary transition-colors">
                            {item.name}
                          </span>
                          {item.isBudgetedOnly && (
                            <span className="text-[10px] font-black bg-primary-light dark:bg-primary/20 text-primary px-2 py-0.5 rounded-full uppercase tracking-tighter">
                              Presupuestado
                            </span>
                          )}
                        </div>
                        {item.stock <= item.minStock && (
                          <div className="flex items-center gap-1 text-micro font-black text-rose-600 uppercase tracking-tighter mt-0.5">
                            <AlertTriangle size={10} />
                            Stock Crítico
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="col-span-1 text-sm text-slate-600 dark:text-slate-400">{item.unit}</div>
                  <div className="col-span-2">
                    <div className="flex items-center gap-2">
                      <span className={cn(
                        "font-bold",
                        item.stock <= item.minStock ? "text-rose-600" : "text-slate-900 dark:text-white"
                      )}>{item.stock}</span>
                      <div className="flex flex-col gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            handleUpdateStock(item.id, 1);
                          }} 
                          title="Aumentar stock"
                          aria-label="Aumentar stock"
                          className="p-0.5 hover:bg-emerald-100 dark:hover:bg-emerald-500/20 text-emerald-600 rounded"
                        >
                          <ArrowUpRight size={12} />
                        </button>
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            handleUpdateStock(item.id, -1);
                          }} 
                          title="Disminuir stock"
                          aria-label="Disminuir stock"
                          className="p-0.5 hover:bg-rose-100 dark:hover:bg-rose-500/20 text-rose-600 rounded"
                        >
                          <ArrowDownRight size={12} />
                        </button>
                      </div>
                    </div>
                  </div>
                  <div className="col-span-1 text-sm text-slate-500 dark:text-slate-400">{item.minStock}</div>
                  <div className="col-span-2 text-sm font-medium text-slate-900 dark:text-white">{formatCurrency(item.unitPrice)}</div>
                  <div className="col-span-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      {item.stock <= item.minStock && (
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            openPOModal(item);
                          }}
                          title="Crear Orden de Compra"
                          className="p-2 text-primary hover:bg-primary-light/50 dark:hover:bg-primary/20 rounded-lg transition-colors"
                        >
                          <ShoppingBag size={16} />
                        </button>
                      )}
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedItemForBatch(item);
                          setNewBatch(prev => ({ ...prev, type: 'Out' }));
                          setIsBatchModalOpen(true);
                        }}
                        title="Registrar Salida"
                        className="p-2 text-rose-400 hover:text-rose-600 transition-colors"
                      >
                        <ArrowDownRight size={16} />
                      </button>
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedItemForBatch(item);
                          setNewBatch(prev => ({ ...prev, type: 'In' }));
                          setIsBatchModalOpen(true);
                        }}
                        title="Gestionar Lotes"
                        className="p-2 text-slate-400 hover:text-emerald-600 transition-colors"
                      >
                        <Layers size={16} />
                      </button>
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleReorderItem(item.id);
                        }}
                        title={reorderList.includes(item.id) ? "Quitar de lista de reorden" : "Marcar para reordenar"}
                        className={cn(
                          "p-2 transition-colors rounded-lg",
                          reorderList.includes(item.id) 
                            ? "bg-primary text-white" 
                            : "text-slate-400 hover:text-primary hover:bg-primary-light/50 dark:hover:bg-primary/20"
                        )}
                      >
                        <ShoppingCart size={16} />
                      </button>
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          openEditModal(item);
                        }}
                        title="Editar material"
                        aria-label="Editar material"
                        className="p-2 text-slate-400 hover:text-primary transition-colors"
                      >
                        <Edit2 size={16} />
                      </button>
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteMaterial(item.id);
                        }} 
                        title="Eliminar material"
                        aria-label="Eliminar material"
                        className="p-2 text-slate-400 hover:text-rose-600 transition-colors"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                </div>

                <div 
                  onClick={() => {
                    setSelectedItemDetails(item);
                    setIsDetailsModalOpen(true);
                  }}
                  data-testid={`inventory-card-${item.id}`}
                  className="md:hidden p-2.5 space-y-1.5 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors border-b border-slate-100 dark:border-slate-800"
                >
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className={cn(
                        "p-1.5 rounded-lg shrink-0",
                        item.stock <= item.minStock ? "bg-rose-100 dark:bg-rose-500/20 text-rose-600" : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400"
                      )}>
                        {getCategoryIcon(item.category)}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-bold text-slate-900 dark:text-white truncate">
                            {item.name}
                          </span>
                          {item.isBudgetedOnly && (
                            <span className="text-[7px] font-black bg-primary-light dark:bg-primary/20 text-primary px-1 py-0.5 rounded-full uppercase tracking-tighter shrink-0">
                              Presup.
                            </span>
                          )}
                        </div>
                        <p className="text-[9px] text-slate-500 dark:text-slate-400">{item.unit}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        data-testid={`inventory-card-dec-${item.id}`}
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleUpdateStock(item.id, -1);
                        }} 
                        title="Disminuir stock"
                        aria-label="Disminuir stock"
                        className="p-1 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded"
                      >
                        <ArrowDownRight size={12} />
                      </button>
                      <div className="px-1.5 py-0.5 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded min-w-[2rem] text-center">
                        <span className={cn(
                          "text-[10px] font-black",
                          item.stock <= item.minStock ? "text-rose-600" : "text-slate-900 dark:text-white"
                        )}>{item.stock}</span>
                      </div>
                      <button
                        type="button"
                        data-testid={`inventory-card-inc-${item.id}`}
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleUpdateStock(item.id, 1);
                        }} 
                        title="Aumentar stock"
                        aria-label="Aumentar stock"
                        className="p-1 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded"
                      >
                        <ArrowUpRight size={12} />
                      </button>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2 bg-slate-50 dark:bg-slate-800/50 p-1.5 rounded-lg">
                    <div>
                      <p className="text-[7px] font-bold text-slate-400 uppercase">Mínimo</p>
                      <p className="text-[9px] font-bold text-slate-700 dark:text-slate-300">{item.minStock} {item.unit}</p>
                    </div>
                    <div>
                      <p className="text-[7px] font-bold text-slate-400 uppercase">Precio</p>
                      <p className="text-[9px] font-bold text-slate-700 dark:text-slate-300">{formatCurrency(item.unitPrice)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[7px] font-bold text-slate-400 uppercase">Total</p>
                      <p className="text-[9px] font-black text-primary">{formatCurrency(item.stock * item.unitPrice)}</p>
                    </div>
                  </div>
                  <div className="flex justify-end items-center gap-1">
                    {item.stock <= item.minStock && (
                      <button
                        type="button"
                        data-testid={`inventory-card-po-${item.id}`}
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => {
                          e.stopPropagation();
                          openPOModal(item);
                        }}
                        title="Crear orden de compra"
                        aria-label="Crear orden de compra"
                        className="p-1 bg-primary-light dark:bg-primary/20 text-primary rounded"
                      >
                        <ShoppingBag size={12} />
                      </button>
                    )}
                    <button
                      type="button"
                      data-testid={`inventory-card-batches-${item.id}`}
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedItemForBatch(item);
                        setIsBatchModalOpen(true);
                      }}
                      title="Gestionar lotes"
                      aria-label="Gestionar lotes"
                      className="p-1 bg-emerald-50 dark:bg-emerald-500/20 text-emerald-600 rounded"
                    >
                      <Layers size={12} />
                    </button>
                    <button
                      type="button"
                      data-testid={`inventory-card-reorder-${item.id}`}
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleReorderItem(item.id);
                      }}
                      title={reorderList.includes(item.id) ? 'Quitar de reorden' : 'Marcar para reorden'}
                      aria-label={reorderList.includes(item.id) ? 'Quitar de reorden' : 'Marcar para reorden'}
                      className={cn(
                        "p-1 rounded",
                        reorderList.includes(item.id) 
                          ? "bg-primary text-white" 
                          : "bg-primary-light dark:bg-primary/20 text-primary"
                      )}
                    >
                      <ShoppingCart size={12} />
                    </button>
                    <button
                      type="button"
                      data-testid={`inventory-card-edit-${item.id}`}
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation();
                        openEditModal(item);
                      }}
                      title="Editar material"
                      aria-label="Editar material"
                      className="p-1 bg-slate-50 dark:bg-slate-800 text-slate-400 rounded"
                    >
                      <Edit2 size={12} />
                    </button>
                    <button
                      type="button"
                      data-testid={`inventory-card-delete-${item.id}`}
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteMaterial(item.id);
                      }} 
                      title="Eliminar material"
                      aria-label="Eliminar material"
                      className="p-1 bg-rose-50 dark:bg-rose-500/20 text-rose-600 rounded"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
              </React.Fragment>
            ))}
          </div>

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="flex flex-col md:flex-row items-center justify-between gap-4 bg-slate-50 dark:bg-slate-800/30 p-6 border-t border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-4">
                <span className="text-sm text-slate-500 dark:text-slate-400 font-medium">
                  Mostrando {paginatedInventory.length} de {filteredInventory.length} materiales
                </span>
                <div className="flex items-center gap-2">
                  <label className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Por página:</label>
                  <select 
                    className="px-2 py-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-bold outline-none text-slate-900 dark:text-white"
                    value={itemsPerPage}
                    onChange={(e) => {
                      setItemsPerPage(Number(e.target.value));
                      setCurrentPage(1);
                    }}
                    title="Cantidad de materiales por pagina"
                    aria-label="Cantidad de materiales por pagina"
                  >
                    <option value={12}>12</option>
                    <option value={24}>24</option>
                    <option value={48}>48</option>
                    <option value={96}>96</option>
                  </select>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button 
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                  title="Pagina anterior"
                  aria-label="Pagina anterior"
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
                        title={`Ir a la pagina ${pageNum}`}
                        aria-label={`Ir a la pagina ${pageNum}`}
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
                  title="Pagina siguiente"
                  aria-label="Pagina siguiente"
                  className="p-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 transition-all disabled:opacity-50 disabled:cursor-not-allowed text-slate-600 dark:text-slate-400"
                >
                  <ChevronRight size={20} />
                </button>
                {hasMore && (
                  <button
                    onClick={loadMoreInventory}
                    disabled={isLoadingMore}
                    className="ml-4 px-4 py-2 bg-primary/10 text-primary text-xs font-bold rounded-xl hover:bg-primary/20 transition-all disabled:opacity-50"
                  >
                    {isLoadingMore ? 'Cargando...' : 'Cargar más del servidor'}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-6">
          <div className="bg-white dark:bg-slate-900 p-4 sm:p-6 rounded-xl sm:rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800 flex flex-col md:flex-row md:items-end gap-3 sm:gap-4">
            <div className="flex-1">
              <label className="text-xs sm:text-sm font-bold text-slate-700 dark:text-slate-300 mb-1.5 sm:mb-2 block">Seleccionar Proyecto</label>
              <select 
                className="w-full px-3 sm:px-4 py-2.5 sm:py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg sm:rounded-xl focus:outline-none focus:ring-2 focus:ring-primary text-xs sm:text-sm text-slate-900 dark:text-white"
                value={selectedProjectId}
                onChange={(e) => setSelectedProjectId(e.target.value)}
                title="Seleccionar proyecto"
                aria-label="Seleccionar proyecto"
              >
                <option value="">Seleccione un proyecto...</option>
                {projects.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
            {selectedProjectId && projectMaterialSummary.length > 0 && (
              <div className="flex gap-2 sm:gap-3">
                <button 
                  onClick={() => {
                    const itemsToOrder = projectMaterialSummary.filter(m => m.shortage > 0);
                    if (itemsToOrder.length > 0) {
                      setShortageItems(itemsToOrder);
                      setIsShortageModalOpen(true);
                    } else {
                      toast.success('No se detectaron faltantes críticos para este proyecto.');
                    }
                  }}
                  className="flex-1 md:flex-none flex items-center justify-center gap-1.5 sm:gap-2 px-4 sm:px-6 py-2.5 sm:py-3 bg-rose-600 text-white font-black rounded-lg sm:rounded-xl hover:bg-rose-700 transition-all shadow-lg shadow-rose-200 text-[10px] sm:text-xs uppercase tracking-widest"
                >
                  <AlertTriangle size={14} className="sm:w-4 sm:h-4" />
                  Sugerir Orden
                </button>
                <button 
                  onClick={handleDownloadCSV}
                  className="flex-1 md:flex-none flex items-center justify-center gap-1.5 sm:gap-2 px-4 sm:px-6 py-2.5 sm:py-3 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-black rounded-lg sm:rounded-xl hover:bg-slate-200 dark:hover:bg-slate-700 transition-all text-[10px] sm:text-xs uppercase tracking-widest"
                >
                  <Download size={14} className="sm:w-4 sm:h-4" />
                  CSV
                </button>
              </div>
            )}
          </div>

          {selectedProjectId ? (
            <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800 overflow-hidden">
              <div className="hidden md:grid md:grid-cols-12 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-100 dark:border-slate-800 px-6 py-4">
                <div className="col-span-3 text-micro font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Material</div>
                <div className="col-span-2 text-micro font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Presupuestado</div>
                <div className="col-span-2 text-micro font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Stock Global</div>
                <div className="col-span-2 text-micro font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Faltante</div>
                <div className="col-span-3 text-micro font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-right">Riesgo / Estado</div>
              </div>
              <div className="divide-y divide-slate-50 dark:divide-slate-800">
                {projectMaterialSummary.map((m: any) => (
                  <React.Fragment key={m.name}>
                    {/* Desktop Row */}
                    <div className="hidden md:grid grid-cols-12 items-center px-6 py-4 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-all duration-200 group">
                      <div className="col-span-3">
                        <div className="font-bold text-slate-900 dark:text-white group-hover:text-primary transition-colors">{m.name}</div>
                        <div className="text-micro text-slate-400 dark:text-slate-500 uppercase font-bold">{m.unit}</div>
                      </div>
                      <div className="col-span-2 text-sm font-bold text-slate-700 dark:text-slate-300">{m.budgeted.toFixed(2)}</div>
                      <div className="col-span-2 text-sm font-bold text-slate-700 dark:text-slate-300">{m.globalStock.toFixed(2)}</div>
                      <div className="col-span-2">
                        <span className={cn(
                          "text-sm font-black",
                          m.shortage > 0 ? "text-rose-600" : "text-emerald-600"
                        )}>
                          {m.shortage > 0 ? m.shortage.toFixed(2) : 'Suficiente'}
                        </span>
                      </div>
                      <div className="col-span-3 text-right">
                        <div className="flex flex-col items-end gap-1">
                          <span className={cn(
                            "px-2 py-1 rounded-full text-[10px] font-black uppercase tracking-wider",
                            m.riskLevel === 'High' ? "bg-rose-100 dark:bg-rose-500/20 text-rose-700 dark:text-rose-400" : 
                            m.riskLevel === 'Medium' ? "bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-400" : "bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400"
                          )}>
                            Riesgo {m.riskLevel === 'High' ? 'Alto' : m.riskLevel === 'Medium' ? 'Medio' : 'Bajo'}
                          </span>
                          <span className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase">
                            {m.purchased >= m.budgeted ? 'Compra Completa' : `${((m.purchased/m.budgeted)*100).toFixed(1)}% Adquirido`}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Mobile Card */}
                    <div className="md:hidden p-3 space-y-2">
                      <div className="flex justify-between items-start">
                        <div>
                          <h4 className="text-sm font-bold text-slate-900 dark:text-white">{m.name}</h4>
                          <p className="text-[10px] text-slate-500 dark:text-slate-400">{m.unit}</p>
                        </div>
                        <span className={cn(
                          "px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-wider",
                          m.purchased >= m.budgeted ? "bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400" : 
                          m.purchased > 0 ? "bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-400" : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400"
                        )}>
                          {m.purchased >= m.budgeted ? 'Completo' : m.purchased > 0 ? 'En Proceso' : 'Pendiente'}
                        </span>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-2 bg-slate-50 dark:bg-slate-800/50 p-2 rounded-lg">
                        <div>
                          <p className="text-[8px] font-bold text-slate-400 uppercase">Presup.</p>
                          <p className="text-xs font-bold text-slate-700 dark:text-slate-300">{m.budgeted.toFixed(2)}</p>
                        </div>
                        <div>
                          <p className="text-[8px] font-bold text-slate-400 uppercase">Comprado</p>
                          <p className="text-xs font-bold text-slate-700 dark:text-slate-300">{m.purchased.toFixed(2)}</p>
                        </div>
                      </div>

                      <div className="flex justify-between items-center pt-1">
                        <div>
                          <p className="text-[8px] font-bold text-slate-400 uppercase">Pendiente</p>
                          <p className="text-xs font-black text-primary">
                            {Math.max(0, m.budgeted - m.purchased).toFixed(2)}
                          </p>
                        </div>
                        {m.purchased > m.budgeted ? (
                          <div className="flex items-center gap-1 text-[8px] font-bold text-emerald-600">
                            <ArrowUpRight size={10} />
                            Excedente: {(m.purchased - m.budgeted).toFixed(2)}
                          </div>
                        ) : m.purchased < m.budgeted && m.purchased > 0 ? (
                          <div className="flex items-center gap-1 text-[8px] font-bold text-rose-600">
                            <ArrowDownRight size={10} />
                            Faltante: {(m.budgeted - m.purchased).toFixed(2)}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </React.Fragment>
                ))}
                {projectMaterialSummary.length === 0 && (
                  <div className="p-12 text-center text-slate-400 dark:text-slate-500">
                    No hay materiales definidos en el presupuesto de este proyecto.
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="bg-white dark:bg-slate-900 p-12 rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 text-center text-slate-400 dark:text-slate-500">
              Seleccione un proyecto para ver el desglose de materiales presupuestados vs comprados.
            </div>
          )}
        </div>
      )}
    </div>

      {/* Material Details Modal */}
      <FormModal
        isOpen={isDetailsModalOpen}
        onClose={() => {
          setIsDetailsModalOpen(false);
          setSelectedItemDetails(null);
        }}
        title={selectedItemDetails?.name || ''}
        fullVertical
        footer={
          <div className="flex justify-end w-full">
            <button 
              onClick={() => {
                setIsDetailsModalOpen(false);
                setSelectedItemDetails(null);
              }}
              className="px-6 py-3 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 transition-all"
            >
              Cerrar
            </button>
          </div>
        }
      >
        {selectedItemDetails && (
          <div className="space-y-8">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-slate-50 dark:bg-slate-800 p-4 rounded-2xl border border-slate-100 dark:border-slate-700">
                <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Stock Actual</p>
                <p className="text-xl font-black text-slate-900 dark:text-white">{selectedItemDetails.stock} {selectedItemDetails.unit}</p>
              </div>
              <div className="bg-slate-50 dark:bg-slate-800 p-4 rounded-2xl border border-slate-100 dark:border-slate-700">
                <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Mínimo</p>
                <p className="text-xl font-black text-slate-900 dark:text-white">{selectedItemDetails.minStock} {selectedItemDetails.unit}</p>
              </div>
              <div className="bg-slate-50 dark:bg-slate-800 p-4 rounded-2xl border border-slate-100 dark:border-slate-700">
                <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Precio Unit.</p>
                <p className="text-xl font-black text-slate-900 dark:text-white">{formatCurrency(selectedItemDetails.unitPrice)}</p>
              </div>
              <div className="bg-slate-50 dark:bg-slate-800 p-4 rounded-2xl border border-slate-100 dark:border-slate-700">
                <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Valor Total</p>
                <p className="text-xl font-black text-primary">{formatCurrency(selectedItemDetails.stock * selectedItemDetails.unitPrice)}</p>
              </div>
            </div>

            {selectedItemDetails.suppliers && selectedItemDetails.suppliers.length > 0 && (
              <div className="space-y-3">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <ShoppingBag size={18} className="text-primary" />
                  Proveedores Frecuentes
                </h3>
                <div className="flex flex-wrap gap-2">
                  {selectedItemDetails.suppliers.map((s: string, idx: number) => (
                    <span key={idx} className="px-3 py-1 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-full text-xs font-bold border border-slate-200 dark:border-slate-700">
                      {s}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {selectedItemDetails.batches && selectedItemDetails.batches.length > 0 && (
              <div className="space-y-4">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Layers size={18} className="text-primary" />
                  Lotes y Ubicaciones
                </h3>
                <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl overflow-hidden">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="bg-slate-50 dark:bg-slate-800 border-b border-slate-100 dark:border-slate-800">
                        <th className="px-4 py-3 font-bold text-slate-500 dark:text-slate-400">Lote / Ubicación</th>
                        <th className="px-4 py-3 font-bold text-slate-500 dark:text-slate-400 text-right">Cant.</th>
                        <th className="px-4 py-3 font-bold text-slate-500 dark:text-slate-400">Vencimiento</th>
                        <th className="px-4 py-3 font-bold text-slate-500 dark:text-slate-400 text-right">Acciones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
                      {selectedItemDetails.batches.map((b: any, idx: number) => (
                        <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                          <td className="px-4 py-3">
                            <div className="font-medium text-slate-700 dark:text-slate-300">{b.batchNumber || 'Sin Lote'}</div>
                            <div className="text-[10px] text-slate-400 uppercase font-bold">{b.location}</div>
                          </td>
                          <td className="px-4 py-3 text-right font-bold text-slate-900 dark:text-white">{b.quantity}</td>
                          <td className="px-4 py-3">
                            {b.expirationDate ? (
                              <span className={cn(
                                "text-xs font-bold",
                                new Date(b.expirationDate) <= new Date() ? "text-rose-600" : "text-slate-600 dark:text-slate-400"
                              )}>
                                {formatDate(b.expirationDate)}
                              </span>
                            ) : (
                              <span className="text-xs text-slate-400 italic">N/A</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex justify-end gap-2">
                              <button 
                                onClick={() => {
                                  setSelectedItemForBatch(selectedItemDetails);
                                  setEditingBatchId(b.id);
                                  setNewBatch({
                                    quantity: b.quantity,
                                    batchNumber: b.batchNumber || '',
                                    expirationDate: b.expirationDate || '',
                                    manufacturingDate: b.manufacturingDate || '',
                                    location: b.location || '',
                                    type: 'In',
                                    projectId: b.projectId || '',
                                    reason: '',
                                    materialId: selectedItemDetails.id,
                                    price: 0,
                                    supplier: ''
                                  });
                                  setIsBatchModalOpen(true);
                                }}
                                title="Editar lote"
                                aria-label="Editar lote"
                                className="p-1.5 bg-blue-50 dark:bg-blue-500/10 text-blue-600 rounded-lg hover:bg-blue-100 transition-all"
                              >
                                <Edit2 size={14} />
                              </button>
                              <button 
                                onClick={() => {
                                  setItemToDeleteBatch({ materialId: selectedItemDetails.id, batchId: b.id });
                                  setIsBatchDeleteConfirmOpen(true);
                                }}
                                title="Eliminar lote"
                                aria-label="Eliminar lote"
                                className="p-1.5 bg-rose-50 dark:bg-rose-500/10 text-rose-600 rounded-lg hover:bg-rose-100 transition-all"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {selectedItemDetails.priceHistory && selectedItemDetails.priceHistory.length > 0 && (
              <div className="space-y-4">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <DollarSign size={18} className="text-primary" />
                  Historial de Precios y Proveedores
                </h3>
                <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl overflow-hidden">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="bg-slate-50 dark:bg-slate-800 border-b border-slate-100 dark:border-slate-800">
                        <th className="px-4 py-3 font-bold text-slate-500 dark:text-slate-400">Fecha</th>
                        <th className="px-4 py-3 font-bold text-slate-500 dark:text-slate-400">Proveedor</th>
                        <th className="px-4 py-3 font-bold text-slate-500 dark:text-slate-400 text-right">Precio Unit.</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
                      {selectedItemDetails.priceHistory.sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime()).map((h: any, idx: number) => (
                        <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                          <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{formatDate(h.date)}</td>
                          <td className="px-4 py-3 font-medium text-slate-700 dark:text-slate-300">{h.supplier}</td>
                          <td className="px-4 py-3 text-right font-bold text-slate-900 dark:text-white">{formatCurrency(h.price)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div className="bg-slate-50 dark:bg-slate-800 p-6 rounded-2xl border border-slate-100 dark:border-slate-700 flex flex-col items-center gap-4">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <QrCode size={18} className="text-primary" />
                Código QR de Identificación
              </h3>
              <div className="bg-white p-4 rounded-xl shadow-sm">
                <QRCodeSVG 
                  value={JSON.stringify({
                    id: selectedItemDetails.id,
                    name: selectedItemDetails.name,
                    unit: selectedItemDetails.unit
                  })}
                  size={150}
                  level="H"
                  includeMargin={true}
                />
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 text-center max-w-xs">
                Escanee este código para identificar rápidamente el material en el almacén y registrar movimientos.
              </p>
            </div>

            <div className="space-y-4">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <History size={18} className="text-primary" />
                Kardex de Material: {selectedItemDetails.name}
              </h3>
              
              <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl overflow-hidden">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-800 border-b border-slate-100 dark:border-slate-800">
                      <th className="px-4 py-3 font-bold text-slate-500 dark:text-slate-400">Fecha</th>
                      <th className="px-4 py-3 font-bold text-slate-500 dark:text-slate-400">Tipo</th>
                      <th className="px-4 py-3 font-bold text-slate-500 dark:text-slate-400 text-right">Cant.</th>
                      <th className="px-4 py-3 font-bold text-slate-500 dark:text-slate-400">Motivo</th>
                      <th className="px-4 py-3 font-bold text-slate-500 dark:text-slate-400 text-right">Saldo</th>
                      <th className="px-4 py-3 font-bold text-slate-500 dark:text-slate-400 text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
                    {itemTransactions.map((t) => (
                      <tr key={t.id} className="hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                        <td className="px-4 py-3 text-slate-600 dark:text-slate-400 whitespace-nowrap">
                          {t.createdAt?.toDate ? formatDate(t.createdAt.toDate().toISOString()) : 'Reciente'}
                        </td>
                        <td className="px-4 py-3">
                          <span className={cn(
                            "px-2 py-0.5 rounded-full text-[10px] font-bold uppercase",
                            t.type === 'In' ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"
                          )}>
                            {t.type === 'In' ? 'Entrada' : 'Salida'}
                          </span>
                        </td>
                        <td className={cn(
                          "px-4 py-3 text-right font-bold",
                          t.type === 'In' ? "text-emerald-600" : "text-rose-600"
                        )}>
                          {t.type === 'In' ? '+' : '-'}{t.quantity}
                        </td>
                        <td className="px-4 py-3 text-slate-500 dark:text-slate-400 text-xs italic">{t.reason}</td>
                        <td className="px-4 py-3 text-right font-bold text-slate-900 dark:text-white">{t.newStock}</td>
                        <td className="px-4 py-3 text-right">
                          <button 
                            onClick={() => {
                              setItemToDeleteTransaction(t.id);
                              setIsTransactionDeleteConfirmOpen(true);
                            }}
                            title="Eliminar movimiento"
                            aria-label="Eliminar movimiento"
                            className="p-1.5 bg-rose-50 dark:bg-rose-500/10 text-rose-600 rounded-lg hover:bg-rose-100 transition-all"
                          >
                            <Trash2 size={14} />
                          </button>
                        </td>
                      </tr>
                    ))}
                    {itemTransactions.length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-4 py-8 text-center text-slate-400 italic">
                          No hay movimientos registrados en el kardex para este material.
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

      {/* Shortage Suggestion Modal */}
      <FormModal
        isOpen={isShortageModalOpen}
        onClose={() => setIsShortageModalOpen(false)}
        title="Sugerencias de Compra por Faltantes"
        fullVertical
        footer={
          <div className="flex flex-col sm:flex-row gap-4 w-full">
            <button 
              onClick={() => setIsShortageModalOpen(false)}
              className="flex-1 py-4 px-6 bg-white text-slate-600 font-bold rounded-xl border border-slate-200 hover:bg-slate-50 transition-all order-2 sm:order-1"
            >
              Cerrar
            </button>
            <button 
              onClick={async () => {
                // Bulk generate POs
                try {
                  for (const item of shortageItems) {
                    const invItem = inventory.find(i => i.name.toLowerCase() === item.name.toLowerCase());
                    if (invItem) {
                      await createPurchaseOrder({
                        materialId: invItem.id,
                        materialName: invItem.name,
                        quantity: item.shortage,
                        unit: invItem.unit,
                        estimatedCost: item.shortage * invItem.unitPrice,
                        supplier: 'Pendiente',
                        notes: `Compra masiva sugerida por faltante en proyecto: ${projects.find(p => p.id === selectedProjectId)?.name}`,
                        status: 'Pending',
                        date: new Date().toISOString().split('T')[0],
                      });
                    }
                  }
                  toast.success(`Se han generado ${shortageItems.length} órdenes de compra.`);
                  setIsShortageModalOpen(false);
                } catch (error) {
                  handleApiError(error, OperationType.WRITE, 'purchaseOrders');
                }
              }}
              className="flex-1 py-4 px-6 bg-rose-600 text-white font-bold rounded-xl hover:bg-rose-700 transition-all shadow-lg shadow-rose-200 order-1 sm:order-2"
            >
              Generar Todas las POs
            </button>
          </div>
        }
      >
        <div className="space-y-6">
          <div className="bg-rose-50 dark:bg-rose-500/10 border border-rose-100 dark:border-rose-500/20 p-6 rounded-2xl flex items-start gap-4">
            <div className="w-12 h-12 bg-rose-100 dark:bg-rose-500/20 rounded-xl flex items-center justify-center text-rose-600 flex-shrink-0">
              <AlertTriangle size={24} />
            </div>
            <div>
              <p className="text-sm font-bold text-rose-900 dark:text-rose-400 uppercase tracking-widest text-xs mb-1">Análisis de Riesgo</p>
              <p className="text-base font-bold text-rose-800 dark:text-rose-300">Se han detectado {shortageItems.length} materiales con stock insuficiente.</p>
              <p className="text-sm text-rose-700 dark:text-rose-500 mt-1 opacity-80">Estos materiales son necesarios para completar el presupuesto del proyecto seleccionado.</p>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl overflow-hidden">
            <div className="overflow-x-auto lg:overflow-x-hidden">
              <table className="w-full text-left text-sm table-fixed">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-800 border-b border-slate-100 dark:border-slate-800">
                    <th className="px-4 py-3 font-bold text-slate-500 dark:text-slate-400">Material</th>
                    <th className="px-4 py-3 font-bold text-slate-500 dark:text-slate-400 text-right">Presupuestado</th>
                    <th className="px-4 py-3 font-bold text-slate-500 dark:text-slate-400 text-right">Stock Global</th>
                    <th className="px-4 py-3 font-bold text-slate-500 dark:text-slate-400 text-right">Faltante</th>
                    <th className="px-4 py-3 font-bold text-slate-500 dark:text-slate-400 text-right">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
                  {shortageItems.map((item, idx) => (
                    <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                      <td className="px-4 py-3 font-bold text-slate-900 dark:text-white">{item.name}</td>
                      <td className="px-4 py-3 text-right font-medium text-slate-600 dark:text-slate-400">{item.budgeted.toFixed(2)} {item.unit}</td>
                      <td className="px-4 py-3 text-right font-medium text-slate-600 dark:text-slate-400">{item.globalStock.toFixed(2)} {item.unit}</td>
                      <td className="px-4 py-3 text-right font-black text-rose-600">{item.shortage.toFixed(2)} {item.unit}</td>
                      <td className="px-4 py-3 text-right">
                        <button 
                          onClick={() => {
                            const invItem = inventory.find(i => i.name.toLowerCase() === item.name.toLowerCase());
                            if (invItem) {
                              openPOModal(invItem);
                              setPoData(prev => ({
                                ...prev,
                                quantity: item.shortage,
                                notes: `Compra sugerida por faltante en proyecto: ${projects.find(p => p.id === selectedProjectId)?.name}`
                              }));
                            }
                          }}
                          className="px-4 py-2 bg-rose-600 text-white text-[10px] font-black uppercase rounded-xl hover:bg-rose-700 transition-all shadow-lg shadow-rose-100 dark:shadow-none"
                        >
                          Generar PO
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </FormModal>

      {/* Purchase Order Modal */}
      <FormModal
        isOpen={isPOModalOpen}
        onClose={() => setIsPOModalOpen(false)}
        title="Generar Orden de Compra"
        fullVertical
        footer={
          <div className="flex flex-col sm:flex-row gap-3 w-full">
            <button 
              type="button"
              onClick={() => setIsPOModalOpen(false)}
              className="flex-1 py-3 px-6 bg-white text-slate-600 font-bold rounded-xl border border-slate-200 hover:bg-slate-50 transition-all order-2 sm:order-1 text-xs sm:text-sm"
            >
              Cancelar
            </button>
            <button 
              type="submit"
              form="po-form"
              className="flex-1 py-3 px-6 bg-primary text-white font-bold rounded-xl hover:bg-primary-hover transition-all shadow-lg shadow-primary-shadow order-1 sm:order-2 text-xs sm:text-sm"
            >
              Generar Orden
            </button>
          </div>
        }
      >
        <form id="po-form" onSubmit={handleCreatePurchaseOrder} className="space-y-4 sm:space-y-8">
          <div className="p-3 sm:p-4 bg-primary/5 rounded-2xl border border-primary/10 flex items-center gap-3 sm:gap-4">
            <div className="w-10 h-10 sm:w-12 sm:h-12 bg-primary/10 rounded-xl flex items-center justify-center text-primary">
              <Package size={20} className="sm:w-6 sm:h-6" />
            </div>
            <div>
              <p className="text-[8px] sm:text-[10px] font-bold text-primary uppercase tracking-widest">Material Seleccionado</p>
              <h4 className="text-sm sm:text-base font-bold text-slate-900">{selectedItemForPO?.name}</h4>
              <p className="text-[10px] sm:text-xs text-slate-500">Stock Actual: {selectedItemForPO?.stock} {selectedItemForPO?.unit}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <label className="text-sm font-bold text-slate-700 dark:text-slate-300">Cantidad a Pedir</label>
                <button
                  type="button"
                  onClick={handlePOAISuggestions}
                  disabled={isGeneratingPO}
                  title="Generar sugerencia de orden con IA"
                  aria-label="Generar sugerencia de orden con IA"
                  className="flex items-center gap-1 text-[10px] font-black text-primary uppercase tracking-tighter hover:bg-primary/10 px-2 py-1 rounded-lg transition-all"
                >
                  {isGeneratingPO ? <Loader2 size={10} className="animate-spin" /> : <Sparkles size={10} />}
                  Sugerencia IA
                </button>
              </div>
              <div className="relative">
                <input 
                  required
                  type="number" 
                  min="0"
                  step="any"
                  className="w-full pl-4 pr-12 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary text-slate-900 dark:text-white"
                  value={poData.quantity}
                  onChange={(e) => setPoData({...poData, quantity: Number(e.target.value)})}
                  title="Cantidad a pedir"
                  aria-label="Cantidad a pedir"
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">
                  {selectedItemForPO?.unit}
                </span>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-bold text-slate-700 dark:text-slate-300">Proveedor</label>
              <div className="space-y-2">
                <select 
                  className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary text-slate-900 dark:text-white"
                  value={poData.supplier}
                  onChange={(e) => setPoData({...poData, supplier: e.target.value})}
                  title="Seleccionar proveedor"
                  aria-label="Seleccionar proveedor"
                >
                  <option value="">Seleccionar Proveedor...</option>
                  {selectedItemForPO?.suppliers?.map((s: string) => (
                    <option key={s} value={s}>{s} (Frecuente)</option>
                  ))}
                  {suppliers.filter(s => s.status === 'Active').map(s => (
                    <option key={s.id} value={s.name}>{s.name}</option>
                  ))}
                  <option value="other">Otro...</option>
                </select>
                {(poData.supplier === 'other' || (!selectedItemForPO?.suppliers?.length && !suppliers.length)) && (
                  <input 
                    required
                    type="text" 
                    placeholder="Nombre del nuevo proveedor"
                    className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary text-slate-900 dark:text-white"
                    onChange={(e) => setPoData({...poData, supplier: e.target.value})}
                    title="Nombre del proveedor"
                    aria-label="Nombre del proveedor"
                  />
                )}
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-bold text-slate-700 dark:text-slate-300">Notas / Instrucciones</label>
            <textarea 
              className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary h-32 resize-none text-slate-900 dark:text-white"
              placeholder="Detalles adicionales para la compra..."
              value={poData.notes}
              onChange={(e) => setPoData({...poData, notes: e.target.value})}
            />
          </div>
        </form>
      </FormModal>

      {/* Batch Management Modal */}
      <FormModal
        isOpen={isBatchModalOpen}
        onClose={() => {
          setIsBatchModalOpen(false);
          setEditingBatchId(null);
          setNewBatch({ quantity: 0, batchNumber: '', expirationDate: '', manufacturingDate: '', location: '', type: 'In', projectId: '', reason: '', materialId: '', price: 0, supplier: '' });
        }}
        title={editingBatchId ? "Editar Lote" : "Gestionar Lotes e Inventario"}
        fullVertical
        footer={
          <div className="flex flex-col sm:flex-row gap-3 w-full">
            <button 
              type="button"
              onClick={() => {
                setIsBatchModalOpen(false);
                setEditingBatchId(null);
                setNewBatch({ quantity: 0, batchNumber: '', expirationDate: '', manufacturingDate: '', location: '', type: 'In', projectId: '', reason: '', materialId: '', price: 0, supplier: '' });
              }}
              className="flex-1 py-3 px-6 bg-white text-slate-600 font-bold rounded-xl border border-slate-200 hover:bg-slate-50 transition-all order-2 sm:order-1 text-xs sm:text-sm"
            >
              Cancelar
            </button>
            <button 
              type="submit"
              form="batch-form"
              className={cn(
                "flex-1 py-3 px-6 text-white font-bold rounded-xl transition-all shadow-lg order-1 sm:order-2 text-xs sm:text-sm",
                editingBatchId ? "bg-blue-600 hover:bg-blue-700 shadow-blue-100" : (newBatch.type === 'In' ? "bg-emerald-600 hover:bg-emerald-700 shadow-emerald-100" : "bg-rose-600 hover:bg-rose-700 shadow-rose-100")
              )}
            >
              {editingBatchId ? 'Guardar Cambios' : `Registrar ${newBatch.type === 'In' ? 'Entrada' : 'Salida'}`}
            </button>
          </div>
        }
      >
        <form id="batch-form" onSubmit={handleAddBatch} className="space-y-4 sm:space-y-8">
          {!editingBatchId && (
            <div className="flex gap-2 p-1 bg-slate-100 dark:bg-slate-800 rounded-2xl">
              <button
                type="button"
                onClick={() => setNewBatch({...newBatch, type: 'In'})}
                className={cn(
                  "flex-1 py-2 sm:py-3 text-[11px] sm:text-sm font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 sm:gap-2",
                  newBatch.type === 'In' ? "bg-white dark:bg-slate-700 text-emerald-600 shadow-md" : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                )}
              >
                <ArrowUpRight size={16} className="sm:w-[18px] sm:h-[18px]" />
                Entrada
              </button>
              <button
                type="button"
                onClick={() => setNewBatch({...newBatch, type: 'Out'})}
                className={cn(
                  "flex-1 py-2 sm:py-3 text-[11px] sm:text-sm font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 sm:gap-2",
                  newBatch.type === 'Out' ? "bg-white dark:bg-slate-700 text-rose-600 shadow-md" : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                )}
              >
                <ArrowDownRight size={16} className="sm:w-[18px] sm:h-[18px]" />
                Salida
              </button>
            </div>
          )}

          <div className="space-y-6">
            {!selectedItemForBatch && !editingBatchId && (
              <div className="space-y-2">
                <label className="text-sm font-bold text-slate-700 dark:text-slate-300">Seleccionar Material</label>
                <div className="relative">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                  <select 
                    required
                    className="w-full pl-12 pr-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary text-slate-900 dark:text-white"
                    value={newBatch.materialId}
                    onChange={(e) => setNewBatch({...newBatch, materialId: e.target.value})}
                    title="Seleccionar material"
                    aria-label="Seleccionar material"
                  >
                    <option value="">Buscar material...</option>
                    {inventory.sort((a, b) => a.name.localeCompare(b.name)).map(item => (
                      <option key={item.id} value={item.id}>{item.name} ({item.stock} {item.unit})</option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            <div className="flex items-center gap-2 pb-2 border-b border-slate-100 dark:border-slate-800">
              <div className="w-8 h-8 bg-primary/10 rounded-lg flex items-center justify-center text-primary">
                <Layers size={18} />
              </div>
              <h3 className="font-bold text-slate-900 dark:text-white uppercase text-xs tracking-widest">Detalles del Movimiento</h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-sm font-bold text-slate-700 dark:text-slate-300">Cantidad</label>
                <div className="relative">
                  <input 
                    required
                    type="number" 
                    min="0.01"
                    step="any"
                    className="w-full pl-4 pr-12 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary text-slate-900 dark:text-white"
                    value={newBatch.quantity || ''}
                    onChange={(e) => setNewBatch({...newBatch, quantity: Number(e.target.value)})}
                    title="Cantidad del movimiento"
                    aria-label="Cantidad del movimiento"
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">
                    {selectedItemForBatch?.unit}
                  </span>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-bold text-slate-700 dark:text-slate-300">Proyecto Asociado</label>
                <select 
                  className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary text-slate-900 dark:text-white"
                  value={newBatch.projectId}
                  onChange={(e) => setNewBatch({...newBatch, projectId: e.target.value})}
                  title="Proyecto asociado"
                  aria-label="Proyecto asociado"
                >
                  <option value="">{newBatch.type === 'In' ? 'Sin Proyecto (Stock General)' : 'Ajuste de Inventario (Sin Proyecto)'}</option>
                  {projects.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>

              {(newBatch.type === 'In' || editingBatchId) && (
                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-700 dark:text-slate-300">Lote / Referencia</label>
                  <input 
                    type="text" 
                    placeholder="Ej: LOTE-2024-001"
                    className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary text-slate-900 dark:text-white"
                    value={newBatch.batchNumber}
                    onChange={(e) => setNewBatch({...newBatch, batchNumber: e.target.value})}
                  />
                </div>
              )}

              {(newBatch.type === 'In' || editingBatchId) && (
                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-700 dark:text-slate-300">Ubicación en Almacén</label>
                  <input 
                    required
                    type="text" 
                    placeholder="Ej: Pasillo A, Estante 3"
                    className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary text-slate-900 dark:text-white"
                    value={newBatch.location}
                    onChange={(e) => setNewBatch({...newBatch, location: e.target.value})}
                  />
                </div>
              )}

              {newBatch.type === 'In' && !editingBatchId && (
                <>
                  <div className="space-y-2">
                    <label className="text-sm font-bold text-slate-700 dark:text-slate-300">Precio de Compra (Unitario)</label>
                    <div className="relative">
                      <DollarSign className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                      <input 
                        type="number" 
                        step="any"
                        placeholder="0.00"
                        className="w-full pl-12 pr-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary text-slate-900 dark:text-white"
                        value={newBatch.price || ''}
                        onChange={(e) => setNewBatch({...newBatch, price: Number(e.target.value)})}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-bold text-slate-700 dark:text-slate-300">Proveedor</label>
                    <select 
                      className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary text-slate-900 dark:text-white"
                      value={newBatch.supplier}
                      onChange={(e) => setNewBatch({...newBatch, supplier: e.target.value})}
                      title="Seleccionar proveedor"
                      aria-label="Seleccionar proveedor"
                    >
                      <option value="">Seleccionar Proveedor...</option>
                      {suppliers.map(s => (
                        <option key={s.id} value={s.name}>{s.name}</option>
                      ))}
                    </select>
                  </div>
                </>
              )}
            </div>

            {(newBatch.type === 'In' || editingBatchId) && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-700 dark:text-slate-300">Fecha de Fabricación</label>
                  <input 
                    type="date" 
                    className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
                    value={newBatch.manufacturingDate}
                    onChange={(e) => setNewBatch({...newBatch, manufacturingDate: e.target.value})}
                    title="Fecha de fabricacion"
                    aria-label="Fecha de fabricacion"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-700 dark:text-slate-300">Fecha de Vencimiento</label>
                  <input 
                    type="date" 
                    className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
                    value={newBatch.expirationDate}
                    onChange={(e) => setNewBatch({...newBatch, expirationDate: e.target.value})}
                    title="Fecha de vencimiento"
                    aria-label="Fecha de vencimiento"
                  />
                </div>
              </div>
            )}

            <div className="space-y-2">
              <label className="text-sm font-bold text-slate-700 dark:text-slate-300">Motivo / Notas</label>
              <textarea 
                className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary h-24 resize-none text-slate-900 dark:text-white"
                placeholder={newBatch.type === 'Out' ? "Ej: Consumo en obra, Merma, Devolución" : "Notas adicionales sobre la entrada..."}
                value={newBatch.reason}
                onChange={(e) => setNewBatch({...newBatch, reason: e.target.value})}
              />
            </div>
          </div>
        </form>
      </FormModal>

      {/* Add/Edit Material Modal */}
      <FormModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingMaterialId ? 'Editar Material' : 'Nuevo Material'}
        fullVertical
        footer={
          <div className="flex flex-col sm:flex-row justify-between items-center gap-4 w-full">
            <div className="flex gap-2 order-2 sm:order-1">
              <button 
                type="button"
                onClick={() => setIsModalOpen(false)}
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
                      if (!newMaterial.name || !newMaterial.category || !newMaterial.unit || Number(newMaterial.unitPrice) <= 0) {
                        validateField('name', newMaterial.name);
                        validateField('category', newMaterial.category);
                        validateField('unit', newMaterial.unit);
                        validateField('unitPrice', newMaterial.unitPrice);
                        toast.error('Por favor complete los campos obligatorios');
                        return;
                      }
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
                  form="material-form"
                  className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-10 py-3 bg-primary text-white font-bold rounded-xl hover:bg-primary-hover transition-all shadow-lg shadow-primary-shadow"
                >
                  {editingMaterialId ? 'Actualizar Material' : 'Guardar Material'}
                  <CheckCircle2 size={18} />
                </button>
              )}
            </div>
          </div>
        }
      >
        <StepForm
          formId="material-form"
          currentStep={currentStep}
          onStepChange={setCurrentStep}
          onSubmit={handleAddMaterial}
          steps={[
            {
              title: "General",
              content: (
                <FormSection title="Información General" icon={Info} description="Datos básicos de identificación del material">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] ml-1">Nombre del Material *</label>
                      <button
                        type="button"
                        onClick={handleAISuggestions}
                        disabled={isGenerating || !newMaterial.name}
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
                    <FormInput 
                      label=""
                      required
                      value={newMaterial.name}
                      onChange={(e) => {
                        setNewMaterial({...newMaterial, name: e.target.value});
                        validateField('name', e.target.value);
                      }}
                      error={validationErrors.name}
                      placeholder="Ej: Cemento Portland"
                    />
                  </div>
                  <FormSelect 
                    label="Categoría"
                    required
                    value={newMaterial.category}
                    onChange={(e) => {
                      setNewMaterial({...newMaterial, category: e.target.value});
                      validateField('category', e.target.value);
                    }}
                    error={validationErrors.category}
                  >
                    <option value="">Seleccionar Categoría</option>
                    <option value="Materiales">Materiales</option>
                    <option value="Herramientas">Herramientas</option>
                    <option value="Equipo">Equipo</option>
                    <option value="EPP">EPP</option>
                    <option value="Otros">Otros</option>
                  </FormSelect>
                  <FormInput 
                    label="Unidad de Medida"
                    required
                    value={newMaterial.unit}
                    onChange={(e) => {
                      setNewMaterial({...newMaterial, unit: e.target.value});
                      validateField('unit', e.target.value);
                    }}
                    error={validationErrors.unit}
                    placeholder="Ej: Bolsa, m3, kg"
                  />
                  <FormInput 
                    label="Precio Unitario (GTQ)"
                    required
                    type="number" 
                    min="0"
                    step="any"
                    value={newMaterial.unitPrice}
                    onChange={(e) => {
                      setNewMaterial({...newMaterial, unitPrice: Number(e.target.value)});
                      validateField('unitPrice', e.target.value);
                    }}
                    error={validationErrors.unitPrice}
                  />
                </FormSection>
              )
            },
            {
              title: "Stock",
              content: (
                <FormSection title="Stock y Alertas" icon={AlertCircle} description="Control de existencias y niveles mínimos">
                  <FormInput 
                    label="Stock Inicial"
                    required
                    type="number" 
                    min="0"
                    step="any"
                    value={newMaterial.stock}
                    onChange={(e) => {
                      setNewMaterial({...newMaterial, stock: Number(e.target.value)});
                      validateField('stock', e.target.value);
                    }}
                    error={validationErrors.stock}
                  />
                  <FormInput 
                    label="Stock Mínimo (Alerta)"
                    required
                    type="number" 
                    min="0"
                    step="any"
                    value={newMaterial.minStock}
                    onChange={(e) => {
                      setNewMaterial({...newMaterial, minStock: Number(e.target.value)});
                      validateField('minStock', e.target.value);
                    }}
                    error={validationErrors.minStock}
                  />
                </FormSection>
              )
            },
            {
              title: "Proveedores",
              content: (
                <FormSection title="Proveedores Frecuentes" icon={ShoppingCart} description="Empresas que suministran este material">
                  <div className="space-y-4">
                    <div className="flex gap-2">
                      <input 
                        type="text"
                        id="new-supplier"
                        placeholder="Nombre del proveedor"
                        className="flex-1 px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary text-slate-900 dark:text-white"
                        onKeyPress={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            const val = (e.target as HTMLInputElement).value.trim();
                            if (val && !newMaterial.suppliers.includes(val)) {
                              setNewMaterial({...newMaterial, suppliers: [...newMaterial.suppliers, val]});
                              (e.target as HTMLInputElement).value = '';
                            }
                          }
                        }}
                      />
                      <button 
                        type="button"
                        onClick={() => {
                          const input = document.getElementById('new-supplier') as HTMLInputElement;
                          const val = input.value.trim();
                          if (val && !newMaterial.suppliers.includes(val)) {
                            setNewMaterial({...newMaterial, suppliers: [...newMaterial.suppliers, val]});
                            input.value = '';
                          }
                        }}
                        title="Anadir proveedor"
                        aria-label="Anadir proveedor"
                        className="px-6 py-3 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 font-bold rounded-xl hover:bg-slate-200 dark:hover:bg-slate-700 transition-all"
                      >
                        Añadir
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {newMaterial.suppliers.map((s, idx) => (
                        <span key={idx} className="flex items-center gap-2 px-4 py-2 bg-primary-light dark:bg-primary/10 text-primary rounded-xl text-xs font-bold border border-primary/10 dark:border-primary/20">
                          {s}
                          <button 
                            type="button"
                            onClick={() => setNewMaterial({...newMaterial, suppliers: newMaterial.suppliers.filter((_, i) => i !== idx)})}
                            title="Quitar proveedor"
                            aria-label="Quitar proveedor"
                            className="hover:text-rose-600 transition-colors"
                          >
                            <X size={14} />
                          </button>
                        </span>
                      ))}
                      {newMaterial.suppliers.length === 0 && (
                        <p className="text-xs text-slate-400 dark:text-slate-500 italic">No hay proveedores registrados para este material.</p>
                      )}
                    </div>
                  </div>
                </FormSection>
              )
            }
          ]}
        />
      </FormModal>

      {isScannerOpen && (
        <QRScanner 
          onScan={handleScanResult}
          onClose={() => setIsScannerOpen(false)}
        />
      )}
    </>
  );
}
