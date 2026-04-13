import React, { useState } from 'react';
import { MoreVertical, MessageSquare, BellRing, Wrench } from 'lucide-react';
const FloatingToolsButton = () => {
  const [open, setOpen] = useState(false);
  return (
    <div className="fixed bottom-6 right-6 z-[200]">
      <button
        className="bg-primary text-white rounded-full shadow-lg w-14 h-14 flex items-center justify-center hover:bg-primary/90 transition"
        onClick={() => setOpen((v) => !v)}
        title="Herramientas rápidas"
      >
        <MoreVertical size={28} />
      </button>
      {open && (
        <div className="absolute bottom-16 right-0 bg-white dark:bg-slate-900 rounded-xl shadow-xl p-3 flex flex-col gap-3 min-w-[180px] border border-slate-200 dark:border-slate-700">
          <button className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-primary/10 dark:hover:bg-primary/20 transition" onClick={() => { window.dispatchEvent(new Event('OPEN_AI_CHAT')); setOpen(false); }}>
            <MessageSquare size={18} /> Chat IA
          </button>
          <button className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-primary/10 dark:hover:bg-primary/20 transition" onClick={() => { window.dispatchEvent(new Event('OPEN_QUICK_ACTIONS')); setOpen(false); }}>
            <Wrench size={18} /> Acciones rápidas
          </button>
        </div>
      )}
    </div>
  );
};
export default FloatingToolsButton;