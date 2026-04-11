import React, { useCallback, useEffect, useMemo, useRef, useState, Suspense, lazy } from 'react';
import { HashRouter as Router, Routes, Route, Navigate, Link, useLocation } from 'react-router-dom';
import { onAuthStateChanged, signInWithPopup, GoogleAuthProvider, User, auth, getFallbackAvatarUrl } from './lib/authStorageClient';
import { 
  LayoutDashboard, 
  Construction, 
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
  ChevronRight
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from './lib/utils';
import { exportNavMetricsSnapshot, markNavigationComplete, markNavigationStart } from './lib/navMetrics';
import { getSavedStartupSound, playStartupSound } from './lib/startupSound';

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
const NavMetricsPanel = lazy(() => import('./components/NavMetricsPanel'));

import ErrorBoundary from './components/ErrorBoundary';

const PREFETCH_ENABLED = (import.meta.env.VITE_PREFETCH_ENABLED ?? 'true') !== 'false';
const NAV_METRICS_ENABLED = import.meta.env.DEV && import.meta.env.VITE_NAV_METRICS === 'true';

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
          <div className="w-20 h-20 bg-primary-light dark:bg-primary/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Construction className="text-primary" size={40} />
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
  const [clockFormat, setClockFormat] = useState<'12h' | '24h'>(() => {
    const saved = localStorage.getItem('clock-format');
    return saved === '12h' ? '12h' : '24h';
  });
  const widgetRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const tickId = window.setInterval(() => {
      setNow(new Date());
    }, 1000);

    return () => window.clearInterval(tickId);
  }, []);

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
        <div className="absolute left-0 top-[calc(100%+8px)] z-[80] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl p-3">
          <DatePicker
            inline
            selected={selectedDate}
            onChange={(date) => {
              if (date) {
                setSelectedDate(date);
              }
            }}
          />
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
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [enhancementsReady, setEnhancementsReady] = useState(false);
  const prefetchedRoutesRef = useRef<Set<string>>(new Set());
  const { isDarkMode, toggleDarkMode } = useTheme();
  const { unreadCount } = useNotifications();
  const location = useLocation();

  useEffect(() => {
    setIsSidebarOpen(false);
    setIsNotificationsOpen(false);
  }, [location.pathname]);

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
              "mx-auto max-w-[1600px] bg-blue-500/50 dark:bg-white/50 border border-blue-200/50 dark:border-white/50 backdrop-blur-xl shadow-lg rounded-2xl px-3 sm:px-4 pointer-events-auto transition-all duration-300",
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

              <div className="flex items-center justify-center min-w-0">
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
                      src="/logo.svg"
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
              setIsNotificationsOpen(false);
            }} 
            initialNotificationsOpen={isNotificationsOpen}
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

        <Suspense fallback={null}>
          <AIChat />
        </Suspense>

        <Suspense fallback={null}>
          <QuickActionsLauncher />
        </Suspense>
        <Suspense fallback={null}>
          <SideToolsDock />
        </Suspense>

        {NAV_METRICS_ENABLED && (
          <Suspense fallback={null}>
            <NavMetricsPanel />
          </Suspense>
        )}
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
