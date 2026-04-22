# Construction ERP AI Agent

Agente inteligente para gestión de proyectos de construcción usando Microsoft Agent Framework.

## Características

- **Análisis Predictivo**: Monitoreo continuo de proyectos con alertas proactivas
- **Gestión de Riesgos**: Análisis de desviaciones presupuestarias y recomendaciones
- **Herramientas Integradas**: Gestión de inventario, finanzas, clientes y proyectos
- **Tracing**: Monitoreo completo con OpenTelemetry
- **Evaluation**: Framework de evaluación para medir calidad de respuestas
- **HTTP Server**: Desplegable como servicio web

## Requisitos

- Python 3.10+
- Azure subscription con Foundry project
- PostgreSQL database (para datos del ERP)

## Instalación

1. Instalar dependencias:

```bash
pip install -r requirements.txt
```

1. Configurar variables de entorno:

```bash
cp .env.template .env
# Editar .env con tus valores
```

## Configuración

### Variables de Entorno

- `FOUNDRY_PROJECT_ENDPOINT`: Endpoint de tu proyecto en Microsoft Foundry
- `FOUNDRY_MODEL_DEPLOYMENT_NAME`: Nombre del deployment del modelo
- `DATABASE_URL`: URL de conexión a PostgreSQL
- `APPLICATIONINSIGHTS_CONNECTION_STRING`: Para Application Insights (tracing)

## Uso

### Desarrollo Local

1. Ejecutar el agente:

```bash
python main.py
```

1. O usar debug con VSCode:

- Presionar F5 o ejecutar task "Run Agent HTTP Server"
- Se abrirá el Agent Inspector automáticamente

### Evaluación

Para evaluar el rendimiento del agente:

```bash
python evaluation.py
```

## Deployment a Foundry

1. Asegurarse que el agente esté configurado como HTTP server
2. Usar Azure Developer CLI o VSCode para deploy:

```bash
azd deploy
```

O usar el comando de VSCode: "Microsoft Foundry: Deploy Hosted Agent"

## Arquitectura

- **main.py**: Agente principal con herramientas
- **evaluation.py**: Framework de evaluación
- **requirements.txt**: Dependencias Python
- **.env**: Configuración de entorno

## Herramientas Disponibles

- `get_projects`: Lista proyectos activos
- `get_project_details`: Detalles específicos de proyecto
- `get_inventory`: Consulta de inventario
- `get_financial_summary`: Resumen financiero
- `get_clients`: Lista de clientes
- `create_notification`: Crear alertas
- `update_inventory_stock`: Actualizar stock
- `get_risk_analysis`: Análisis de riesgos
- `calculate_estimated_budget`: Cálculo de presupuesto estimado

## Tracing

El agente incluye tracing automático con OpenTelemetry. Para visualizar:

1. Ejecutar `ai-mlstudio.tracing.open` en VSCode
2. El tracing se envía automáticamente al endpoint configurado

## Evaluation Metrics

- **Task Adherence**: Cumplimiento de instrucciones
- **Intent Resolution**: Resolución correcta de intenciones
- **Tool Accuracy**: Precisión en uso de herramientas
- **Coherence**: Coherencia de respuestas
- **Fluency**: Fluidez del lenguaje
