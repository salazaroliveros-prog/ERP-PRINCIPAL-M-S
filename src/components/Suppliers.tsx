import React, { useState, useMemo, useEffect } from 'react';
import { 
  Truck, 
  Plus, 
  Search, 
  Filter, 
  MoreVertical, 
  Phone, 
  Mail, 
  MapPin, 
  MessageCircle,
  Star, 
  ShieldCheck, 
  Clock,
  ChevronRight,
  ChevronLeft,
  TrendingUp,
  Package,
  CreditCard,
  X,
  Trash2,
  Edit2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn, formatCurrency, handleApiError, OperationType } from '../lib/utils';
import { logAction } from '../lib/audit';
import { toast } from 'sonner';
import ConfirmModal from './ConfirmModal';
import { createSupplier, createSupplierPayment, deleteSupplier, deleteSupplierPayment, listSupplierPayments, listSuppliers, updateSupplier, updateSupplierPayment } from '../lib/suppliersApi';
import { escapeCsvCell, getBrandedCsvPreamble } from '../lib/reportBranding';

export default function Suppliers() {
  const projectCardEffectClass = 'rounded-[var(--radius-theme)] shadow-[var(--shadow-theme)] border border-slate-100 dark:border-slate-800 hover:shadow-lg hover:border-primary/30 transition-all duration-500';
  const getStatHoverClass = (color: string) => {
    if (color.includes('blue')) return 'hover:border-blue-300 dark:hover:border-blue-500/40';
    if (color.includes('rose')) return 'hover:border-rose-300 dark:hover:border-rose-500/40';
    if (color.includes('emerald')) return 'hover:border-emerald-300 dark:hover:border-emerald-500/40';
    if (color.includes('amber')) return 'hover:border-amber-300 dark:hover:border-amber-500/40';
    return 'hover:border-primary/40 dark:hover:border-primary/50';
  };

  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(5);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editingSupplierId, setEditingSupplierId] = useState<string | null>(null);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [supplierToDelete, setSupplierToDelete] = useState<string | null>(null);
  const [quickSupplierId, setQuickSupplierId] = useState<string>('');
  const [supplierPayments, setSupplierPayments] = useState<any[]>([]);
  const [paymentsLoading, setPaymentsLoading] = useState(false);
  const [paymentDateFrom, setPaymentDateFrom] = useState('');
  const [paymentDateTo, setPaymentDateTo] = useState('');
  const [editingPaymentId, setEditingPaymentId] = useState<string | null>(null);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [isPaymentDeleteConfirmOpen, setIsPaymentDeleteConfirmOpen] = useState(false);
  const [paymentToDelete, setPaymentToDelete] = useState<string | null>(null);
  const [paymentForm, setPaymentForm] = useState({
    amount: '',
    paymentMethod: 'banrural_virtual',
    paymentReference: '',
    notes: '',
    paidAt: new Date().toISOString().slice(0, 10),
  });
  const [newSupplier, setNewSupplier] = useState({
    name: '',
    category: 'Materiales',
    contact: '',
    email: '',
    phone: '',
    rating: 5.0,
    status: 'Verified',
    balance: 0
  });

  const loadSuppliers = React.useCallback(async () => {
    try {
      const items = await listSuppliers();
      setSuppliers(items);
    } catch (error) {
      handleApiError(error, OperationType.GET, 'suppliers');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSuppliers();
  }, [loadSuppliers]);

  useEffect(() => {
    const handleQuickActionTrigger = (event: Event) => {
      const customEvent = event as CustomEvent<{ action?: string }>;
      if (customEvent.detail?.action !== 'new-supplier') return;

      setIsEditMode(false);
      setEditingSupplierId(null);
      setNewSupplier({
        name: '',
        category: 'Materiales',
        contact: '',
        email: '',
        phone: '',
        rating: 5.0,
        status: 'Verified',
        balance: 0
      });
      setIsModalOpen(true);
    };

    window.addEventListener('QUICK_ACTION_TRIGGER', handleQuickActionTrigger as EventListener);
    return () => window.removeEventListener('QUICK_ACTION_TRIGGER', handleQuickActionTrigger as EventListener);
  }, []);

  useEffect(() => {
    if (!quickSupplierId && suppliers.length > 0) {
      setQuickSupplierId(suppliers[0].id);
    }
  }, [suppliers, quickSupplierId]);

  const filteredSuppliers = useMemo(() => {
    return suppliers.filter(sup => 
      sup.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      sup.category.toLowerCase().includes(searchTerm.toLowerCase()) ||
      sup.contact.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [suppliers, searchTerm]);

  const totalPages = Math.ceil(filteredSuppliers.length / itemsPerPage);
  const paginatedSuppliers = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredSuppliers.slice(start, start + itemsPerPage);
  }, [filteredSuppliers, currentPage, itemsPerPage]);

  const handleAddSupplier = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (isEditMode && editingSupplierId) {
        await updateSupplier(editingSupplierId, { ...newSupplier });
        toast.success('Proveedor actualizado exitosamente');
        await logAction('Edición de Proveedor', 'Proveedores', `Proveedor ${newSupplier.name} actualizado`, 'update', { supplierId: editingSupplierId });
      } else {
        const saved = await createSupplier({ ...newSupplier });
        toast.success('Proveedor registrado exitosamente');
        await logAction('Registro de Proveedor', 'Proveedores', `Nuevo proveedor ${newSupplier.name} registrado`, 'create', { supplierId: saved.id });
      }

      await loadSuppliers();

      setIsModalOpen(false);
      setIsEditMode(false);
      setEditingSupplierId(null);
      setNewSupplier({
        name: '',
        category: 'Materiales',
        contact: '',
        email: '',
        phone: '',
        rating: 5.0,
        status: 'Verified',
        balance: 0
      });
    } catch (error) {
      handleApiError(error, isEditMode ? OperationType.UPDATE : OperationType.CREATE, 'suppliers');
    }
  };

  const handleEditSupplier = (sup: any) => {
    setEditingSupplierId(sup.id);
    setIsEditMode(true);
    setNewSupplier({
      name: sup.name,
      category: sup.category,
      contact: sup.contact,
      email: sup.email,
      phone: sup.phone,
      rating: sup.rating,
      status: sup.status,
      balance: sup.balance
    });
    setIsModalOpen(true);
  };

  const handleDeleteSupplier = async () => {
    if (!supplierToDelete) return;
    try {
      const supplier = suppliers.find(s => s.id === supplierToDelete);
      await deleteSupplier(supplierToDelete);
      toast.success('Proveedor eliminado exitosamente');
      await logAction('Eliminación de Proveedor', 'Proveedores', `Proveedor ${supplier?.name || supplierToDelete} eliminado`, 'delete', { supplierId: supplierToDelete });
      await loadSuppliers();
      setIsDeleteConfirmOpen(false);
      setSupplierToDelete(null);
    } catch (error) {
      handleApiError(error, OperationType.DELETE, 'suppliers');
    }
  };

  const stats = useMemo(() => {
    const totalBalance = suppliers.reduce((acc, sup) => acc + (sup.balance || 0), 0);
    const avgRating = suppliers.length > 0 
      ? (suppliers.reduce((acc, sup) => acc + (sup.rating || 0), 0) / suppliers.length).toFixed(1)
      : '0.0';
    
    return [
      { label: 'Total Proveedores', value: suppliers.length.toString(), icon: Truck, color: 'bg-blue-500' },
      { label: 'Cuentas por Pagar', value: formatCurrency(totalBalance), icon: CreditCard, color: 'bg-rose-500' },
      { label: 'Órdenes Activas', value: '0', icon: Package, color: 'bg-emerald-500' }, // Placeholder for now
      { label: 'Calificación Promedio', value: avgRating, icon: Star, color: 'bg-amber-500' },
    ];
  }, [suppliers]);

  const quickSupplier = useMemo(() => {
    if (!quickSupplierId) return suppliers[0] || null;
    return suppliers.find((sup) => sup.id === quickSupplierId) || suppliers[0] || null;
  }, [suppliers, quickSupplierId]);

  const filteredSupplierPayments = useMemo(() => {
    return supplierPayments.filter((pay) => {
      const paidAt = String(pay?.paidAt || '').slice(0, 10);
      if (!paidAt) return true;
      if (paymentDateFrom && paidAt < paymentDateFrom) return false;
      if (paymentDateTo && paidAt > paymentDateTo) return false;
      return true;
    });
  }, [supplierPayments, paymentDateFrom, paymentDateTo]);

  const exportSupplierPaymentsCsv = () => {
    if (!quickSupplier) {
      toast.error('No hay proveedor seleccionado');
      return;
    }

    if (filteredSupplierPayments.length === 0) {
      toast.info('No hay pagos para exportar en el rango seleccionado');
      return;
    }

    const headers = ['proveedor', 'fecha_pago', 'monto', 'metodo', 'referencia', 'orden_compra', 'notas'];
    const rows = filteredSupplierPayments.map((pay) => [
      quickSupplier.name,
      pay.paidAt || '',
      Number(pay.amount || 0).toFixed(2),
      String(pay.paymentMethod || ''),
      String(pay.paymentReference || ''),
      String(pay.purchaseOrderId || ''),
      String(pay.notes || ''),
    ]);

    const csvContent = [
      ...getBrandedCsvPreamble('Pagos a proveedores', [`Proveedor: ${quickSupplier.name}`]),
      [],
      headers,
      ...rows,
    ].map((row) => row.map(escapeCsvCell).join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const safeSupplierName = String(quickSupplier.name || 'proveedor').replace(/[^a-zA-Z0-9_-]/g, '_');
    const stamp = new Date().toISOString().slice(0, 10);
    link.href = url;
    link.download = `pagos_${safeSupplierName}_${stamp}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success('CSV exportado correctamente');
  };

  useEffect(() => {
    if (!quickSupplier?.id) {
      setSupplierPayments([]);
      return;
    }

    let cancelled = false;
    setPaymentsLoading(true);
    listSupplierPayments({ supplierId: quickSupplier.id })
      .then((items) => {
        if (cancelled) return;
        setSupplierPayments(items);
      })
      .catch((error) => {
        if (cancelled) return;
        handleApiError(error, OperationType.GET, 'supplier-payments');
      })
      .finally(() => {
        if (cancelled) return;
        setPaymentsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [quickSupplier?.id]);

  const openMailToSupplier = async (supplier: any, subject: string, body: string, actionName: string) => {
    if (!supplier?.email) {
      toast.error('El proveedor no tiene correo registrado');
      return;
    }

    const mailToUrl = `mailto:${supplier.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.location.href = mailToUrl;
    await logAction(actionName, 'Proveedores', `Acción rápida para ${supplier.name}`, 'read', { supplierId: supplier.id });
    toast.success('Se abrió el correo para el proveedor');
  };

  const handleQuickQuote = async () => {
    if (!quickSupplier) {
      toast.error('No hay proveedor seleccionado');
      return;
    }

    await openMailToSupplier(
      quickSupplier,
      `Solicitud de cotización - ${quickSupplier.category || 'Proveedor'}`,
      `Estimado(a) ${quickSupplier.contact || quickSupplier.name},\n\nPor favor comparta una cotización actualizada para materiales/servicios de la categoría ${quickSupplier.category || 'general'}.\n\nGracias.`,
      'Acción Rápida: Solicitar Cotización'
    );
  };

  const handleQuickCall = async () => {
    if (!quickSupplier) {
      toast.error('No hay proveedor seleccionado');
      return;
    }

    if (!quickSupplier.phone) {
      toast.error('El proveedor no tiene teléfono registrado');
      return;
    }

    const phoneDigits = String(quickSupplier.phone).replace(/\s+/g, '');
    window.location.href = `tel:${phoneDigits}`;
    await logAction('Acción Rápida: Llamar Proveedor', 'Proveedores', `Llamada rápida a ${quickSupplier.name}`, 'read', { supplierId: quickSupplier.id });
  };

  const handleQuickVisit = async () => {
    if (!quickSupplier) {
      toast.error('No hay proveedor seleccionado');
      return;
    }

    const query = encodeURIComponent(`${quickSupplier.name} ${quickSupplier.contact || ''} Guatemala`);
    window.open(`https://www.google.com/maps/search/?api=1&query=${query}`, '_blank');
    await logAction('Acción Rápida: Visitar Proveedor', 'Proveedores', `Búsqueda de ubicación para ${quickSupplier.name}`, 'read', { supplierId: quickSupplier.id });
    toast.success('Abriendo ubicación del proveedor');
  };

  const handleQuickWhatsApp = async () => {
    if (!quickSupplier) {
      toast.error('No hay proveedor seleccionado');
      return;
    }

    if (!quickSupplier.phone) {
      toast.error('El proveedor no tiene teléfono registrado');
      return;
    }

    const cleanPhone = String(quickSupplier.phone).replace(/\D/g, '');
    const message = encodeURIComponent(
      `Hola ${quickSupplier.contact || quickSupplier.name}, somos de Constructora WM_M&S. ` +
      `Queremos coordinar información de ${quickSupplier.category || 'insumos'} y disponibilidad.`
    );

    window.open(`https://wa.me/${cleanPhone}?text=${message}`, '_blank');
    await logAction('Acción Rápida: WhatsApp Proveedor', 'Proveedores', `WhatsApp rápido a ${quickSupplier.name}`, 'read', { supplierId: quickSupplier.id });
    toast.success('Abriendo WhatsApp del proveedor');
  };

  const handleQuickPay = async () => {
    if (!quickSupplier) {
      toast.error('No hay proveedor seleccionado');
      return;
    }

    if (!quickSupplier.balance || quickSupplier.balance <= 0) {
      toast.info('Este proveedor no tiene saldo pendiente');
      return;
    }

    const amountRaw = window.prompt('Monto a pagar', String(Number(quickSupplier.balance || 0).toFixed(2)));
    if (!amountRaw) return;
    const amount = Number(amountRaw);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error('Monto inválido');
      return;
    }

    const methodRaw = (window.prompt('Metodo de pago: paypal o banrural_virtual', 'banrural_virtual') || 'banrural_virtual').trim().toLowerCase();
    const paymentMethod = methodRaw === 'paypal' ? 'paypal' : 'banrural_virtual';
    const paymentReference = window.prompt('Referencia de pago (opcional)', '') || '';

    await createSupplierPayment({
      supplierId: quickSupplier.id,
      amount,
      paymentMethod,
      paymentReference,
      notes: `Pago rapido desde Proveedores para ${quickSupplier.name}`,
      paidAt: new Date().toISOString().slice(0, 10),
    });

    if (paymentMethod === 'paypal') {
      window.open('https://www.paypal.com/signin', '_blank');
    } else {
      window.open('https://www.banrural.com.gt', '_blank');
    }

    await loadSuppliers();
    const latestPayments = await listSupplierPayments({ supplierId: quickSupplier.id });
    setSupplierPayments(latestPayments);
    await logAction('Acción Rápida: Gestionar Pago', 'Proveedores', `Pago registrado para ${quickSupplier.name} por ${formatCurrency(amount)}`, 'update', { supplierId: quickSupplier.id, paymentMethod });
    toast.success('Pago registrado correctamente');
  };

  const handleOpenEditPayment = (payment: any) => {
    setEditingPaymentId(payment.id);
    setPaymentForm({
      amount: String(Number(payment.amount || 0).toFixed(2)),
      paymentMethod: String(payment.paymentMethod || 'banrural_virtual'),
      paymentReference: String(payment.paymentReference || ''),
      notes: String(payment.notes || ''),
      paidAt: String(payment.paidAt || '').slice(0, 10) || new Date().toISOString().slice(0, 10),
    });
    setIsPaymentModalOpen(true);
  };

  const handleSavePaymentEdit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!editingPaymentId || !quickSupplier) return;

    const amount = Number(paymentForm.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error('Monto inválido');
      return;
    }

    try {
      await updateSupplierPayment(editingPaymentId, {
        amount,
        paymentMethod: paymentForm.paymentMethod as any,
        paymentReference: paymentForm.paymentReference,
        notes: paymentForm.notes,
        paidAt: paymentForm.paidAt,
      });

      const [latestPayments] = await Promise.all([
        listSupplierPayments({ supplierId: quickSupplier.id }),
        loadSuppliers(),
      ]);

      setSupplierPayments(latestPayments);
      setIsPaymentModalOpen(false);
      setEditingPaymentId(null);
      toast.success('Pago actualizado');
      await logAction('Edición de Pago a Proveedor', 'Proveedores', `Pago actualizado para ${quickSupplier.name}`, 'update', {
        supplierId: quickSupplier.id,
        paymentId: editingPaymentId,
      });
    } catch (error) {
      handleApiError(error, OperationType.UPDATE, `supplier-payments/${editingPaymentId}`);
    }
  };

  const handleDeletePaymentRecord = async () => {
    if (!paymentToDelete || !quickSupplier) return;
    try {
      await deleteSupplierPayment(paymentToDelete);
      const [latestPayments] = await Promise.all([
        listSupplierPayments({ supplierId: quickSupplier.id }),
        loadSuppliers(),
      ]);
      setSupplierPayments(latestPayments);
      setIsPaymentDeleteConfirmOpen(false);
      setPaymentToDelete(null);
      toast.success('Pago eliminado');
      await logAction('Eliminación de Pago a Proveedor', 'Proveedores', `Pago eliminado para ${quickSupplier.name}`, 'delete', {
        supplierId: quickSupplier.id,
        paymentId: paymentToDelete,
      });
    } catch (error) {
      handleApiError(error, OperationType.DELETE, `supplier-payments/${paymentToDelete}`);
    }
  };

  return (
    <div className="space-y-8 pb-20">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight">Proveedores</h1>
          <p className="text-slate-500 dark:text-slate-400 font-medium">Gestión de cadena de suministro y alianzas</p>
        </div>
        <div className="flex items-center gap-3">
          <button className="flex items-center gap-2 px-4 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-sm font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-50 transition-all shadow-sm">
            <Package size={18} />
            Orden de Compra
          </button>
          <button 
            onClick={() => {
              setIsEditMode(false);
              setEditingSupplierId(null);
              setNewSupplier({
                name: '',
                category: 'Materiales',
                contact: '',
                email: '',
                phone: '',
                rating: 5.0,
                status: 'Verified',
                balance: 0
              });
              setIsModalOpen(true);
            }}
            className="flex items-center gap-2 px-4 py-2.5 bg-primary text-white rounded-xl text-sm font-bold hover:bg-primary/90 transition-all shadow-lg shadow-primary/20"
          >
            <Plus size={18} />
            Nuevo Proveedor
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
                  {isEditMode ? 'Editar Proveedor' : 'Nuevo Proveedor'}
                </h3>
                <button title="Cerrar" aria-label="Cerrar" onClick={() => setIsModalOpen(false)} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors">
                  <X size={20} className="text-slate-500" />
                </button>
              </div>
              <form onSubmit={handleAddSupplier} className="p-6 space-y-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Nombre de la Empresa</label>
                  <input
                    required
                    type="text"
                    title="Nombre de la empresa"
                    value={newSupplier.name}
                    onChange={(e) => setNewSupplier({ ...newSupplier, name: e.target.value })}
                    className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Categoría</label>
                    <select
                      title="Categoría del proveedor"
                      aria-label="Categoría del proveedor"
                      value={newSupplier.category}
                      onChange={(e) => setNewSupplier({ ...newSupplier, category: e.target.value })}
                      className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                    >
                      <option value="Materiales">Materiales</option>
                      <option value="Servicios">Servicios</option>
                      <option value="Logística">Logística</option>
                      <option value="Maquinaria">Maquinaria</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Persona de Contacto</label>
                    <input
                      required
                      type="text"
                      title="Persona de contacto"
                      value={newSupplier.contact}
                      onChange={(e) => setNewSupplier({ ...newSupplier, contact: e.target.value })}
                      className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Email</label>
                    <input
                      required
                      type="email"
                      title="Correo electrónico"
                      value={newSupplier.email}
                      onChange={(e) => setNewSupplier({ ...newSupplier, email: e.target.value })}
                      className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Teléfono</label>
                    <input
                      required
                      type="tel"
                      title="Teléfono"
                      value={newSupplier.phone}
                      onChange={(e) => setNewSupplier({ ...newSupplier, phone: e.target.value })}
                      className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                    />
                  </div>
                </div>
                <button type="submit" className="w-full py-4 bg-primary text-white rounded-2xl font-black uppercase tracking-widest shadow-lg shadow-primary/20 hover:bg-primary/90 transition-all mt-4">
                  {isEditMode ? 'Actualizar Proveedor' : 'Registrar Proveedor'}
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isPaymentModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden border border-slate-100 dark:border-slate-800"
            >
              <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                <h3 className="text-xl font-black text-slate-900 dark:text-white">Editar Pago</h3>
                <button title="Cerrar" aria-label="Cerrar" onClick={() => setIsPaymentModalOpen(false)} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors">
                  <X size={20} className="text-slate-500" />
                </button>
              </div>
              <form onSubmit={handleSavePaymentEdit} className="p-6 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Monto</label>
                    <input
                      required
                      type="number"
                      min="0.01"
                      step="0.01"
                      value={paymentForm.amount}
                      onChange={(e) => setPaymentForm((prev) => ({ ...prev, amount: e.target.value }))}
                      className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Fecha</label>
                    <input
                      required
                      type="date"
                      value={paymentForm.paidAt}
                      onChange={(e) => setPaymentForm((prev) => ({ ...prev, paidAt: e.target.value }))}
                      className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm"
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Método</label>
                  <select
                    value={paymentForm.paymentMethod}
                    onChange={(e) => setPaymentForm((prev) => ({ ...prev, paymentMethod: e.target.value }))}
                    className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm"
                  >
                    <option value="banrural_virtual">banrural_virtual</option>
                    <option value="paypal">paypal</option>
                    <option value="transferencia">transferencia</option>
                    <option value="efectivo">efectivo</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Referencia</label>
                  <input
                    type="text"
                    value={paymentForm.paymentReference}
                    onChange={(e) => setPaymentForm((prev) => ({ ...prev, paymentReference: e.target.value }))}
                    className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Notas</label>
                  <textarea
                    value={paymentForm.notes}
                    onChange={(e) => setPaymentForm((prev) => ({ ...prev, notes: e.target.value }))}
                    className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm"
                    rows={3}
                  />
                </div>
                <button type="submit" className="w-full py-4 bg-primary text-white rounded-2xl font-black uppercase tracking-widest">
                  Guardar Cambios
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            className={cn("p-6 bg-white dark:bg-slate-900 group", projectCardEffectClass, getStatHoverClass(stat.color))}
          >
            <div className="flex items-center justify-between mb-4">
              <div className={cn("p-3 rounded-xl text-white shadow-lg group-hover:scale-105 sm:group-hover:scale-110 group-hover:shadow-md sm:group-hover:shadow-lg transition-all duration-200 sm:duration-300", stat.color)}>
                <stat.icon size={20} />
              </div>
              <TrendingUp size={16} className="text-emerald-500" />
            </div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">{stat.label}</p>
            <p className="text-2xl font-black text-slate-900 dark:text-white">{stat.value}</p>
          </motion.div>
        ))}
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Supplier List */}
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm overflow-hidden">
            <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <h3 className="font-black text-xs uppercase tracking-widest text-slate-900 dark:text-white">Directorio de Proveedores</h3>
              <div className="relative w-full sm:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                <input
                  type="text"
                  placeholder="Buscar proveedor..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                />
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50/50 dark:bg-slate-800/50">
                    <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Proveedor</th>
                    <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Categoría</th>
                    <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Rating</th>
                    <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Saldo</th>
                    <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {loading ? (
                    <tr>
                      <td colSpan={5} className="px-6 py-12 text-center text-slate-400 dark:text-slate-500">
                        Cargando proveedores...
                      </td>
                    </tr>
                  ) : paginatedSuppliers.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-6 py-12 text-center text-slate-400 dark:text-slate-500">
                        No se encontraron proveedores.
                      </td>
                    </tr>
                  ) : (
                    paginatedSuppliers.map((sup) => (
                      <tr key={sup.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors group">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-500 font-black">
                              {sup.name.charAt(0)}
                            </div>
                            <div>
                              <p className="text-sm font-bold text-slate-900 dark:text-white">{sup.name}</p>
                              <div className="flex items-center gap-2 mt-1">
                                {sup.status === 'Verified' && <ShieldCheck size={12} className="text-emerald-500" />}
                                <p className="text-[10px] text-slate-400 font-medium tracking-tighter">{sup.contact}</p>
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className="px-2.5 py-1 bg-slate-100 dark:bg-slate-800 rounded-full text-[10px] font-black uppercase tracking-widest text-slate-600 dark:text-slate-400">
                            {sup.category}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-1">
                            <Star size={14} className="text-amber-400 fill-amber-400" />
                            <span className="text-xs font-bold text-slate-900 dark:text-white">{sup.rating}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <p className={cn(
                            "text-sm font-bold",
                            sup.balance > 0 ? "text-rose-500" : "text-emerald-500"
                          )}>
                            {formatCurrency(sup.balance)}
                          </p>
                          <p className="text-[9px] text-slate-400 uppercase font-black tracking-tighter">Última: {sup.lastOrder || 'N/A'}</p>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button 
                              onClick={() => handleEditSupplier(sup)}
                              className="p-2 text-slate-400 hover:text-primary transition-colors"
                              title="Editar"
                            >
                              <Edit2 size={16} />
                            </button>
                            <button 
                              onClick={() => {
                                setSupplierToDelete(sup.id);
                                setIsDeleteConfirmOpen(true);
                              }}
                              className="p-2 text-slate-400 hover:text-rose-500 transition-colors"
                              title="Eliminar"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-6 py-4 border-t border-slate-100 dark:border-slate-800">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                  Mostrando {paginatedSuppliers.length} de {filteredSuppliers.length} proveedores
                </p>
                <div className="flex items-center gap-2">
                  <button 
                    disabled={currentPage === 1}
                    onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                    title="Página anterior"
                    aria-label="Página anterior"
                    className="p-1.5 bg-slate-50 dark:bg-slate-800 rounded-lg text-slate-400 hover:text-primary transition-colors disabled:opacity-50"
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <div className="flex items-center gap-1">
                    {Array.from({ length: totalPages }, (_, i) => (
                      <button
                        key={i + 1}
                        onClick={() => setCurrentPage(i + 1)}
                        className={cn(
                          "w-7 h-7 rounded-lg text-[10px] font-black transition-all",
                          currentPage === i + 1 
                            ? "bg-primary text-white shadow-lg shadow-primary/20" 
                            : "bg-slate-50 dark:bg-slate-800 text-slate-400 hover:text-slate-600"
                        )}
                      >
                        {i + 1}
                      </button>
                    ))}
                  </div>
                  <button 
                    disabled={currentPage === totalPages}
                    onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                    title="Página siguiente"
                    aria-label="Página siguiente"
                    className="p-1.5 bg-slate-50 dark:bg-slate-800 rounded-lg text-slate-400 hover:text-primary transition-colors disabled:opacity-50"
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
          {/* Quick Actions */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm p-4 sm:p-6">
            <h3 className="font-black text-[10px] sm:text-xs uppercase tracking-widest text-slate-900 dark:text-white mb-4 sm:mb-6">Acciones Rápidas</h3>
            <div className="mb-3 sm:mb-4 space-y-1.5">
              <label className="text-[9px] sm:text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Proveedor objetivo</label>
              <select
                value={quickSupplierId}
                onChange={(e) => setQuickSupplierId(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-700 dark:text-slate-300 font-bold"
                title="Seleccionar proveedor para acciones rápidas"
                aria-label="Seleccionar proveedor para acciones rápidas"
              >
                {suppliers.map((sup) => (
                  <option key={sup.id} value={sup.id}>{sup.name}</option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:gap-3">
              {[
                { label: 'Cotizar', icon: Mail, color: 'bg-blue-50 dark:bg-blue-500/10', onClick: handleQuickQuote },
                { label: 'Llamar', icon: Phone, color: 'bg-emerald-50 dark:bg-emerald-500/10', onClick: handleQuickCall },
                { label: 'Visitar', icon: MapPin, color: 'bg-purple-50 dark:bg-purple-500/10', onClick: handleQuickVisit },
                { label: 'Pagar', icon: CreditCard, color: 'bg-rose-50 dark:bg-rose-500/10', onClick: handleQuickPay },
              ].map((action, i) => (
                <button
                  key={i}
                  onClick={action.onClick}
                  disabled={!quickSupplier}
                  title={`${action.label}${quickSupplier ? ` (${quickSupplier.name})` : ''}`}
                  className="flex flex-col items-center gap-1.5 sm:gap-2 p-3 sm:p-4 rounded-xl border border-slate-100 dark:border-slate-800 hover:border-primary transition-all group disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <div className={cn("p-1.5 sm:p-2 rounded-lg transition-colors", action.color, "group-hover:bg-primary group-hover:text-white")}>
                    <action.icon size={16} className="sm:w-[18px] sm:h-[18px]" />
                  </div>
                  <span className="text-[8px] sm:text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 group-hover:text-primary">{action.label}</span>
                </button>
              ))}
            </div>
            {quickSupplier && (
              <p className="mt-3 text-[10px] text-slate-500 dark:text-slate-400 font-medium">
                Contacto: {quickSupplier.contact || 'N/A'} | Tel: {quickSupplier.phone || 'N/A'}
              </p>
            )}
          </div>

          {/* Supplier Performance */}
          <div className="bg-slate-900 rounded-2xl p-4 sm:p-6 text-white">
            <h3 className="font-black text-[10px] sm:text-xs uppercase tracking-widest opacity-80 mb-4 sm:mb-6">Rendimiento</h3>
            <div className="space-y-4 sm:space-y-6">
              {[
                { label: 'A Tiempo', value: 94.0, color: 'bg-emerald-500' },
                { label: 'Calidad', value: 88.0, color: 'bg-blue-500' },
                { label: 'Precio', value: 72.0, color: 'bg-amber-500' },
              ].map((metric, i) => (
                <div key={i} className="space-y-1.5 sm:space-y-2">
                  <div className="flex items-center justify-between text-[8px] sm:text-[10px] font-black uppercase tracking-widest">
                    <span className="opacity-70">{metric.label}</span>
                    <span>{metric.value.toFixed(1)}%</span>
                  </div>
                  <div className="h-1 sm:h-1.5 bg-white/10 rounded-full overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${metric.value}%` }}
                      transition={{ delay: 0.5 + (i * 0.1), duration: 1 }}
                      className={cn("h-full rounded-full", metric.color)}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm p-4 sm:p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-black text-[10px] sm:text-xs uppercase tracking-widest text-slate-900 dark:text-white">Historial de Pagos</h3>
              {quickSupplier && (
                <span className="text-[9px] sm:text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider truncate max-w-[140px]" title={quickSupplier.name}>
                  {quickSupplier.name}
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-3">
              <input
                type="date"
                value={paymentDateFrom}
                onChange={(e) => setPaymentDateFrom(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-700 dark:text-slate-300 font-bold"
                title="Fecha desde"
                aria-label="Fecha desde"
              />
              <input
                type="date"
                value={paymentDateTo}
                onChange={(e) => setPaymentDateTo(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-700 dark:text-slate-300 font-bold"
                title="Fecha hasta"
                aria-label="Fecha hasta"
              />
            </div>

            <div className="flex gap-2 mb-3">
              <button
                onClick={exportSupplierPaymentsCsv}
                className="flex-1 px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest bg-emerald-600 text-white hover:bg-emerald-700 transition-colors"
                title="Exportar pagos a CSV"
              >
                Exportar CSV
              </button>
              <button
                onClick={() => {
                  setPaymentDateFrom('');
                  setPaymentDateTo('');
                }}
                className="px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                title="Limpiar filtros de fecha"
              >
                Limpiar
              </button>
            </div>

            {paymentsLoading ? (
              <p className="text-xs text-slate-500 dark:text-slate-400">Cargando pagos...</p>
            ) : filteredSupplierPayments.length === 0 ? (
              <p className="text-xs text-slate-500 dark:text-slate-400">Sin pagos registrados para este proveedor.</p>
            ) : (
              <>
                <div className="mb-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500">Total pagado</p>
                  <p className="text-lg font-black text-emerald-600 dark:text-emerald-400">
                    {formatCurrency(filteredSupplierPayments.reduce((sum, pay) => sum + Number(pay.amount || 0), 0))}
                  </p>
                </div>
                <div className="space-y-2 max-h-72 overflow-auto pr-1">
                  {filteredSupplierPayments.slice(0, 12).map((pay) => (
                    <div key={pay.id} className="p-3 rounded-xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-950/60">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-bold text-slate-900 dark:text-white">{formatCurrency(Number(pay.amount || 0))}</p>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-black uppercase tracking-wider px-2 py-1 rounded-full bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-300">
                            {String(pay.paymentMethod || '').replace('_', ' ')}
                          </span>
                          <button
                            type="button"
                            title="Editar pago"
                            onClick={() => handleOpenEditPayment(pay)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-primary hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                          >
                            <Edit2 size={14} />
                          </button>
                          <button
                            type="button"
                            title="Eliminar pago"
                            onClick={() => {
                              setPaymentToDelete(pay.id);
                              setIsPaymentDeleteConfirmOpen(true);
                            }}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                      <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1">Fecha: {pay.paidAt || 'N/A'}</p>
                      {pay.paymentReference && (
                        <p className="text-[10px] text-slate-500 dark:text-slate-400">Ref: {pay.paymentReference}</p>
                      )}
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <ConfirmModal
        isOpen={isDeleteConfirmOpen}
        onClose={() => {
          setIsDeleteConfirmOpen(false);
          setSupplierToDelete(null);
        }}
        onConfirm={handleDeleteSupplier}
        title="Eliminar Proveedor"
        message="¿Está seguro que desea eliminar este proveedor? Esta acción no se puede deshacer."
        confirmText="Eliminar"
        variant="danger"
      />

      <ConfirmModal
        isOpen={isPaymentDeleteConfirmOpen}
        onClose={() => {
          setIsPaymentDeleteConfirmOpen(false);
          setPaymentToDelete(null);
        }}
        onConfirm={handleDeletePaymentRecord}
        title="Eliminar Pago"
        message="¿Está seguro que desea eliminar este pago? Se ajustará el saldo del proveedor."
        confirmText="Eliminar"
        variant="danger"
      />
    </div>
  );
}
