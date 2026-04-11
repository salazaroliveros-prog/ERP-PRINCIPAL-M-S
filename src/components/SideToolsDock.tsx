import React from 'react';
import { motion } from 'motion/react';
import { Bot } from 'lucide-react';
import { cn } from '../lib/utils';

export function SideToolsDock() {
  const isMobile = typeof window !== 'undefined' ? window.innerWidth < 1024 : false;

  if (isMobile) {
    return null;
  }

  const openAI = () => {
    window.dispatchEvent(new Event('OPEN_AI_CHAT'));
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: 24 }}
      animate={{ opacity: 1, x: 0 }}
      className="fixed z-[110] right-0 top-1/2 -translate-y-1/2"
    >
      <div className="rounded-l-2xl border border-white/20 bg-slate-900/55 backdrop-blur-md shadow-2xl p-1.5 flex flex-col gap-1.5">
        <button
          onClick={openAI}
          title="Asistente IA"
          className={cn(
            'px-2 py-3 rounded-l-xl rounded-r-md text-white transition-all',
            'bg-primary/65 hover:bg-primary/85 border border-white/20'
          )}
        >
          <span className="[writing-mode:vertical-rl] rotate-180 text-[10px] font-black tracking-[0.18em] uppercase flex items-center gap-1">
            <Bot size={14} />
            IA
          </span>
        </button>
      </div>
    </motion.div>
  );
}
