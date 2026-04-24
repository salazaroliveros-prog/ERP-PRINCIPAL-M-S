# Product Context

## Problem Being Solved
Los ERP de construcción requieren seguimiento estructurado de tareas por proyecto, equipo y fase. Este módulo centraliza la gestión de tareas para reducir overhead de coordinación y mejorar visibilidad de entrega.

## Target Users
- Gerentes de proyecto (supervisión de fases de construcción)
- Supervisores de campo (asignación y seguimiento de tareas diarias)
- Personal administrativo (monitoreo de progreso y reportes)

## Key Workflows
1. Crear tarea con título, descripción, prioridad, estado y proyecto asociado
2. Transiciones de estado: `pending → in-progress → done` (+ `cancelled`)
3. Filtrar tareas por proyecto, asignado o estado
4. Integración con módulo de Proyectos via FK

## Task Entity
```
id, title, description, status, priority, project_id, assignee_id, due_date, created_at, updated_at
```
- status: `pending | in-progress | done | cancelled`
- priority: `low | medium | high | critical`

## Success Criteria
- CRUD completo funcional en /tasks
- UI refleja estado en tiempo real
- Módulo integrado limpiamente al ERP (sidebar, rutas, DB)
