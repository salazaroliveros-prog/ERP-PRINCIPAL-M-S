import TopbarNotificationButton from './components/TopbarNotificationButton';
import React, { useCallback, useEffect, useMemo, useRef, useState, Suspense, lazy } from 'react';
import { HashRouter as Router, Routes, Route, Navigate, Link, useLocation } from 'react-router-dom';
import { onAuthStateChanged, signInWithPopup, GoogleAuthProvider, User, auth, getFallbackAvatarUrl } from './lib/authStorageClient';
import { 
  LayoutDashboard, 
  Users, 
  Package, 
  HandCoins, 
  FileText, 
  LogOut, 
  Menu, 
  X,
  HardHat,
  Wrench,
  TrendingUp,
  AlertCircle,
  ShoppingBag,
  Wifi,
  WifiOff,
  Moon,
  Sun,
  CalendarDays,
  Clock3,
  ChevronRight,
  BellRing,
  Plus,
  Trash2,
  CheckCircle2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from './lib/utils';
import { exportNavMetricsSnapshot, markNavigationComplete, markNavigationStart } from './lib/navMetrics';
import { getSavedStartupSound, playStartupSound } from './lib/startupSound';
import {
  CalendarReminder,
  createReminder,
  deleteReminder,
  getRemindersChangedEventName,
  loadReminders,
  requestReminderNotificationPermission,
  syncRemindersFromServer,
  toggleReminderCompleted,
  updateReminder,
} from './lib/reminders';

import { ThemeProvider, useTheme } from './contexts/ThemeContext';
import { NotificationProvider } from './contexts/NotificationContext';
import { Toaster, toast } from 'sonner';
import { Analytics as VercelAnalytics } from '@vercel/analytics/react';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';

// Lazy Loaded Components for Performance
const loadDashboard = () => import('./components/Dashboard');
const loadProjects = () => import('./components/Projects');
const loadInventory = () => import('./components/Inventory');
const loadFinancials = () => import('./components/Financials');

const Dashboard = lazy(loadDashboard);
const Projects = lazy(loadProjects);
const Clients = lazy(() => import('./components/Clients'));
const Inventory = lazy(loadInventory);
const Financials = lazy(loadFinancials);
const Tasks = lazy(() => import('./components/Tasks'));
const Quotes = lazy(() => import('./components/Quotes'));
const Equipment = lazy(() => import('./components/Equipment'));
const Subcontracts = lazy(() => import('./components/Subcontracts'));
const PurchaseOrders = lazy(() => import('./components/PurchaseOrders'));
const HR = lazy(() => import('./components/HR'));
const Analytics = lazy(() => import('./components/Analytics'));
const Suppliers = lazy(() => import('./components/Suppliers'));
const Safety = lazy(() => import('./components/Safety'));
const Documents = lazy(() => import('./components/Documents'));
const Settings = lazy(() => import('./components/Settings'));
const Workflows = lazy(() => import('./components/Workflows'));
const AuditLogs = lazy(() => import('./components/AuditLogs'));
const RiskManagement = lazy(() => import('./components/RiskManagement'));
const AIChat = lazy(() => import('./components/AIChat'));
const QuickActionsLauncher = lazy(() =>
  import('./components/QuickActionsLauncher').then((module) => ({ default: module.QuickActionsLauncher }))
);
const SideToolsDock = lazy(() =>
  import('./components/SideToolsDock').then((module) => ({ default: module.SideToolsDock }))
);
const NotificationsDock = lazy(() =>
  import('./components/NotificationsDock').then((module) => ({ default: module.NotificationsDock }))
);
const HRContractSignPage = lazy(() => import('./components/HRContractSignPage'));
const NotificationManager = lazy(() =>
  import('./components/NotificationManager').then((module) => ({ default: module.NotificationManager }))
);
const Sidebar = lazy(() =>
  import('./components/Sidebar').then((module) => ({ default: module.Sidebar }))
);
const SyncStatus = lazy(() =>
  import('./components/SyncStatus').then((module) => ({ default: module.SyncStatus }))
);
import NavMetricsPanel from './components/NavMetricsPanel';
import MeshBackground from './components/MeshBackground';

import ErrorBoundary from './components/ErrorBoundary';

const PREFETCH_ENABLED = (import.meta.env.VITE_PREFETCH_ENABLED ?? 'true') !== 'false';
const NAV_METRICS_ENABLED = import.meta.env.DEV && import.meta.env.VITE_NAV_METRICS === 'true';
const MODULE_LAYOUT_PROFILE_STORAGE_KEY = 'module_layout_profile_v1';
const MODULE_SUBMODULE_LAYOUT_PROFILE_STORAGE_KEY = 'module_submodule_layout_profile_v1';

type ModuleLayoutProfile = 'compact' | 'balanced' | 'airy';
type ModuleLayoutMap = {
  dashboard: ModuleLayoutProfile;
  projects: ModuleLayoutProfile;
  financials: ModuleLayoutProfile;
};

type SubmoduleLayoutMap = {
  clients: ModuleLayoutProfile;
  purchaseOrders: ModuleLayoutProfile;
};

const DEFAULT_MODULE_LAYOUTS: ModuleLayoutMap = {
  dashboard: 'balanced',
  projects: 'airy',
  financials: 'compact',
};

const DEFAULT_SUBMODULE_LAYOUTS: SubmoduleLayoutMap = {
  clients: 'airy',
  purchaseOrders: 'compact',
};

function loadModuleLayoutProfiles(): ModuleLayoutMap {
  try {
    const raw = localStorage.getItem(MODULE_LAYOUT_PROFILE_STORAGE_KEY);
    if (!raw) return DEFAULT_MODULE_LAYOUTS;

    const parsed = JSON.parse(raw) as Partial<ModuleLayoutMap>;
    const allowed = new Set<ModuleLayoutProfile>(['compact', 'balanced', 'airy']);

    return {
      dashboard: allowed.has(parsed.dashboard as ModuleLayoutProfile) ? (parsed.dashboard as ModuleLayoutProfile) : DEFAULT_MODULE_LAYOUTS.dashboard,
      projects: allowed.has(parsed.projects as ModuleLayoutProfile) ? (parsed.projects as ModuleLayoutProfile) : DEFAULT_MODULE_LAYOUTS.projects,
      financials: allowed.has(parsed.financials as ModuleLayoutProfile) ? (parsed.financials as ModuleLayoutProfile) : DEFAULT_MODULE_LAYOUTS.financials,
    };
  } catch {
    return DEFAULT_MODULE_LAYOUTS;
  }
}

function loadSubmoduleLayoutProfiles(): SubmoduleLayoutMap {
  try {
    const raw = localStorage.getItem(MODULE_SUBMODULE_LAYOUT_PROFILE_STORAGE_KEY);
    if (!raw) return DEFAULT_SUBMODULE_LAYOUTS;

    const parsed = JSON.parse(raw) as Partial<SubmoduleLayoutMap>;
    const allowed = new Set<ModuleLayoutProfile>(['compact', 'balanced', 'airy']);

    return {
      clients: allowed.has(parsed.clients as ModuleLayoutProfile) ? (parsed.clients as ModuleLayoutProfile) : DEFAULT_SUBMODULE_LAYOUTS.clients,
      purchaseOrders: allowed.has(parsed.purchaseOrders as ModuleLayoutProfile) ? (parsed.purchaseOrders as ModuleLayoutProfile) : DEFAULT_SUBMODULE_LAYOUTS.purchaseOrders,
    };
  } catch {
    return DEFAULT_SUBMODULE_LAYOUTS;
  }
}

function getSubmoduleScope(pathname: string): keyof SubmoduleLayoutMap | null {
  if (pathname.startsWith('/clients')) {
    return 'clients';
  }
  if (pathname.startsWith('/purchase-orders')) {
    return 'purchaseOrders';
  }
  return null;
}

function getModuleScope(pathname: string): keyof ModuleLayoutMap {
  if (
    pathname.startsWith('/financials') ||
    pathname.startsWith('/inventory') ||
    pathname.startsWith('/purchase-orders') ||
    pathname.startsWith('/quotes') ||
    pathname.startsWith('/suppliers')
  ) {
    return 'financials';
  }

  if (
    pathname.startsWith('/projects') ||
    pathname.startsWith('/clients') ||
    pathname.startsWith('/subcontracts') ||
    pathname.startsWith('/equipment') ||
    pathname.startsWith('/documents') ||
    pathname.startsWith('/workflows') ||
    pathname.startsWith('/safety') ||
    pathname.startsWith('/hr') ||
    pathname.startsWith('/risks')
  ) {
    return 'projects';
  }

  return 'dashboard';
}

const LoadingFallback = () => (
  <div className="flex-1 flex items-center justify-center min-h-[60vh] sm:min-h-[70vh]">
    <div className="flex flex-col items-center gap-5">
      <div className="relative flex items-center justify-center">
        <div className="absolute h-16 w-16 sm:h-20 sm:w-20 rounded-full bg-primary/10 animate-pulse" />
        <div className="h-14 w-14 sm:h-18 sm:w-18 rounded-full border-[3px] border-primary/25 border-t-primary animate-spin" />
      </div>
      <p className="text-sm sm:text-base text-slate-400 animate-pulse font-semibold">Cargando módulo...</p>
    </div>
  </div>
);

const Login = () => {
  const { isDarkMode } = useTheme();
  const [isLoading, setIsLoading] = useState(false);

  const allowLocalFallback = import.meta.env.DEV && (typeof window !== 'undefined') && (
    window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  );

  const signInLocally = () => {
    auth.setCurrentUser({
      uid: typeof crypto !== 'undefined' ? crypto.randomUUID() : `${Date.now()}`,
      email: 'local.dev@wmms.local',
      displayName: 'Usuario Local',
      photoURL: null,
      emailVerified: true,
      isAnonymous: false,
      tenantId: null,
      providerData: [
        {
          providerId: 'local-dev',
          displayName: 'Usuario Local',
          email: 'local.dev@wmms.local',
          photoURL: null,
        },
      ],
    });
  };

  const handleLogin = async () => {
    if (isLoading) return;
    setIsLoading(true);
    try {
      const provider = new GoogleAuthProvider();
      await Promise.race([
        signInWithPopup(auth, provider),
        new Promise((_, reject) => {
          globalThis.setTimeout(() => {
            reject(
              Object.assign(new Error('Tiempo de espera agotado al abrir Google Sign-In'), {
                code: 'auth/popup-timeout',
              })
            );
          }, 15000);
        }),
      ]);
    } catch (error: any) {
      if (error.code === 'auth/google-client-id-missing') {
        toast.error('Configura Google Sign-In', {
          description: 'Falta VITE_GOOGLE_CLIENT_ID en Vercel para abrir el selector de cuentas de Google.'
        });
        if (allowLocalFallback) {
          toast.info('Accediendo en modo local (desarrollo)');
          signInLocally();
        }
      } else if (error.code === 'auth/cancelled-popup-request') {
        toast.error('No se pudo abrir Google Sign-In', {
          description: 'Revisa que el navegador permita popups para este sitio e intenta nuevamente.'
        });
        if (allowLocalFallback) {
          toast.info('Accediendo en modo local (desarrollo)');
          signInLocally();
        }
      } else if (error.code === 'auth/popup-closed-by-user') {
        toast.error('Inicio de sesión cancelado', {
          description: 'Cerraste la ventana de Google antes de completar el proceso.'
        });
      } else if (error.code === 'auth/popup-timeout') {
        toast.error('Google tardó demasiado en responder', {
          description: 'Intenta otra vez. Si persiste, habilita popups y cookies de terceros para este sitio.'
        });
        if (allowLocalFallback) {
          toast.info('Accediendo en modo local (desarrollo)');
          signInLocally();
        }
      } else {
        toast.error('Error de inicio de sesión', {
          description: error.message || 'Ocurrió un error inesperado.'
        });
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={cn(
      "min-h-screen flex items-center justify-center p-4 transition-colors duration-300",
      isDarkMode ? "bg-slate-950" : "bg-slate-50"
    )}>
      <Toaster position="top-right" richColors closeButton />

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-md w-full bg-white dark:bg-slate-900 rounded-2xl shadow-xl p-8 text-center border border-slate-100 dark:border-slate-800"
      >
        <div className="mb-8">
          <div className="w-24 h-24 bg-primary-light dark:bg-primary/20 rounded-2xl flex items-center justify-center mx-auto mb-4 p-3">
            <img
              src={`${import.meta.env.BASE_URL}logo.svg`}
              alt="Constructora WM/M&S"
              className="w-full h-full object-contain"
              loading="eager"
              decoding="async"
            />
          </div>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white">WM_M&S</h1>
          <p className="text-primary font-medium uppercase tracking-widest">CONSTRUCTORA</p>
          <p className="text-slate-500 dark:text-slate-400 mt-2">"Construyendo el futuro"</p>
        </div>

        <h2 className="text-xl font-semibold text-slate-800 dark:text-slate-200 mb-6">Acceso al ERP Integrado</h2>
        
        <button 
          onClick={handleLogin}
          disabled={isLoading}
          className={cn(
            "w-full flex items-center justify-center gap-3 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 font-medium py-3 px-4 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-700 transition-all shadow-sm",
            isLoading && "opacity-50 cursor-not-allowed"
          )}
        >
          {isLoading ? (
            <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          ) : (
            <Users className="w-5 h-5" />
          )}
          {isLoading ? 'Iniciando sesión...' : 'Ingresar al sistema'}
        </button>

        <p className="mt-8 text-xs text-slate-400 dark:text-slate-500">
          Control total de obras, inventarios, finanzas y clientes en tiempo real.
        </p>
      </motion.div>
    </div>
  );
};

const PageTransition = ({
  children,
  reduceMotion,
}: {
  children: React.ReactNode;
  reduceMotion: boolean;
}) => {
  const location = useLocation();

  useEffect(() => {
    markNavigationComplete(location.pathname);
  }, [location.pathname]);

  if (reduceMotion) {
    return <div className="w-full">{children}</div>;
  }

  return (
    <motion.div
      key={location.pathname}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className="w-full"
    >
      {children}
    </motion.div>
  );
};

import { Bell } from 'lucide-react';
import { useNotifications } from './contexts/NotificationContext';
import { Logo } from './components/Logo';

type NetworkConnection = {
  saveData?: boolean;
  effectiveType?: string;
};

function getBrowserConnection() {
  if (typeof navigator === 'undefined') return undefined;
  return (navigator as Navigator & { connection?: NetworkConnection }).connection;
}

function DateTimeWidget({ compact = false }: { compact?: boolean }) {
  const [now, setNow] = useState(() => new Date());
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [reminders, setReminders] = useState<CalendarReminder[]>([]);
  const [editingReminderId, setEditingReminderId] = useState<string | null>(null);
  const [reminderTitle, setReminderTitle] = useState('');
  const [reminderNote, setReminderNote] = useState('');
  const [reminderTime, setReminderTime] = useState('09:00');
  const [notifyMinutesBefore, setNotifyMinutesBefore] = useState(30);
  const [notificationPermission, setNotificationPermission] = useState<string>(() => {
    if (typeof window === 'undefined' || typeof Notification === 'undefined') return 'unsupported';
    return Notification.permission;
  });
  const [clockFormat, setClockFormat] = useState<'12h' | '24h'>(() => {
    const saved = localStorage.getItem('clock-format');
    return saved === '12h' ? '12h' : '24h';
  });
  const widgetRef = useRef<HTMLDivElement>(null);

  const formatDateKey = useCallback((date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }, []);

  const selectedDateKey = useMemo(() => formatDateKey(selectedDate), [selectedDate, formatDateKey]);

  const selectedDateReminders = useMemo(
    () => reminders
      .filter((item) => item.date === selectedDateKey)
      .sort((a, b) => a.time.localeCompare(b.time)),
    [reminders, selectedDateKey],
  );

  const reminderDays = useMemo(() => {
    const bucket = new Set<string>();
    reminders.forEach((item) => {
      if (item.date) bucket.add(item.date);
    });
    return bucket;
  }, [reminders]);

  const refreshReminders = useCallback(() => {
    setReminders(loadReminders());
  }, []);

  const parseAiReminderPrompt = useCallback((text: string) => {
    const normalized = String(text || '').trim();
    if (!normalized) return null;

    const lower = normalized.toLowerCase();
    if (!/(recordar|recordarme|recuerdame|recordatorio)/i.test(lower)) {
      return null;
    }

    let candidateDate = new Date();
    if (lower.includes('manana') || lower.includes('mañana')) {
      candidateDate = new Date();
      candidateDate.setDate(candidateDate.getDate() + 1);
    }

    const explicitDate = normalized.match(/(\d{4}-\d{2}-\d{2})|(\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)/);
    if (explicitDate) {
      const raw = explicitDate[0];
      if (raw.includes('/')) {
        const [d, m, yMaybe] = raw.split('/').map((part) => Number(part));
        const currentYear = new Date().getFullYear();
        const y = yMaybe ? (yMaybe < 100 ? 2000 + yMaybe : yMaybe) : currentYear;
        const parsed = new Date(y, Math.max(0, (m || 1) - 1), Math.max(1, d || 1));
        if (!Number.isNaN(parsed.getTime())) candidateDate = parsed;
      } else {
        const parsed = new Date(raw);
        if (!Number.isNaN(parsed.getTime())) candidateDate = parsed;
      }
    }

    const explicitTime = normalized.match(/(?:a\s+las\s+|a\s+la\s+|@\s*)?(\d{1,2}:\d{2})/i);
    const time = explicitTime ? explicitTime[1] : '09:00';

    const cleanedTitle = normalized
      .replace(/^(por\s+favor\s+)?(recordarme|recuerdame|recordatorio|recordar)\s*/i, '')
      .replace(/\b(hoy|manana|mañana)\b/ig, '')
      .replace(/\b\d{4}-\d{2}-\d{2}\b/g, '')
      .replace(/\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b/g, '')
      .replace(/(?:a\s+las\s+|a\s+la\s+)?\d{1,2}:\d{2}/ig, '')
      .replace(/\s+/g, ' ')
      .trim();

    if (!cleanedTitle) return null;

    return {
      title: cleanedTitle.charAt(0).toUpperCase() + cleanedTitle.slice(1),
      date: formatDateKey(candidateDate),
      time,
    };
  }, [formatDateKey]);

  useEffect(() => {
    const tickId = window.setInterval(() => {
      setNow(new Date());
    }, 1000);

    return () => window.clearInterval(tickId);
  }, []);

  useEffect(() => {
    refreshReminders();
    void syncRemindersFromServer().then(() => {
      refreshReminders();
    });

    const remindersEvent = getRemindersChangedEventName();
    const onStorage = (event: StorageEvent) => {
      if (!event.key || event.key.includes('erp_calendar_reminders')) {
        refreshReminders();
      }
    };

    window.addEventListener(remindersEvent, refreshReminders as EventListener);
    window.addEventListener('storage', onStorage);

    return () => {
      window.removeEventListener(remindersEvent, refreshReminders as EventListener);
      window.removeEventListener('storage', onStorage);
    };
  }, [refreshReminders]);

  useEffect(() => {
    if (!isCalendarOpen) return;
    void syncRemindersFromServer().then(() => {
      refreshReminders();
    });
  }, [isCalendarOpen, refreshReminders]);

  useEffect(() => {
    if (!isCalendarOpen) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (!widgetRef.current?.contains(event.target as Node)) {
        setIsCalendarOpen(false);
      }
    };

    window.addEventListener('mousedown', handlePointerDown);
    return () => window.removeEventListener('mousedown', handlePointerDown);
  }, [isCalendarOpen]);

  useEffect(() => {
    const applySavedClockFormat = () => {
      const saved = localStorage.getItem('clock-format');
      setClockFormat(saved === '12h' ? '12h' : '24h');
    };

    const onClockFormatChanged = () => applySavedClockFormat();
    const onStorage = (event: StorageEvent) => {
      if (event.key === 'clock-format') {
        applySavedClockFormat();
      }
    };

    window.addEventListener('CLOCK_FORMAT_CHANGED', onClockFormatChanged as EventListener);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener('CLOCK_FORMAT_CHANGED', onClockFormatChanged as EventListener);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  useEffect(() => {
    const handleAiCommand = (event: Event) => {
      const customEvent = event as CustomEvent<{ command?: string; params?: { text?: string } }>;
      const text = customEvent?.detail?.params?.text || '';
      if (customEvent?.detail?.command !== 'QUICK_PROMPT' || !text) return;

      const parsed = parseAiReminderPrompt(text);
      if (!parsed) return;

      try {
        createReminder({
          title: parsed.title,
          note: 'Recordatorio creado automaticamente desde una instruccion asistida por IA.',
          date: parsed.date,
          time: parsed.time,
          notifyMinutesBefore: 30,
          source: 'ai',
        });
        toast.success('Recordatorio IA creado', {
          description: `${parsed.title} (${parsed.date} ${parsed.time})`,
        });
      } catch {
        // Keep silent if parsing yields invalid reminder data.
      }
    };

    window.addEventListener('AI_COMMAND', handleAiCommand as EventListener);
    return () => window.removeEventListener('AI_COMMAND', handleAiCommand as EventListener);
  }, [parseAiReminderPrompt]);

  const handleReminderCreate = () => {
    const title = reminderTitle.trim();
    if (!title) {
      toast.error('Agrega un titulo para la actividad');
      return;
    }

    try {
      const isEditing = Boolean(editingReminderId);
      if (editingReminderId) {
        updateReminder(editingReminderId, {
          title,
          note: reminderNote,
          date: selectedDateKey,
          time: reminderTime,
          notifyMinutesBefore,
          source: 'user',
        });
      } else {
        createReminder({
          title,
          note: reminderNote,
          date: selectedDateKey,
          time: reminderTime,
          notifyMinutesBefore,
          source: 'user',
        });
      }

      setReminderTitle('');
      setReminderNote('');
      setEditingReminderId(null);
      toast.success(isEditing ? 'Actividad actualizada' : 'Actividad programada', {
        description: `${title} - ${selectedDateKey} ${reminderTime}`,
      });
    } catch {
      toast.error('No se pudo guardar la actividad');
    }
  };

  const enableNotifications = async () => {
    const permission = await requestReminderNotificationPermission();
    setNotificationPermission(permission);

    if (permission === 'granted') {
      toast.success('Notificaciones activadas');
    } else if (permission === 'denied') {
      toast.error('Debes habilitar notificaciones en tu navegador');
    } else {
      toast.error('Tu navegador no soporta notificaciones push locales');
    }
  };

  const timeLabel = now.toLocaleTimeString('es-GT', {
    hour: '2-digit',
    minute: '2-digit',
    second: compact ? undefined : '2-digit',
    hour12: clockFormat === '12h',
  });

  const dateLabel = selectedDate.toLocaleDateString('es-GT', {
    weekday: compact ? undefined : 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });

  return (
    <div ref={widgetRef} className="relative">
      <div className="flex items-center gap-2 sm:gap-3 bg-slate-50/90 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl px-2.5 sm:px-3 py-2 shadow-sm">
        <div className="flex items-center gap-1.5 sm:gap-2 text-primary">
          <Clock3 size={compact ? 14 : 16} />
          <span className="text-[11px] sm:text-sm font-black text-slate-900 dark:text-white tabular-nums tracking-wide">{timeLabel}</span>
        </div>
        <button
          type="button"
          onClick={() => setIsCalendarOpen((prev) => !prev)}
          className="flex items-center gap-1.5 text-[10px] sm:text-xs font-bold text-slate-600 dark:text-slate-300 hover:text-primary transition-colors"
          title="Abrir calendario"
        >
          <CalendarDays size={compact ? 13 : 15} />
          <span className="capitalize max-w-[140px] sm:max-w-[280px] truncate">{dateLabel}</span>
        </button>
      </div>

      {isCalendarOpen && (
        <div className="absolute left-0 top-[calc(100%+8px)] z-[80] w-[min(92vw,420px)] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl p-3">
          <div className="flex items-center justify-between gap-2 mb-2 px-1">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">
              Agenda interactiva
            </p>
            <button
              type="button"
              onClick={enableNotifications}
              className={cn(
                "inline-flex items-center gap-1.5 px-2 py-1 rounded-lg border text-[9px] font-black uppercase tracking-wider transition-colors",
                notificationPermission === 'granted'
                  ? "bg-emerald-50 text-emerald-600 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:border-emerald-500/30"
                  : "bg-slate-50 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700 hover:border-primary/40 hover:text-primary"
              )}
              title="Activar recordatorios push"
            >
              <BellRing size={11} />
              {notificationPermission === 'granted' ? 'Push ON' : 'Activar push'}
            </button>
          </div>

          <DatePicker
            inline
            selected={selectedDate}
            dayClassName={(date) => (reminderDays.has(formatDateKey(date)) ? 'wm-reminder-day' : undefined)}
            onChange={(date) => {
              if (date) {
                setSelectedDate(date);
              }
            }}
          />

          <div className="mt-3 border-t border-slate-100 dark:border-slate-800 pt-3 space-y-2">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 px-1">
              Actividad para {selectedDate.toLocaleDateString('es-GT', { day: '2-digit', month: 'short' })}
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-[1fr_95px] gap-2">
              <input
                value={reminderTitle}
                onChange={(event) => setReminderTitle(event.target.value)}
                placeholder="Ej: Reunion de avance con proveedor"
                className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary/35"
              />
              <input
                type="time"
                value={reminderTime}
                onChange={(event) => setReminderTime(event.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary/35"
                title="Hora del recordatorio"
              />
            </div>

            <textarea
              value={reminderNote}
              onChange={(event) => setReminderNote(event.target.value)}
              placeholder="Detalle opcional"
              rows={2}
              className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-medium text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary/35 resize-none"
            />

            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Avisar antes
                </label>
                <select
                  value={notifyMinutesBefore}
                  onChange={(event) => setNotifyMinutesBefore(Number(event.target.value) || 0)}
                  className="px-2 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-[10px] font-black text-slate-700 dark:text-slate-200"
                >
                  <option value={0}>A la hora</option>
                  <option value={10}>10 min</option>
                  <option value={30}>30 min</option>
                  <option value={60}>1 hora</option>
                  <option value={180}>3 horas</option>
                  <option value={1440}>1 dia</option>
                </select>
              </div>

              <button
                type="button"
                onClick={handleReminderCreate}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-primary text-white text-[10px] font-black uppercase tracking-wider hover:bg-primary-hover transition-colors"
              >
                <Plus size={12} />
                {editingReminderId ? 'Actualizar' : 'Guardar'}
              </button>
              {editingReminderId && (
                <button
                  type="button"
                  onClick={() => {
                    setEditingReminderId(null);
                    setReminderTitle('');
                    setReminderNote('');
                    setReminderTime('09:00');
                    setNotifyMinutesBefore(30);
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 text-[10px] font-black uppercase tracking-wider text-slate-600 dark:text-slate-300"
                >
                  Cancelar
                </button>
              )}
            </div>

            <div className="max-h-40 overflow-y-auto space-y-1 pr-1">
              {selectedDateReminders.length === 0 ? (
                <p className="text-[10px] text-slate-400 dark:text-slate-500 italic px-1">Sin actividades para este dia.</p>
              ) : (
                selectedDateReminders.map((item) => (
                  <div
                    key={item.id}
                    className={cn(
                      "flex items-start gap-2 rounded-xl border px-2.5 py-2 cursor-pointer",
                      item.completed
                        ? "bg-emerald-50/70 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/30"
                        : "bg-slate-50 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700"
                    )}
                    onClick={() => {
                      setEditingReminderId(item.id);
                      setReminderTitle(item.title);
                      setReminderNote(item.note || '');
                      setReminderTime(item.time || '09:00');
                      setNotifyMinutesBefore(item.notifyMinutesBefore || 30);
                    }}
                  >
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        toggleReminderCompleted(item.id);
                      }}
                      className={cn(
                        "mt-0.5 rounded-md p-1",
                        item.completed ? "text-emerald-600" : "text-slate-400 hover:text-primary"
                      )}
                      title="Marcar como completada"
                    >
                      <CheckCircle2 size={14} />
                    </button>
                    <div className="min-w-0 flex-1">
                      <p className={cn(
                        "text-[11px] font-bold text-slate-800 dark:text-slate-100",
                        item.completed && "line-through opacity-70"
                      )}>
                        {item.title}
                      </p>
                      <p className="text-[10px] text-slate-500 dark:text-slate-400">{item.time} - aviso {item.notifyMinutesBefore} min antes</p>
                      {item.note && (
                        <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 truncate">{item.note}</p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        deleteReminder(item.id);
                        if (editingReminderId === item.id) {
                          setEditingReminderId(null);
                          setReminderTitle('');
                          setReminderNote('');
                          setReminderTime('09:00');
                          setNotifyMinutesBefore(30);
                        }
                      }}
                      className="text-slate-400 hover:text-rose-500 transition-colors p-1"
                      title="Eliminar actividad"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function AppContent({ 
  user, 
  deferredPrompt, 
  onInstall 
}: { 
  user: User | null, 
  deferredPrompt: any, 
  onInstall: () => void 
}) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [enhancementsReady, setEnhancementsReady] = useState(false);
  const [isTopbarNotificationsOpen, setIsTopbarNotificationsOpen] = useState(false);
  const prefetchedRoutesRef = useRef<Set<string>>(new Set());
  const topbarNotificationsRef = useRef<HTMLDivElement | null>(null);
  const { isDarkMode, toggleDarkMode } = useTheme();
  const { notifications, unreadCount, markAllAsRead, markAsRead, removeNotification } = useNotifications();
  const location = useLocation();
  const lastQuickActionTokenRef = useRef<string>('');
  const [moduleLayoutRefreshTick, setModuleLayoutRefreshTick] = useState(0);

  useEffect(() => {
    setIsSidebarOpen(false);
    setIsTopbarNotificationsOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    const openFromTopbarButton = () => {
      setIsTopbarNotificationsOpen(true);
      void markAllAsRead();
    };

    window.addEventListener('OPEN_NOTIFICATIONS_DOCK', openFromTopbarButton);
    return () => window.removeEventListener('OPEN_NOTIFICATIONS_DOCK', openFromTopbarButton);
  }, [markAllAsRead]);

  useEffect(() => {
    if (!isTopbarNotificationsOpen) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (!topbarNotificationsRef.current) return;
      if (!topbarNotificationsRef.current.contains(event.target as Node)) {
        setIsTopbarNotificationsOpen(false);
      }
    };

    window.addEventListener('mousedown', handlePointerDown);
    return () => window.removeEventListener('mousedown', handlePointerDown);
  }, [isTopbarNotificationsOpen]);

  useEffect(() => {
    const handleModuleLayoutChanged = () => {
      setModuleLayoutRefreshTick((prev) => prev + 1);
    };

    window.addEventListener('MODULE_LAYOUT_PROFILE_CHANGED', handleModuleLayoutChanged);
    return () => window.removeEventListener('MODULE_LAYOUT_PROFILE_CHANGED', handleModuleLayoutChanged);
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    const moduleClassNames = ['module-layout-compact', 'module-layout-balanced', 'module-layout-airy'];
    root.classList.remove(...moduleClassNames);

    const profiles = loadModuleLayoutProfiles();
    const submoduleProfiles = loadSubmoduleLayoutProfiles();
    const scope = getModuleScope(location.pathname);
    const submoduleScope = getSubmoduleScope(location.pathname);
    const profile = (submoduleScope ? submoduleProfiles[submoduleScope] : undefined) || profiles[scope] || 'balanced';

    root.classList.add(`module-layout-${profile}`);

    return () => {
      root.classList.remove(`module-layout-${profile}`);
    };
  }, [location.pathname, moduleLayoutRefreshTick]);

  useEffect(() => {
    const params = new URLSearchParams(location.search || '');
    const quickAction = params.get('quickAction');
    const quickPanel = params.get('quickPanel');
    const copilot = params.get('copilot');

    const allowedQuickActions = new Set([
      'new-income',
      'new-expense',
      'new-quote',
      'new-project',
      'new-subcontract',
      'new-client',
      'new-supplier',
      'new-purchase-order',
    ]);

    const token = `${location.pathname}|${location.search}`;
    if (lastQuickActionTokenRef.current === token) {
      return;
    }
    lastQuickActionTokenRef.current = token;

    if (quickPanel === '1') {
      window.dispatchEvent(new Event('OPEN_QUICK_ACTIONS'));
    }

    if (copilot === '1') {
      window.dispatchEvent(new Event('OPEN_AI_CHAT'));
    }

    if (quickAction && allowedQuickActions.has(quickAction)) {
      window.setTimeout(() => {
        window.dispatchEvent(
          new CustomEvent('QUICK_ACTION_TRIGGER', {
            detail: {
              action: quickAction,
              route: location.pathname,
            },
          })
        );
      }, 350);
    }
  }, [location.pathname, location.search]);

  useEffect(() => {
    const playedKey = 'startup-sound-played';
    if (sessionStorage.getItem(playedKey) === '1') return;

    const selected = getSavedStartupSound();
    const timer = window.setTimeout(() => {
      void playStartupSound(selected);
      sessionStorage.setItem(playedKey, '1');
    }, 180);

    return () => window.clearTimeout(timer);
  }, []);

  const reduceMotion = useMemo(() => {
    if (typeof window === 'undefined') return false;

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const connection = getBrowserConnection();
    const effectiveType = connection?.effectiveType || '';
    const hasSlowConnection = effectiveType === 'slow-2g' || effectiveType === '2g';
    const saveDataEnabled = connection?.saveData === true;
    const lowCpu = typeof navigator.hardwareConcurrency === 'number' && navigator.hardwareConcurrency <= 2;

    return prefersReducedMotion || hasSlowConnection || saveDataEnabled || lowCpu;
  }, []);

  const canPrefetch = useCallback(() => {
    if (!PREFETCH_ENABLED) {
      return false;
    }

    if (typeof navigator === 'undefined') {
      return false;
    }

    const connection = getBrowserConnection();
    const effectiveType = connection?.effectiveType || '';
    const hasSlowConnection = effectiveType === 'slow-2g' || effectiveType === '2g';
    const saveDataEnabled = connection?.saveData === true;
    const lowCpu = typeof navigator.hardwareConcurrency === 'number' && navigator.hardwareConcurrency <= 2;

    return !hasSlowConnection && !saveDataEnabled && !lowCpu;
  }, []);

  const prefetchRouteComponent = useCallback((path: string) => {
    if (!canPrefetch()) {
      return;
    }

    if (prefetchedRoutesRef.current.has(path)) {
      return;
    }

    let preload: Promise<unknown> | undefined;

    switch (path) {
      case '/':
        preload = loadDashboard();
        break;
      case '/tasks':
        preload = import('./components/Tasks');
        break;
      case '/projects':
        preload = loadProjects();
        break;
      case '/clients':
        preload = import('./components/Clients');
        break;
      case '/inventory':
        preload = loadInventory();
        break;
      case '/purchase-orders':
        preload = import('./components/PurchaseOrders');
        break;
      case '/financials':
        preload = loadFinancials();
        break;
      case '/subcontracts':
        preload = import('./components/Subcontracts');
        break;
      case '/equipment':
        preload = import('./components/Equipment');
        break;
      case '/quotes':
        preload = import('./components/Quotes');
        break;
      case '/hr':
        preload = import('./components/HR');
        break;
      case '/analytics':
        preload = import('./components/Analytics');
        break;
      case '/suppliers':
        preload = import('./components/Suppliers');
        break;
      case '/safety':
        preload = import('./components/Safety');
        break;
      case '/documents':
        preload = import('./components/Documents');
        break;
      case '/workflows':
        preload = import('./components/Workflows');
        break;
      case '/audit-logs':
        preload = import('./components/AuditLogs');
        break;
      case '/risks':
        preload = import('./components/RiskManagement');
        break;
      case '/settings':
        preload = import('./components/Settings');
        break;
      default:
        break;
    }

    if (!preload) {
      return;
    }

    prefetchedRoutesRef.current.add(path);

    if (NAV_METRICS_ENABLED && typeof performance !== 'undefined') {
      const startedAt = performance.now();
      void preload.finally(() => {
        const elapsed = Math.round(performance.now() - startedAt);
        console.debug(`[nav-prefetch] ${path} in ${elapsed}ms`);
      });
    }
  }, [canPrefetch]);

  const markRouteIntent = useCallback((path: string) => {
    markNavigationStart(path);
  }, []);

  useEffect(() => {
    const runDeferredLoad = () => {
      setEnhancementsReady(true);

      if (!canPrefetch()) {
        return;
      }

      // Prefetch sequentially to avoid long main-thread bursts on initial load.
      const preloaders = [loadProjects, loadInventory, loadFinancials];
      let cancelled = false;

      const runNext = (index: number) => {
        if (cancelled || index >= preloaders.length) return;

        void preloaders[index]().finally(() => {
          if (cancelled) return;
          globalThis.setTimeout(() => runNext(index + 1), 250);
        });
      };

      runNext(0);

      return () => {
        cancelled = true;
      };
    };

    if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
      const idleId = (window as any).requestIdleCallback(runDeferredLoad, { timeout: 1500 });
      return () => (window as any).cancelIdleCallback?.(idleId);
    }

    const timeoutId = globalThis.setTimeout(runDeferredLoad, 1500);
    return () => globalThis.clearTimeout(timeoutId);
  }, [canPrefetch]);

  useEffect(() => {
    if (!NAV_METRICS_ENABLED || typeof window === 'undefined') {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || !event.shiftKey) {
        return;
      }

      if (event.key.toLowerCase() !== 'm') {
        return;
      }

      event.preventDefault();
      void exportNavMetricsSnapshot();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  if (!user) {
    return <Login />;
  }

  return (
      <div className="h-screen h-[100dvh] min-h-0 bg-slate-50 dark:bg-slate-950 flex flex-col lg:flex-row overflow-hidden transition-colors duration-300">
        <Toaster position="top-right" richColors closeButton />
        <MeshBackground />

        <header
          className={cn(
            "fixed top-0 inset-x-0 pt-2 sm:pt-3 pointer-events-none transition-all duration-300",
            isSidebarOpen
              ? "z-20 pl-3 pr-3 sm:pl-4 sm:pr-4 lg:pl-[300px] lg:pr-6"
              : "z-50 px-3 sm:px-5 lg:px-8"
          )}
        >
          <div
            className={cn(
              "mx-auto max-w-[1600px] bg-white/40 dark:bg-slate-900/40 border border-white/30 dark:border-slate-700/30 backdrop-blur-xl shadow-sm rounded-2xl px-3 sm:px-4 pointer-events-auto transition-all duration-300",
              isSidebarOpen ? "py-1.5 sm:py-2" : "py-2 sm:py-3"
            )}
          >
            <div className="grid grid-cols-[auto_1fr] sm:grid-cols-[auto_1fr_auto] items-center gap-2 sm:gap-4">
              <div className="flex items-center">
                <div className="w-8 h-8 sm:w-10 sm:h-10 lg:w-11 lg:h-11 rounded-lg overflow-hidden">
                  <img
                    src={user.photoURL || getFallbackAvatarUrl(user.displayName || 'Usuario')}
                    alt={user.displayName || ''}
                    className="w-full h-full object-cover"
                    referrerPolicy="no-referrer"
                    onError={(event) => {
                      const img = event.currentTarget;
                      if (img.dataset.fallbackApplied === '1') return;
                      img.dataset.fallbackApplied = '1';
                      img.src = getFallbackAvatarUrl(user.displayName || 'Usuario');
                    }}
                  />
                </div>
              </div>


              <div className="flex items-center justify-center min-w-0 gap-2 sm:gap-3">
                <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                  <div
                    className={cn(
                      "relative rounded-lg overflow-hidden shrink-0 transition-all duration-300",
                      isSidebarOpen
                        ? "w-8 h-8 sm:w-10 sm:h-10 lg:w-11 lg:h-11"
                        : "w-8 h-8 sm:w-10 sm:h-10 lg:w-11 lg:h-11"
                    )}
                  >
                    <img
                      src={`${import.meta.env.BASE_URL}logo.svg`}
                      alt="Constructora WM/M&S"
                      className="w-full h-full object-contain"
                      loading="eager"
                      decoding="async"
                    />
                  </div>
                  <div className="leading-tight min-w-0">
                    <p className={cn("font-black uppercase tracking-widest text-slate-900 dark:text-white truncate transition-all duration-300", isSidebarOpen ? "text-[9px] sm:text-xs" : "text-[10px] sm:text-sm")}> 
                      CONSTRUCTORA WM/M&S
                    </p>
                    <p className={cn("font-semibold text-slate-600 dark:text-slate-300 truncate transition-all duration-300", isSidebarOpen ? "text-[7px] sm:text-[10px]" : "text-[8px] sm:text-xs")}> 
                      Edificando El Futuro
                    </p>
                  </div>
                </div>
                {/* Campanita de notificaciones fija en la barra superior */}
                <div className="ml-2 relative" ref={topbarNotificationsRef}>
                  <TopbarNotificationButton
                    unreadCount={unreadCount}
                    onClick={() => {
                      const next = !isTopbarNotificationsOpen;
                      setIsTopbarNotificationsOpen(next);
                      if (next) {
                        void markAllAsRead();
                      }
                    }}
                  />
                  <AnimatePresence>
                    {isTopbarNotificationsOpen && (
                      <motion.div
                        initial={{ opacity: 0, y: 8, scale: 0.98 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 8, scale: 0.98 }}
                        className="absolute right-0 top-12 sm:top-14 z-[140] w-[min(92vw,380px)] bg-white/95 dark:bg-slate-900/95 border border-slate-200/80 dark:border-slate-700 rounded-2xl shadow-2xl overflow-hidden"
                      >
                        <div className="px-3 py-2.5 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between bg-slate-50/90 dark:bg-slate-800/90">
                          <h3 className="font-black text-[11px] uppercase tracking-widest text-slate-900 dark:text-white">Notificaciones</h3>
                          <button
                            onClick={() => markAllAsRead()}
                            className="text-[10px] font-black uppercase text-primary hover:text-primary-hover"
                          >
                            Marcar leídas
                          </button>
                        </div>
                        <div className="max-h-[52vh] overflow-y-auto custom-scrollbar">
                          {notifications.length === 0 ? (
                            <div className="p-5 text-center">
                              <p className="text-xs text-slate-500 dark:text-slate-300 font-semibold">No hay notificaciones</p>
                            </div>
                          ) : (
                            notifications.map((notification) => (
                              <div
                                key={notification.id || `${notification.type}_${notification.createdAt}_${notification.title}`}
                                onClick={() => {
                                  if (notification.id) {
                                    void markAsRead(notification.id);
                                  }
                                }}
                                className={cn(
                                  "px-3 py-2.5 border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/80 transition-colors",
                                  notification.id ? "cursor-pointer" : "cursor-default",
                                  !notification.read && "bg-primary-light/40 dark:bg-primary/15"
                                )}
                              >
                                <div className="flex items-start gap-3">
                                  <div
                                    className={cn(
                                      "mt-1 w-2 h-2 rounded-full flex-shrink-0",
                                      notification.type === 'subcontract'
                                        ? "bg-rose-500"
                                        : notification.type === 'project'
                                          ? "bg-amber-500"
                                          : notification.type === 'inventory'
                                            ? "bg-blue-500"
                                            : "bg-slate-500"
                                    )}
                                  />
                                  <div className="flex-1 min-w-0">
                                    <p className="text-xs font-black text-slate-900 dark:text-white leading-tight mb-1">{notification.title}</p>
                                    <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed mb-1.5 break-words">{notification.body}</p>
                                    <div className="flex items-center justify-between gap-2">
                                      <p className="text-[9px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                                        {notification.createdAt ? new Date(notification.createdAt).toLocaleString() : 'Reciente'}
                                      </p>
                                      {notification.id && (
                                        <button
                                          type="button"
                                          onClick={(event) => {
                                            event.stopPropagation();
                                            void removeNotification(notification.id!);
                                          }}
                                          className="p-1 rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:text-slate-300 dark:hover:text-rose-300 dark:hover:bg-rose-900/30 transition-colors"
                                          title="Eliminar notificación"
                                          aria-label="Eliminar notificación"
                                        >
                                          <Trash2 size={13} />
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>

              <div className="justify-self-end hidden sm:block">
                <DateTimeWidget compact />
              </div>
            </div>
            <div className="mt-2 flex justify-end sm:hidden">
              <DateTimeWidget compact />
            </div>
          </div>
        </header>

        {!isSidebarOpen && (
          <motion.button
            initial={{ x: -8, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            whileHover={{ x: 3 }}
            whileTap={{ scale: 0.97 }}
            transition={{ duration: 0.34, ease: [0.22, 1, 0.36, 1] }}
            onClick={() => setIsSidebarOpen(true)}
            className="fixed left-0 top-1/2 -translate-y-1/2 z-[110] px-3 py-2 rounded-r-2xl border border-white/20 bg-slate-900/60 backdrop-blur-md shadow-2xl text-white hover:bg-slate-900/75 transition-all"
            title="Abrir menú de módulos"
          >
            <span className="[writing-mode:vertical-rl] rotate-180 text-[9px] font-black tracking-[0.16em] uppercase flex items-center gap-1">
              <ChevronRight size={13} />
              Menú
            </span>
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 bg-white text-primary text-[9px] font-black rounded-full flex items-center justify-center">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </motion.button>
        )}

        <Suspense fallback={null}>
          <Sidebar 
            user={user} 
            isOpen={isSidebarOpen} 
            isCollapsed={isSidebarCollapsed}
            onToggleCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
            onPrefetchRoute={prefetchRouteComponent}
            onNavigateIntent={markRouteIntent}
            onClose={() => {
              setIsSidebarOpen(false);
            }} 
            deferredPrompt={deferredPrompt}
            onInstall={onInstall}
          />
        </Suspense>
        
        <main className={cn(
          "flex-1 min-h-0 overflow-y-auto overflow-x-hidden custom-scrollbar perf-content p-4 lg:p-8 pt-32 sm:pt-28 lg:pt-28 pb-24 lg:pb-8"
        )}>
          <Suspense fallback={<LoadingFallback />}>
            <AnimatePresence mode="wait">
              <Routes>
                <Route path="/" element={<PageTransition reduceMotion={reduceMotion}><Dashboard /></PageTransition>} />
                <Route path="/tasks" element={<PageTransition reduceMotion={reduceMotion}><Tasks /></PageTransition>} />
                <Route path="/projects" element={<PageTransition reduceMotion={reduceMotion}><Projects /></PageTransition>} />
                <Route path="/clients" element={<PageTransition reduceMotion={reduceMotion}><Clients /></PageTransition>} />
                <Route path="/inventory" element={<PageTransition reduceMotion={reduceMotion}><Inventory /></PageTransition>} />
                <Route path="/purchase-orders" element={<PageTransition reduceMotion={reduceMotion}><PurchaseOrders /></PageTransition>} />
                <Route path="/financials" element={<PageTransition reduceMotion={reduceMotion}><Financials /></PageTransition>} />
                <Route path="/subcontracts" element={<PageTransition reduceMotion={reduceMotion}><Subcontracts /></PageTransition>} />
                <Route path="/equipment" element={<PageTransition reduceMotion={reduceMotion}><Equipment /></PageTransition>} />
                <Route path="/quotes" element={<PageTransition reduceMotion={reduceMotion}><Quotes /></PageTransition>} />
                <Route path="/hr" element={<PageTransition reduceMotion={reduceMotion}><HR /></PageTransition>} />
                <Route path="/analytics" element={<PageTransition reduceMotion={reduceMotion}><Analytics /></PageTransition>} />
                <Route path="/suppliers" element={<PageTransition reduceMotion={reduceMotion}><Suppliers /></PageTransition>} />
                <Route path="/safety" element={<PageTransition reduceMotion={reduceMotion}><Safety /></PageTransition>} />
                <Route path="/documents" element={<PageTransition reduceMotion={reduceMotion}><Documents /></PageTransition>} />
                <Route path="/workflows" element={<PageTransition reduceMotion={reduceMotion}><Workflows /></PageTransition>} />
                <Route path="/audit-logs" element={<PageTransition reduceMotion={reduceMotion}><AuditLogs /></PageTransition>} />
                <Route path="/risks" element={<PageTransition reduceMotion={reduceMotion}><RiskManagement /></PageTransition>} />
                <Route path="/settings" element={<PageTransition reduceMotion={reduceMotion}><Settings /></PageTransition>} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </AnimatePresence>
          </Suspense>
          {enhancementsReady && (
            <Suspense fallback={null}>
              <SyncStatus />
            </Suspense>
          )}
        </main>
      </div>
  );
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);

  useEffect(() => {
    const handleBeforeInstallPrompt = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
      setLoading(false);
    });

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      unsubscribe();
    };
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setDeferredPrompt(null);
    }
  };

  const isPublicContractSignPage =
    typeof window !== 'undefined' && window.location.hash.startsWith('#/hr/contract-sign/');

  if (isPublicContractSignPage) {
    return (
      <ErrorBoundary>
        <ThemeProvider>
          <Toaster position="top-right" richColors closeButton />
          <Suspense fallback={null}>
            <HRContractSignPage />
          </Suspense>
        </ThemeProvider>
      </ErrorBoundary>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen min-h-[100dvh] flex items-center justify-center bg-slate-50 dark:bg-slate-950">
        <div className="flex flex-col items-center gap-5">
          <div className="relative flex items-center justify-center">
            <div className="absolute h-20 w-20 sm:h-24 sm:w-24 rounded-full bg-primary/10 animate-pulse" />
            <div className="h-16 w-16 sm:h-20 sm:w-20 rounded-full border-[4px] border-primary/25 border-t-primary animate-spin" />
          </div>
          <p className="text-sm sm:text-base text-slate-500 dark:text-slate-400 font-semibold tracking-wide">Iniciando aplicación...</p>
        </div>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <ThemeProvider>
        <NotificationProvider user={user}>
          <Suspense fallback={null}>
            <NotificationManager />
          </Suspense>
          <Router>
            <AppContent 
              user={user} 
              deferredPrompt={deferredPrompt}
              onInstall={handleInstall}
            />
          </Router>
          <VercelAnalytics />
        </NotificationProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
