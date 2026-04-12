import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Bell, Trash2 } from 'lucide-react';
import { cn } from '../lib/utils';
import { useNotifications } from '../contexts/NotificationContext';

export function NotificationsDock() {
  const { notifications, unreadCount, markAllAsRead, markAsRead, removeNotification, setPanelOpen } = useNotifications();
  const [isOpen, setIsOpen] = useState(false);
  const [hasNewPulse, setHasNewPulse] = useState(false);
  const lastUnreadRef = useRef(unreadCount);
  const panelRef = useRef<HTMLDivElement | null>(null);

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

  return (
    <div ref={panelRef} className="fixed z-[112] right-[106px] top-[46%] -translate-y-1/2">
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
          'relative px-2.5 py-3.5 rounded-l-xl rounded-r-md border border-white/30 text-white transition-all shadow-2xl',
          isOpen
            ? 'bg-rose-700/95'
            : 'bg-rose-600/92 hover:bg-rose-500/96'
        )}
      >
        <span className="[writing-mode:vertical-rl] rotate-180 text-[10px] font-black tracking-[0.18em] uppercase flex items-center gap-1">
          <Bell size={14} />
          Alerts
        </span>
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
              className="pointer-events-none absolute -inset-1 rounded-l-xl rounded-r-md border border-rose-200"
            />
          )}
        </AnimatePresence>
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, x: 10, scale: 0.98 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 10, scale: 0.98 }}
            className="absolute right-full mr-3 top-0 w-[min(94vw,460px)] bg-white/98 dark:bg-slate-900/97 border-2 border-slate-300 dark:border-slate-600 rounded-2xl shadow-2xl overflow-hidden"
          >
            <div className="p-4 border-b border-slate-300 dark:border-slate-700 flex items-center justify-between bg-slate-100/95 dark:bg-slate-800/95">
              <h3 className="font-black text-xs uppercase tracking-widest text-slate-900 dark:text-white">Notificaciones</h3>
              <button
                onClick={() => markAllAsRead()}
                className="text-[10px] font-black uppercase text-primary hover:text-primary-hover"
              >
                Marcar leidas
              </button>
            </div>

            <div className="max-h-[64vh] overflow-y-auto custom-scrollbar">
              {notifications.length === 0 ? (
                <div className="p-8 text-center">
                  <p className="text-sm text-slate-700 dark:text-slate-200 font-bold">No hay notificaciones</p>
                </div>
              ) : (
                notifications.map((n) => (
                  <div
                    key={n.id}
                    onClick={() => markAsRead(n.id!)}
                    className={cn(
                      'p-4 border-b border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer',
                      !n.read && 'bg-primary-light/40 dark:bg-primary/15'
                    )}
                  >
                    <div className="flex gap-3">
                      <div className={cn(
                        'w-2 h-2 rounded-full mt-1.5 flex-shrink-0',
                        n.type === 'subcontract' ? 'bg-rose-500' : n.type === 'project' ? 'bg-amber-500' : 'bg-blue-500'
                      )} />
                      <div className="flex-1">
                        <p className="text-sm font-black text-slate-900 dark:text-white mb-1 leading-tight">{n.title}</p>
                        <p className="text-xs text-slate-700 dark:text-slate-200 leading-relaxed mb-2 break-words">{n.body}</p>
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-[10px] font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wide">
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
    </div>
  );
}
