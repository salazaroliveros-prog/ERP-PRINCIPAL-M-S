# UAT - Control Total IA (WM_M&S)

## Objetivo
Validar que el semaforo ejecutivo, copiloto y alertas automaticas funcionen correctamente con datos reales.

## Alcance
- Dashboard: tarjeta Semaforo Ejecutivo IA.
- Boton Abrir Copiloto desde Dashboard.
- AI Chat: comando Control Total ERP y acciones rapidas.
- Alertas automaticas en notificaciones.
- Historial de analisis y tendencias (anterior y semanal).

## Datos de prueba recomendados
- Proyecto A: saludable (avance fisico ~= financiero).
- Proyecto B: riesgo de sobrecosto (financiero > fisico).
- Proyecto C: atraso de cronograma y/o presupuesto base bajo por m2.
- Inventario: al menos 1 material bajo stock minimo.

## Casos de prueba
1. Render Semaforo Ejecutivo IA
- Paso: abrir Dashboard.
- Esperado: se muestra tarjeta con estado (verde/amarillo/rojo), score y contadores.

2. Apertura de Copiloto desde Dashboard
- Paso: click en Abrir Copiloto.
- Esperado: se abre AI Chat y ejecuta analisis integral automaticamente.

3. Comando manual de Control Total
- Paso: en AI Chat escribir "control total".
- Esperado: respuesta con semaforo, top alertas, pros/contras, acciones 7/30 dias.

4. Alertas criticas automaticas
- Paso: provocar escenario de riesgo alto (desviacion o stock critico).
- Esperado: se crean notificaciones tipo project/inventory en panel.

5. Historial de analisis
- Paso: ejecutar Control Total al menos 2 veces.
- Esperado: historial guarda fecha, estado, score, H/M/L y delta vs analisis anterior.

6. Tendencia semanal
- Paso: validar con datos historicos (o simulacion con snapshots).
- Esperado: muestra delta semanal vs snapshot mas cercano a 7 dias (+/- 3 dias).

7. Exportaciones con codificacion tecnica de presupuesto
- Paso: exportar CSV/PDF en modulo Presupuesto.
- Esperado: codigo formato capitulo.subcapitulo.item (ej. 01.01.001).

8. No regresiones visuales en movil
- Paso: revisar Dashboard, AI Chat y Presupuesto en viewport movil.
- Esperado: componentes legibles y operables sin desbordes criticos.

## Guion rapido de ejecucion (recomendado)
1. Preparacion de sesion
- Definir fecha/hora de prueba y responsable QA/UAT.
- Seleccionar proyectos A (saludable), B (sobrecosto), C (atraso).
- Tener panel de notificaciones visible para validar alertas.

2. Orden sugerido de ejecucion
- Caso 1 -> Caso 2 -> Caso 3 -> Caso 4 -> Caso 5 -> Caso 6 -> Caso 7 -> Caso 8.
- Registrar evidencia en cada caso inmediatamente (captura o archivo).

3. Criterio de registro por caso
- PASS: cumple el esperado sin bloqueo.
- FAIL: no cumple esperado o hay comportamiento incorrecto.
- BLOQUEADO: no se pudo ejecutar por dependencia externa.

4. Evidencia minima por caso
- Caso 1: captura de tarjeta semaforo en Dashboard.
- Caso 2: captura de AI Chat abierto desde boton Abrir Copiloto.
- Caso 3: captura de respuesta completa del control total.
- Caso 4: captura de notificacion critica en panel.
- Caso 5: captura de lista de ultimos analisis con score.
- Caso 6: captura de bloque "Tendencia semanal".
- Caso 7: adjuntar CSV/PDF exportado.
- Caso 8: capturas en viewport movil (dashboard, chat, presupuesto).

5. Cierre de UAT
- Completar Resumen de resultados.
- Documentar hallazgos en Plan de correccion.
- Obtener aprobacion negocio/tecnico.

## Criterios de aceptacion
- 100% de casos criticos (1,2,3,4,5) en estado PASS.
- Sin errores bloqueantes en consola para flujos IA.
- Alertas no duplicadas de forma excesiva en una misma sesion.

## Evidencias
- Capturas: Dashboard semaforo, AI Chat control total, panel notificaciones.
- Archivo exportado: CSV/PDF con codigos tecnicos.
- Registro de fecha/hora de ejecucion por caso.

## Matriz de ejecucion UAT (llenar)

| Caso | Nombre | Proyecto de prueba | Resultado (PASS/FAIL) | Evidencia | Observaciones |
|---|---|---|---|---|---|
| 1 | Render Semaforo Ejecutivo IA | A / B / C | PENDIENTE |  |  |
| 2 | Apertura de Copiloto desde Dashboard | A / B / C | PENDIENTE |  |  |
| 3 | Comando manual de Control Total | A / B / C | PENDIENTE |  |  |
| 4 | Alertas criticas automaticas | B / C | PENDIENTE |  |  |
| 5 | Historial de analisis | A / B / C | PENDIENTE |  |  |
| 6 | Tendencia semanal | A / B / C | PENDIENTE |  |  |
| 7 | Exportaciones con codificacion tecnica | A / B / C | PENDIENTE |  |  |
| 8 | No regresiones visuales en movil | A / B / C | PASS | Playwright: tests/e2e/mobile-dashboard-kpi-responsive.spec.ts (mobile-chromium) - 2026-04-11 | Se valida legibilidad KPI/charts y resumen top 6 en perfil movil. |

## Resumen de resultados
- Fecha de ejecucion: 2026-04-11 (parcial)
- Responsable QA/UAT: QA automatizado + Copilot
- Casos PASS: 1 (Caso 8)
- Casos FAIL: 0
- Casos bloqueados: 0
- Riesgo residual: Pendiente validar casos funcionales 1-7 con datos reales de portafolio y exportaciones.

## Plan de correccion (si aplica)
| Hallazgo | Severidad | Caso relacionado | Responsable | Fecha objetivo | Estado |
|---|---|---|---|---|---|
|  |  |  |  |  | PENDIENTE |

## Aprobacion
- Aprobado por (Negocio):
- Aprobado por (Tecnico):
- Fecha de aprobacion:
- Observacion final:
