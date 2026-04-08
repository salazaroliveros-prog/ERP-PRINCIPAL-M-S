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
import { createSupplier, deleteSupplier, listSuppliers, updateSupplier } from '../lib/suppliersApi';

export default function Suppliers() {
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

  const handleQuickPay = async () => {
    if (!quickSupplier) {
      toast.error('No hay proveedor seleccionado');
      return;
    }

    if (!quickSupplier.balance || quickSupplier.balance <= 0) {
      toast.info('Este proveedor no tiene saldo pendiente');
      return;
    }

    await openMailToSupplier(
      quickSupplier,
      `Programación de pago pendiente - ${quickSupplier.name}`,
      `Estimado(a) ${quickSupplier.contact || quickSupplier.name},\n\nConfirmamos la programación del pago pendiente por ${formatCurrency(quickSupplier.balance)}.\n\nPor favor compartir confirmación y referencia bancaria.\n\nGracias.`,
      'Acción Rápida: Gestionar Pago'
    );
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

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            className="p-6 bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm"
          >
            <div className="flex items-center justify-between mb-4">
              <div className={cn("p-3 rounded-xl text-white shadow-lg", stat.color)}>
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
    </div>
  );
}
