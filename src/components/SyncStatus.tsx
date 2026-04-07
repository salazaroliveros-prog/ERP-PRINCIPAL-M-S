import React, { useEffect, useState } from 'react';
import { Wifi, WifiOff, Cloud, CloudOff, RefreshCw } from 'lucide-react';
import { onSyncStatusChange, isSyncing } from '../lib/authStorageClient';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';

export const SyncStatus = () => {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [syncing, setSyncing] = useState(isSyncing.value);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    const unsubscribe = onSyncStatusChange((s) => setSyncing(s));

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      unsubscribe();
    };
  }, []);

  return (
    <div className="fixed bottom-20 right-6 lg:bottom-6 z-50 pointer-events-none">
      <AnimatePresence>
        {(!isOnline || syncing) && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.9 }}
            className={cn(
              "flex items-center gap-2 px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest shadow-lg border backdrop-blur-md",
              !isOnline 
                ? "bg-rose-500/10 text-rose-500 border-rose-500/20" 
                : "bg-amber-500/10 text-amber-500 border-amber-500/20"
            )}
          >
            {!isOnline ? (
              <>
                <WifiOff size={12} />
                <span>Modo Offline</span>
              </>
            ) : (
              <>
                <RefreshCw size={12} className="animate-spin" />
                <span>Sincronizando...</span>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
