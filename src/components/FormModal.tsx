import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Maximize2, Minimize2, ZoomIn, ZoomOut, RotateCcw, Move } from 'lucide-react';
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';
import { cn } from '../lib/utils';

interface FormModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  maxWidth?: string;
  isFullscreen?: boolean;
  fullVertical?: boolean;
  closeOnOverlayClick?: boolean;
}

export const FormModal = ({ 
  isOpen, 
  onClose, 
  title, 
  children, 
  footer,
  maxWidth = "max-w-4xl",
  isFullscreen: initialFullscreen = false,
  fullVertical = false,
  closeOnOverlayClick = true
}: FormModalProps) => {
  const [isFullscreen, setIsFullscreen] = useState(initialFullscreen);
  const [isZoomEnabled, setIsZoomEnabled] = useState(false);
  const transformComponentRef = useRef<any>(null);
  const contentScrollRef = useRef<HTMLDivElement>(null);

  const toggleFullscreen = () => setIsFullscreen(!isFullscreen);
  const toggleZoom = () => setIsZoomEnabled(!isZoomEnabled);

  React.useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  React.useEffect(() => {
    if (!isOpen) return;

    const frame = window.requestAnimationFrame(() => {
      contentScrollRef.current?.scrollTo({ top: 0, behavior: 'auto' });

      const firstField = contentScrollRef.current?.querySelector<HTMLElement>(
        'input:not([type="hidden"]):not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled])'
      );
      firstField?.focus({ preventScroll: true });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div 
      className={cn(
        "fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm overflow-hidden",
        isFullscreen ? "p-0" : "p-0 md:p-4"
      )}
      onClick={(e) => {
        if (closeOnOverlayClick && e.target === e.currentTarget) onClose();
      }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 40 }}
        animate={{ 
          opacity: 1, 
          scale: 1, 
          y: 0,
        }}
        exit={{ opacity: 0, scale: 0.9, y: 40 }}
        transition={{ type: "spring", damping: 25, stiffness: 300 }}
        className={cn(
          "bg-white dark:bg-slate-900 flex flex-col transition-all duration-500 ease-in-out relative",
          isFullscreen ? "rounded-none w-full h-full" : 
          // Mobile is always full screen, desktop follows props
          cn(
            "w-full h-full rounded-none shadow-none md:shadow-[--shadow-theme]",
            fullVertical ? "md:h-[95vh] md:rounded-[2rem]" : "md:h-auto md:max-h-[95vh] md:rounded-[--radius-theme]",
            maxWidth
          )
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-3 md:px-6 md:py-4 border-b border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 sticky top-0 z-20">
          <div className="flex flex-col">
            <h2 className="text-base md:text-xl font-black text-slate-900 dark:text-white tracking-tight leading-tight">{title}</h2>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-[8px] md:text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em]">Formulario</span>
              {isZoomEnabled && (
                <div className="flex items-center gap-1.5 px-1.5 py-0.5 bg-primary-light/30 rounded-full border border-primary-light">
                  <div className="w-1 h-1 rounded-full bg-primary animate-pulse" />
                  <span className="text-[8px] font-black text-primary uppercase tracking-wider">Zoom Activo</span>
                </div>
              )}
            </div>
          </div>
          
          <div className="flex items-center gap-1 md:gap-2">
            {/* Zoom Controls */}
            <div className="hidden sm:flex items-center bg-slate-50 dark:bg-slate-800 rounded-xl p-1 border border-slate-200 dark:border-slate-700 mr-2">
              <button
                onClick={toggleZoom}
                className={cn(
                  "p-2 rounded-lg transition-all flex items-center gap-2",
                  isZoomEnabled ? "bg-primary text-white shadow-md" : "text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700"
                )}
                title={isZoomEnabled ? "Desactivar Zoom" : "Activar Zoom Infinito"}
              >
                <Move size={18} />
                {isZoomEnabled && <span className="text-[10px] font-bold uppercase pr-1">Mover</span>}
              </button>
              
              {isZoomEnabled && (
                <div className="flex items-center gap-1 ml-1 pl-1 border-l border-slate-200 dark:border-slate-700">
                  <button 
                    onClick={() => transformComponentRef.current?.zoomIn()}
                    title="Acercar"
                    className="p-2 text-slate-400 hover:text-primary hover:bg-white dark:hover:bg-slate-900 rounded-lg transition-all"
                  >
                    <ZoomIn size={18} />
                  </button>
                  <button 
                    onClick={() => transformComponentRef.current?.zoomOut()}
                    title="Alejar"
                    className="p-2 text-slate-400 hover:text-primary hover:bg-white dark:hover:bg-slate-900 rounded-lg transition-all"
                  >
                    <ZoomOut size={18} />
                  </button>
                  <button 
                    onClick={() => transformComponentRef.current?.resetTransform()}
                    title="Restablecer zoom"
                    className="p-2 text-slate-400 hover:text-primary hover:bg-white dark:hover:bg-slate-900 rounded-lg transition-all"
                  >
                    <RotateCcw size={18} />
                  </button>
                </div>
              )}
            </div>

            <button
              onClick={toggleFullscreen}
              className="p-1.5 md:p-2.5 text-slate-400 hover:text-primary hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg md:rounded-xl transition-all"
              title={isFullscreen ? "Salir de Pantalla Completa" : "Pantalla Completa"}
            >
              {isFullscreen ? <Minimize2 size={18} className="md:w-5 md:h-5" /> : <Maximize2 size={18} className="md:w-5 md:h-5" />}
            </button>
            <button
              onClick={onClose}
              title="Cerrar"
              className="p-1.5 md:p-2.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/30 rounded-lg md:rounded-xl transition-all"
            >
              <X size={18} className="md:w-5 md:h-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden relative bg-slate-50/50 dark:bg-slate-950/50 min-h-0">
          {isZoomEnabled ? (
            <TransformWrapper
              initialScale={1}
              disabled={!isZoomEnabled}
              ref={transformComponentRef}
              centerOnInit
              minScale={0.1}
              maxScale={5}
            >
              <TransformComponent
                wrapperStyle={{
                  width: "100%",
                  height: "100%",
                  cursor: "grab"
                }}
                contentStyle={{
                  width: "100%",
                  height: "100%",
                }}
              >
                <div className="w-full p-3 md:p-8 overflow-visible">
                  <div className={cn(
                    "mx-auto transition-all duration-300",
                    isFullscreen ? "max-w-7xl" : "max-w-full"
                  )}>
                    {children}
                  </div>
                </div>
              </TransformComponent>
            </TransformWrapper>
          ) : (
            <div ref={contentScrollRef} className="w-full h-full overflow-y-auto custom-scrollbar p-3 md:p-8 pb-20">
              <div className={cn(
                "mx-auto transition-all duration-300",
                isFullscreen ? "max-w-7xl" : "max-w-full"
              )}>
                {children}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        {footer && (
          <div className={cn("px-3 py-3 md:px-8 md:py-6 border-t border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 sticky bottom-0 z-20 rounded-b-none md:rounded-b-[2rem]", isFullscreen && "rounded-none")}>
            {footer}
          </div>
        )}
      </motion.div>
    </div>
  );
};
