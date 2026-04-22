"""
Evaluation framework for Construction ERP AI Agent
"""

import os
import json
from typing import Dict, Any, List
from azure.ai.evaluation import (
    evaluate,
    TaskAdherenceEvaluator,
    IntentResolutionEvaluator,
    ToolCallAccuracyEvaluator,
    CoherenceEvaluator,
    FluencyEvaluator,
    AzureOpenAIModelConfiguration
)
from azure.identity import DefaultAzureCredential

class ConstructionERPEvaluator:
    def __init__(self):
        # Configure model for evaluation
        self.model_config = AzureOpenAIModelConfiguration(
            azure_deployment=os.getenv("AZURE_AI_EVALUATION_DEPLOYMENT", "gpt-4o"),
            azure_endpoint=os.getenv("AZURE_AI_EVALUATION_ENDPOINT"),
            api_key=os.getenv("AZURE_AI_EVALUATION_KEY"),
            api_version="2025-04-01-preview"
        )

        # Initialize evaluators
        self.evaluators = {
            "task_adherence": TaskAdherenceEvaluator(model_config=self.model_config),
            "intent_resolution": IntentResolutionEvaluator(model_config=self.model_config),
            "tool_accuracy": ToolCallAccuracyEvaluator(model_config=self.model_config),
            "coherence": CoherenceEvaluator(model_config=self.model_config),
            "fluency": FluencyEvaluator(model_config=self.model_config),
        }

    def create_evaluation_dataset(self, conversations: List[Dict[str, Any]]) -> str:
        """Create JSONL dataset for evaluation"""
        dataset_path = "evaluation_dataset.jsonl"

        with open(dataset_path, 'w', encoding='utf-8') as f:
            for conv in conversations:
                # Prepare data for evaluators
                data_point = {
                    "query": conv.get("query", ""),
                    "response": conv.get("response", ""),
                    "tool_definitions": conv.get("tool_definitions", []),
                    "tool_calls": conv.get("tool_calls", [])
                }
                f.write(json.dumps(data_point, ensure_ascii=False) + '\n')

        return dataset_path

    async def run_evaluation(self, dataset_path: str, output_path: str = "evaluation_results.json") -> Dict[str, Any]:
        """Run comprehensive evaluation"""
        evaluator_config = {
            "task_adherence": {
                "query": "${data.query}",
                "response": "${data.response}",
                "tool_definitions": "${data.tool_definitions}"
            },
            "intent_resolution": {
                "query": "${data.query}",
                "response": "${data.response}"
            },
            "tool_accuracy": {
                "query": "${data.query}",
                "tool_definitions": "${data.tool_definitions}",
                "tool_calls": "${data.tool_calls}"
            },
            "coherence": {
                "query": "${data.query}",
                "response": "${data.response}"
            },
            "fluency": {
                "response": "${data.response}"
            }
        }

        # Run evaluation
        result = evaluate(
            data=dataset_path,
            evaluators=evaluator_config,
            output_path=output_path
        )

        return result

    def analyze_results(self, results: Dict[str, Any]) -> Dict[str, Any]:
        """Analyze evaluation results and provide insights"""
        analysis = {
            "summary": {},
            "recommendations": [],
            "metrics": {}
        }

        # Extract key metrics
        for evaluator_name, evaluator_results in results.items():
            if "task_adherence" in evaluator_name:
                avg_score = evaluator_results.get("task_adherence", {}).get("mean", 0)
                analysis["metrics"]["task_adherence"] = avg_score
                if avg_score < 3:
                    analysis["recommendations"].append("Mejorar adherencia a tareas - el agente no sigue bien las instrucciones")

            elif "intent_resolution" in evaluator_name:
                avg_score = evaluator_results.get("intent_resolution", {}).get("mean", 0)
                analysis["metrics"]["intent_resolution"] = avg_score
                if avg_score < 3:
                    analysis["recommendations"].append("Mejorar resolución de intenciones - el agente no entiende bien las consultas del usuario")

            elif "tool_accuracy" in evaluator_name:
                avg_score = evaluator_results.get("tool_call_accuracy", {}).get("mean", 0)
                analysis["metrics"]["tool_accuracy"] = avg_score
                if avg_score < 3:
                    analysis["recommendations"].append("Mejorar precisión en uso de herramientas - revisar llamadas a funciones")

            elif "coherence" in evaluator_name:
                avg_score = evaluator_results.get("coherence", {}).get("mean", 0)
                analysis["metrics"]["coherence"] = avg_score
                if avg_score < 3:
                    analysis["recommendations"].append("Mejorar coherencia de respuestas - las respuestas no fluyen naturalmente")

            elif "fluency" in evaluator_name:
                avg_score = evaluator_results.get("fluency", {}).get("mean", 0)
                analysis["metrics"]["fluency"] = avg_score
                if avg_score < 3:
                    analysis["recommendations"].append("Mejorar fluidez del lenguaje - revisar gramática y vocabulario")

        # Overall assessment
        avg_overall = sum(analysis["metrics"].values()) / len(analysis["metrics"]) if analysis["metrics"] else 0
        analysis["summary"] = {
            "overall_score": avg_overall,
            "performance": "Excelente" if avg_overall >= 4 else "Bueno" if avg_overall >= 3 else "Necesita mejoras",
            "total_recommendations": len(analysis["recommendations"])
        }

        return analysis

# Example usage
async def run_agent_evaluation():
    """Example function to run evaluation"""
    evaluator = ConstructionERPEvaluator()

    # Sample conversation data for evaluation
    sample_conversations = [
        {
            "query": "¿Cuál es el estado del proyecto Centro Residencial?",
            "response": "El proyecto Centro Residencial tiene un avance físico del 65% y ha gastado Q3,200,000 de un presupuesto de Q5,000,000.",
            "tool_definitions": [
                {
                    "name": "get_projects",
                    "description": "Obtiene lista de proyectos",
                    "parameters": {}
                }
            ],
            "tool_calls": [
                {
                    "type": "tool_call",
                    "name": "get_projects"
                }
            ]
        }
    ]

    # Create dataset
    dataset_path = evaluator.create_evaluation_dataset(sample_conversations)

    # Run evaluation
    results = await evaluator.run_evaluation(dataset_path)

    # Analyze results
    analysis = evaluator.analyze_results(results)

    print("Evaluation Results:")
    print(json.dumps(analysis, indent=2, ensure_ascii=False))

    return analysis

if __name__ == "__main__":
    import asyncio
    asyncio.run(run_agent_evaluation())