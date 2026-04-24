# Active Context

## Current Phase
Módulo Tasks implementado. Pendiente: migración SQL en producción.

## Artefactos Creados
| Archivo | Estado |
|---------|--------|
| `sql/029_create_tasks.sql` | ✅ Listo — pendiente ejecutar en Neon |
| `src/lib/tasksApi.ts` | ✅ CRUD completo via requestJson |
| `src/components/Tasks.tsx` | ✅ UI con filtros, modal, estados, prioridades |
| `server.ts` | ✅ Rutas /api/tasks + fallback offline |
| `src/App.tsx` | ✅ Ruta /tasks registrada |
| `src/components/Sidebar.tsx` | ✅ NavItem en grupo Operaciones |

## Immediate Next Steps
1. `npm run db:migrate` (o aplicar `sql/029_create_tasks.sql` manualmente en Neon)
2. `npm run dev` → verificar /tasks en local
3. Opcional: widget de resumen de tareas en Dashboard
4. Opcional: vincular tareas desde vista de Proyectos

## Open Questions
- ¿Asignación por usuario autenticado (`assignee_id = uid`)?
- ¿Notificaciones automáticas por vencimiento de tareas?
- ¿Integración con Workflows para aprobación de tareas críticas?
