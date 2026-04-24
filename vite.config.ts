import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');

  return {
    // Dynamic base path for GitHub Pages or Vercel
    base: env.GITHUB_ACTIONS ? '/ERP-PRINCIPAL-M-S/' : '/',

    plugins: [
      react(),
      tailwindcss()
    ],

    define: {
      // Backward-compatible alias used across the app source files.
      'process.env.GEMINI_API_KEY': JSON.stringify(env.VITE_GEMINI_API_KEY || env.GEMINI_API_KEY || ''),
    },

    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes('node_modules')) return;

            if (id.includes('recharts') || id.includes('d3-')) {
              return 'charts-vendor';
            }
            if (id.includes('leaflet') || id.includes('react-leaflet')) {
              return 'maps-vendor';
            }
            if (id.includes('html2canvas')) {
              return 'html2canvas-vendor';
            }
            if (id.includes('jspdf') || id.includes('jspdf-autotable')) {
              return 'jspdf-vendor';
            }
            if (id.includes('react-router') || id.includes('@remix-run/router')) {
              return 'router-vendor';
            }
            if (id.includes('lucide-react')) {
              return 'icons-vendor';
            }
            if (id.includes('/motion/') || id.includes('framer-motion')) {
              return 'motion-vendor';
            }
          },
        },
      },
    },

    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },

    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
      headers: {
        'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
      },
      proxy: {
        '/api': {
          target: 'http://localhost:3000',
          changeOrigin: true,
          secure: false,
        },
        '/uploads': {
          target: 'http://localhost:3000',
          changeOrigin: true,
          secure: false,
        },
      },
    },

    preview: {
      headers: {
        'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
      },
    },
  };
});