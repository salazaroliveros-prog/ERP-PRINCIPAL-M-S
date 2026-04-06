import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { 
  LayoutDashboard, 
  Construction, 
  Package, 
  HandCoins, 
  FileText,
  MoreHorizontal,
  Download
} from 'lucide-react';
import { cn } from '../lib/utils';

import { motion } from 'motion/react';

interface BottomNavProps {
  onMenuClick: () => void;
  onPrefetchRoute?: (path: string) => void;
  onNavigateIntent?: (path: string) => void;
  deferredPrompt: any;
  onInstall: () => void;
}

export const BottomNav = ({ onMenuClick, onPrefetchRoute, onNavigateIntent, deferredPrompt, onInstall }: BottomNavProps) => {
  const location = useLocation();

  const navItems = [
    { to: '/', icon: LayoutDashboard, label: 'Inicio' },
    { to: '/projects', icon: Construction, label: 'Obras' },
    { to: '/quotes', icon: FileText, label: 'Cotiz.' },
    { to: '/inventory', icon: Package, label: 'Invent.' },
    { to: '/financials', icon: HandCoins, label: 'Finan.' },
  ];

  return (
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 dark:bg-slate-900/95 backdrop-blur-2xl border-t border-slate-100 dark:border-slate-800 px-2 pb-safe pt-2 shadow-[0_-10px_40px_rgba(0,0,0,0.05)] dark:shadow-[0_-10px_40px_rgba(0,0,0,0.2)]">
      <div className="flex items-center justify-between max-w-lg mx-auto">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = location.pathname === item.to;
          return (
            <Link
              key={item.to}
              to={item.to}
              onClick={() => onNavigateIntent?.(item.to)}
              onMouseEnter={() => onPrefetchRoute?.(item.to)}
              onFocus={() => onPrefetchRoute?.(item.to)}
              onTouchStart={() => onPrefetchRoute?.(item.to)}
              className={cn(
                "flex flex-col items-center gap-1 p-2 transition-all duration-300 relative min-w-[60px]",
                isActive ? "text-primary" : "text-slate-400 dark:text-slate-500"
              )}
            >
              {isActive && (
                <motion.div 
                  layoutId="bottom-nav-active"
                  className="absolute -top-2 w-8 h-1 bg-primary rounded-full shadow-[0_0_10px_rgba(var(--primary),0.5)]" 
                  transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                />
              )}
              <motion.div
                whileTap={{ scale: 0.85 }}
                whileHover={{ y: -2 }}
                className={cn(
                  "p-1.5 rounded-xl transition-all duration-300",
                  isActive && "bg-primary/10 scale-110 shadow-inner"
                )}
              >
                <Icon size={20} className={cn(isActive && "animate-pulse")} />
              </motion.div>
              <span className={cn(
                "text-[9px] font-black uppercase tracking-tighter transition-all duration-300",
                isActive ? "opacity-100 scale-100 translate-y-0" : "opacity-60 scale-90 translate-y-0.5"
              )}>
                {item.label}
              </span>
            </Link>
          );
        })}
        {deferredPrompt && (
          <button
            onClick={onInstall}
            className="flex flex-col items-center gap-1 p-2 text-primary animate-bounce min-w-[60px]"
          >
            <div className="p-1.5 bg-primary/10 rounded-xl">
              <Download size={20} />
            </div>
            <span className="text-[9px] font-black uppercase tracking-tighter">Instalar</span>
          </button>
        )}
        <button
          onClick={onMenuClick}
          className="flex flex-col items-center gap-1 p-2 text-slate-400 dark:text-slate-500 min-w-[60px] group"
        >
          <motion.div 
            whileTap={{ scale: 0.85 }} 
            whileHover={{ y: -2 }}
            className="p-1.5 group-hover:bg-slate-100 dark:group-hover:bg-slate-800 rounded-xl transition-all"
          >
            <MoreHorizontal size={20} />
          </motion.div>
          <span className="text-[9px] font-black uppercase tracking-tighter opacity-60 group-hover:opacity-100 transition-opacity">Más</span>
        </button>
      </div>
    </nav>
  );
};
