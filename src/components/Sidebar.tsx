import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { User, auth, getFallbackAvatarUrl } from '../lib/authStorageClient';
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
  ShoppingBag,
  Wifi,
  WifiOff,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  Settings as SettingsIcon,
  Moon,
  Sun,
  AlertCircle,
  Truck,
  ShieldAlert,
  Files,
  Briefcase,
  BarChart3,
  CheckSquare,
  History,
  Download,
  ListTodo
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';

const NavItem = ({ to, icon: Icon, label, active, isCollapsed, onClick, onPrefetchRoute, onNavigateIntent }: { to: string, icon: any, label: string, active: boolean, isCollapsed?: boolean, onClick?: () => void, onPrefetchRoute?: (path: string) => void, onNavigateIntent?: (path: string) => void }) => (
  <motion.div
    whileTap={{ scale: 0.96 }}
    whileHover={{ x: 4 }}
    className="w-full"
  >
    <Link
      to={to}
      onClick={() => {
        onNavigateIntent?.(to);
        onClick?.();
      }}
      onMouseEnter={() => onPrefetchRoute?.(to)}
      onFocus={() => onPrefetchRoute?.(to)}
      onTouchStart={() => onPrefetchRoute?.(to)}
      title={isCollapsed ? label : undefined}
      className={cn(
        "flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-2.5 sm:py-3.5 rounded-xl sm:rounded-2xl transition-all duration-300 group relative overflow-hidden",
        active 
          ? "text-white shadow-lg shadow-primary-shadow/30" 
          : "text-slate-500 dark:text-slate-400 hover:bg-primary-light/30 dark:hover:bg-primary/10 hover:text-primary dark:hover:text-primary",
        isCollapsed && "justify-center px-0"
      )}
    >
      {active && (
        <motion.div
          layoutId="sidebar-active"
          className="absolute inset-0 bg-primary z-0"
          transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
        />
      )}
      <Icon size={18} className={cn("transition-transform group-hover:scale-110 relative z-10 sm:w-5 sm:h-5", active ? "text-white" : "text-slate-400 group-hover:text-primary")} />
      {!isCollapsed && <span className="font-black text-[10px] sm:text-xs uppercase tracking-widest relative z-10">{label}</span>}
    </Link>
  </motion.div>
);

const NavGroup = ({ label, icon: Icon, children, active, isCollapsed }: { label: string, icon: any, children: React.ReactNode, active?: boolean, isCollapsed?: boolean }) => {
  const [isOpen, setIsOpen] = useState(active || false);
  
  useEffect(() => {
    if (active) setIsOpen(true);
  }, [active]);

  if (isCollapsed) {
    return <div className="py-1 sm:py-2 flex flex-col items-center gap-1">{children}</div>;
  }

  return (
    <div className="space-y-0.5 sm:space-y-1">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "w-full flex items-center justify-between px-3 sm:px-4 py-1.5 sm:py-2 transition-colors group",
          isOpen ? "text-slate-900 dark:text-white" : "text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300"
        )}
      >
        <div className="flex items-center gap-2 sm:gap-3">
          <Icon size={14} className={cn("transition-colors sm:w-4 sm:h-4", isOpen ? "text-primary" : "group-hover:text-primary")} />
          <span className="text-[8px] sm:text-[10px] font-black uppercase tracking-[0.2em]">{label}</span>
        </div>
        <motion.div
          animate={{ rotate: isOpen ? 180 : 0 }}
          transition={{ duration: 0.2 }}
        >
          <ChevronDown size={12} className="sm:w-3.5 sm:h-3.5" />
        </motion.div>
      </button>
      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden pl-3 sm:pl-4 space-y-0.5 sm:space-y-1"
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

import { useTheme } from '../contexts/ThemeContext';
import { Logo } from './Logo';

import { useNotifications } from '../contexts/NotificationContext';

export const Sidebar = ({ 
  user, 
  isOpen, 
  isCollapsed, 
  onToggleCollapse, 
  onPrefetchRoute,
  onNavigateIntent,
  onClose,
  initialNotificationsOpen = false,
  deferredPrompt,
  onInstall
}: { 
  user: User, 
  isOpen: boolean, 
  isCollapsed: boolean, 
  onToggleCollapse: () => void, 
  onPrefetchRoute?: (path: string) => void,
  onNavigateIntent?: (path: string) => void,
  onClose: () => void,
  initialNotificationsOpen?: boolean,
  deferredPrompt: any,
  onInstall: () => void
}) => {
  const { isDarkMode, toggleDarkMode } = useTheme();
  const { notifications, unreadCount, markAllAsRead, markAsRead, setPanelOpen } = useNotifications();
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(initialNotificationsOpen);
  const location = useLocation();
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [showInstall, setShowInstall] = useState(!!deferredPrompt);
  const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 1280;
  const isTouchViewport = viewportWidth < 1024;
  const expandedWidth = viewportWidth < 640
    ? Math.min(320, Math.max(264, Math.round(viewportWidth * 0.88)))
    : 288;
  const sidebarWidth = isCollapsed ? 80 : expandedWidth;
  const hiddenOffset = -(sidebarWidth + 20);

  useEffect(() => {
    setShowInstall(!!deferredPrompt);
  }, [deferredPrompt]);

  useEffect(() => {
    setIsNotificationsOpen(initialNotificationsOpen);
  }, [initialNotificationsOpen]);

  useEffect(() => {
    setPanelOpen(isNotificationsOpen);
  }, [isNotificationsOpen, setPanelOpen]);

  const isOperacionesActive = ["/projects", "/tasks", "/quotes", "/clients", "/safety", "/workflows", "/risks"].some(path => location.pathname.startsWith(path));
  const isLogisticaActive = ["/inventory", "/equipment", "/purchase-orders", "/suppliers"].some(path => location.pathname.startsWith(path));
  const isAdministracionActive = ["/financials", "/subcontracts", "/hr", "/documents", "/audit-logs"].some(path => location.pathname.startsWith(path));
  const isAnalyticsActive = location.pathname.startsWith("/analytics");

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return (
    <>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-40 lg:hidden"
          />
        )}
      </AnimatePresence>

      <motion.aside 
        initial={false}
        drag={isTouchViewport ? "x" : false}
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={{ left: 0.1, right: 0.5 }}
        onDragEnd={(_, info) => {
          if (info.offset.x < -100) {
            onClose();
          }
        }}
        animate={{ 
          x: isOpen ? 0 : hiddenOffset,
          width: sidebarWidth,
        }}
        transition={{ type: "spring", damping: 25, stiffness: 200 }}
        className="fixed inset-y-0 left-0 z-40 bg-white/95 dark:bg-slate-900/95 backdrop-blur-2xl border-r border-slate-100 dark:border-slate-800 shadow-2xl lg:shadow-none"
      >
        <div className={cn("flex flex-col h-full", isCollapsed ? "p-2 sm:p-4" : "p-4 sm:p-6")}>
          <div className={cn("mb-6 sm:mb-10 flex justify-between items-center", isCollapsed ? "flex-col gap-3 sm:gap-4" : "px-1 sm:px-2")}>
            <div className="flex items-center gap-2 overflow-hidden">
              {!isCollapsed && <Logo size="sm" />}
              {isCollapsed && <Construction size={20} className="text-primary sm:w-6 sm:h-6" />}
            </div>
            <div className={cn("flex items-center gap-1.5 sm:gap-2", isCollapsed && "flex-col")}>
              {/* Mobile Close Button */}
              <motion.button
                whileTap={{ scale: 0.9 }}
                onClick={onClose}
                className="lg:hidden p-2 sm:p-3 bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400 rounded-xl sm:rounded-2xl hover:bg-rose-100 dark:hover:bg-rose-500/20 transition-all shadow-sm border border-rose-100 dark:border-rose-500/20"
              >
                <X size={18} className="sm:w-5 sm:h-5" />
              </motion.button>

              <motion.button
                whileTap={{ scale: 0.9 }}
                onClick={onToggleCollapse}
                className="hidden lg:flex p-1.5 sm:p-2 bg-transparent text-slate-600/70 dark:text-slate-300/70 rounded-lg sm:rounded-xl hover:bg-slate-900/10 dark:hover:bg-white/10 hover:text-slate-700 dark:hover:text-slate-100 transition-all backdrop-blur-sm"
                title={isCollapsed ? "Expandir" : "Contraer"}
              >
                {isCollapsed ? <ChevronRight size={14} className="sm:w-4 sm:h-4" /> : <ChevronLeft size={14} className="sm:w-4 sm:h-4" />}
              </motion.button>
              <div className="relative">
                <button
                  onClick={() => {
                    const nextState = !isNotificationsOpen;
                    setIsNotificationsOpen(nextState);
                    if (nextState) {
                      markAllAsRead();
                    }
                  }}
                  className="p-1.5 sm:p-2 bg-transparent text-slate-600/70 dark:text-slate-300/70 rounded-lg sm:rounded-xl hover:bg-slate-900/10 dark:hover:bg-white/10 hover:text-slate-700 dark:hover:text-slate-100 transition-all relative backdrop-blur-sm"
                  title="Notificaciones"
                >
                  <AlertCircle size={14} className="sm:w-4 sm:h-4" />
                  {unreadCount > 0 && !isNotificationsOpen && (
                    <span className="absolute top-0 right-0 w-2 h-2 sm:w-2.5 sm:h-2.5 bg-rose-500 border-2 border-white dark:border-slate-900 rounded-full" />
                  )}
                </button>

                <AnimatePresence>
                  {isNotificationsOpen && (
                    <>
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={() => setIsNotificationsOpen(false)}
                        className="fixed inset-0 z-40"
                      />
                      <motion.div
                        initial={{ opacity: 0, y: 10, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 10, scale: 0.95 }}
                        className="absolute left-0 mt-2 w-80 bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-100 dark:border-slate-800 z-50 overflow-hidden"
                      >
                        <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center">
                          <h3 className="font-black text-xs uppercase tracking-widest text-slate-900 dark:text-white">Notificaciones</h3>
                          <div className="flex items-center gap-2">
                            <button 
                              onClick={() => markAllAsRead()}
                              className="text-[9px] font-black uppercase text-primary hover:text-primary-hover transition-colors"
                            >
                              Marcar todas como leídas
                            </button>
                            <span className="text-[10px] font-bold text-slate-400 uppercase">{notifications.length} Total</span>
                          </div>
                        </div>
                        <div className="max-h-[400px] overflow-y-auto custom-scrollbar">
                          {notifications.length === 0 ? (
                            <div className="p-8 text-center">
                              <p className="text-xs text-slate-400 font-medium italic">No hay notificaciones</p>
                            </div>
                          ) : (
                            notifications.map((n) => (
                              <div 
                                key={n.id} 
                                onClick={() => markAsRead(n.id!)}
                                className={cn(
                                  "p-4 border-b border-slate-50 dark:border-slate-800/50 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors cursor-pointer",
                                  !n.read && "bg-primary-light/30 dark:bg-primary/5"
                                )}
                              >
                                <div className="flex gap-3">
                                  <div className={cn(
                                    "w-2 h-2 rounded-full mt-1.5 flex-shrink-0",
                                    n.type === 'subcontract' ? "bg-rose-500" : n.type === 'project' ? "bg-amber-500" : "bg-blue-500"
                                  )} />
                                  <div className="flex-1">
                                    <p className="text-xs font-black text-slate-900 dark:text-white leading-tight mb-1">{n.title}</p>
                                    <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed mb-2">{n.body}</p>
                                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter">
                                      {n.createdAt ? new Date(n.createdAt).toLocaleString() : 'Reciente'}
                                    </p>
                                  </div>
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      </motion.div>
                    </>
                  )}
                </AnimatePresence>
              </div>

              <button
                onClick={toggleDarkMode}
                className="p-2 bg-transparent text-slate-600/70 dark:text-slate-300/70 rounded-xl hover:bg-slate-900/10 dark:hover:bg-white/10 hover:text-slate-700 dark:hover:text-slate-100 transition-all backdrop-blur-sm"
                title={isDarkMode ? "Modo Claro" : "Modo Oscuro"}
              >
                {isDarkMode ? <Sun size={16} /> : <Moon size={16} />}
              </button>
              <div className={cn(
                "flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-tighter border transition-all duration-300 backdrop-blur-sm",
                isOnline ? "bg-transparent text-emerald-500 dark:text-emerald-300 border-emerald-400/30" : "bg-transparent text-rose-500 dark:text-rose-300 border-rose-400/30",
                isCollapsed && "px-1 w-6 h-6 justify-center"
              )}>
                <div className={cn("w-1.5 h-1.5 rounded-full animate-pulse flex-shrink-0", isOnline ? "bg-emerald-500" : "bg-rose-500")} />
                {!isCollapsed && (isOnline ? 'En línea' : 'Desconectado')}
              </div>
            </div>
          </div>

          <nav className="flex-1 space-y-6 overflow-y-auto custom-scrollbar pr-2">
            <NavItem 
              to="/" 
              icon={LayoutDashboard} 
              label="Panel de Control" 
              active={location.pathname === "/"} 
              isCollapsed={isCollapsed}
              onPrefetchRoute={onPrefetchRoute}
              onNavigateIntent={onNavigateIntent}
              onClick={onClose}
            />

            <NavGroup label="Operaciones" icon={Construction} active={isOperacionesActive} isCollapsed={isCollapsed}>
              <NavItem 
                to="/projects" 
                icon={Construction} 
                label="Proyectos" 
                active={location.pathname === "/projects"} 
                isCollapsed={isCollapsed}
                onPrefetchRoute={onPrefetchRoute}
                onNavigateIntent={onNavigateIntent}
                onClick={onClose}
              />
              <NavItem 
                to="/tasks" 
                icon={ListTodo} 
                label="Tareas" 
                active={location.pathname === "/tasks"} 
                isCollapsed={isCollapsed}
                onPrefetchRoute={onPrefetchRoute}
                onNavigateIntent={onNavigateIntent}
                onClick={onClose}
              />
              <NavItem 
                to="/quotes" 
                icon={FileText} 
                label="Cotizaciones" 
                active={location.pathname === "/quotes"} 
                isCollapsed={isCollapsed}
                onPrefetchRoute={onPrefetchRoute}
                onNavigateIntent={onNavigateIntent}
                onClick={onClose}
              />
              <NavItem 
                to="/clients" 
                icon={Users} 
                label="Clientes" 
                active={location.pathname === "/clients"} 
                isCollapsed={isCollapsed}
                onPrefetchRoute={onPrefetchRoute}
                onNavigateIntent={onNavigateIntent}
                onClick={onClose}
              />
              <NavItem 
                to="/safety" 
                icon={ShieldAlert} 
                label="Seguridad (HSE)" 
                active={location.pathname === "/safety"} 
                isCollapsed={isCollapsed}
                onPrefetchRoute={onPrefetchRoute}
                onNavigateIntent={onNavigateIntent}
                onClick={onClose}
              />
              <NavItem 
                to="/risks" 
                icon={AlertCircle} 
                label="Gestión de Riesgos" 
                active={location.pathname === "/risks"} 
                isCollapsed={isCollapsed}
                onPrefetchRoute={onPrefetchRoute}
                onNavigateIntent={onNavigateIntent}
                onClick={onClose}
              />
              <NavItem 
                to="/workflows" 
                icon={CheckSquare} 
                label="Aprobaciones" 
                active={location.pathname === "/workflows"} 
                isCollapsed={isCollapsed}
                onPrefetchRoute={onPrefetchRoute}
                onNavigateIntent={onNavigateIntent}
                onClick={onClose}
              />
            </NavGroup>

            <NavGroup label="Logística" icon={Package} active={isLogisticaActive} isCollapsed={isCollapsed}>
              <NavItem 
                to="/inventory" 
                icon={Package} 
                label="Almacén" 
                active={location.pathname === "/inventory"} 
                isCollapsed={isCollapsed}
                onPrefetchRoute={onPrefetchRoute}
                onNavigateIntent={onNavigateIntent}
                onClick={onClose}
              />
              <NavItem 
                to="/equipment" 
                icon={Wrench} 
                label="Equipo" 
                active={location.pathname === "/equipment"} 
                isCollapsed={isCollapsed}
                onPrefetchRoute={onPrefetchRoute}
                onNavigateIntent={onNavigateIntent}
                onClick={onClose}
              />
              <NavItem 
                to="/purchase-orders" 
                icon={ShoppingBag} 
                label="Órdenes de Compra" 
                active={location.pathname === "/purchase-orders"} 
                isCollapsed={isCollapsed}
                onPrefetchRoute={onPrefetchRoute}
                onNavigateIntent={onNavigateIntent}
                onClick={onClose}
              />
              <NavItem 
                to="/suppliers" 
                icon={Truck} 
                label="Proveedores" 
                active={location.pathname === "/suppliers"} 
                isCollapsed={isCollapsed}
                onPrefetchRoute={onPrefetchRoute}
                onNavigateIntent={onNavigateIntent}
                onClick={onClose}
              />
            </NavGroup>

            <NavGroup label="Administración" icon={HandCoins} active={isAdministracionActive} isCollapsed={isCollapsed}>
              <NavItem 
                to="/financials" 
                icon={HandCoins} 
                label="Finanzas" 
                active={location.pathname === "/financials"} 
                isCollapsed={isCollapsed}
                onPrefetchRoute={onPrefetchRoute}
                onNavigateIntent={onNavigateIntent}
                onClick={onClose}
              />
              <NavItem 
                to="/subcontracts" 
                icon={HardHat} 
                label="Subcontratos" 
                active={location.pathname === "/subcontracts"} 
                isCollapsed={isCollapsed}
                onPrefetchRoute={onPrefetchRoute}
                onNavigateIntent={onNavigateIntent}
                onClick={onClose}
              />
              <NavItem 
                to="/hr" 
                icon={Briefcase} 
                label="RRHH" 
                active={location.pathname === "/hr"} 
                isCollapsed={isCollapsed}
                onPrefetchRoute={onPrefetchRoute}
                onNavigateIntent={onNavigateIntent}
                onClick={onClose}
              />
              <NavItem 
                to="/documents" 
                icon={Files} 
                label="Documentos" 
                active={location.pathname === "/documents"} 
                isCollapsed={isCollapsed}
                onPrefetchRoute={onPrefetchRoute}
                onNavigateIntent={onNavigateIntent}
                onClick={onClose}
              />
              <NavItem 
                to="/audit-logs" 
                icon={History} 
                label="Registro de Auditoría" 
                active={location.pathname === "/audit-logs"} 
                isCollapsed={isCollapsed}
                onPrefetchRoute={onPrefetchRoute}
                onNavigateIntent={onNavigateIntent}
                onClick={onClose}
              />
            </NavGroup>

            <NavItem 
              to="/analytics" 
              icon={BarChart3} 
              label="Inteligencia" 
              active={location.pathname === "/analytics"} 
              isCollapsed={isCollapsed}
              onPrefetchRoute={onPrefetchRoute}
              onNavigateIntent={onNavigateIntent}
              onClick={onClose}
            />

            <NavItem 
              to="/settings" 
              icon={SettingsIcon} 
              label="Configuración" 
              active={location.pathname === "/settings"} 
              isCollapsed={isCollapsed}
              onPrefetchRoute={onPrefetchRoute}
              onNavigateIntent={onNavigateIntent}
              onClick={onClose}
            />

            {showInstall && (
              <button
                onClick={onInstall}
                className={cn(
                  "w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-300 bg-primary/10 text-primary hover:bg-primary/20 mt-4",
                  isCollapsed && "justify-center px-0"
                )}
              >
                <Download size={18} />
                {!isCollapsed && <span className="font-bold text-sm tracking-tight">Instalar App</span>}
              </button>
            )}
          </nav>

          <div className={cn(
            "mt-auto pt-4 sm:pt-6 border-t border-slate-100 dark:border-slate-800",
            isCollapsed ? "flex justify-center" : "px-1 sm:px-2"
          )}>
            <div className={cn(
              "flex items-center gap-2 sm:gap-3",
              isCollapsed ? "flex-col" : "flex-row"
            )}>
              <div className="relative group">
                <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl bg-primary/10 border border-primary/20 overflow-hidden shadow-inner">
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
                <div className={cn(
                  "absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full border-2 border-white dark:border-slate-900",
                  isOnline ? "bg-emerald-500" : "bg-rose-500"
                )} />
              </div>
              {!isCollapsed && (
                <div className="flex-1 min-w-0">
                  <p className="text-xs sm:text-sm font-black text-slate-900 dark:text-white truncate tracking-tight leading-tight">
                    {user.displayName || 'Usuario'}
                  </p>
                  <p className="text-[8px] sm:text-[10px] font-bold text-slate-400 truncate uppercase tracking-tighter">
                    {user.email}
                  </p>
                </div>
              )}
              {!isCollapsed && (
                <button 
                  onClick={() => auth.signOut()}
                  className="p-1.5 sm:p-2 text-slate-400 hover:text-rose-500 transition-colors"
                  title="Cerrar Sesión"
                >
                  <LogOut size={14} className="sm:w-4 sm:h-4" />
                </button>
              )}
            </div>
          </div>
        </div>
      </motion.aside>
    </>
  );
};
