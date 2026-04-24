# Tech

## Stack ERP Principal

| Capa | Tecnología | Versión |
|------|-----------|---------|
| Frontend | React 19 + Vite 8 + TypeScript | react ^19.0.0, vite ^8.0.9 |
| Estilos | Tailwind CSS v4 | @tailwindcss/vite ^4.1.14 |
| Routing | React Router v7 (HashRouter) | react-router-dom ^7.13.2 |
| Animaciones | Motion (Framer) | motion ^12.23.24 |
| Iconos | Lucide React | lucide-react ^0.546.0 |
| Toasts | Sonner | sonner ^2.0.7 |
| Mapas | Leaflet + React-Leaflet | leaflet ^1.9.4 |
| PDF | jsPDF + jsPDF-autotable | jspdf ^4.2.1 |
| Charts | Recharts | recharts ^3.8.1 |
| QR | html5-qrcode + qrcode.react | ^2.3.8 / ^4.2.0 |
| Backend | Express 4 + TypeScript | express ^4.21.2 |
| DB | PostgreSQL (pg pool) | pg ^8.16.3 |
| AI | @google/genai (Gemini) | ^1.29.0 |
| File storage | @vercel/blob | ^2.3.3 |
| Email | Resend API (fetch directo) | — |
| Upload | Multer (memory storage) | multer ^2.1.1 |
| Runtime | Node.js 24 | engines: "24.x" |
| Dev runner | tsx | ^4.21.0 |
| E2E | Playwright | @playwright/test ^1.59.1 |
| Analytics | @vercel/analytics | ^2.0.1 |

## TypeScript Config (ERP)
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "jsx": "react-jsx",
    "strict": false,
    "skipLibCheck": true,
    "noEmit": true,
    "allowJs": true,
    "isolatedModules": true,
    "paths": { "@/*": ["./*"] }
  }
}
```
> Nota: `strict: false` en ERP principal (a diferencia de la extensión VS Code que usa `strict: true`)

## Vite Config Highlights
- `base`: `/ERP-PRINCIPAL-M-S/` en GitHub Actions, `/` en local
- `manualChunks`: charts-vendor, maps-vendor, jspdf-vendor, router-vendor, icons-vendor, motion-vendor
- `proxy`: `/api` y `/uploads` → `http://localhost:3000` en dev
- `define`: `process.env.GEMINI_API_KEY` → `VITE_GEMINI_API_KEY` (backward compat)
- `Cross-Origin-Opener-Policy: same-origin-allow-popups` (Google OAuth popup)

## Build & Dev Commands

| Comando | Propósito |
|---------|-----------|
| `npm run dev` | Backend Express via tsx (server.ts) |
| `npm run frontend` | Solo Vite dev server |
| `npm run build` | Vite production build |
| `npm run db:migrate` | Ejecutar migraciones SQL en Neon |
| `npm run smoke:local` | Smoke tests locales |
| `npm run e2e` | Playwright E2E completo |
| `npm run e2e:projects-budget` | Solo tests de presupuesto |
| `npm run verify:prod` | Verificar API + CORS en producción |
| `npm run verify:pwa` | Verificar iconos PWA |
| `npm run lint` | tsc --noEmit |

## Variables de Entorno

| Variable | Propósito |
|----------|-----------|
| `DATABASE_URL` | Neon PostgreSQL connection string |
| `VITE_GEMINI_API_KEY` | Gemini AI (frontend + backend) |
| `GEMINI_API_KEY` | Gemini AI (solo backend/CI) |
| `AI_PROVIDER` | `gemini` (default) o `github-models` |
| `GITHUB_MODELS_TOKEN` | Token para GitHub Models (OpenAI-compatible) |
| `GITHUB_MODELS_MODEL` | Modelo (default: `gpt-4.1-mini`) |
| `VITE_GOOGLE_CLIENT_ID` | Google OAuth GSI |
| `VITE_API_BASE_URL` | URL backend (default: `https://erp-principal-m-s.vercel.app`) |
| `BACKEND_DEPLOY_WEBHOOK_URL` | Webhook Vercel para trigger deploy |
| `RESEND_API_KEY` | Envío de reportes PDF por email |
| `REPORTS_FROM_EMAIL` | Email remitente (default: `onboarding@resend.dev`) |
| `PGSSLMODE` | `disable` en tests locales |
| `PG_POOL_MAX` | Tamaño pool (default: 20) |
| `SERVER_SCHEDULED_ALERTS_ENABLED` | Habilitar scheduler (default: true) |
| `OCR_AUTO_APPROVE_MIN_SCORE` | Score mínimo para auto-aprobar OCR (default: 85) |

## URLs de Producción
- Backend: `https://erp-principal-m-s.vercel.app`
- Frontend: `https://salazaroliveros-prog.github.io/ERP-PRINCIPAL-M-S`
- DB Host: `ep-summer-field-anzq3bjq-pooler.c-6.us-east-1.aws.neon.tech`

## Playwright Config
- `testDir`: `./tests/e2e`
- `timeout`: 90s por test, `expect.timeout`: 15s
- `fullyParallel: false`
- Projects: `chromium` (Desktop Chrome) + `mobile-chromium` (Pixel 5)
- `webServer`: `tsx server.ts` en puerto 3000
- `trace: 'on-first-retry'`, `video: 'retain-on-failure'`

## Stack — Extensión VS Code (analizador-image)

| Capa | Tecnología | Versión |
|------|-----------|---------|
| Lenguaje | TypeScript | ^5.9.3 |
| Runtime | Node.js CommonJS | 22.x types |
| VS Code API | @types/vscode | ^1.116.0 |
| Bundler | Webpack + ts-loader | ^5.105.3 / ^9.5.4 |
| Linter | ESLint + typescript-eslint | ^9.39.3 / ^8.56.1 |
| Test runner | @vscode/test-cli + @vscode/test-electron | ^0.0.12 / ^2.5.2 |
