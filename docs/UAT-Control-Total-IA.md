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

## Criterios de aceptacion
- 100% de casos criticos (1,2,3,4,5) en estado PASS.
- Sin errores bloqueantes en consola para flujos IA.
- Alertas no duplicadas de forma excesiva en una misma sesion.

## Evidencias
- Capturas: Dashboard semaforo, AI Chat control total, panel notificaciones.
- Archivo exportado: CSV/PDF con codigos tecnicos.
- Registro de fecha/hora de ejecucion por caso.
