
doa# ERP Constructora WM_M&S

Frontend React/Vite desplegable en GitHub Pages.
Backend en PostgreSQL (Express + SQL migrations).

## Requisitos

- Node.js 20+
- PostgreSQL accesible desde el backend (DATABASE_URL)

## Ejecucion local

1. Instala dependencias: npm install
2. Crea un archivo .env.local (opcional) con:
   - VITE_GEMINI_API_KEY=tu_clave_gemini
    - VITE_AI_PROVIDER=gemini (o github-models / copilot)
   - VITE_GOOGLE_CLIENT_ID=tu_client_id_oauth_web_google
3. Ejecuta en desarrollo: npm run dev

### Modo Copilot (GitHub Models)

Para usar el asistente con modelo tipo Copilot desde backend:

- Frontend:
   - VITE_AI_PROVIDER=github-models
- Backend:
   - AI_PROVIDER=github-models
   - GITHUB_MODELS_TOKEN=tu_token_de_github_models
   - GITHUB_MODELS_MODEL=gpt-4.1-mini (opcional)
   - GITHUB_MODELS_ENDPOINT=https://models.inference.ai.azure.com/chat/completions (opcional)

Comprobacion rapida:

- GET /api/ai/health
- GET /api/ai/health?runTest=true

## Despliegue del frontend en GitHub Pages

Ya se incluyo el workflow [deploy-github-pages.yml](.github/workflows/deploy-github-pages.yml).

Pasos:

1. Sube el repositorio a GitHub y usa la rama main.
2. En GitHub, ve a Settings > Pages y selecciona Source: GitHub Actions.
3. En Settings > Secrets and variables > Actions, agrega:
   - VITE_GEMINI_API_KEY (opcional, para funciones IA del frontend)
   - VITE_API_BASE_URL (URL publica del backend, ejemplo: https://api.tudominio.com)
   - VITE_GOOGLE_CLIENT_ID (obligatorio si deseas login real con Google en el frontend)
4. Haz push a main y espera el workflow de Pages.

## Backend PostgreSQL (fase 1)

Se agrego un backend API en Express con endpoints SQL para modulos de ERP (finanzas, proyectos, inventario, compras, clientes, RRHH, riesgos, seguridad, subcontratos, workflows, auditoria y notificaciones).

- GET /api/health
- GET /api/transactions
- POST /api/transactions
- DELETE /api/transactions/:id

Migraciones SQL incluidas:

- sql/001_create_financial_transactions.sql
- ...
- sql/022_create_notifications.sql
- scripts/migrate.ts

Variables requeridas para backend:

- DATABASE_URL: cadena de conexion PostgreSQL
- PGSSLMODE=disable (solo local, opcional)
- CORS_ORIGINS: lista CSV de origins permitidos
- AI_PROVIDER=gemini|github-models (opcional, por defecto gemini)
- GEMINI_API_KEY (si AI_PROVIDER=gemini)
- GITHUB_MODELS_TOKEN (si AI_PROVIDER=github-models)
- RESEND_API_KEY (para envio automatico de PDFs por correo)
- REPORTS_FROM_EMAIL (correo remitente validado en Resend, opcional; por defecto onboarding@resend.dev)
- SERVER_SCHEDULED_ALERTS_ENABLED=true|false (opcional, por defecto true)
- SERVER_SCHEDULED_ALERTS_INTERVAL_MS=60000 (opcional, minimo 30000)
- OCR_AUTO_APPROVE_MIN_SCORE=85 (opcional)
- OCR_AUTO_REVIEW_MIN_SCORE=60 (opcional)
- OCR_AUTO_APPROVE_MAX_VARIANCE_PCT=8 (opcional)

Nuevos endpoints de configuracion operativa:

- GET /api/settings/thresholds
- PUT /api/settings/thresholds
- GET /api/scheduler/status
- POST /api/documents/ocr-validate
- GET /api/documents/ocr-validations

Filtros soportados en GET /api/documents/ocr-validations:

- projectId, purchaseOrderId
- supplier (busqueda parcial)
- invoiceNumber (busqueda parcial)
- from, to (rango por fecha de creacion)
- limit (maximo 200)
- offset (paginacion incremental)

Scheduler backend de alertas (08:00 y 16:00):

- Genera notificacion de resumen de costos aunque no haya navegador abierto.
- Usa deduplicacion por franja diaria en base de datos para evitar duplicados.
- Registra metadatos de ejecucion en auditoria cuando la tabla audit_logs esta disponible.

Ejecutar migraciones localmente:

- npm run db:migrate

## Automatizacion backend con GitHub Actions

Ya se incluyo el workflow [postgres-backend-migrate.yml](.github/workflows/postgres-backend-migrate.yml).

Configura estos secrets en GitHub (Settings > Secrets and variables > Actions):

- DATABASE_URL
- BACKEND_DEPLOY_WEBHOOK_URL (opcional, para disparar deploy del backend en Render/Railway/Fly/etc.)

Cuando hay push a main, GitHub ejecuta migraciones y luego puede disparar deploy del backend.

## Checklist de despliegue (frontend + backend SQL)

Antes de publicar en produccion, valida:

1. Secrets de GitHub Pages:
   - VITE_GEMINI_API_KEY (opcional)
   - VITE_API_BASE_URL (obligatorio para consumir API SQL)
2. Secrets de backend:
   - DATABASE_URL
   - BACKEND_DEPLOY_WEBHOOK_URL (opcional)
3. CORS del backend:
   - Incluye el dominio de GitHub Pages en CORS_ORIGINS
4. Smoke test post-deploy:
   - GET /api/health debe responder status ok
   - La app debe crear/listar datos via API sin errores CORS

## Verificacion automatica de produccion

Se agrego un verificador automatico para comprobar endpoints criticos, preflight CORS y stream SSE:

- Script local/CI: `npm run verify:prod`
- Workflow GitHub Actions: `.github/workflows/verify-production.yml`

Variables usadas por el verificador:

- `API_BASE_URL` (o `VITE_API_BASE_URL`)
- `FRONTEND_ORIGIN` (por defecto: `https://salazaroliveros-prog.github.io`)

En GitHub Actions, define el secret `VITE_API_BASE_URL` con la URL publica real del backend.
Si hay autenticacion de despliegue en Vercel, el workflow fallara con `401 Authentication Required` hasta desactivarla o configurar bypass para automatizacion.

## Checklist pegable: GitHub Pages + Vercel API

Usa estos valores cuando el frontend vive en GitHub Pages y el backend en Vercel.

Bloque recomendado para `.env` local:

- `API_BASE_URL=https://erp-principal-m-s.vercel.app`
- `FRONTEND_ORIGIN=https://salazaroliveros-prog.github.io`
- `APP_URL=https://salazaroliveros-prog.github.io/ERP-PRINCIPAL-M-S`

GitHub Actions (Settings > Secrets and variables > Actions):

- `VITE_API_BASE_URL=https://erp-principal-m-s.vercel.app`
- `VITE_GEMINI_API_KEY=...` (opcional)
- `VITE_GOOGLE_CLIENT_ID=...` (obligatorio para login Google en frontend)

Vercel (Project Settings > Environment Variables):

- `DATABASE_URL=postgresql://...`
- `JWT_SECRET=...`
- `CORS_ORIGINS=https://salazaroliveros-prog.github.io`
- `RESEND_API_KEY=...`
- `REPORTS_FROM_EMAIL=reportes@tu-dominio.com`

Verificacion rapida:

- `node -r dotenv/config scripts/verify-production.mjs dotenv_config_path=.env`
- `node scripts/verify-pwa-icons.mjs https://salazaroliveros-prog.github.io/ERP-PRINCIPAL-M-S`

Se agrego tambien verificacion automatica de PWA en produccion (manifest + iconos de instalacion) despues del deploy de GitHub Pages:

- Workflow GitHub Actions: `.github/workflows/verify-pwa-production.yml`
- Script local/CI equivalente: `npm run verify:pwa:prod`

## Checklist rapido: deploy + PWA (1 minuto)

Despues de publicar frontend, ejecuta este flujo para validar icono de instalacion y manifest:

1. Build local rapido:
   - `npm run build`
2. Verificacion local de PWA (manifest + iconos + content-type):
   - PowerShell: `$env:APP_URL='http://127.0.0.1:4173'; npm run verify:pwa`
   - Requiere tener preview activo: `node .\\node_modules\\vite\\bin\\vite.js preview --host 127.0.0.1 --port 4173`
3. Verificacion en produccion (GitHub Pages):
   - `npm run verify:pwa:prod`
4. Resultado esperado:
   - `RESULT PASSED`
5. Si falla en produccion con 404 de iconos:
   - El deploy de Pages aun no publico los assets nuevos.
   - Espera que termine GitHub Actions y vuelve a correr `npm run verify:pwa:prod`.

## Pruebas locales completas (sin desplegar)

Se agrego un smoke test integral para validar lectura/escritura por modulo contra PostgreSQL local:

- Ejecutar local: `npm run smoke:local`
- Script: `scripts/smoke-local.mjs`

Tambien se agrego una suite E2E (Playwright) enfocada en Proyectos + Presupuesto:

- Instalar navegadores (una sola vez): `npx playwright install chromium`
- Ejecutar toda la suite E2E: `npm run e2e`
- Ejecutar solo Proyectos/Presupuesto: `npm run e2e:projects-budget`
- Ejecutar en modo visible: `npm run e2e:headed`
- Especificacion: `tests/e2e/projects-budget.spec.ts`

## Limpieza de datos de prueba (Proyectos)

En el modulo de Proyectos se agregaron los botones `Simular Limpieza` y `Limpieza Pruebas`.

- Elimina datos de prueba relacionados: proyectos, clientes, cotizaciones y transacciones.
- `Simular Limpieza` analiza y muestra cuantos registros serian eliminados, sin borrar nada.
- Detecta registros por patrones de prueba en nombre/texto: `E2E`, `TEST`, `QA`, `PRUEBA`, o `DATOS DE PRUEBA`.
- Tambien elimina cotizaciones/transacciones ligadas a proyectos de prueba detectados.
- Requiere confirmacion antes de eliminar.
- No afecta datos reales que no cumplan esos patrones.

Tambien se agrego workflow CI con PostgreSQL temporal para validar el backend antes de publicar:

- Workflow: `.github/workflows/local-smoke-test.yml`
- Flujo: levantar Postgres -> migraciones -> arrancar backend -> ejecutar smoke test

## Flags de performance (frontend)

Variables opcionales para ajustar comportamiento en runtime:

1. VITE_PREFETCH_ENABLED:
   - true (default): habilita precarga de rutas por idle/hover/focus/touch
   - false: desactiva precarga
2. VITE_NAV_METRICS:
   - true (solo desarrollo): registra tiempos de precarga en consola
   - atajo de export: Ctrl+Shift+M (o Cmd+Shift+M en macOS) copia snapshot JSON de metricas al portapapeles
   - panel visual DEV: boton flotante "Mostrar Nav Metrics" con tabla avg/p95/min/max/latest por ruta y transicion
   - false (default): sin logs de métricas

## Estado de migracion

Fase completada en este repo:

- Frontend continua desplegando en GitHub Pages.
- Aplicacion frontend migrada a API REST SQL (sin SDK de Firebase en la app).
- Backend Express + PostgreSQL con migraciones automatizadas y workflow de migracion en GitHub Actions.
- Notificaciones y auditoria persistidas en PostgreSQL.
- Inicio de sesion persistido en PostgreSQL (tabla app_users) con fallback local si la BD no esta disponible.
- Carga de archivos migrada a endpoint local /api/uploads con archivos servidos desde /uploads.

Comportamiento por entorno:

- Desarrollo: si falla /api/auth/login, el cliente puede usar fallback local para no bloquear pruebas.
- Produccion: no hay fallback local de login; la API SQL debe estar operativa.
- Produccion: GET /api/health responde 503 cuando falta DATABASE_URL.

Pendiente para terminar migracion total:

- QA funcional end-to-end por modulo y smoke test de despliegue backend.
- Revisar pipeline de deploy para garantizar build/rollback y observabilidad.

## Notas importantes

- La app ya usa HashRouter, por lo que es compatible con GitHub Pages.
- El backend no depende de Cloud Run para funcionar.
- Si deseas endurecer seguridad de archivos, agrega validaciones MIME/tamanio en /api/uploads y/o integra almacenamiento externo.
