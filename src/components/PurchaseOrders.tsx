import React, { useEffect, useState, useMemo } from 'react';
import { collection, onSnapshot, updateDoc, doc, deleteDoc, serverTimestamp, addDoc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { 
  ShoppingBag, 
  Clock, 
  CheckCircle2, 
  XCircle, 
  Trash2,
  Calendar,
  User,
  Package,
  FileText,
  Plus,
  X,
  Search,
  Info,
  ChevronLeft,
  ChevronRight,
  Edit3
} from 'lucide-react';
import { StepForm, FormSection, FormInput, FormSelect } from './FormLayout';
import { formatCurrency, cn, handleFirestoreError, OperationType } from '../lib/utils';
import { logAction } from '../lib/audit';
import { FormModal } from './FormModal';
import { toast } from 'sonner';
import { motion } from 'motion/react';
import { sendNotification } from '../lib/notifications';
import ConfirmModal from './ConfirmModal';

export default function PurchaseOrders() {
  const [purchaseOrders, setPurchaseOrders] = useState<any[]>([]);
  const [inventory, setInventory] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [budgetItems, setBudgetItems] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [supplierFilter, setSupplierFilter] = useState('');
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [poToDelete, setPoToDelete] = useState<string | null>(null);
  const [poToEdit, setPoToEdit] = useState<any | null>(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [newPO, setNewPO] = useState({
    projectId: '',
    budgetItemId: '',
    materialId: '',
    quantity: 0,
    supplier: '',
    supplierId: '',
    notes: ''
  });

  useEffect(() => {
    const unsubscribePO = onSnapshot(collection(db, 'purchaseOrders'), (snapshot) => {
      setPurchaseOrders(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setLoading(false);
    }, (error) => handleFirestoreError(error, OperationType.GET, 'purchaseOrders'));

    const unsubscribeInv = onSnapshot(collection(db, 'inventory'), (snapshot) => {
      setInventory(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (error) => handleFirestoreError(error, OperationType.GET, 'inventory'));

    const unsubscribeProjects = onSnapshot(collection(db, 'projects'), (snapshot) => {
      setProjects(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (error) => handleFirestoreError(error, OperationType.GET, 'projects'));

    const unsubscribeSuppliers = onSnapshot(collection(db, 'suppliers'), (snapshot) => {
      setSuppliers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (error) => handleFirestoreError(error, OperationType.GET, 'suppliers'));

    return () => {
      unsubscribePO();
      unsubscribeInv();
      unsubscribeProjects();
      unsubscribeSuppliers();
    };
  }, []);

  useEffect(() => {
    if (newPO.projectId) {
      const unsubscribeBudget = onSnapshot(collection(db, `projects/${newPO.projectId}/budgetItems`), (snapshot) => {
        setBudgetItems(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      }, (error) => handleFirestoreError(error, OperationType.GET, `projects/${newPO.projectId}/budgetItems`));
      return () => unsubscribeBudget();
    } else {
      setBudgetItems([]);
    }
  }, [newPO.projectId]);

  // Suggested quantity logic
  useEffect(() => {
    if (newPO.budgetItemId && newPO.materialId) {
      const budgetItem = budgetItems.find(i => i.id === newPO.budgetItemId);
      if (budgetItem) {
        // Find material in budget item by matching name (since materialId could be name or inventory ID)
        const invMaterial = inventory.find(i => i.id === newPO.materialId);
        const materialName = invMaterial ? invMaterial.name : newPO.materialId;
        
        const budgetMaterial = budgetItem.materials?.find((m: any) => m.name.toLowerCase() === materialName.toLowerCase());
        if (budgetMaterial) {
          const suggested = Math.max(0, budgetMaterial.quantity - (budgetMaterial.purchasedQuantity || 0));
          if (suggested > 0 && newPO.quantity === 0) {
            setNewPO(prev => ({ ...prev, quantity: suggested }));
          }
        }
      }
    }
  }, [newPO.budgetItemId, newPO.materialId, budgetItems, inventory]);

  const filteredPurchaseOrders = useMemo(() => {
    return purchaseOrders.filter(po => 
      po.supplier.toLowerCase().includes(supplierFilter.toLowerCase()) ||
      inventory.find(i => i.id === po.materialId)?.name.toLowerCase().includes(supplierFilter.toLowerCase()) ||
      projects.find(p => p.id === po.projectId)?.name.toLowerCase().includes(supplierFilter.toLowerCase())
    );
  }, [purchaseOrders, supplierFilter, inventory, projects]);

  const totalPages = Math.ceil(filteredPurchaseOrders.length / itemsPerPage);
  const paginatedPurchaseOrders = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredPurchaseOrders.slice(start, start + itemsPerPage);
  }, [filteredPurchaseOrders, currentPage, itemsPerPage]);

  const handleAddPO = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!newPO.materialId) {
      toast.error('Por favor seleccione un material');
      return;
    }
    if (newPO.quantity <= 0) {
      toast.error('La cantidad debe ser un número positivo mayor que cero');
      return;
    }
    if (!newPO.supplierId) {
      toast.error('Por favor seleccione un proveedor');
      return;
    }

    const material = inventory.find(i => i.id === newPO.materialId);
    if (!material) return;

    try {
      if (isEditMode && poToEdit) {
        await updateDoc(doc(db, 'purchaseOrders', poToEdit.id), {
          projectId: newPO.projectId,
          budgetItemId: newPO.budgetItemId,
          materialId: material.id,
          materialName: material.name,
          quantity: Number(newPO.quantity),
          unit: material.unit,
          estimatedCost: Number(newPO.quantity) * material.unitPrice,
          supplier: newPO.supplier,
          supplierId: newPO.supplierId,
          notes: newPO.notes,
          updatedAt: serverTimestamp()
        });

        await logAction(
          'Actualización de Orden de Compra',
          'Compras',
          `Orden de compra #${poToEdit.id.slice(-6).toUpperCase()} actualizada`,
          'update',
          { projectId: newPO.projectId, poId: poToEdit.id }
        );

        toast.success('Orden de compra actualizada');
      } else {
        const docRef = await addDoc(collection(db, 'purchaseOrders'), {
          projectId: newPO.projectId,
          budgetItemId: newPO.budgetItemId,
          materialId: material.id,
          materialName: material.name,
          quantity: Number(newPO.quantity),
          unit: material.unit,
          estimatedCost: Number(newPO.quantity) * material.unitPrice,
          supplier: newPO.supplier,
          supplierId: newPO.supplierId,
          notes: newPO.notes,
          status: 'Pending',
          date: new Date().toISOString().split('T')[0],
          createdAt: serverTimestamp()
        });

        // Deduct from stock as requested by user (Stock represents remaining requirement)
        const materialRef = doc(db, 'inventory', material.id);
        const materialSnap = await getDoc(materialRef);
        if (materialSnap.exists()) {
          const materialData = materialSnap.data();
          await updateDoc(materialRef, {
            stock: Math.max(0, (materialData.stock || 0) - Number(newPO.quantity)),
            updatedAt: serverTimestamp()
          });
        }

        await logAction(
          'Creación de Orden de Compra',
          'Compras',
          `Nueva orden de compra para ${material.name} (${newPO.quantity} ${material.unit}) - Proveedor: ${newPO.supplier}. Se descontó del stock de requerimientos.`,
          'create',
          { projectId: newPO.projectId, poId: docRef.id }
        );

        toast.success('Orden de compra creada y stock de requerimientos actualizado');
      }

      setIsModalOpen(false);
      setNewPO({ projectId: '', budgetItemId: '', materialId: '', quantity: 0, supplier: '', supplierId: '', notes: '' });
      setIsEditMode(false);
      setPoToEdit(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'purchaseOrders');
    }
  };

  const handleUpdateStatus = async (id: string, status: string) => {
    try {
      const po = purchaseOrders.find(p => p.id === id);
      if (!po) return;

      await updateDoc(doc(db, 'purchaseOrders', id), {
        status,
        updatedAt: serverTimestamp(),
        ...(status === 'Completed' ? { dateReceived: new Date().toISOString().split('T')[0] } : {})
      });

      await logAction(
        'Actualización de Orden de Compra',
        'Compras',
        `Orden de compra #${id.slice(-6).toUpperCase()} cambió a estado: ${status}`,
        'update',
        { projectId: po.projectId, poId: id }
      );

      // Handle stock adjustments based on status
      if (status === 'Cancelled') {
        // Return to stock if cancelled (since it was deducted on creation)
        if (po.materialId) {
          const materialRef = doc(db, 'inventory', po.materialId);
          const materialSnap = await getDoc(materialRef);
          
          if (materialSnap.exists()) {
            const materialData = materialSnap.data();
            await updateDoc(materialRef, {
              stock: (materialData.stock || 0) + (po.quantity || 0),
              updatedAt: serverTimestamp()
            });
          }
        }
      } else if (status === 'Completed') {
        // Update Project Budget Material Tracking and Recalculate Costs
        if (po.projectId && po.budgetItemId && po.materialName) {
          const budgetItemRef = doc(db, `projects/${po.projectId}/budgetItems`, po.budgetItemId);
          const budgetItemSnap = await getDoc(budgetItemRef);

          if (budgetItemSnap.exists()) {
            const budgetItemData = budgetItemSnap.data();
            const actualUnitPrice = po.estimatedCost / po.quantity;

            const updatedMaterials = (budgetItemData.materials || []).map((m: any) => {
              if (m.name.toLowerCase() === po.materialName.toLowerCase()) {
                return {
                  ...m,
                  purchasedQuantity: (m.purchasedQuantity || 0) + po.quantity,
                  unitPrice: actualUnitPrice // Update with actual purchase price
                };
              }
              return m;
            });

            // Recalculate costs
            const materialCost = updatedMaterials.reduce((sum: number, m: any) => sum + (m.quantity * m.unitPrice), 0);
            const laborCost = (budgetItemData.labor || []).reduce((sum: number, l: any) => sum + (l.dailyRate / l.yield), 0);
            const directCost = materialCost + laborCost;
            const indirectCost = directCost * (budgetItemData.indirectFactor || 0.2);
            const totalUnitPrice = directCost + indirectCost;
            const totalItemPrice = (budgetItemData.quantity || 1) * totalUnitPrice;

            await updateDoc(budgetItemRef, {
              materials: updatedMaterials,
              materialCost,
              totalUnitPrice,
              totalItemPrice,
              updatedAt: serverTimestamp()
            });

            // Record financial transaction
            await addDoc(collection(db, 'transactions'), {
              projectId: po.projectId,
              budgetItemId: po.budgetItemId,
              amount: po.estimatedCost,
              type: 'Expense',
              category: 'Materiales',
              description: `Compra de ${po.materialName} (Orden #${po.id.slice(0, 5)})`,
              date: new Date().toISOString(),
              status: 'Completed',
              createdAt: serverTimestamp()
            });
          }
        }
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `purchaseOrders/${id}`);
    }
  };

  const handleDelete = (id: string) => {
    setPoToDelete(id);
    setIsDeleteConfirmOpen(true);
  };

  const handleEdit = (po: any) => {
    setPoToEdit(po);
    setNewPO({
      projectId: po.projectId || '',
      budgetItemId: po.budgetItemId || '',
      materialId: po.materialId || '',
      quantity: po.quantity || 0,
      supplier: po.supplier || '',
      supplierId: po.supplierId || '',
      notes: po.notes || ''
    });
    setIsEditMode(true);
    setIsModalOpen(true);
    setCurrentStep(0);
  };

  const confirmDeletePO = async () => {
    if (!poToDelete) return;
    try {
      const po = purchaseOrders.find(p => p.id === poToDelete);
      await deleteDoc(doc(db, 'purchaseOrders', poToDelete));
      
      if (po) {
        await logAction(
          'Eliminación de Orden de Compra',
          'Compras',
          `Orden de compra #${poToDelete.slice(-6).toUpperCase()} eliminada`,
          'delete',
          { projectId: po.projectId, poId: poToDelete }
        );
      }

      setPoToDelete(null);
      toast.success('Orden de compra eliminada');
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `purchaseOrders/${poToDelete}`);
    }
  };

  return (
    <>
      <ConfirmModal
        isOpen={isDeleteConfirmOpen}
        onClose={() => setIsDeleteConfirmOpen(false)}
        onConfirm={confirmDeletePO}
        title="Eliminar Orden de Compra"
        message="¿Estás seguro de que deseas eliminar esta orden de compra? Esta acción no se puede deshacer."
      />

      <div className="space-y-8">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Ordenes de Compra</h1>
          <p className="text-slate-500">Gestión y seguimiento de pedidos a proveedores</p>
        </div>
        <button 
          onClick={() => setIsModalOpen(true)}
          className="flex items-center justify-center gap-2 bg-primary text-white font-bold py-3 px-6 rounded-xl hover:bg-primary-hover transition-all shadow-lg shadow-primary-shadow"
        >
          <Plus size={20} />
          Añadir Material
        </button>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-4">
          <div className="p-3 bg-primary-light text-primary rounded-xl">
            <Clock size={24} />
          </div>
          <div>
            <p className="text-xs text-slate-500 font-bold uppercase tracking-wider">Pendientes</p>
            <p className="text-2xl font-bold text-slate-900">{purchaseOrders.filter(po => po.status === 'Pending').length}</p>
          </div>
        </div>
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-4">
          <div className="p-3 bg-emerald-100 text-emerald-600 rounded-xl">
            <CheckCircle2 size={24} />
          </div>
          <div>
            <p className="text-xs text-slate-500 font-bold uppercase tracking-wider">Completadas</p>
            <p className="text-2xl font-bold text-slate-900">{purchaseOrders.filter(po => po.status === 'Completed').length}</p>
          </div>
        </div>
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-4">
          <div className="p-3 bg-blue-100 text-blue-600 rounded-xl">
            <ShoppingBag size={24} />
          </div>
          <div>
            <p className="text-xs text-slate-500 font-bold uppercase tracking-wider">Total Ordenes</p>
            <p className="text-2xl font-bold text-slate-900">{purchaseOrders.length}</p>
          </div>
        </div>
      </div>

      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
        <input 
          type="text" 
          placeholder="Filtrar por proveedor..." 
          className="w-full pl-12 pr-4 py-4 bg-white border border-slate-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-primary transition-all shadow-sm"
          value={supplierFilter}
          onChange={(e) => {
            setSupplierFilter(e.target.value);
            setCurrentPage(1);
          }}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {paginatedPurchaseOrders.map((po) => (
          <motion.div 
            key={po.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className={cn(
              "bg-white dark:bg-slate-900 rounded-2xl shadow-sm border overflow-hidden transition-all",
              po.status === 'Pending' ? "border-primary-light dark:border-primary/30 ring-1 ring-primary-light dark:ring-primary/20 shadow-primary-shadow/10" : "border-slate-100 dark:border-slate-800"
            )}
          >
            <div className={cn(
              "p-6 border-b flex items-start justify-between",
              po.status === 'Pending' ? "bg-primary-light/30 dark:bg-primary/5 border-primary-light dark:border-primary/20" : "border-slate-50 dark:border-slate-800"
            )}>
              <div className="flex items-center gap-4">
                <div className={cn(
                  "p-3 rounded-xl",
                  po.status === 'Pending' ? "bg-primary-light dark:bg-primary/20 text-primary" :
                  po.status === 'Completed' ? "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600" :
                  "bg-rose-50 dark:bg-rose-500/10 text-rose-600"
                )}>
                  <ShoppingBag size={24} />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white">{po.materialName}</h3>
                  <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 mt-1">
                    <Calendar size={14} />
                    <span>{po.date}</span>
                    <span className="mx-1">•</span>
                    <span className={cn(
                      "px-2 py-0.5 rounded-full font-bold uppercase tracking-wider text-[10px]",
                      po.status === 'Pending' ? "bg-primary-light dark:bg-primary/20 text-primary" :
                      po.status === 'Completed' ? "bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400" :
                      "bg-rose-100 dark:bg-rose-500/20 text-rose-700 dark:text-rose-400"
                    )}>
                      {po.status === 'Pending' ? 'Pendiente' : po.status === 'Completed' ? 'Recibido' : 'Cancelado'}
                    </span>
                    {po.status === 'Completed' && po.dateReceived && (
                      <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 px-2 py-0.5 rounded-full">
                        Recibido: {po.dateReceived}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {po.status === 'Pending' && (
                  <>
                    <div className="flex items-center gap-1 text-[10px] font-bold text-primary animate-pulse bg-primary-light dark:bg-primary/20 px-2 py-1 rounded-full">
                      <Clock size={12} />
                      ACCION REQUERIDA
                    </div>
                    <button 
                      onClick={() => handleEdit(po)}
                      className="p-2 text-slate-400 hover:text-primary transition-colors"
                      title="Editar Orden"
                    >
                      <Edit3 size={18} />
                    </button>
                  </>
                )}
                <button 
                  onClick={() => handleDelete(po.id)}
                  className="p-2 text-slate-400 hover:text-rose-600 transition-colors"
                >
                  <Trash2 size={18} />
                </button>
              </div>
            </div>

            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider">
                    <Package size={14} />
                    Cantidad
                  </div>
                  <p className="text-lg font-bold text-slate-900 dark:text-white">{po.quantity} {po.unit}</p>
                </div>
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider">
                    <User size={14} />
                    Proveedor
                  </div>
                  <p className="text-lg font-bold text-slate-900 dark:text-white truncate">{po.supplier || 'No especificado'}</p>
                </div>
              </div>

              <div className={cn(
                "p-4 rounded-xl",
                po.status === 'Pending' ? "bg-primary-light/50 dark:bg-primary/5 border border-primary-light dark:border-primary/20" : "bg-slate-50 dark:bg-slate-800/50"
              )}>
                <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider mb-2">
                  <FileText size={14} />
                  Notas
                </div>
                <p className="text-sm text-slate-600 dark:text-slate-400">{po.notes || 'Sin notas adicionales'}</p>
              </div>

              <div className="flex items-center justify-between pt-4 border-t border-slate-50 dark:border-slate-800">
                <div>
                  <p className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-wider mb-1">Costo Estimado</p>
                  <p className="text-xl font-bold text-slate-900 dark:text-white">{formatCurrency(po.estimatedCost)}</p>
                </div>
                <div className="flex gap-2">
                  {po.status === 'Pending' && (
                    <>
                      <button 
                        onClick={() => handleUpdateStatus(po.id, 'Cancelled')}
                        className="flex items-center gap-2 px-4 py-2 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/10 font-bold text-xs rounded-xl transition-colors"
                        title="Cancelar Orden"
                      >
                        <XCircle size={18} />
                        Cancelar
                      </button>
                      <button 
                        disabled={po.status !== 'Pending'}
                        onClick={() => handleUpdateStatus(po.id, 'Completed')}
                        className={cn(
                          "flex items-center gap-2 px-6 py-3 text-xs font-black uppercase tracking-widest rounded-xl transition-all shadow-lg",
                          po.status === 'Pending' 
                            ? "bg-emerald-600 text-white hover:bg-emerald-700 shadow-emerald-100 dark:shadow-none" 
                            : "bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-600 cursor-not-allowed shadow-none"
                        )}
                      >
                        <CheckCircle2 size={18} />
                        Recibir Pedido
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex flex-col md:flex-row items-center justify-between gap-4 bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm mt-8">
          <div className="flex items-center gap-4">
            <span className="text-sm text-slate-500 dark:text-slate-400 font-medium">
              Mostrando {paginatedPurchaseOrders.length} de {filteredPurchaseOrders.length} órdenes
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
              >
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={50}>50</option>
              </select>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button 
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
              disabled={currentPage === totalPages}
              onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
              className="p-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 transition-all disabled:opacity-50 disabled:cursor-not-allowed text-slate-600 dark:text-slate-400"
            >
              <ChevronRight size={20} />
            </button>
          </div>
        </div>
      )}

      {filteredPurchaseOrders.length === 0 && !loading && (
        <div className="flex flex-col items-center justify-center py-20 bg-white dark:bg-slate-900 rounded-3xl border border-dashed border-slate-200 dark:border-slate-800">
          <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-full mb-4">
            <ShoppingBag size={48} className="text-slate-300 dark:text-slate-600" />
          </div>
          <h3 className="text-lg font-bold text-slate-900 dark:text-white">No hay ordenes de compra</h3>
          <p className="text-slate-500 dark:text-slate-400 mb-6">Las ordenes generadas desde el inventario aparecerán aquí.</p>
          <button 
            onClick={() => setIsModalOpen(true)}
            className="flex items-center justify-center gap-2 bg-primary text-white font-bold py-3 px-6 rounded-xl hover:bg-primary-hover transition-all shadow-lg shadow-primary-shadow"
          >
            <Plus size={20} />
            Crear Primera Requisición
          </button>
        </div>
      )}

      <FormModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setNewPO({ projectId: '', budgetItemId: '', materialId: '', quantity: 0, supplier: '', supplierId: '', notes: '' });
          setCurrentStep(0);
          setIsEditMode(false);
          setPoToEdit(null);
        }}
        title={isEditMode ? "Editar Requisición" : "Nueva Requisición"}
        maxWidth="max-w-md"
        fullVertical
        footer={
          <div className="flex flex-col sm:flex-row justify-between items-center gap-4 w-full">
            <div className="flex gap-2 order-2 sm:order-1">
              <button 
                type="button"
                onClick={() => {
                  setIsModalOpen(false);
                  setNewPO({ projectId: '', budgetItemId: '', materialId: '', quantity: 0, supplier: '', supplierId: '', notes: '' });
                  setCurrentStep(0);
                  setIsEditMode(false);
                  setPoToEdit(null);
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
                    if (currentStep === 0) {
                      // Project is optional, but if selected, budget item might be needed
                    } else if (currentStep === 1) {
                      if (!newPO.materialId) {
                        toast.error('Por favor seleccione un material');
                        return;
                      }
                      if (newPO.quantity <= 0) {
                        toast.error('La cantidad debe ser mayor a cero');
                        return;
                      }
                    } else if (currentStep === 2) {
                      if (!newPO.supplierId) {
                        toast.error('Por favor seleccione un proveedor');
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
                  form="po-form"
                  className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-10 py-3 bg-primary text-white font-bold rounded-xl hover:bg-primary-hover transition-all shadow-lg shadow-primary-shadow"
                >
                  {isEditMode ? "Actualizar Orden" : "Crear Orden"}
                  <CheckCircle2 size={18} />
                </button>
              )}
            </div>
          </div>
        }
      >
        <StepForm
          formId="po-form"
          currentStep={currentStep}
          onStepChange={setCurrentStep}
          onSubmit={handleAddPO}
          steps={[
            {
              title: "Proyecto",
              content: (
                <FormSection title="Asignación" icon={Info} description="Vincular a un proyecto o presupuesto">
                  <FormSelect 
                    label="Proyecto (Opcional)"
                    value={newPO.projectId}
                    onChange={(e) => setNewPO({...newPO, projectId: e.target.value, budgetItemId: '', materialId: ''})}
                  >
                    <option value="">Seleccione un proyecto...</option>
                    {projects.map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </FormSelect>
                  {newPO.projectId && (
                    <FormSelect 
                      label="Renglón de Presupuesto"
                      required
                      value={newPO.budgetItemId}
                      onChange={(e) => setNewPO({...newPO, budgetItemId: e.target.value, materialId: ''})}
                    >
                      <option value="">Seleccione un renglón...</option>
                      {budgetItems.map(item => (
                        <option key={item.id} value={item.id}>{item.description}</option>
                      ))}
                    </FormSelect>
                  )}
                </FormSection>
              )
            },
            {
              title: "Material",
              content: (
                <FormSection title="Detalles del Material" icon={Package} description="Especificar qué se está solicitando">
                  <FormSelect 
                    label="Material"
                    required
                    value={newPO.materialId}
                    onChange={(e) => setNewPO({...newPO, materialId: e.target.value})}
                  >
                    <option value="">Seleccione un material...</option>
                    {newPO.budgetItemId ? (
                      budgetItems.find(i => i.id === newPO.budgetItemId)?.materials.map((m: any) => {
                        const invItem = inventory.find(inv => 
                          inv.name.toLowerCase() === m.name.toLowerCase() && 
                          inv.projectId === newPO.projectId
                        );
                        return (
                          <option key={m.name} value={invItem?.id || m.name}>
                            {m.name} ({m.unit})
                          </option>
                        );
                      })
                    ) : (
                      inventory
                        .filter(item => !newPO.projectId || item.projectId === newPO.projectId)
                        .map(item => (
                          <option key={item.id} value={item.id}>{item.name} ({item.unit})</option>
                        ))
                    )}
                  </FormSelect>
                  <FormInput 
                    label="Cantidad"
                    required
                    type="number" 
                    min="0.01"
                    step="any"
                    value={newPO.quantity || ''}
                    onChange={(e) => setNewPO({...newPO, quantity: Number(e.target.value)})}
                    placeholder="Cantidad a solicitar"
                  />
                  {newPO.materialId && newPO.quantity > 0 && (
                    <div className="p-4 bg-primary-light dark:bg-primary/10 rounded-xl border border-primary-light dark:border-primary/20">
                      <div className="flex justify-between items-center">
                        <span className="text-xs font-bold text-primary uppercase">Costo Estimado</span>
                        <span className="text-lg font-bold text-primary">
                          {formatCurrency(newPO.quantity * (inventory.find(i => i.id === newPO.materialId)?.unitPrice || 0))}
                        </span>
                      </div>
                    </div>
                  )}
                </FormSection>
              )
            },
            {
              title: "Proveedor",
              content: (
                <FormSection title="Logística" icon={User} description="Información del proveedor y notas">
                  <FormSelect 
                    label="Proveedor"
                    required
                    value={newPO.supplierId}
                    onChange={(e) => {
                      const sup = suppliers.find(s => s.id === e.target.value);
                      setNewPO({...newPO, supplierId: e.target.value, supplier: sup?.name || ''});
                    }}
                  >
                    <option value="">Seleccione un proveedor...</option>
                    {suppliers.map(s => (
                      <option key={s.id} value={s.id}>{s.name} ({s.category})</option>
                    ))}
                  </FormSelect>
                  <div className="space-y-2 group">
                    <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] ml-1 group-focus-within:text-primary transition-colors">
                      Notas
                    </label>
                    <textarea 
                      className="w-full px-5 py-4 bg-white dark:bg-slate-900 border-2 border-slate-100 dark:border-slate-800 rounded-2xl focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/5 transition-all font-medium text-slate-900 dark:text-white h-32 resize-none"
                      value={newPO.notes}
                      onChange={(e) => setNewPO({...newPO, notes: e.target.value})}
                      placeholder="Instrucciones adicionales..."
                    ></textarea>
                  </div>
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
