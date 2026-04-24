import React, { useEffect, useState, useMemo } from 'react';
import { storage, ref, uploadBytes, getDownloadURL, getAuth } from '../lib/authStorageClient';
import {
  listProjects,
  listProjectBudgetItemsDetailed,
  updateProject as updateProjectApi,
  updateProjectBudgetItem,
} from '../lib/projectsApi';
import { listTransactions } from '../lib/financialsApi';
import { listSubcontracts } from '../lib/subcontractsApi';
import { listEquipment } from '../lib/equipmentApi';
import { listClients } from '../lib/clientsApi';
import {
  createProjectLogbookEntry,
  createProjectPoi,
  deleteProjectLogbookEntry,
  deleteProjectPoi,
  listProjectLogbookEntries,
  listProjectPois,
  updateProjectPoi,
} from '../lib/projectDetailsApi';
import { fetchTasks, createTask, updateTask, deleteTask } from '../lib/tasksApi';
import type { Task, TaskStatus } from '../lib/tasksApi';
import { listAuditLogs } from '../lib/auditApi';
import ConfirmModal from './ConfirmModal';
import ProjectBudget from './ProjectBudget';
import ProjectMap from './ProjectMap';
import { 
  ArrowLeft, 
  Construction, 
  MapPin, 
  Calendar, 
  Calculator,
  DollarSign, 
  TrendingUp, 
  Clock,
  HandCoins,
  HardHat,
  Truck,
  Edit2,
  Save,
  X,
  Trash2,
  Download,
  FileText,
  Mail,
  Send,
  History,
  Cloud,
  Users,
  PieChart as PieChartIcon,
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  CheckSquare,
  Plus,
  Map as MapIcon,
  Layers,
  Home,
  Building2,
  Factory,
  Zap,
  HeartPulse,
  GraduationCap,
  Trophy,
  Globe,
  Palmtree,
  Milestone,
  Upload,
  Image as ImageIcon,
  ChevronDown,
  Navigation,
  Check,
  ShieldCheck,
  ShieldAlert,
  Lightbulb,
  ListTodo,
  Circle
} from 'lucide-react';
import { formatCurrency, formatDate, cn, handleApiError, OperationType, getMitigationSuggestions } from '../lib/utils';
import { MARKET_DATA } from '../constants/apuData';
import { drawReportHeader } from '../lib/pdfUtils';
import { motion, AnimatePresence } from 'motion/react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import { FormModal } from './FormModal';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { logAction, logProjectChange } from '../lib/audit';
import { toast } from 'sonner';
import { sendNotification } from '../lib/notifications';
import { MapContainer, TileLayer, Marker, Popup, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

// Fix for default marker icon in leaflet
// @ts-ignore
import icon from 'leaflet/dist/images/marker-icon.png';
// @ts-ignore
import iconShadow from 'leaflet/dist/images/marker-shadow.png';

let DefaultIcon = L.icon({
    iconUrl: icon,
    shadowUrl: iconShadow,
    iconSize: [25, 41],
    iconAnchor: [12, 41]
});

L.Marker.prototype.options.icon = DefaultIcon;

const geocodeAddress = async (address: string) => {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000); // 8s timeout

    const response = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}&limit=1`,
      { 
        signal: controller.signal,
        headers: {
          'Accept-Language': 'es',
          'User-Agent': 'WM_MS_Construction_App/1.0 (salazaroliveros@gmail.com)'
        }
      }
    );
    clearTimeout(timeoutId);

    if (!response.ok) throw new Error('Error en la respuesta del servidor de geocodificación');
    
    const data = await response.json();
    if (data && data.length > 0) {
      return {
        lat: parseFloat(data[0].lat),
        lng: parseFloat(data[0].lon)
      };
    }
    return null;
  } catch (error) {
    console.error("Geocoding error:", error);
    throw error;
  }
};

interface ProjectDetailsProps {
  projectId: string;
  onBack: () => void;
}

function MapClickHandler({ onMapClick }: { onMapClick: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      onMapClick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

export default function ProjectDetails({ projectId, onBack }: ProjectDetailsProps) {
  const auth = getAuth();
  const [project, setProject] = useState<any>(null);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [subcontracts, setSubcontracts] = useState<any[]>([]);
  const [equipment, setEquipment] = useState<any[]>([]);
  const [clients, setClients] = useState<any[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [budgetItems, setBudgetItems] = useState<any[]>([]);
  const [expandedBudgetItem, setExpandedBudgetItem] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isEmailModalOpen, setIsEmailModalOpen] = useState(false);
  const [isBudgetModalOpen, setIsBudgetModalOpen] = useState(false);
  const [isSubtaskDeleteConfirmOpen, setIsSubtaskDeleteConfirmOpen] = useState(false);
  const [subtaskToDelete, setSubtaskToDelete] = useState<{ budgetItemId: string, subtaskId: string } | null>(null);

  // Performance Optimization: Memoized Financial Summaries
  const financialSummaries = useMemo(() => {
    const income = transactions.filter(t => t.type === 'Income');
    const expenses = transactions.filter(t => t.type === 'Expense');
    
    const totalIncome = income.reduce((acc, t) => acc + (t.amount || 0), 0);
    const totalExpense = expenses.reduce((acc, t) => acc + (t.amount || 0), 0);
    
    const incomeByCategory = Object.entries(
      income.reduce((acc: any, t) => {
        acc[t.category] = (acc[t.category] || 0) + (t.amount || 0);
        return acc;
      }, {})
    ).sort((a: any, b: any) => b[1] - a[1]);

    const expenseByCategory = Object.entries(
      expenses.reduce((acc: any, t) => {
        acc[t.category] = (acc[t.category] || 0) + (t.amount || 0);
        return acc;
      }, {})
    ).sort((a: any, b: any) => b[1] - a[1]);

    return {
      totalIncome,
      totalExpense,
      netBalance: totalIncome - totalExpense,
      incomeByCategory,
      expenseByCategory
    };
  }, [transactions]);

  const budgetSummaries = useMemo(() => {
    return {
      materialCost: budgetItems.reduce((sum, item) => sum + ((item.materialCost || 0) * (item.quantity || 0)), 0),
      laborCost: budgetItems.reduce((sum, item) => sum + ((item.laborCost || 0) * (item.quantity || 0)), 0),
      indirectCost: budgetItems.reduce((sum, item) => sum + (item.indirectCost || 0) * (item.quantity || 0), 0),
      estimatedDays: Math.ceil(budgetItems.reduce((sum, item) => sum + (item.estimatedDays || 0), 0))
    };
  }, [budgetItems]);

  const budgetAudit = useMemo(() => {
    return budgetItems.map(item => {
      const itemTransactions = transactions.filter(t => t.budgetItemId === item.id && t.type === 'Expense');
      const actualCost = itemTransactions.reduce((acc, t) => acc + (t.amount || 0), 0);
      const budgetedCost = (item.totalUnitPrice || (item.materialCost + item.laborCost + item.indirectCost)) * (item.quantity || 0);
      const deviation = budgetedCost > 0 ? ((actualCost - budgetedCost) / budgetedCost) * 100 : 0;
      
      return {
        ...item,
        actualCost,
        budgetedCost,
        deviation,
        suggestions: deviation > 15 ? getMitigationSuggestions(deviation) : []
      };
    }).sort((a, b) => b.deviation - a.deviation);
  }, [budgetItems, transactions]);

  const marketValidation = useMemo(() => {
    if (!project || !project.typology || !project.area) return null;
    const marketInfo = MARKET_DATA[project.typology as keyof typeof MARKET_DATA];
    if (!marketInfo) return null;

    const totalBudget = budgetItems.reduce((sum, item) => sum + ((item.totalUnitPrice || (item.materialCost + item.laborCost + item.indirectCost)) * (item.quantity || 0)), 0);
    const currentCostPerM2 = totalBudget / project.area;
    const deviation = ((currentCostPerM2 - marketInfo.pricePerM2) / marketInfo.pricePerM2) * 100;
    
    return {
      marketPrice: marketInfo.pricePerM2,
      currentPrice: currentCostPerM2,
      deviation,
      status: Math.abs(deviation) < 15 ? 'success' : Math.abs(deviation) < 30 ? 'warning' : 'error'
    };
  }, [project, budgetItems]);

  const [activeTab, setActiveTab] = useState<'overview' | 'budget' | 'financials' | 'audit' | 'map' | 'risk' | 'logbook' | 'tasks'>('overview');
  const [projectTasks, setProjectTasks] = useState<Task[]>([]);
  const [taskForm, setTaskForm] = useState({ title: '', priority: 'medium' as Task['priority'], dueDate: '', assigneeName: '' });
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [savingTask, setSavingTask] = useState(false);
  const [logbookEntries, setLogbookEntries] = useState<any[]>([]);
  const [isLogbookModalOpen, setIsLogbookModalOpen] = useState(false);
  const [newLogEntry, setNewLogEntry] = useState({
    date: new Date().toISOString().split('T')[0],
    content: '',
    weather: 'Soleado',
    workersCount: 0,
    photos: [] as string[]
  });
  const [emailTo, setEmailTo] = useState('');
  const [editForm, setEditForm] = useState<any>(null);
  const [isSubtaskModalOpen, setIsSubtaskModalOpen] = useState(false);
  const [selectedBudgetItem, setSelectedBudgetItem] = useState<any>(null);
  const [newSubtask, setNewSubtask] = useState({ name: '', status: 'Pending', responsible: '', progress: 0 });
  const [isPoiModalOpen, setIsPoiModalOpen] = useState(false);
  const [newPoiData, setNewPoiData] = useState({ lat: 0, lng: 0, name: '', comment: '' });
  const [mapCenter, setMapCenter] = useState<[number, number]>([18.4861, -69.9312]); // Default to Santo Domingo
  const [pois, setPois] = useState<any[]>([]);
  const [editingPoiIndex, setEditingPoiIndex] = useState<number | null>(null);
  const [mapType, setMapType] = useState<'standard' | 'satellite'>('standard');
  const [isMapOpen, setIsMapOpen] = useState(false);
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [projectForMap, setProjectForMap] = useState<any>(null);

  useEffect(() => {
    let isMounted = true;

    const loadData = async () => {
      try {
        const [projects, clientsData, transactionsData, subcontractsData, equipmentData, budgetData, poisData, logbookData, auditData] = await Promise.all([
          listProjects(),
          listClients(),
          listTransactions({ projectId, limit: 1000, offset: 0 }),
          listSubcontracts({ projectId }),
          listEquipment(),
          listProjectBudgetItemsDetailed(projectId),
          listProjectPois(projectId),
          listProjectLogbookEntries(projectId),
          listAuditLogs({ projectId, limit: 200, offset: 0 }),
        ]);

        if (!isMounted) {
          return;
        }

        const selectedProject = projects.find((item) => item.id === projectId) || null;
        setProject(selectedProject);
        if (!isEditing && selectedProject) {
          setEditForm(selectedProject);
        }

        setClients(clientsData);
        setTransactions(transactionsData.items);
        setSubcontracts(subcontractsData);
        setEquipment(equipmentData.filter((item) => item.projectId === projectId));
        setAuditLogs(auditData.items);
        setBudgetItems(budgetData);
        setPois(poisData);
        setLogbookEntries(logbookData);

        if (selectedProject?.coordinates) {
          setMapCenter([selectedProject.coordinates.lat, selectedProject.coordinates.lng]);
        }

        const tasksRes = await fetchTasks({ projectId }).catch(() => ({ items: [] }));
        if (isMounted) setProjectTasks(tasksRes.items);
      } catch (error) {
        console.error('Error loading project details:', error);
        toast.error('No se pudieron cargar todos los detalles del proyecto');
      }
    };

    loadData();

    return () => {
      isMounted = false;
    };
  }, [projectId, isEditing]);

  const calculateProjectProgress = (items: any[]) => {
    const totalBudget = items.reduce(
      (acc, item) => acc + ((item.materialCost + item.laborCost + item.indirectCost) * (item.quantity || 1)),
      0
    );
    return totalBudget > 0
      ? items.reduce(
          (acc, item) =>
            acc + ((item.progress || 0) * ((item.materialCost + item.laborCost + item.indirectCost) * (item.quantity || 1))),
          0
        ) / totalBudget
      : 0;
  };

  const persistProjectProgress = async (items: any[]) => {
    if (!project) {
      return;
    }

    const overallProgress = calculateProjectProgress(items);

    await updateProjectApi(projectId, {
      name: project.name,
      location: project.location || '',
      projectManager: project.projectManager || '',
      status: project.status || 'Planning',
      budget: Number(project.budget || 0),
      spent: Number(project.spent || 0),
      physicalProgress: Number(overallProgress),
      financialProgress: Number(project.financialProgress || 0),
      area: Number(project.area || 0),
      startDate: project.startDate || '',
      endDate: project.endDate || '',
      clientUid: project.clientUid || '',
      typology: project.typology || 'RESIDENCIAL',
      latitude: project.coordinates?.lat ? String(project.coordinates.lat) : project.latitude,
      longitude: project.coordinates?.lng ? String(project.coordinates.lng) : project.longitude,
    });

    setProject((prev: any) => (prev ? { ...prev, physicalProgress: Number(overallProgress) } : prev));

    await logAction(
      'Actualización de Avance Físico',
      'Proyectos',
      `Avance físico del proyecto "${project.name}" actualizado a ${(overallProgress * 100).toFixed(1)}%`,
      'update',
      { projectId, physicalProgress: overallProgress }
    );
  };

  useEffect(() => {
    if (project) {
      const financialProgress = project.budget > 0 ? (financialSummaries.totalExpense / project.budget) * 100 : 0;
      const progressDeviation = financialProgress - (project.physicalProgress || 0);
      if (progressDeviation > 15) {
        const notificationSentKey = `deviation_notified_${project.id}`;
        if (!sessionStorage.getItem(notificationSentKey)) {
          sendNotification(
            'Alerta de Desviación de Proyecto',
            `El proyecto "${project.name}" presenta una desviación del ${progressDeviation.toFixed(1)}% entre avance físico y financiero.`,
            'project'
          );
          toast.error(`Alerta: Desviación Crítica en ${project.name}`, {
            description: `El avance financiero supera al físico por ${progressDeviation.toFixed(1)}%.`,
            duration: 10000,
          });
          sessionStorage.setItem(notificationSentKey, 'true');
        }
      }
    }
  }, [project?.id, project?.spent, project?.physicalProgress]);

  const generateReport = () => {
    const doc = new jsPDF() as any;
    const headerBottom = drawReportHeader(doc, 'INFORME DETALLADO DE OBRA', {
      subtitle: project.name,
      dateText: `Fecha de Reporte: ${new Date().toLocaleDateString()}`,
      x: 20,
      y: 10,
    });

    // Project Summary
    doc.setTextColor(30, 41, 59);
    doc.setFontSize(16);
    doc.text(project.name, 20, headerBottom + 8);
    doc.setFontSize(10);
    doc.text(`Ubicación: ${project.location}`, 20, headerBottom + 15);
    doc.text(`Estado: ${project.status}`, 20, headerBottom + 20);
    doc.text(`Fecha de Reporte: ${new Date().toLocaleDateString()}`, 20, headerBottom + 25);

    // Financial Overview
    doc.setFontSize(12);
    doc.text('Resumen Financiero', 20, headerBottom + 38);
    autoTable(doc, {
      startY: headerBottom + 43,
      head: [['Concepto', 'Monto']],
      body: [
        ['Presupuesto Total', formatCurrency(project.budget)],
        ['Total Ejecutado', formatCurrency(project.spent)],
        ['Saldo Disponible', formatCurrency(project.budget - project.spent)],
        ['Avance Físico', `${(project.physicalProgress || 0).toFixed(1)}%`],
        ['Avance Financiero', `${((project.spent / project.budget) * 100).toFixed(1)}%`]
      ],
      theme: 'striped',
      headStyles: { fillColor: [37, 99, 235] }
    });

    // Recent Transactions
    if (transactions.length > 0) {
      doc.addPage();
      doc.setFontSize(14);
      doc.text('Desglose de Transacciones Recientes', 20, 20);
      autoTable(doc, {
        startY: 25,
        head: [['Fecha', 'Descripción', 'Categoría', 'Tipo', 'Monto']],
        body: transactions.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 20).map(t => [
          formatDate(t.date),
          t.description || 'Sin descripción',
          t.category,
          t.type === 'Income' ? 'Ingreso' : 'Gasto',
          formatCurrency(t.amount)
        ]),
        headStyles: { fillColor: [71, 85, 105] }
      });
    }

    // Subcontracts
    if (subcontracts.length > 0) {
      doc.setFontSize(14);
      doc.text('Estado de Subcontratos', 20, (doc as any).lastAutoTable.finalY + 15);
      autoTable(doc, {
        startY: (doc as any).lastAutoTable.finalY + 20,
        head: [['Subcontratista', 'Servicio', 'Renglón', 'Monto Total', 'Pagado', 'Pendiente']],
        body: subcontracts.map(s => [
          s.contractor,
          s.service,
          s.budgetItemName || 'N/A',
          formatCurrency(s.total || 0),
          formatCurrency(s.paid || 0),
          formatCurrency((s.total || 0) - (s.paid || 0))
        ]),
        headStyles: { fillColor: [14, 165, 233] }
      });
    }

    // Equipment
    if (equipment.length > 0) {
      doc.setFontSize(14);
      doc.text('Equipo Asignado', 20, (doc as any).lastAutoTable.finalY + 15);
      autoTable(doc, {
        startY: (doc as any).lastAutoTable.finalY + 20,
        head: [['Equipo', 'Tipo', 'Estado', 'Costo Diario']],
        body: equipment.map(e => [
          e.name,
          e.type,
          e.status === 'Active' ? 'Activo' : 'Mantenimiento',
          formatCurrency(e.dailyCost)
        ]),
        headStyles: { fillColor: [16, 185, 129] }
      });
    }

    // Subtasks
    const allSubtasks = budgetItems.flatMap(item => (item.subtasks || []).map((st: any) => ({ ...st, itemDescription: item.description })));
    if (allSubtasks.length > 0) {
      doc.addPage();
      doc.setFontSize(14);
      doc.text('Estado de Subtareas y Avance', 20, 20);
      autoTable(doc, {
        startY: 25,
        head: [['Renglón', 'Subtarea', 'Responsable', 'Estado', 'Progreso']],
        body: allSubtasks.map(st => [
          st.itemDescription,
          st.name,
          st.responsible,
          st.status === 'Pending' ? 'Pendiente' : st.status === 'In Progress' ? 'En Proceso' : 'Completado',
          `${(st.progress || 0).toFixed(1)}%`
        ]),
        headStyles: { fillColor: [100, 116, 139] }
      });
    }

    doc.save(`Informe_Detallado_${project.name.replace(/\s+/g, '_')}.pdf`);
    return doc;
  };

  const generateBudgetPDF = () => {
    const doc = new jsPDF() as any;
    const headerBottom = drawReportHeader(doc, 'PRESUPUESTO DETALLADO DE OBRA', {
      subtitle: project.name,
      dateText: `Fecha de Reporte: ${new Date().toLocaleDateString()}`,
      x: 20,
      y: 10,
    });

    // Project Info
    doc.setTextColor(30, 41, 59);
    doc.setFontSize(16);
    doc.text(project.name, 20, headerBottom + 8);
    doc.setFontSize(10);
    doc.text(`Ubicación: ${project.location || 'N/A'}`, 20, headerBottom + 15);
    doc.text(`Fecha de Reporte: ${new Date().toLocaleDateString()}`, 20, headerBottom + 20);

    const client = clients.find(c => c.id === project.clientId);
    if (client) {
      doc.text(`Cliente: ${client.name}`, 20, headerBottom + 25);
    }

    let currentY = headerBottom + 38;

    budgetItems.forEach((item, index) => {
      if (currentY > 240) {
        doc.addPage();
        currentY = 20;
      }

      doc.setFontSize(12);
      doc.setTextColor(37, 99, 235);
      doc.text(`${index + 1}. ${item.description} (${item.quantity} ${item.unit})`, 20, currentY);
      currentY += 7;

      // Materials Table
      const materialRows = (item.materials || []).map((m: any) => [
        m.name,
        m.quantity,
        m.unit,
        formatCurrency(m.unitPrice),
        formatCurrency(m.quantity * m.unitPrice)
      ]);

      if (materialRows.length > 0) {
        autoTable(doc, {
          startY: currentY,
          head: [['Material', 'Cant.', 'Unidad', 'P. Unitario', 'Subtotal']],
          body: materialRows,
          theme: 'striped',
          headStyles: { fillColor: [71, 85, 105] },
          margin: { left: 25, right: 20 },
          styles: { fontSize: 8 }
        });
        currentY = (doc as any).lastAutoTable.finalY + 5;
      }

      // Labor Table
      const laborRows = (item.labor || []).map((l: any) => [
        l.name,
        l.quantity,
        l.unit,
        formatCurrency(l.unitPrice),
        formatCurrency(l.quantity * l.unitPrice)
      ]);

      if (laborRows.length > 0) {
        autoTable(doc, {
          startY: currentY,
          head: [['Mano de Obra', 'Cant.', 'Unidad', 'P. Unitario', 'Subtotal']],
          body: laborRows,
          theme: 'striped',
          headStyles: { fillColor: [148, 163, 184] },
          margin: { left: 25, right: 20 },
          styles: { fontSize: 8 }
        });
        currentY = (doc as any).lastAutoTable.finalY + 5;
      }

      // Item Summary
      doc.setFontSize(9);
      doc.setTextColor(51, 65, 85);
      const itemTotal = (item.totalItemPrice || 0);
      doc.text(`Total Renglón: ${formatCurrency(itemTotal)}`, 190, currentY, { align: 'right' });
      currentY += 12;
    });

    // Grand Total
    if (currentY > 230) {
      doc.addPage();
      currentY = 20;
    }

    const totalBudget = budgetItems.reduce((sum, item) => sum + (item.totalItemPrice || 0), 0);
    const totalMaterials = budgetItems.reduce((sum, item) => sum + ((item.materialCost || 0) * (item.quantity || 0)), 0);
    const totalLabor = budgetItems.reduce((sum, item) => sum + ((item.laborCost || 0) * (item.quantity || 0)), 0);
    const totalIndirect = budgetItems.reduce((sum, item) => sum + ((item.indirectCost || 0) * (item.quantity || 0)), 0);

    doc.setDrawColor(200, 200, 200);
    doc.line(20, currentY, 190, currentY);
    currentY += 10;

    doc.setFontSize(12);
    doc.text('RESUMEN GENERAL DEL PRESUPUESTO', 20, currentY);
    currentY += 10;

    doc.setFontSize(10);
    doc.text(`Total Materiales: ${formatCurrency(totalMaterials)}`, 20, currentY);
    currentY += 7;
    doc.text(`Total Mano de Obra: ${formatCurrency(totalLabor)}`, 20, currentY);
    currentY += 7;
    doc.text(`Total Costos Indirectos: ${formatCurrency(totalIndirect)}`, 20, currentY);
    currentY += 12;

    doc.setFontSize(14);
    doc.setTextColor(37, 99, 235);
    doc.text(`TOTAL GENERAL: ${formatCurrency(totalBudget)}`, 20, currentY);

    doc.save(`Presupuesto_${project.name.replace(/\s+/g, '_')}.pdf`);
  };

  const handleAddSubtask = async () => {
    if (!newSubtask.name || !newSubtask.responsible) {
      toast.error('Por favor complete el nombre y responsable de la subtarea');
      return;
    }

    try {
      const updatedSubtasks = [...(selectedBudgetItem.subtasks || []), { ...newSubtask, id: Date.now().toString() }];
      
      // Recalculate item progress
      const totalSubtasks = updatedSubtasks.length;
      const itemProgress = totalSubtasks > 0 
        ? updatedSubtasks.reduce((acc: number, s: any) => acc + (s.progress || 0), 0) / totalSubtasks
        : 0;

      await updateProjectBudgetItem(projectId, selectedBudgetItem.id, {
        subtasks: updatedSubtasks,
        progress: itemProgress
      });

      await logAction(
        'Adición de Subtarea',
        'Proyectos',
        `Subtarea "${newSubtask.name}" añadida al item "${selectedBudgetItem.description}" del proyecto "${project.name}"`,
        'create',
        { projectId, budgetItemId: selectedBudgetItem.id, subtaskName: newSubtask.name }
      );

      // Recalculate project physical progress
      const updatedBudgetItems = budgetItems.map(i => 
        i.id === selectedBudgetItem.id ? { ...i, subtasks: updatedSubtasks, progress: itemProgress } : i
      );
      
      setBudgetItems(updatedBudgetItems);
      setSelectedBudgetItem((prev: any) => (prev ? { ...prev, subtasks: updatedSubtasks, progress: itemProgress } : prev));
      await persistProjectProgress(updatedBudgetItems);

      setIsSubtaskModalOpen(false);
      setNewSubtask({ name: '', status: 'Pending', responsible: '', progress: 0 });
      toast.success('Subtarea añadida con éxito');
    } catch (error) {
      handleApiError(error, OperationType.WRITE, `projects/${projectId}/budgetItems/${selectedBudgetItem.id}`);
    }
  };

  const handleUpdateSubtask = async (budgetItemId: string, subtaskId: string, updates: any) => {
    const item = budgetItems.find(i => i.id === budgetItemId);
    if (!item) return;

    const updatedSubtasks = item.subtasks.map((s: any) => 
      s.id === subtaskId ? { ...s, ...updates } : s
    );

    // Recalculate item progress
    const totalSubtasks = updatedSubtasks.length;
    const itemProgress = totalSubtasks > 0 
      ? updatedSubtasks.reduce((acc: number, s: any) => acc + (s.progress || 0), 0) / totalSubtasks
      : 0;

    try {
      await updateProjectBudgetItem(projectId, budgetItemId, {
        subtasks: updatedSubtasks,
        progress: itemProgress
      });

      await logAction(
        'Actualización de Subtarea',
        'Proyectos',
        `Subtarea en item "${item.description}" del proyecto "${project.name}" actualizada`,
        'update',
        { projectId, budgetItemId, subtaskId, updates }
      );

      // Recalculate project physical progress
      const updatedBudgetItems = budgetItems.map(i => 
        i.id === budgetItemId ? { ...i, subtasks: updatedSubtasks, progress: itemProgress } : i
      );
      
      setBudgetItems(updatedBudgetItems);
      await persistProjectProgress(updatedBudgetItems);
    } catch (error) {
      console.error('Error updating subtask:', error);
      toast.error('No se pudo actualizar la subtarea');
    }
  };

  const handleDeleteSubtask = (budgetItemId: string, subtaskId: string) => {
    setSubtaskToDelete({ budgetItemId, subtaskId });
    setIsSubtaskDeleteConfirmOpen(true);
  };

  const handleConfirmDeleteSubtask = async () => {
    if (!subtaskToDelete) return;
    const { budgetItemId, subtaskId } = subtaskToDelete;
    
    const item = budgetItems.find(i => i.id === budgetItemId);
    if (!item) return;

    const updatedSubtasks = item.subtasks.filter((s: any) => s.id !== subtaskId);

    // Recalculate item progress
    const totalSubtasks = updatedSubtasks.length;
    const itemProgress = totalSubtasks > 0 
      ? updatedSubtasks.reduce((acc: number, s: any) => acc + (s.progress || 0), 0) / totalSubtasks
      : 0;

    try {
      await updateProjectBudgetItem(projectId, budgetItemId, {
        subtasks: updatedSubtasks,
        progress: itemProgress
      });

      await logAction(
        'Eliminación de Subtarea',
        'Proyectos',
        `Subtarea eliminada del item "${item.description}" del proyecto "${project.name}"`,
        'delete',
        { projectId, budgetItemId, subtaskId }
      );

      // Recalculate project physical progress
      const updatedBudgetItems = budgetItems.map(i => 
        i.id === budgetItemId ? { ...i, subtasks: updatedSubtasks, progress: itemProgress } : i
      );
      
      setBudgetItems(updatedBudgetItems);
      await persistProjectProgress(updatedBudgetItems);

      toast.success('Subtarea eliminada');
    } catch (error) {
      console.error('Error deleting subtask:', error);
      toast.error('No se pudo eliminar la subtarea');
    } finally {
      setIsSubtaskDeleteConfirmOpen(false);
      setSubtaskToDelete(null);
    }
  };

  const handleSavePoi = async () => {
    if (!newPoiData.name) {
      toast.error('Por favor ingresa un nombre para el punto');
      return;
    }

    try {
      if (editingPoiIndex !== null) {
        const poi = pois[editingPoiIndex];
        const updatedPoi = await updateProjectPoi(projectId, poi.id, {
          name: newPoiData.name,
          comment: newPoiData.comment,
          lat: newPoiData.lat,
          lng: newPoiData.lng,
        });
        setPois((prev) => prev.map((item, idx) => (idx === editingPoiIndex ? updatedPoi : item)));
      } else {
        const createdPoi = await createProjectPoi(projectId, {
          name: newPoiData.name,
          comment: newPoiData.comment,
          lat: newPoiData.lat,
          lng: newPoiData.lng,
        });
        setPois((prev) => [...prev, createdPoi]);
      }
      
      await logAction(
        editingPoiIndex !== null ? 'Edición de Punto de Interés' : 'Adición de Punto de Interés',
        'Proyectos',
        `${editingPoiIndex !== null ? 'Punto actualizado' : 'Nuevo punto'} "${newPoiData.name}" en el mapa del proyecto "${project.name}"`,
        editingPoiIndex !== null ? 'update' : 'create',
        { projectId, poiName: newPoiData.name }
      );
      
      toast.success(editingPoiIndex !== null ? 'Punto de interés actualizado' : 'Punto de interés añadido');
      setIsPoiModalOpen(false);
      setEditingPoiIndex(null);
      setNewPoiData({ lat: 0, lng: 0, name: '', comment: '' });
    } catch (error) {
      console.error('Error saving point of interest:', error);
      toast.error('No se pudo guardar el punto de interés');
    }
  };

  const handleAddPoi = (lat: number, lng: number) => {
    setEditingPoiIndex(null);
    setNewPoiData({ lat, lng, name: '', comment: '' });
    setIsPoiModalOpen(true);
  };

  const handleEditPoi = (index: number) => {
    const poi = pois[index];
    setEditingPoiIndex(index);
    setNewPoiData({ lat: poi.lat, lng: poi.lng, name: poi.name, comment: poi.comment });
    setIsPoiModalOpen(true);
  };

  const handleDeletePoi = async (index: number) => {
    const poiToDelete = pois[index];
    try {
      if (!poiToDelete?.id) {
        toast.error('No se encontró el punto de interés');
        return;
      }
      await deleteProjectPoi(projectId, poiToDelete.id);
      setPois((prev) => prev.filter((_, i) => i !== index));
      await logAction(
        'Eliminación de Punto de Interés',
        'Proyectos',
        `Punto de interés "${poiToDelete?.name}" eliminado del proyecto "${project.name}"`,
        'delete',
        { projectId, poiName: poiToDelete?.name }
      );
      toast.success('Punto de interés eliminado');
    } catch (error) {
      console.error('Error deleting point of interest:', error);
      toast.error('No se pudo eliminar el punto de interés');
    }
  };

  const handleAddLogEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newLogEntry.content.trim()) {
      toast.error('El contenido de la bitácora es obligatorio');
      return;
    }

    try {
      const createdEntry = await createProjectLogbookEntry(projectId, {
        date: newLogEntry.date,
        content: newLogEntry.content,
        weather: newLogEntry.weather,
        workersCount: newLogEntry.workersCount,
        photos: newLogEntry.photos,
        authorEmail: auth.currentUser?.email || 'salazaroliveros@gmail.com'
      });
      setLogbookEntries((prev) => [createdEntry, ...prev]);
      await logAction(
        'Registro en Bitácora',
        'Proyectos',
        `Nueva entrada de bitácora añadida al proyecto "${project.name}"`,
        'create',
        { projectId, logEntryId: createdEntry.id }
      );
      toast.success('Entrada de bitácora añadida');
      setIsLogbookModalOpen(false);
      setNewLogEntry({
        date: new Date().toISOString().split('T')[0],
        content: '',
        weather: 'Soleado',
        workersCount: 0,
        photos: []
      });
    } catch (error) {
      console.error('Error creating logbook entry:', error);
      toast.error('No se pudo guardar la entrada de bitácora');
    }
  };

  const handleDeleteLogEntry = async (entryId: string) => {
    try {
      await deleteProjectLogbookEntry(projectId, entryId);
      setLogbookEntries((prev) => prev.filter((entry) => entry.id !== entryId));
      await logAction(
        'Eliminación de Bitácora',
        'Proyectos',
        `Entrada de bitácora eliminada del proyecto "${project.name}"`,
        'delete',
        { projectId, logEntryId: entryId }
      );
      toast.success('Entrada de bitácora eliminada');
    } catch (error) {
      console.error('Error deleting logbook entry:', error);
      toast.error('No se pudo eliminar la entrada de bitácora');
    }
  };

  const handleLogbookPhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    const toastId = toast.loading('Subiendo foto...');

    try {
      const fileRef = ref(storage, `projects/${projectId}/logbook/${Date.now()}_${file.name}`);
      await uploadBytes(fileRef, file);
      const url = await getDownloadURL(fileRef);

      setNewLogEntry(prev => ({
        ...prev,
        photos: [...prev.photos, url]
      }));

      toast.success('Foto subida con éxito', { id: toastId });
    } catch (error) {
      console.error('Error uploading photo:', error);
      toast.error('Error al subir la foto', { id: toastId });
    } finally {
      setIsUploading(false);
    }
  };
  const handleSendEmail = () => {
    const client = clients.find(c => c.id === project.clientUid);
    setEmailTo(client?.email || '');
    setIsEmailModalOpen(true);
  };

  const confirmSendEmail = () => {
    alert(`Informe enviado con éxito a ${emailTo}`);
    setIsEmailModalOpen(false);
  };

  const handleEmailReport = async () => {
    if (!project || !project.clientUid) {
      toast.error('No hay un cliente asignado a este proyecto');
      return;
    }

    const client = clients.find(c => c.id === project.clientUid);
    if (!client || !client.email) {
      toast.error('El cliente no tiene un correo electrónico registrado');
      return;
    }

    const subject = encodeURIComponent(`Reporte de Proyecto: ${project.name}`);
    const body = encodeURIComponent(
      `Estimado/a ${client.name},\n\n` +
      `Adjunto encontrará el reporte actualizado del proyecto "${project.name}".\n\n` +
      `Resumen del Proyecto:\n` +
      `- Estado: ${project.status}\n` +
      `- Avance Físico: ${project.physicalProgress?.toFixed(1)}%\n` +
      `- Avance Financiero: ${((project.spent / (project.budget || 1)) * 100).toFixed(1)}%\n` +
      `- Saldo Actual: ${formatCurrency(project.balance)}\n\n` +
      `Para ver más detalles, por favor acceda a la plataforma.\n\n` +
      `Atentamente,\n` +
      `Equipo de Gestión de Proyectos`
    );

    window.location.href = `mailto:${client.email}?subject=${subject}&body=${body}`;
    toast.success('Preparando correo electrónico...');
  };

  const handleUpdateProject = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!editForm.name || !editForm.location || !editForm.projectManager || Number(editForm.budget) < 0) {
      toast.error('Por favor complete todos los campos obligatorios correctamente. El presupuesto no puede ser negativo.');
      return;
    }
    if (!editForm.startDate || !editForm.endDate) {
      toast.error('Por favor ingrese las fechas de inicio y fin del proyecto');
      return;
    }
    
    const start = new Date(editForm.startDate);
    const end = new Date(editForm.endDate);
    if (end <= start) {
      toast.error('La fecha de fin debe ser posterior a la fecha de inicio');
      return;
    }

    if (Number(editForm.budget) < Number(editForm.spent)) {
      toast.error('El presupuesto total no puede ser menor al monto ya ejecutado');
      return;
    }

    if (Number(editForm.physicalProgress) < 0 || Number(editForm.physicalProgress) > 100) {
      toast.error('El avance físico debe estar entre 0 y 100');
      return;
    }

    // Financial progress validation (calculated)
    const financialProgress = Number(editForm.budget) > 0 ? (Number(editForm.spent) / Number(editForm.budget)) * 100 : 0;
    if (financialProgress < 0 || financialProgress > 100) {
      toast.error('El avance financiero debe estar entre 0 y 100');
      return;
    }

    const fieldsToLog = [
      { key: 'name', label: 'Nombre' },
      { key: 'location', label: 'Ubicación' },
      { key: 'projectManager', label: 'Director de Proyecto' },
      { key: 'budget', label: 'Presupuesto' },
      { key: 'status', label: 'Estado' },
      { key: 'physicalProgress', label: 'Avance Físico' },
      { key: 'startDate', label: 'Fecha Inicio' },
      { key: 'endDate', label: 'Fecha Fin' },
      { key: 'area', label: 'Área (m2)' },
      { key: 'typology', label: 'Tipología' }
    ];

    const user = auth.currentUser;
    const userId = user?.uid || 'system';
    const userEmail = user?.email || 'salazaroliveros@gmail.com';

    try {
      // Geocode if location changed
      let coordinates = project.coordinates;
      if (project.location !== editForm.location) {
        const newCoords = await geocodeAddress(editForm.location);
        if (newCoords) {
          coordinates = newCoords;
        }
      }

      // Log changes
      for (const field of fieldsToLog) {
        if (project[field.key] !== editForm[field.key]) {
          await logProjectChange(
            projectId,
            project.name,
            field.label,
            project[field.key],
            editForm[field.key],
            userId,
            userEmail
          );
        }
      }

      const updatedProject = await updateProjectApi(projectId, {
        name: editForm.name,
        location: editForm.location,
        projectManager: editForm.projectManager,
        status: editForm.status,
        budget: Number(editForm.budget),
        spent: Number(editForm.spent),
        physicalProgress: Number(editForm.physicalProgress),
        financialProgress,
        area: Number(editForm.area),
        startDate: editForm.startDate,
        endDate: editForm.endDate,
        clientUid: editForm.clientUid || '',
        typology: editForm.typology || 'RESIDENCIAL',
        latitude: coordinates?.lat ? String(coordinates.lat) : undefined,
        longitude: coordinates?.lng ? String(coordinates.lng) : undefined,
      });
      setProject(updatedProject);
      setEditForm(updatedProject);
      if (updatedProject.coordinates) {
        setMapCenter([updatedProject.coordinates.lat, updatedProject.coordinates.lng]);
      }
      setIsEditing(false);
      toast.success('Obra actualizada con éxito');
    } catch (error) {
      console.error('Error updating project:', error);
      toast.error('No se pudo actualizar el proyecto');
    }
  };

  const getTypologyTheme = (typology: string) => {
    switch (typology?.toUpperCase()) {
      case 'RESIDENCIAL': return 'theme-residencial';
      case 'COMERCIAL': return 'theme-comercial';
      case 'INDUSTRIAL': return 'theme-industrial';
      case 'CIVIL': return 'theme-civil';
      case 'PUBLICA': return 'theme-publica';
      default: return 'theme-comercial';
    }
  };

  const getTypologyIcon = (typology: string) => {
    switch (typology?.toUpperCase()) {
      case 'RESIDENCIAL': return Home;
      case 'COMERCIAL': return Building2;
      case 'INDUSTRIAL': return Factory;
      case 'CIVIL': return Milestone;
      case 'PUBLICA': return Building2;
      case 'SALUD': return HeartPulse;
      case 'EDUCACION': return GraduationCap;
      case 'DEPORTIVA': return Trophy;
      case 'INFRAESTRUCTURA': return Zap;
      case 'TURISMO': return Palmtree;
      default: return Construction;
    }
  };

  const getTypologyColor = (typology: string) => {
    switch (typology?.toUpperCase()) {
      case 'RESIDENCIAL': return 'bg-blue-50 text-blue-600 border-blue-100';
      case 'COMERCIAL': return 'bg-indigo-50 text-indigo-600 border-indigo-100';
      case 'INDUSTRIAL': return 'bg-amber-50 text-amber-600 border-amber-100';
      case 'CIVIL': return 'bg-slate-50 text-slate-600 border-slate-100';
      case 'PUBLICA': return 'bg-purple-50 text-purple-600 border-purple-100';
      case 'SALUD': return 'bg-rose-50 text-rose-600 border-rose-100';
      case 'EDUCACION': return 'bg-emerald-50 text-emerald-600 border-emerald-100';
      case 'DEPORTIVA': return 'bg-orange-50 text-orange-600 border-orange-100';
      case 'INFRAESTRUCTURA': return 'bg-slate-50 text-slate-600 border-slate-100';
      case 'TURISMO': return 'bg-cyan-50 text-cyan-600 border-cyan-100';
      default: return 'bg-slate-50 text-slate-600 border-slate-100';
    }
  };

  const handleRiskAnalysis = () => {
    const event = new CustomEvent('AI_COMMAND', { 
      detail: { 
        command: 'Análisis de Riesgos Profundo',
        params: { projectId, projectName: project.name }
      } 
    });
    window.dispatchEvent(event);
    setActiveTab('risk');
  };

  const handleExecutiveReport = () => {
    const event = new CustomEvent('AI_COMMAND', { 
      detail: { 
        command: 'GENERATE_EXECUTIVE_REPORT',
        params: { projectId, projectName: project.name }
      } 
    });
    window.dispatchEvent(event);
  };

  if (!project) return <div className="p-8 text-center text-slate-500">Cargando detalles del proyecto...</div>;

  return (
    <div className={cn(
      "min-h-screen bg-slate-50 dark:bg-slate-950 pb-20 animate-in fade-in slide-in-from-bottom-4 duration-700 projects-module-contrast",
      getTypologyTheme(project.typology)
    )}>
      {/* Header */}
      <header className="sticky top-0 z-30 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 px-4 py-4 sm:px-6">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <button 
              onClick={onBack}
              className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors text-slate-600 dark:text-slate-400"
            >
              <ArrowLeft size={20} />
            </button>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Construction className="text-primary" size={20} />
                <h1 className="text-xl font-bold text-slate-900 dark:text-white truncate max-w-[200px] sm:max-w-md">
                  {project?.name || 'Cargando...'}
                </h1>
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                <MapPin size={14} />
                <span>{project?.location}</span>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={handleRiskAnalysis}
              className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 bg-amber-100 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 font-bold rounded-xl hover:bg-amber-200 dark:hover:bg-amber-500/20 transition-all border border-amber-200 dark:border-amber-500/20"
            >
              <AlertTriangle size={18} />
              <span className="hidden sm:inline">Análisis de Riesgos AI</span>
              <span className="sm:hidden">Riesgos AI</span>
            </button>
            <button
              onClick={handleExecutiveReport}
              className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 bg-primary-light dark:bg-primary/10 text-primary font-bold rounded-xl hover:bg-primary-light/80 dark:hover:bg-primary/20 transition-all border border-primary-light dark:border-primary/20"
            >
              <FileText size={18} />
              <span className="hidden sm:inline">Informe Ejecutivo AI</span>
              <span className="sm:hidden">Informe AI</span>
            </button>
            {isEditing ? (
              <div className="flex items-center gap-2">
                <button 
                  onClick={handleUpdateProject}
                  className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 text-white font-bold rounded-xl hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-500/20 text-xs uppercase tracking-widest"
                >
                  <Save size={18} />
                  Guardar
                </button>
                <button 
                  onClick={() => setIsEditing(false)}
                  className="flex items-center gap-1.5 px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 font-bold rounded-xl hover:bg-slate-200 dark:hover:bg-slate-700 transition-all border border-slate-200 dark:border-slate-700 text-xs uppercase tracking-widest"
                >
                  <X size={18} />
                  Cancelar
                </button>
              </div>
            ) : (
              <button
                onClick={() => {
                  setIsEditing(true);
                  setActiveTab('overview');
                }}
                className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-800"
                title="Editar Proyecto"
              >
                <Edit2 size={20} />
              </button>
            )}
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        <div className="bg-white dark:bg-slate-900 rounded-[--radius-theme] shadow-[--shadow-theme] border border-slate-100 dark:border-slate-800 overflow-hidden transition-all duration-500">
          <div className="p-4 sm:p-8 bg-primary text-white">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 sm:gap-6">
              <div className="flex items-center gap-3 sm:gap-6">
                <div className="p-2 sm:p-4 bg-white/20 backdrop-blur-md rounded-xl sm:rounded-2xl">
                  <Construction size={24} className="sm:w-10 sm:h-10" />
                </div>
                <div>
                  {isEditing ? (
                    <input 
                      className="text-xl sm:text-3xl font-black bg-white/10 border border-white/20 rounded-lg px-2 focus:outline-none w-full"
                      value={editForm.name}
                      onChange={(e) => setEditForm({...editForm, name: e.target.value})}
                    />
                  ) : (
                    <h1 className="text-xl sm:text-3xl font-black tracking-tight">{project.name}</h1>
                  )}
                  <div className="flex items-center gap-1.5 sm:gap-2 text-primary-light mt-0.5 sm:mt-1 text-[10px] sm:text-base">
                    <MapPin size={12} className="sm:w-4 sm:h-4" />
                    {isEditing ? (
                      <div className="flex flex-col gap-2">
                        <div className="flex items-center gap-2">
                          <MapPin size={14} className="sm:w-4 sm:h-4 text-white/70" />
                          <input 
                            className="bg-white/10 border border-white/20 rounded-lg px-2 py-1 focus:outline-none text-xs sm:text-sm text-white w-full max-w-md"
                            placeholder="Ubicación"
                            value={editForm.location}
                            onChange={(e) => setEditForm({...editForm, location: e.target.value})}
                          />
                        </div>
                        <div className="flex items-center gap-2">
                          <Users size={14} className="sm:w-4 sm:h-4 text-white/70" />
                          <select 
                            className="bg-white/10 border border-white/20 rounded-lg px-2 py-1 focus:outline-none text-[10px] sm:text-sm text-white appearance-none w-full max-w-md"
                            value={editForm.clientUid || ''}
                            onChange={(e) => setEditForm({...editForm, clientUid: e.target.value})}
                          >
                            <option value="" className="text-slate-900">Seleccionar Cliente...</option>
                            {clients.map(c => (
                              <option key={c.id} value={c.id} className="text-slate-900">{c.name}</option>
                            ))}
                          </select>
                        </div>
                        <div className="flex items-center gap-2">
                          <HardHat size={14} className="sm:w-4 sm:h-4 text-white/70" />
                          <input 
                            className="bg-white/10 border border-white/20 rounded-lg px-2 py-1 focus:outline-none text-[10px] sm:text-sm text-white w-full max-w-md"
                            placeholder="Responsable de Obra"
                            value={editForm.projectManager}
                            onChange={(e) => setEditForm({...editForm, projectManager: e.target.value})}
                          />
                        </div>
                      </div>
                    ) : (
                      <div 
                        className="flex flex-col cursor-pointer hover:bg-white/5 rounded-lg p-1 -ml-1 transition-colors group"
                        onClick={() => {
                          setIsEditing(true);
                          setActiveTab('overview');
                        }}
                      >
                        <div className="flex items-center gap-1.5 sm:gap-2">
                          <MapPin size={12} className="sm:w-4 sm:h-4" />
                          <span className="font-medium">{project.location}</span>
                          <Edit2 size={10} className="opacity-0 group-hover:opacity-100 transition-opacity ml-1" />
                        </div>
                        <div className="flex items-center gap-1.5 sm:gap-2 text-primary-light/90 text-[10px] sm:text-sm mt-0.5 sm:mt-1 font-black uppercase tracking-wider">
                          <Users size={12} className="sm:w-3.5 sm:h-3.5" />
                          <span>Cliente: {clients.find(c => c.id === project.clientUid)?.name || 'No asignado'}</span>
                        </div>
                        <div className="flex items-center gap-1.5 sm:gap-2 text-primary-light/70 text-[8px] sm:text-xs mt-0.5 sm:mt-1 font-bold uppercase tracking-widest">
                          <HardHat size={12} className="sm:w-3.5 sm:h-3.5" />
                          <span>Responsable: {project.projectManager || 'No asignado'}</span>
                        </div>
                      </div>
                    )}
                  </div>
            <div className="flex flex-wrap gap-2 sm:gap-4 mt-3 sm:mt-6">
              <div className={cn("flex items-center gap-1.5 sm:gap-2 px-2 py-0.5 sm:py-1 rounded-md sm:rounded-lg border text-[8px] sm:text-[10px] font-black uppercase tracking-wider", getTypologyColor(project.typology))}>
                {(() => {
                  const Icon = getTypologyIcon(project.typology);
                  return <Icon size={10} className="sm:w-3 sm:h-3" />;
                })()}
                <span>{project.typology || 'N/A'}</span>
              </div>
              <div className="flex items-center gap-1.5 sm:gap-2 text-primary-light/80 text-[10px] sm:text-xs font-bold">
                <DollarSign size={12} className="sm:w-3.5 sm:h-3.5" />
                {isEditing ? (
                  <div className="flex items-center gap-1">
                    <span className="text-[8px] uppercase opacity-70">Presupuesto:</span>
                    <input 
                      type="number"
                      min="0"
                      step="any"
                      className="bg-white/10 border border-white/20 rounded px-1.5 py-0.5 w-24 focus:outline-none text-white"
                      value={editForm.budget}
                      onChange={(e) => setEditForm({...editForm, budget: Number(e.target.value)})}
                    />
                  </div>
                ) : (
                  <span onClick={() => {
                    setIsEditing(true);
                    setActiveTab('overview');
                  }} className="cursor-pointer hover:text-white transition-colors">
                    Presupuesto: {formatCurrency(project.budget)}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1.5 sm:gap-2 text-primary-light/80 text-[10px] sm:text-xs font-bold">
                <Calculator size={12} className="sm:w-3.5 sm:h-3.5" />
                <span>{project.area || 0} m²</span>
              </div>
              <div className="flex items-center gap-1.5 sm:gap-2 text-primary-light/80 text-[10px] sm:text-xs font-bold">
                <Calendar size={12} className="sm:w-3.5 sm:h-3.5" />
                <span>Inicio: {project.startDate ? formatDate(project.startDate) : 'N/A'}</span>
              </div>
              <div className="flex items-center gap-1.5 sm:gap-2 text-primary-light/80 text-[10px] sm:text-xs font-bold">
                <Clock size={12} className="sm:w-3.5 sm:h-3.5" />
                <span>Fin: {project.endDate ? formatDate(project.endDate) : 'N/A'}</span>
              </div>
              {isEditing ? (
                <select 
                  className="bg-white/20 px-1.5 sm:px-2 py-0.5 sm:py-1 rounded text-[8px] sm:text-[10px] font-black uppercase tracking-wider focus:outline-none appearance-none cursor-pointer text-white border-none"
                  value={editForm.status}
                  onChange={(e) => setEditForm({...editForm, status: e.target.value})}
                >
                  <option value="Planning" className="text-slate-900">Planeación</option>
                  <option value="In Progress" className="text-slate-900">En Ejecución</option>
                  <option value="On Hold" className="text-slate-900">En Pausa</option>
                  <option value="Completed" className="text-slate-900">Completado</option>
                </select>
              ) : (
                <div 
                  onClick={() => {
                    setIsEditing(true);
                    setActiveTab('overview');
                  }}
                  className="bg-white/20 px-1.5 sm:px-2 py-0.5 sm:py-1 rounded text-[8px] sm:text-[10px] font-black uppercase tracking-wider cursor-pointer hover:bg-white/30 transition-colors"
                >
                  {project.status === 'Planning' ? 'Planeación' : project.status === 'In Progress' ? 'En Ejecución' : project.status === 'Completed' ? 'Completado' : 'En Pausa'}
                </div>
              )}
            </div>
                </div>
              </div>
                <div className="flex gap-2 sm:gap-3 w-full sm:w-auto">
                {!isEditing && (
                  <>
                    <button 
                      onClick={() => setIsBudgetModalOpen(true)}
                      className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 sm:gap-2 bg-emerald-600 text-white px-3 sm:px-4 py-2 sm:py-3 rounded-xl font-black hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-500/20 text-[10px] sm:text-xs uppercase tracking-widest"
                    >
                      <DollarSign size={14} className="sm:w-5 sm:h-5" />
                      Presupuesto
                    </button>
                    <button 
                      onClick={handleEmailReport}
                      className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 sm:gap-2 bg-white/10 text-white px-3 sm:px-4 py-2 sm:py-3 rounded-xl font-black hover:bg-white/20 transition-all border border-white/20 text-[10px] sm:text-xs uppercase tracking-widest"
                    >
                      <Mail size={14} className="sm:w-5 sm:h-5" />
                      Email
                    </button>
                    <button 
                      onClick={generateReport}
                      className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 sm:gap-2 bg-white/10 text-white px-3 sm:px-4 py-2 sm:py-3 rounded-xl font-black hover:bg-white/20 transition-all border border-white/20 text-[10px] sm:text-xs uppercase tracking-widest"
                    >
                      <Download size={14} className="sm:w-5 sm:h-5" />
                      PDF
                    </button>
                  </>
                )}
                {isEditing ? (
                  <>
                    <button 
                      onClick={handleUpdateProject}
                      className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 sm:gap-2 bg-white text-primary px-4 sm:px-6 py-2 sm:py-3 rounded-xl font-black hover:bg-primary-light transition-all shadow-lg text-[10px] sm:text-xs uppercase tracking-widest"
                    >
                      <Save size={14} className="sm:w-5 sm:h-5" />
                      Guardar
                    </button>
                    <button 
                      onClick={() => setIsEditing(false)}
                      className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 sm:gap-2 bg-primary-hover text-white px-4 sm:px-6 py-2 sm:py-3 rounded-xl font-black hover:bg-primary-hover/90 transition-all text-[10px] sm:text-xs uppercase tracking-widest"
                    >
                      <X size={14} className="sm:w-5 sm:h-5" />
                      Cancelar
                    </button>
                  </>
                ) : (
                  <button 
                    onClick={() => {
                      setIsEditing(true);
                      setActiveTab('overview');
                    }}
                    className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 sm:gap-2 bg-white text-primary px-4 sm:px-6 py-2 sm:py-3 rounded-xl font-black hover:bg-primary-light transition-all shadow-lg text-[10px] sm:text-xs uppercase tracking-widest"
                  >
                    <Edit2 size={14} className="sm:w-5 sm:h-5" />
                    Editar
                  </button>
                )}
              </div>
            </div>
          </div>

        <div className="border-b border-slate-100 dark:border-slate-800 flex overflow-x-auto no-scrollbar bg-white dark:bg-slate-900 rounded-xl sm:rounded-2xl p-1">
          {[
            { id: 'overview', label: 'Resumen', icon: Layers },
            { id: 'budget', label: 'Presupuesto', icon: Calculator },
            { id: 'financials', label: 'Finanzas', icon: DollarSign },
            { id: 'logbook', label: 'Bitácora', icon: History },
            { id: 'tasks', label: 'Tareas', icon: ListTodo },
            { id: 'risk', label: 'Riesgos', icon: AlertCircle },
            { id: 'map', label: 'Mapa', icon: MapIcon },
            { id: 'audit', label: 'Auditoría', icon: ShieldCheck },
          ].map((tab) => (
            <button 
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={cn(
                "px-4 sm:px-8 py-2 sm:py-4 text-[10px] sm:text-sm font-black uppercase tracking-widest border-b-2 transition-all whitespace-nowrap flex items-center gap-1.5 sm:gap-2",
                activeTab === tab.id 
                  ? "border-primary text-primary bg-primary/5 rounded-t-lg" 
                  : "border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
              )}
            >
              <tab.icon size={14} className="sm:w-4 sm:h-4" />
              <span>{tab.label}</span>
            </button>
          ))}
        </div>

        <div className="p-8">
          {activeTab === 'budget' && (
            <div className="space-y-8">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <div className="bg-emerald-50 p-6 rounded-2xl border border-emerald-100">
                  <p className="text-xs font-bold text-emerald-600 uppercase tracking-wider mb-2">Materiales</p>
                  <p className="text-xl font-black text-emerald-900">{formatCurrency(budgetSummaries.materialCost)}</p>
                </div>
                <div className="bg-blue-50 p-6 rounded-2xl border border-blue-100">
                  <p className="text-xs font-bold text-blue-600 uppercase tracking-wider mb-2">Mano de Obra</p>
                  <p className="text-xl font-black text-blue-900">{formatCurrency(budgetSummaries.laborCost)}</p>
                </div>
                <div className="bg-amber-50 p-6 rounded-2xl border border-amber-100">
                  <p className="text-xs font-bold text-amber-600 uppercase tracking-wider mb-2">Indirectos</p>
                  <p className="text-xl font-black text-amber-900">{formatCurrency(budgetSummaries.indirectCost)}</p>
                </div>
                <div className="bg-primary-light p-6 rounded-2xl border border-primary-light">
                  <p className="text-xs font-bold text-primary uppercase tracking-wider mb-2">Total Presupuesto</p>
                  <p className="text-xl font-black text-primary">{formatCurrency(project.budget)}</p>
                </div>
              </div>

              <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-100 dark:border-slate-800 p-8 text-center space-y-6">
                <div className="w-20 h-20 bg-primary/10 text-primary rounded-full flex items-center justify-center mx-auto">
                  <Calculator size={40} />
                </div>
                <div className="max-w-md mx-auto">
                  <h3 className="text-2xl font-black text-slate-900 dark:text-white mb-2">Gestión de Presupuesto</h3>
                  <p className="text-slate-500 dark:text-slate-400">Accede al módulo completo de presupuesto para gestionar renglones, APUs, explosión de materiales y cotizaciones.</p>
                </div>
                <button 
                  onClick={() => setIsBudgetModalOpen(true)}
                  className="inline-flex items-center gap-3 bg-primary text-white px-8 py-4 rounded-2xl font-black hover:bg-primary-hover transition-all shadow-xl shadow-primary-shadow uppercase tracking-widest text-sm"
                >
                  <DollarSign size={20} />
                  Abrir Presupuesto Detallado
                </button>
              </div>

              <div className="space-y-4">
                <h4 className="text-sm font-black text-slate-400 uppercase tracking-widest">Resumen de Renglones</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {budgetItems.map(item => (
                    <div key={item.id} className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-2xl border border-slate-100 dark:border-slate-700 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-white dark:bg-slate-800 rounded-xl flex items-center justify-center text-slate-400 border border-slate-100 dark:border-slate-700">
                          <Calculator size={18} />
                        </div>
                        <div>
                          <p className="text-sm font-bold text-slate-900 dark:text-white leading-tight">{item.description}</p>
                          <p className="text-[10px] text-slate-500 uppercase font-bold">{item.quantity} {item.unit}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-black text-primary">{formatCurrency(item.totalItemPrice || 0)}</p>
                        <p className="text-[10px] text-slate-400 uppercase font-bold">Total</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
          {activeTab === 'overview' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              <div className="lg:col-span-2 space-y-8">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100">
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Presupuesto Total</p>
                    {isEditing ? (
                      <input 
                        type="number"
                        min="0"
                        step="any"
                        className="text-xl font-bold text-slate-900 bg-white border border-slate-200 rounded-lg px-2 w-full"
                        value={editForm.budget}
                        onChange={(e) => setEditForm({...editForm, budget: Number(e.target.value)})}
                      />
                    ) : (
                      <p className="text-xl font-bold text-slate-900">{formatCurrency(project.budget)}</p>
                    )}
                  </div>
                  <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100">
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Total Ejecutado</p>
                    {isEditing ? (
                      <input 
                        type="number"
                        min="0"
                        step="any"
                        className="text-xl font-bold text-rose-600 bg-white border border-slate-200 rounded-lg px-2 w-full"
                        value={editForm.spent}
                        onChange={(e) => setEditForm({...editForm, spent: Number(e.target.value)})}
                      />
                    ) : (
                      <p className="text-xl font-bold text-rose-600">{formatCurrency(project.spent)}</p>
                    )}
                  </div>
                  <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100">
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Avance Físico</p>
                    <div className="flex items-center gap-3">
                      {isEditing ? (
                        <input 
                          type="number"
                          min="0"
                          step="any"
                          className="text-xl font-bold text-primary bg-white border border-slate-200 rounded-lg px-2 w-20"
                          value={editForm.physicalProgress}
                          onChange={(e) => setEditForm({...editForm, physicalProgress: Number(e.target.value)})}
                        />
                      ) : (
                        <p className="text-xl font-bold text-primary">{(project.physicalProgress || 0).toFixed(1)}%</p>
                      )}
                      <div className="flex-1 h-2 bg-slate-200 rounded-full overflow-hidden">
                        <div className="h-full bg-primary" style={{ width: `${project.physicalProgress}%` }} />
                      </div>
                    </div>
                  </div>
                </div>

                {isEditing && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Nombre del Proyecto</label>
                      <input 
                        type="text"
                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary"
                        value={editForm.name}
                        onChange={(e) => setEditForm({...editForm, name: e.target.value})}
                      />
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Ubicación</label>
                        <button
                          type="button"
                          onClick={() => {
                            setProjectForMap({
                              name: editForm.name || 'Obra',
                              location: editForm.location || 'Sin ubicación',
                              latitude: editForm.coordinates?.lat || '',
                              longitude: editForm.coordinates?.lng || '',
                              pois: pois
                            });
                            setIsSelectionMode(true);
                            setIsMapOpen(true);
                          }}
                          className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-emerald-600 hover:text-emerald-700 transition-colors"
                        >
                          <MapPin size={12} />
                          Seleccionar en Mapa
                        </button>
                      </div>
                      <input 
                        type="text"
                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary"
                        value={editForm.location}
                        onChange={(e) => setEditForm({...editForm, location: e.target.value})}
                      />
                    </div>
                  </div>
                )}

                {isEditing && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Responsable de Obra</label>
                      <input 
                        type="text"
                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary"
                        value={editForm.projectManager}
                        onChange={(e) => setEditForm({...editForm, projectManager: e.target.value})}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Cliente</label>
                      <select 
                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary"
                        value={editForm.clientUid || ''}
                        onChange={(e) => setEditForm({...editForm, clientUid: e.target.value})}
                      >
                        <option value="">Seleccionar Cliente (Opcional)</option>
                        {clients.map(c => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}

                {isEditing && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Estado</label>
                      <select 
                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary"
                        value={editForm.status}
                        onChange={(e) => setEditForm({...editForm, status: e.target.value})}
                      >
                        <option value="Planning">Planeación</option>
                        <option value="In Progress">En Ejecución</option>
                        <option value="On Hold">En Pausa</option>
                        <option value="Completed">Completado</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Avance Físico (%)</label>
                      <input 
                        type="number"
                        min="0"
                        max="100"
                        step="any"
                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary"
                        value={editForm.physicalProgress}
                        onChange={(e) => setEditForm({...editForm, physicalProgress: Number(e.target.value)})}
                      />
                    </div>
                  </div>
                )}

                {isEditing && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Área de Construcción (m²)</label>
                      <input 
                        type="number"
                        min="0"
                        step="any"
                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary"
                        value={editForm.area || ''}
                        onChange={(e) => setEditForm({...editForm, area: e.target.value})}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Tipología</label>
                      <select 
                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary"
                        value={editForm.typology || 'RESIDENCIAL'}
                        onChange={(e) => setEditForm({...editForm, typology: e.target.value})}
                      >
                        <option value="RESIDENCIAL">Residencial</option>
                        <option value="COMERCIAL">Comercial</option>
                        <option value="INDUSTRIAL">Industrial</option>
                        <option value="CIVIL">Civil</option>
                        <option value="PUBLICA">Pública</option>
                        <option value="SALUD">Salud</option>
                        <option value="EDUCACION">Educación</option>
                        <option value="DEPORTIVA">Deportiva</option>
                        <option value="INFRAESTRUCTURA">Infraestructura</option>
                        <option value="TURISMO">Turismo</option>
                      </select>
                    </div>
                  </div>
                )}

                {isEditing && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Fecha Inicio</label>
                      <input 
                        type="date" 
                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary"
                        value={editForm.startDate}
                        onChange={(e) => setEditForm({...editForm, startDate: e.target.value})}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Fecha Fin Estimada</label>
                      <input 
                        type="date" 
                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary"
                        value={editForm.endDate}
                        onChange={(e) => setEditForm({...editForm, endDate: e.target.value})}
                      />
                    </div>
                  </div>
                )}

                {isEditing && (
                  <div className="flex justify-end gap-4 pt-6 border-t border-slate-100 dark:border-slate-800">
                    <button 
                      onClick={() => setIsEditing(false)}
                      className="px-6 py-3 rounded-xl font-black text-slate-500 hover:bg-slate-50 transition-all uppercase tracking-widest text-xs"
                    >
                      Cancelar
                    </button>
                    <button 
                      onClick={handleUpdateProject}
                      className="bg-primary text-white px-8 py-3 rounded-xl font-black hover:bg-primary-hover transition-all shadow-xl shadow-primary-shadow uppercase tracking-widest text-xs"
                    >
                      Guardar Cambios
                    </button>
                  </div>
                )}

                <div className="bg-white p-6 rounded-2xl border border-slate-100 space-y-4">
                  <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                    <TrendingUp className="text-primary" size={20} />
                    Resumen de Desempeño Financiero
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="p-4 bg-slate-50 rounded-xl border border-slate-100">
                      <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1">Presupuesto Total</p>
                      <p className="text-lg font-bold text-slate-900">{formatCurrency(project.budget)}</p>
                    </div>
                    <div className="p-4 bg-slate-50 rounded-xl border border-slate-100">
                      <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1">Total Ejecutado</p>
                      <p className="text-lg font-bold text-rose-600">{formatCurrency(project.spent)}</p>
                    </div>
                    <div className="p-4 bg-slate-50 rounded-xl border border-slate-100">
                      <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1">Porcentaje de Utilidad</p>
                      <p className={cn(
                        "text-lg font-bold",
                        ((project.budget - project.spent) / project.budget * 100) >= 0 ? "text-emerald-600" : "text-rose-600"
                      )}>
                        {project.budget > 0 
                          ? `${(((project.budget - project.spent) / project.budget) * 100).toFixed(1)}%`
                          : '0.0%'}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="bg-emerald-50 p-6 rounded-2xl border border-emerald-100">
                    <p className="text-xs font-bold text-emerald-600 uppercase tracking-wider mb-2">Total Ingresos</p>
                    <p className="text-xl font-bold text-emerald-700">
                      {formatCurrency(transactions.filter(t => t.type === 'Income').reduce((sum, t) => sum + t.amount, 0))}
                    </p>
                  </div>
                  <div className="bg-rose-50 p-6 rounded-2xl border border-rose-100">
                    <p className="text-xs font-bold text-rose-600 uppercase tracking-wider mb-2">Total Gastos</p>
                    <p className="text-xl font-bold text-rose-700">
                      {formatCurrency(transactions.filter(t => t.type === 'Expense').reduce((sum, t) => sum + t.amount, 0))}
                    </p>
                  </div>
                </div>

                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                      <HandCoins className="text-primary" size={20} />
                      Transacciones Recientes
                    </h3>
                  </div>
                  <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
                    <table className="w-full text-left">
                      <thead className="bg-slate-50 border-b border-slate-100">
                        <tr>
                          <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase">Fecha</th>
                          <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase">Categoría</th>
                          <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase text-right">Monto</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {transactions.slice(0, 5).map(t => (
                          <tr key={t.id}>
                            <td className="px-6 py-4 text-sm text-slate-600">{formatDate(t.date)}</td>
                            <td className="px-6 py-4 text-sm font-medium text-slate-900">{t.category}</td>
                            <td className={cn(
                              "px-6 py-4 text-sm font-bold text-right",
                              t.type === 'Income' ? "text-emerald-600" : "text-rose-600"
                            )}>
                              {t.type === 'Income' ? '+' : '-'}{formatCurrency(t.amount)}
                            </td>
                          </tr>
                        ))}
                        {transactions.length === 0 && (
                          <tr>
                            <td colSpan={3} className="px-6 py-8 text-center text-slate-400 italic">No hay transacciones registradas</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              <div className="space-y-8">
                <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100 space-y-4">
                  <h3 className="font-bold text-slate-900 flex items-center gap-2">
                    <HardHat className="text-primary" size={18} />
                    Subcontratos Activos
                  </h3>
                  <div className="space-y-3">
                    {subcontracts.filter(s => s.status === 'Active').map(s => (
                      <div key={s.id} className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm">
                        <div className="flex justify-between items-start mb-1">
                          <p className="font-bold text-slate-900 text-sm">{s.contractor}</p>
                          <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">Activo</span>
                        </div>
                        <p className="text-xs text-slate-500 mb-1">{s.service}</p>
                        <p className="text-[10px] font-bold text-primary uppercase tracking-wider mb-2">{s.budgetItemName || 'Sin renglón'}</p>
                        <div className="flex justify-between items-end pt-2 border-t border-slate-50">
                          <div>
                            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Saldo Pendiente</p>
                            <p className="text-sm font-bold text-rose-600">{formatCurrency((s.total || 0) - (s.paid || 0))}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Total</p>
                            <p className="text-xs font-medium text-slate-600">{formatCurrency(s.total || 0)}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                    {subcontracts.filter(s => s.status === 'Active').length === 0 && (
                      <p className="text-xs text-slate-400 italic text-center py-4">No hay subcontratos activos</p>
                    )}
                  </div>
                </div>

                <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100 space-y-4">
                  <h3 className="font-bold text-slate-900 flex items-center gap-2">
                    <Truck className="text-primary" size={18} />
                    Maquinaria y Equipo
                  </h3>
                  <div className="space-y-3">
                    {equipment.map(e => (
                      <div key={e.id} className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm">
                        <p className="font-bold text-slate-900 text-sm">{e.name}</p>
                        <p className="text-xs text-slate-500">{e.type === 'Rented' ? 'Rentado' : 'Propio'}</p>
                        {e.type === 'Rented' && (
                          <p className="text-[10px] text-rose-600 font-bold mt-1">Costo: {formatCurrency(e.cost)} / día</p>
                        )}
                      </div>
                    ))}
                    {equipment.length === 0 && <p className="text-xs text-slate-400 italic">Sin equipo asignado</p>}
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'financials' && (
            <div className="space-y-8">
              {/* Deviation Alert */}
              {(() => {
                const financialProgress = project.budget > 0 ? (project.spent / project.budget) * 100 : 0;
                const progressDeviation = financialProgress - (project.physicalProgress || 0);
                if (progressDeviation > 15) {
                  return (
                    <motion.div 
                      initial={{ opacity: 0, y: -20 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="bg-rose-50 border-2 border-rose-200 p-6 rounded-3xl flex items-center gap-6 shadow-sm"
                    >
                      <div className="p-4 bg-rose-500 text-white rounded-2xl shadow-lg shadow-rose-200">
                        <AlertCircle size={32} />
                      </div>
                      <div className="flex-1">
                        <h3 className="text-lg font-bold text-rose-900">Alerta de Desviación Crítica</h3>
                        <p className="text-rose-700 text-sm">
                          El avance financiero (<strong>{financialProgress.toFixed(1)}%</strong>) supera al avance físico (<strong>{(project.physicalProgress || 0).toFixed(1)}%</strong>) en un <strong>{progressDeviation.toFixed(1)}%</strong>. 
                          Se recomienda revisar el desglose de gastos y el cronograma de obra.
                        </p>
                      </div>
                      <div className="text-right">
                        <span className="text-3xl font-black text-rose-600">-{progressDeviation.toFixed(1)}%</span>
                        <p className="text-[10px] font-bold text-rose-400 uppercase tracking-widest mt-1">Desviación</p>
                      </div>
                    </motion.div>
                  );
                }
                return null;
              })()}

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="p-6 bg-emerald-50 rounded-2xl border border-emerald-100">
                  <p className="text-xs font-bold text-emerald-600 uppercase tracking-wider mb-2">Ingresos Totales</p>
                  <p className="text-2xl font-bold text-emerald-700">
                    {formatCurrency(financialSummaries.totalIncome)}
                  </p>
                </div>
                <div className="p-6 bg-rose-50 rounded-2xl border border-rose-100">
                  <p className="text-xs font-bold text-rose-600 uppercase tracking-wider mb-2">Gastos Totales</p>
                  <p className="text-2xl font-bold text-rose-700">
                    {formatCurrency(financialSummaries.totalExpense)}
                  </p>
                </div>
                <div className="p-6 bg-blue-50 rounded-2xl border border-blue-100">
                  <p className="text-xs font-bold text-blue-600 uppercase tracking-wider mb-2">Balance Neto</p>
                  <p className="text-2xl font-bold text-blue-700">
                    {formatCurrency(financialSummaries.netBalance)}
                  </p>
                </div>
              </div>

              <div className="bg-white p-6 rounded-2xl border border-slate-100 space-y-6">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                    <Calculator className="text-primary" size={20} />
                    Desglose del Presupuesto (Renglones)
                  </h3>
                  <button 
                    onClick={generateBudgetPDF}
                    className="flex items-center gap-2 px-4 py-2 bg-primary text-white text-xs font-bold rounded-xl hover:bg-primary-hover transition-all shadow-lg shadow-primary-shadow"
                  >
                    <Download size={16} />
                    Exportar PDF
                  </button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="p-4 bg-slate-50 rounded-xl border border-slate-100">
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1">Costo Materiales</p>
                    <p className="text-lg font-bold text-slate-900">
                      {formatCurrency(budgetSummaries.materialCost)}
                    </p>
                  </div>
                  <div className="p-4 bg-slate-50 rounded-xl border border-slate-100">
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1">Costo Mano de Obra</p>
                    <p className="text-lg font-bold text-blue-600">
                      {formatCurrency(budgetSummaries.laborCost)}
                    </p>
                  </div>
                  <div className="p-4 bg-slate-50 rounded-xl border border-slate-100">
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1">Costos Indirectos</p>
                    <p className="text-lg font-bold text-slate-900">
                      {formatCurrency(budgetSummaries.indirectCost)}
                    </p>
                  </div>
                  <div className="p-4 bg-slate-50 rounded-xl border border-slate-100">
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1">Duración Estimada</p>
                    <p className="text-lg font-bold text-primary">
                      {budgetSummaries.estimatedDays} Días
                    </p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
                  <div className="p-6 border-b border-slate-100 bg-emerald-50/50">
                    <h3 className="font-bold text-emerald-900">Desglose de Ingresos por Categoría</h3>
                  </div>
                  <table className="w-full text-left">
                    <thead className="bg-slate-50/50">
                      <tr>
                        <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase">Categoría</th>
                        <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase text-right">Monto</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {financialSummaries.incomeByCategory.map(([category, amount]: any) => (
                        <tr key={category}>
                          <td className="px-6 py-4 text-sm font-medium text-slate-900">{category}</td>
                          <td className="px-6 py-4 text-sm font-bold text-emerald-600 text-right">{formatCurrency(amount)}</td>
                        </tr>
                      ))}
                      {financialSummaries.incomeByCategory.length === 0 && (
                        <tr>
                          <td colSpan={2} className="px-6 py-8 text-center text-slate-400 italic">No hay ingresos registrados</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
                  <div className="p-6 border-b border-slate-100 bg-rose-50/50">
                    <h3 className="font-bold text-rose-900">Desglose de Gastos por Categoría</h3>
                  </div>
                  <table className="w-full text-left">
                    <thead className="bg-slate-50/50">
                      <tr>
                        <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase">Categoría</th>
                        <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase text-right">Monto</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {financialSummaries.expenseByCategory.map(([category, amount]: any) => (
                        <tr key={category}>
                          <td className="px-6 py-4 text-sm font-medium text-slate-900">{category}</td>
                          <td className="px-6 py-4 text-sm font-bold text-rose-600 text-right">{formatCurrency(amount)}</td>
                        </tr>
                      ))}
                      {financialSummaries.expenseByCategory.length === 0 && (
                        <tr>
                          <td colSpan={2} className="px-6 py-8 text-center text-slate-400 italic">No hay gastos registrados</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                    <Truck className="text-primary" size={20} />
                    Análisis de Costos de Materiales por Renglón
                  </h3>
                </div>
                <div className="grid grid-cols-1 gap-4">
                  {budgetItems.map(item => {
                    const isExpanded = expandedBudgetItem === item.id;
                    const itemTransactions = transactions.filter(t => t.budgetItemId === item.id);
                    const budgetedMaterialCost = (item.materialCost || 0) * (item.quantity || 1);
                    const budgetedLaborCost = (item.laborCost || 0) * (item.quantity || 1);
                    const budgetedIndirectCost = (item.indirectCost || 0) * (item.quantity || 1);
                    const totalBudgeted = budgetedMaterialCost + budgetedLaborCost + budgetedIndirectCost;
                    
                    const realMaterialCost = (item.materials || []).reduce((sum: number, m: any) => {
                      const materialTransactions = itemTransactions.filter(t => 
                        t.description?.toLowerCase().includes(m.name.toLowerCase())
                      );
                      return sum + materialTransactions.reduce((s, t) => s + t.amount, 0);
                    }, 0);

                    const deviation = totalBudgeted > 0 ? ((realMaterialCost - totalBudgeted) / totalBudgeted) * 100 : 0;

                    return (
                      <div key={item.id} className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 overflow-hidden shadow-sm transition-all duration-300">
                        <button 
                          onClick={() => setExpandedBudgetItem(isExpanded ? null : item.id)}
                          className="w-full p-6 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
                        >
                          <div className="flex items-center gap-4">
                            <div className={cn(
                              "p-3 rounded-xl",
                              isExpanded ? "bg-primary text-white" : "bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400"
                            )}>
                              <Calculator size={20} />
                            </div>
                            <div className="text-left">
                              <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Renglón</span>
                              <h4 className="font-bold text-slate-900 dark:text-white">{item.description}</h4>
                            </div>
                          </div>
                          <div className="flex items-center gap-8">
                            <div className="text-right hidden sm:block">
                              <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Presupuesto Total</span>
                              <p className="font-bold text-slate-900 dark:text-white">{formatCurrency(totalBudgeted)}</p>
                            </div>
                            <div className="text-right">
                              <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Desviación</span>
                              <p className={cn(
                                "font-bold text-sm",
                                deviation > 10 ? "text-rose-600" : deviation < -10 ? "text-emerald-600" : "text-slate-600 dark:text-slate-400"
                              )}>
                                {deviation > 0 ? '+' : ''}{deviation.toFixed(1)}%
                              </p>
                            </div>
                            <div className={cn(
                              "p-2 rounded-lg transition-transform duration-300",
                              isExpanded ? "rotate-180 bg-primary/10 text-primary" : "bg-slate-100 dark:bg-slate-700 text-slate-400 dark:text-slate-500"
                            )}>
                              <Plus size={16} className={cn(isExpanded && "rotate-45")} />
                            </div>
                          </div>
                        </button>

                        <AnimatePresence>
                          {isExpanded && (
                            <motion.div 
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: 'auto', opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              className="border-t border-slate-100 dark:border-slate-700"
                            >
                              <div className="p-6 space-y-8">
                                {/* Summary Stats */}
                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                                  <div className="space-y-6">
                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                      <div className="p-4 bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-slate-100 dark:border-slate-700">
                                        <p className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-wider mb-1">Materiales</p>
                                        <p className="text-lg font-bold text-slate-900 dark:text-white">{formatCurrency(budgetedMaterialCost)}</p>
                                      </div>
                                      <div className="p-4 bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-slate-100 dark:border-slate-700">
                                        <p className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-wider mb-1">Mano de Obra</p>
                                        <p className="text-lg font-bold text-blue-600 dark:text-blue-400">{formatCurrency(budgetedLaborCost)}</p>
                                      </div>
                                      <div className="p-4 bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-slate-100 dark:border-slate-700">
                                        <p className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-wider mb-1">Indirectos</p>
                                        <p className="text-lg font-bold text-amber-600 dark:text-amber-400">{formatCurrency(budgetedIndirectCost)}</p>
                                      </div>
                                    </div>

                                    <div className="p-4 bg-primary/5 dark:bg-primary/10 rounded-xl border border-primary/10">
                                      <p className="text-[10px] text-primary font-bold uppercase tracking-wider mb-1">Costo Real Acumulado (Mat.)</p>
                                      <p className="text-lg font-bold text-primary">{formatCurrency(realMaterialCost)}</p>
                                    </div>
                                  </div>

                                  <div className="bg-slate-50 dark:bg-slate-900/50 p-6 rounded-2xl border border-slate-100 dark:border-slate-700 flex flex-col items-center justify-center min-h-[300px]">
                                    <h5 className="text-sm font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                                      <PieChartIcon size={16} className="text-primary" />
                                      Distribución del Presupuesto
                                    </h5>
                                    <div className="h-64 w-full">
                                      <ResponsiveContainer width="100%" height="100%">
                                        <PieChart margin={{ top: 0, right: 0, left: 0, bottom: 20 }}>
                                          <Pie
                                            data={[
                                              { name: 'Materiales', value: budgetedMaterialCost, color: '#10b981' },
                                              { name: 'Mano de Obra', value: budgetedLaborCost, color: '#3b82f6' },
                                              { name: 'Indirectos', value: budgetedIndirectCost, color: '#f59e0b' },
                                            ].filter(d => d.value > 0)}
                                            cx="50%"
                                            cy="45%"
                                            innerRadius={60}
                                            outerRadius={80}
                                            paddingAngle={5}
                                            dataKey="value"
                                          >
                                            {[
                                              { name: 'Materiales', value: budgetedMaterialCost, color: '#10b981' },
                                              { name: 'Mano de Obra', value: budgetedLaborCost, color: '#3b82f6' },
                                              { name: 'Indirectos', value: budgetedIndirectCost, color: '#f59e0b' },
                                            ].filter(d => d.value > 0).map((entry, index) => (
                                              <Cell key={`cell-${index}`} fill={entry.color} />
                                            ))}
                                          </Pie>
                                          <Tooltip 
                                            formatter={(value: number) => formatCurrency(value)}
                                            contentStyle={{ 
                                              borderRadius: '12px', 
                                              border: 'none', 
                                              boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)',
                                              backgroundColor: 'white',
                                              color: '#1e293b'
                                            }}
                                          />
                                          <Legend 
                                            verticalAlign="bottom" 
                                            align="center"
                                            iconType="circle"
                                            wrapperStyle={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', paddingTop: '10px' }}
                                          />
                                        </PieChart>
                                      </ResponsiveContainer>
                                    </div>
                                  </div>
                                </div>

                                {/* Materials Table */}
                                <div className="space-y-4">
                                  <h5 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                                    <Truck size={16} className="text-primary" />
                                    Desglose de Materiales
                                  </h5>
                                  <div className="overflow-x-auto">
                                    <table className="w-full text-left text-sm">
                                      <thead>
                                        <tr className="text-slate-400 dark:text-slate-500 uppercase text-[10px] font-bold tracking-wider border-b border-slate-100 dark:border-slate-700">
                                          <th className="pb-3">Material</th>
                                          <th className="pb-3 text-right">Cant. Presup.</th>
                                          <th className="pb-3 text-right">Precio Unit.</th>
                                          <th className="pb-3 text-right">Total Presup.</th>
                                          <th className="pb-3 text-right">Total Real</th>
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-slate-50 dark:divide-slate-700/50">
                                        {(item.materials || []).map((m: any, idx: number) => {
                                          const mRealCost = itemTransactions
                                            .filter(t => t.description?.toLowerCase().includes(m.name.toLowerCase()))
                                            .reduce((s, t) => s + t.amount, 0);
                                          
                                          return (
                                            <tr key={idx} className="hover:bg-slate-50/50 dark:hover:bg-slate-700/30 transition-colors">
                                              <td className="py-3 font-medium text-slate-700 dark:text-slate-300">{m.name}</td>
                                              <td className="py-3 text-right text-slate-600 dark:text-slate-400">{m.quantity} {m.unit}</td>
                                              <td className="py-3 text-right text-slate-600 dark:text-slate-400">{formatCurrency(m.unitPrice)}</td>
                                              <td className="py-3 text-right font-bold text-slate-900 dark:text-white">{formatCurrency(m.quantity * m.unitPrice)}</td>
                                              <td className={cn(
                                                "py-3 text-right font-bold",
                                                mRealCost > (m.quantity * m.unitPrice) ? "text-rose-600" : "text-emerald-600"
                                              )}>
                                                {formatCurrency(mRealCost)}
                                              </td>
                                            </tr>
                                          );
                                        })}
                                        {(item.materials || []).length === 0 && (
                                          <tr>
                                            <td colSpan={5} className="py-4 text-center text-slate-400 dark:text-slate-500 italic">No hay materiales asociados</td>
                                          </tr>
                                        )}
                                      </tbody>
                                    </table>
                                  </div>
                                </div>

                                {/* Labor Table */}
                                <div className="space-y-4">
                                  <h5 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                                    <HardHat size={16} className="text-primary" />
                                    Desglose de Mano de Obra
                                  </h5>
                                  <div className="overflow-x-auto">
                                    <table className="w-full text-left text-sm">
                                      <thead>
                                        <tr className="text-slate-400 dark:text-slate-500 uppercase text-[10px] font-bold tracking-wider border-b border-slate-100 dark:border-slate-700">
                                          <th className="pb-3">Descripción</th>
                                          <th className="pb-3 text-right">Cantidad</th>
                                          <th className="pb-3 text-right">Precio Unit.</th>
                                          <th className="pb-3 text-right">Total</th>
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-slate-50 dark:divide-slate-700/50">
                                        {(item.labor || []).map((l: any, idx: number) => (
                                          <tr key={idx} className="hover:bg-slate-50/50 dark:hover:bg-slate-700/30 transition-colors">
                                            <td className="py-3 font-medium text-slate-700 dark:text-slate-300">{l.name}</td>
                                            <td className="py-3 text-right text-slate-600 dark:text-slate-400">{l.quantity} {l.unit}</td>
                                            <td className="py-3 text-right text-slate-600 dark:text-slate-400">{formatCurrency(l.unitPrice)}</td>
                                            <td className="py-3 text-right font-bold text-slate-900 dark:text-white">{formatCurrency(l.quantity * l.unitPrice)}</td>
                                          </tr>
                                        ))}
                                        {(item.labor || []).length === 0 && (
                                          <tr>
                                            <td colSpan={4} className="py-4 text-center text-slate-400 dark:text-slate-500 italic">No hay mano de obra asociada</td>
                                          </tr>
                                        )}
                                      </tbody>
                                    </table>
                                  </div>
                                </div>

                                {/* Transactions Breakdown */}
                                <div className="pt-6 border-t border-slate-100 dark:border-slate-700">
                                  <h5 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2 mb-4">
                                    <HandCoins size={16} className="text-primary" />
                                    Transacciones Vinculadas
                                  </h5>
                                  {itemTransactions.length > 0 ? (
                                    <div className="space-y-2">
                                      {itemTransactions.map(t => (
                                        <div key={t.id} className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-slate-100 dark:border-slate-700 text-xs">
                                          <div className="flex items-center gap-3">
                                            <div className={cn(
                                              "w-2 h-2 rounded-full",
                                              t.type === 'Income' ? "bg-emerald-500" : "bg-rose-500"
                                            )} />
                                            <div>
                                              <p className="font-bold text-slate-900 dark:text-white">{t.description || t.category}</p>
                                              <p className="text-[10px] text-slate-500 dark:text-slate-400">{formatDate(t.date)}</p>
                                            </div>
                                          </div>
                                          <p className={cn(
                                            "font-bold",
                                            t.type === 'Income' ? "text-emerald-600" : "text-rose-600"
                                          )}>
                                            {t.type === 'Income' ? '+' : '-'}{formatCurrency(t.amount)}
                                          </p>
                                        </div>
                                      ))}
                                    </div>
                                  ) : (
                                    <p className="text-xs text-slate-400 dark:text-slate-500 italic py-2">No hay transacciones vinculadas a este renglón</p>
                                  )}
                                </div>

                                {/* Subtasks */}
                                <div className="pt-6 border-t border-slate-100 dark:border-slate-700">
                                  <div className="flex items-center justify-between mb-4">
                                    <h5 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                                      <CheckSquare size={16} className="text-primary" />
                                      Subtareas y Avance
                                    </h5>
                                    <button 
                                      onClick={() => {
                                        setSelectedBudgetItem(item);
                                        setIsSubtaskModalOpen(true);
                                      }}
                                      className="p-2 bg-primary/10 text-primary rounded-lg hover:bg-primary/20 transition-colors"
                                    >
                                      <Plus size={16} />
                                    </button>
                                  </div>
                                  
                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    {(item.subtasks || []).map((st: any) => (
                                      <div key={st.id} className="p-3 bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-slate-100 dark:border-slate-700">
                                        <div className="flex items-center justify-between mb-2">
                                          <div>
                                            <div className="flex items-center gap-1.5">
                                              <p className="text-sm font-bold text-slate-900 dark:text-white">{st.name}</p>
                                              {st.status === 'Completed' && (
                                                <motion.div
                                                  initial={{ scale: 0, opacity: 0 }}
                                                  animate={{ scale: 1, opacity: 1 }}
                                                  transition={{ type: "spring", stiffness: 300, damping: 20 }}
                                                >
                                                  <CheckCircle2 size={14} className="text-emerald-500" />
                                                </motion.div>
                                              )}
                                            </div>
                                            <p className="text-[10px] text-slate-500 dark:text-slate-400">Resp: {st.responsible}</p>
                                          </div>
                                          <div className="flex items-center gap-2">
                                            <select 
                                              value={st.status}
                                              onChange={(e) => handleUpdateSubtask(item.id, st.id, { status: e.target.value })}
                                              className="text-[10px] font-bold px-2 py-1 rounded bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 dark:text-white"
                                            >
                                              <option value="Pending">Pendiente</option>
                                              <option value="In Progress">En Proceso</option>
                                              <option value="Completed">Completado</option>
                                            </select>
                                            <button 
                                              onClick={() => handleDeleteSubtask(item.id, st.id)}
                                              className="p-1 text-slate-400 hover:text-rose-600 transition-colors"
                                            >
                                              <Trash2 size={14} />
                                            </button>
                                          </div>
                                        </div>
                                        <div className="space-y-1.5">
                                          <div className="flex items-center gap-3">
                                            <input 
                                              type="range" 
                                              min="0" 
                                              max="100" 
                                              value={st.progress}
                                              onChange={(e) => handleUpdateSubtask(item.id, st.id, { progress: Number(e.target.value) })}
                                              className="flex-1 h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full appearance-none cursor-pointer accent-primary"
                                            />
                                            <span className="text-[10px] font-bold text-slate-600 dark:text-slate-400 w-8">{(st.progress || 0).toFixed(1)}%</span>
                                          </div>
                                          <div className="h-1 w-full bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                                            <motion.div 
                                              className={cn(
                                                "h-full rounded-full",
                                                st.status === 'Completed' ? "bg-emerald-500" : "bg-primary"
                                              )}
                                              initial={{ width: 0 }}
                                              animate={{ width: `${st.progress}%` }}
                                              transition={{ duration: 0.5, ease: "easeOut" }}
                                            />
                                          </div>
                                        </div>
                                      </div>
                                    ))}
                                    {(item.subtasks || []).length === 0 && (
                                      <p className="col-span-full text-xs text-slate-400 dark:text-slate-500 italic text-center py-2">No hay subtareas asignadas</p>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                    <HandCoins className="text-primary" size={20} />
                    Historial Completo de Transacciones
                  </h3>
                </div>
                <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
                  <table className="w-full text-left">
                    <thead className="bg-slate-50 border-b border-slate-100">
                      <tr>
                        <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase">Fecha</th>
                        <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase">Descripción</th>
                        <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase">Categoría</th>
                        <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase text-right">Monto</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {transactions.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).map(t => (
                        <tr key={t.id} className="hover:bg-slate-50 transition-colors">
                          <td className="px-6 py-4 text-sm text-slate-600">{formatDate(t.date)}</td>
                          <td className="px-6 py-4 text-sm text-slate-900 font-medium">{t.description || 'Sin descripción'}</td>
                          <td className="px-6 py-4">
                            <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-1 bg-slate-100 text-slate-600 rounded-md">
                              {t.category}
                            </span>
                          </td>
                          <td className={cn(
                            "px-6 py-4 text-sm font-bold text-right",
                            t.type === 'Income' ? "text-emerald-600" : "text-rose-600"
                          )}>
                            {t.type === 'Income' ? '+' : '-'}{formatCurrency(t.amount)}
                          </td>
                        </tr>
                      ))}
                      {transactions.length === 0 && (
                        <tr>
                          <td colSpan={4} className="px-6 py-12 text-center text-slate-400 italic">No hay transacciones registradas para este proyecto</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'audit' && (
            <div className="space-y-8">
              {/* Market Validation Section */}
              {marketValidation && (
                <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
                  <div className="p-6 border-b border-slate-50 flex items-center justify-between bg-slate-50/50">
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        "p-2 rounded-xl",
                        marketValidation.status === 'success' ? "bg-emerald-100 text-emerald-600" :
                        marketValidation.status === 'warning' ? "bg-amber-100 text-amber-600" :
                        "bg-rose-100 text-rose-600"
                      )}>
                        <ShieldCheck size={20} />
                      </div>
                      <div>
                        <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest">Validación vs Mercado</h3>
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Tipología: {project.typology}</p>
                      </div>
                    </div>
                    <div className={cn(
                      "px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest",
                      marketValidation.status === 'success' ? "bg-emerald-100 text-emerald-700" :
                      marketValidation.status === 'warning' ? "bg-amber-100 text-amber-700" :
                      "bg-rose-100 text-rose-700"
                    )}>
                      {marketValidation.status === 'success' ? 'Validado' : 
                       marketValidation.status === 'warning' ? 'Desviación Moderada' : 'Desviación Crítica'}
                    </div>
                  </div>
                  <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="space-y-1">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Costo m² Proyecto</p>
                      <p className="text-xl font-black text-slate-900">{formatCurrency(marketValidation.currentPrice)}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Promedio Mercado</p>
                      <p className="text-xl font-black text-slate-900">{formatCurrency(marketValidation.marketPrice)}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Desviación Total</p>
                      <p className={cn(
                        "text-xl font-black",
                        marketValidation.status === 'success' ? "text-emerald-600" :
                        marketValidation.status === 'warning' ? "text-amber-600" :
                        "text-rose-600"
                      )}>
                        {marketValidation.deviation > 0 ? '+' : ''}{marketValidation.deviation.toFixed(1)}%
                      </p>
                    </div>
                  </div>
                  {marketValidation.status !== 'success' && (
                    <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex items-start gap-3">
                      <AlertTriangle className="text-amber-500 shrink-0 mt-0.5" size={16} />
                      <p className="text-xs text-slate-600 font-medium leading-relaxed">
                        El presupuesto total presenta una desviación significativa respecto a los valores de mercado para proyectos de tipo {project.typology}. 
                        Se recomienda revisar los análisis de precios unitarios (APU) y los rendimientos de mano de obra.
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Budget Audit Section */}
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                    <Calculator className="text-primary" size={20} />
                    Auditoría de Renglones vs Gastos Reales
                  </h3>
                  <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-100 rounded-xl">
                    <div className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
                    <span className="text-[10px] font-black text-slate-600 uppercase tracking-widest">
                      {budgetAudit.filter(i => i.deviation > 15).length} Desviaciones Críticas
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4">
                  {budgetAudit.map((item) => (
                    <div 
                      key={item.id}
                      className={cn(
                        "bg-white rounded-3xl border transition-all duration-300 overflow-hidden",
                        item.deviation > 15 ? "border-rose-200 shadow-lg shadow-rose-500/5" : "border-slate-100"
                      )}
                    >
                      <div className="p-6">
                        <div className="flex flex-col md:flex-row justify-between gap-4 mb-6">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <h4 className="font-black text-slate-900">{item.description}</h4>
                              {item.deviation > 15 && (
                                <span className="px-2 py-0.5 bg-rose-100 text-rose-700 text-[9px] font-black uppercase tracking-widest rounded-md">
                                  Alerta &gt; 15%
                                </span>
                              )}
                            </div>
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                              {item.category} • {item.quantity} {item.unit}
                            </p>
                          </div>
                          <div className="flex items-center gap-6">
                            <div className="text-right">
                              <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Presupuestado</p>
                              <p className="text-sm font-black text-slate-900">{formatCurrency(item.budgetedCost)}</p>
                            </div>
                            <div className="text-right">
                              <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Gastado Real</p>
                              <p className={cn(
                                "text-sm font-black",
                                item.actualCost > item.budgetedCost ? "text-rose-600" : "text-emerald-600"
                              )}>
                                {formatCurrency(item.actualCost)}
                              </p>
                            </div>
                            <div className="text-right min-w-[80px]">
                              <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Desviación</p>
                              <p className={cn(
                                "text-sm font-black",
                                item.deviation > 15 ? "text-rose-600" : 
                                item.deviation > 0 ? "text-amber-600" : "text-emerald-600"
                              )}>
                                {item.deviation > 0 ? '+' : ''}{item.deviation.toFixed(1)}%
                              </p>
                            </div>
                          </div>
                        </div>

                        {/* Progress Bar */}
                        <div className="space-y-2 mb-6">
                          <div className="flex justify-between items-center">
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Uso del Presupuesto</span>
                            <span className="text-[10px] font-black text-slate-900">{((item.actualCost / (item.budgetedCost || 1)) * 100).toFixed(1)}%</span>
                          </div>
                          <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                            <motion.div 
                              className={cn(
                                "h-full rounded-full",
                                item.deviation > 15 ? "bg-rose-500" : 
                                item.deviation > 0 ? "bg-amber-500" : "bg-emerald-500"
                              )}
                              initial={{ width: 0 }}
                              animate={{ width: `${Math.min((item.actualCost / (item.budgetedCost || 1)) * 100, 100)}%` }}
                              transition={{ duration: 1, ease: "easeOut" }}
                            />
                          </div>
                        </div>

                        {/* Mitigation Suggestions */}
                        {item.deviation > 15 && (
                          <div className="bg-rose-50/50 rounded-2xl p-4 border border-rose-100">
                            <div className="flex items-center gap-2 mb-3">
                              <Lightbulb className="text-rose-500" size={16} />
                              <h5 className="text-[10px] font-black text-rose-900 uppercase tracking-widest">Acciones de Mitigación Sugeridas</h5>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                              {item.suggestions.map((suggestion, sIdx) => (
                                <div key={sIdx} className="flex items-center gap-2 text-xs text-rose-700 font-medium">
                                  <div className="w-1 h-1 rounded-full bg-rose-400" />
                                  {suggestion}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Audit Logs Section */}
              <div className="space-y-6 pt-8 border-t border-slate-100">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                    <History className="text-primary" size={20} />
                    Registro de Cambios (Audit Trail)
                  </h3>
                </div>
                <div className="bg-white rounded-3xl border border-slate-100 overflow-hidden shadow-sm">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50/50 border-b border-slate-100">
                        <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Fecha</th>
                        <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Usuario</th>
                        <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Campo</th>
                        <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Anterior</th>
                        <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Nuevo</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {auditLogs.map(log => (
                        <tr key={log.id} className="hover:bg-slate-50/50 transition-colors">
                          <td className="px-6 py-4 text-xs text-slate-600 font-medium">
                            {log.timestamp ? formatDate(log.timestamp) : 'Reciente'}
                          </td>
                          <td className="px-6 py-4">
                            <p className="text-xs font-bold text-slate-900">{log.userEmail || log.userName || 'Usuario'}</p>
                          </td>
                          <td className="px-6 py-4">
                            <span className="px-2 py-1 bg-primary/10 text-primary text-[10px] font-black uppercase tracking-widest rounded-md">
                              {log.action}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-xs text-slate-500 font-medium" colSpan={2}>{log.details}</td>
                        </tr>
                      ))}
                      {auditLogs.length === 0 && (
                        <tr>
                          <td colSpan={5} className="px-6 py-12 text-center text-slate-400 italic font-medium">
                            No hay registros de cambios para este proyecto
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'logbook' && (
            <div className="space-y-6">
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
                <div>
                  <h3 className="text-lg font-bold text-slate-900">Bitácora Diaria de Obra</h3>
                  <p className="text-sm text-slate-500">Registro de actividades, clima y personal en campo</p>
                </div>
                {(() => {
                  const client = clients.find(c => c.id === project.clientUid);
                  return client ? (
                    <div className="flex items-center gap-3 px-4 py-2 bg-slate-50 rounded-xl border border-slate-100">
                      <div className="p-2 bg-white rounded-lg text-primary shadow-sm">
                        <Users size={16} />
                      </div>
                      <div>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Cliente Responsable</p>
                        <p className="text-sm font-bold text-slate-700">{client.name}</p>
                      </div>
                    </div>
                  ) : null;
                })()}
                <button 
                  onClick={() => setIsLogbookModalOpen(true)}
                  className="flex items-center gap-2 bg-primary text-white px-4 py-2 rounded-xl font-bold hover:bg-primary-hover transition-all shadow-md"
                >
                  <Plus size={18} />
                  Nueva Entrada
                </button>
              </div>

              <div className="space-y-4">
                {logbookEntries.length === 0 ? (
                  <div className="text-center py-12 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                    <History className="mx-auto text-slate-300 mb-4" size={48} />
                    <p className="text-slate-500 font-medium">No hay registros en la bitácora aún</p>
                    <button 
                      onClick={() => setIsLogbookModalOpen(true)}
                      className="mt-4 text-primary font-bold hover:underline"
                    >
                      Crear el primer registro
                    </button>
                  </div>
                ) : (
                  logbookEntries.map((entry) => (
                    <motion.div 
                      key={entry.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-all group"
                    >
                      <div className="flex justify-between items-start mb-4">
                        <div className="flex items-center gap-4">
                          <div className="bg-primary/10 p-3 rounded-xl text-primary">
                            <Calendar size={20} />
                          </div>
                          <div>
                            <p className="font-bold text-slate-900">{formatDate(entry.date)}</p>
                            <div className="flex items-center gap-3 text-xs text-slate-500 mt-1">
                              <span className="flex items-center gap-1">
                                <Cloud size={14} className="text-sky-500" />
                                {entry.weather}
                              </span>
                              <span className="flex items-center gap-1">
                                <Users size={14} className="text-indigo-500" />
                                {entry.workersCount} Trabajadores
                              </span>
                            </div>
                          </div>
                        </div>
                        <button 
                          onClick={() => handleDeleteLogEntry(entry.id)}
                          className="p-2 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                      <div className="prose prose-slate max-w-none">
                        <p className="text-slate-700 whitespace-pre-wrap">{entry.content}</p>
                      </div>
                      {entry.photos && entry.photos.length > 0 && (
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
                          {entry.photos.map((photo: string, idx: number) => (
                            <img 
                              key={idx} 
                              src={photo} 
                              alt={`Obra ${idx}`} 
                              className="w-full h-32 object-cover rounded-xl border border-slate-200"
                              referrerPolicy="no-referrer"
                            />
                          ))}
                        </div>
                      )}
                      <div className="mt-4 pt-4 border-t border-slate-50 flex justify-between items-center text-[10px] text-slate-400 uppercase tracking-widest font-bold">
                        <span>Registrado por: {entry.authorEmail}</span>
                        <span>{entry.createdAt?.toDate ? formatDate(entry.createdAt.toDate().toISOString()) : 'Recién añadido'}</span>
                      </div>
                    </motion.div>
                  ))
                )}
              </div>

              {/* Logbook Entry Modal */}
              <AnimatePresence>
                {isLogbookModalOpen && (
                  <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
                    <motion.div 
                      initial={{ scale: 0.95, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0.95, opacity: 0 }}
                      className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden border border-white/20"
                    >
                      <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                        <div className="flex items-center gap-3">
                          <div className="bg-primary p-2 rounded-xl text-white shadow-lg shadow-primary/20">
                            <History size={20} />
                          </div>
                          <h3 className="text-xl font-bold text-slate-900">Nueva Entrada de Bitácora</h3>
                        </div>
                        <button onClick={() => setIsLogbookModalOpen(false)} className="p-2 hover:bg-slate-100 rounded-xl transition-all">
                          <X size={20} className="text-slate-400" />
                        </button>
                      </div>

                      <form onSubmit={handleAddLogEntry} className="p-6 space-y-6 max-h-[70vh] overflow-y-auto custom-scrollbar">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          <div className="space-y-2">
                            <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Fecha</label>
                            <input 
                              type="date"
                              required
                              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary transition-all"
                              value={newLogEntry.date}
                              onChange={(e) => setNewLogEntry({...newLogEntry, date: e.target.value})}
                            />
                          </div>
                          <div className="space-y-2">
                            <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Clima</label>
                            <select 
                              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary transition-all"
                              value={newLogEntry.weather}
                              onChange={(e) => setNewLogEntry({...newLogEntry, weather: e.target.value})}
                            >
                              <option value="Soleado">☀️ Soleado</option>
                              <option value="Nublado">☁️ Nublado</option>
                              <option value="Lluvia Ligera">🌦️ Lluvia Ligera</option>
                              <option value="Lluvia Fuerte">🌧️ Lluvia Fuerte</option>
                              <option value="Tormenta">⛈️ Tormenta</option>
                            </select>
                          </div>
                        </div>

                        <div className="space-y-2">
                          <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Personal en Campo (Trabajadores)</label>
                          <div className="flex items-center gap-4">
                            <input 
                              type="range"
                              min="0"
                              max="100"
                              className="flex-1 accent-primary"
                              value={newLogEntry.workersCount}
                              onChange={(e) => setNewLogEntry({...newLogEntry, workersCount: Number(e.target.value)})}
                            />
                            <span className="bg-primary/10 text-primary px-3 py-1 rounded-lg font-bold min-w-[3rem] text-center">
                              {newLogEntry.workersCount}
                            </span>
                          </div>
                        </div>

                        <div className="space-y-2">
                          <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Actividades y Observaciones</label>
                          <textarea 
                            required
                            rows={6}
                            placeholder="Describa los avances del día, materiales recibidos, problemas encontrados..."
                            className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary transition-all resize-none"
                            value={newLogEntry.content}
                            onChange={(e) => setNewLogEntry({...newLogEntry, content: e.target.value})}
                          />
                        </div>

                        <div className="space-y-2">
                          <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Fotos de la Obra</label>
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <div className="relative group aspect-square">
                              <input 
                                type="file"
                                id="logbook-photo-upload"
                                className="hidden"
                                accept="image/*"
                                onChange={handleLogbookPhotoUpload}
                                disabled={isUploading}
                              />
                              <label 
                                htmlFor="logbook-photo-upload"
                                className={cn(
                                  "w-full h-full border-2 border-dashed border-slate-200 rounded-2xl flex flex-col items-center justify-center gap-2 hover:border-primary hover:bg-primary/5 transition-all cursor-pointer",
                                  isUploading && "opacity-50 cursor-not-allowed"
                                )}
                              >
                                {isUploading ? (
                                  <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                                ) : (
                                  <ImageIcon size={24} className="text-slate-300" />
                                )}
                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                                  {isUploading ? 'Subiendo...' : 'Añadir Foto'}
                                </span>
                              </label>
                            </div>
                            {newLogEntry.photos.map((url, i) => (
                              <div key={i} className="relative group aspect-square">
                                <img src={url} className="w-full h-full object-cover rounded-2xl border border-slate-200" referrerPolicy="no-referrer" />
                                <button 
                                  type="button"
                                  onClick={() => setNewLogEntry({...newLogEntry, photos: newLogEntry.photos.filter((_, idx) => idx !== i)})}
                                  className="absolute -top-2 -right-2 bg-rose-500 text-white rounded-full p-1 shadow-lg opacity-0 group-hover:opacity-100 transition-all"
                                >
                                  <X size={12} />
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>

                        <div className="flex gap-4 pt-4">
                          <button 
                            type="submit"
                            disabled={isSubmitting}
                            className="flex-1 bg-primary text-white py-4 rounded-2xl font-bold hover:bg-primary-hover transition-all shadow-lg shadow-primary/20 disabled:opacity-50"
                          >
                            {isSubmitting ? 'Guardando...' : 'Guardar Registro'}
                          </button>
                          <button 
                            type="button"
                            onClick={() => setIsLogbookModalOpen(false)}
                            className="flex-1 bg-slate-100 text-slate-600 py-4 rounded-2xl font-bold hover:bg-slate-200 transition-all"
                          >
                            Cancelar
                          </button>
                        </div>
                      </form>
                    </motion.div>
                  </div>
                )}
              </AnimatePresence>
            </div>
          )}

          {activeTab === 'map' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                  <MapIcon className="text-primary" size={20} />
                  Mapa Interactivo y Puntos de Interés
                </h3>
                <div className="flex items-center gap-4">
                  <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
                    <button
                      onClick={() => setMapType('standard')}
                      className={cn(
                        "px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all",
                        mapType === 'standard' ? "bg-white dark:bg-slate-700 text-primary shadow-sm" : "text-slate-400 hover:text-slate-600"
                      )}
                    >
                      Estándar
                    </button>
                    <button
                      onClick={() => setMapType('satellite')}
                      className={cn(
                        "px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all",
                        mapType === 'satellite' ? "bg-white dark:bg-slate-700 text-primary shadow-sm" : "text-slate-400 hover:text-slate-600"
                      )}
                    >
                      Satélite
                    </button>
                  </div>
                  <p className="text-xs text-slate-500 italic">Haz clic en el mapa para añadir un punto de interés</p>
                </div>
              </div>
              
              <div className="h-[600px] rounded-3xl overflow-hidden border border-slate-100 shadow-inner relative z-10">
                <MapContainer center={mapCenter} zoom={13} style={{ height: '100%', width: '100%' }}>
                  {mapType === 'standard' ? (
                    <TileLayer
                      url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                      attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                    />
                  ) : (
                    <TileLayer
                      attribution='Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
                      url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                    />
                  )}
                  <MapClickHandler onMapClick={(lat, lng) => {
                    handleAddPoi(lat, lng);
                  }} />
                  
                  {/* Project Main Location */}
                  {project.coordinates && (
                    <Marker position={[project.coordinates.lat, project.coordinates.lng]}>
                      <Popup>
                        <div className="p-2">
                          <h4 className="font-bold text-primary">{project.name}</h4>
                          <p className="text-xs text-slate-600">{project.location}</p>
                        </div>
                      </Popup>
                    </Marker>
                  )}

                  {/* Points of Interest */}
                  {pois.map((poi, idx) => (
                    <Marker key={idx} position={[poi.lat, poi.lng]}>
                      <Popup>
                        <div className="p-2 min-w-[150px]">
                          <div className="flex justify-between items-start mb-2">
                            <h4 className="font-bold text-slate-900">{poi.name}</h4>
                            <div className="flex gap-2">
                              <button 
                                onClick={() => handleEditPoi(idx)}
                                className="text-primary hover:text-primary-hover transition-colors"
                              >
                                <Edit2 size={14} />
                              </button>
                              <button 
                                onClick={() => handleDeletePoi(idx)}
                                className="text-rose-500 hover:text-rose-700 transition-colors"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </div>
                          <p className="text-xs text-slate-600">{poi.comment}</p>
                        </div>
                      </Popup>
                    </Marker>
                  ))}
                </MapContainer>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {pois.map((poi, idx) => (
                      <div key={idx} className="p-4 bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 shadow-sm flex justify-between items-start">
                        <div>
                          <h4 className="font-bold text-slate-900 dark:text-white text-sm">{poi.name}</h4>
                          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{poi.comment}</p>
                        </div>
                        <div className="flex gap-1">
                          <button 
                            onClick={() => handleEditPoi(idx)}
                            className="p-2 text-slate-400 hover:text-primary transition-colors"
                          >
                            <Edit2 size={16} />
                          </button>
                          <button 
                            onClick={() => handleDeletePoi(idx)}
                            className="p-2 text-slate-400 hover:text-rose-600 transition-colors"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>
                ))}
                {pois.length === 0 && (
                  <div className="col-span-full p-8 text-center bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                    <p className="text-sm text-slate-400">No hay puntos de interés registrados. Haz clic en el mapa para añadir uno.</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'tasks' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <ListTodo className="text-primary" size={20} />
                  Tareas del Proyecto
                </h3>
                <button
                  onClick={() => setShowTaskForm(true)}
                  className="flex items-center gap-2 bg-primary text-white px-4 py-2 rounded-xl font-bold hover:bg-primary-hover transition-all shadow-md text-xs uppercase tracking-widest"
                >
                  <Plus size={16} /> Nueva Tarea
                </button>
              </div>

              <AnimatePresence>
                {showTaskForm && (
                  <motion.div
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    className="bg-slate-50 dark:bg-slate-800 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 space-y-4"
                  >
                    <input
                      value={taskForm.title}
                      onChange={e => setTaskForm(f => ({ ...f, title: e.target.value }))}
                      placeholder="Título de la tarea *"
                      className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm font-semibold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                    <div className="grid grid-cols-2 gap-3">
                      <select
                        value={taskForm.priority}
                        onChange={e => setTaskForm(f => ({ ...f, priority: e.target.value as Task['priority'] }))}
                        className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold text-slate-700 dark:text-slate-200 focus:outline-none"
                      >
                        <option value="low">Prioridad Baja</option>
                        <option value="medium">Prioridad Media</option>
                        <option value="high">Prioridad Alta</option>
                      </select>
                      <input
                        type="date"
                        value={taskForm.dueDate}
                        onChange={e => setTaskForm(f => ({ ...f, dueDate: e.target.value }))}
                        className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold text-slate-700 dark:text-slate-200 focus:outline-none"
                      />
                    </div>
                    <input
                      value={taskForm.assigneeName}
                      onChange={e => setTaskForm(f => ({ ...f, assigneeName: e.target.value }))}
                      placeholder="Responsable (nombre)"
                      className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => { setShowTaskForm(false); setTaskForm({ title: '', priority: 'medium', dueDate: '', assigneeName: '' }); }}
                        className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-black uppercase tracking-wider text-slate-600 dark:text-slate-300"
                      >
                        Cancelar
                      </button>
                      <button
                        disabled={savingTask}
                        onClick={async () => {
                          if (!taskForm.title.trim()) { toast.error('El título es obligatorio'); return; }
                          setSavingTask(true);
                          try {
                            const created = await createTask({
                              title: taskForm.title.trim(),
                              priority: taskForm.priority,
                              projectId,
                              dueDate: taskForm.dueDate || undefined,
                              assigneeName: taskForm.assigneeName.trim() || undefined,
                            });
                            setProjectTasks(prev => [created, ...prev]);
                            setShowTaskForm(false);
                            setTaskForm({ title: '', priority: 'medium', dueDate: '', assigneeName: '' });
                            toast.success('Tarea creada');
                          } catch { toast.error('No se pudo crear la tarea'); }
                          finally { setSavingTask(false); }
                        }}
                        className="px-4 py-2 rounded-xl bg-primary text-white text-xs font-black uppercase tracking-wider hover:bg-primary-hover disabled:opacity-50"
                      >
                        {savingTask ? 'Guardando...' : 'Crear'}
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {projectTasks.length === 0 ? (
                <div className="text-center py-12 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-dashed border-slate-200 dark:border-slate-700">
                  <ListTodo className="mx-auto text-slate-300 mb-3" size={40} />
                  <p className="text-sm text-slate-400 font-medium">No hay tareas para este proyecto</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {projectTasks.map(task => {
                    const isOverdue = task.dueDate && task.status !== 'done' && task.status !== 'cancelled' && new Date(task.dueDate + 'T00:00:00') < new Date();
                    const STATUS_COLORS: Record<TaskStatus, string> = {
                      pending: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
                      in_progress: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
                      done: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
                      cancelled: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300',
                    };
                    const STATUS_LABELS: Record<TaskStatus, string> = { pending: 'Pendiente', in_progress: 'En Progreso', done: 'Completada', cancelled: 'Cancelada' };
                    return (
                      <div key={task.id} className={cn('flex items-start gap-3 p-4 rounded-2xl border bg-white dark:bg-slate-900 border-slate-100 dark:border-slate-800 hover:border-primary/30 transition-all group', task.status === 'done' && 'opacity-60')}>
                        <button
                          onClick={async () => {
                            const next: TaskStatus = task.status === 'done' ? 'pending' : 'done';
                            const updated = await updateTask(task.id, { status: next });
                            setProjectTasks(prev => prev.map(t => t.id === task.id ? updated : t));
                          }}
                          className="mt-0.5 shrink-0 text-slate-300 hover:text-primary dark:text-slate-600 dark:hover:text-primary transition-colors"
                        >
                          {task.status === 'done' ? <CheckCircle2 size={20} className="text-emerald-500" /> : task.status === 'in_progress' ? <Clock size={20} className="text-blue-500" /> : <Circle size={20} />}
                        </button>
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2 mb-1">
                            <p className={cn('text-sm font-black text-slate-900 dark:text-white truncate', task.status === 'done' && 'line-through')}>{task.title}</p>
                            <span className={cn('text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full', STATUS_COLORS[task.status as TaskStatus])}>{STATUS_LABELS[task.status as TaskStatus]}</span>
                          </div>
                          <div className="flex flex-wrap gap-3 text-[10px] text-slate-400 dark:text-slate-500 font-semibold">
                            {task.assigneeName && <span>👤 {task.assigneeName}</span>}
                            {task.dueDate && <span className={cn(isOverdue && 'text-rose-500 font-black')}>📅 {new Date(task.dueDate + 'T00:00:00').toLocaleDateString('es-GT')}{isOverdue ? ' · Vencida' : ''}</span>}
                          </div>
                        </div>
                        <select
                          value={task.status}
                          onChange={async e => {
                            const updated = await updateTask(task.id, { status: e.target.value as TaskStatus });
                            setProjectTasks(prev => prev.map(t => t.id === task.id ? updated : t));
                          }}
                          className="shrink-0 text-[10px] font-black px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 focus:outline-none"
                        >
                          <option value="pending">Pendiente</option>
                          <option value="in_progress">En Progreso</option>
                          <option value="done">Completada</option>
                          <option value="cancelled">Cancelada</option>
                        </select>
                        <button
                          onClick={async () => {
                            await deleteTask(task.id);
                            setProjectTasks(prev => prev.filter(t => t.id !== task.id));
                            toast.success('Tarea eliminada');
                          }}
                          className="shrink-0 p-1.5 text-slate-300 hover:text-rose-500 dark:text-slate-600 dark:hover:text-rose-400 transition-colors opacity-0 group-hover:opacity-100"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {activeTab === 'risk' && (
            <div className="space-y-8">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                  <AlertTriangle className="text-rose-600" size={20} />
                  Análisis de Riesgo y Desviaciones
                </h3>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Physical vs Financial Progress */}
                <div className="p-6 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm space-y-6">
                  <h4 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-widest">Avance Físico vs Financiero</h4>
                  {(() => {
                    const physical = project.physicalProgress || 0;
                    const financial = project.budget > 0 ? (project.spent / project.budget) * 100 : 0;
                    const deviation = financial - physical;
                    const isAlert = deviation > 15;

                    return (
                      <div className="space-y-6">
                        <div className="grid grid-cols-2 gap-4">
                          <div className="p-4 bg-slate-100 dark:bg-slate-800 rounded-2xl border border-slate-300 dark:border-slate-600">
                            <p className="text-[10px] font-black text-slate-600 dark:text-slate-300 uppercase tracking-widest mb-1">Físico</p>
                            <p className="text-2xl font-black text-slate-900 dark:text-white">{physical.toFixed(1)}%</p>
                          </div>
                          <div className="p-4 bg-slate-100 dark:bg-slate-800 rounded-2xl border border-slate-300 dark:border-slate-600">
                            <p className="text-[10px] font-black text-slate-600 dark:text-slate-300 uppercase tracking-widest mb-1">Financiero</p>
                            <p className="text-2xl font-black text-slate-900 dark:text-white">{financial.toFixed(1)}%</p>
                          </div>
                        </div>

                        <div className={cn(
                          "p-4 rounded-2xl border flex items-center gap-4",
                          isAlert ? "bg-rose-50 border-rose-100 text-rose-700" : "bg-emerald-50 border-emerald-100 text-emerald-700"
                        )}>
                          <div className={cn(
                            "p-3 rounded-xl",
                            isAlert ? "bg-rose-600 text-white" : "bg-emerald-600 text-white"
                          )}>
                            {isAlert ? <AlertCircle size={24} /> : <CheckCircle2 size={24} />}
                          </div>
                          <div>
                            <p className="text-sm font-black uppercase tracking-widest">Desviación: {deviation.toFixed(1)}%</p>
                            <p className="text-xs opacity-80">
                              {isAlert 
                                ? "Alerta: El gasto financiero supera significativamente el avance físico." 
                                : "El proyecto mantiene una relación saludable entre gasto y avance."}
                            </p>
                          </div>
                        </div>

                        {isAlert && (
                          <div className="space-y-3">
                            <p className="text-[10px] font-black text-rose-600 uppercase tracking-widest">Acciones de Mitigación Sugeridas</p>
                            <ul className="space-y-2">
                              {getMitigationSuggestions(deviation).map((action, idx) => (
                                <li key={idx} className="flex items-start gap-2 text-xs text-slate-700 dark:text-slate-200">
                                  <div className="mt-1.5 w-1.5 h-1.5 rounded-full bg-rose-400 shrink-0" />
                                  {action}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>

                {/* Typology Budget Comparison */}
                <div className="p-6 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm space-y-6">
                  <h4 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-widest">Estimación por Tipología (M2)</h4>
                  {(() => {
                    const TYPOLOGY_COSTS: Record<string, number> = {
                      'RESIDENCIAL': 4500,
                      'COMERCIAL': 6000,
                      'INDUSTRIAL': 5500,
                      'CIVIL': 8000,
                      'PUBLICA': 7000,
                      'SALUD': 9000,
                      'EDUCACION': 5000,
                      'DEPORTIVA': 4000,
                      'INFRAESTRUCTURA': 10000,
                      'TURISMO': 7500
                    };
                    const area = project.area || 0;
                    const typology = project.typology || 'RESIDENCIAL';
                    const estimatedCostPerM2 = TYPOLOGY_COSTS[typology] || 4500;
                    const estimatedTotal = area * estimatedCostPerM2;
                    const actualTotal = project.budget || 0;
                    const deviation = actualTotal > 0 ? ((actualTotal - estimatedTotal) / estimatedTotal) * 100 : 0;
                    const isHighDeviation = Math.abs(deviation) > 15;

                    return (
                      <div className="space-y-6">
                        <div className="grid grid-cols-2 gap-4">
                          <div className="p-4 bg-slate-100 dark:bg-slate-800 rounded-2xl border border-slate-300 dark:border-slate-600">
                            <p className="text-[10px] font-black text-slate-600 dark:text-slate-300 uppercase tracking-widest mb-1">Área (M2)</p>
                            <p className="text-2xl font-black text-slate-900 dark:text-white">{area.toLocaleString()} m²</p>
                          </div>
                          <div className="p-4 bg-slate-100 dark:bg-slate-800 rounded-2xl border border-slate-300 dark:border-slate-600">
                            <p className="text-[10px] font-black text-slate-600 dark:text-slate-300 uppercase tracking-widest mb-1">Costo Est. / M2</p>
                            <p className="text-2xl font-black text-slate-900 dark:text-white">{formatCurrency(estimatedCostPerM2)}</p>
                          </div>
                        </div>

                        <div className="space-y-4">
                          <div className="flex justify-between items-end">
                            <div>
                              <p className="text-[10px] font-black text-slate-600 dark:text-slate-300 uppercase tracking-widest">Presupuesto Estimado</p>
                              <p className="text-lg font-black text-slate-800 dark:text-slate-100">{formatCurrency(estimatedTotal)}</p>
                            </div>
                            <div className="text-right">
                              <p className="text-[10px] font-black text-slate-600 dark:text-slate-300 uppercase tracking-widest">Presupuesto Actual</p>
                              <p className="text-lg font-black text-primary">{formatCurrency(actualTotal)}</p>
                            </div>
                          </div>

                          <div className={cn(
                            "p-4 rounded-2xl border flex items-center gap-4",
                            isHighDeviation ? "bg-amber-50 border-amber-100 text-amber-700" : "bg-emerald-50 border-emerald-100 text-emerald-700"
                          )}>
                            <div className={cn(
                              "p-3 rounded-xl",
                              isHighDeviation ? "bg-amber-600 text-white" : "bg-emerald-600 text-white"
                            )}>
                              {isHighDeviation ? <TrendingUp size={24} /> : <CheckCircle2 size={24} />}
                            </div>
                            <div>
                              <p className="text-sm font-black uppercase tracking-widest">Variación: {deviation > 0 ? '+' : ''}{deviation.toFixed(1)}%</p>
                              <p className="text-xs opacity-80">
                                {isHighDeviation 
                                  ? `Desviación significativa respecto al estándar de ${typology.toLowerCase()}.` 
                                  : "El presupuesto se encuentra dentro de los rangos esperados para esta tipología."}
                              </p>
                            </div>
                          </div>
                        </div>

                        {isHighDeviation && (
                          <div className="space-y-3">
                            <p className="text-[10px] font-black text-amber-600 uppercase tracking-widest">Acciones Sugeridas</p>
                            <ul className="space-y-2">
                              {[
                                "Revisar especificaciones técnicas de materiales de lujo o especiales.",
                                "Validar si el área incluye obras exteriores o parqueos.",
                                "Comparar con proyectos similares de la misma tipología.",
                                "Ajustar el factor de costos indirectos si es necesario."
                              ].map((action, idx) => (
                                <li key={idx} className="flex items-start gap-2 text-xs text-slate-700 dark:text-slate-200">
                                  <div className="mt-1.5 w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
                                  {action}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'audit' && (
            <div className="space-y-6">
              <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <History className="text-primary" size={20} />
                Historial de Cambios
              </h3>
              <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
                <table className="w-full text-left">
                  <thead className="bg-slate-50 border-b border-slate-100">
                    <tr>
                      <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase">Fecha</th>
                      <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase">Usuario</th>
                      <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase">Acción</th>
                      <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase">Detalles</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {auditLogs.map((log) => (
                      <tr key={log.id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="px-6 py-4 text-xs text-slate-600 font-medium">
                          {log.timestamp ? formatDate(log.timestamp) : 'Reciente'}
                        </td>
                        <td className="px-6 py-4 text-xs font-bold text-slate-900">{log.userEmail || log.userName || 'Usuario'}</td>
                        <td className="px-6 py-4 text-xs text-slate-700 font-semibold">{log.action}</td>
                        <td className="px-6 py-4 text-xs text-slate-500">{log.details}</td>
                      </tr>
                    ))}
                    {auditLogs.length === 0 && (
                      <tr>
                        <td colSpan={4} className="px-6 py-8 text-center text-slate-400 italic">No hay registros de auditoría disponibles</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>

      <FormModal
        isOpen={isPoiModalOpen}
        onClose={() => {
          setIsPoiModalOpen(false);
          setEditingPoiIndex(null);
          setNewPoiData({ lat: 0, lng: 0, name: '', comment: '' });
        }}
        title={editingPoiIndex !== null ? "Editar Punto de Interés" : "Nuevo Punto de Interés"}
        fullVertical
        footer={
          <div className="flex gap-4 w-full">
            <button 
              type="button"
              onClick={() => {
                setIsPoiModalOpen(false);
                setEditingPoiIndex(null);
                setNewPoiData({ lat: 0, lng: 0, name: '', comment: '' });
              }}
              className="flex-1 py-4 px-6 bg-slate-100 text-slate-600 font-bold rounded-xl hover:bg-slate-200 transition-all"
            >
              Cancelar
            </button>
            <button 
              type="button"
              onClick={handleSavePoi}
              className="flex-1 py-4 px-6 bg-primary text-white font-bold rounded-xl hover:bg-primary-hover transition-all shadow-lg shadow-primary-shadow flex items-center justify-center gap-2"
            >
              <Save size={18} />
              {editingPoiIndex !== null ? "Actualizar Punto" : "Guardar Punto"}
            </button>
          </div>
        }
      >
        <div className="p-8 space-y-6">
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-bold text-slate-700 dark:text-slate-300">Nombre del Punto</label>
              <input 
                type="text" 
                className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary dark:text-white"
                value={newPoiData.name}
                onChange={(e) => setNewPoiData({...newPoiData, name: e.target.value})}
                placeholder="Ej: Depósito de Materiales"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-bold text-slate-700 dark:text-slate-300">Comentario / Descripción</label>
              <textarea 
                className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary min-h-[100px] dark:text-white"
                value={newPoiData.comment}
                onChange={(e) => setNewPoiData({...newPoiData, comment: e.target.value})}
                placeholder="Detalles adicionales sobre este punto..."
              />
            </div>
          </div>
        </div>
      </FormModal>

      <FormModal
        isOpen={isSubtaskModalOpen}
        onClose={() => setIsSubtaskModalOpen(false)}
        title="Nueva Subtarea"
        fullVertical
        footer={
          <div className="flex gap-4 w-full">
            <button 
              type="button"
              onClick={() => setIsSubtaskModalOpen(false)}
              className="flex-1 py-4 px-6 bg-slate-100 text-slate-600 font-bold rounded-xl hover:bg-slate-200 transition-all"
            >
              Cancelar
            </button>
            <button 
              type="button"
              onClick={handleAddSubtask}
              className="flex-1 py-4 px-6 bg-primary text-white font-bold rounded-xl hover:bg-primary-hover transition-all shadow-lg shadow-primary-shadow flex items-center justify-center gap-2"
            >
              <Plus size={18} />
              Añadir
            </button>
          </div>
        }
      >
        <div className="p-8 space-y-6">
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-bold text-slate-700">Nombre de la Subtarea</label>
              <input 
                type="text" 
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary"
                value={newSubtask.name}
                onChange={(e) => setNewSubtask({...newSubtask, name: e.target.value})}
                placeholder="Ej: Excavación de zapatas"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-bold text-slate-700">Responsable</label>
              <input 
                type="text" 
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary"
                value={newSubtask.responsible}
                onChange={(e) => setNewSubtask({...newSubtask, responsible: e.target.value})}
                placeholder="Nombre del encargado"
              />
            </div>
          </div>
        </div>
      </FormModal>

      <FormModal
        isOpen={isEmailModalOpen}
        onClose={() => setIsEmailModalOpen(false)}
        title="Enviar Informe"
        fullVertical
        footer={
          <div className="flex gap-4 w-full">
            <button 
              type="button"
              onClick={() => setIsEmailModalOpen(false)}
              className="flex-1 py-4 px-6 bg-slate-100 text-slate-600 font-bold rounded-xl hover:bg-slate-200 transition-all"
            >
              Cancelar
            </button>
            <button 
              type="button"
              onClick={confirmSendEmail}
              className="flex-1 py-4 px-6 bg-primary text-white font-bold rounded-xl hover:bg-primary-hover transition-all shadow-lg shadow-primary-shadow flex items-center justify-center gap-2"
            >
              <Send size={18} />
              Enviar
            </button>
          </div>
        }
      >
        <div className="p-8 space-y-6">
          <div className="space-y-4">
            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
              <p className="text-sm text-slate-600">Se enviará el informe de <strong>{project.name}</strong> al siguiente correo:</p>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-bold text-slate-700">Correo del Cliente</label>
              <input 
                type="email" 
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary"
                value={emailTo}
                onChange={(e) => setEmailTo(e.target.value)}
                placeholder="cliente@ejemplo.com"
              />
            </div>
          </div>
        </div>
      </FormModal>
      {/* Confirmation Modals */}
      <ConfirmModal
        isOpen={isSubtaskDeleteConfirmOpen}
        onClose={() => setIsSubtaskDeleteConfirmOpen(false)}
        onConfirm={handleConfirmDeleteSubtask}
        title="Eliminar Subtarea"
        message="¿Estás seguro de que deseas eliminar esta subtarea? Esta acción no se puede deshacer."
        confirmText="Eliminar"
        variant="danger"
      />
      {isBudgetModalOpen && (
        <ProjectBudget 
          project={project} 
          onClose={() => setIsBudgetModalOpen(false)} 
        />
      )}
      <ProjectMap 
        isOpen={isMapOpen} 
        onClose={() => {
          setIsMapOpen(false);
          setIsSelectionMode(false);
        }} 
        project={projectForMap} 
        isSelectionMode={isSelectionMode}
        onSelectLocation={(lat, lng) => {
          setEditForm(prev => ({
            ...prev,
            coordinates: { lat, lng }
          }));
          toast.success('Coordenadas actualizadas desde el mapa');
        }}
      />
    </div>
  );
}
