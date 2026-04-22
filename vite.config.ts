import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  
  return {
    // Dynamic base path for GitHub Pages or Vercel
    base: env.GITHUB_ACTIONS ? '/ERP-PRINCIPAL-M-S/' : '/',
    
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        injectRegister: 'script',
        registerType: 'autoUpdate',
        // Cambiado de 'false' a configuración básica para evitar errores de validación
        manifest: {
          name: 'CONSTRUCTORA WM/M&S',
          short_name: 'ConstructoraWM',
          description: 'CONSTRUYENDO EL FUTURO',
          theme_color: '#ffffff',
          background_color: '#ffffff',
          display: 'standalone',
          scope: '/',
          start_url: '/',
          icons: [
            {
              src: 'pwa-192x192.png',
              sizes: '192x192',
              type: 'image/png'
            },
            {
              src: 'pwa-512x512.png',
              sizes: '512x512',
              type: 'image/png'
            }
          ]
        },
        workbox: {
          cleanupOutdatedCaches: true,
          clientsClaim: true,
          skipWaiting: true,
          maximumFileSizeToCacheInBytes: 5 * 1024 * 1024, // 5MB
          // SOLUCIÓN AL ERROR DE BUILD: Define qué archivos debe cachear el Service Worker
          globPatterns: ['**/*.{js,css,html,ico,png,svg,json,vue,txt}'],
          // Previene errores si no se encuentran archivos para ciertos patrones
          globIgnores: ['**/node_modules/**/*'] 
        }
      })
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
    },
    
    preview: {
      headers: {
        'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
      },
    },
  };
});