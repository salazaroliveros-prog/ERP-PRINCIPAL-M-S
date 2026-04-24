# Product

## Project Overview
**ERP Constructora WM/MYS** es un sistema ERP completo para empresas de construcción. Incluye gestión de proyectos, presupuestos, inventario, finanzas, RRHH, subcontratos, proveedores, clientes, documentos, seguridad, riesgos, workflows, auditoría y tareas. Desplegado como SPA React en GitHub Pages + backend Express en Vercel + PostgreSQL en Neon.

El workspace también contiene **analizador-image**, una extensión VS Code (sub-módulo) para análisis de imágenes con IA.

## Value Proposition
Control total de obras, inventarios, finanzas y clientes en tiempo real — con soporte offline-first, IA integrada (Gemini/GitHub Models), OCR de facturas, firma digital de contratos y pipeline multi-agente automatizado.

## Key Features

### ERP Principal
- **29 módulos** operativos: Proyectos, Presupuestos, Inventario, Finanzas, Tareas, Cotizaciones, Órdenes de Compra, Proveedores, Clientes, RRHH, Equipos, Subcontratos, Documentos, Seguridad, Riesgos, Workflows, Auditoría, Notificaciones, Analytics, Configuración
- **Offline-first**: cola de mutaciones, retry automático, cache localStorage, sincronización al reconectar
- **IA dual**: Gemini (`@google/genai`) + GitHub Models (OpenAI-compatible) — chat, OCR de facturas, análisis de costos
- **OCR inteligente**: validación automática de facturas con score, decisión aprobado/revisar/rechazado, integración con workflows
- **Scheduler de alertas**: resumen programado de costos a las 8:00 y 16:00 con deduplicación via `app_settings`
- **SSE (Server-Sent Events)**: notificaciones en tiempo real via `/api/notifications/stream`
- **PWA**: manifest, iconos, soporte instalación (`beforeinstallprompt`)
- **Firma digital**: contratos de empleo con firma del trabajador y empleador, guardado en Vercel Blob
- **Mapas**: Leaflet + React-Leaflet para POIs de proyectos
- **PDF**: jsPDF + jsPDF-autotable para reportes, envío por email via Resend API

### analizador-image (VS Code Extension)
- Comando `analizador-image.helloWorld` — punto de entrada para análisis de imágenes
- Comando planificado `agent.generateImage` — generación con IA + guardado en workspace

## Target Users
- Gerentes de proyecto (supervisión de fases de construcción)
- Supervisores de campo (asignación y seguimiento de tareas diarias)
- Personal administrativo (finanzas, RRHH, proveedores)
- Administradores del sistema (configuración, auditoría, workflows)

## Current Status
- ERP: producción activa en Vercel + GitHub Pages
- Módulo Tasks: código completo, pendiente migración SQL en Neon
- analizador-image: v0.0.1 scaffold, lógica IA pendiente
