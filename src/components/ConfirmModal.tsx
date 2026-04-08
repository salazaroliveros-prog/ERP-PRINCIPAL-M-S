import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { AlertTriangle, X } from 'lucide-react';

interface ConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'danger' | 'warning' | 'info';
}

export default function ConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = 'Confirmar',
  cancelText = 'Cancelar',
  variant = 'danger'
}: ConfirmModalProps) {
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  return (
    <AnimatePresence>
      {isOpen && (
        <div 
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm"
          onClick={(e) => {
            if (e.target === e.currentTarget) onClose();
          }}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 sm:p-6 flex items-start gap-3 sm:gap-4">
              <div className={`p-2 sm:p-3 rounded-xl sm:rounded-2xl shrink-0 ${
                variant === 'danger' ? 'bg-rose-100 text-rose-600' :
                variant === 'warning' ? 'bg-primary-light text-primary' :
                'bg-blue-100 text-blue-600'
              }`}>
                <AlertTriangle size={20} className="sm:w-6 sm:h-6" />
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between mb-1 sm:mb-2">
                  <h3 className="text-lg sm:text-xl font-bold text-slate-900">{title}</h3>
                  <button onClick={onClose} title="Cerrar" className="p-1 text-slate-400 hover:text-slate-600 rounded-full transition-colors">
                    <X size={18} className="sm:w-5 sm:h-5" />
                  </button>
                </div>
                <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">{message}</p>
              </div>
            </div>
            <div className="p-4 sm:p-6 bg-slate-50 flex flex-col sm:flex-row gap-2 sm:gap-3">
              <button
                onClick={onClose}
                className="flex-1 py-2.5 sm:py-3 px-4 bg-white border border-slate-200 text-slate-600 text-xs sm:text-sm font-bold rounded-lg sm:rounded-xl hover:bg-slate-100 transition-all order-2 sm:order-1"
              >
                {cancelText}
              </button>
              <button
                onClick={() => {
                  onConfirm();
                  onClose();
                }}
                className={`flex-1 py-2.5 sm:py-3 px-4 text-white text-xs sm:text-sm font-bold rounded-lg sm:rounded-xl transition-all shadow-lg order-1 sm:order-2 ${
                  variant === 'danger' ? 'bg-rose-600 hover:bg-rose-700 shadow-rose-200' :
                  variant === 'warning' ? 'bg-primary hover:bg-primary-hover shadow-primary-shadow' :
                  'bg-blue-600 hover:bg-blue-700 shadow-blue-200'
                }`}
              >
                {confirmText}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
