# System Patterns

## Architecture
- Módulo embebido en el ERP principal (no microservicio)
- Frontend SPA: React + Vite, rutas client-side via React Router
- Backend: Express REST API, rutas bajo `/api/*`
- DB: PostgreSQL con migraciones SQL numeradas secuencialmente
- Patrón offline-first: `requestJson` con queue, retry y cache

## Multi-Agent Workflow
```
Planner → Backend Implementer → Reviewer
```
- Planner: descompone requerimientos, usa `semantic_search` + `manage_todo_list`
- Backend Implementer: aplica cambios, valida, usa `apply_patch` + `run_in_terminal`
- Reviewer: valida calidad y regresiones, usa `get_errors` + `get_changed_files`

## Module Integration Pattern
1. SQL migration → tabla con FK a entidad padre
2. `src/lib/*Api.ts` → cliente REST usando `requestJson`
3. `src/components/*.tsx` → UI con CRUD completo
4. `server.ts` → rutas Express + fallback offline
5. `src/App.tsx` → ruta registrada
6. `src/components/Sidebar.tsx` → NavItem en grupo correspondiente

## Naming Conventions
- Migraciones: `NNN_create_<entity>.sql`
- API clients: `src/lib/<entity>Api.ts`
- Components: `src/components/<Entity>.tsx` (PascalCase)
- API routes: `/api/<entities>` (plural, kebab-case)
