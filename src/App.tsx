import React, { useEffect, useState, Suspense, lazy } from 'react';
import { HashRouter as Router, Routes, Route, Navigate, Link, useLocation } from 'react-router-dom';
import { onAuthStateChanged, signInWithPopup, GoogleAuthProvider, signOut, User } from 'firebase/auth';
import { auth } from './firebase';
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

import { ThemeProvider, useTheme } from './contexts/ThemeContext';
import { NotificationProvider } from './contexts/NotificationContext';
import { NotificationManager } from './components/NotificationManager';
import { Toaster, toast } from 'sonner';

// Lazy Loaded Components for Performance
const Dashboard = lazy(() => import('./components/Dashboard'));
const Projects = lazy(() => import('./components/Projects'));
const Clients = lazy(() => import('./components/Clients'));
const Inventory = lazy(() => import('./components/Inventory'));
const Financials = lazy(() => import('./components/Financials'));
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

import AIChat from './components/AIChat';
import ErrorBoundary from './components/ErrorBoundary';
import { Sidebar } from './components/Sidebar';

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

  const handleLogin = async () => {
    if (isLoading) return;
    setIsLoading(true);
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (error: any) {
      if (error.code === 'auth/cancelled-popup-request') {
        // Silent fail for cancelled popup
      } else if (error.code === 'auth/popup-closed-by-user') {
        toast.error('Inicio de sesión cancelado', {
          description: 'Cerraste la ventana de Google antes de completar el proceso.'
        });
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
            <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google" className="w-5 h-5" />
          )}
          {isLoading ? 'Iniciando sesión...' : 'Ingresar con Google'}
        </button>

        <p className="mt-8 text-xs text-slate-400 dark:text-slate-500">
          Control total de obras, inventarios, finanzas y clientes en tiempo real.
        </p>
      </motion.div>
    </div>
  );
};

const PageTransition = ({ children }: { children: React.ReactNode }) => {
  const location = useLocation();
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
import { BottomNav } from './components/BottomNav';
import { SyncStatus } from './components/SyncStatus';

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
  const { isDarkMode, toggleDarkMode } = useTheme();
  const { unreadCount } = useNotifications();

  if (!user) {
    return <Login />;
  }

  return (
    <Router>
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col lg:flex-row transition-colors duration-300">
        <Toaster position="top-right" richColors closeButton />
        
        {/* Mobile Header */}
        <header className="lg:hidden sticky top-0 z-30 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl border-b border-slate-100 dark:border-slate-800 px-4 py-3 flex items-center justify-between">
          <Logo />
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

        <Sidebar 
          user={user} 
          isOpen={isSidebarOpen} 
          isCollapsed={isSidebarCollapsed}
          onToggleCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
          onClose={() => {
            setIsSidebarOpen(false);
            setIsNotificationsOpen(false);
          }} 
          initialNotificationsOpen={isNotificationsOpen}
          deferredPrompt={deferredPrompt}
          onInstall={onInstall}
        />
        
        <main className={cn(
          "flex-1 p-4 lg:p-8 pb-24 lg:pb-8 overflow-x-hidden transition-all duration-300",
          isSidebarCollapsed ? "lg:ml-20" : "lg:ml-64"
        )}>
          <Suspense fallback={<LoadingFallback />}>
            <AnimatePresence mode="wait">
              <Routes>
                <Route path="/" element={<PageTransition><Dashboard /></PageTransition>} />
                <Route path="/projects" element={<PageTransition><Projects /></PageTransition>} />
                <Route path="/clients" element={<PageTransition><Clients /></PageTransition>} />
                <Route path="/inventory" element={<PageTransition><Inventory /></PageTransition>} />
                <Route path="/purchase-orders" element={<PageTransition><PurchaseOrders /></PageTransition>} />
                <Route path="/financials" element={<PageTransition><Financials /></PageTransition>} />
                <Route path="/subcontracts" element={<PageTransition><Subcontracts /></PageTransition>} />
                <Route path="/equipment" element={<PageTransition><Equipment /></PageTransition>} />
                <Route path="/quotes" element={<PageTransition><Quotes /></PageTransition>} />
                <Route path="/hr" element={<PageTransition><HR /></PageTransition>} />
                <Route path="/analytics" element={<PageTransition><Analytics /></PageTransition>} />
                <Route path="/suppliers" element={<PageTransition><Suppliers /></PageTransition>} />
                <Route path="/safety" element={<PageTransition><Safety /></PageTransition>} />
                <Route path="/documents" element={<PageTransition><Documents /></PageTransition>} />
                <Route path="/workflows" element={<PageTransition><Workflows /></PageTransition>} />
                <Route path="/audit-logs" element={<PageTransition><AuditLogs /></PageTransition>} />
                <Route path="/risks" element={<PageTransition><RiskManagement /></PageTransition>} />
                <Route path="/settings" element={<PageTransition><Settings /></PageTransition>} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </AnimatePresence>
          </Suspense>
          <AIChat />
          <SyncStatus />
        </main>

        <BottomNav 
          onMenuClick={() => setIsSidebarOpen(true)} 
          deferredPrompt={deferredPrompt}
          onInstall={onInstall}
        />
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
          <NotificationManager />
          <AppContent 
            user={user} 
            deferredPrompt={deferredPrompt}
            onInstall={handleInstall}
          />
        </NotificationProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
