import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import {
  Zap,
  X,
  ArrowDownCircle,
  ArrowUpCircle,
  FileText,
  Building2,
  HardHat,
  Users,
  Truck,
  ShoppingCart,
} from 'lucide-react';

type QuickAction = {
  id:
    | 'new-income'
    | 'new-expense'
    | 'new-quote'
    | 'new-project'
    | 'new-subcontract'
    | 'new-client'
    | 'new-supplier'
    | 'new-purchase-order';
  label: string;
  route: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
};

const QUICK_ACTIONS: QuickAction[] = [
  { id: 'new-income', label: 'Nuevo ingreso', route: '/financials', icon: ArrowUpCircle },
  { id: 'new-expense', label: 'Nuevo gasto', route: '/financials', icon: ArrowDownCircle },
  { id: 'new-quote', label: 'Nueva cotizacion', route: '/quotes', icon: FileText },
  { id: 'new-project', label: 'Nueva obra', route: '/projects', icon: Building2 },
  { id: 'new-subcontract', label: 'Nuevo subcontrato', route: '/subcontracts', icon: HardHat },
  { id: 'new-client', label: 'Nuevo cliente', route: '/clients', icon: Users },
  { id: 'new-supplier', label: 'Nuevo proveedor', route: '/suppliers', icon: Truck },
  { id: 'new-purchase-order', label: 'Orden de compra', route: '/purchase-orders', icon: ShoppingCart },
];

export function QuickActionsLauncher() {
  const [isOpen, setIsOpen] = useState(false);

  const triggerQuickAction = (action: QuickAction) => {
    const targetHash = `#${action.route}`;
    const dispatchAction = () => {
      window.dispatchEvent(
        new CustomEvent('QUICK_ACTION_TRIGGER', {
          detail: {
            action: action.id,
            route: action.route,
          },
        })
      );
    };

    const currentHash = window.location.hash || '#/';
    if (currentHash !== targetHash) {
      window.location.hash = targetHash;
      window.setTimeout(dispatchAction, 350);
    } else {
      dispatchAction();
    }

    setIsOpen(false);
  };

  return (
    <>
      <AnimatePresence>
        {!isOpen && (
          <motion.button
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            whileHover={{ x: 4 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => setIsOpen(true)}
            className="fixed z-[95] left-0 top-1/2 -translate-y-1/2 bg-slate-900 text-white rounded-r-xl shadow-2xl px-2.5 py-4 hover:bg-slate-800 transition-all"
            title="Abrir acciones rapidas"
          >
            <span className="[writing-mode:vertical-rl] rotate-180 text-[11px] font-black tracking-[0.16em] uppercase flex items-center gap-1">
              Atajos
            </span>
          </motion.button>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -30 }}
            className="fixed z-[95] left-4 top-1/2 -translate-y-1/2 w-[300px] bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden"
          >
            <div className="bg-slate-900 text-white p-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center">
                  <Zap size={16} />
                </div>
                <div>
                  <h3 className="text-sm font-bold">Acciones rapidas</h3>
                  <p className="text-[10px] uppercase tracking-wider text-slate-400">Crear registros</p>
                </div>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                title="Cerrar"
                className="p-1.5 rounded-md hover:bg-white/10 transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-3 grid grid-cols-1 gap-2 bg-slate-50 dark:bg-slate-900/40">
              {QUICK_ACTIONS.map((action) => (
                <button
                  key={action.id}
                  onClick={() => triggerQuickAction(action)}
                  className={cn(
                    'w-full flex items-center gap-3 p-3 rounded-xl border transition-all text-left',
                    'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700',
                    'hover:border-primary/40 hover:bg-primary-light/30 dark:hover:bg-primary/10'
                  )}
                >
                  <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-600 dark:text-slate-300">
                    <action.icon size={16} />
                  </div>
                  <span className="text-sm font-bold text-slate-700 dark:text-slate-100">{action.label}</span>
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
