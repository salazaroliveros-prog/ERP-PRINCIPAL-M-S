import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { Bot, ChevronsLeftRight, GripVertical, RotateCcw, Zap } from 'lucide-react';
import { cn } from '../lib/utils';

const STORAGE_KEY = 'side_tools_dock_position_v1';
const DEFAULT_TOP_PERCENT = 50;
const MIN_TOP_PERCENT = 12;
const MAX_TOP_PERCENT = 88;

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

export function SideToolsDock() {
  const [{ side, topPercent }, setDockPrefs] = useState<DockPrefs>(() => loadDockPrefs());
  const [canHover, setCanHover] = useState(false);
  const [snapOffsetX, setSnapOffsetX] = useState(0);
  const draggingRef = useRef(false);
  const hasMountedRef = useRef(false);
  const startPointerYRef = useRef(0);
  const startTopRef = useRef(DEFAULT_TOP_PERCENT);

  const openAI = () => {
    window.dispatchEvent(new Event('OPEN_AI_CHAT'));
  };

  const openQuickActions = () => {
    window.dispatchEvent(new Event('OPEN_QUICK_ACTIONS'));
  };

  const setTopFromClientY = (clientY: number) => {
    if (typeof window === 'undefined' || window.innerHeight <= 0) return;
    const nextTop = clampTop((clientY / window.innerHeight) * 100);
    setDockPrefs((current) => ({ ...current, topPercent: nextTop }));
  };

  const switchSideFromClientX = (clientX: number) => {
    if (typeof window === 'undefined' || window.innerWidth <= 0) return;
    const viewportMidpoint = window.innerWidth / 2;
    const nextSide: DockSide = clientX < viewportMidpoint ? 'left' : 'right';
    setDockPrefs((current) => (current.side === nextSide ? current : { ...current, side: nextSide }));
  };

  const handlePointerMove = (event: PointerEvent) => {
    if (!draggingRef.current || typeof window === 'undefined' || window.innerHeight <= 0) {
      return;
    }

    const deltaY = event.clientY - startPointerYRef.current;
    const deltaPercent = (deltaY / window.innerHeight) * 100;
    const nextTop = clampTop(startTopRef.current + deltaPercent);

    setDockPrefs((current) => ({ ...current, topPercent: nextTop }));
    switchSideFromClientX(event.clientX);
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
      initial={{ opacity: 0, x: 24 }}
      animate={{ opacity: 1, x: snapOffsetX }}
      transition={{ x: { type: 'spring', stiffness: 380, damping: 26 }, opacity: { duration: 0.2 } }}
      className="fixed z-[110]"
      style={{
        top: `${topPercent}%`,
        transform: 'translateY(-50%)',
        left: isRight ? 'auto' : 0,
        right: isRight ? 0 : 'auto',
      }}
    >
      <div
        className={cn(
          'border border-white/20 bg-slate-900/55 backdrop-blur-md shadow-2xl p-1.5 flex flex-col gap-1.5 select-none touch-none',
          isRight ? 'rounded-l-2xl' : 'rounded-r-2xl'
        )}
      >
        <div className={cn('relative group', isRight ? 'self-start' : 'self-end')}>
          <button
            type="button"
            onPointerDown={startDragging}
            title="Arrastrar panel"
            aria-label="Arrastrar panel"
            className="px-1.5 py-1 rounded-md text-white/70 hover:text-white transition-colors border border-white/15 bg-slate-950/25"
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

        <div className={cn('relative group', isRight ? 'self-start' : 'self-end')}>
          <button
            type="button"
            onClick={() => setDockPrefs((current) => ({ ...current, side: current.side === 'right' ? 'left' : 'right' }))}
            title="Cambiar lado"
            aria-label="Cambiar lado"
            className="px-1.5 py-1.5 rounded-md text-white/85 hover:text-white transition-colors border border-white/15 bg-slate-950/30"
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

        <div className={cn('relative group', isRight ? 'self-start' : 'self-end')}>
          <button
            type="button"
            onClick={resetDock}
            title="Restablecer posicion"
            aria-label="Restablecer posicion"
            className="px-1.5 py-1.5 rounded-md text-white/85 hover:text-white transition-colors border border-white/15 bg-slate-950/30"
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

        <div className={cn('relative group', isRight ? 'self-start' : 'self-end')}>
          <button
            onClick={openAI}
            title="Asistente IA"
            className={cn(
              'px-2 py-3 text-white transition-all',
              isRight ? 'rounded-l-xl rounded-r-md' : 'rounded-r-xl rounded-l-md',
              'bg-primary/65 hover:bg-primary/85 border border-white/20'
            )}
          >
            <span className="[writing-mode:vertical-rl] rotate-180 text-[10px] font-black tracking-[0.18em] uppercase flex items-center gap-1">
              <Bot size={14} />
              IA
            </span>
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
              Asistente IA
            </span>
          )}
        </div>

        <div className={cn('relative group', isRight ? 'self-start' : 'self-end')}>
          <button
            onClick={openQuickActions}
            title="Atajos"
            className={cn(
              'px-2 py-3 text-white transition-all',
              isRight ? 'rounded-l-xl rounded-r-md' : 'rounded-r-xl rounded-l-md',
              'bg-slate-800/70 hover:bg-slate-700/90 border border-white/20'
            )}
          >
            <span className="[writing-mode:vertical-rl] rotate-180 text-[10px] font-black tracking-[0.18em] uppercase flex items-center gap-1">
              <Zap size={14} />
              Atajos
            </span>
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
              Atajos
            </span>
          )}
        </div>
      </div>
    </motion.div>
  );
}
