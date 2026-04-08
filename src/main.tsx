import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

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
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
