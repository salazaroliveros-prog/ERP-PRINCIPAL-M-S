import React, { useCallback, useEffect, useState, useMemo } from 'react';
import { GoogleGenAI, Type } from "@google/genai";
import { 
  Plus, 
  FileText, 
  Search, 
  Send, 
  Download, 
  MoreVertical,
  Trash2,
  Edit2,
  X,
  User,
  Calculator,
  Mail,
  Briefcase,
  Layers,
  Copy,
  Package,
  MessageCircle
} from 'lucide-react';
import { StepForm, FormSection, FormInput, FormSelect } from './FormLayout';
import { formatCurrency, formatDate, cn, handleApiError, OperationType } from '../lib/utils';
import { logAction } from '../lib/audit';
import { motion, AnimatePresence } from 'motion/react';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import ConfirmModal from './ConfirmModal';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { drawReportHeader } from '../lib/pdfUtils';
import { toast } from 'sonner';
import { FormModal } from './FormModal';
import { Info, List, ChevronLeft, ChevronRight, CheckCircle2, Database, Sparkles, Loader2 } from 'lucide-react';
import { APU_TEMPLATES } from '../constants/apuData';
import { listClients } from '../lib/clientsApi';
import { listProjects, listProjectBudgetItemsDetailed } from '../lib/projectsApi';
import { createQuoteRecord, deleteQuoteRecord, listQuotes, updateQuoteRecord } from '../lib/quotesApi';

export default function Quotes() {
  const [quotes, setQuotes] = useState<any[]>([]);
  const [clients, setClients] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [statusFilter, setStatusFilter] = useState('All');
  const [clientFilter, setClientFilter] = useState('All');
  const [searchTerm, setSearchTerm] = useState('');
  const [currentStep, setCurrentStep] = useState(0);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [editingQuoteId, setEditingQuoteId] = useState<string | null>(null);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [isSending, setIsSending] = useState<string | null>(null);
  const [quoteToDelete, setQuoteToDelete] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [newQuote, setNewQuote] = useState<{
    clientId: string;
    projectId: string;
    date: Date;
    notes: string;
    items: {
      description: string;
      quantity: number;
      unitPrice: number;
      materials?: any[];
      labor?: any[];
      indirectFactor?: number;
      materialCost?: number;
      laborCost?: number;
    }[];
    status: string;
  }>({
    clientId: '',
    projectId: '',
    date: new Date(),
    notes: '',
    items: [{ description: '', quantity: 1, unitPrice: 0 }],
    status: 'Pending'
  });

  const [isBudgetImportOpen, setIsBudgetImportOpen] = useState(false);
  const [isTemplateImportOpen, setIsTemplateImportOpen] = useState(false);
  const [projectBudgetItems, setProjectBudgetItems] = useState<any[]>([]);
  const [selectedItemForAPU, setSelectedItemForAPU] = useState<any | null>(null);
  const [isAPUModalOpen, setIsAPUModalOpen] = useState(false);

  const loadQuotes = useCallback(async () => {
    try {
      const items = await listQuotes();
      setQuotes(items);
    } catch (error) {
      handleApiError(error, OperationType.GET, 'quotes');
    }
  }, []);

  const loadReferenceData = useCallback(async () => {
    try {
      const [clientItems, projectItems] = await Promise.all([listClients(), listProjects()]);
      setClients(clientItems);
      setProjects(projectItems);
    } catch (error) {
      handleApiError(error, OperationType.GET, 'quotes/reference-data');
    }
  }, []);

  useEffect(() => {
    loadQuotes();
    loadReferenceData();
  }, [loadQuotes, loadReferenceData]);

  useEffect(() => {
    const handleQuickActionTrigger = (event: Event) => {
      const customEvent = event as CustomEvent<{ action?: string }>;
      if (customEvent.detail?.action !== 'new-quote') return;

      setEditingQuoteId(null);
      setNewQuote({
        clientId: '',
        projectId: '',
        date: new Date(),
        notes: '',
        items: [{ description: '', quantity: 1, unitPrice: 0 }],
        status: 'Pending'
      });
      setCurrentStep(0);
      setIsModalOpen(true);
    };

    window.addEventListener('QUICK_ACTION_TRIGGER', handleQuickActionTrigger as EventListener);
    return () => window.removeEventListener('QUICK_ACTION_TRIGGER', handleQuickActionTrigger as EventListener);
  }, []);

  useEffect(() => {
    if (newQuote.projectId) {
      listProjectBudgetItemsDetailed(newQuote.projectId)
        .then((items) => setProjectBudgetItems(items as any[]))
        .catch((error) => handleApiError(error, OperationType.GET, `projects/${newQuote.projectId}/budgetItems`));
    } else {
      setProjectBudgetItems([]);
    }
  }, [newQuote.projectId]);

  const filteredQuotes = useMemo(() => {
    return quotes.filter(quote => {
      const client = clients.find(c => c.id === quote.clientId);
      const matchesSearch = !searchTerm || 
        (client?.name.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (quote.id.toLowerCase().includes(searchTerm.toLowerCase()));
      const matchesStatus = statusFilter === 'All' || quote.status === statusFilter;
      const matchesClient = clientFilter === 'All' || quote.clientId === clientFilter;
      return matchesSearch && matchesStatus && matchesClient;
    });
  }, [quotes, clients, searchTerm, statusFilter, clientFilter]);

  const totalPages = Math.ceil(filteredQuotes.length / itemsPerPage);
  const paginatedQuotes = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredQuotes.slice(start, start + itemsPerPage);
  }, [filteredQuotes, currentPage, itemsPerPage]);

  const [itemErrors, setItemErrors] = useState<{[key: number]: {description?: string, quantity?: string, unitPrice?: string}}>({});

  useEffect(() => {
    if (!isModalOpen) {
      setItemErrors({});
    }
  }, [isModalOpen]);

  const validateItem = (index: number, field: 'description' | 'quantity' | 'unitPrice', value: any) => {
    const newErrors = { ...itemErrors };
    const itemError = newErrors[index] || {};

    if (field === 'description') {
      if (!value || value.trim() === '') {
        itemError.description = 'La descripción es obligatoria';
      } else {
        delete itemError.description;
      }
    }

    if (field === 'quantity') {
      const numVal = Number(value);
      if (isNaN(numVal) || numVal <= 0) {
        itemError.quantity = 'La cantidad debe ser mayor a 0';
      } else {
        delete itemError.quantity;
      }
    }

    if (field === 'unitPrice') {
      const numVal = Number(value);
      if (isNaN(numVal) || numVal <= 0) {
        itemError.unitPrice = 'El precio debe ser mayor a 0';
      } else {
        delete itemError.unitPrice;
      }
    }

    if (Object.keys(itemError).length === 0) {
      delete newErrors[index];
    } else {
      newErrors[index] = itemError;
    }

    setItemErrors(newErrors);
  };

  const totalQuote = newQuote.items.reduce((acc, item) => acc + (item.quantity * item.unitPrice), 0);

  const handleAISuggestions = async () => {
    if (!newQuote.projectId) {
      toast.error('Por favor seleccione un proyecto antes de sugerir');
      return;
    }

    setIsGenerating(true);
    try {
      const project = projects.find(p => p.id === newQuote.projectId);
      const ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_GEMINI_API_KEY });
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: `Como experto en presupuestos de construcción, sugiere una descripción profesional para una cotización del proyecto "${project?.name || 'seleccionado'}". Proporciona la respuesta en español.`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              description: {
                type: Type.STRING,
                description: "Descripción profesional de la cotización."
              }
            },
            required: ["description"]
          }
        }
      });

      const suggestions = JSON.parse(response.text);
      toast.success('Sugerencia generada con éxito');
      if (suggestions.description) {
        toast.info(`Descripción sugerida: ${suggestions.description}`, { duration: 6000 });
      }
    } catch (error) {
      console.error('Error generating AI suggestions:', error);
      toast.error('Error al generar sugerencias con IA');
    } finally {
      setIsGenerating(false);
    }
  };

  const validateAllItems = (showToast = true) => {
    const errors: {[key: number]: {description?: string, quantity?: string, unitPrice?: string}} = {};
    let hasErrors = false;

    newQuote.items.forEach((item, index) => {
      const itemError: {description?: string, quantity?: string, unitPrice?: string} = {};
      
      if (!item.description || item.description.trim() === '') {
        itemError.description = 'La descripción es obligatoria';
        hasErrors = true;
      }
      if (item.quantity <= 0) {
        itemError.quantity = 'La cantidad debe ser mayor a 0';
        hasErrors = true;
      }
      if (item.unitPrice <= 0) {
        itemError.unitPrice = 'El precio debe ser mayor a 0';
        hasErrors = true;
      }
      if (Object.keys(itemError).length > 0) {
        errors[index] = itemError;
      }
    });

    setItemErrors(errors);
    if (hasErrors && showToast) {
      toast.error('Se encontraron errores en los items. Por favor revise los campos marcados en rojo.');
    } else if (!hasErrors && showToast) {
      toast.success('Todos los items son válidos.');
    }
    return !hasErrors;
  };

  const handleAddQuote = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    
    // Final Validation
    if (!validateAllItems(true)) return;

    if (!newQuote.clientId) return toast.error('Por favor seleccione un cliente');
    if (!newQuote.projectId) return toast.error('Por favor seleccione un proyecto');
    if (newQuote.items.length === 0) return toast.error('Por favor agregue al menos un item');

    try {
      const quoteData = {
        clientId: newQuote.clientId,
        projectId: newQuote.projectId,
        date: newQuote.date.toISOString(),
        notes: newQuote.notes,
        items: newQuote.items,
        status: newQuote.status,
        total: totalQuote,
      };

      if (editingQuoteId) {
        await updateQuoteRecord(editingQuoteId, quoteData);

        await logAction(
          'Actualización de Cotización',
          'Cotizaciones',
          `Cotización actualizada para cliente: ${clients.find(c => c.id === newQuote.clientId)?.name || 'N/A'} - Total: ${formatCurrency(totalQuote)}`,
          'update'
        );

        toast.success('Cotización actualizada con éxito');
      } else {
        await createQuoteRecord(quoteData);

        await logAction(
          'Creación de Cotización',
          'Cotizaciones',
          `Nueva cotización generada para cliente: ${clients.find(c => c.id === newQuote.clientId)?.name || 'N/A'} - Total: ${formatCurrency(totalQuote)}`,
          'create'
        );

        toast.success('Cotización generada con éxito');
      }
      await loadQuotes();
      setIsModalOpen(false);
      setEditingQuoteId(null);
      setNewQuote({ clientId: '', projectId: '', date: new Date(), notes: '', items: [{ description: '', quantity: 1, unitPrice: 0 }], status: 'Pending' });
    } catch (error) {
      handleApiError(error, OperationType.WRITE, editingQuoteId ? `quotes/${editingQuoteId}` : 'quotes');
    }
  };

  const handleEditQuote = (quote: any) => {
    setEditingQuoteId(quote.id);
    setNewQuote({
      clientId: quote.clientId,
      projectId: quote.projectId || '',
      date: new Date(quote.date),
      notes: quote.notes || '',
      items: quote.items.map((item: any) => ({ ...item })),
      status: quote.status,
    });
    setCurrentStep(0);
    setIsModalOpen(true);
  };

  const handleDeleteQuote = (id: string) => {
    setQuoteToDelete(id);
    setIsDeleteConfirmOpen(true);
  };

  const confirmDeleteQuote = async () => {
    if (!quoteToDelete) return;
    try {
      const quote = quotes.find(q => q.id === quoteToDelete);
      await deleteQuoteRecord(quoteToDelete);
      
      if (quote) {
        await logAction(
          'Eliminación de Cotización',
          'Cotizaciones',
          `Cotización eliminada para cliente: ${clients.find(c => c.id === quote.clientId)?.name || 'N/A'} - Total: ${formatCurrency(quote.total)}`,
          'delete'
        );
      }

      setQuoteToDelete(null);
      toast.success('Cotización eliminada');
      await loadQuotes();
    } catch (error) {
      handleApiError(error, OperationType.DELETE, `quotes/${quoteToDelete}`);
    }
  };

  const addItem = () => {
    // Check if current items are valid before adding a new one
    if (!validateAllItems(false)) {
      toast.error('Por favor complete correctamente los items actuales antes de agregar uno nuevo');
      return;
    }

    setNewQuote({...newQuote, items: [...newQuote.items, { description: '', quantity: 1, unitPrice: 0 }]});
  };

  const [isDownloading, setIsDownloading] = useState<string | null>(null);

  const buildQuotePdf = (quote: any, client: any) => {
    const doc = new jsPDF();
    const quoteCode = quote.id.slice(-6).toUpperCase();

    const headerBottom = drawReportHeader(doc, 'COTIZACION PROFESIONAL', {
      subtitle: `No. ${quoteCode}`,
      dateText: `Fecha: ${formatDate(quote.date)}`,
      x: 14,
      y: 9,
    });

    doc.setFontSize(10);
    doc.setTextColor(71, 85, 105);
    doc.setFont('helvetica', 'bold');
    doc.text('CLIENTE:', 16, headerBottom + 9);
    doc.setFont('helvetica', 'normal');
    doc.text(client?.name || 'N/A', 35, headerBottom + 9);
    doc.setFont('helvetica', 'bold');
    doc.text('TELEFONO:', 16, headerBottom + 15);
    doc.setFont('helvetica', 'normal');
    doc.text(client?.phone || 'N/A', 38, headerBottom + 15);
    doc.setFont('helvetica', 'bold');
    doc.text('EMAIL:', 16, headerBottom + 21);
    doc.setFont('helvetica', 'normal');
    doc.text(client?.email || 'N/A', 31, headerBottom + 21);

    doc.setFont('helvetica', 'bold');
    doc.text('ESTADO:', 130, headerBottom + 9);
    doc.setTextColor(quote.status === 'Accepted' ? 22 : 217, quote.status === 'Accepted' ? 163 : 119, quote.status === 'Accepted' ? 74 : 6);
    doc.text(`${quote.status === 'Accepted' ? 'Aceptada' : quote.status === 'Sent' ? 'Enviada' : 'Pendiente'}`, 150, headerBottom + 9);
    doc.setTextColor(71, 85, 105);
    doc.setFont('helvetica', 'bold');
    doc.text('VALIDEZ:', 130, headerBottom + 15);
    doc.setFont('helvetica', 'normal');
    doc.text('15 dias calendario', 150, headerBottom + 15);
    doc.setFont('helvetica', 'bold');
    doc.text('MONEDA:', 130, headerBottom + 21);
    doc.setFont('helvetica', 'normal');
    doc.text('GTQ', 150, headerBottom + 21);

    autoTable(doc, {
      startY: headerBottom + 30,
      margin: { left: 14, right: 14 },
      head: [['Descripcion', 'Cantidad', 'Precio Unitario', 'Subtotal']],
      body: quote.items.map((item: any) => [
        item.description,
        String(item.quantity),
        formatCurrency(item.unitPrice),
        formatCurrency(item.quantity * item.unitPrice),
      ]),
      foot: [[
        { content: 'TOTAL COTIZADO', colSpan: 3, styles: { halign: 'right', fontStyle: 'bold', textColor: [15, 23, 42] } },
        { content: formatCurrency(quote.total), styles: { fontStyle: 'bold', textColor: [37, 99, 235] } },
      ]],
      theme: 'grid',
      headStyles: { fillColor: [37, 99, 235], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 10 },
      bodyStyles: { fontSize: 9, textColor: [51, 65, 85] },
      footStyles: { fillColor: [241, 245, 249], fontSize: 10 },
      columnStyles: {
        0: { cellWidth: 96 },
        1: { halign: 'center', cellWidth: 24 },
        2: { halign: 'right', cellWidth: 32 },
        3: { halign: 'right', cellWidth: 34 },
      },
    });

    const finalY = (doc as any).lastAutoTable.finalY || 150;
    let nextY = finalY + 10;

    if (quote.notes) {
      doc.setFontSize(10);
      doc.setTextColor(15, 23, 42);
      doc.setFont('helvetica', 'bold');
      doc.text('ALCANCES Y CONDICIONES:', 14, nextY);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(71, 85, 105);
      const splitNotes = doc.splitTextToSize(quote.notes, 182);
      doc.text(splitNotes, 14, nextY + 6);
      nextY += 6 + (splitNotes.length * 5);
    }

    if (nextY > 235) {
      doc.addPage();
      nextY = 30;
    }

    doc.setDrawColor(203, 213, 225);
    doc.line(14, nextY + 10, 88, nextY + 10);
    doc.line(122, nextY + 10, 196, nextY + 10);
    doc.setFontSize(9);
    doc.setTextColor(100, 116, 139);
    doc.text('Firma Cliente', 51, nextY + 15, { align: 'center' });
    doc.text('Firma Responsable', 159, nextY + 15, { align: 'center' });

    const pageCount = doc.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setDrawColor(226, 232, 240);
      doc.line(14, 274, 196, 274);
      doc.setFontSize(8);
      doc.setTextColor(100, 116, 139);
      doc.text(`Quesada, Jutiapa | Tel: 55606172 / 40601526 | Pagina ${i} de ${pageCount}`, 105, 279, { align: 'center' });
      doc.setTextColor(37, 99, 235);
      doc.setFont('helvetica', 'italic');
      doc.text('"Edificando el Futuro"', 105, 284, { align: 'center' });
    }

    return doc;
  };

  const generateQuotePDF = async (quote: any) => {
    const client = clients.find(c => c.id === quote.clientId);
    setIsDownloading(quote.id);

    try {
      const doc = buildQuotePdf(quote, client);
      doc.save(`Cotizacion_${client?.name?.replace(/\s+/g, '_') || 'Quote'}_${quote.id.slice(-6).toUpperCase()}.pdf`);
      toast.success('Cotizacion PDF descargada con exito');
    } catch (error) {
      console.error('Error generating PDF:', error);
      toast.error('Error al generar el PDF de la cotizacion');
    } finally {
      setIsDownloading(null);
    }
  };

  const handleSendQuote = async (quote: any) => {
    const client = clients.find(c => c.id === quote.clientId);
    if (!client?.email) {
      toast.error('El cliente no tiene un correo electrónico registrado');
      return;
    }
    
    try {
      setIsSending(quote.id);
      
      // Construct mailto link
      const subject = encodeURIComponent(`Cotización #${quote.id.slice(-6).toUpperCase()} - CONSTRUCTORA WM_M&S`);
      const body = encodeURIComponent(
        `Estimado(a) ${client.name},\n\n` +
        `Adjunto enviamos la cotización solicitada.\n\n` +
        `Total: ${formatCurrency(quote.total)}\n\n` +
        `Notas: ${quote.notes || 'N/A'}\n\n` +
        `Quedamos a su disposición para cualquier duda.\n\n` +
        `Atentamente,\nCONSTRUCTORA WM_M&S`
      );
      
      window.location.href = `mailto:${client.email}?subject=${subject}&body=${body}`;

      await toast.promise(
        async () => {
          // Simulate network delay
          await new Promise((resolve) => setTimeout(resolve, 1500));
          
          // Update status to 'Sent' if it was 'Pending'
          const updateData = {
            status: quote.status === 'Pending' ? 'Sent' : quote.status,
            sentAt: new Date().toISOString(),
          };

          await updateQuoteRecord(quote.id, updateData);
          await loadQuotes();
        },
        {
          loading: 'Actualizando estado de envío...',
          success: `Cotización marcada como enviada a ${client.email}`,
          error: 'Error al actualizar el estado',
        }
      );
    } catch (error) {
      console.error('Error sending quote:', error);
    } finally {
      setIsSending(null);
    }
  };

  const handleSendWhatsApp = async (quote: any) => {
    const client = clients.find(c => c.id === quote.clientId);
    if (!client?.phone) {
      toast.error('El cliente no tiene un número de teléfono registrado');
      return;
    }

    setIsSending(quote.id);

    // Clean phone number (remove non-digits)
    const cleanPhone = client.phone.replace(/\D/g, '');
    
    const whatsappMessage =
      `*Cotización #${quote.id.slice(-6).toUpperCase()} - CONSTRUCTORA WM_M&S*\n\n` +
      `Estimado(a) *${client.name}*,\n\n` +
      `Adjunto enviamos los detalles de la cotización solicitada.\n\n` +
      `*Total:* ${formatCurrency(quote.total)}\n` +
      `*Fecha:* ${formatDate(quote.date)}\n` +
      `*Notas:* ${quote.notes || 'N/A'}\n\n` +
      `Quedamos a su disposición para cualquier duda.\n\n` +
      `Atentamente,\n*CONSTRUCTORA WM_M&S*`;
    const message = encodeURIComponent(whatsappMessage);

    try {
      const doc = buildQuotePdf(quote, client);
      const pdfBlob = doc.output('blob');
      const fileName = `Cotizacion_${quote.id.slice(-6).toUpperCase()}.pdf`;
      const pdfFile = new File([pdfBlob], fileName, { type: 'application/pdf' });

      const nav = navigator as Navigator & {
        canShare?: (data: { files?: File[] }) => boolean;
      };

      if (nav.share && nav.canShare?.({ files: [pdfFile] })) {
        await nav.share({
          title: `Cotizacion #${quote.id.slice(-6).toUpperCase()} - Constructora WM_M&S`,
          text: whatsappMessage,
          files: [pdfFile],
        });
        toast.success('Cotizacion lista para enviar por WhatsApp con PDF adjunto');
      } else {
        doc.save(fileName);
        const whatsappUrl = `https://wa.me/${cleanPhone}?text=${message}`;
        window.open(whatsappUrl, '_blank');
        if (navigator.clipboard?.writeText) {
          try {
            await navigator.clipboard.writeText(whatsappMessage.replace(/\*/g, ''));
          } catch {
            // Clipboard may fail in some browser contexts.
          }
        }
        toast.success('Se descargo el PDF, se abrio WhatsApp y el mensaje quedo copiado. Adjunta el archivo al chat.');
      }

      if (quote.status === 'Pending') {
        await updateQuoteRecord(quote.id, {
          status: 'Sent',
          sentAt: new Date().toISOString(),
        });
        await loadQuotes();
      }
    } catch (error) {
      console.error('Error sending quote via WhatsApp:', error);
      toast.error('No se pudo preparar el envio por WhatsApp');
    } finally {
      setIsSending(null);
    }
  };

  const handleCopyWhatsAppMessage = async (quote: any) => {
    const client = clients.find(c => c.id === quote.clientId);
    if (!client) {
      toast.error('No se encontro el cliente de la cotizacion');
      return;
    }

    const message =
      `Cotización #${quote.id.slice(-6).toUpperCase()} - CONSTRUCTORA WM_M&S\n\n` +
      `Estimado(a) ${client.name},\n\n` +
      `Adjunto enviamos los detalles de la cotización solicitada.\n\n` +
      `Total: ${formatCurrency(quote.total)}\n` +
      `Fecha: ${formatDate(quote.date)}\n` +
      `Notas: ${quote.notes || 'N/A'}\n\n` +
      `Quedamos a su disposición para cualquier duda.\n\n` +
      `Atentamente,\nCONSTRUCTORA WM_M&S`;

    if (!navigator.clipboard?.writeText) {
      toast.error('Tu navegador no permite copiar al portapapeles');
      return;
    }

    try {
      await navigator.clipboard.writeText(message);
      toast.success('Mensaje de WhatsApp copiado');
    } catch {
      toast.error('No se pudo copiar el mensaje');
    }
  };

  return (
    <>
      <ConfirmModal
        isOpen={isDeleteConfirmOpen}
        onClose={() => setIsDeleteConfirmOpen(false)}
        onConfirm={confirmDeleteQuote}
        title="Eliminar Cotización"
        message="¿Estás seguro de que deseas eliminar esta cotización? Esta acción no se puede deshacer."
      />

      <div className="space-y-6 md:space-y-8">
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
        <div className="max-w-full overflow-hidden">
          <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-slate-900 truncate">Cotizaciones</h1>
          <p className="text-slate-500 text-[10px] sm:text-sm md:text-base">Propuestas para clientes</p>
        </div>
        <button 
          onClick={() => setIsModalOpen(true)}
          className="flex items-center justify-center gap-2 bg-primary text-white font-bold py-2.5 sm:py-3 px-4 sm:px-6 rounded-xl hover:bg-primary-hover transition-all shadow-lg shadow-primary-shadow w-full sm:w-auto text-xs sm:text-sm"
        >
          <Plus size={18} className="sm:w-5 sm:h-5" />
          <span className="whitespace-nowrap">Nueva Cotización</span>
        </button>
      </header>

      <div className="flex flex-col lg:flex-row gap-3 sm:gap-4 mb-4 sm:mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 sm:left-4 top-1/2 -translate-y-1/2 text-slate-400 sm:w-5 sm:h-5" size={16} />
          <input 
            type="text" 
            placeholder="Buscar por cliente..." 
            className="w-full pl-10 sm:pl-12 pr-4 py-2.5 sm:py-3 md:py-4 bg-white border border-slate-200 rounded-xl sm:rounded-2xl focus:outline-none focus:ring-2 focus:ring-primary transition-all shadow-sm text-xs sm:text-sm"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="grid grid-cols-2 lg:flex gap-2 sm:gap-3 md:gap-4">
          <select 
            aria-label="Filtrar cotizaciones por estado"
            title="Filtrar cotizaciones por estado"
            className="px-2.5 sm:px-4 py-2.5 sm:py-3 md:py-4 bg-white border border-slate-200 rounded-xl sm:rounded-2xl focus:outline-none focus:ring-2 focus:ring-primary transition-all shadow-sm text-[10px] sm:text-xs md:text-sm font-bold text-slate-600 appearance-none"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="All">Todos los Estados</option>
            <option value="Pending">Pendientes</option>
            <option value="Sent">Enviadas</option>
            <option value="Accepted">Aceptadas</option>
          </select>
          <select 
            aria-label="Filtrar cotizaciones por cliente"
            title="Filtrar cotizaciones por cliente"
            className="px-2.5 sm:px-4 py-2.5 sm:py-3 md:py-4 bg-white border border-slate-200 rounded-xl sm:rounded-2xl focus:outline-none focus:ring-2 focus:ring-primary transition-all shadow-sm text-[10px] sm:text-xs md:text-sm font-bold text-slate-600 appearance-none"
            value={clientFilter}
            onChange={(e) => setClientFilter(e.target.value)}
          >
            <option value="All">Todos los Clientes</option>
            {clients.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-[var(--radius-theme)] shadow-[var(--shadow-theme)] border border-slate-100 dark:border-slate-800 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-100 dark:border-slate-800">
                <th className="px-4 sm:px-6 py-3 sm:py-4 text-[9px] sm:text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest">Fecha</th>
                <th className="px-4 sm:px-6 py-3 sm:py-4 text-[9px] sm:text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest">Cliente</th>
                <th className="px-4 sm:px-6 py-3 sm:py-4 text-[9px] sm:text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest">Estado</th>
                <th className="px-4 sm:px-6 py-3 sm:py-4 text-[9px] sm:text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest text-right">Total</th>
                <th className="px-4 sm:px-6 py-3 sm:py-4 text-[9px] sm:text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
              {paginatedQuotes.map((quote) => {
                const client = clients.find(c => c.id === quote.clientId);
                return (
                  <tr key={quote.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-all duration-200 group">
                    <td className="px-4 sm:px-6 py-3 sm:py-4 text-[10px] sm:text-sm text-slate-600 dark:text-slate-400 whitespace-nowrap">{formatDate(quote.date)}</td>
                    <td className="px-4 sm:px-6 py-3 sm:py-4">
                      <div className="flex items-center gap-1.5 sm:gap-2">
                        <User size={12} className="text-slate-400 dark:text-slate-500 sm:w-3.5 sm:h-3.5" />
                        <span className="text-[10px] sm:text-sm font-bold text-slate-900 dark:text-white group-hover:text-primary transition-colors truncate max-w-[120px] sm:max-w-none">{client?.name || 'N/A'}</span>
                      </div>
                    </td>
                    <td className="px-4 sm:px-6 py-3 sm:py-4">
                      <span className={cn(
                        "text-[8px] sm:text-[10px] font-black uppercase tracking-wider px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-full border",
                        quote.status === 'Accepted' ? "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 border-emerald-100 dark:border-emerald-500/20" : 
                        quote.status === 'Sent' ? "bg-blue-50 dark:bg-blue-500/10 text-blue-600 border-blue-100 dark:border-blue-500/20" :
                        "bg-primary-light dark:bg-primary/10 text-primary border-primary-light dark:border-primary/20"
                      )}>
                        {quote.status === 'Accepted' ? 'Aceptada' : quote.status === 'Sent' ? 'Enviada' : 'Pendiente'}
                      </span>
                    </td>
                    <td className="px-4 sm:px-6 py-3 sm:py-4 text-right font-black text-[10px] sm:text-sm text-slate-900 dark:text-white whitespace-nowrap">{formatCurrency(quote.total)}</td>
                    <td className="px-4 sm:px-6 py-3 sm:py-4 text-right">
                      <div className="flex items-center justify-end gap-1 sm:gap-2">
                        <button 
                          onClick={() => generateQuotePDF(quote)}
                          disabled={isDownloading === quote.id}
                          className={cn(
                            "p-1.5 sm:p-2 transition-colors",
                            isDownloading === quote.id ? "text-slate-300 dark:text-slate-700" : "text-slate-400 dark:text-slate-500 hover:text-blue-600 dark:hover:text-blue-400"
                          )}
                          title="Descargar PDF"
                        >
                          {isDownloading === quote.id ? (
                            <div className="h-3 w-3 sm:h-4 sm:w-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                          ) : (
                            <Download size={14} className="sm:w-4 sm:h-4" />
                          )}
                        </button>
                        <button 
                          onClick={() => handleSendQuote(quote)}
                          disabled={isSending === quote.id}
                          className={cn(
                            "p-1.5 sm:p-2 transition-colors",
                            isSending === quote.id ? "text-slate-300 dark:text-slate-700" : "text-slate-400 dark:text-slate-500 hover:text-primary dark:hover:text-primary"
                          )}
                          title="Enviar por Correo"
                        >
                          {isSending === quote.id ? (
                            <div className="h-3 w-3 sm:h-4 sm:w-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                          ) : (
                            <Send size={14} className="sm:w-4 sm:h-4" />
                          )}
                        </button>
                        <button 
                          onClick={() => handleSendWhatsApp(quote)}
                          className="p-1.5 sm:p-2 text-slate-400 dark:text-slate-500 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors"
                          title="Enviar por WhatsApp"
                        >
                          <MessageCircle size={14} className="sm:w-4 sm:h-4" />
                        </button>
                        <button 
                          onClick={() => handleCopyWhatsAppMessage(quote)}
                          className="p-1.5 sm:p-2 text-slate-400 dark:text-slate-500 hover:text-emerald-700 dark:hover:text-emerald-300 transition-colors"
                          title="Copiar mensaje de WhatsApp"
                        >
                          <Copy size={14} className="sm:w-4 sm:h-4" />
                        </button>
                        <button 
                          onClick={() => handleEditQuote(quote)}
                          className="p-2 text-slate-400 dark:text-slate-500 hover:text-primary dark:hover:text-primary transition-colors"
                          title="Editar Cotización"
                        >
                          <Edit2 size={16} />
                        </button>
                        <button
                          onClick={() => handleDeleteQuote(quote.id)}
                          aria-label="Eliminar cotizacion"
                          title="Eliminar cotizacion"
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

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex flex-col md:flex-row items-center justify-between gap-4 bg-slate-50 dark:bg-slate-800/30 p-6 border-t border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-4">
              <span className="text-sm text-slate-500 dark:text-slate-400 font-medium">
                Mostrando {paginatedQuotes.length} de {filteredQuotes.length} cotizaciones
              </span>
              <div className="flex items-center gap-2">
                <label className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Por página:</label>
                <select 
                  aria-label="Cantidad de cotizaciones por pagina"
                  title="Cantidad de cotizaciones por pagina"
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
      </div>

      <FormModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setEditingQuoteId(null);
          setNewQuote({ clientId: '', projectId: '', date: new Date(), notes: '', items: [{ description: '', quantity: 1, unitPrice: 0 }], status: 'Pending' });
          setCurrentStep(0);
        }}
        title={editingQuoteId ? 'Editar Cotización' : 'Nueva Cotización'}
        maxWidth="max-w-4xl"
        fullVertical
        footer={
          <div className="flex flex-col sm:flex-row justify-between items-center gap-4 w-full">
            <div className="flex gap-2 order-2 sm:order-1">
              <button 
                type="button"
                onClick={() => {
                  setIsModalOpen(false);
                  setEditingQuoteId(null);
                  setNewQuote({ clientId: '', projectId: '', date: new Date(), notes: '', items: [{ description: '', quantity: 1, unitPrice: 0 }], status: 'Pending' });
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
              {currentStep < 1 ? (
                <button 
                  type="button"
                  onClick={() => {
                    if (!newQuote.clientId) {
                      toast.error('Por favor seleccione un cliente');
                      return;
                    }
                    if (!newQuote.projectId) {
                      toast.error('Por favor seleccione un proyecto');
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
                  form="quote-form"
                  className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-10 py-3 bg-primary text-white font-bold rounded-xl hover:bg-primary-hover transition-all shadow-lg shadow-primary-shadow"
                >
                  {editingQuoteId ? 'Actualizar Cotización' : 'Generar Cotización'}
                  <CheckCircle2 size={18} />
                </button>
              )}
            </div>
          </div>
        }
      >
        <StepForm
          formId="quote-form"
          currentStep={currentStep}
          onStepChange={setCurrentStep}
          onSubmit={handleAddQuote}
          steps={[
            {
              title: "General",
              content: (
                <FormSection title="Información General" icon={Info} description="Datos básicos de la cotización">
                  <FormSelect 
                    label="Cliente"
                    required
                    value={newQuote.clientId}
                    onChange={(e) => setNewQuote({...newQuote, clientId: e.target.value})}
                  >
                    <option value="">Seleccionar Cliente</option>
                    {clients.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </FormSelect>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] ml-1">Proyecto Relacionado *</label>
                      <button
                        type="button"
                        onClick={handleAISuggestions}
                        disabled={isGenerating || !newQuote.projectId}
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
                    <FormSelect 
                      label=""
                      value={newQuote.projectId}
                      onChange={(e) => setNewQuote({...newQuote, projectId: e.target.value})}
                    >
                      <option value="">Ninguno / Nuevo Proyecto</option>
                      {projects.map(p => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </FormSelect>
                  </div>
                  <div className="space-y-2 group">
                    <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] ml-1 group-focus-within:text-primary transition-colors">
                      Fecha
                    </label>
                    <div className="relative">
                      <DatePicker
                        selected={newQuote.date}
                        onChange={(date: Date) => setNewQuote({...newQuote, date})}
                        dateFormat="dd/MM/yyyy"
                        className="w-full px-5 py-4 bg-white dark:bg-slate-900 border-2 border-slate-100 dark:border-slate-800 rounded-2xl focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/5 transition-all font-medium text-slate-900 dark:text-white"
                      />
                    </div>
                  </div>
                  <FormSelect 
                    label="Estado"
                    value={newQuote.status}
                    onChange={(e) => setNewQuote({...newQuote, status: e.target.value})}
                  >
                    <option value="Pending">Pendiente</option>
                    <option value="Sent">Enviada</option>
                    <option value="Accepted">Aceptada</option>
                  </FormSelect>
                  <div className="md:col-span-2 space-y-2">
                    <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] ml-1">Notas / Términos y Condiciones</label>
                    <textarea
                      className="w-full px-5 py-4 bg-white dark:bg-slate-900 border-2 border-slate-100 dark:border-slate-800 rounded-2xl focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/5 transition-all font-medium text-slate-900 dark:text-white min-h-[100px]"
                      placeholder="Ej: Validez de la oferta, tiempo de entrega, forma de pago..."
                      value={newQuote.notes}
                      onChange={(e) => setNewQuote({...newQuote, notes: e.target.value})}
                    />
                  </div>
                </FormSection>
              )
            },
            {
              title: "Items",
              content: (
                <FormSection title="Items de Cotización" icon={List} description="Detalle de servicios y materiales">
                  <div className="space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Lista de Items</p>
                      <div className="flex flex-wrap gap-2">
                        {newQuote.projectId && (
                          <button 
                            type="button" 
                            onClick={() => setIsBudgetImportOpen(true)}
                            className="text-[10px] font-bold text-emerald-600 flex items-center gap-1 hover:bg-emerald-50 bg-emerald-50/50 dark:bg-emerald-500/10 px-3 py-1.5 rounded-xl border border-emerald-500/10"
                          >
                            <Database size={14} />
                            Importar Presupuesto
                          </button>
                        )}
                        <button 
                          type="button" 
                          onClick={() => setIsTemplateImportOpen(true)}
                          className="text-[10px] font-bold text-blue-600 flex items-center gap-1 hover:bg-blue-50 bg-blue-50/50 dark:bg-blue-500/10 px-3 py-1.5 rounded-xl border border-blue-500/10"
                        >
                          <Copy size={14} />
                          Importar Plantilla
                        </button>
                        <button 
                          type="button" 
                          onClick={() => validateAllItems(true)}
                          className="text-[10px] font-bold text-amber-600 flex items-center gap-1 hover:bg-amber-50 bg-amber-50/50 dark:bg-amber-500/10 px-3 py-1.5 rounded-xl border border-amber-500/10"
                        >
                          <CheckCircle2 size={14} />
                          Validar Items
                        </button>
                        <button 
                          type="button" 
                          onClick={addItem}
                          className="text-[10px] font-bold text-primary flex items-center gap-1 hover:underline bg-primary-light dark:bg-primary/10 px-3 py-1.5 rounded-xl border border-primary/10"
                        >
                          <Plus size={14} />
                          Agregar Item
                        </button>
                      </div>
                    </div>
                    
                    <div className="space-y-3 pr-2 max-h-[400px] overflow-y-auto custom-scrollbar">
                      {newQuote.items.map((item, index) => (
                        <div key={index} className="flex flex-col gap-3 bg-slate-50 dark:bg-slate-800/50 p-4 rounded-2xl border border-slate-100 dark:border-slate-800">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Item {index + 1}</span>
                            <button 
                              type="button"
                              onClick={() => {
                                const newItems = newQuote.items.filter((_, i) => i !== index);
                                setNewQuote({...newQuote, items: newItems});
                              }}
                              aria-label="Eliminar item de cotizacion"
                              title="Eliminar item"
                              className="p-1.5 text-slate-400 hover:text-rose-600 transition-colors"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                          
                          <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
                            <div className="md:col-span-5 space-y-1">
                              <div className="flex items-center justify-between ml-1">
                                <label className="text-[9px] font-bold text-slate-400 uppercase">Descripción</label>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSelectedItemForAPU({...item, index});
                                    setIsAPUModalOpen(true);
                                  }}
                                  className="text-[9px] font-black text-primary uppercase hover:underline flex items-center gap-1"
                                >
                                  <Calculator size={10} />
                                  {item.materials?.length > 0 || item.labor?.length > 0 ? 'Editar APU' : 'Agregar Costos (APU)'}
                                </button>
                              </div>
                              <input 
                                required
                                type="text" 
                                placeholder="Descripción del servicio o material"
                                className={cn(
                                  "w-full px-4 py-2.5 bg-white dark:bg-slate-900 border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary text-sm text-slate-900 dark:text-white",
                                  itemErrors[index]?.description ? "border-rose-500 ring-1 ring-rose-500" : "border-slate-200 dark:border-slate-800"
                                )}
                                value={item.description}
                                onChange={(e) => {
                                  const newItems = [...newQuote.items];
                                  newItems[index].description = e.target.value;
                                  setNewQuote({...newQuote, items: newItems});
                                  validateItem(index, 'description', e.target.value);
                                }}
                              />
                              {itemErrors[index]?.description && <p className="text-[9px] text-rose-500 font-bold ml-1">{itemErrors[index]?.description}</p>}
                            </div>
                            <div className="md:col-span-2 space-y-1">
                              <label className="text-[9px] font-bold text-slate-400 uppercase ml-1">Cantidad</label>
                              <input 
                                required
                                type="number" 
                                min="0"
                                step="any"
                                className={cn(
                                  "w-full px-4 py-2.5 bg-white dark:bg-slate-900 border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary text-sm text-slate-900 dark:text-white",
                                  itemErrors[index]?.quantity ? "border-rose-500 ring-1 ring-rose-500" : "border-slate-200 dark:border-slate-800"
                                )}
                                aria-label="Cantidad del item"
                                title="Cantidad del item"
                                placeholder="Cantidad"
                                value={item.quantity}
                                onChange={(e) => {
                                  const val = Number(e.target.value);
                                  const newItems = [...newQuote.items];
                                  newItems[index].quantity = val;
                                  setNewQuote({...newQuote, items: newItems});
                                  validateItem(index, 'quantity', val);
                                }}
                              />
                              {itemErrors[index]?.quantity && <p className="text-[9px] text-rose-500 font-bold ml-1">{itemErrors[index]?.quantity}</p>}
                            </div>
                            <div className="md:col-span-3 space-y-1">
                              <label className="text-[9px] font-bold text-slate-400 uppercase ml-1 text-right block">Precio Unit. (GTQ)</label>
                              <input 
                                required
                                type="number" 
                                min="0"
                                step="any"
                                className={cn(
                                  "w-full px-4 py-2.5 bg-white dark:bg-slate-900 border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary text-sm text-right text-slate-900 dark:text-white",
                                  itemErrors[index]?.unitPrice ? "border-rose-500 ring-1 ring-rose-500" : "border-slate-200 dark:border-slate-800"
                                )}
                                aria-label="Precio unitario del item"
                                title="Precio unitario del item"
                                placeholder="Precio unitario"
                                value={item.unitPrice}
                                onChange={(e) => {
                                  const val = Number(e.target.value);
                                  const newItems = [...newQuote.items];
                                  newItems[index].unitPrice = val;
                                  setNewQuote({...newQuote, items: newItems});
                                  validateItem(index, 'unitPrice', val);
                                }}
                              />
                              {itemErrors[index]?.unitPrice && <p className="text-[9px] text-rose-500 font-bold ml-1 text-right">{itemErrors[index]?.unitPrice}</p>}
                            </div>
                            <div className="md:col-span-2 space-y-1">
                              <label className="text-[9px] font-bold text-slate-400 uppercase ml-1 text-right block">Subtotal</label>
                              <div className="w-full px-4 py-2.5 bg-slate-100 dark:bg-slate-800/50 border border-transparent rounded-xl text-sm text-right font-bold text-slate-900 dark:text-white">
                                {formatCurrency(item.quantity * item.unitPrice)}
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="flex flex-col items-end gap-1 pt-4 border-t border-slate-100 dark:border-slate-800">
                      <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest">Total Cotizado</p>
                      <p className="text-3xl font-black text-primary tracking-tight">{formatCurrency(totalQuote)}</p>
                    </div>
                  </div>
                </FormSection>
              )
            }
          ]}
        />
      </FormModal>
      <FormModal
        isOpen={isBudgetImportOpen}
        onClose={() => setIsBudgetImportOpen(false)}
        title="Importar desde Presupuesto"
        maxWidth="max-w-2xl"
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-500">Seleccione los renglones del presupuesto del proyecto para agregar a la cotización.</p>
          <div className="max-h-[400px] overflow-y-auto space-y-2 pr-2 custom-scrollbar">
            {projectBudgetItems.length === 0 ? (
              <div className="text-center py-10 bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200">
                <Database size={32} className="mx-auto text-slate-300 mb-2" />
                <p className="text-slate-500 font-medium">No hay renglones en el presupuesto de este proyecto.</p>
              </div>
            ) : (
              projectBudgetItems.map(item => (
                <button
                  key={item.id}
                  onClick={() => {
                    setNewQuote({
                      ...newQuote,
                      items: [...newQuote.items, { 
                        description: item.description, 
                        quantity: item.quantity || 1, 
                        unitPrice: item.totalUnitPrice,
                        materials: item.materials || [],
                        labor: item.labor || [],
                        indirectFactor: item.indirectFactor || 0.2,
                        materialCost: item.materialCost || 0,
                        laborCost: item.laborCost || 0
                      }]
                    });
                    setIsBudgetImportOpen(false);
                    toast.success('Item importado del presupuesto');
                  }}
                  className="w-full flex items-center justify-between p-4 bg-white border border-slate-200 rounded-xl hover:border-primary hover:shadow-md transition-all text-left group"
                >
                  <div className="flex-1">
                    <p className="font-bold text-slate-900 group-hover:text-primary transition-colors">{item.description}</p>
                    <p className="text-xs text-slate-500">{item.unit} • Cantidad: {item.quantity}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-black text-primary">{formatCurrency(item.totalUnitPrice)}</p>
                    <p className="text-[10px] text-slate-400 uppercase font-bold">Precio Unit.</p>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      </FormModal>

      <FormModal
        isOpen={isTemplateImportOpen}
        onClose={() => setIsTemplateImportOpen(false)}
        title="Importar desde Plantilla (APU)"
        maxWidth="max-w-3xl"
      >
        <div className="space-y-6">
          <p className="text-sm text-slate-500">Seleccione un análisis de precio unitario (APU) de nuestras plantillas estándar.</p>
          
          <div className="space-y-6 max-h-[500px] overflow-y-auto pr-2 custom-scrollbar">
            {Object.entries(APU_TEMPLATES).map(([category, templates]) => (
              <div key={category} className="space-y-3">
                <h3 className="text-xs font-black text-slate-400 uppercase tracking-[0.2em] border-b border-slate-100 pb-2">{category}</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {templates.map((template, idx) => {
                    const materialCost = template.materials.reduce((sum, m) => sum + (m.quantity * m.unitPrice), 0);
                    const laborCost = template.labor.reduce((sum, l) => sum + (l.dailyRate / l.yield), 0);
                    const directCost = materialCost + laborCost;
                    const totalUnitPrice = directCost * (1 + template.indirectFactor);
                    
                    return (
                      <button
                        key={idx}
                        onClick={() => {
                          setNewQuote({
                            ...newQuote,
                            items: [...newQuote.items, { 
                              description: template.description, 
                              quantity: 1, 
                              unitPrice: totalUnitPrice,
                              materials: template.materials || [],
                              labor: template.labor || [],
                              indirectFactor: template.indirectFactor || 0.2,
                              materialCost: materialCost,
                              laborCost: laborCost
                            }]
                          });
                          setIsTemplateImportOpen(false);
                          toast.success('Item importado de plantilla APU');
                        }}
                        className="flex flex-col p-4 bg-slate-50 border border-slate-200 rounded-xl hover:border-blue-500 hover:bg-white transition-all text-left group"
                      >
                        <p className="font-bold text-slate-900 group-hover:text-blue-600 transition-colors line-clamp-1">{template.description}</p>
                        <div className="flex justify-between items-end mt-2">
                          <span className="text-xs text-slate-500">{template.unit}</span>
                          <span className="font-black text-blue-600">{formatCurrency(totalUnitPrice)}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      </FormModal>

      <FormModal
        isOpen={isAPUModalOpen}
        onClose={() => setIsAPUModalOpen(false)}
        title="Análisis de Precio Unitario (APU)"
        maxWidth="max-w-4xl"
        footer={
          <div className="flex justify-end gap-3 w-full">
            <button 
              onClick={() => setIsAPUModalOpen(false)}
              className="px-6 py-2 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 transition-all"
            >
              Cerrar
            </button>
            <button 
              onClick={() => {
                const materialCost = selectedItemForAPU.materials.reduce((sum: number, m: any) => sum + (m.quantity * m.unitPrice), 0);
                const laborCost = selectedItemForAPU.labor.reduce((sum: number, l: any) => sum + (l.dailyRate / l.yield), 0);
                const directCost = materialCost + laborCost;
                const totalUnitPrice = directCost * (1 + (selectedItemForAPU.indirectFactor || 0.2));
                
                const newItems = [...newQuote.items];
                newItems[selectedItemForAPU.index] = {
                  ...selectedItemForAPU,
                  materialCost,
                  laborCost,
                  unitPrice: totalUnitPrice
                };
                setNewQuote({...newQuote, items: newItems});
                setIsAPUModalOpen(false);
                toast.success('Precio unitario actualizado según APU');
              }}
              className="px-6 py-2 bg-primary text-white font-bold rounded-xl hover:bg-primary-hover transition-all shadow-lg shadow-primary-shadow"
            >
              Aplicar a Cotización
            </button>
          </div>
        }
      >
        {selectedItemForAPU && (
          <div className="space-y-6">
            <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-2xl border border-slate-100 dark:border-slate-800">
              <h3 className="text-lg font-black text-slate-900 dark:text-white tracking-tight">{selectedItemForAPU.description}</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-bold uppercase mt-1">Desglose de Costos y Análisis</p>
            </div>

            <div className="grid grid-cols-1 gap-8">
              {/* Materials */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-primary">
                    <Package size={18} />
                    <h4 className="text-xs font-black uppercase tracking-widest">Materiales</h4>
                  </div>
                  <button 
                    onClick={() => {
                      const materials = [...(selectedItemForAPU.materials || []), { name: '', quantity: 1, unit: 'u', unitPrice: 0 }];
                      setSelectedItemForAPU({...selectedItemForAPU, materials});
                    }}
                    className="text-[10px] font-bold text-primary flex items-center gap-1 hover:underline"
                  >
                    <Plus size={12} /> Agregar Material
                  </button>
                </div>
                <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl overflow-hidden">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-100 dark:border-slate-800">
                      <tr>
                        <th className="px-4 py-2 font-black text-slate-400 uppercase">Material</th>
                        <th className="px-4 py-2 font-black text-slate-400 uppercase text-right">Cant.</th>
                        <th className="px-4 py-2 font-black text-slate-400 uppercase text-right">P. Unit</th>
                        <th className="px-4 py-2 font-black text-slate-400 uppercase text-right">Total</th>
                        <th className="px-4 py-2 font-black text-slate-400 uppercase text-center w-10"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
                      {selectedItemForAPU.materials?.map((m: any, idx: number) => (
                        <tr key={idx}>
                          <td className="px-2 py-2">
                            <input 
                              type="text"
                              value={m.name}
                              onChange={(e) => {
                                const materials = [...selectedItemForAPU.materials];
                                materials[idx].name = e.target.value;
                                setSelectedItemForAPU({...selectedItemForAPU, materials});
                              }}
                              className="w-full bg-transparent border-none focus:ring-0 font-bold text-slate-700 dark:text-slate-300"
                              placeholder="Nombre del material"
                            />
                          </td>
                          <td className="px-2 py-2 text-right">
                            <input 
                              type="number"
                              value={m.quantity}
                              aria-label="Cantidad de material"
                              title="Cantidad de material"
                              placeholder="Cantidad"
                              onChange={(e) => {
                                const materials = [...selectedItemForAPU.materials];
                                materials[idx].quantity = Number(e.target.value);
                                setSelectedItemForAPU({...selectedItemForAPU, materials});
                              }}
                              className="w-20 bg-transparent border-none focus:ring-0 text-right text-slate-500"
                            />
                          </td>
                          <td className="px-2 py-2 text-right">
                            <input 
                              type="number"
                              value={m.unitPrice}
                              aria-label="Precio unitario de material"
                              title="Precio unitario de material"
                              placeholder="Precio"
                              onChange={(e) => {
                                const materials = [...selectedItemForAPU.materials];
                                materials[idx].unitPrice = Number(e.target.value);
                                setSelectedItemForAPU({...selectedItemForAPU, materials});
                              }}
                              className="w-24 bg-transparent border-none focus:ring-0 text-right text-slate-500"
                            />
                          </td>
                          <td className="px-4 py-2 text-right font-bold text-slate-900 dark:text-white">{formatCurrency(m.quantity * m.unitPrice)}</td>
                          <td className="px-2 py-2 text-center">
                            <button 
                              onClick={() => {
                                const materials = selectedItemForAPU.materials.filter((_: any, i: number) => i !== idx);
                                setSelectedItemForAPU({...selectedItemForAPU, materials});
                              }}
                              aria-label="Eliminar material"
                              title="Eliminar material"
                              className="text-slate-300 hover:text-rose-500 transition-colors"
                            >
                              <X size={14} />
                            </button>
                          </td>
                        </tr>
                      ))}
                      {(!selectedItemForAPU.materials || selectedItemForAPU.materials.length === 0) && (
                        <tr>
                          <td colSpan={5} className="px-4 py-4 text-center text-slate-400 italic">No hay materiales registrados</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Labor */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-primary">
                    <Briefcase size={18} />
                    <h4 className="text-xs font-black uppercase tracking-widest">Mano de Obra</h4>
                  </div>
                  <button 
                    onClick={() => {
                      const labor = [...(selectedItemForAPU.labor || []), { role: '', dailyRate: 0, yield: 1 }];
                      setSelectedItemForAPU({...selectedItemForAPU, labor});
                    }}
                    className="text-[10px] font-bold text-primary flex items-center gap-1 hover:underline"
                  >
                    <Plus size={12} /> Agregar Cuadrilla
                  </button>
                </div>
                <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl overflow-hidden">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-100 dark:border-slate-800">
                      <tr>
                        <th className="px-4 py-2 font-black text-slate-400 uppercase">Cuadrilla</th>
                        <th className="px-4 py-2 font-black text-slate-400 uppercase text-right">Pago Diario</th>
                        <th className="px-4 py-2 font-black text-slate-400 uppercase text-right">Rend. (u/día)</th>
                        <th className="px-4 py-2 font-black text-slate-400 uppercase text-right">Costo Unit.</th>
                        <th className="px-4 py-2 font-black text-slate-400 uppercase text-center w-10"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
                      {selectedItemForAPU.labor?.map((l: any, idx: number) => (
                        <tr key={idx}>
                          <td className="px-2 py-2">
                            <input 
                              type="text"
                              value={l.role}
                              onChange={(e) => {
                                const labor = [...selectedItemForAPU.labor];
                                labor[idx].role = e.target.value;
                                setSelectedItemForAPU({...selectedItemForAPU, labor});
                              }}
                              className="w-full bg-transparent border-none focus:ring-0 font-bold text-slate-700 dark:text-slate-300"
                              placeholder="Ej: Albañil + Ayudante"
                            />
                          </td>
                          <td className="px-2 py-2 text-right">
                            <input 
                              type="number"
                              value={l.dailyRate}
                              aria-label="Pago diario de cuadrilla"
                              title="Pago diario de cuadrilla"
                              placeholder="Pago diario"
                              onChange={(e) => {
                                const labor = [...selectedItemForAPU.labor];
                                labor[idx].dailyRate = Number(e.target.value);
                                setSelectedItemForAPU({...selectedItemForAPU, labor});
                              }}
                              className="w-24 bg-transparent border-none focus:ring-0 text-right text-slate-500"
                            />
                          </td>
                          <td className="px-2 py-2 text-right">
                            <input 
                              type="number"
                              value={l.yield}
                              aria-label="Rendimiento de cuadrilla"
                              title="Rendimiento de cuadrilla"
                              placeholder="Rendimiento"
                              onChange={(e) => {
                                const labor = [...selectedItemForAPU.labor];
                                labor[idx].yield = Number(e.target.value);
                                setSelectedItemForAPU({...selectedItemForAPU, labor});
                              }}
                              className="w-20 bg-transparent border-none focus:ring-0 text-right text-slate-500"
                            />
                          </td>
                          <td className="px-4 py-2 text-right font-bold text-slate-900 dark:text-white">
                            {formatCurrency(l.dailyRate / (l.yield || 1))}
                          </td>
                          <td className="px-2 py-2 text-center">
                            <button 
                              onClick={() => {
                                const labor = selectedItemForAPU.labor.filter((_: any, i: number) => i !== idx);
                                setSelectedItemForAPU({...selectedItemForAPU, labor});
                              }}
                              aria-label="Eliminar cuadrilla"
                              title="Eliminar cuadrilla"
                              className="text-slate-300 hover:text-rose-500 transition-colors"
                            >
                              <X size={14} />
                            </button>
                          </td>
                        </tr>
                      ))}
                      {(!selectedItemForAPU.labor || selectedItemForAPU.labor.length === 0) && (
                        <tr>
                          <td colSpan={5} className="px-4 py-4 text-center text-slate-400 italic">No hay mano de obra registrada</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Summary */}
            <div className="bg-primary/5 dark:bg-primary/10 p-6 rounded-3xl border border-primary/10 space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="space-y-1">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Costo Materiales</p>
                  <p className="text-lg font-black text-slate-900 dark:text-white">
                    {formatCurrency(selectedItemForAPU.materials?.reduce((sum: number, m: any) => sum + (m.quantity * m.unitPrice), 0) || 0)}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Costo Mano de Obra</p>
                  <p className="text-lg font-black text-slate-900 dark:text-white">
                    {formatCurrency(selectedItemForAPU.labor?.reduce((sum: number, l: any) => sum + (l.dailyRate / (l.yield || 1)), 0) || 0)}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Factor Indirecto</p>
                  <div className="flex items-center gap-2">
                    <input 
                      type="number"
                      step="0.01"
                      aria-label="Factor indirecto"
                      title="Factor indirecto"
                      placeholder="Factor"
                      value={selectedItemForAPU.indirectFactor || 0.2}
                      onChange={(e) => setSelectedItemForAPU({...selectedItemForAPU, indirectFactor: Number(e.target.value)})}
                      className="w-16 bg-transparent border-b border-primary/20 focus:border-primary focus:ring-0 text-sm font-bold text-slate-900 dark:text-white"
                    />
                    <span className="text-xs text-slate-500">({((selectedItemForAPU.indirectFactor || 0.2) * 100).toFixed(1)}%)</span>
                  </div>
                </div>
                <div className="space-y-1 text-right">
                  <p className="text-[10px] font-black text-primary uppercase tracking-widest">Precio Unitario Sugerido</p>
                  <p className="text-2xl font-black text-primary">
                    {formatCurrency(
                      ((selectedItemForAPU.materials?.reduce((sum: number, m: any) => sum + (m.quantity * m.unitPrice), 0) || 0) + 
                       (selectedItemForAPU.labor?.reduce((sum: number, l: any) => sum + (l.dailyRate / (l.yield || 1)), 0) || 0)) * 
                      (1 + (selectedItemForAPU.indirectFactor || 0.2))
                    )}
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </FormModal>
    </div>
    </>
  );
}
