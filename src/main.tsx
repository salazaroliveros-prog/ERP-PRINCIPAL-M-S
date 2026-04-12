import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

const CHUNK_RECOVERY_FLAG = 'wm_chunk_recovery_reload';

const patchRangeSelectNode = () => {
  if (typeof window === 'undefined' || typeof Range === 'undefined') return;

  const rangeProto = Range.prototype as Range & {
    __wmSelectNodePatched?: boolean;
    __wmOriginalSelectNode?: (node: Node) => void;
  };

  if (rangeProto.__wmSelectNodePatched || typeof rangeProto.selectNode !== 'function') return;

  rangeProto.__wmOriginalSelectNode = rangeProto.selectNode;
  rangeProto.selectNode = function selectNodeSafe(node: Node) {
    if (!node || !node.parentNode) {
      return;
    }

    try {
      rangeProto.__wmOriginalSelectNode?.call(this, node);
    } catch {
      // Ignore detached-node selection errors triggered by third-party libs.
    }
  };

  rangeProto.__wmSelectNodePatched = true;
};

const enforceCanonicalOrigin = () => {
  const canonicalOrigin = (import.meta.env.VITE_CANONICAL_ORIGIN || '').trim().replace(/\/+$/, '');
  if (!canonicalOrigin || typeof window === 'undefined') return false;

  const {hostname, origin, pathname, search, hash} = window.location;
  const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1';
  const isVercelHost = hostname.endsWith('.vercel.app');

  if (!isLocalhost && isVercelHost && origin !== canonicalOrigin) {
    window.location.replace(`${canonicalOrigin}${pathname}${search}${hash}`);
    return true;
  }

  return false;
};

const installChunkLoadRecovery = () => {
  if (typeof window === 'undefined') return;

  const clearRuntimeCaches = async () => {
    try {
      if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.allSettled(registrations.map((registration) => registration.unregister()));
      }

      if ('caches' in window) {
        const cacheNames = await caches.keys();
        await Promise.allSettled(cacheNames.map((name) => caches.delete(name)));
      }
    } catch {
      // Ignore cleanup failures and still attempt reload.
    }
  };

  const reloadOnce = async () => {
    if (sessionStorage.getItem(CHUNK_RECOVERY_FLAG) === '1') return;
    sessionStorage.setItem(CHUNK_RECOVERY_FLAG, '1');
    await clearRuntimeCaches();

    const url = new URL(window.location.href);
    url.searchParams.set('__chunk_recover', Date.now().toString());
    window.location.replace(url.toString());
  };

  const isChunkLoadFailure = (value: unknown) => {
    const text = String(value || '').toLowerCase();
    return (
      text.includes('failed to fetch dynamically imported module') ||
      text.includes('importing a module script failed') ||
      text.includes('loading chunk') ||
      text.includes('chunkloaderror')
    );
  };

  const isLikelyStaleReferenceError = (message: unknown, stack?: unknown) => {
    const msgText = String(message || '').toLowerCase();
    const stackText = String(stack || '').toLowerCase();

    const hasReferenceShape =
      msgText.includes('referenceerror') ||
      msgText.includes('is not defined');

    const mentionsHashedAsset =
      /\/assets\/.*-[a-z0-9]{8,}\.js/i.test(stackText) ||
      /-[a-z0-9]{8,}\.js/i.test(msgText);

    return hasReferenceShape && mentionsHashedAsset;
  };

  const isStaleHashedAssetUrl = (value: string) => {
    try {
      const url = new URL(value, window.location.origin);
      if (!url.pathname.includes('/assets/')) return false;
      return /-[a-z0-9]{8,}\.(css|js)$/i.test(url.pathname);
    } catch {
      return false;
    }
  };

  // Vite dispatches this when preload of a chunk fails after a new deploy.
  window.addEventListener('vite:preloadError', (event: Event) => {
    event.preventDefault();
    void reloadOnce();
  });

  window.addEventListener('error', (event) => {
    const maybeMessage = event?.message || (event as ErrorEvent)?.error?.message;
    if (isChunkLoadFailure(maybeMessage)) {
      void reloadOnce();
      return;
    }

    const maybeStack = (event as ErrorEvent)?.error?.stack;
    if (isLikelyStaleReferenceError(maybeMessage, maybeStack)) {
      void reloadOnce();
      return;
    }

    const target = (event as ErrorEvent).target as Element | null;
    if (!target) return;

    if (target instanceof HTMLLinkElement) {
      const isStylesheet = (target.rel || '').toLowerCase().includes('stylesheet');
      if (isStylesheet && isStaleHashedAssetUrl(target.href || '')) {
        void reloadOnce();
      }
      return;
    }

    if (target instanceof HTMLScriptElement) {
      if (isStaleHashedAssetUrl(target.src || '')) {
        void reloadOnce();
      }
    }
  });

  window.addEventListener('unhandledrejection', (event) => {
    const reason = (event as PromiseRejectionEvent).reason;
    const maybeMessage = (reason && (reason.message || reason.toString?.())) || reason;
    if (isChunkLoadFailure(maybeMessage)) {
      void reloadOnce();
      return;
    }

    const maybeStack = reason && reason.stack;
    if (isLikelyStaleReferenceError(maybeMessage, maybeStack)) {
      void reloadOnce();
    }
  });

  window.addEventListener('load', () => {
    sessionStorage.removeItem(CHUNK_RECOVERY_FLAG);
  });
};

const installConsoleNoiseFilter = () => {
  if (typeof window === 'undefined' || !import.meta.env.PROD) return;

  const originalWarn = console.warn.bind(console);
  console.warn = (...args: unknown[]) => {
    const text = args
      .map((value) => {
        try {
          return typeof value === 'string' ? value : JSON.stringify(value);
        } catch {
          return String(value);
        }
      })
      .join(' ')
      .toLowerCase();

    const isKnownExternalZustandWarning =
      text.includes('default export is deprecated') && text.includes('zustand');

    if (isKnownExternalZustandWarning) {
      return;
    }

    originalWarn(...args);
  };
};

if (!enforceCanonicalOrigin()) {
  patchRangeSelectNode();
  installConsoleNoiseFilter();
  installChunkLoadRecovery();

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
