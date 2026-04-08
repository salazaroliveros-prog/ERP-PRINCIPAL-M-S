# ERP Constructora WM_M&S

Frontend React/Vite desplegable en GitHub Pages.
Backend en PostgreSQL (Express + SQL migrations).

## Requisitos

- Node.js 20+
- PostgreSQL accesible desde el backend (DATABASE_URL)

## Ejecucion local

1. Instala dependencias: npm install
2. Crea un archivo .env.local (opcional) con:
   - VITE_GEMINI_API_KEY=tu_clave_gemini
3. Ejecuta en desarrollo: npm run dev

## Despliegue del frontend en GitHub Pages

Ya se incluyo el workflow [deploy-github-pages.yml](.github/workflows/deploy-github-pages.yml).

Pasos:

1. Sube el repositorio a GitHub y usa la rama main.
2. En GitHub, ve a Settings > Pages y selecciona Source: GitHub Actions.
3. En Settings > Secrets and variables > Actions, agrega:
   - VITE_GEMINI_API_KEY (opcional, para funciones IA del frontend)
   - VITE_API_BASE_URL (URL publica del backend, ejemplo: https://api.tudominio.com)
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

Pendiente para terminar migracion total:

- QA funcional end-to-end por modulo y smoke test de despliegue backend.
- Revisar pipeline de deploy para garantizar build/rollback y observabilidad.

## Notas importantes

- La app ya usa HashRouter, por lo que es compatible con GitHub Pages.
- El backend no depende de Cloud Run para funcionar.
- Si deseas endurecer seguridad de archivos, agrega validaciones MIME/tamanio en /api/uploads y/o integra almacenamiento externo.
