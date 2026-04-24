# Structure

## Workspace Raíz (erp-constructora-wm_mys/)
```
erp-constructora-wm_mys/
├── src/
│   ├── components/          ← 50+ componentes React (uno por módulo)
│   │   ├── Dashboard.tsx    ← KPIs, widgets, métricas
│   │   ├── Projects.tsx     ← CRUD proyectos
│   │   ├── Tasks.tsx        ← Módulo tareas (nuevo)
│   │   ├── Sidebar.tsx      ← Navegación principal
│   │   ├── AIChat.tsx       ← Chat con Gemini/GitHub Models
│   │   ├── Documents.tsx    ← Gestión documental + OCR
│   │   └── ...              ← Inventory, Financials, HR, etc.
│   ├── lib/
│   │   ├── api.ts           ← requestJson: offline queue, retry, cache, auth token
│   │   ├── authStorageClient.ts ← Google OAuth + LocalAuth + health check
│   │   ├── tasksApi.ts      ← CRUD /api/tasks via requestJson
│   │   ├── gemini.ts        ← Cliente Gemini AI
│   │   └── ...              ← *Api.ts por cada entidad
│   ├── contexts/
│   │   ├── ThemeContext.tsx  ← Dark/light mode
│   │   └── NotificationContext.tsx ← SSE + estado notificaciones
│   ├── constants/
│   │   └── apuData.ts       ← Datos APU construcción
│   ├── App.tsx              ← Router, auth, lazy loading, prefetch
│   ├── main.tsx             ← Entry point React
│   └── index.css            ← Tailwind + estilos globales
├── sql/                     ← 29 migraciones secuenciales (001-029)
├── scripts/
│   ├── migrate.ts           ← Runner de migraciones SQL
│   ├── smoke-local.mjs      ← Smoke tests locales
│   ├── verify-production.mjs ← Verificación API + CORS en prod
│   └── verify-pwa-icons.mjs ← Verificación iconos PWA
├── tests/e2e/               ← Tests Playwright (chromium + mobile)
│   ├── projects-budget.spec.ts
│   ├── quick-access-visibility.spec.ts
│   ├── mobile-dashboard-kpi-responsive.spec.ts
│   └── ...
├── api/
│   └── [...path].ts         ← Vercel serverless handler (wraps server.ts)
├── public/                  ← PWA icons, manifest, logo.svg
├── agent/                   ← Agente Python (evaluation.py, main.py)
├── docs/
│   └── UAT-Control-Total-IA.md
├── server.ts                ← Express backend completo (todas las rutas API)
├── vite.config.ts           ← Build config, chunks manuales, proxy dev
├── vercel.json              ← Deploy config, rewrites, headers CORS/cache
├── playwright.config.ts     ← E2E config (chromium + Pixel 5)
├── tsconfig.json            ← TS config (ESNext, bundler, jsx react-jsx)
├── package.json             ← Node 24, scripts, deps
├── .env / .env.example      ← Variables de entorno
└── task-manager-app/        ← Sub-workspace (VS Code extension)
```

## Core Components

| Archivo | Rol |
|---------|-----|
| `server.ts` | Backend Express: todas las rutas `/api/*`, pool PostgreSQL, scheduler, SSE, OCR, AI chat |
| `src/lib/api.ts` | `requestJson`: offline queue, retry con backoff, cache localStorage, auth Bearer token |
| `src/lib/authStorageClient.ts` | Google OAuth (GSI), `LocalAuth` class, health check periódico, toast de conexión |
| `src/App.tsx` | Router HashRouter, lazy loading de todos los módulos, prefetch inteligente, PWA install |
| `api/[...path].ts` | Vercel serverless: singleton de `createApp()` con cache para cold starts |
| `scripts/migrate.ts` | Runner de migraciones: `schema_migrations` table, transacciones, skip si ya aplicada |

## Architectural Patterns

### Offline-First
```
requestJson → navigator.onLine? → NO → queue en localStorage → flush al reconectar
                                → SÍ → fetch con timeout 12s → retry 3x (GET) → cache en localStorage
```

### Module Integration Pattern
```
sql/NNN_create_<entity>.sql → src/lib/<entity>Api.ts → src/components/<Entity>.tsx
→ server.ts routes → src/App.tsx route → src/components/Sidebar.tsx NavItem
```

### Server Architecture
- Pool PostgreSQL con `keepAlive`, `query_timeout: 30s`, `max: 20`
- `isDatabaseAvailable()` con cache TTL (8s OK / 1.5s FAIL) + retry 2 intentos
- `serveFallbackRead()` para GETs cuando DB no disponible — retorna `{ items: [] }`
- Middleware `/api` verifica DB antes de cada request; mutaciones → 503 si DB caída
- `createApp()` exportada para reutilización en Vercel serverless handler

### Vercel Deployment
- `api/[...path].ts` → singleton pattern con `cachedApp` para evitar cold starts
- `vercel.json`: rewrite `/api/(.*)` → `/api/[...path]`, headers CORS, `no-store` en manifest/sw.js
- Frontend: GitHub Pages via `deploy-github-pages.yml`

## CI/CD Pipeline

| Workflow | Trigger | Propósito |
|----------|---------|-----------|
| `deploy-github-pages.yml` | push main | Build Vite + deploy frontend |
| `postgres-backend-migrate.yml` | push main (sql/**) | Migraciones en Neon |
| `local-smoke-test.yml` | push/PR | Smoke tests PostgreSQL 16 local |
| `quick-access-visibility.yml` | push/PR | E2E Playwright + Chromium |
| `verify-production.yml` | push main | Verificar API + CORS en prod |
| `gemini-plan-execute.yml` | workflow_call | Gemini CLI ejecuta plan aprobado |
