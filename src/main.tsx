import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

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

if (!enforceCanonicalOrigin()) {
  patchRangeSelectNode();

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
