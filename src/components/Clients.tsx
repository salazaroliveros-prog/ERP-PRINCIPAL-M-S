import React, { useDeferredValue, useEffect, useState } from 'react';
import { storage, ref, uploadBytes, getDownloadURL } from '../lib/authStorageClient';
import { 
  Plus, 
  Search, 
  Users, 
  User,
  Mail, 
  Phone, 
  Building2, 
  MoreVertical,
  Trash2,
  Edit2,
  X,
  MessageSquare,
  UserPlus,
  Send,
  ChevronRight,
  ChevronLeft,
  Info,
  Check,
  MapPin,
  Paperclip,
  History,
  FileText,
  Clock,
  Download,
  Upload,
  LayoutGrid,
  List
} from 'lucide-react';
import { cn, handleApiError, OperationType, formatDate } from '../lib/utils';
import { logAction } from '../lib/audit';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'motion/react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import ConfirmModal from './ConfirmModal';
import { FormModal } from './FormModal';
import { StepForm, FormSection, FormInput, FormSelect } from './FormLayout';
import {
  addClientAttachment,
  createClient,
  createClientChat,
  createClientInteraction,
  deleteClient,
  listClientChats,
  listClientInteractions,
  listClients,
  updateClient,
} from '../lib/clientsApi';

// Client-side cache
let cachedClients: any[] = [];

// Fix for default marker icon
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

export default function Clients() {
  const projectCardEffectClass = 'rounded-[var(--radius-theme)] shadow-[var(--shadow-theme)] border border-slate-100 dark:border-slate-800 hover:shadow-lg hover:border-primary/30 hover:-translate-y-0.5 transition-all duration-500';

  const [clients, setClients] = useState<any[]>(cachedClients);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [selectedClient, setSelectedClient] = useState<any>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [activeDetailTab, setActiveDetailTab] = useState<'info' | 'chat' | 'logs' | 'files'>('info');
  const [interactionLogs, setInteractionLogs] = useState<any[]>([]);
  const [isLogModalOpen, setIsLogModalOpen] = useState(false);
  const [newLog, setNewLog] = useState({
    type: 'Call',
    notes: '',
    date: new Date().toISOString().split('T')[0]
  });
  const [chatMessages, setChatMessages] = useState<any[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const deferredSearchTerm = useDeferredValue(searchTerm);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [clientToDelete, setClientToDelete] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  
  // Sorting and Pagination State
  const [sortBy, setSortBy] = useState<'name' | 'company' | 'lastInteraction'>('name');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');

  const loadClients = React.useCallback(async () => {
    try {
      const items = await listClients();
      setClients(items);
      cachedClients = items;

      if (selectedClient) {
        const refreshed = items.find((c: any) => c.id === selectedClient.id);
        if (refreshed) setSelectedClient(refreshed);
      }
    } catch (error) {
      handleApiError(error, OperationType.GET, 'clients');
    }
  }, [selectedClient]);

  const validateField = (name: string, value: any) => {
    let error = '';
    if (!value && value !== 0) {
      error = 'Este campo es obligatorio';
    } else if (name === 'email' && value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      error = 'Email inválido';
    }
    setValidationErrors(prev => ({ ...prev, [name]: error }));
    return !error;
  };

  const [newClient, setNewClient] = useState({
    name: '',
    email: '',
    phone: '',
    company: '',
    contactPerson: '',
    contacto: '',
    status: 'Lead',
    notes: ''
  });

  useEffect(() => {
    loadClients();
  }, [loadClients]);

  useEffect(() => {
    if (!selectedClient || (!isChatOpen && !(isDetailOpen && activeDetailTab === 'chat'))) return;

    listClientChats(selectedClient.id)
      .then(setChatMessages)
      .catch((error) => handleApiError(error, OperationType.GET, `clientChats/${selectedClient.id}`));
  }, [selectedClient, isChatOpen, activeDetailTab, isDetailOpen]);

  useEffect(() => {
    if (!selectedClient || !isDetailOpen || activeDetailTab !== 'logs') return;

    listClientInteractions(selectedClient.id)
      .then(setInteractionLogs)
      .catch((error) => handleApiError(error, OperationType.GET, `clients/${selectedClient.id}/interactions`));
  }, [selectedClient, isDetailOpen, activeDetailTab]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !selectedClient) return;

    try {
      await createClientChat(selectedClient.id, {
        text: newMessage,
        sender: 'Admin',
      });

      const refreshedChats = await listClientChats(selectedClient.id);
      setChatMessages(refreshedChats);
      await loadClients();

      setNewMessage('');
    } catch (error) {
      handleApiError(error, OperationType.WRITE, 'clientChats');
    }
  };

  const handleAddInteraction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newLog.notes.trim() || !selectedClient) return;

    try {
      await createClientInteraction(selectedClient.id, {
        ...newLog,
      });

      const refreshedLogs = await listClientInteractions(selectedClient.id);
      setInteractionLogs(refreshedLogs);
      await loadClients();

      toast.success('Interacción registrada');
      setIsLogModalOpen(false);
      setNewLog({ type: 'Call', notes: '', date: new Date().toISOString().split('T')[0] });
    } catch (error) {
      handleApiError(error, OperationType.WRITE, `clients/${selectedClient.id}/interactions`);
    }
  };

  const handleCaptureLocation = () => {
    if (!navigator.geolocation) {
      toast.error('La geolocalización no es compatible con este navegador');
      return;
    }

    toast.promise(
      new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(
          async (position) => {
            try {
              await updateClient(selectedClient.id, {
                location: {
                  lat: position.coords.latitude,
                  lng: position.coords.longitude,
                  accuracy: position.coords.accuracy,
                }
              });
              await loadClients();
              resolve(position);
            } catch (error) {
              reject(error);
            }
          },
          (error) => reject(error)
        );
      }),
      {
        loading: 'Capturando ubicación GPS...',
        success: 'Ubicación capturada con éxito',
        error: 'Error al capturar ubicación'
      }
    );
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedClient) return;

    setIsUploading(true);
    const toastId = toast.loading('Subiendo archivo...');

    try {
      const fileRef = ref(storage, `clients/${selectedClient.id}/${Date.now()}_${file.name}`);
      await uploadBytes(fileRef, file);
      const url = await getDownloadURL(fileRef);

      await addClientAttachment(selectedClient.id, {
        name: file.name,
        url: url,
        type: file.type,
        createdAt: new Date().toISOString(),
      });

      await loadClients();

      toast.success('Archivo subido con éxito', { id: toastId });
    } catch (error) {
      console.error('Error uploading file:', error);
      toast.error('Error al subir el archivo', { id: toastId });
    } finally {
      setIsUploading(false);
    }
  };
  const handleCloseChat = async () => {
    if (selectedClient) {
      try {
        await updateClient(selectedClient.id, {
          lastInteraction: new Date().toISOString(),
        });
        await loadClients();
      } catch (error) {
        handleApiError(error, OperationType.WRITE, `clients/${selectedClient.id}`);
      }
    }
    setIsChatOpen(false);
  };

  const handleDeleteClient = (id: string) => {
    setClientToDelete(id);
    setIsDeleteConfirmOpen(true);
  };

  const confirmDeleteClient = async () => {
    if (!clientToDelete) return;
    try {
      const client = clients.find(c => c.id === clientToDelete);
      await deleteClient(clientToDelete);
      setClientToDelete(null);
      setIsDeleteConfirmOpen(false);
      await loadClients();
      toast.success('Cliente eliminado con éxito');
      await logAction('Eliminación de Cliente', 'Clientes', `Cliente ${client?.name || clientToDelete} eliminado`, 'delete', { clientId: clientToDelete });
    } catch (error) {
      handleApiError(error, OperationType.DELETE, `clients/${clientToDelete}`);
    }
  };

  const clientPendingDelete = clients.find((client) => client.id === clientToDelete);

  const handleOpenModal = (client?: any) => {
    if (client) {
      setSelectedClient(client);
      setNewClient({
        name: client.name || '',
        email: client.email || '',
        phone: client.phone || '',
        company: client.company || '',
        contactPerson: client.contactPerson || '',
        contacto: client.contacto || '',
        status: client.status || 'Lead',
        notes: client.notes || ''
      });
    } else {
      setSelectedClient(null);
      setNewClient({ name: '', email: '', phone: '', company: '', contactPerson: '', contacto: '', status: 'Lead', notes: '' });
    }
    setValidationErrors({});
    setCurrentStep(0);
    setIsModalOpen(true);
  };

  useEffect(() => {
    const handleQuickActionTrigger = (event: Event) => {
      const customEvent = event as CustomEvent<{ action?: string }>;
      if (customEvent.detail?.action !== 'new-client') return;
      handleOpenModal();
    };

    window.addEventListener('QUICK_ACTION_TRIGGER', handleQuickActionTrigger as EventListener);
    return () => window.removeEventListener('QUICK_ACTION_TRIGGER', handleQuickActionTrigger as EventListener);
  }, []);

  const handleSubmitClient = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Final validation
    const errors: Record<string, string> = {};
    if (!newClient.name) errors.name = 'El nombre es obligatorio';
    if (!newClient.email) errors.email = 'El email es obligatorio';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newClient.email)) errors.email = 'Email inválido';
    if (!newClient.phone) errors.phone = 'El teléfono es obligatorio';
    
    if (Object.keys(errors).length > 0) {
      setValidationErrors(errors);
      toast.error('Por favor, complete todos los campos obligatorios correctamente');
      return;
    }

    setIsSubmitting(true);
    try {
      if (selectedClient && isModalOpen) {
        await updateClient(selectedClient.id, { ...newClient });
        toast.success('Cliente actualizado con éxito');
        await logAction('Edición de Cliente', 'Clientes', `Cliente ${newClient.name} actualizado`, 'update', { clientId: selectedClient.id });
      } else {
        const saved = await createClient({
          ...newClient,
          lastInteraction: new Date().toISOString(),
        });
        toast.success('Cliente guardado con éxito');
        await logAction('Registro de Cliente', 'Clientes', `Nuevo cliente ${newClient.name} registrado`, 'create', { clientId: saved.id });
      }

      await loadClients();

      setIsModalOpen(false);
      setNewClient({ name: '', email: '', phone: '', company: '', contactPerson: '', contacto: '', status: 'Lead', notes: '' });
      setValidationErrors({});
      setCurrentStep(0);
    } catch (error) {
      handleApiError(error, OperationType.WRITE, 'clients');
    } finally {
      setIsSubmitting(false);
    }
  };

  const filteredClients = React.useMemo(() => {
    const normalizedSearch = deferredSearchTerm.toLowerCase();

    return clients.filter(c => 
      c.name.toLowerCase().includes(normalizedSearch) ||
      c.email.toLowerCase().includes(normalizedSearch) ||
      (c.company && c.company.toLowerCase().includes(normalizedSearch))
    );
  }, [clients, deferredSearchTerm]);

  const sortedClients = React.useMemo(() => {
    return [...filteredClients].sort((a, b) => {
      let comparison = 0;
      if (sortBy === 'name') {
        comparison = a.name.localeCompare(b.name);
      } else if (sortBy === 'company') {
        const companyA = a.company || '';
        const companyB = b.company || '';
        comparison = companyA.localeCompare(companyB);
      } else if (sortBy === 'lastInteraction') {
        const getTimestamp = (obj: any) => {
          if (!obj) return 0;
          if (obj.toDate) return obj.toDate().getTime();
          if (obj instanceof Date) return obj.getTime();
          return new Date(obj).getTime() || 0;
        };
        const dateA = getTimestamp(a.lastInteraction) || getTimestamp(a.createdAt);
        const dateB = getTimestamp(b.lastInteraction) || getTimestamp(b.createdAt);
        comparison = dateA - dateB;
      }
      return sortOrder === 'asc' ? comparison : -comparison;
    });
  }, [filteredClients, sortBy, sortOrder]);

  const totalPages = Math.ceil(sortedClients.length / itemsPerPage);
  const paginatedClients = React.useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return sortedClients.slice(start, start + itemsPerPage);
  }, [sortedClients, currentPage, itemsPerPage]);

  const toggleSort = (field: 'name' | 'company' | 'lastInteraction') => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortOrder('asc');
    }
    setCurrentPage(1);
  };

  return (
    <>
      <ConfirmModal
        isOpen={isDeleteConfirmOpen}
        onClose={() => {
          setIsDeleteConfirmOpen(false);
          setClientToDelete(null);
        }}
        onConfirm={confirmDeleteClient}
        title="Eliminar Cliente"
        message={`¿Seguro que deseas eliminar el cliente ${clientPendingDelete?.name || 'seleccionado'}? Esta acción no se puede deshacer.`}
      />

      <div className="flex flex-col lg:flex-row gap-6 sm:gap-8 items-start">
        <div className={cn(
          "flex-1 space-y-5 sm:space-y-8 w-full transition-all duration-300",
          isDetailOpen && "lg:max-w-md xl:max-w-xl"
        )}>
          <header className="flex flex-col md:flex-row md:items-center justify-between gap-3 sm:gap-4 mb-4 sm:mb-8">
            <div>
              <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-slate-900 dark:text-white">Clientes</h1>
              <p className="text-slate-500 dark:text-slate-300 text-[10px] sm:text-sm">Gestión de base de datos y leads</p>
            </div>
            <button 
              onClick={() => handleOpenModal()}
              className="flex items-center justify-center gap-2 bg-primary text-white font-bold py-2 sm:py-3 px-3 sm:px-6 rounded-xl hover:bg-primary-hover transition-all duration-200 shadow-lg shadow-primary-shadow text-[11px] sm:text-sm min-h-9 sm:min-h-0 active:scale-105 active:ring-2 active:ring-primary/35 focus-visible:scale-105 focus-visible:ring-2 focus-visible:ring-primary/35 focus-visible:outline-none"
            >
              <UserPlus size={18} className="sm:w-5 sm:h-5" />
              Nuevo Prospecto
            </button>
          </header>

          <div className="flex flex-col md:flex-row gap-3 sm:gap-4 items-center justify-between mb-4 sm:mb-8">
            <div className="relative flex-1 w-full">
              <Search className="absolute left-3.5 sm:left-4 top-1/2 -translate-y-1/2 text-slate-400 sm:w-5 sm:h-5" size={16} />
              <input 
                type="text" 
                placeholder="Buscar cliente..." 
                className="w-full pl-10 sm:pl-12 pr-4 py-2 sm:py-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl sm:rounded-2xl focus:outline-none focus:ring-2 focus:ring-primary transition-all shadow-sm text-[11px] sm:text-sm text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500"
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setCurrentPage(1);
                }}
              />
            </div>
            <div className="flex items-center gap-1.5 sm:gap-2 bg-white dark:bg-slate-900 p-1 sm:p-2 rounded-xl sm:rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm overflow-x-auto w-full md:w-auto">
              <span className="text-[8px] sm:text-micro font-bold text-slate-400 dark:text-slate-300 uppercase tracking-wider px-1.5 sm:px-2">Ordenar:</span>
              <button 
                onClick={() => toggleSort('name')}
                className={cn(
                  "px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg sm:rounded-xl text-[8px] sm:text-micro font-bold transition-all duration-200 whitespace-nowrap min-h-8 sm:min-h-0 active:scale-105 active:ring-2 active:ring-primary/30 focus-visible:scale-105 focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:outline-none",
                  sortBy === 'name' ? "bg-primary text-white scale-105 ring-2 ring-primary/25" : "bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700"
                )}
              >
                Nombre {sortBy === 'name' && (sortOrder === 'asc' ? '↑' : '↓')}
              </button>
              <button 
                onClick={() => toggleSort('company')}
                className={cn(
                  "px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg sm:rounded-xl text-[8px] sm:text-micro font-bold transition-all duration-200 whitespace-nowrap min-h-8 sm:min-h-0 active:scale-105 active:ring-2 active:ring-primary/30 focus-visible:scale-105 focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:outline-none",
                  sortBy === 'company' ? "bg-primary text-white scale-105 ring-2 ring-primary/25" : "bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700"
                )}
              >
                Empresa {sortBy === 'company' && (sortOrder === 'asc' ? '↑' : '↓')}
              </button>
              <div className="mx-1 h-5 w-px bg-slate-200 dark:bg-slate-700" />
              <button
                onClick={() => setViewMode('grid')}
                className={cn(
                  "p-1.5 rounded-lg transition-all duration-200 min-h-8 sm:min-h-0 active:scale-105 active:ring-2 active:ring-primary/30 focus-visible:scale-105 focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:outline-none",
                  viewMode === 'grid' ? "bg-primary text-white scale-105 ring-2 ring-primary/25" : "bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300"
                )}
                title="Vista tarjetas"
                aria-label="Vista tarjetas"
              >
                <LayoutGrid size={14} />
              </button>
              <button
                onClick={() => setViewMode('table')}
                className={cn(
                  "p-1.5 rounded-lg transition-all duration-200 min-h-8 sm:min-h-0 active:scale-105 active:ring-2 active:ring-primary/30 focus-visible:scale-105 focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:outline-none",
                  viewMode === 'table' ? "bg-primary text-white scale-105 ring-2 ring-primary/25" : "bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300"
                )}
                title="Vista tabla"
                aria-label="Vista tabla"
              >
                <List size={14} />
              </button>
            </div>
          </div>

          {viewMode === 'table' ? (
            <div className="bg-white dark:bg-slate-900 glass-card rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm overflow-hidden min-w-0">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse table-fixed">
                  <thead>
                    <tr className="bg-slate-50/50 dark:bg-slate-800/50 border-b border-slate-100 dark:border-slate-800">
                      <th className="px-4 py-3 text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-300">Cliente</th>
                      <th className="px-4 py-3 text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-300">Empresa</th>
                      <th className="px-4 py-3 text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-300">Correo</th>
                      <th className="px-4 py-3 text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-300">Teléfono</th>
                      <th className="px-4 py-3 text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-300">Estado</th>
                      <th className="px-4 py-3 text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-300 text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {paginatedClients.map((client) => (
                      <tr
                        key={client.id}
                        className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
                        onClick={() => {
                          setSelectedClient(client);
                          setIsDetailOpen(true);
                        }}
                      >
                        <td className="px-4 py-3">
                          <p className="text-sm font-bold text-slate-900 dark:text-white">{client.name}</p>
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-700 dark:text-slate-300">{client.company || 'Particular'}</td>
                        <td className="px-4 py-3 text-sm text-slate-700 dark:text-slate-300 truncate">{client.email || '-'}</td>
                        <td className="px-4 py-3 text-sm text-slate-700 dark:text-slate-300">{client.phone || 'Sin teléfono'}</td>
                        <td className="px-4 py-3">
                          <span className={cn(
                            "px-2 py-1 rounded-full text-[10px] font-black uppercase tracking-wider",
                            client.status === 'Active' ? "bg-emerald-100 text-emerald-700" : "bg-primary-light text-primary"
                          )}>
                            {client.status === 'Active' ? 'Activo' : 'Lead'}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedClient(client);
                                setIsChatOpen(true);
                              }}
                              className="p-2 text-slate-400 dark:text-slate-300 hover:text-primary transition-colors"
                              title="Chat"
                            >
                              <MessageSquare size={14} />
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleOpenModal(client);
                              }}
                              className="p-2 text-slate-400 dark:text-slate-300 hover:text-primary transition-colors"
                              title="Editar"
                            >
                              <Edit2 size={14} />
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteClient(client.id);
                              }}
                              className="p-2 text-slate-400 dark:text-slate-300 hover:text-rose-600 transition-colors"
                              title="Eliminar"
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
          ) : (
            <div className={cn(
              "grid gap-6",
              isDetailOpen ? "grid-cols-1" : "grid-cols-1 md:grid-cols-2 xl:grid-cols-3"
            )}>
              <AnimatePresence>
                {paginatedClients.map((client) => (
                <motion.div 
                  key={client.id}
                  data-testid={`client-card-${client.id}`}
                  layout
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  onClick={() => {
                    setSelectedClient(client);
                    setIsDetailOpen(true);
                  }}
                  className={cn(
                    "bg-white dark:bg-slate-900 glass-card p-4 sm:p-6 group cursor-pointer relative overflow-hidden",
                    projectCardEffectClass,
                    selectedClient?.id === client.id && isDetailOpen 
                      ? "border-primary ring-2 ring-primary/10 shadow-md" 
                      : client.status === 'Active'
                        ? "hover:border-emerald-300 dark:hover:border-emerald-500/40"
                        : "hover:border-primary/40 dark:hover:border-primary/50"
                  )}
                >
                  <div className="absolute top-0 right-0 p-3 sm:p-4 opacity-5 group-hover:scale-110 transition-transform duration-500">
                    <User size={48} className="text-slate-400 sm:w-16 sm:h-16" />
                  </div>

                  <div className="flex items-start justify-between mb-4 sm:mb-6">
                    <div className="flex items-center gap-3 sm:gap-4">
                      <div className="w-10 h-10 sm:w-12 sm:h-12 bg-slate-100 dark:bg-slate-800 rounded-xl flex items-center justify-center text-slate-600 dark:text-slate-400 font-bold text-base sm:text-lg group-hover:bg-primary group-hover:text-white group-hover:scale-105 sm:group-hover:scale-110 group-hover:shadow-md sm:group-hover:shadow-lg group-hover:shadow-primary/20 transition-all duration-200 sm:duration-300">
                        {client.name.charAt(0)}
                      </div>
                      <div>
                        <h3 className="font-bold text-sm sm:text-base text-slate-900 dark:text-white group-hover:text-primary transition-colors">{client.name}</h3>
                        <div className="flex items-center gap-1 text-[8px] sm:text-micro font-bold uppercase tracking-wider text-slate-500 dark:text-slate-300">
                          <Building2 size={10} className="sm:w-3 sm:h-3" />
                          <span>{client.company || 'Particular'}</span>
                        </div>
                      </div>
                    </div>
                    <span className={cn(
                      "text-[8px] sm:text-micro font-bold uppercase tracking-wider px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-full border",
                      client.status === 'Active' ? "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 border-emerald-100 dark:border-emerald-500/20" : "bg-primary-light/50 dark:bg-primary/10 text-primary border-primary-light dark:border-primary/20"
                    )}>
                      {client.status === 'Active' ? 'Activo' : 'Lead'}
                    </span>
                  </div>

                  <div className="space-y-2 sm:space-y-3 mb-4 sm:mb-6">
                    <div className="flex items-center gap-2 sm:gap-3 text-xs sm:text-sm text-slate-600 dark:text-slate-300">
                      <Mail size={14} className="text-slate-400 dark:text-slate-300 sm:w-4 sm:h-4" />
                      <span className="truncate">{client.email}</span>
                    </div>
                    <div className="flex items-center gap-2 sm:gap-3 text-xs sm:text-sm text-slate-600 dark:text-slate-300">
                      <Phone size={14} className="text-slate-400 dark:text-slate-300 sm:w-4 sm:h-4" />
                      <span>{client.phone || 'Sin teléfono'}</span>
                    </div>
                  </div>

                  <div className="flex gap-1.5 sm:gap-2 pt-3 sm:pt-4 border-t border-slate-50 dark:border-slate-800">
                    <button
                      type="button"
                      data-testid={`client-card-chat-${client.id}`}
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedClient(client);
                        setIsChatOpen(true);
                      }}
                      className="flex-1 flex items-center justify-center gap-1.5 sm:gap-2 py-1.5 sm:py-2 bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-[10px] sm:text-xs font-bold rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-all"
                    >
                      <MessageSquare size={12} className="sm:w-3.5 sm:h-3.5" />
                      Chat
                    </button>
                    <button
                      type="button"
                      data-testid={`client-card-edit-${client.id}`}
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleOpenModal(client);
                      }}
                      className="flex-1 flex items-center justify-center gap-1.5 sm:gap-2 py-1.5 sm:py-2 bg-primary-light dark:bg-primary/20 text-primary text-[10px] sm:text-xs font-bold rounded-lg hover:bg-primary hover:text-white transition-all"
                    >
                      <Edit2 size={12} className="sm:w-3.5 sm:h-3.5" />
                      Editar
                    </button>
                    <button
                      type="button"
                      data-testid={`client-card-delete-${client.id}`}
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteClient(client.id);
                      }}
                      className="p-1.5 sm:p-2 text-slate-400 dark:text-slate-300 hover:text-rose-600 transition-colors"
                    >
                      <Trash2 size={14} className="sm:w-4 sm:h-4" />
                    </button>
                  </div>
                </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex flex-col md:flex-row items-center justify-between gap-4 bg-white dark:bg-slate-900 glass-card p-6 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm mt-8">
              <div className="flex items-center gap-4">
                <span className="text-sm text-slate-500 dark:text-slate-300 font-medium">
                  Mostrando {paginatedClients.length} de {filteredClients.length} clientes
                </span>
                <div className="flex items-center gap-2">
                  <label className="text-xs font-bold text-slate-400 dark:text-slate-300 uppercase tracking-wider">Por página:</label>
                  <select 
                    className="px-2 py-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-bold outline-none text-slate-900 dark:text-white"
                    value={itemsPerPage}
                    onChange={(e) => {
                      setItemsPerPage(Number(e.target.value));
                      setCurrentPage(1);
                    }}
                  >
                    <option value={6}>6</option>
                    <option value={12}>12</option>
                    <option value={24}>24</option>
                    <option value={48}>48</option>
                  </select>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button 
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                  className="p-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed text-slate-600 dark:text-slate-300"
                >
                  <ChevronRight size={20} className="rotate-180" />
                </button>
                <div className="flex items-center gap-1">
                  {(() => {
                    const pages = [];
                    const maxVisible = 5;
                    
                    if (totalPages <= maxVisible + 2) {
                      for (let i = 1; i <= totalPages; i++) pages.push(i);
                    } else {
                      pages.push(1);
                      if (currentPage > 3) pages.push('...');
                      
                      const start = Math.max(2, currentPage - 1);
                      const end = Math.min(totalPages - 1, currentPage + 1);
                      
                      for (let i = start; i <= end; i++) {
                        if (!pages.includes(i)) pages.push(i);
                      }
                      
                      if (currentPage < totalPages - 2) pages.push('...');
                      if (!pages.includes(totalPages)) pages.push(totalPages);
                    }
                    
                    return pages.map((page, idx) => (
                      page === '...' ? (
                        <span key={`ellipsis-${idx}`} className="px-2 text-slate-400">...</span>
                      ) : (
                        <button
                          key={page}
                          onClick={() => setCurrentPage(page as number)}
                          className={cn(
                            "w-10 h-10 rounded-xl font-bold transition-all",
                            currentPage === page 
                              ? "bg-primary text-white shadow-lg shadow-primary-shadow" 
                              : "bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700"
                          )}
                        >
                          {page}
                        </button>
                      )
                    ));
                  })()}
                </div>
                <button 
                  disabled={currentPage === totalPages}
                  onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                  className="p-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed text-slate-600 dark:text-slate-400"
                >
                  <ChevronRight size={20} />
                </button>
              </div>
            </div>
          )}
        </div>

        <AnimatePresence>
          {isDetailOpen && selectedClient && (
            <motion.div 
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="w-full lg:w-[400px] xl:w-[500px] bg-white dark:bg-slate-900 rounded-3xl border border-slate-100 dark:border-slate-800 shadow-xl overflow-hidden sticky top-8"
            >
                  <div className="p-6 bg-primary text-white flex justify-between items-center">
                    <h2 className="text-xl font-bold">Detalles del Cliente</h2>
                    <button 
                      onClick={() => {
                        setIsDetailOpen(false);
                        setActiveDetailTab('info');
                      }}
                      className="p-2 hover:bg-white/10 rounded-full transition-colors"
                    >
                      <X size={24} />
                    </button>
                  </div>

                  <div className="flex border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
                    <button 
                      onClick={() => setActiveDetailTab('info')}
                      className={cn(
                        "flex-1 py-4 text-xs font-black uppercase tracking-widest transition-all border-b-2",
                        activeDetailTab === 'info' ? "border-primary text-primary bg-white dark:bg-slate-900" : "border-transparent text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                      )}
                    >
                      Información
                    </button>
                    <button 
                      onClick={() => setActiveDetailTab('chat')}
                      className={cn(
                        "flex-1 py-4 text-xs font-black uppercase tracking-widest transition-all border-b-2",
                        activeDetailTab === 'chat' ? "border-primary text-primary bg-white dark:bg-slate-900" : "border-transparent text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                      )}
                    >
                      Chat Directo
                    </button>
                  </div>

                  <div className="flex-1 overflow-y-auto custom-scrollbar">
                    <div className="flex border-b border-slate-100 dark:border-slate-800 overflow-x-auto">
                      <button 
                        onClick={() => setActiveDetailTab('info')}
                        className={cn(
                          "px-6 py-4 text-sm font-bold border-b-2 transition-all whitespace-nowrap",
                          activeDetailTab === 'info' ? "border-primary text-primary" : "border-transparent text-slate-500 hover:text-slate-700"
                        )}
                      >
                        Información
                      </button>
                      <button 
                        onClick={() => setActiveDetailTab('chat')}
                        className={cn(
                          "px-6 py-4 text-sm font-bold border-b-2 transition-all whitespace-nowrap",
                          activeDetailTab === 'chat' ? "border-primary text-primary" : "border-transparent text-slate-500 hover:text-slate-700"
                        )}
                      >
                        Chat
                      </button>
                      <button 
                        onClick={() => setActiveDetailTab('logs')}
                        className={cn(
                          "px-6 py-4 text-sm font-bold border-b-2 transition-all whitespace-nowrap",
                          activeDetailTab === 'logs' ? "border-primary text-primary" : "border-transparent text-slate-500 hover:text-slate-700"
                        )}
                      >
                        Bitácora
                      </button>
                      <button 
                        onClick={() => setActiveDetailTab('files')}
                        className={cn(
                          "px-6 py-4 text-sm font-bold border-b-2 transition-all whitespace-nowrap",
                          activeDetailTab === 'files' ? "border-primary text-primary" : "border-transparent text-slate-500 hover:text-slate-700"
                        )}
                      >
                        Archivos
                      </button>
                    </div>

                    <div className="flex-1 overflow-y-auto custom-scrollbar">
                      {activeDetailTab === 'info' && (
                        <div className="p-8 space-y-8">
                          <div className="flex flex-col items-center text-center">
                            <div className="w-24 h-24 bg-slate-100 dark:bg-slate-800 rounded-3xl flex items-center justify-center text-slate-600 dark:text-slate-400 font-bold text-4xl mb-4 shadow-inner">
                              {selectedClient.name.charAt(0)}
                            </div>
                            <h3 className="text-2xl font-bold text-slate-900 dark:text-white">{selectedClient.name}</h3>
                            <p className="text-slate-500 dark:text-slate-400">{selectedClient.company || 'Particular'}</p>
                            <div className={cn(
                              "mt-4 text-xs font-bold uppercase tracking-widest px-4 py-1.5 rounded-full border",
                              selectedClient.status === 'Active' ? "bg-emerald-50 text-emerald-600 border-emerald-100" : "bg-primary-light/50 text-primary border-primary-light"
                            )}>
                              {selectedClient.status === 'Active' ? 'Cliente Activo' : 'Lead / Prospecto'}
                            </div>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                            <div className="space-y-1">
                              <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Información de Contacto</p>
                              <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-2xl space-y-3">
                                <div className="flex items-center gap-3 text-slate-700 dark:text-slate-300">
                                  <Mail size={18} className="text-primary" />
                                  <span className="font-medium">{selectedClient.email}</span>
                                </div>
                                <div className="flex items-center gap-3 text-slate-700 dark:text-slate-300">
                                  <Phone size={18} className="text-primary" />
                                  <span className="font-medium">{selectedClient.phone || 'N/A'}</span>
                                </div>
                                {selectedClient.contacto && (
                                  <div className="flex items-center gap-3 text-slate-700 dark:text-slate-300">
                                    <MessageSquare size={18} className="text-primary" />
                                    <span className="font-medium">{selectedClient.contacto}</span>
                                  </div>
                                )}
                              </div>
                            </div>

                            <div className="space-y-1">
                              <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Ubicación GPS</p>
                              {selectedClient.location ? (
                                <div className="space-y-4">
                                  <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-2xl">
                                    <div className="flex items-center justify-between mb-2">
                                      <div className="flex items-center gap-2 text-slate-900 dark:text-white font-bold text-xs">
                                        <MapPin size={14} className="text-primary" />
                                        <span>Coordenadas Guardadas</span>
                                      </div>
                                      <button 
                                        onClick={handleCaptureLocation}
                                        className="text-[10px] text-primary font-bold hover:underline"
                                      >
                                        Actualizar
                                      </button>
                                    </div>
                                    <p className="text-[10px] text-slate-500 mb-1">Lat: {selectedClient.location.lat.toFixed(6)}</p>
                                    <p className="text-[10px] text-slate-500 mb-3">Lng: {selectedClient.location.lng.toFixed(6)}</p>
                                    
                                    <div className="h-48 w-full rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 z-0 mb-3">
                                      <MapContainer 
                                        center={[selectedClient.location.lat, selectedClient.location.lng]} 
                                        zoom={15} 
                                        scrollWheelZoom={false}
                                        style={{ height: '100%', width: '100%' }}
                                      >
                                        <TileLayer
                                          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                                          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                                        />
                                        <Marker position={[selectedClient.location.lat, selectedClient.location.lng]}>
                                          <Popup>
                                            <div className="text-xs font-bold">
                                              {selectedClient.name}
                                            </div>
                                          </Popup>
                                        </Marker>
                                      </MapContainer>
                                    </div>

                                    <a 
                                      href={`https://www.google.com/maps?q=${selectedClient.location.lat},${selectedClient.location.lng}`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="block w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-center py-2 rounded-xl text-[10px] font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700 transition-all"
                                    >
                                      Ver en Google Maps
                                    </a>
                                  </div>
                                </div>
                              ) : (
                                <div className="bg-slate-50 dark:bg-slate-800/50 p-6 rounded-2xl border border-dashed border-slate-200 dark:border-slate-700 text-center">
                                  <MapPin size={24} className="mx-auto text-slate-300 mb-2" />
                                  <p className="text-[10px] text-slate-500 mb-3">Sin ubicación registrada</p>
                                  <button 
                                    onClick={handleCaptureLocation}
                                    className="bg-primary text-white px-3 py-1.5 rounded-lg text-[10px] font-bold hover:bg-primary-hover transition-all"
                                  >
                                    Capturar GPS
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>

                          <div className="space-y-1">
                            <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Notas y Seguimiento</p>
                            <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-2xl">
                              <p className="text-slate-600 dark:text-slate-400 text-sm leading-relaxed italic">
                                {selectedClient.notes || 'No hay notas registradas para este cliente.'}
                              </p>
                            </div>
                          </div>

                          <div className="flex gap-4 pt-4">
                            <button 
                              onClick={() => setActiveDetailTab('chat')}
                              className="flex-1 flex items-center justify-center gap-2 py-4 bg-primary text-white font-bold rounded-2xl hover:bg-primary-hover transition-all shadow-lg shadow-primary-shadow"
                            >
                              <MessageSquare size={20} />
                              Ir al Chat
                            </button>
                            <button className="p-4 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded-2xl hover:bg-slate-200 dark:hover:bg-slate-700 transition-all">
                              <Edit2 size={20} />
                            </button>
                          </div>
                        </div>
                      )}

                      {activeDetailTab === 'chat' && (
                        <div className="flex flex-col h-full bg-slate-50 dark:bg-slate-900">
                          <div className="flex-1 overflow-y-auto p-6 space-y-4 min-h-[400px]">
                            {chatMessages.length === 0 ? (
                              <div className="h-full flex flex-col items-center justify-center text-slate-400 py-12">
                                <MessageSquare size={48} className="mb-4 opacity-20" />
                                <p className="text-sm">Inicia una conversación con {selectedClient.name}</p>
                              </div>
                            ) : (
                              chatMessages.map((msg) => (
                                <div 
                                  key={msg.id}
                                  className={cn(
                                    "flex flex-col max-w-[85%]",
                                    msg.sender === 'Admin' ? "ml-auto items-end" : "items-start"
                                  )}
                                >
                                  <div className={cn(
                                    "px-4 py-2 rounded-2xl text-sm shadow-sm",
                                    msg.sender === 'Admin' 
                                      ? "bg-primary text-white rounded-tr-none" 
                                      : "bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-100 dark:border-slate-700 rounded-tl-none"
                                  )}>
                                    {msg.text}
                                  </div>
                                  <span className="text-[10px] text-slate-400 mt-1">
                                    {msg.createdAt ? formatDate(msg.createdAt.toDate ? msg.createdAt.toDate().toISOString() : msg.createdAt) : 'Enviando...'}
                                  </span>
                                </div>
                              ))
                            )}
                          </div>

                          <form onSubmit={handleSendMessage} className="p-4 bg-white dark:bg-slate-900 border-t border-slate-100 dark:border-slate-800 flex gap-2 sticky bottom-0">
                            <input 
                              type="text" 
                              placeholder="Escribe un mensaje..." 
                              className="flex-1 px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary text-sm text-slate-900 dark:text-white"
                              value={newMessage}
                              onChange={(e) => setNewMessage(e.target.value)}
                            />
                            <button 
                              type="submit"
                              className="p-3 bg-primary text-white rounded-xl hover:bg-primary-hover transition-all shadow-lg shadow-primary-shadow"
                            >
                              <Send size={20} />
                            </button>
                          </form>
                        </div>
                      )}

                      {activeDetailTab === 'logs' && (
                        <div className="p-8 space-y-6">
                          <div className="flex justify-between items-center">
                            <h4 className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">Historial de Interacciones</h4>
                            <button 
                              onClick={() => setIsLogModalOpen(true)}
                              className="text-xs text-primary font-bold hover:underline flex items-center gap-1"
                            >
                              <Plus size={14} />
                              Registrar Visita/Llamada
                            </button>
                          </div>

                          <div className="space-y-4">
                            {interactionLogs.length === 0 ? (
                              <div className="text-center py-12 text-slate-400">
                                <History size={32} className="mx-auto mb-2 opacity-20" />
                                <p className="text-xs">No hay interacciones registradas</p>
                              </div>
                            ) : (
                              interactionLogs.map((log) => (
                                <div key={log.id} className="flex gap-4 p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-700">
                                  <div className={cn(
                                    "p-2 rounded-xl h-fit",
                                    log.type === 'Call' ? "bg-blue-100 text-blue-600" : 
                                    log.type === 'Visit' ? "bg-emerald-100 text-emerald-600" : "bg-amber-100 text-amber-600"
                                  )}>
                                    {log.type === 'Call' ? <Phone size={16} /> : 
                                     log.type === 'Visit' ? <MapPin size={16} /> : <Mail size={16} />}
                                  </div>
                                  <div className="flex-1">
                                    <div className="flex justify-between items-start mb-1">
                                      <span className="text-xs font-bold text-slate-900 dark:text-white">
                                        {log.type === 'Call' ? 'Llamada' : log.type === 'Visit' ? 'Visita en Campo' : 'Correo'}
                                      </span>
                                      <span className="text-[10px] text-slate-400 font-bold">{formatDate(log.date)}</span>
                                    </div>
                                    <p className="text-sm text-slate-600 dark:text-slate-400">{log.notes}</p>
                                  </div>
                                </div>
                              ))
                            )}
                          </div>
                        </div>
                      )}

                      {activeDetailTab === 'files' && (
                        <div className="p-8 space-y-6">
                          <div className="flex justify-between items-center">
                            <h4 className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">Documentos y Archivos</h4>
                            <div className="relative">
                              <input
                                type="file"
                                id="client-file-upload"
                                className="hidden"
                                onChange={handleFileUpload}
                                disabled={isUploading}
                              />
                              <label
                                htmlFor="client-file-upload"
                                className={cn(
                                  "text-xs text-primary font-bold hover:underline flex items-center gap-1 cursor-pointer",
                                  isUploading && "opacity-50 cursor-not-allowed"
                                )}
                              >
                                {isUploading ? (
                                  <div className="w-3 h-3 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                                ) : (
                                  <Plus size={14} />
                                )}
                                {isUploading ? 'Subiendo...' : 'Subir Archivo'}
                              </label>
                            </div>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {selectedClient.attachments?.length > 0 ? (
                              selectedClient.attachments.map((file: any, i: number) => (
                                <a 
                                  key={i} 
                                  href={file.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="flex items-center gap-3 p-3 bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-xl shadow-sm hover:shadow-md transition-all cursor-pointer group"
                                >
                                  <div className="bg-slate-100 dark:bg-slate-700 p-2 rounded-lg text-slate-500 group-hover:bg-primary/10 group-hover:text-primary transition-colors">
                                    <FileText size={20} />
                                  </div>
                                  <div className="flex-1 overflow-hidden">
                                    <p className="text-xs font-bold text-slate-900 dark:text-white truncate">{file.name}</p>
                                    <p className="text-[10px] text-slate-400 uppercase">{file.type?.split('/')[1] || 'Documento'}</p>
                                  </div>
                                  <Download size={16} className="text-slate-300 group-hover:text-primary transition-colors" />
                                </a>
                              ))
                            ) : (
                              <div className="col-span-2 text-center py-12 text-slate-400">
                                <Paperclip size={32} className="mx-auto mb-2 opacity-20" />
                                <p className="text-xs">No hay archivos adjuntos</p>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <FormModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={selectedClient ? "Editar Cliente" : "Nuevo Prospecto"}
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
                if (currentStep < 2) {
                  // Validate current step
                  let stepValid = true;
                  if (currentStep === 0) {
                    stepValid = validateField('name', newClient.name);
                  } else if (currentStep === 1) {
                    const eValid = validateField('email', newClient.email);
                    const pValid = validateField('phone', newClient.phone);
                    stepValid = eValid && pValid;
                  }
                  
                  if (stepValid) {
                    setCurrentStep(prev => prev + 1);
                  } else {
                    toast.error('Por favor, complete los campos requeridos');
                  }
                } else {
                  const form = document.getElementById('client-form') as HTMLFormElement;
                  form?.requestSubmit();
                }
              }}
              disabled={isSubmitting}
              className="flex-1 py-4 px-6 bg-primary text-white font-bold rounded-xl hover:bg-primary-hover transition-all shadow-lg shadow-primary-shadow order-1 sm:order-2 flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {isSubmitting ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : currentStep === 2 ? (
                <>
                  <Check size={20} />
                  {selectedClient ? "Actualizar Cliente" : "Finalizar Registro"}
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
          formId="client-form"
          currentStep={currentStep}
          onStepChange={setCurrentStep}
          onSubmit={handleSubmitClient}
          steps={[
            {
              title: "General",
              content: (
                <FormSection title="Información General" icon={Users} description="Datos básicos del cliente o empresa">
                  <FormInput 
                    label="Nombre Completo"
                    required
                    value={newClient.name}
                    onChange={(e) => {
                      setNewClient({...newClient, name: e.target.value});
                      validateField('name', e.target.value);
                    }}
                    error={validationErrors.name}
                    placeholder="Ej: Juan Pérez"
                  />
                  <FormInput 
                    label="Empresa"
                    value={newClient.company}
                    onChange={(e) => setNewClient({...newClient, company: e.target.value})}
                    placeholder="Ej: Constructora S.A. (Opcional)"
                  />
                  <FormSelect
                    label="Estado del Prospecto"
                    value={newClient.status}
                    onChange={(e) => setNewClient({...newClient, status: e.target.value})}
                  >
                    <option value="Lead">Lead / Prospecto</option>
                    <option value="Active">Cliente Activo</option>
                    <option value="On Hold">En Pausa</option>
                    <option value="Lost">Perdido</option>
                  </FormSelect>
                </FormSection>
              )
            },
            {
              title: "Contacto",
              content: (
                <FormSection title="Información de Contacto" icon={Mail} description="Cómo comunicarnos con el cliente">
                  <FormInput 
                    label="Email Principal"
                    required
                    type="email"
                    value={newClient.email}
                    onChange={(e) => {
                      setNewClient({...newClient, email: e.target.value});
                      validateField('email', e.target.value);
                    }}
                    error={validationErrors.email}
                    placeholder="juan@ejemplo.com"
                  />
                  <FormInput 
                    label="Teléfono"
                    required
                    value={newClient.phone}
                    onChange={(e) => {
                      setNewClient({...newClient, phone: e.target.value});
                      validateField('phone', e.target.value);
                    }}
                    error={validationErrors.phone}
                    placeholder="+502 1234 5678"
                  />
                  <FormInput 
                    label="Persona de Contacto"
                    value={newClient.contactPerson}
                    onChange={(e) => setNewClient({...newClient, contactPerson: e.target.value})}
                    placeholder="Ej: Ing. Mario Rossi"
                  />
                  <FormInput 
                    label="Contacto Adicional"
                    value={newClient.contacto}
                    onChange={(e) => setNewClient({...newClient, contacto: e.target.value})}
                    placeholder="Ej: Teléfono secundario o red social"
                  />
                </FormSection>
              )
            },
            {
              title: "Notas",
              content: (
                <FormSection title="Notas y Seguimiento" icon={Info} description="Detalles adicionales y observaciones">
                  <div className="col-span-full space-y-2 group">
                    <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] ml-1 group-focus-within:text-primary transition-colors">
                      Notas Iniciales
                    </label>
                    <textarea 
                      className="w-full px-5 py-4 bg-white dark:bg-slate-900 border-2 border-slate-100 dark:border-slate-800 rounded-2xl focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/5 transition-all duration-300 font-medium text-slate-900 dark:text-white placeholder:text-slate-300 dark:placeholder:text-slate-600 h-48 resize-none shadow-sm hover:shadow-md"
                      value={newClient.notes}
                      onChange={(e) => setNewClient({...newClient, notes: e.target.value})}
                      placeholder="Detalles adicionales sobre el prospecto, intereses, presupuesto estimado, etc..."
                    ></textarea>
                  </div>
                </FormSection>
              )
            }
          ]}
        />
      </FormModal>

      {isChatOpen && selectedClient && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <motion.div 
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white dark:bg-slate-900 w-full max-w-lg h-[80vh] rounded-3xl shadow-2xl flex flex-col overflow-hidden border border-slate-100 dark:border-slate-800"
          >
            <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-primary text-white">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center font-bold">
                  {selectedClient.name.charAt(0)}
                </div>
                <div>
                  <h2 className="text-lg font-bold leading-none">{selectedClient.name}</h2>
                  <p className="text-[10px] opacity-80 uppercase tracking-widest mt-1">Chat en Tiempo Real</p>
                </div>
              </div>
              <button onClick={handleCloseChat} className="p-2 hover:bg-primary-hover rounded-full transition-colors">
                <X size={24} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-slate-50 dark:bg-slate-900/50">
              {chatMessages.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-slate-400">
                  <MessageSquare size={48} className="mb-4 opacity-20" />
                  <p className="text-sm">Inicia una conversación con {selectedClient.name}</p>
                </div>
              ) : (
                chatMessages.map((msg) => (
                  <div 
                    key={msg.id}
                    className={cn(
                      "flex flex-col max-w-[80%]",
                      msg.sender === 'Admin' ? "ml-auto items-end" : "items-start"
                    )}
                  >
                    <div className={cn(
                      "px-4 py-2 rounded-2xl text-sm shadow-sm",
                      msg.sender === 'Admin' 
                        ? "bg-primary text-white rounded-tr-none" 
                        : "bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-100 dark:border-slate-700 rounded-tl-none"
                    )}>
                      {msg.text}
                    </div>
                    <span className="text-[10px] text-slate-400 mt-1">
                      {msg.createdAt ? formatDate(msg.createdAt.toDate ? msg.createdAt.toDate().toISOString() : msg.createdAt) : 'Enviando...'}
                    </span>
                  </div>
                ))
              )}
            </div>

            <form onSubmit={handleSendMessage} className="p-4 bg-white dark:bg-slate-900 border-t border-slate-100 dark:border-slate-800 flex gap-2">
              <input 
                type="text" 
                placeholder="Escribe un mensaje..." 
                className="flex-1 px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary text-sm text-slate-900 dark:text-white"
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
              />
              <button 
                type="submit"
                className="p-3 bg-primary text-white rounded-xl hover:bg-primary-hover transition-all shadow-lg shadow-primary-shadow"
              >
                <Send size={20} />
              </button>
            </form>
          </motion.div>
        </div>
      )}
    </>
  );
}
