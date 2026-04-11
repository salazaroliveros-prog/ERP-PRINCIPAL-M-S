import React from 'react';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronRight, ChevronLeft, Check } from 'lucide-react';

interface Step {
  title: string;
  description?: string;
  content: React.ReactNode;
  isValid?: boolean;
}

interface StepFormProps {
  steps: Step[];
  currentStep: number;
  onStepChange: (step: number) => void;
  onSubmit: (e: React.FormEvent) => void;
  isSubmitting?: boolean;
  submitLabel?: string;
  formId?: string;
}

export const StepForm = ({
  steps,
  currentStep,
  onStepChange,
  onSubmit,
  isSubmitting = false,
  submitLabel = "Guardar",
  formId
}: StepFormProps) => {
  const isLastStep = currentStep === steps.length - 1;
  const isFirstStep = currentStep === 0;

  const handleNext = () => {
    if (!isLastStep) {
      onStepChange(currentStep + 1);
    }
  };

  const handleBack = () => {
    if (!isFirstStep) {
      onStepChange(currentStep - 1);
    }
  };

  return (
    <div className="flex flex-col">
      {/* Step Indicator */}
      <div className="mb-8">
        <div className="flex items-center justify-between relative">
          {/* Progress Line */}
          <div className="absolute top-5 left-0 w-full h-0.5 bg-slate-100 dark:bg-slate-800 -z-10" />
          <progress
            className="absolute top-5 left-0 w-full h-0.5 -z-10 [&::-webkit-progress-bar]:bg-transparent [&::-webkit-progress-value]:bg-primary [&::-moz-progress-bar]:bg-primary"
            value={currentStep}
            max={Math.max(steps.length - 1, 1)}
            title="Progreso del formulario"
          />

          {steps.map((step, idx) => {
            const isActive = idx === currentStep;
            const isCompleted = idx < currentStep;
            
            return (
              <button
                key={idx}
                type="button"
                onClick={() => idx < currentStep && onStepChange(idx)}
                disabled={idx > currentStep}
                className="flex flex-col items-center group relative"
              >
        <div className={cn(
          "w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all duration-500 bg-white dark:bg-slate-900 relative z-10",
          isActive ? "border-primary text-primary shadow-xl shadow-primary/30 scale-125 ring-4 ring-primary/10" : 
          isCompleted ? "border-primary bg-primary text-white shadow-md shadow-primary/20" : 
          "border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300"
        )}>
          {isCompleted ? <Check size={18} strokeWidth={3} /> : <span className="text-sm font-black">{idx + 1}</span>}
        </div>
                <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 whitespace-nowrap">
                  <span className={cn(
                    "text-[10px] font-black uppercase tracking-widest transition-colors",
                    isActive ? "text-primary" : "text-slate-600 dark:text-slate-300"
                  )}>
                    {step.title}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Form Content */}
      <form id={formId} onSubmit={onSubmit} className="flex-1 mt-4">
        <AnimatePresence mode="wait">
          <motion.div
            key={currentStep}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.3 }}
            className="space-y-8"
          >
            {steps[currentStep].content}
          </motion.div>
        </AnimatePresence>
      </form>

      {/* Navigation Buttons (Optional, usually handled by Modal Footer) */}
      {/* We'll pass these to the FormModal footer instead for better UI integration */}
    </div>
  );
};

export const FormSection = ({ title, icon: Icon, children, description }: { title: string, icon?: any, children: React.ReactNode, description?: string }) => (
  <div className="space-y-4 sm:space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
    <div className="flex items-center gap-3 sm:gap-4 pb-4 sm:pb-6 border-b border-slate-100 dark:border-slate-800/50">
      {Icon && (
        <div className="w-10 h-10 sm:w-14 sm:h-14 bg-primary/10 dark:bg-primary/20 rounded-xl sm:rounded-2xl flex items-center justify-center text-primary shadow-inner ring-1 ring-primary/20">
          <Icon size={20} className="sm:w-7 sm:h-7" />
        </div>
      )}
      <div className="space-y-0.5 sm:space-y-1">
        <h3 className="text-base sm:text-xl font-black text-slate-900 dark:text-white uppercase tracking-tight leading-none">{title}</h3>
        {description && <p className="text-[10px] sm:text-xs text-slate-500 dark:text-slate-400 font-medium tracking-wide">{description}</p>}
      </div>
    </div>
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
      {children}
    </div>
  </div>
);

export const FormInput = ({ label, error, ...props }: { label: string, error?: string } & React.InputHTMLAttributes<HTMLInputElement>) => (
  <div className="space-y-1.5 sm:space-y-2 group">
    <label className="text-[8px] sm:text-[10px] font-black text-slate-600 dark:text-slate-300 uppercase tracking-[0.2em] ml-1 group-focus-within:text-primary transition-colors">
      {label}
    </label>
    <div className="relative group/input">
      <input
        {...props}
        className={cn(
          "w-full px-4 sm:px-5 py-2.5 sm:py-4 bg-white dark:bg-slate-900 border-2 rounded-xl sm:rounded-2xl focus:outline-none transition-all duration-300 font-semibold text-xs sm:text-sm text-slate-900 dark:text-white placeholder:text-slate-500 dark:placeholder:text-slate-400 shadow-sm",
          error 
            ? "border-rose-100 dark:border-rose-900/30 bg-rose-50/30 dark:bg-rose-900/10 focus:border-rose-500 focus:ring-4 focus:ring-rose-500/5" 
            : "border-slate-300 dark:border-slate-600 hover:border-slate-400 dark:hover:border-slate-500 focus:border-primary focus:ring-4 focus:ring-primary/10 hover:shadow-md"
        )}
      />
      {error && (
        <motion.p 
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-[8px] sm:text-[10px] text-rose-500 font-black mt-1 ml-1 uppercase tracking-wider"
        >
          {error}
        </motion.p>
      )}
    </div>
  </div>
);

export const FormSelect = ({ label, error, children, ...props }: { label: string, error?: string, children: React.ReactNode } & React.SelectHTMLAttributes<HTMLSelectElement>) => {
  const normalizedLabel = String(label || '').trim();
  const fallbackLabel = normalizedLabel || 'Seleccionar opcion';
  const title = props.title ?? fallbackLabel;
  const ariaLabel = props['aria-label'] ?? fallbackLabel;

  return (
    <div className="space-y-1.5 sm:space-y-2 group">
      <label className="text-[8px] sm:text-[10px] font-black text-slate-600 dark:text-slate-300 uppercase tracking-[0.2em] ml-1 group-focus-within:text-primary transition-colors">
        {label}
      </label>
      <div className="relative">
        <select
          {...props}
          title={title}
          aria-label={ariaLabel}
          className={cn(
            "w-full px-4 sm:px-5 py-2.5 sm:py-4 bg-white dark:bg-slate-900 border-2 rounded-xl sm:rounded-2xl focus:outline-none appearance-none transition-all duration-300 font-semibold text-xs sm:text-sm text-slate-900 dark:text-white",
            error
              ? "border-rose-100 dark:border-rose-900/30 bg-rose-50/30 dark:bg-rose-900/10 focus:border-rose-500"
              : "border-slate-300 dark:border-slate-600 hover:border-slate-400 dark:hover:border-slate-500 focus:border-primary focus:ring-4 focus:ring-primary/5 shadow-sm hover:shadow-md"
          )}
        >
          {children}
        </select>
        <div className="absolute right-3 sm:right-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
          <ChevronRight size={14} className="rotate-90 sm:w-4.5 sm:h-4.5" />
        </div>
        {error && (
          <motion.p
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-[8px] sm:text-[10px] text-rose-500 font-black mt-1 ml-1 uppercase tracking-wider"
          >
            {error}
          </motion.p>
        )}
      </div>
    </div>
  );
};
