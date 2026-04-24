# Project Brief

## Project Name
Task Manager App — módulo del ERP Constructora WM/MYS

## Purpose
Módulo de gestión de tareas integrado como parte embebida del ERP de construcción (erp-constructora-wm_mys). Maneja creación, asignación, seguimiento y cambios de estado de tareas en flujos de trabajo de proyectos de construcción.

## Architecture Decision
Opción A: módulo embebido — sin microservicio separado. Reutiliza DB/auth/API del ERP principal.

## Core Goals
- Ciclo de vida completo de tareas (crear, asignar, actualizar, completar)
- Integración nativa con módulo de Proyectos (FK projects)
- Soporte al flujo multi-agente: Planner → Backend Implementer → Reviewer

## Current Status
Implementación completa. Pendiente: ejecutar migración SQL en producción.
