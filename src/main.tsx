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

  const reloadOnce = () => {
    if (sessionStorage.getItem(CHUNK_RECOVERY_FLAG) === '1') return;
    sessionStorage.setItem(CHUNK_RECOVERY_FLAG, '1');
    window.location.reload();
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

  // Vite dispatches this when preload of a chunk fails after a new deploy.
  window.addEventListener('vite:preloadError', (event: Event) => {
    event.preventDefault();
    reloadOnce();
  });

  window.addEventListener('error', (event) => {
    const maybeMessage = event?.message || (event as ErrorEvent)?.error?.message;
    if (isChunkLoadFailure(maybeMessage)) {
      reloadOnce();
    }
  });

  window.addEventListener('unhandledrejection', (event) => {
    const reason = (event as PromiseRejectionEvent).reason;
    const maybeMessage = (reason && (reason.message || reason.toString?.())) || reason;
    if (isChunkLoadFailure(maybeMessage)) {
      reloadOnce();
    }
  });

  window.addEventListener('load', () => {
    sessionStorage.removeItem(CHUNK_RECOVERY_FLAG);
  });
};

if (!enforceCanonicalOrigin()) {
  patchRangeSelectNode();
  installChunkLoadRecovery();

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
