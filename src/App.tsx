import React, { useCallback, useEffect, useMemo, useRef, useState, Suspense, lazy } from 'react';
import { HashRouter as Router, Routes, Route, Navigate, Link, useLocation } from 'react-router-dom';
import { onAuthStateChanged, signInWithPopup, GoogleAuthProvider, User, auth } from './lib/authStorageClient';
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
  Sun
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from './lib/utils';
import { exportNavMetricsSnapshot, markNavigationComplete, markNavigationStart } from './lib/navMetrics';

import { ThemeProvider, useTheme } from './contexts/ThemeContext';
import { NotificationProvider } from './contexts/NotificationContext';
import { Toaster, toast } from 'sonner';
import { Analytics as VercelAnalytics } from '@vercel/analytics/react';

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
const BottomNav = lazy(() =>
  import('./components/BottomNav').then((module) => ({ default: module.BottomNav }))
);
const SyncStatus = lazy(() =>
  import('./components/SyncStatus').then((module) => ({ default: module.SyncStatus }))
);
const NavMetricsPanel = lazy(() => import('./components/NavMetricsPanel'));

import ErrorBoundary from './components/ErrorBoundary';

const PREFETCH_ENABLED = (import.meta.env.VITE_PREFETCH_ENABLED ?? 'true') !== 'false';
const NAV_METRICS_ENABLED = import.meta.env.DEV && import.meta.env.VITE_NAV_METRICS === 'true';

const LoadingFallback = () => (
  <div className="flex-1 flex items-center justify-center min-h-[60vh]">
    <div className="flex flex-col items-center gap-4">
      <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary"></div>
      <p className="text-sm text-slate-400 animate-pulse">Cargando módulo...</p>
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
    <Router>
      <div className="h-screen h-[100dvh] min-h-0 bg-slate-50 dark:bg-slate-950 flex flex-col lg:flex-row overflow-hidden transition-colors duration-300">
        <Toaster position="top-right" richColors closeButton />
        
        {/* Mobile Header */}
        <header className="lg:hidden sticky top-0 z-30 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl border-b border-slate-100 dark:border-slate-800 px-4 py-3 flex items-center justify-between">
          <Logo size="sm" />
          <div className="flex items-center gap-3">
            <button 
              onClick={() => {
                setIsNotificationsOpen(true);
                setIsSidebarOpen(true);
              }}
              className="p-2 bg-slate-50 dark:bg-slate-800 rounded-xl text-slate-600 dark:text-slate-400 relative"
            >
              <Bell size={20} />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 w-5 h-5 bg-rose-500 text-white text-[10px] font-black flex items-center justify-center rounded-full border-2 border-white dark:border-slate-900 shadow-sm animate-bounce">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>
            <div className="w-8 h-8 rounded-full bg-primary/10 border border-primary/20 overflow-hidden">
              <img 
                src={user.photoURL || `https://ui-avatars.com/api/?name=${user.displayName}&background=random`} 
                alt={user.displayName || ''} 
                className="w-full h-full object-cover"
                referrerPolicy="no-referrer"
              />
            </div>
          </div>
        </header>

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
          "flex-1 min-h-0 overflow-y-auto overflow-x-hidden custom-scrollbar perf-content p-4 lg:p-8 pb-24 lg:pb-8 transition-[margin] duration-300",
          isSidebarCollapsed ? "lg:ml-20" : "lg:ml-64"
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
          <Suspense fallback={null}>
            <AIChat />
          </Suspense>
          <Suspense fallback={null}>
            <QuickActionsLauncher />
          </Suspense>
          <Suspense fallback={null}>
            <SideToolsDock />
          </Suspense>
          {enhancementsReady && (
            <Suspense fallback={null}>
              <SyncStatus />
            </Suspense>
          )}
        </main>

        <Suspense fallback={null}>
          <BottomNav 
            onMenuClick={() => setIsSidebarOpen(true)} 
            onPrefetchRoute={prefetchRouteComponent}
            onNavigateIntent={markRouteIntent}
            deferredPrompt={deferredPrompt}
            onInstall={onInstall}
          />
        </Suspense>

        {NAV_METRICS_ENABLED && (
          <Suspense fallback={null}>
            <NavMetricsPanel />
          </Suspense>
        )}
      </div>
    </Router>
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
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
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
          <AppContent 
            user={user} 
            deferredPrompt={deferredPrompt}
            onInstall={handleInstall}
          />
          <VercelAnalytics />
        </NotificationProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
