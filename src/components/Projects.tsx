import React, { useCallback, useDeferredValue, useEffect, useMemo, useState, useRef } from 'react';
import Papa from 'papaparse';
import { 
  Plus, 
  Search, 
  MoreVertical, 
  Construction, 
  MapPin, 
  Calendar, 
  DollarSign, 
  TrendingUp, 
  CheckCircle2, 
  Clock,
  Trash2,
  Edit2,
  Eye,
  X,
  FileText,
  Download,
  Mail,
  Send,
  Calculator,
  Building2,
  LayoutGrid,
  ChevronRight,
  ChevronLeft,
  Upload,
  AlertCircle,
  ShieldAlert,
  Home,
  Factory,
  Landmark,
  Stethoscope,
  GraduationCap,
  Trophy,
  Palmtree,
  HardHat,
  Layers,
  Filter,
  Info,
  Check,
  Sparkles,
  Loader2,
  Navigation,
  Share
} from 'lucide-react';
import { GoogleGenAI, Type } from "@google/genai";
import { StepForm, FormSection, FormInput, FormSelect } from './FormLayout';
import {
  APU_TEMPLATES,
  MARKET_DATA,
  buildBudgetSeedFromTemplate,
  getAreaFactorByDescription,
} from '../constants/apuData';
import { formatCurrency, formatDate, cn, handleApiError, OperationType, getMitigationSuggestions } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import ProjectDetails from './ProjectDetails';
import ProjectMap from './ProjectMap';
import CalendarView from './CalendarView';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { drawReportHeader } from '../lib/pdfUtils';
import { sendNotification } from '../lib/notifications';
import { logAction } from '../lib/audit';
import { toast } from 'sonner';
import { FormModal } from './FormModal';
import DatePicker from 'react-datepicker';
import "react-datepicker/dist/react-datepicker.css";
import ConfirmModal from './ConfirmModal';
import ProjectBudget from './ProjectBudget';
import { List, Map as MapIcon } from 'lucide-react';
import {
  createProject,
  createProjectBudgetItem,
  deleteProject,
  deleteProjectBudgetItem,
  listProjectBudgetItemsDetailed,
  listProjects,
  updateProject,
} from '../lib/projectsApi';
import { deleteClient, listClients } from '../lib/clientsApi';
import { deleteQuoteRecord, listQuotes } from '../lib/quotesApi';
import { deleteTransactionById, listTransactions } from '../lib/financialsApi';
import { clearAuditLogs } from '../lib/auditApi';

const TEST_PROJECT_PATTERNS = [
  /^E2E\b/i,
  /^TEST\b/i,
  /^QA\b/i,
  /^PRUEBA\b/i,
  /^DEMO\b/i,
  /\bDATOS?\s+DE\s+PRUEBA\b/i,
];

const TEST_DATA_TEXT_PATTERNS = [
  /(?:^|[\s_-])(E2E|TEST|QA|PRUEBA)(?:$|[\s_-])/i,
  /(?:^|[\s_-])(DEMO|SAMPLE)(?:$|[\s_-])/i,
  /\bDATOS?\s+DE\s+PRUEBA\b/i,
];

function isTestProjectName(name: string) {
  const normalized = String(name || '').trim();
  if (!normalized) return false;
  return TEST_PROJECT_PATTERNS.some((pattern) => pattern.test(normalized));
}

function isTestDataText(value: any) {
  const text = String(value || '').trim();
  if (!text) return false;
  return TEST_DATA_TEXT_PATTERNS.some((pattern) => pattern.test(text));
}

const StatusBadge = ({ status }: { status: string }) => {
  const styles: any = {
    'Evaluation': 'bg-violet-50 text-violet-600 border-violet-100 dark:bg-violet-500/20 dark:text-violet-300 dark:border-violet-500/40',
    'Planning': 'bg-blue-50 text-blue-600 border-blue-100 dark:bg-blue-500/20 dark:text-blue-300 dark:border-blue-500/40',
    'In Progress': 'bg-primary-light/50 text-primary border-primary-light dark:bg-primary/20 dark:text-blue-300 dark:border-primary/40',
    'Completed': 'bg-emerald-50 text-emerald-600 border-emerald-100 dark:bg-emerald-500/20 dark:text-emerald-300 dark:border-emerald-500/40',
    'On Hold': 'bg-rose-50 text-rose-600 border-rose-100 dark:bg-rose-500/20 dark:text-rose-300 dark:border-rose-500/40',
  };
  return (
    <span className={cn("text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full border", styles[status])}>
      {status === 'Evaluation' ? 'Evaluación' : status === 'Planning' ? 'Planeación' : status === 'In Progress' ? 'En Ejecución' : status === 'Completed' ? 'Completado' : 'En Pausa'}
    </span>
  );
};

const normalizeProjectStatus = (status: string) =>
  String(status || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

const isEvaluationStatus = (status: string) => {
  const normalized = normalizeProjectStatus(status);
  return normalized === 'evaluation' || normalized === 'planning' || normalized === 'en evaluacion' || normalized === 'en planeacion';
};

const isExecutionStatus = (status: string) => {
  const normalized = normalizeProjectStatus(status);
  return normalized === 'in progress' || normalized === 'inprogress' || normalized === 'active' || normalized === 'en ejecucion' || normalized === 'execution';
};

const getTypologyColor = (typology: string) => {
  switch (typology?.toUpperCase()) {
    case 'RESIDENCIAL': return 'text-emerald-600 bg-emerald-50 border-emerald-100 dark:bg-emerald-500/20 dark:text-emerald-300 dark:border-emerald-500/40';
    case 'COMERCIAL': return 'text-blue-600 bg-blue-50 border-blue-100 dark:bg-blue-500/20 dark:text-blue-300 dark:border-blue-500/40';
    case 'INDUSTRIAL': return 'text-amber-600 bg-amber-50 border-amber-100 dark:bg-amber-500/20 dark:text-amber-300 dark:border-amber-500/40';
    case 'CIVIL': return 'text-indigo-600 bg-indigo-50 border-indigo-100 dark:bg-indigo-500/20 dark:text-indigo-300 dark:border-indigo-500/40';
    case 'PUBLICA': return 'text-cyan-600 bg-cyan-50 border-cyan-100 dark:bg-cyan-500/20 dark:text-cyan-300 dark:border-cyan-500/40';
    case 'SALUD': return 'text-rose-600 bg-rose-50 border-rose-100 dark:bg-rose-500/20 dark:text-rose-300 dark:border-rose-500/40';
    case 'EDUCACION': return 'text-orange-600 bg-orange-50 border-orange-100 dark:bg-orange-500/20 dark:text-orange-300 dark:border-orange-500/40';
    case 'DEPORTIVA': return 'text-lime-600 bg-lime-50 border-lime-100 dark:bg-lime-500/20 dark:text-lime-300 dark:border-lime-500/40';
    case 'INFRAESTRUCTURA': return 'text-slate-800 bg-slate-100 border-slate-200 dark:bg-slate-700/70 dark:text-slate-100 dark:border-slate-500/50';
    case 'TURISMO': return 'text-pink-600 bg-pink-50 border-pink-100 dark:bg-pink-500/20 dark:text-pink-300 dark:border-pink-500/40';
    default: return 'text-slate-600 bg-slate-50 border-slate-100 dark:bg-slate-700/70 dark:text-slate-200 dark:border-slate-500/50';
  }
};

const getTypologyIcon = (typology: string) => {
  switch (typology?.toUpperCase()) {
    case 'RESIDENCIAL': return Home;
    case 'COMERCIAL': return Building2;
    case 'INDUSTRIAL': return Factory;
    case 'CIVIL': return HardHat;
    case 'PUBLICA': return Landmark;
    case 'SALUD': return Stethoscope;
    case 'EDUCACION': return GraduationCap;
    case 'DEPORTIVA': return Trophy;
    case 'INFRAESTRUCTURA': return Construction;
    case 'TURISMO': return Palmtree;
    default: return Construction;
  }
};

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

export default function Projects() {
    type CleanupCandidates = {
      projects: any[];
      clients: any[];
      quotes: any[];
      transactions: any[];
    };

  const EMPTY_CLEANUP_CANDIDATES: CleanupCandidates = {
    projects: [],
    clients: [],
    quotes: [],
    transactions: [],
  };

  const [projects, setProjects] = useState<any[]>([]);
  const [clients, setClients] = useState<any[]>([]);
  const [currentStep, setCurrentStep] = useState(0);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEmailModalOpen, setIsEmailModalOpen] = useState(false);
  const [reportingProject, setReportingProject] = useState<any>(null);
  const [emailTo, setEmailTo] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const deferredSearchTerm = useDeferredValue(searchTerm);
  const [filters, setFilters] = useState({
    status: 'all',
    location: '',
    projectManager: '',
    typology: '',
    startDate: null as Date | null,
    endDate: null as Date | null
  });
  const [sortBy, setSortBy] = useState('name'); // name, startDate, budget
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(6);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [projectToDelete, setProjectToDelete] = useState<string | null>(null);
  const [isCleanupConfirmOpen, setIsCleanupConfirmOpen] = useState(false);
  const [isAuditHistoryConfirmOpen, setIsAuditHistoryConfirmOpen] = useState(false);
  const [cleanupCandidates, setCleanupCandidates] = useState<CleanupCandidates>(EMPTY_CLEANUP_CANDIDATES);
  const [isCleaningTestData, setIsCleaningTestData] = useState(false);
  const [isClearingAuditHistory, setIsClearingAuditHistory] = useState(false);
  const [isBudgetModalOpen, setIsBudgetModalOpen] = useState(false);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [isCSVConfirmOpen, setIsCSVConfirmOpen] = useState(false);
  const [csvData, setCsvData] = useState<any[]>([]);
  const [csvStats, setCsvStats] = useState({ success: 0, error: 0 });
  const [isSaving, setIsSaving] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isMapOpen, setIsMapOpen] = useState(false);
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [projectForMap, setProjectForMap] = useState<any>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'table' | 'calendar' | 'map'>('grid');
  const [isGlobalMapOpen, setIsGlobalMapOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<any>(null);
  const [isAuditModalOpen, setIsAuditModalOpen] = useState(false);
  const [auditResults, setAuditResults] = useState<any>(null);
  const [isAuditing, setIsAuditing] = useState(false);

  const stopCardEvent = (e: React.SyntheticEvent) => {
    e.stopPropagation();
  };

  const runFinancialAudit = async () => {
    const projectsWithDeviations = projects.filter(p => {
      const physicalProgress = Number(p.physicalProgress || 0);
      const budget = Number(p.budget || 0);
      const spent = Number(p.spent || 0);
      const financialProgress = budget > 0 ? (spent / budget) * 100 : 0;
      return (financialProgress - physicalProgress) > 15;
    });

    if (projectsWithDeviations.length === 0) {
      toast.info('No se detectaron desviaciones financieras críticas (>15%) en los proyectos activos.');
      return;
    }

    setIsAuditing(true);
    setIsAuditModalOpen(true);
    try {
      const ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_GEMINI_API_KEY });
      const projectData = projectsWithDeviations.map(p => ({
        name: p.name,
        budget: p.budget,
        spent: p.spent,
        physicalProgress: p.physicalProgress,
        financialProgress: (p.spent / p.budget) * 100,
        deviation: ((p.spent / p.budget) * 100) - p.physicalProgress
      }));

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: `Analiza los siguientes proyectos de construcción que presentan desviaciones financieras críticas (el gasto supera al avance físico por más del 15%). Proporciona un resumen ejecutivo, causas probables para cada proyecto y un plan de mitigación detallado.
        
        Datos de los proyectos:
        ${JSON.stringify(projectData, null, 2)}
        
        Responde en español y con formato JSON.`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              summary: { type: Type.STRING },
              projects: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    name: { type: Type.STRING },
                    causes: { type: Type.ARRAY, items: { type: Type.STRING } },
                    mitigationPlan: { type: Type.ARRAY, items: { type: Type.STRING } }
                  },
                  required: ["name", "causes", "mitigationPlan"]
                }
              }
            },
            required: ["summary", "projects"]
          }
        }
      });

      const results = JSON.parse(response.text);
      setAuditResults(results);
      
      // Send notifications for each audited project
      results.projects.forEach((p: any) => {
        sendNotification(
          'Auditoría IA: Desviación Crítica',
          `Se ha detectado una desviación financiera en ${p.name}. Plan de mitigación sugerido disponible en el módulo de obras.`,
          'project'
        );
      });

    } catch (error) {
      console.error('Error running financial audit:', error);
      toast.error('Error al realizar la auditoría financiera con IA');
    } finally {
      setIsAuditing(false);
    }
  };

  const validateField = (name: string, value: any) => {
    let error = '';
    const mandatoryFields = ['name', 'location', 'projectManager', 'area', 'startDate', 'endDate'];
    
    if (mandatoryFields.includes(name) && (!value && value !== 0)) {
      error = 'Este campo es obligatorio';
    } else if ((name === 'spent' || name === 'area') && Number(value) < 0) {
      error = 'El valor no puede ser negativo';
    } else if (name === 'physicalProgress' && (Number(value) < 0 || Number(value) > 100)) {
      error = 'Debe estar entre 0 y 100';
    } else if (name === 'endDate' && newProject.startDate && value && new Date(value) <= new Date(newProject.startDate)) {
      error = 'Debe ser posterior a la fecha de inicio';
    } else if (name === 'startDate' && newProject.endDate && value && new Date(value) >= new Date(newProject.endDate)) {
      // Also validate endDate if startDate changes
      validateField('endDate', newProject.endDate);
    }
    
    setValidationErrors(prev => ({ ...prev, [name]: error }));
    return !error;
  };

  const validateForm = () => {
    const errors: Record<string, string> = {};
    const mandatoryFields = ['name', 'location', 'projectManager', 'area', 'startDate', 'endDate'];
    
    mandatoryFields.forEach(field => {
      const value = (newProject as any)[field];
      if (!value && value !== 0) {
        errors[field] = 'Este campo es obligatorio';
      }
    });

    if (newProject.spent && Number(newProject.spent) < 0) errors.spent = 'No puede ser negativo';
    if (newProject.area && Number(newProject.area) <= 0) errors.area = 'Debe ser mayor a cero';
    
    if (newProject.startDate && newProject.endDate) {
      if (new Date(newProject.endDate) <= new Date(newProject.startDate)) {
        errors.endDate = 'Debe ser posterior a la fecha de inicio';
      }
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const [budgetProject, setBudgetProject] = useState<any>(null);
  const prevProjectsRef = useRef<any[]>([]);
  const [newProject, setNewProject] = useState({
    name: '',
    location: '',
    projectManager: '',
    status: 'Planning',
    budget: '',
    spent: '0',
    physicalProgress: '0',
    area: '',
    startDate: '',
    endDate: '',
    clientUid: '',
    typology: 'RESIDENCIAL',
    latitude: '',
    longitude: ''
  });

  const clampPercent = (value: any) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return 0;
    return Math.max(0, Math.min(100, parsed));
  };

  const getProjectFinancialProgress = (project: any) => {
    const budget = Number(project?.budget || 0);
    const spent = Number(project?.spent || 0);
    if (budget <= 0) return clampPercent(project?.financialProgress || 0);
    return clampPercent((spent / budget) * 100);
  };

  const loadProjectsFromApi = useCallback(async () => {
    try {
      const docs = await listProjects();

      docs.forEach((newData) => {
        const oldData = prevProjectsRef.current.find(p => p.id === newData.id);
        if (oldData && oldData.status !== newData.status) {
          sendNotification(
            'Cambio de Estado en Obra',
            `La obra ${newData.name} ha cambiado de ${oldData.status} a ${newData.status}.`,
            'project'
          );
        }
      });

      setProjects(docs);
      prevProjectsRef.current = docs;
    } catch (error: any) {
      toast.error('Error en la base de datos', {
        description: `No se pudieron cargar proyectos: ${error?.message || 'Error desconocido'}`,
      });
    }
  }, []);

  const loadClientsFromApi = useCallback(async () => {
    try {
      const items = await listClients();
      setClients(items);
    } catch (error: any) {
      toast.error('Error en la base de datos', {
        description: `No se pudieron cargar clientes: ${error?.message || 'Error desconocido'}`,
      });
    }
  }, []);

  useEffect(() => {
    loadProjectsFromApi();
    loadClientsFromApi();
  }, [loadProjectsFromApi, loadClientsFromApi]);

  useEffect(() => {
    const handleQuickActionTrigger = (event: Event) => {
      const customEvent = event as CustomEvent<{ action?: string }>;
      if (customEvent.detail?.action !== 'new-project') return;

      setEditingProject(null);
      setNewProject({
        name: '',
        location: '',
        projectManager: '',
        status: 'Planning',
        budget: '',
        spent: '0',
        physicalProgress: '0',
        area: '',
        startDate: '',
        endDate: '',
        clientUid: '',
        typology: 'RESIDENCIAL',
        latitude: '',
        longitude: ''
      });
      setValidationErrors({});
      setCurrentStep(0);
      setIsModalOpen(true);
    };

    window.addEventListener('QUICK_ACTION_TRIGGER', handleQuickActionTrigger as EventListener);
    return () => window.removeEventListener('QUICK_ACTION_TRIGGER', handleQuickActionTrigger as EventListener);
  }, []);

  const handleAISuggestions = async () => {
    if (!newProject.name) {
      toast.error('Por favor ingrese un nombre de proyecto antes de sugerir');
      return;
    }

    setIsGenerating(true);
    try {
      const ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_GEMINI_API_KEY });
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: `Como experto en gestión de proyectos de construcción, sugiere una descripción detallada y objetivos clave para un proyecto llamado "${newProject.name}" de tipo "${newProject.typology}". Proporciona la respuesta en español.`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              description: {
                type: Type.STRING,
                description: "Descripción detallada del proyecto."
              },
              objectives: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: "Lista de objetivos clave."
              }
            },
            required: ["description", "objectives"]
          }
        }
      });

      const suggestions = JSON.parse(response.text);
      toast.success('Sugerencias generadas con éxito');
      setNewProject(prev => ({
        ...prev,
        description: suggestions.description,
        notes: `Objetivos sugeridos:\n${suggestions.objectives.map((o: string) => `- ${o}`).join('\n')}`
      }));
    } catch (error) {
      console.error('Error generating AI suggestions:', error);
      toast.error('Error al generar sugerencias con IA');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCaptureLocation = () => {
    if (!navigator.geolocation) {
      toast.error('La geolocalización no es compatible con este navegador');
      return;
    }

    toast.loading('Capturando ubicación...', { id: 'geo-capture' });
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setNewProject(prev => ({
          ...prev,
          latitude: position.coords.latitude.toString(),
          longitude: position.coords.longitude.toString()
        }));
        toast.dismiss('geo-capture');
        toast.success('Ubicación capturada con éxito');
      },
      (error) => {
        toast.dismiss('geo-capture');
        console.error('Geolocation error:', error);
        switch(error.code) {
          case error.PERMISSION_DENIED:
            toast.error('Permiso de ubicación denegado');
            break;
          case error.POSITION_UNAVAILABLE:
            toast.error('Información de ubicación no disponible');
            break;
          case error.TIMEOUT:
            toast.error('Tiempo de espera agotado al capturar ubicación');
            break;
          default:
            toast.error('Error desconocido al capturar ubicación');
        }
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  const handleAddProject = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) {
      toast.error('Por favor corrija los errores en el formulario');
      return;
    }

    setIsSaving(true);
    try {
      let coordinates = editingProject?.coordinates || null;
      
      // Use manual coordinates if provided
      if (newProject.latitude && newProject.longitude) {
        coordinates = {
          lat: parseFloat(newProject.latitude),
          lng: parseFloat(newProject.longitude)
        };
      } else if (!editingProject || editingProject.location !== newProject.location) {
        // Only geocode if location changed or it's a new project and no manual coordinates
        try {
          const newCoords = await geocodeAddress(newProject.location);
          if (newCoords) {
            coordinates = newCoords;
          } else {
            toast.warning('No se pudieron obtener coordenadas precisas. Se guardará sin ubicación en el mapa.');
          }
        } catch (err) {
          toast.error('Error al conectar con el servicio de geocodificación. Se guardará sin actualizar coordenadas.');
        }
      }
      
      if (editingProject) {
        const effectiveBudget = Number(editingProject?.budget || 0);
        const financialProgress = effectiveBudget > 0 ? (Number(newProject.spent) / effectiveBudget) * 100 : 0;
        await updateProject(editingProject.id, {
          name: newProject.name,
          location: newProject.location,
          projectManager: newProject.projectManager,
          status: newProject.status,
          budget: effectiveBudget,
          spent: Number(newProject.spent),
          physicalProgress: Number(newProject.physicalProgress),
          financialProgress,
          area: Number(newProject.area),
          startDate: newProject.startDate,
          endDate: newProject.endDate,
          clientUid: newProject.clientUid,
          typology: newProject.typology,
          latitude: coordinates?.lat ? String(coordinates.lat) : '',
          longitude: coordinates?.lng ? String(coordinates.lng) : '',
        });
        toast.success('Obra actualizada con éxito');
        await logAction('Edición de Proyecto', 'Proyectos', `Proyecto ${newProject.name} actualizado`, 'update', { projectId: editingProject.id });
      } else {
        const financialProgress = 0;
        const created = await createProject({
          name: newProject.name,
          location: newProject.location,
          projectManager: newProject.projectManager,
          status: newProject.status,
          budget: 0,
          spent: Number(newProject.spent),
          physicalProgress: Number(newProject.physicalProgress),
          financialProgress,
          area: Number(newProject.area),
          startDate: newProject.startDate,
          endDate: newProject.endDate,
          clientUid: newProject.clientUid,
          typology: newProject.typology,
          latitude: coordinates?.lat ? String(coordinates.lat) : '',
          longitude: coordinates?.lng ? String(coordinates.lng) : '',
        });
        toast.success('Obra registrada con éxito');
        await logAction('Registro de Proyecto', 'Proyectos', `Nuevo proyecto ${newProject.name} registrado`, 'create', { projectId: created.id });
        
        // Initialize budget items based on typology
        const templates = APU_TEMPLATES[newProject.typology as keyof typeof APU_TEMPLATES] || [];
        let totalBudget = 0;
        
        for (let i = 0; i < templates.length; i++) {
          const template = templates[i];
          const quantityForTemplate = Number(newProject.area || 0) * getAreaFactorByDescription(newProject.typology, template.description);
          const seed = buildBudgetSeedFromTemplate(template, quantityForTemplate, newProject.location);
          totalBudget += seed.totalItemPrice;

          await createProjectBudgetItem(created.id, {
            description: template.description,
            category: 'General',
            unit: template.unit,
            quantity: quantityForTemplate,
            materialCost: seed.materialCost,
            laborCost: seed.laborCost,
            indirectCost: seed.indirectCost,
            totalUnitPrice: seed.totalUnitPrice,
            totalItemPrice: seed.totalItemPrice,
            estimatedDays: seed.estimatedDays,
            order: i + 1,
            materials: seed.materials,
            labor: seed.labor,
            indirectFactor: seed.indirectFactor,
            subtasks: [],
          });
        }

        if (totalBudget > 0) {
          const updatedFinancialProgress = totalBudget > 0 ? (Number(newProject.spent) / totalBudget) * 100 : 0;
          await updateProject(created.id, {
            name: newProject.name,
            location: newProject.location,
            projectManager: newProject.projectManager,
            status: newProject.status,
            budget: totalBudget,
            spent: Number(newProject.spent),
            physicalProgress: Number(newProject.physicalProgress),
            financialProgress: updatedFinancialProgress,
            area: Number(newProject.area),
            startDate: newProject.startDate,
            endDate: newProject.endDate,
            clientUid: newProject.clientUid,
            typology: newProject.typology,
            latitude: coordinates?.lat ? String(coordinates.lat) : '',
            longitude: coordinates?.lng ? String(coordinates.lng) : '',
          });
        }
        toast.success('Obra creada con éxito');
      }

      await loadProjectsFromApi();
      
      setIsModalOpen(false);
      setEditingProject(null);
      setNewProject({
        name: '',
        location: '',
        projectManager: '',
        status: 'Planning',
        budget: '',
        spent: '0',
        physicalProgress: '0',
        area: '',
        startDate: '',
        endDate: '',
        clientUid: '',
        typology: 'RESIDENCIAL',
        latitude: '',
        longitude: ''
      });
      setValidationErrors({});
    } catch (error) {
      handleApiError(error, OperationType.WRITE, 'projects');
    } finally {
      setIsSaving(false);
    }
  };

  const handleEditProject = (project: any) => {
    setEditingProject(project);
    setNewProject({
      name: project.name,
      location: project.location,
      projectManager: project.projectManager || '',
      status: project.status,
      budget: project.budget.toString(),
      spent: project.spent.toString(),
      physicalProgress: project.physicalProgress.toString(),
      area: project.area.toString(),
      startDate: project.startDate || '',
      endDate: project.endDate || '',
      clientUid: project.clientUid || '',
      typology: project.typology || 'RESIDENCIAL',
      latitude: project.coordinates?.lat?.toString() || '',
      longitude: project.coordinates?.lng?.toString() || ''
    });
    setValidationErrors({});
    setIsModalOpen(true);
  };

  const handleShare = async (project: any) => {
    const summary = `🏗️ Resumen de Obra: ${project.name}
📍 Ubicación: ${project.location}
📊 Estado: ${project.status === 'In Progress' ? 'En Ejecución' : project.status === 'Completed' ? 'Completado' : project.status === 'On Hold' ? 'En Pausa' : 'Planeación'}
📈 Avance Físico: ${(project.physicalProgress || 0).toFixed(1)}%
💰 Presupuesto: ${formatCurrency(project.budget)}
👷 Responsable: ${project.projectManager || 'N/A'}`;

    if (navigator.share) {
      try {
        await navigator.share({
          title: `Compartir Proyecto: ${project.name}`,
          text: summary,
          url: window.location.href,
        });
      } catch (error) {
        if ((error as Error).name !== 'AbortError') {
          console.error('Error sharing:', error);
          toast.error('Error al compartir');
        }
      }
    } else {
      try {
        await navigator.clipboard.writeText(summary);
        toast.success('Resumen copiado al portapapeles');
      } catch (error) {
        toast.error('No se pudo copiar el resumen');
      }
    }
  };

  const generateReport = (project: any) => {
    const doc = new jsPDF();
    const headerBottom = drawReportHeader(doc, 'INFORME DE OBRA', {
      subtitle: project.name,
      dateText: `Fecha: ${formatDate(new Date().toISOString())}`,
      x: 20,
      y: 10,
    });

    // Project Info
    doc.setFontSize(16);
    doc.setTextColor(15, 23, 42); // Slate-900
    doc.text(`Informe de Obra: ${project.name}`, 20, headerBottom + 8);
    
    doc.setFontSize(12);
    doc.text(`Ubicación: ${project.location}`, 20, headerBottom + 18);
    doc.text(`Estado: ${project.status}`, 20, headerBottom + 25);
    doc.text(`Fecha de Inicio: ${project.startDate ? formatDate(project.startDate) : 'N/A'}`, 20, headerBottom + 32);
    doc.text(`Fecha de Fin: ${project.endDate ? formatDate(project.endDate) : 'N/A'}`, 20, headerBottom + 39);

    // Financial Summary
    doc.setFontSize(14);
    doc.text('Resumen Financiero', 20, headerBottom + 53);
    
    autoTable(doc, {
      startY: headerBottom + 58,
      head: [['Concepto', 'Monto (GTQ)']],
      body: [
        ['Presupuesto Total', formatCurrency(project.budget)],
        ['Total Ejecutado', formatCurrency(project.spent)],
        ['Saldo Pendiente', formatCurrency(project.budget - project.spent)],
        ['Avance Físico', `${(project.physicalProgress || 0).toFixed(1)}%`],
        ['Avance Financiero', `${((project.spent / (project.budget || 1)) * 100).toFixed(1)}%`]
      ],
      theme: 'striped',
      headStyles: { fillColor: [37, 99, 235] }
    });

    // Footer
    const pageCount = doc.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(10);
      doc.text(`Generado el ${formatDate(new Date().toISOString())} - Página ${i} de ${pageCount}`, 105, 285, { align: 'center' });
    }

    doc.save(`Informe_${project.name.replace(/\s+/g, '_')}.pdf`);
    return doc;
  };

  const generateBudgetReport = async (project: any) => {
    try {
      toast.loading('Generando reporte de presupuesto...', { id: 'budget-report' });
      const budgetItems = await listProjectBudgetItemsDetailed(project.id);
      
      if (budgetItems.length === 0) {
        toast.dismiss('budget-report');
        toast.error('Este proyecto no tiene un presupuesto definido.');
        return;
      }

      const docPdf = new jsPDF();
      const now = new Date();

      const headerBottom = drawReportHeader(docPdf, 'PRESUPUESTO DE OBRA DETALLADO', {
        subtitle: `Proyecto: ${project.name} · Ubicación: ${project.location}`,
        dateText: `Fecha: ${formatDate(now)}`,
      });

      const totalBudget = budgetItems.reduce((sum, item) => sum + (item.totalItemPrice || 0), 0);
      const totalMaterials = budgetItems.reduce((sum, item) => sum + (item.materialCost || 0), 0);
      const totalLabor = budgetItems.reduce((sum, item) => sum + (item.laborCost || 0), 0);
      const totalIndirect = budgetItems.reduce((sum, item) => sum + (item.indirectCost || 0), 0);

      // Summary Stats
      docPdf.setFillColor(248, 250, 252);
      docPdf.rect(14, headerBottom + 4, 182, 20, 'F');
      
      docPdf.setFontSize(9);
      docPdf.setTextColor(71, 85, 105);
      docPdf.text('TOTAL PRESUPUESTADO', 20, headerBottom + 12);
      docPdf.setFontSize(12);
      docPdf.setTextColor(37, 99, 235);
      docPdf.text(formatCurrency(totalBudget), 20, headerBottom + 19);

      docPdf.setFontSize(9);
      docPdf.setTextColor(71, 85, 105);
      docPdf.text('ITEMS TOTALES', 100, headerBottom + 12);
      docPdf.setFontSize(12);
      docPdf.setTextColor(15, 23, 42);
      docPdf.text(budgetItems.length.toString(), 100, headerBottom + 19);

      let currentY = headerBottom + 34;

      budgetItems.forEach((item) => {
        // Check for page break
        if (currentY > 250) {
          docPdf.addPage();
          currentY = 20;
        }

        docPdf.setFontSize(11);
        docPdf.setTextColor(15, 23, 42);
        docPdf.setFont('helvetica', 'bold');
        docPdf.text(`${item.order}. ${item.description}`, 14, currentY);
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
            formatCurrency(m.quantity * m.unitPrice)
          ]);

          autoTable(docPdf, {
            startY: currentY,
            head: [['Material', 'Unid', 'Cant', 'P. Unit', 'Subtotal']],
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
      toast.dismiss('budget-report');
      toast.success('Presupuesto detallado exportado a PDF');
    } catch (error) {
      console.error("Error generating budget report:", error);
      toast.dismiss('budget-report');
      toast.error('Error al generar el reporte de presupuesto');
    }
  };

  const handleSendEmail = (project: any) => {
    const client = clients.find(c => c.id === project.clientUid);
    setReportingProject(project);
    setEmailTo(client?.email || '');
    setIsEmailModalOpen(true);
  };

  const confirmSendEmail = () => {
    // Simulate sending email
    alert(`Informe enviado con éxito a ${emailTo}`);
    setIsEmailModalOpen(false);
  };

  const handleDeleteProject = async (id: string) => {
    setProjectToDelete(id);
    setIsDeleteConfirmOpen(true);
  };

  const confirmDeleteProject = async () => {
    if (!projectToDelete) return;
    try {
      const project = projects.find(p => p.id === projectToDelete);
      await deleteProject(projectToDelete);
      setProjectToDelete(null);
      toast.success('Obra eliminada con éxito');
      await logAction('Eliminación de Proyecto', 'Proyectos', `Proyecto ${project?.name || projectToDelete} eliminado`, 'delete', { projectId: projectToDelete });
      await loadProjectsFromApi();
    } catch (error) {
      toast.error('Error al eliminar proyecto');
    }
  };

  const scanCleanupCandidates = async (): Promise<CleanupCandidates> => {
    const projectCandidates = projects.filter((project) => isTestProjectName(project.name));
    const projectIdSet = new Set(projectCandidates.map((project) => project.id));

    const [allClients, allQuotes] = await Promise.all([
      listClients(),
      listQuotes(),
    ]);

    const transactionItems: any[] = [];
    let offset = 0;
    const limit = 200;
    let hasMore = true;

    while (hasMore) {
      const response = await listTransactions({ offset, limit });
      transactionItems.push(...response.items);
      hasMore = response.hasMore;
      offset += response.items.length;
    }

    const clientCandidates = allClients.filter((client) =>
      isTestDataText(client.name) ||
      isTestDataText(client.company) ||
      isTestDataText(client.email) ||
      isTestDataText(client.contactPerson) ||
      isTestDataText(client.contacto)
    );

    const quoteCandidates = allQuotes.filter((quote) => {
      if (projectIdSet.has(quote.projectId)) return true;
      if (isTestDataText(quote.notes)) return true;
      if (Array.isArray(quote.items) && quote.items.some((item: any) => isTestDataText(item.description))) {
        return true;
      }
      return false;
    });

    const transactionCandidates = transactionItems.filter((transaction) => {
      if (projectIdSet.has(transaction.projectId)) return true;
      if (isTestDataText(transaction.description)) return true;
      if (isTestDataText(transaction.category)) return true;
      return false;
    });

    return {
      projects: projectCandidates,
      clients: clientCandidates,
      quotes: quoteCandidates,
      transactions: transactionCandidates,
    };
  };

  const requestCleanupTestProjects = async () => {
    if (isCleaningTestData) return;

    setIsCleaningTestData(true);
    try {
      const candidates = await scanCleanupCandidates();
      const totalCandidates =
        candidates.projects.length +
        candidates.clients.length +
        candidates.quotes.length +
        candidates.transactions.length;

      if (totalCandidates === 0) {
        toast.info('No se encontraron datos de prueba para limpiar');
        return;
      }

      setCleanupCandidates(candidates);
      setIsCleanupConfirmOpen(true);
    } catch {
      toast.error('No se pudo preparar la limpieza de datos de prueba');
    } finally {
      setIsCleaningTestData(false);
    }
  };

  const executeCleanupTestCandidates = async (candidates: CleanupCandidates) => {
    const totalCandidates =
      candidates.projects.length +
      candidates.clients.length +
      candidates.quotes.length +
      candidates.transactions.length;

    if (totalCandidates === 0) return;

    let deleted = 0;
    let failed = 0;

    for (const transaction of candidates.transactions) {
      try {
        await deleteTransactionById(transaction.id);
        deleted += 1;
      } catch {
        failed += 1;
      }
    }

    for (const quote of candidates.quotes) {
      try {
        await deleteQuoteRecord(quote.id);
        deleted += 1;
      } catch {
        failed += 1;
      }
    }

    for (const project of candidates.projects) {
      try {
        const budgetItems = await listProjectBudgetItemsDetailed(project.id);
        for (const budgetItem of budgetItems) {
          try {
            await deleteProjectBudgetItem(project.id, budgetItem.id);
            deleted += 1;
          } catch {
            failed += 1;
          }
        }

        await deleteProject(project.id);
        deleted += 1;
      } catch {
        failed += 1;
      }
    }

    for (const client of candidates.clients) {
      try {
        await deleteClient(client.id);
        deleted += 1;
      } catch {
        failed += 1;
      }
    }

    try {
      await logAction(
        'Limpieza de Datos de Prueba',
        'Proyectos',
        `Se eliminaron ${deleted} registro(s) de prueba (proyectos/clientes/cotizaciones/transacciones). Fallidos: ${failed}.`,
        'delete',
        { deleted, failed }
      );
    } catch {
      // Logging errors should not block cleanup UX.
    }

    await loadProjectsFromApi();
    setIsCleanupConfirmOpen(false);
    setCleanupCandidates(EMPTY_CLEANUP_CANDIDATES);

    if (deleted > 0) {
      toast.success(`Limpieza completada: ${deleted} registro(s) de prueba eliminado(s)`);
    }
    if (failed > 0) {
      toast.error(`${failed} proyecto(s) no se pudieron eliminar`);
    }
  };

  const confirmCleanupTestProjects = async () => {
    const totalCandidates =
      cleanupCandidates.projects.length +
      cleanupCandidates.clients.length +
      cleanupCandidates.quotes.length +
      cleanupCandidates.transactions.length;

    if (totalCandidates === 0) {
      setIsCleanupConfirmOpen(false);
      return;
    }

    setIsCleaningTestData(true);
    try {
      await executeCleanupTestCandidates(cleanupCandidates);
    } finally {
      setIsCleaningTestData(false);
    }
  };

  const confirmClearAuditHistory = async () => {
    if (isClearingAuditHistory) return;

    setIsClearingAuditHistory(true);
    try {
      const result = await clearAuditLogs();
      setIsAuditHistoryConfirmOpen(false);
      toast.success(`Historial borrado: ${result.deleted} registro(s) de auditoría eliminado(s)`);
    } catch {
      toast.error('No se pudo borrar el historial de auditoría');
    } finally {
      setIsClearingAuditHistory(false);
    }
  };

  const filteredProjects = useMemo(() => {
    const normalizedSearchTerm = deferredSearchTerm.toLowerCase();
    const normalizedLocationFilter = filters.location.toLowerCase();
    const normalizedManagerFilter = filters.projectManager.toLowerCase();

    return projects
      .filter((p) => {
        const projectName = String(p.name || '').toLowerCase();
        const projectLocation = String(p.location || '').toLowerCase();
        const projectManager = String(p.projectManager || '').toLowerCase();

        const matchesSearch =
          projectName.includes(normalizedSearchTerm) || projectLocation.includes(normalizedSearchTerm);
        const matchesStatus = filters.status === 'all' || p.status === filters.status;
        const matchesLocation = !filters.location || projectLocation.includes(normalizedLocationFilter);
        const matchesManager = !filters.projectManager || projectManager.includes(normalizedManagerFilter);

        let matchesDate = true;
        if (filters.startDate || filters.endDate) {
          const pStart = p.startDate ? new Date(p.startDate) : null;
          const pEnd = p.endDate ? new Date(p.endDate) : null;

          const filterStart = filters.startDate ? new Date(filters.startDate) : null;
          const filterEnd = filters.endDate ? new Date(filters.endDate) : null;

          if (filterStart && filterEnd) {
            if (pStart && pEnd) {
              matchesDate = pStart <= filterEnd && pEnd >= filterStart;
            } else if (pStart) {
              matchesDate = pStart <= filterEnd;
            } else {
              matchesDate = false;
            }
          } else if (filterStart) {
            matchesDate = !pEnd || pEnd >= filterStart;
          } else if (filterEnd) {
            matchesDate = !pStart || pStart <= filterEnd;
          }
        }

        const matchesTypology = !filters.typology || p.typology === filters.typology;

        return matchesSearch && matchesStatus && matchesLocation && matchesManager && matchesTypology && matchesDate;
      })
      .sort((a, b) => {
        let valA = a[sortBy];
        let valB = b[sortBy];

        if (sortBy === 'budget') {
          valA = Number(valA);
          valB = Number(valB);
        }

        if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
        if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
        return 0;
      });
  }, [projects, deferredSearchTerm, filters, sortBy, sortOrder]);

  const [hoveredProjectId, setHoveredProjectId] = useState<string | null>(null);
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  const mouseMoveRafRef = useRef<number | null>(null);
  const enableCardTilt = useMemo(() => {
    if (typeof window === 'undefined') return false;

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const lowCpu = typeof navigator.hardwareConcurrency === 'number' && navigator.hardwareConcurrency <= 4;

    return !reducedMotion && !lowCpu;
  }, []);

  const handleMouseMove = (e: React.MouseEvent, projectId: string) => {
    if (!enableCardTilt) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;

    if (hoveredProjectId !== projectId) {
      setHoveredProjectId(projectId);
    }

    if (mouseMoveRafRef.current !== null) {
      cancelAnimationFrame(mouseMoveRafRef.current);
    }

    mouseMoveRafRef.current = requestAnimationFrame(() => {
      setMousePosition({ x, y });
      mouseMoveRafRef.current = null;
    });
  };

  useEffect(() => {
    return () => {
      if (mouseMoveRafRef.current !== null) {
        cancelAnimationFrame(mouseMoveRafRef.current);
      }
    };
  }, []);

  const totalPages = Math.ceil(filteredProjects.length / itemsPerPage);
  const paginatedProjects = filteredProjects.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, filters, sortBy, sortOrder, itemsPerPage]);

  const projectCostSummary = useMemo(() => {
    const executionProjects = filteredProjects.filter((project) => isExecutionStatus(project.status));
    const evaluationProjects = filteredProjects.filter((project) => isEvaluationStatus(project.status));

    const executionBudget = executionProjects.reduce((sum, project) => sum + (Number(project.budget) || 0), 0);
    const executionSpent = executionProjects.reduce((sum, project) => sum + (Number(project.spent) || 0), 0);

    const evaluationBudget = evaluationProjects.reduce((sum, project) => sum + (Number(project.budget) || 0), 0);
    const evaluationSpent = evaluationProjects.reduce((sum, project) => sum + (Number(project.spent) || 0), 0);

    return {
      executionCount: executionProjects.length,
      evaluationCount: evaluationProjects.length,
      executionBudget,
      executionSpent,
      evaluationBudget,
      evaluationSpent,
    };
  }, [filteredProjects]);

  if (selectedProjectId) {
    return <ProjectDetails projectId={selectedProjectId} onBack={() => setSelectedProjectId(null)} />;
  }

  const handleCSVUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const data = results.data as any[];
        let successCount = 0;
        let errorCount = 0;

        for (const row of data) {
          const budget = Number(row.budget) || 0;
          const spent = Number(row.spent) || 0;
          const physicalProgress = Number(row.physicalProgress) || 0;
          const financialProgress = budget > 0 ? (spent / budget) * 100 : 0;

          if (!row.name || !row.location || budget < 0 || spent < 0 || spent > budget || physicalProgress < 0 || physicalProgress > 100 || financialProgress < 0 || financialProgress > 100) {
            errorCount++;
          } else {
            successCount++;
          }
        }

        setCsvData(data);
        setCsvStats({ success: successCount, error: errorCount });
        setIsCSVConfirmOpen(true);
        // Reset input
        e.target.value = '';
      },
      error: (error) => {
        toast.error('Error al procesar el archivo CSV: ' + error.message);
      }
    });
  };

  const processCSVImport = async () => {
    setIsSaving(true);
    let successCount = 0;
    let errorCount = 0;

    for (const row of csvData) {
      try {
        const budget = Number(row.budget) || 0;
        const spent = Number(row.spent) || 0;
        const physicalProgress = Number(row.physicalProgress) || 0;
        const financialProgress = budget > 0 ? (spent / budget) * 100 : 0;

        if (!row.name || !row.location || budget < 0 || spent < 0 || spent > budget || physicalProgress < 0 || physicalProgress > 100 || financialProgress < 0 || financialProgress > 100) {
          errorCount++;
          continue;
        }

        await createProject({
          name: row.name,
          location: row.location,
          projectManager: row.projectManager || '',
          status: row.status || 'Planning',
          budget: budget,
          spent: spent,
          physicalProgress: physicalProgress,
          financialProgress: financialProgress,
          area: Number(row.area) || 0,
          startDate: row.startDate || new Date().toISOString().split('T')[0],
          endDate: row.endDate || new Date().toISOString().split('T')[0],
          typology: row.typology || 'RESIDENCIAL',
          clientUid: row.clientUid || '',
          latitude: row.latitude || '',
          longitude: row.longitude || '',
        });
        successCount++;
      } catch (error) {
        errorCount++;
      }
    }

    setIsSaving(false);
    setIsCSVConfirmOpen(false);
    if (successCount > 0) {
      toast.success(`${successCount} proyectos cargados con éxito`);
    }
    if (errorCount > 0) {
      toast.error(`${errorCount} proyectos fallaron al cargar (datos inválidos)`);
    }
    await loadProjectsFromApi();
  };

  return (
    <>
      <ConfirmModal
        isOpen={isDeleteConfirmOpen}
        onClose={() => setIsDeleteConfirmOpen(false)}
        onConfirm={confirmDeleteProject}
        title="Eliminar Proyecto"
        message="¿Estás seguro de que deseas eliminar este proyecto? Esta acción no se puede deshacer."
      />

      <ConfirmModal
        isOpen={isCleanupConfirmOpen}
        onClose={() => {
          if (isCleaningTestData) return;
          setIsCleanupConfirmOpen(false);
        }}
        onConfirm={confirmCleanupTestProjects}
        title="Limpieza de Datos de Prueba"
        message={`Se eliminarán ${cleanupCandidates.projects.length} proyecto(s), ${cleanupCandidates.clients.length} cliente(s), ${cleanupCandidates.quotes.length} cotización(es) y ${cleanupCandidates.transactions.length} transacción(es) de prueba detectados por patrón (E2E/TEST/QA/PRUEBA). Esta acción no afecta datos reales.`}
        confirmText={isCleaningTestData ? 'Limpiando...' : 'Eliminar Datos de Prueba'}
        cancelText="Cancelar"
        variant="warning"
      />

      <ConfirmModal
        isOpen={isAuditHistoryConfirmOpen}
        onClose={() => {
          if (isClearingAuditHistory) return;
          setIsAuditHistoryConfirmOpen(false);
        }}
        onConfirm={confirmClearAuditHistory}
        title="Borrar Historial de Cambios"
        message="Se eliminará todo el historial de auditoría (cambios del sistema). Esta acción no se puede deshacer."
        confirmText={isClearingAuditHistory ? 'Borrando...' : 'Borrar Historial'}
        cancelText="Cancelar"
        variant="warning"
      />

      <FormModal
        isOpen={isAuditModalOpen}
        onClose={() => setIsAuditModalOpen(false)}
        title="Auditoría Financiera IA"
        maxWidth="max-w-4xl"
        footer={
          <button 
            onClick={() => setIsAuditModalOpen(false)}
            className="w-full py-4 bg-slate-900 dark:bg-slate-800 text-white font-bold rounded-xl hover:bg-slate-800 dark:hover:bg-slate-700 transition-all"
          >
            Cerrar Informe
          </button>
        }
      >
        {isAuditing ? (
          <div className="flex flex-col items-center justify-center py-20 space-y-4">
            <Loader2 size={48} className="text-primary animate-spin" />
            <div className="text-center">
              <h3 className="text-xl font-bold text-slate-900 dark:text-white">Analizando Desviaciones Financieras</h3>
              <p className="text-slate-500 dark:text-slate-400">El asistente IA está procesando los datos de los proyectos...</p>
            </div>
          </div>
        ) : auditResults ? (
          <div className="space-y-8">
            <div className="bg-amber-50 dark:bg-amber-500/5 p-6 rounded-2xl border border-amber-100 dark:border-amber-500/10">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 bg-amber-100 dark:bg-amber-500/20 text-amber-600 dark:text-amber-400 rounded-lg">
                  <TrendingUp size={20} />
                </div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">Resumen Ejecutivo</h3>
              </div>
              <p className="text-slate-600 dark:text-slate-400 leading-relaxed">{auditResults.summary}</p>
            </div>

            <div className="space-y-6">
              {auditResults.projects.map((p: any, idx: number) => (
                <div key={idx} className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-[var(--radius-theme)] overflow-hidden shadow-[var(--shadow-theme)] hover:shadow-lg transition-all duration-300">
                  <div className="bg-slate-50 dark:bg-slate-800/50 px-6 py-4 border-b border-slate-100 dark:border-slate-800">
                    <h4 className="font-bold text-slate-900 dark:text-white">{p.name}</h4>
                  </div>
                  <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="space-y-4">
                      <div className="flex items-center gap-2 text-rose-600 dark:text-rose-400 font-bold uppercase tracking-wider text-micro">
                        <AlertCircle size={14} />
                        Causas Identificadas
                      </div>
                      <ul className="space-y-2">
                        {p.causes.map((cause: string, cIdx: number) => (
                          <li key={cIdx} className="flex items-start gap-2 text-sm text-slate-600 dark:text-slate-400">
                            <div className="mt-1.5 w-1.5 h-1.5 rounded-full bg-rose-500 shrink-0" />
                            {cause}
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div className="space-y-4">
                      <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 font-bold uppercase tracking-wider text-micro">
                        <Sparkles size={14} />
                        Plan de Mitigación
                      </div>
                      <ul className="space-y-2">
                        {p.mitigationPlan.map((plan: string, pIdx: number) => (
                          <li key={pIdx} className="flex items-start gap-2 text-sm text-slate-600 dark:text-slate-400">
                            <div className="mt-1.5 w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                            {plan}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </FormModal>

      <ConfirmModal
        isOpen={isCSVConfirmOpen}
        onClose={() => setIsCSVConfirmOpen(false)}
        onConfirm={processCSVImport}
        title="Confirmar Importación CSV"
        message={`Se han detectado ${csvStats.success + csvStats.error} registros en el archivo. Se importarán ${csvStats.success} proyectos válidos. ${csvStats.error > 0 ? `${csvStats.error} registros contienen errores y serán omitidos.` : ''} ¿Deseas continuar?`}
        confirmText={isSaving ? "Importando..." : "Importar Proyectos"}
        variant="info"
      />

      <div className="space-y-4 sm:space-y-6 projects-module-contrast">
        {/* Header Section */}
        <div className="bg-white dark:bg-slate-900 p-2.5 sm:p-4 md:p-5 rounded-[var(--radius-theme)] border border-slate-100 dark:border-slate-800 shadow-[var(--shadow-theme)] space-y-2.5 sm:space-y-4 hover:shadow-lg transition-all duration-300">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 sm:gap-6">
            <div>
              <h1 className="text-lg sm:text-3xl font-black text-slate-900 dark:text-white tracking-tight">Gestión de Obras</h1>
              <p className="text-[9px] sm:text-sm text-slate-500 dark:text-slate-400 font-medium">Control de ejecución, presupuestos y geolocalización</p>
            </div>
            <div className="flex items-center gap-1.5 sm:gap-3">
              <div className="flex bg-slate-50 dark:bg-slate-800 p-0.5 sm:p-1 rounded-lg sm:rounded-xl border border-slate-200 dark:border-slate-700">
                <button 
                  onClick={() => setViewMode('grid')}
                  className={cn(
                    "p-1 sm:p-2 rounded-md sm:rounded-lg transition-all duration-200 flex items-center gap-1 sm:gap-1.5 min-h-8 sm:min-h-0 active:scale-105 active:shadow-sm active:ring-2 active:ring-primary/30 focus-visible:scale-105 focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:outline-none",
                    viewMode === 'grid'
                      ? "bg-white dark:bg-slate-700 text-primary shadow-sm border border-slate-100 dark:border-slate-600 scale-105 ring-2 ring-primary/20"
                      : "text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                  )}
                  title="Vista Cuadrícula"
                >
                  <LayoutGrid size={13} className="sm:w-4 sm:h-4" />
                  <span className="text-[8px] sm:text-[10px] font-black uppercase hidden sm:inline">Cuadrícula</span>
                </button>
                <button 
                  onClick={() => setViewMode('table')}
                  className={cn(
                    "p-1 sm:p-2 rounded-md sm:rounded-lg transition-all duration-200 flex items-center gap-1 sm:gap-1.5 min-h-8 sm:min-h-0 active:scale-105 active:shadow-sm active:ring-2 active:ring-primary/30 focus-visible:scale-105 focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:outline-none",
                    viewMode === 'table'
                      ? "bg-white dark:bg-slate-700 text-primary shadow-sm border border-slate-100 dark:border-slate-600 scale-105 ring-2 ring-primary/20"
                      : "text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                  )}
                  title="Vista Tabla"
                >
                  <FileText size={13} className="sm:w-4 sm:h-4" />
                  <span className="text-[8px] sm:text-[10px] font-black uppercase hidden sm:inline">Tabla</span>
                </button>
                <button 
                  onClick={() => setViewMode('calendar')}
                  className={cn(
                    "p-1 sm:p-2 rounded-md sm:rounded-lg transition-all duration-200 flex items-center gap-1 sm:gap-1.5 min-h-8 sm:min-h-0 active:scale-105 active:shadow-sm active:ring-2 active:ring-primary/30 focus-visible:scale-105 focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:outline-none",
                    viewMode === 'calendar'
                      ? "bg-white dark:bg-slate-700 text-primary shadow-sm border border-slate-100 dark:border-slate-600 scale-105 ring-2 ring-primary/20"
                      : "text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                  )}
                  title="Vista Calendario"
                >
                  <Calendar size={13} className="sm:w-4 sm:h-4" />
                  <span className="text-[8px] sm:text-[10px] font-black uppercase hidden sm:inline">Calendario</span>
                </button>
                <button 
                  onClick={() => setIsGlobalMapOpen(true)}
                  className="p-1 sm:p-2 rounded-md sm:rounded-lg transition-all duration-200 flex items-center gap-1 sm:gap-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 min-h-8 sm:min-h-0 active:scale-105 active:shadow-sm active:ring-2 active:ring-primary/30 focus-visible:scale-105 focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:outline-none"
                  title="Vista Mapa"
                >
                  <MapIcon size={13} className="sm:w-4 sm:h-4" />
                  <span className="text-[8px] sm:text-[10px] font-black uppercase hidden sm:inline">Mapa</span>
                </button>
              </div>
            </div>
          </div>

          {/* Search and Actions Toolbar */}
          <div className="flex flex-col xl:flex-row gap-2 sm:gap-4">
            <div className="relative flex-1 group">
              <Search className="absolute left-3 sm:left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-primary transition-colors sm:w-5 sm:h-5" size={16} />
              <input 
                type="text" 
                placeholder="Buscar por nombre, ubicación o director..." 
                className="w-full pl-10 sm:pl-11 pr-3 py-1.5 sm:py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all text-[11px] sm:text-sm text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            
            <div className="flex flex-wrap items-center gap-1.5 sm:gap-3">
              <button 
                onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
                className={cn(
                  "flex items-center justify-center gap-1.5 sm:gap-2 px-2 sm:px-4 py-1.5 sm:py-2.5 rounded-xl font-black transition-all duration-200 border shrink-0 text-[8px] sm:text-[10px] uppercase tracking-widest min-h-8 sm:min-h-0 active:scale-105 active:shadow-sm active:ring-2 active:ring-primary/30 focus-visible:scale-105 focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:outline-none",
                  showAdvancedFilters 
                    ? "bg-primary text-white border-primary shadow-lg shadow-primary-shadow scale-105 ring-2 ring-primary/35" 
                    : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 shadow-sm"
                )}
              >
                <Filter size={14} className="sm:w-5 sm:h-5" />
                <span className="sm:text-sm">Filtros</span>
              </button>

              <button 
                onClick={runFinancialAudit}
                disabled={isAuditing}
                className="flex items-center justify-center gap-1.5 sm:gap-2 px-2 sm:px-4 py-1.5 sm:py-2.5 bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400 font-black rounded-xl hover:bg-amber-100 dark:hover:bg-amber-500/20 transition-all duration-200 border border-amber-100 dark:border-amber-500/20 shadow-sm whitespace-nowrap text-[8px] sm:text-[10px] uppercase tracking-widest min-h-8 sm:min-h-0 active:scale-105 active:shadow-sm active:ring-2 active:ring-amber-400/35 focus-visible:scale-105 focus-visible:ring-2 focus-visible:ring-amber-400/35 focus-visible:outline-none"
              >
                {isAuditing ? <Loader2 size={14} className="animate-spin" /> : <ShieldAlert size={14} className="sm:w-5 sm:h-5" />}
                <span className="sm:hidden">Audit</span>
                <span className="hidden sm:inline sm:text-sm">Auditoría</span>
              </button>

              <button
                onClick={() => setIsAuditHistoryConfirmOpen(true)}
                disabled={isClearingAuditHistory}
                className="flex items-center justify-center gap-1.5 sm:gap-2 px-2 sm:px-4 py-1.5 sm:py-2.5 bg-sky-50 dark:bg-sky-500/10 text-sky-600 dark:text-sky-400 font-black rounded-xl hover:bg-sky-100 dark:hover:bg-sky-500/20 transition-all duration-200 border border-sky-100 dark:border-sky-500/20 shadow-sm whitespace-nowrap text-[8px] sm:text-[10px] uppercase tracking-widest min-h-8 sm:min-h-0 active:scale-105 active:shadow-sm active:ring-2 active:ring-sky-400/35 focus-visible:scale-105 focus-visible:ring-2 focus-visible:ring-sky-400/35 focus-visible:outline-none"
                title="Borra el historial de cambios y auditoría"
              >
                {isClearingAuditHistory ? <Loader2 size={14} className="animate-spin" /> : <Info size={14} className="sm:w-5 sm:h-5" />}
                <span className="sm:hidden">Hist.</span>
                <span className="hidden sm:inline sm:text-sm">BORRAR HISTORIAL</span>
              </button>

              <button
                onClick={requestCleanupTestProjects}
                disabled={isCleaningTestData}
                className="flex items-center justify-center gap-1.5 sm:gap-2 px-2 sm:px-4 py-1.5 sm:py-2.5 bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400 font-black rounded-xl hover:bg-rose-100 dark:hover:bg-rose-500/20 transition-all duration-200 border border-rose-100 dark:border-rose-500/20 shadow-sm whitespace-nowrap text-[8px] sm:text-[10px] uppercase tracking-widest min-h-8 sm:min-h-0 active:scale-105 active:shadow-sm active:ring-2 active:ring-rose-400/35 focus-visible:scale-105 focus-visible:ring-2 focus-visible:ring-rose-400/35 focus-visible:outline-none"
                title="Borra datos de prueba agregados por el sistema"
              >
                <Trash2 size={14} className="sm:w-5 sm:h-5" />
                <span className="sm:hidden">Prueba</span>
                <span className="hidden sm:inline sm:text-sm">BORRAR DATOS DE PRUEBA</span>
              </button>

              <div className="h-7 sm:h-8 w-px bg-slate-200 dark:bg-slate-800 mx-0.5 sm:mx-1 hidden xl:block" />

              <button 
                onClick={() => {
                  setEditingProject(null);
                  setNewProject({
                    name: '',
                    location: '',
                    projectManager: '',
                    status: 'Planning',
                    budget: '',
                    spent: '0',
                    physicalProgress: '0',
                    area: '',
                    startDate: '',
                    endDate: '',
                    clientUid: '',
                    typology: 'RESIDENCIAL',
                    latitude: '',
                    longitude: ''
                  });
                  setValidationErrors({});
                  setIsModalOpen(true);
                }}
                className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 sm:gap-2 bg-primary text-white font-black py-1.5 sm:py-2.5 px-2.5 sm:px-5 rounded-xl hover:bg-primary-hover transition-all duration-200 shadow-lg shadow-primary-shadow group shrink-0 text-[8px] sm:text-[10px] uppercase tracking-widest min-h-8 sm:min-h-0 active:scale-105 active:shadow-xl active:ring-2 active:ring-primary/40 focus-visible:scale-105 focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none"
              >
                <Plus size={14} className="sm:w-5 sm:h-5 group-hover:rotate-90 transition-transform duration-300" />
                <span className="sm:hidden">Nueva</span>
                <span className="hidden sm:inline sm:text-sm">Nueva Obra</span>
              </button>
            </div>
          </div>

          <AnimatePresence>
            {showAdvancedFilters && (
              <motion.div 
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden"
              >
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 pt-4 border-t border-slate-100 dark:border-slate-800">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider ml-1">Estado</label>
                  <select 
                    title="Filtrar por estado"
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:ring-2 focus:ring-primary outline-none text-slate-900 dark:text-white"
                    value={filters.status}
                    onChange={(e) => setFilters({...filters, status: e.target.value})}
                  >
                    <option value="all">Todos los estados</option>
                    <option value="Evaluation">Evaluación</option>
                    <option value="Planning">Planeación</option>
                    <option value="In Progress">En Ejecución</option>
                    <option value="On Hold">En Pausa</option>
                    <option value="Completed">Completado</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider ml-1">Ubicación</label>
                  <input 
                    type="text" 
                    placeholder="Filtrar por ciudad..." 
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:ring-2 focus:ring-primary outline-none text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500"
                    value={filters.location}
                    onChange={(e) => setFilters({...filters, location: e.target.value})}
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider ml-1">Director de Proyecto</label>
                  <input 
                    type="text" 
                    placeholder="Filtrar por director..." 
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:ring-2 focus:ring-primary outline-none text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500"
                    value={filters.projectManager}
                    onChange={(e) => setFilters({...filters, projectManager: e.target.value})}
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider ml-1">Tipología</label>
                  <select 
                    title="Filtrar por tipología"
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:ring-2 focus:ring-primary outline-none text-slate-900 dark:text-white"
                    value={filters.typology}
                    onChange={(e) => setFilters({...filters, typology: e.target.value})}
                  >
                    <option value="">Todas las tipologías</option>
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

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider ml-1">Rango de Fechas (Inicio)</label>
                  <div className="flex items-center gap-2">
                    <DatePicker
                      selected={filters.startDate}
                      onChange={(date) => setFilters({...filters, startDate: date})}
                      placeholderText="Desde"
                      className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs outline-none text-slate-900 dark:text-white"
                      dateFormat="dd/MM/yyyy"
                    />
                    <span className="text-slate-400">-</span>
                    <DatePicker
                      selected={filters.endDate}
                      onChange={(date) => setFilters({...filters, endDate: date})}
                      placeholderText="Hasta"
                      className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs outline-none text-slate-900 dark:text-white"
                      dateFormat="dd/MM/yyyy"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider ml-1">Ordenar por</label>
                  <div className="flex gap-2">
                    <select 
                      title="Ordenar proyectos"
                      className="flex-1 px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:ring-2 focus:ring-primary outline-none text-slate-900 dark:text-white"
                      value={sortBy}
                      onChange={(e) => setSortBy(e.target.value)}
                    >
                      <option value="name">Nombre</option>
                      <option value="startDate">Fecha Inicio</option>
                      <option value="budget">Presupuesto</option>
                    </select>
                    <button 
                      onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
                      title="Cambiar sentido de orden"
                      className="p-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                    >
                      {sortOrder === 'asc' ? <TrendingUp size={18} className="text-primary" /> : <TrendingUp size={18} className="text-primary rotate-180" />}
                    </button>
                  </div>
                </div>

                <div className="lg:col-span-4 flex justify-end pt-2">
                  <button 
                    onClick={() => {
                      setSearchTerm('');
                      setFilters({
                        status: 'all',
                        location: '',
                        projectManager: '',
                        typology: '',
                        startDate: null,
                        endDate: null
                      });
                    }}
                    title="Limpiar filtros"
                    className="text-xs font-bold text-slate-400 hover:text-primary transition-colors flex items-center gap-1"
                  >
                    <X size={14} />
                    Limpiar Filtros
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white dark:bg-slate-900 p-4 sm:p-5 rounded-2xl border border-emerald-100 dark:border-emerald-900/30 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[10px] font-black uppercase tracking-widest text-emerald-600 dark:text-emerald-400">Monto General (En Ejecución)</p>
            <span className="text-[10px] font-black text-emerald-600 dark:text-emerald-400">{projectCostSummary.executionCount} proyectos</span>
          </div>
          <p className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white">{formatCurrency(projectCostSummary.executionBudget)}</p>
          <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 mt-1">Ejecutado: {formatCurrency(projectCostSummary.executionSpent)}</p>
        </div>
        <div className="bg-white dark:bg-slate-900 p-4 sm:p-5 rounded-2xl border border-violet-100 dark:border-violet-900/30 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[10px] font-black uppercase tracking-widest text-violet-600 dark:text-violet-400">Costos en Evaluación (Aparte)</p>
            <span className="text-[10px] font-black text-violet-600 dark:text-violet-400">{projectCostSummary.evaluationCount} proyectos</span>
          </div>
          <p className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white">{formatCurrency(projectCostSummary.evaluationBudget)}</p>
          <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 mt-1">Ejecutado: {formatCurrency(projectCostSummary.evaluationSpent)}</p>
        </div>
      </div>

      {viewMode === 'calendar' ? (
        <CalendarView projects={filteredProjects} />
      ) : viewMode === 'table' ? (
        <div className="bg-white dark:bg-slate-900 rounded-[var(--radius-theme)] border border-slate-200 dark:border-slate-800 shadow-[var(--shadow-theme)] overflow-hidden">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/50 dark:bg-slate-800/50 border-b border-slate-100 dark:border-slate-800">
                <th className="px-6 py-5 text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Obra</th>
                <th className="px-6 py-5 text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Ubicación</th>
                <th className="px-6 py-5 text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Estado</th>
                <th className="px-6 py-5 text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Presupuesto</th>
                <th className="px-6 py-5 text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
              {filteredProjects.map((project) => (
                <tr key={project.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors group">
                  <td className="px-6 py-5">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary font-bold">
                        {project.name.charAt(0)}
                      </div>
                      <span className="font-bold text-slate-900 dark:text-white">{project.name}</span>
                    </div>
                  </td>
                  <td className="px-6 py-5">
                    <span className="text-sm text-slate-500 dark:text-slate-400">{project.location}</span>
                  </td>
                  <td className="px-6 py-5">
                    <span className={cn(
                      "px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest",
                      project.status === 'Evaluation' ? "bg-violet-100 text-violet-600" :
                      project.status === 'In Progress' ? "bg-blue-100 text-blue-600" :
                      project.status === 'Completed' ? "bg-emerald-100 text-emerald-600" :
                      project.status === 'On Hold' ? "bg-amber-100 text-amber-600" :
                      "bg-slate-100 text-slate-600"
                    )}>
                      {project.status === 'Evaluation' ? 'Evaluación' :
                       project.status === 'In Progress' ? 'En Ejecución' :
                       project.status === 'Completed' ? 'Completado' :
                       project.status === 'On Hold' ? 'En Pausa' : 'Planeación'}
                    </span>
                  </td>
                  <td className="px-6 py-5">
                    <span className="font-bold text-slate-900 dark:text-white">{formatCurrency(project.budget)}</span>
                  </td>
                  <td className="px-6 py-5 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button 
                        onClick={() => handleShare(project)}
                        className="p-2 hover:bg-primary/10 rounded-lg text-primary transition-colors"
                        title="Compartir"
                      >
                        <Share size={18} />
                      </button>
                      <button 
                        onClick={() => {
                          setBudgetProject(project);
                          setIsBudgetModalOpen(true);
                        }}
                        className="p-2 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 rounded-lg text-emerald-600 transition-colors"
                        title="Presupuesto"
                      >
                        <DollarSign size={18} />
                      </button>
                      <button 
                        onClick={() => { setEditingProject(project); setNewProject(project); setIsModalOpen(true); }}
                        title="Editar"
                        className="p-2 hover:bg-blue-50 dark:hover:bg-blue-500/10 rounded-lg text-blue-600 transition-colors"
                      >
                        <Edit2 size={18} />
                      </button>
                      <button 
                        onClick={() => handleDeleteProject(project.id)}
                        title="Eliminar"
                        className="p-2 hover:bg-rose-50 dark:hover:bg-rose-500/10 rounded-lg text-rose-600 transition-colors"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : viewMode === 'grid' ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
          {paginatedProjects.length === 0 ? (
            <div className="col-span-full py-20 text-center bg-white dark:bg-slate-900 rounded-3xl border border-dashed border-slate-200 dark:border-slate-800">
              <Search className="mx-auto text-slate-300 dark:text-slate-700 mb-4" size={48} />
              <p className="text-slate-500 dark:text-slate-400 font-medium">No se encontraron proyectos que coincidan con los filtros.</p>
            </div>
          ) : (
            <AnimatePresence>
              {paginatedProjects.map((project) => {
                const physicalProgress = clampPercent(project.physicalProgress || 0);
                const financialProgress = getProjectFinancialProgress(project);
                const progressDeviation = financialProgress - physicalProgress;
                const hasAlert = progressDeviation > 15;

                return (
                  <motion.div 
                    key={project.id}
                    data-testid={`project-card-${project.id}`}
                    layout
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ 
                      opacity: 1, 
                      scale: 1,
                      rotateX: enableCardTilt && hoveredProjectId === project.id ? (mousePosition.y - 0.5) * -10 : 0,
                      rotateY: enableCardTilt && hoveredProjectId === project.id ? (mousePosition.x - 0.5) * 10 : 0,
                    }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    onMouseMove={(e) => handleMouseMove(e, project.id)}
                    onMouseLeave={() => {
                      setHoveredProjectId(null);
                      if (mouseMoveRafRef.current !== null) {
                        cancelAnimationFrame(mouseMoveRafRef.current);
                        mouseMoveRafRef.current = null;
                      }
                    }}
                    whileHover={{ 
                      scale: 1.02,
                      transition: { duration: 0.2 }
                    }}
                    style={{ perspective: 1000 }}
                    className={cn(
                      "bg-white dark:bg-slate-900 rounded-[var(--radius-theme)] shadow-[var(--shadow-theme)] border border-slate-100 dark:border-slate-800 overflow-hidden group hover:shadow-lg hover:border-primary/30 transition-all duration-500 cursor-pointer relative",
                      project.typology ? `theme-${project.typology.toLowerCase()}` : "",
                      hasAlert ? "border-rose-500 shadow-rose-100 ring-1 ring-rose-500/20" : ""
                    )}
                    onClick={() => setSelectedProjectId(project.id)}
                  >
                    {hasAlert && (
                      <div className="absolute top-4 right-4 z-10 flex flex-col items-end gap-2">
                        <div className="flex items-center gap-2 bg-rose-500 text-white px-3 py-1.5 rounded-full shadow-lg animate-bounce">
                          <AlertCircle size={14} />
                          <span className="text-[10px] font-black uppercase tracking-wider">Alerta: {progressDeviation.toFixed(1)}% Desviación</span>
                        </div>
                        <div className="hidden group-hover:flex flex-col gap-1 bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm p-3 rounded-xl border border-rose-100 dark:border-rose-900/50 shadow-xl max-w-[200px] animate-in fade-in slide-in-from-top-2">
                          <p className="text-[9px] font-black text-rose-600 uppercase tracking-widest mb-1">Mitigación Sugerida:</p>
                          {getMitigationSuggestions(progressDeviation).map((suggestion, i) => (
                            <div key={i} className="flex items-start gap-1.5">
                              <div className="w-1 h-1 rounded-full bg-rose-400 mt-1 shrink-0" />
                              <p className="text-[9px] text-slate-600 dark:text-slate-400 leading-tight">{suggestion}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    <div className="p-3 sm:p-6">
                    <div className="flex items-start justify-between mb-2 sm:mb-4">
                      <div className="p-1.5 sm:p-3 bg-primary-light/50 dark:bg-primary/20 text-primary rounded-lg sm:rounded-xl">
                        <Construction size={16} className="sm:w-6 sm:h-6" />
                      </div>
                      <div
                        className="flex flex-col items-end gap-1 sm:gap-2"
                        onPointerDown={stopCardEvent}
                        onClick={stopCardEvent}
                      >
                        <StatusBadge status={project.status} />
                        <div className="flex items-center gap-1 sm:gap-2">
                          <span className={cn("px-1 sm:px-2 py-0.5 sm:py-1 rounded-md sm:rounded-lg text-[7px] sm:text-[10px] font-black uppercase border flex items-center gap-0.5 sm:gap-1.5", getTypologyColor(project.typology))}>
                            {(() => {
                              const Icon = getTypologyIcon(project.typology);
                              return <Icon size={8} className="sm:w-3 sm:h-3" />;
                            })()}
                            {project.typology || 'N/A'}
                          </span>
                          <div className="flex items-center gap-0.5 sm:gap-1">
                            <button
                              type="button"
                              data-testid={`project-card-share-${project.id}`}
                              onPointerDown={stopCardEvent}
                              onClick={(e) => { e.stopPropagation(); handleShare(project); }}
                              className="p-2 sm:p-2.5 min-h-9 min-w-9 rounded-xl bg-white/90 dark:bg-slate-800/90 border border-slate-200 dark:border-slate-700 text-slate-500 hover:text-primary hover:border-primary/40 transition-colors"
                              title="Compartir"
                            >
                              <Share size={12} className="sm:w-[18px] sm:h-[18px]" />
                            </button>
                            <button
                              type="button"
                              data-testid={`project-card-edit-${project.id}`}
                              onPointerDown={stopCardEvent}
                              onClick={(e) => { e.stopPropagation(); handleEditProject(project); }}
                              className="p-2 sm:p-2.5 min-h-9 min-w-9 rounded-xl bg-white/90 dark:bg-slate-800/90 border border-slate-200 dark:border-slate-700 text-slate-500 hover:text-primary hover:border-primary/40 transition-colors"
                              title="Editar"
                            >
                              <Edit2 size={12} className="sm:w-[18px] sm:h-[18px]" />
                            </button>
                            <button
                              type="button"
                              data-testid={`project-card-delete-${project.id}`}
                              onPointerDown={stopCardEvent}
                              onClick={(e) => { e.stopPropagation(); handleDeleteProject(project.id); }}
                              className="p-2 sm:p-2.5 min-h-9 min-w-9 rounded-xl bg-white/90 dark:bg-slate-800/90 border border-slate-200 dark:border-slate-700 text-slate-500 hover:text-red-600 hover:border-red-300 transition-colors"
                              title="Eliminar"
                            >
                              <Trash2 size={12} className="sm:w-[18px] sm:h-[18px]" />
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 sm:gap-6 mb-3 sm:mb-6">
                      <div className="relative w-12 h-12 sm:w-20 sm:h-20 flex-shrink-0">
                        <svg viewBox="0 0 48 48" className="w-full h-full transform -rotate-90">
                          <circle
                            cx="24"
                            cy="24"
                            r="20"
                            stroke="currentColor"
                            strokeWidth="5"
                            fill="transparent"
                            className="text-slate-100 dark:text-slate-800"
                          />
                          <motion.circle
                            cx="24"
                            cy="24"
                            r="20"
                            stroke="currentColor"
                            strokeWidth="5"
                            fill="transparent"
                            strokeDasharray={125.6}
                            initial={{ strokeDashoffset: 125.6 }}
                            animate={{ strokeDashoffset: 125.6 - (125.6 * physicalProgress) / 100 }}
                            className="text-primary"
                            strokeLinecap="round"
                          />
                        </svg>
                        <div className="absolute inset-0 flex flex-col items-center justify-center">
                          <span className="text-xs sm:text-lg font-black text-slate-900 dark:text-white leading-none">{physicalProgress.toFixed(1)}%</span>
                          <span className="text-[5px] sm:text-[8px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-tighter">Físico</span>
                        </div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="text-sm sm:text-xl font-black text-slate-900 dark:text-white mb-0.5 sm:mb-1 leading-tight truncate">{project.name}</h3>
                        <div className="flex items-center gap-1 text-slate-500 dark:text-slate-400 text-[9px] sm:text-sm">
                          <MapPin size={10} className="sm:w-3.5 sm:h-3.5" />
                          <span className="truncate">{project.location}</span>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-2 sm:space-y-4">
                      <div className="grid grid-cols-2 gap-2 sm:gap-4 pt-2 sm:pt-4 border-t border-slate-100 dark:border-slate-800">
                        <div className="bg-slate-50 dark:bg-slate-800/50 p-2 sm:p-4 rounded-xl sm:rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm group-hover:bg-white dark:group-hover:bg-slate-800 transition-colors">
                          <p className="text-[7px] sm:text-[10px] text-slate-400 dark:text-slate-500 font-black uppercase tracking-wider mb-0.5 sm:mb-1">Presupuesto</p>
                          <p className="text-[10px] sm:text-lg font-black text-slate-900 dark:text-white leading-none">{formatCurrency(project.budget)}</p>
                        </div>
                        <div className="bg-rose-50 dark:bg-rose-500/10 p-2 sm:p-4 rounded-xl sm:rounded-2xl border border-rose-100 dark:border-rose-500/20 shadow-sm group-hover:bg-white dark:group-hover:bg-slate-800 transition-colors">
                          <p className="text-[7px] sm:text-[10px] text-rose-400 dark:text-rose-500 font-black uppercase tracking-wider mb-0.5 sm:mb-1">Ejecutado</p>
                          <p className="text-[10px] sm:text-lg font-black text-rose-600 dark:text-rose-400 leading-none">{formatCurrency(project.spent)}</p>
                        </div>
                        {(project.typology === 'COMERCIAL' || project.typology === 'INDUSTRIAL') && project.area > 0 && (
                          <div className="bg-blue-50 dark:bg-blue-500/10 p-2 sm:p-4 rounded-xl sm:rounded-2xl border border-blue-100 dark:border-blue-500/20 shadow-sm group-hover:bg-white dark:group-hover:bg-slate-800 transition-colors col-span-2">
                            <p className="text-[7px] sm:text-[10px] text-blue-400 dark:text-blue-500 font-black uppercase tracking-wider mb-0.5 sm:mb-1">Costo por Metro Cuadrado</p>
                            <div className="flex items-center justify-between">
                              <p className="text-[10px] sm:text-lg font-black text-blue-600 dark:text-blue-400 leading-none">
                                {formatCurrency(project.spent / project.area)}/m²
                              </p>
                              <span className="text-[7px] sm:text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase">Área: {project.area} m²</span>
                            </div>
                          </div>
                        )}
                        <div className="bg-emerald-50 dark:bg-emerald-500/10 p-2 sm:p-4 rounded-xl sm:rounded-2xl border border-emerald-100 dark:border-emerald-500/20 shadow-sm group-hover:bg-white dark:group-hover:bg-slate-800 transition-colors col-span-2">
                          <p className="text-[7px] sm:text-[10px] text-emerald-400 dark:text-emerald-500 font-black uppercase tracking-wider mb-0.5 sm:mb-1">Progreso Financiero</p>
                          <div className="flex items-center gap-2 sm:gap-3">
                            <p className="text-[10px] sm:text-lg font-black text-emerald-600 dark:text-emerald-400 leading-none">
                              {`${financialProgress.toFixed(1)}%`}
                            </p>
                            <progress
                              className="flex-1 h-1 sm:h-2 [&::-webkit-progress-bar]:bg-emerald-100 dark:[&::-webkit-progress-bar]:bg-emerald-500/20 [&::-webkit-progress-value]:bg-emerald-500 [&::-moz-progress-bar]:bg-emerald-500 rounded-full overflow-hidden"
                              value={financialProgress}
                              max={100}
                              title="Progreso financiero"
                            />
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-col gap-1 sm:gap-2 pt-2 sm:pt-4 text-[9px] sm:text-xs text-slate-500 dark:text-slate-400 border-t border-slate-50 dark:border-slate-800/50">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1">
                            <Calendar size={10} className="sm:w-3.5 sm:h-3.5" />
                            <span>Inicio: {project.startDate ? formatDate(project.startDate) : 'N/A'}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <TrendingUp size={10} className="sm:w-3.5 sm:h-3.5 text-emerald-500" />
                            <span>{financialProgress.toFixed(1)}% Finan.</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          <Clock size={10} className="sm:w-3.5 sm:h-3.5" />
                          <span>Fin: {project.endDate ? formatDate(project.endDate) : 'N/A'}</span>
                        </div>
                      </div>

                      {hasAlert && (
                        <div className="mt-4 p-4 bg-rose-50 dark:bg-rose-500/10 rounded-xl border border-rose-100 dark:border-rose-500/20">
                          <div className="flex items-center gap-2 text-rose-700 dark:text-rose-400 font-bold text-xs mb-2">
                            <ShieldAlert size={14} />
                            Acciones de Mitigación Sugeridas
                          </div>
                          <ul className="space-y-1">
                            {getMitigationSuggestions(progressDeviation).map((s, idx) => (
                              <li key={idx} className="text-[10px] text-rose-600 dark:text-rose-400 flex items-start gap-1.5">
                                <span className="mt-1 w-1 h-1 bg-rose-400 dark:bg-rose-500 rounded-full flex-shrink-0" />
                                {s}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  </div>
                  <div
                    className="px-4 sm:px-6 py-3 sm:py-4 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-100 dark:border-slate-800 flex justify-between items-center"
                    onPointerDown={stopCardEvent}
                    onClick={stopCardEvent}
                  >
                    <div className="flex gap-2 sm:gap-4 overflow-x-auto no-scrollbar">
                      <button
                        type="button"
                        data-testid={`project-card-map-${project.id}`}
                        onPointerDown={stopCardEvent}
                        onClick={(e) => {
                          e.stopPropagation();
                          setProjectForMap(project);
                          setIsMapOpen(true);
                        }}
                        className="text-[10px] sm:text-xs font-bold text-slate-600 dark:text-slate-400 hover:text-primary flex items-center gap-1 transition-colors whitespace-nowrap"
                        title="Ver en Mapa"
                      >
                        <MapPin size={12} className="sm:w-3.5 sm:h-3.5" />
                        Mapa
                      </button>
                      <button
                        type="button"
                        data-testid={`project-card-report-${project.id}`}
                        onPointerDown={stopCardEvent}
                        onClick={(e) => {
                          e.stopPropagation();
                          generateReport(project);
                        }}
                        className="text-[10px] sm:text-xs font-bold text-slate-600 dark:text-slate-400 hover:text-primary flex items-center gap-1 transition-colors whitespace-nowrap"
                        title="Informe General"
                      >
                        <FileText size={12} className="sm:w-3.5 sm:h-3.5" />
                        Informe
                      </button>
                      <button
                        type="button"
                        data-testid={`project-card-budget-report-${project.id}`}
                        onPointerDown={stopCardEvent}
                        onClick={(e) => {
                          e.stopPropagation();
                          generateBudgetReport(project);
                        }}
                        className="text-[10px] sm:text-xs font-bold text-slate-600 dark:text-slate-400 hover:text-primary flex items-center gap-1 transition-colors whitespace-nowrap"
                        title="Presupuesto Detallado"
                      >
                        <Download size={12} className="sm:w-3.5 sm:h-3.5" />
                        PDF
                      </button>
                      <button
                        type="button"
                        data-testid={`project-card-budget-${project.id}`}
                        onPointerDown={stopCardEvent}
                        onClick={(e) => {
                          e.stopPropagation();
                          setBudgetProject(project);
                          setIsBudgetModalOpen(true);
                        }}
                        className="text-[10px] sm:text-xs font-bold text-slate-600 dark:text-slate-400 hover:text-primary flex items-center gap-1 transition-colors whitespace-nowrap"
                      >
                        <DollarSign size={12} className="sm:w-3.5 sm:h-3.5" />
                        Presupuesto
                      </button>
                    </div>
                    <button
                      type="button"
                      data-testid={`project-card-view-${project.id}`}
                      onPointerDown={stopCardEvent}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedProjectId(project.id);
                      }}
                      className="text-[10px] sm:text-xs font-bold text-primary hover:underline flex items-center gap-1 whitespace-nowrap ml-2"
                    >
                      <ChevronRight size={12} className="sm:w-3.5 sm:h-3.5" />
                      Ver
                    </button>
                  </div>
                </motion.div>
              )})}
            </AnimatePresence>
          )}
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-100 dark:border-slate-800">
                  <th className="px-3 sm:px-6 py-2 sm:py-4 text-micro font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Obra</th>
                  <th className="px-3 sm:px-6 py-2 sm:py-4 text-micro font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Ubicación</th>
                  <th className="px-3 sm:px-6 py-2 sm:py-4 text-micro font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Director</th>
                  <th className="px-3 sm:px-6 py-2 sm:py-4 text-micro font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Tipología</th>
                  <th className="px-3 sm:px-6 py-2 sm:py-4 text-micro font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Estado</th>
                  <th className="px-3 sm:px-6 py-2 sm:py-4 text-micro font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Presupuesto</th>
                  <th className="px-3 sm:px-6 py-2 sm:py-4 text-micro font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Costo/m²</th>
                  <th className="px-3 sm:px-6 py-2 sm:py-4 text-micro font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
                {paginatedProjects.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-6 py-12 text-center text-slate-400 dark:text-slate-500">
                      No se encontraron proyectos que coincidan con los filtros.
                    </td>
                  </tr>
                ) : (
                  paginatedProjects.map((project) => (
                    <tr 
                      key={project.id} 
                      className={cn(
                        "hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-all duration-200 cursor-pointer group",
                        project.typology ? `theme-${project.typology.toLowerCase()}` : ""
                      )}
                    >
                      <td className="px-3 sm:px-6 py-2 sm:py-4">
                        <div className="flex items-center gap-2 sm:gap-3">
                          <div className="p-1.5 sm:p-2 bg-primary-light/50 dark:bg-primary/10 text-primary rounded-lg sm:rounded-xl group-hover:scale-110 transition-transform duration-200">
                            <Construction size={16} className="sm:w-[18px] sm:h-[18px]" />
                          </div>
                          <span className="font-bold text-xs sm:text-sm text-slate-900 dark:text-white group-hover:text-primary transition-colors">{project.name}</span>
                        </div>
                      </td>
                      <td className="px-3 sm:px-6 py-2 sm:py-4">
                        <div className="flex items-center gap-1 sm:gap-2 text-slate-600 dark:text-slate-400 text-[10px] sm:text-sm">
                          <MapPin size={12} className="text-slate-400 dark:text-slate-500 sm:w-3.5 sm:h-3.5" />
                          <span className="truncate max-w-[100px] sm:max-w-none">{project.location}</span>
                        </div>
                      </td>
                      <td className="px-3 sm:px-6 py-2 sm:py-4 text-[10px] sm:text-sm text-slate-600 dark:text-slate-400 font-medium">{project.projectManager || 'N/A'}</td>
                      <td className="px-3 sm:px-6 py-2 sm:py-4">
                        <span className={cn("px-1.5 sm:px-2.5 py-1 sm:py-1.5 rounded-md sm:rounded-lg text-[8px] sm:text-[10px] font-bold uppercase flex items-center gap-1 sm:gap-2 w-fit border", getTypologyColor(project.typology))}>
                          {(() => {
                            const Icon = getTypologyIcon(project.typology);
                            return <Icon size={10} className="sm:w-3 sm:h-3" />;
                          })()}
                          {project.typology || 'N/A'}
                        </span>
                      </td>
                      <td className="px-3 sm:px-6 py-2 sm:py-4">
                        <StatusBadge status={project.status} />
                      </td>
                      <td className="px-3 sm:px-6 py-2 sm:py-4">
                        <div className="flex flex-col">
                          <span className="font-bold text-xs sm:text-sm text-slate-900 dark:text-white">{formatCurrency(project.budget)}</span>
                          <div className="mt-1 space-y-1">
                            <progress
                              className="w-16 sm:w-24 h-1 sm:h-1.5 [&::-webkit-progress-bar]:bg-blue-100 dark:[&::-webkit-progress-bar]:bg-blue-900/30 [&::-webkit-progress-value]:bg-blue-500 [&::-moz-progress-bar]:bg-blue-500 rounded-full overflow-hidden"
                              value={clampPercent(project.physicalProgress || 0)}
                              max={100}
                              title="Avance físico"
                            />
                            <progress
                              className="w-16 sm:w-24 h-1 sm:h-1.5 [&::-webkit-progress-bar]:bg-emerald-100 dark:[&::-webkit-progress-bar]:bg-emerald-900/30 [&::-webkit-progress-value]:bg-emerald-500 [&::-moz-progress-bar]:bg-emerald-500 rounded-full overflow-hidden"
                              value={getProjectFinancialProgress(project)}
                              max={100}
                              title="Avance financiero"
                            />
                          </div>
                        </div>
                      </td>
                      <td className="px-3 sm:px-6 py-2 sm:py-4">
                        {(project.typology === 'COMERCIAL' || project.typology === 'INDUSTRIAL') && project.area > 0 ? (
                          <div className="flex flex-col">
                            <span className="font-bold text-xs sm:text-sm text-blue-600 dark:text-blue-400">{formatCurrency(project.spent / project.area)}</span>
                            <span className="text-[8px] sm:text-micro text-slate-400 dark:text-slate-500 uppercase">por m²</span>
                          </div>
                        ) : (
                          <span className="text-slate-300 dark:text-slate-700 text-xs sm:text-sm">N/A</span>
                        )}
                      </td>
                      <td className="px-3 sm:px-6 py-2 sm:py-4 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex justify-end gap-1 sm:gap-2">
                          <button 
                            onClick={() => {
                              setBudgetProject(project);
                              setIsBudgetModalOpen(true);
                            }}
                            className="flex items-center gap-1 sm:gap-2 px-2 sm:px-4 py-1.5 sm:py-2 bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded-lg sm:rounded-xl text-[10px] sm:text-xs font-bold hover:bg-slate-100 dark:hover:bg-slate-700 transition-all whitespace-nowrap"
                            title="Presupuesto"
                          >
                            <DollarSign size={12} className="sm:w-3.5 sm:h-3.5" />
                            <span className="hidden xs:inline">Presupuesto</span>
                          </button>
                          <button 
                            onClick={() => setSelectedProjectId(project.id)}
                            title="Ver detalles"
                            className="flex items-center gap-1 sm:gap-2 px-2 sm:px-4 py-1.5 sm:py-2 bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded-lg sm:rounded-xl text-[10px] sm:text-xs font-bold hover:bg-slate-100 dark:hover:bg-slate-700 transition-all whitespace-nowrap"
                          >
                            <Eye size={12} className="sm:w-3.5 sm:h-3.5" />
                            <span className="hidden xs:inline">Detalles</span>
                          </button>
                          <button 
                            onClick={() => handleEditProject(project)}
                            title="Editar"
                            className="p-1.5 sm:p-2 text-slate-400 dark:text-slate-500 hover:text-primary dark:hover:text-primary transition-colors"
                          >
                            <Edit2 size={14} className="sm:w-[18px] sm:h-[18px]" />
                          </button>
                          <button 
                            onClick={() => handleDeleteProject(project.id)}
                            title="Eliminar"
                            className="p-1.5 sm:p-2 text-slate-400 dark:text-slate-500 hover:text-red-600 dark:hover:text-red-400 transition-colors"
                          >
                            <Trash2 size={14} className="sm:w-[18px] sm:h-[18px]" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Pagination Controls */}
      {filteredProjects.length > 0 && (
        <div className="flex flex-col md:flex-row items-center justify-between gap-4 bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm">
          <div className="flex items-center gap-4">
            <span className="text-sm text-slate-500 dark:text-slate-400 font-medium">
              Mostrando {paginatedProjects.length} de {filteredProjects.length} proyectos
            </span>
            <div className="flex items-center gap-2">
              <label className="text-micro font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Por página:</label>
              <select 
                title="Cantidad de proyectos por página"
                className="px-2 py-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-bold outline-none text-slate-900 dark:text-white focus:ring-2 focus:ring-primary/20 transition-all"
                value={itemsPerPage}
                onChange={(e) => setItemsPerPage(Number(e.target.value))}
              >
                <option value={6}>6</option>
                <option value={12}>12</option>
                <option value={24}>24</option>
                <option value={48}>48</option>
              </select>
            </div>
          </div>
          {totalPages > 1 && (
            <div className="flex items-center gap-2">
              <button 
                disabled={currentPage === 1}
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                title="Página anterior"
                className="p-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-slate-600 dark:text-slate-400"
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
                title="Página siguiente"
                className="p-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-slate-600 dark:text-slate-400"
              >
                <ChevronRight size={20} />
              </button>
            </div>
          )}
        </div>
      )}
      <FormModal 
        isOpen={isModalOpen} 
        onClose={() => { setIsModalOpen(false); setEditingProject(null); setCurrentStep(0); }}
        title={editingProject ? 'Editar Obra' : 'Nueva Obra'}
        fullVertical
        footer={
          <div className="flex items-center justify-between w-full gap-4">
            <div className="flex items-center gap-2">
              {currentStep > 0 && (
                <button 
                  type="button"
                  onClick={() => setCurrentStep(prev => prev - 1)}
                  className="flex items-center justify-center gap-2 px-6 py-4 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 font-black rounded-2xl border-2 border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all uppercase text-xs tracking-widest"
                >
                  <ChevronLeft size={18} />
                  Anterior
                </button>
              )}
            </div>
            
            <div className="flex items-center gap-3">
              <button 
                type="button"
                onClick={() => { setIsModalOpen(false); setEditingProject(null); setCurrentStep(0); }}
                className="hidden sm:flex items-center justify-center gap-2 px-6 py-4 bg-white dark:bg-slate-900 text-slate-400 font-black rounded-2xl border-2 border-transparent hover:text-rose-500 transition-all uppercase text-xs tracking-widest"
              >
                Cancelar
              </button>
              
              {currentStep < 2 ? (
                <button 
                  type="button"
                  onClick={() => {
                    // Basic validation before next step
                    if (currentStep === 0) {
                      const errors: any = {};
                      if (!newProject.name) errors.name = 'Obligatorio';
                      if (!newProject.location) errors.location = 'Obligatorio';
                      if (!newProject.projectManager) errors.projectManager = 'Obligatorio';
                      if (Object.keys(errors).length > 0) {
                        setValidationErrors(errors);
                        toast.error('Complete los campos obligatorios');
                        return;
                      }
                    }
                    if (currentStep === 1) {
                      const errors: any = {};
                      if (!newProject.area) errors.area = 'Obligatorio';
                      if (Object.keys(errors).length > 0) {
                        setValidationErrors(errors);
                        toast.error('Complete los campos obligatorios');
                        return;
                      }
                    }
                    setCurrentStep(prev => prev + 1);
                  } }
                  className="flex items-center justify-center gap-2 px-10 py-4 bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-black rounded-2xl hover:bg-slate-800 dark:hover:bg-slate-100 transition-all shadow-xl shadow-slate-200 dark:shadow-none uppercase text-xs tracking-widest group"
                >
                  Siguiente
                  <ChevronRight size={18} className="group-hover:translate-x-1 transition-transform" />
                </button>
              ) : (
                <button 
                  type="submit"
                  form="project-form"
                  className="flex items-center justify-center gap-2 px-10 py-4 bg-primary text-white font-black rounded-2xl hover:bg-primary-hover transition-all shadow-xl shadow-primary-shadow uppercase text-xs tracking-widest group"
                >
                  {editingProject ? 'Guardar Cambios' : 'Finalizar Registro'}
                  <Check size={18} className="group-hover:scale-110 transition-transform" />
                </button>
              )}
            </div>
          </div>
        }
      >
        <StepForm
          formId="project-form"
          currentStep={currentStep}
          onStepChange={setCurrentStep}
          onSubmit={handleAddProject}
          steps={[
            {
              title: "General",
              content: (
                <FormSection title="Información General" icon={Info} description="Datos básicos de identificación de la obra">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] ml-1">Nombre de la Obra *</label>
                      <button
                        type="button"
                        onClick={handleAISuggestions}
                        disabled={isGenerating || !newProject.name}
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
                      value={newProject.name}
                      onChange={(e) => {
                        setNewProject({...newProject, name: e.target.value});
                        validateField('name', e.target.value);
                      }}
                      error={validationErrors.name}
                      placeholder="Ej: Edificio Las Margaritas"
                    />
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] ml-1">Ubicación *</label>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={async () => {
                            if (!newProject.location) {
                              toast.error('Ingrese una ubicación para validar');
                              return;
                            }
                            toast.loading('Validando ubicación...', { id: 'geo-validate' });
                            try {
                              const coords = await geocodeAddress(newProject.location);
                              if (coords) {
                                setNewProject(prev => ({
                                  ...prev,
                                  latitude: coords.lat.toString(),
                                  longitude: coords.lng.toString()
                                }));
                                toast.success('Ubicación validada y coordenadas actualizadas', { id: 'geo-validate' });
                              } else {
                                toast.error('No se pudo geocodificar la ubicación', { id: 'geo-validate' });
                              }
                            } catch (err) {
                              toast.error('Error al validar ubicación', { id: 'geo-validate' });
                            }
                          }}
                          className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-blue-600 hover:text-blue-700 transition-colors"
                        >
                          <CheckCircle2 size={12} />
                          Validar
                        </button>
                          <button
                            type="button"
                            onClick={() => {
                              setProjectForMap({
                                name: newProject.name || 'Nueva Obra',
                                location: newProject.location || 'Sin ubicación',
                                latitude: newProject.latitude,
                                longitude: newProject.longitude,
                                pois: [] // New projects don't have POIs yet
                              });
                              setIsSelectionMode(true);
                              setIsMapOpen(true);
                            }}
                            className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-emerald-600 hover:text-emerald-700 transition-colors"
                          >
                            <MapPin size={12} />
                            Seleccionar en Mapa
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setProjectForMap({
                                name: newProject.name || 'Nueva Obra',
                                location: newProject.location || 'Sin ubicación',
                                latitude: newProject.latitude,
                                longitude: newProject.longitude,
                                pois: [] // New projects don't have POIs yet
                              });
                              setIsSelectionMode(false);
                              setIsMapOpen(true);
                            }}
                            className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-primary hover:text-primary-hover transition-colors"
                          >
                            <Navigation size={12} />
                            Ver en Mapa
                          </button>
                      </div>
                    </div>
                    <FormInput 
                      label=""
                      required
                      value={newProject.location}
                      onChange={(e) => {
                        setNewProject({...newProject, location: e.target.value});
                        validateField('location', e.target.value);
                      }}
                      error={validationErrors.location}
                      placeholder="Ej: Ciudad de Guatemala"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <FormInput 
                        label="Latitud (Opcional)"
                        type="number"
                        step="any"
                        value={newProject.latitude}
                        onChange={(e) => setNewProject({...newProject, latitude: e.target.value})}
                        placeholder="Ej: 14.6349"
                      />
                    </div>
                    <div className="space-y-2">
                      <FormInput 
                        label="Longitud (Opcional)"
                        type="number"
                        step="any"
                        value={newProject.longitude}
                        onChange={(e) => setNewProject({...newProject, longitude: e.target.value})}
                        placeholder="Ej: -90.5069"
                      />
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleCaptureLocation}
                    className="w-full py-3 bg-primary/5 text-primary border-2 border-primary/20 hover:border-primary font-bold rounded-xl transition-all text-xs uppercase tracking-widest flex items-center justify-center gap-2"
                  >
                    <Navigation size={14} />
                    Capturar GPS desde el Dispositivo
                  </button>
                  <FormInput 
                    label="Director de Proyecto"
                    required
                    value={newProject.projectManager}
                    onChange={(e) => {
                      setNewProject({...newProject, projectManager: e.target.value});
                      validateField('projectManager', e.target.value);
                    }}
                    error={validationErrors.projectManager}
                    placeholder="Nombre del responsable"
                  />
                  <FormSelect 
                    label="Cliente"
                    value={newProject.clientUid}
                    onChange={(e) => setNewProject({...newProject, clientUid: e.target.value})}
                  >
                    <option value="">Seleccionar Cliente (Opcional)</option>
                    {clients.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </FormSelect>
                </FormSection>
              )
            },
            {
              title: "Presupuesto",
              content: (
                <FormSection title="Presupuesto y Estado" icon={DollarSign} description="Control financiero y tipología de la construcción">
                  <FormInput 
                    label="Área de Construcción (m²)"
                    required
                    type="number" 
                    min="0"
                    step="any"
                    value={newProject.area}
                    onChange={(e) => {
                      setNewProject({...newProject, area: e.target.value});
                      validateField('area', e.target.value);
                    }}
                    error={validationErrors.area}
                    placeholder="Ej: 150"
                  />
                  <div className="md:col-span-2 p-4 rounded-2xl border border-dashed border-primary/30 bg-primary/5">
                    <p className="text-[10px] font-black uppercase tracking-widest text-primary mb-1">Presupuesto del proyecto</p>
                    <p className="text-sm font-bold text-slate-700 dark:text-slate-300">
                      Se determina automaticamente con el total del modulo de presupuesto (partidas APU). No se ingresa manualmente.
                    </p>
                  </div>
                  <FormInput 
                    label="Monto Ejecutado (GTQ)"
                    required
                    type="number" 
                    min="0"
                    step="any"
                    value={newProject.spent}
                    onChange={(e) => {
                      setNewProject({...newProject, spent: e.target.value});
                      validateField('spent', e.target.value);
                    }}
                    error={validationErrors.spent}
                  />
                  <FormSelect 
                    label="Tipología"
                    value={newProject.typology}
                    onChange={(e) => setNewProject({...newProject, typology: e.target.value})}
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
                  </FormSelect>

                  {newProject.area && newProject.typology && (
                    <motion.div 
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="md:col-span-2 p-6 bg-primary/5 border-2 border-primary/20 rounded-3xl space-y-4"
                    >
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-primary/10 rounded-xl text-primary">
                          <Calculator size={20} />
                        </div>
                        <div>
                          <h4 className="text-xs font-black text-primary uppercase tracking-widest">Presupuesto Estimado</h4>
                          <p className="text-[10px] text-slate-500 font-medium">{MARKET_DATA[newProject.typology as keyof typeof MARKET_DATA]?.description}</p>
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-6 pt-2">
                        <div className="space-y-1">
                          <p className="text-[10px] font-black text-slate-400 uppercase tracking-tighter">Costo Sugerido m²</p>
                          <p className="text-xl font-black text-slate-900 dark:text-white">
                            {formatCurrency(MARKET_DATA[newProject.typology as keyof typeof MARKET_DATA]?.pricePerM2 || 0)}
                          </p>
                        </div>
                        <div className="space-y-1">
                          <p className="text-[10px] font-black text-slate-400 uppercase tracking-tighter">Costo Total Estimado</p>
                          <p className="text-xl font-black text-primary">
                            {formatCurrency((parseFloat(newProject.area) || 0) * (MARKET_DATA[newProject.typology as keyof typeof MARKET_DATA]?.pricePerM2 || 0))}
                          </p>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          const estimated = (parseFloat(newProject.area) || 0) * (MARKET_DATA[newProject.typology as keyof typeof MARKET_DATA]?.pricePerM2 || 0);
                          setNewProject({ ...newProject, budget: estimated.toString() });
                          toast.success('Presupuesto actualizado con la estimación');
                        }}
                        className="w-full py-3 bg-white dark:bg-slate-900 text-primary border-2 border-primary/20 hover:border-primary font-bold rounded-xl transition-all text-xs uppercase tracking-widest"
                      >
                        Aplicar Estimación
                      </button>
                    </motion.div>
                  )}

                  <FormSelect 
                    label="Estado"
                    value={newProject.status}
                    onChange={(e) => setNewProject({...newProject, status: e.target.value})}
                  >
                    <option value="Evaluation">Evaluación</option>
                    <option value="Planning">Planeación</option>
                    <option value="In Progress">En Ejecución</option>
                    <option value="On Hold">En Pausa</option>
                    <option value="Completed">Completado</option>
                  </FormSelect>
                  <FormInput 
                    label="Avance Físico (%)"
                    required
                    type="number" 
                    min="0"
                    max="100"
                    value={newProject.physicalProgress}
                    onChange={(e) => {
                      setNewProject({...newProject, physicalProgress: e.target.value});
                      validateField('physicalProgress', e.target.value);
                    }}
                    error={validationErrors.physicalProgress}
                  />
                </FormSection>
              )
            },
            {
              title: "Cronograma",
              content: (
                <FormSection title="Cronograma" icon={Calendar} description="Fechas estimadas de ejecución">
                  <div className="space-y-2 group">
                    <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] ml-1 group-focus-within:text-primary transition-colors">
                      Fecha Inicio
                    </label>
                    <div className="relative">
                      <DatePicker
                        selected={newProject.startDate ? new Date(newProject.startDate) : null}
                        onChange={(date) => {
                          const val = date?.toISOString().split('T')[0] || '';
                          setNewProject({...newProject, startDate: val});
                          validateField('startDate', val);
                        }}
                        className={cn(
                          "w-full px-5 py-4 bg-white dark:bg-slate-900 border-2 rounded-2xl focus:outline-none transition-all duration-300 font-medium text-slate-900 dark:text-white",
                          validationErrors.startDate ? "border-rose-100 bg-rose-50/30 focus:border-rose-500" : "border-slate-100 dark:border-slate-800 focus:border-primary focus:ring-4 focus:ring-primary/5 shadow-sm"
                        )}
                        placeholderText="Seleccionar fecha"
                        dateFormat="dd/MM/yyyy"
                      />
                      {validationErrors.startDate && <p className="text-[10px] text-rose-500 font-black mt-1.5 ml-1 uppercase tracking-wider">{validationErrors.startDate}</p>}
                    </div>
                  </div>
                  <div className="space-y-2 group">
                    <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] ml-1 group-focus-within:text-primary transition-colors">
                      Fecha Fin Estimada
                    </label>
                    <div className="relative">
                      <DatePicker
                        selected={newProject.endDate ? new Date(newProject.endDate) : null}
                        onChange={(date) => {
                          const val = date?.toISOString().split('T')[0] || '';
                          setNewProject({...newProject, endDate: val});
                          validateField('endDate', val);
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
      <AnimatePresence>
      {isEmailModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <motion.div 
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden"
          >
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-primary text-white">
              <h2 className="text-xl font-bold">Enviar Informe</h2>
              <button onClick={() => setIsEmailModalOpen(false)} title="Cerrar" className="p-2 hover:bg-primary-hover rounded-full transition-colors">
                <X size={24} />
              </button>
            </div>
            <div className="p-8 space-y-6 max-h-[80vh] overflow-y-auto custom-scrollbar">
              <div className="space-y-4">
                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                  <p className="text-sm text-slate-600">Se enviará el informe de <strong>{reportingProject?.name}</strong> al siguiente correo:</p>
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
              <div className="flex gap-4">
                <button 
                  onClick={() => setIsEmailModalOpen(false)}
                  className="flex-1 py-4 px-6 bg-slate-100 text-slate-600 font-bold rounded-xl hover:bg-slate-200 transition-all"
                >
                  Cancelar
                </button>
                <button 
                  onClick={confirmSendEmail}
                  className="flex-1 py-4 px-6 bg-primary text-white font-bold rounded-xl hover:bg-primary-hover transition-all shadow-lg shadow-primary-shadow flex items-center justify-center gap-2"
                >
                  <Send size={18} />
                  Enviar
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
      </AnimatePresence>
      {isBudgetModalOpen && budgetProject && (
        <ProjectBudget 
          project={budgetProject} 
          onProjectChange={(nextProject) => setBudgetProject(nextProject)}
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
          setNewProject(prev => ({
            ...prev,
            latitude: lat.toString(),
            longitude: lng.toString()
          }));
          toast.success('Coordenadas actualizadas desde el mapa');
        }}
      />
      <ProjectMap 
        isOpen={isGlobalMapOpen} 
        onClose={() => setIsGlobalMapOpen(false)} 
        projects={filteredProjects} 
      />
    </div>
    </>
  );
}
