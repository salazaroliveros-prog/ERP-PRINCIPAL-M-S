import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import {
  Zap,
  X,
  Plus,
  ArrowDownCircle,
  ArrowUpCircle,
  FileText,
  Building2,
  HardHat,
  Users,
  Truck,
  ShoppingCart,
  Mic,
  Send,
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
  const [mobileTab, setMobileTab] = useState<'finance' | 'forms'>('finance');
  const [quickPrompt, setQuickPrompt] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth < 1024 : false
  );
  const panelRef = React.useRef<HTMLDivElement | null>(null);
  const recognitionRef = React.useRef<any>(null);
  const quickPromptRef = React.useRef('');
  const VOICE_SEND_KEYWORD = 'enviar';

  const dispatchQuickPrompt = (rawPrompt: string) => {
    const trimmedPrompt = rawPrompt.trim();
    if (!trimmedPrompt) return;

    window.dispatchEvent(
      new CustomEvent('AI_COMMAND', {
        detail: {
          command: 'QUICK_PROMPT',
          params: { text: trimmedPrompt },
        },
      })
    );

    setQuickPrompt('');
    setIsOpen(false);
  };

  React.useEffect(() => {
    quickPromptRef.current = quickPrompt;
  }, [quickPrompt]);

  React.useEffect(() => {
    if (typeof window === 'undefined') return;

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    recognitionRef.current = new SpeechRecognition();
    recognitionRef.current.continuous = false;
    recognitionRef.current.interimResults = false;
    recognitionRef.current.lang = 'es-ES';

    recognitionRef.current.onresult = (event: any) => {
      const transcript = event?.results?.[0]?.[0]?.transcript || '';
      if (transcript) {
        const composedPrompt = [quickPromptRef.current, transcript]
          .filter(Boolean)
          .join(' ')
          .trim();
        const normalizedPrompt = composedPrompt.toLowerCase().trim();
        const shouldAutoSend = normalizedPrompt.endsWith(VOICE_SEND_KEYWORD);

        if (shouldAutoSend) {
          const cleanedPrompt = composedPrompt
            .replace(new RegExp(`\\s*${VOICE_SEND_KEYWORD}\\s*$`, 'i'), '')
            .trim();
          if (cleanedPrompt) {
            setQuickPrompt(cleanedPrompt);
            dispatchQuickPrompt(cleanedPrompt);
          } else {
            setQuickPrompt('');
          }
        } else {
          setQuickPrompt(composedPrompt);
        }
      }
      setIsListening(false);
    };

    recognitionRef.current.onerror = () => {
      setIsListening(false);
    };

    recognitionRef.current.onend = () => {
      setIsListening(false);
    };

    return () => {
      recognitionRef.current?.stop?.();
    };
  }, []);

  React.useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 1024);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  React.useEffect(() => {
    const handleOpenQuickActions = () => {
      window.dispatchEvent(new CustomEvent('SIDE_TOOL_WINDOW_OPEN', { detail: { source: 'quick-actions' } }));
      setIsOpen(true);
    };

    const handleSideToolOpen = (event: Event) => {
      const customEvent = event as CustomEvent<{ source?: string }>;
      if (customEvent.detail?.source && customEvent.detail.source !== 'quick-actions') {
        setIsOpen(false);
      }
    };

    window.addEventListener('OPEN_QUICK_ACTIONS', handleOpenQuickActions);
    window.addEventListener('SIDE_TOOL_WINDOW_OPEN', handleSideToolOpen);
    return () => {
      window.removeEventListener('OPEN_QUICK_ACTIONS', handleOpenQuickActions);
      window.removeEventListener('SIDE_TOOL_WINDOW_OPEN', handleSideToolOpen);
    };
  }, []);

  React.useEffect(() => {
    if (!isOpen) return;

    let inactivityTimer: number | null = null;
    const AUTO_CLOSE_MS = 30000;

    const closePanel = () => setIsOpen(false);
    const resetTimer = () => {
      if (inactivityTimer) {
        window.clearTimeout(inactivityTimer);
      }
      inactivityTimer = window.setTimeout(closePanel, AUTO_CLOSE_MS);
    };

    const handlePointerDown = (event: PointerEvent) => {
      if (!panelRef.current) return;
      const target = event.target as Node | null;
      if (target && panelRef.current.contains(target)) {
        resetTimer();
      }
    };

    const events: Array<keyof WindowEventMap> = ['mousemove', 'mousedown', 'keydown', 'touchstart'];
    events.forEach((eventName) => window.addEventListener(eventName, resetTimer, { passive: true }));
    window.addEventListener('pointerdown', handlePointerDown, { passive: true });
    resetTimer();

    return () => {
      if (inactivityTimer) {
        window.clearTimeout(inactivityTimer);
      }
      events.forEach((eventName) => window.removeEventListener(eventName, resetTimer));
      window.removeEventListener('pointerdown', handlePointerDown);
    };
  }, [isOpen]);

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

  const sendQuickPrompt = () => {
    dispatchQuickPrompt(quickPrompt);
  };

  const toggleQuickListening = () => {
    if (!recognitionRef.current) return;
    if (isListening) {
      recognitionRef.current.stop();
      return;
    }

    try {
      recognitionRef.current.start();
      setIsListening(true);
    } catch {
      setIsListening(false);
    }
  };

  const financialQuickActions = QUICK_ACTIONS.filter(
    (action) => action.id === 'new-income' || action.id === 'new-expense'
  );
  const formsQuickActions = QUICK_ACTIONS.filter(
    (action) => action.id !== 'new-income' && action.id !== 'new-expense'
  );

  return (
    <>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            ref={panelRef}
            initial={isMobile ? { opacity: 0, y: 20 } : { opacity: 0, x: 30 }}
            animate={isMobile ? { opacity: 1, y: 0 } : { opacity: 1, x: 0 }}
            exit={isMobile ? { opacity: 0, y: 20 } : { opacity: 0, x: 30 }}
            className={cn(
              'fixed z-[115] bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden',
              isMobile
                ? 'left-3 right-3 bottom-28 max-h-[70vh]'
                : 'right-16 top-1/2 -translate-y-1/2 w-[300px]'
            )}
          >
            <div className="bg-slate-900 text-white p-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center">
                  <Zap size={16} />
                </div>
                <div>
                  <h3 className="text-sm font-bold">Acciones rapidas</h3>
                  <p className="text-[10px] uppercase tracking-wider text-slate-400">Formularios y captura rápida</p>
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

            {isMobile && (
              <div className="px-3 pt-3 pb-1 bg-slate-50 dark:bg-slate-900/60 border-b border-slate-200 dark:border-slate-800 flex items-center gap-2">
                <button
                  onClick={() => setMobileTab('finance')}
                  className={cn(
                    'flex-1 px-2 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider border',
                    mobileTab === 'finance'
                      ? 'bg-primary text-white border-primary'
                      : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-300 dark:border-slate-700'
                  )}
                >
                  Ingreso rápido
                </button>
                <button
                  onClick={() => setMobileTab('forms')}
                  className={cn(
                    'flex-1 px-2 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider border',
                    mobileTab === 'forms'
                      ? 'bg-primary text-white border-primary'
                      : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-300 dark:border-slate-700'
                  )}
                >
                  Formularios
                </button>
              </div>
            )}

            <div className="px-3 pt-3 pb-2 bg-slate-50 dark:bg-slate-900/40 border-b border-slate-200 dark:border-slate-800">
              <div className="text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-300 mb-2">
                Asistente IA rapido
              </div>
              <div className="text-[10px] text-slate-500 dark:text-slate-400 mb-2">
                Consejo: al dictar, termina con "enviar" para mandar automaticamente.
              </div>
              <div className="flex items-center gap-2">
                <input
                  value={quickPrompt}
                  onChange={(event) => setQuickPrompt(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      sendQuickPrompt();
                    }
                  }}
                  placeholder="Escribe una instruccion..."
                  className="flex-1 px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-[12px] text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
                <button
                  onClick={toggleQuickListening}
                  title={isListening ? 'Detener dictado' : 'Dictar (di "enviar" al final para autoenviar)'}
                  className={cn(
                    'h-9 w-9 rounded-lg border flex items-center justify-center transition-colors',
                    isListening
                      ? 'bg-rose-600 text-white border-rose-600'
                      : 'bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                  )}
                >
                  <Mic size={14} />
                </button>
                <button
                  onClick={sendQuickPrompt}
                  disabled={!quickPrompt.trim()}
                  title="Enviar a IA"
                  className="h-9 px-3 rounded-lg bg-primary text-white border border-primary disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                >
                  <Send size={13} />
                </button>
              </div>
            </div>

            <div className={cn('p-3 grid grid-cols-1 gap-2 bg-slate-50 dark:bg-slate-900/40', isMobile && 'overflow-y-auto')}>
              {(isMobile
                ? (mobileTab === 'finance' ? financialQuickActions : formsQuickActions)
                : QUICK_ACTIONS
              ).map((action) => (
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
                  {isMobile && action.id !== 'new-income' && action.id !== 'new-expense' && (
                    <Plus size={14} className="ml-auto text-slate-400" />
                  )}
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
