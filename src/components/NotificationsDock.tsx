import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Bell, ChevronsLeftRight, GripVertical, RotateCcw, Trash2 } from 'lucide-react';
import { cn } from '../lib/utils';
import { useNotifications } from '../contexts/NotificationContext';

const STORAGE_KEY = 'notifications_dock_position_v1';
const DEFAULT_TOP_PERCENT = 82;
const MIN_TOP_PERCENT = 12;
const MAX_TOP_PERCENT = 90;

type DockSide = 'left' | 'right';

type DockPrefs = {
  side: DockSide;
  topPercent: number;
};

const DEFAULT_PREFS: DockPrefs = {
  side: 'right',
  topPercent: DEFAULT_TOP_PERCENT,
};

function clampTop(topPercent: number) {
  return Math.min(MAX_TOP_PERCENT, Math.max(MIN_TOP_PERCENT, topPercent));
}

function loadDockPrefs(): DockPrefs {
  if (typeof window === 'undefined') {
    return DEFAULT_PREFS;
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return DEFAULT_PREFS;
    }

    const parsed = JSON.parse(raw) as Partial<DockPrefs>;
    const side = parsed.side === 'left' ? 'left' : 'right';
    const topPercent = clampTop(Number(parsed.topPercent ?? DEFAULT_TOP_PERCENT));
    return { side, topPercent };
  } catch {
    return DEFAULT_PREFS;
  }
}

function getSnapKick(side: DockSide) {
  if (typeof window === 'undefined') return side === 'right' ? 14 : -14;
  const magnitude = window.innerWidth < 640 ? 8 : 14;
  return side === 'right' ? magnitude : -magnitude;
}

export function NotificationsDock() {
  const { notifications, unreadCount, markAllAsRead, markAsRead, removeNotification, setPanelOpen } = useNotifications();
  const [{ side, topPercent }, setDockPrefs] = useState<DockPrefs>(() => loadDockPrefs());
  const [canHover, setCanHover] = useState(false);
  const [snapOffsetX, setSnapOffsetX] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const [hasNewPulse, setHasNewPulse] = useState(false);
  const hasMountedRef = useRef(false);
  const lastUnreadRef = useRef(unreadCount);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const draggingRef = useRef(false);
  const startPointerYRef = useRef(0);
  const startTopRef = useRef(DEFAULT_TOP_PERCENT);

  useEffect(() => {
    setPanelOpen(isOpen);
  }, [isOpen, setPanelOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (!panelRef.current) return;
      if (!panelRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    window.addEventListener('mousedown', handlePointerDown);
    return () => window.removeEventListener('mousedown', handlePointerDown);
  }, [isOpen]);

  useEffect(() => {
    if (unreadCount > lastUnreadRef.current) {
      setHasNewPulse(true);
      const timer = window.setTimeout(() => setHasNewPulse(false), 1600);
      lastUnreadRef.current = unreadCount;
      return () => window.clearTimeout(timer);
    }

    lastUnreadRef.current = unreadCount;
  }, [unreadCount]);

  const handlePointerMove = (event: PointerEvent) => {
    if (!draggingRef.current || typeof window === 'undefined' || window.innerHeight <= 0) {
      return;
    }

    const deltaY = event.clientY - startPointerYRef.current;
    const deltaPercent = (deltaY / window.innerHeight) * 100;
    const nextTop = clampTop(startTopRef.current + deltaPercent);
    const viewportMidpoint = window.innerWidth / 2;
    const nextSide: DockSide = event.clientX < viewportMidpoint ? 'left' : 'right';

    setDockPrefs((current) => ({
      ...current,
      topPercent: nextTop,
      side: nextSide,
    }));
  };

  const stopDragging = () => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    window.removeEventListener('pointermove', handlePointerMove);
    window.removeEventListener('pointerup', stopDragging);
    window.removeEventListener('pointercancel', stopDragging);
  };

  const startDragging = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (typeof window === 'undefined' || window.innerHeight <= 0) return;
    draggingRef.current = true;
    startPointerYRef.current = event.clientY;
    startTopRef.current = topPercent;
    event.currentTarget.setPointerCapture(event.pointerId);
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', stopDragging);
    window.addEventListener('pointercancel', stopDragging);
  };

  useEffect(() => {
    return () => stopDragging();
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ side, topPercent }));
  }, [side, topPercent]);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;

    const mediaQuery = window.matchMedia('(hover: hover) and (pointer: fine)');
    const update = () => setCanHover(mediaQuery.matches);

    update();
    mediaQuery.addEventListener('change', update);
    return () => mediaQuery.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!hasMountedRef.current) {
      hasMountedRef.current = true;
      return;
    }

    const kick = getSnapKick(side);
    setSnapOffsetX(kick);
    const timer = window.setTimeout(() => setSnapOffsetX(0), 16);
    return () => window.clearTimeout(timer);
  }, [side]);

  const isRight = side === 'right';
  const resetDock = () => setDockPrefs(DEFAULT_PREFS);
  const tooltipAnchorClass = isRight ? 'right-full mr-2 origin-right' : 'left-full ml-2 origin-left';
  const tooltipMotionClass = isRight
    ? 'translate-x-1 group-hover:translate-x-0'
    : '-translate-x-1 group-hover:translate-x-0';

  return (
    <motion.div
      ref={panelRef}
      initial={{ opacity: 0, x: 24 }}
      animate={{ opacity: 1, x: snapOffsetX }}
      transition={{ x: { type: 'spring', stiffness: 380, damping: 26 }, opacity: { duration: 0.2 } }}
      className="fixed z-[112]"
      style={{
        top: `${topPercent}%`,
        transform: 'translateY(-50%)',
        left: isRight ? 'auto' : '1rem',
        right: isRight ? '1rem' : 'auto',
      }}
    >
      <div className={cn('mb-2 flex flex-col gap-1.5', isRight ? 'items-end' : 'items-start')}>
        <div className="relative group">
          <button
            type="button"
            onPointerDown={startDragging}
            title="Arrastrar panel"
            aria-label="Arrastrar panel"
            className="h-8 w-8 rounded-full border border-white/30 bg-slate-900/65 text-white/85 hover:text-white transition-colors shadow-xl backdrop-blur flex items-center justify-center"
          >
            <GripVertical size={13} />
          </button>
          {canHover && (
            <span
              className={cn(
                'pointer-events-none absolute top-1/2 -translate-y-1/2 whitespace-nowrap rounded-md border border-white/20 bg-slate-950/95 px-2 py-1 text-[10px] font-semibold text-white opacity-0 transition-all duration-150',
                tooltipAnchorClass,
                tooltipMotionClass,
                'group-hover:opacity-100'
              )}
            >
              Arrastrar
            </span>
          )}
        </div>

        <div className="relative group">
          <button
            type="button"
            onClick={() => setDockPrefs((current) => ({ ...current, side: current.side === 'right' ? 'left' : 'right' }))}
            title="Cambiar lado"
            aria-label="Cambiar lado"
            className="h-8 w-8 rounded-full border border-white/30 bg-slate-900/65 text-white/85 hover:text-white transition-colors shadow-xl backdrop-blur flex items-center justify-center"
          >
            <ChevronsLeftRight size={13} />
          </button>
          {canHover && (
            <span
              className={cn(
                'pointer-events-none absolute top-1/2 -translate-y-1/2 whitespace-nowrap rounded-md border border-white/20 bg-slate-950/95 px-2 py-1 text-[10px] font-semibold text-white opacity-0 transition-all duration-150',
                tooltipAnchorClass,
                tooltipMotionClass,
                'group-hover:opacity-100'
              )}
            >
              Cambiar lado
            </span>
          )}
        </div>

        <div className="relative group">
          <button
            type="button"
            onClick={resetDock}
            title="Restablecer posicion"
            aria-label="Restablecer posicion"
            className="h-8 w-8 rounded-full border border-white/30 bg-slate-900/65 text-white/85 hover:text-white transition-colors shadow-xl backdrop-blur flex items-center justify-center"
          >
            <RotateCcw size={12} />
          </button>
          {canHover && (
            <span
              className={cn(
                'pointer-events-none absolute top-1/2 -translate-y-1/2 whitespace-nowrap rounded-md border border-white/20 bg-slate-950/95 px-2 py-1 text-[10px] font-semibold text-white opacity-0 transition-all duration-150',
                tooltipAnchorClass,
                tooltipMotionClass,
                'group-hover:opacity-100'
              )}
            >
              Restablecer
            </span>
          )}
        </div>
      </div>

      <div className="relative group">
        <button
          onClick={() => {
            const next = !isOpen;
            setIsOpen(next);
            if (next) {
              void markAllAsRead();
            }
          }}
          title="Notificaciones"
          className={cn(
            'relative h-11 w-11 sm:h-12 sm:w-12 rounded-full border border-white/40 text-white transition-all shadow-2xl flex items-center justify-center backdrop-blur',
            isOpen
              ? 'bg-rose-700/95 ring-4 ring-rose-300/35'
              : 'bg-rose-600/92 hover:bg-rose-500/96'
          )}
        >
          <Bell size={18} />
          <AnimatePresence>
            {unreadCount > 0 && !isOpen && (
              <motion.span
                key={`badge_${unreadCount}`}
                initial={{ scale: 0.7, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.7, opacity: 0 }}
                transition={{ duration: 0.18 }}
                className={cn(
                  'absolute -top-1 -right-1 min-w-[19px] h-[19px] px-1 bg-white text-rose-700 text-[10px] font-black rounded-full flex items-center justify-center border border-rose-200',
                  hasNewPulse && 'ring-4 ring-rose-300/70 dark:ring-rose-500/40'
                )}
              >
                {unreadCount > 9 ? '9+' : unreadCount}
              </motion.span>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {hasNewPulse && !isOpen && (
              <motion.span
                initial={{ opacity: 0.7, scale: 0.9 }}
                animate={{ opacity: 0, scale: 1.5 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 1.1, ease: 'easeOut' }}
                className="pointer-events-none absolute -inset-1 rounded-full border border-rose-200"
              />
            )}
          </AnimatePresence>
        </button>
        {canHover && (
          <span
            className={cn(
              'pointer-events-none absolute top-1/2 -translate-y-1/2 whitespace-nowrap rounded-md border border-white/20 bg-slate-950/95 px-2 py-1 text-[10px] font-semibold text-white opacity-0 transition-all duration-150',
              tooltipAnchorClass,
              tooltipMotionClass,
              'group-hover:opacity-100'
            )}
          >
            Notificaciones
          </span>
        )}
      </div>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.98 }}
            className={cn(
              'absolute bottom-14 sm:bottom-16 w-[min(90vw,360px)] bg-white/98 dark:bg-slate-900/97 border border-slate-300 dark:border-slate-600 rounded-2xl shadow-2xl overflow-hidden',
              isRight ? 'right-0' : 'left-0'
            )}
          >
            <div className="px-3 py-2.5 border-b border-slate-300 dark:border-slate-700 flex items-center justify-between bg-slate-100/95 dark:bg-slate-800/95">
              <h3 className="font-black text-xs uppercase tracking-widest text-slate-900 dark:text-white">Notificaciones</h3>
              <button
                onClick={() => markAllAsRead()}
                className="text-[10px] font-black uppercase text-primary hover:text-primary-hover"
              >
                Marcar leidas
              </button>
            </div>

            <div className="max-h-[48vh] overflow-y-auto custom-scrollbar">
              {notifications.length === 0 ? (
                <div className="p-5 text-center">
                  <p className="text-xs text-slate-700 dark:text-slate-200 font-bold">No hay notificaciones</p>
                </div>
              ) : (
                notifications.map((n) => (
                  <div
                    key={n.id}
                    onClick={() => markAsRead(n.id!)}
                    className={cn(
                      'px-3 py-2.5 border-b border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer',
                      !n.read && 'bg-primary-light/40 dark:bg-primary/15'
                    )}
                  >
                    <div className="flex gap-3">
                      <div className={cn(
                        'w-2 h-2 rounded-full mt-1.5 flex-shrink-0',
                        n.type === 'subcontract' ? 'bg-rose-500' : n.type === 'project' ? 'bg-amber-500' : 'bg-blue-500'
                      )} />
                      <div className="flex-1">
                        <p className="text-xs font-black text-slate-900 dark:text-white mb-1 leading-tight">{n.title}</p>
                        <p className="text-[11px] text-slate-700 dark:text-slate-200 leading-relaxed mb-1.5 break-words line-clamp-2">{n.body}</p>
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-[9px] font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wide">
                            {n.createdAt ? new Date(n.createdAt).toLocaleString() : 'Reciente'}
                          </p>
                          {n.id && (
                            <button
                              type="button"
                              title="Eliminar notificacion"
                              aria-label="Eliminar notificacion"
                              onClick={(event) => {
                                event.stopPropagation();
                                void removeNotification(n.id!);
                              }}
                              className="p-1 rounded-md text-slate-500 hover:text-rose-700 hover:bg-rose-100 dark:text-slate-300 dark:hover:text-rose-300 dark:hover:bg-rose-900/30 transition-colors"
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
    </motion.div>
  );
}
