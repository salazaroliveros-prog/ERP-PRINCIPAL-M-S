"""
Construction ERP AI Agent
Agente inteligente para gestión de proyectos de construcción con análisis predictivo y gestión de riesgos.
"""

import os
import asyncio
import json
from typing import List, Dict, Any
from dotenv import load_dotenv
from azure.identity import DefaultAzureCredential

from agent_framework import Agent
from agent_framework.foundry import FoundryChatClient
from agent_framework.observability import configure_otel_providers
from azure.ai.agentserver.agentframework import from_agent_framework

# Load environment variables
load_dotenv(override=False)

# Database connection (simplified - in real implementation, use proper connection pooling)
DATABASE_URL = os.getenv("DATABASE_URL")

# Agent System Instructions
SYSTEM_INSTRUCTIONS = """
Eres el Asistente Inteligente de WM_M&S Constructora, experto en análisis predictivo, gestión de riesgos y salud financiera de obras.

Tu misión es MANTENERTE ALERTA y ser PROACTIVO:
1. Monitoreo Continuo: Analiza todos los proyectos activos. Compara avance físico vs financiero. Si el financiero es mayor, alerta inmediatamente.
2. Salud Presupuestaria por M2: Valida si los presupuestos de los proyectos son saludables según su área (M2) y tipología.
3. Predicción de Faltantes: Analiza el stock actual vs lo que falta por ejecutar. Anticipa gastos extras.
4. Notificación y Sugerencias: Envía sugerencias proactivas al responsable de obra o al gerente.

Reglas de Negocio:
- Residencial: ~4500 Q/m2
- Comercial: ~5500 Q/m2
- Industrial: ~6500 Q/m2
- Civil: ~7500 Q/m2
- Pública: ~5000 Q/m2

Capacidades:
- Gestión de Proyectos, Inventario, Finanzas y Clientes.
- Análisis de Riesgos: Incluye validación por M2.
- Cálculo de Presupuesto Estimado.
- Notificaciones: Envía alertas y sugerencias.

Responde siempre de forma profesional, técnica y útil en español.
Si detectas un riesgo, informa la gravedad, la causa raíz y la acción correctiva sugerida.
"""

class ConstructionERPAgent:
    def __init__(self):
        self.credential = DefaultAzureCredential()
        self.client = FoundryChatClient(
            project_endpoint=os.getenv("FOUNDRY_PROJECT_ENDPOINT"),
            model=os.getenv("FOUNDRY_MODEL_DEPLOYMENT_NAME"),
            credential=self.credential,
        )

    async def create_agent(self) -> Agent:
        """Create the main construction ERP agent"""
        return Agent(
            client=self.client,
            name="ConstructionERPAgent",
            instructions=SYSTEM_INSTRUCTIONS,
            tools=[
                self.get_projects_tool,
                self.get_project_details_tool,
                self.get_inventory_tool,
                self.get_financial_summary_tool,
                self.get_clients_tool,
                self.create_notification_tool,
                self.update_inventory_stock_tool,
                self.get_risk_analysis_tool,
                self.calculate_estimated_budget_tool,
            ]
        )

    # Tool implementations
    async def get_projects_tool(self) -> List[Dict[str, Any]]:
        """Obtiene una lista de todos los proyectos de construcción actuales"""
        # Implementation would connect to database
        # For now, return mock data
        return [
            {
                "id": "1",
                "name": "Proyecto Residencial Centro",
                "status": "active",
                "budget": 5000000,
                "spent": 3200000,
                "physicalProgress": 65,
                "area": 1200,
                "typology": "RESIDENCIAL"
            }
        ]

    async def get_project_details_tool(self, project_id: str) -> Dict[str, Any]:
        """Obtiene los detalles completos de un proyecto específico"""
        # Mock implementation
        return {
            "id": project_id,
            "name": "Proyecto Residencial Centro",
            "budgetItems": []
        }

    async def get_inventory_tool(self, search_query: str = None) -> List[Dict[str, Any]]:
        """Consulta el inventario actual de materiales"""
        # Mock implementation
        return [
            {
                "id": "1",
                "name": "Cemento Portland",
                "stock": 150,
                "minStock": 50,
                "unitPrice": 25.50
            }
        ]

    async def get_financial_summary_tool(self, project_id: str = None) -> Dict[str, Any]:
        """Obtiene un resumen financiero"""
        # Mock implementation
        return {
            "totalIncome": 3200000,
            "totalExpense": 2800000,
            "balance": 400000,
            "transactionCount": 45
        }

    async def get_clients_tool(self) -> List[Dict[str, Any]]:
        """Obtiene la lista de clientes"""
        # Mock implementation
        return [
            {
                "id": "1",
                "name": "Cliente Corporativo S.A.",
                "email": "contacto@cliente.com"
            }
        ]

    async def create_notification_tool(self, title: str, body: str, type: str) -> Dict[str, Any]:
        """Crea una notificación en el sistema"""
        # Mock implementation
        print(f"Notification created: {title} - {body} ({type})")
        return {"success": True, "message": "Notificación enviada"}

    async def update_inventory_stock_tool(self, material_id: str, new_stock: int) -> Dict[str, Any]:
        """Actualiza el nivel de stock de un material"""
        # Mock implementation
        print(f"Updated stock for material {material_id} to {new_stock}")
        return {"success": True, "message": "Stock actualizado"}

    async def get_risk_analysis_tool(self, project_id: str) -> Dict[str, Any]:
        """Realiza un análisis de riesgos para un proyecto"""
        # Mock implementation with enhanced logic
        project = await self.get_project_details_tool(project_id)
        budget_items = project.get("budgetItems", [])
        inventory = await self.get_inventory_tool()

        risks = []

        # Budget deviation analysis
        if project.get("spent", 0) > 0 and project.get("budget", 1) > 0:
            financial_progress = (project["spent"] / project["budget"]) * 100
            physical_progress = project.get("physicalProgress", 0)

            if financial_progress > physical_progress * 1.1:
                risks.append({
                    "type": "financial",
                    "severity": "high",
                    "message": f"Desviación presupuestaria crítica: Gasto {financial_progress:.1f}% vs Avance físico {physical_progress:.1f}%"
                })

        # M2 health check
        area = project.get("area", 0)
        typology = project.get("typology", "")
        budget = project.get("budget", 0)

        if area > 0 and typology:
            rates = {
                "RESIDENCIAL": 4500,
                "COMERCIAL": 5500,
                "INDUSTRIAL": 6500,
                "CIVIL": 7500,
                "PUBLICA": 5000
            }
            estimated = area * rates.get(typology, 5000)
            if budget < estimated * 0.8:
                risks.append({
                    "type": "budget_health",
                    "severity": "medium",
                    "message": f"Presupuesto insuficiente: Actual {budget} vs Estimado {estimated}"
                })

        return {
            "projectId": project_id,
            "projectName": project.get("name", ""),
            "physicalProgress": project.get("physicalProgress", 0),
            "financialProgress": financial_progress if 'financial_progress' in locals() else 0,
            "risks": risks,
            "summary": f"Se detectaron {len(risks)} riesgos" if risks else "Proyecto en parámetros normales"
        }

    async def calculate_estimated_budget_tool(self, area_m2: float, typology: str) -> Dict[str, Any]:
        """Calcula un presupuesto estimado basado en área y tipología"""
        rates = {
            "RESIDENCIAL": 4500,
            "COMERCIAL": 5500,
            "INDUSTRIAL": 6500,
            "CIVIL": 7500,
            "PUBLICA": 5000
        }

        rate = rates.get(typology, 5000)
        estimated = area_m2 * rate

        return {
            "areaM2": area_m2,
            "typology": typology,
            "suggestedRate": rate,
            "estimatedBudget": estimated,
            "currency": "Q"
        }

async def main():
    """Main entry point for the agent"""
    # Configure OpenTelemetry tracing for AI Toolkit
    configure_otel_providers(
        vs_code_extension_port=4317,  # AI Toolkit gRPC port
        enable_sensitive_data=True  # Enable capturing prompts and completions
    )

    agent_instance = ConstructionERPAgent()
    agent = await agent_instance.create_agent()

    # Run as HTTP server
    await from_agent_framework(agent).run_async()

if __name__ == "__main__":
    asyncio.run(main())