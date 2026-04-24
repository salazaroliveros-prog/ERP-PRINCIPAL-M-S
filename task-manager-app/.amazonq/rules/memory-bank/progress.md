# Progress

## What Works
- Multi-agent workflow: Planner → Backend Implementer → Reviewer (`.github/agents/`)
- Amazon Q memory bank + rules configurados
- ERP principal: React + Express + PostgreSQL en Vercel + GitHub Pages
- **Módulo Tasks — código completo:**
  - Migración SQL lista (`sql/029_create_tasks.sql`)
  - API client (`src/lib/tasksApi.ts`) — GET, POST, PATCH, DELETE
  - UI (`src/components/Tasks.tsx`) — filtros, modal CRUD, badges de estado/prioridad
  - Backend routes (`server.ts`) — /api/tasks con fallback offline
  - Navegación integrada — ruta /tasks + NavItem en Sidebar

## Pending
- [ ] Ejecutar migración en producción (Neon)
- [ ] Widget de tareas en Dashboard
- [ ] Notificaciones de vencimiento
- [ ] Tests E2E para módulo Tasks
- [ ] CI/CD pipeline para tasks

## Decision Log
| Decisión | Razón |
|----------|-------|
| Módulo embebido (no microservicio) | Reutiliza DB/auth/API existentes, menor overhead |
| TypeScript en todo el stack | Consistencia con ERP existente |
| `requestJson` centralizado | Offline queue, retry, cache ya implementados |
| Tabla tasks con FK a projects | Integración nativa con módulo de proyectos |
| PostgreSQL (Neon) | Mismo proveedor que el resto del ERP |
