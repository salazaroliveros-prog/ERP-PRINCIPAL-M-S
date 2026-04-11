import { GoogleGenAI, Type, FunctionDeclaration, Content } from "@google/genai";
import { listProjects, listProjectBudgetItemsDetailed } from './projectsApi';
import { listTransactions } from './financialsApi';
import { listInventory, updateInventoryItem } from './operationsApi';
import { listClients } from './clientsApi';
import { sendNotification } from './notifications';

// Function Declarations for Tools
const getProjectsTool: FunctionDeclaration = {
  name: "get_projects",
  description: "Obtiene una lista de todos los proyectos de construcción actuales con su estado y presupuesto general.",
  parameters: {
    type: Type.OBJECT,
    properties: {}
  }
};

const getProjectDetailsTool: FunctionDeclaration = {
  name: "get_project_details",
  description: "Obtiene los detalles completos de un proyecto específico, incluyendo su ubicación, progreso físico/financiero y los renglones de su presupuesto.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      projectId: {
        type: Type.STRING,
        description: "El ID del proyecto para consultar."
      }
    },
    required: ["projectId"]
  }
};

const getInventoryTool: FunctionDeclaration = {
  name: "get_inventory",
  description: "Consulta el inventario actual de materiales, mostrando existencias, stock mínimo y precios unitarios.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      searchQuery: {
        type: Type.STRING,
        description: "Opcional: Término de búsqueda para filtrar materiales por nombre."
      }
    }
  }
};

const getFinancialSummaryTool: FunctionDeclaration = {
  name: "get_financial_summary",
  description: "Obtiene un resumen financiero global o de un proyecto específico, detallando ingresos y egresos totales.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      projectId: {
        type: Type.STRING,
        description: "Opcional: ID del proyecto para filtrar el resumen financiero."
      }
    }
  }
};

const getClientsTool: FunctionDeclaration = {
  name: "get_clients",
  description: "Obtiene la lista de clientes y prospectos registrados en la plataforma.",
  parameters: {
    type: Type.OBJECT,
    properties: {}
  }
};

const createNotificationTool: FunctionDeclaration = {
  name: "create_notification",
  description: "Crea una alerta o notificación en el sistema para informar al usuario sobre eventos importantes.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      title: { type: Type.STRING, description: "Título de la notificación" },
      body: { type: Type.STRING, description: "Cuerpo o mensaje de la notificación" },
      type: { 
        type: Type.STRING, 
        enum: ["inventory", "subcontract", "project", "system"],
        description: "Categoría de la notificación"
      }
    },
    required: ["title", "body", "type"]
  }
};

const updateInventoryStockTool: FunctionDeclaration = {
  name: "update_inventory_stock",
  description: "Actualiza el nivel de stock de un material en el inventario.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      materialId: { type: Type.STRING, description: "ID del material a actualizar" },
      newStock: { type: Type.NUMBER, description: "El nuevo nivel de stock total" }
    },
    required: ["materialId", "newStock"]
  }
};

const getRiskAnalysisTool: FunctionDeclaration = {
  name: "get_risk_analysis",
  description: "Realiza un análisis profundo de riesgos para un proyecto, comparando avance físico vs financiero, stock presupuestado vs real, y predice desviaciones o sobrecostos.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      projectId: { type: Type.STRING, description: "ID del proyecto a analizar" }
    },
    required: ["projectId"]
  }
};

const calculateEstimatedBudgetTool: FunctionDeclaration = {
  name: "calculate_estimated_budget",
  description: "Calcula un presupuesto estimado basado en los M2 de construcción y la tipología de la obra.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      areaM2: { type: Type.NUMBER, description: "Área total en metros cuadrados" },
      typology: { 
        type: Type.STRING, 
        enum: ["RESIDENCIAL", "COMERCIAL", "INDUSTRIAL", "CIVIL", "PUBLICA"],
        description: "Tipo de construcción"
      }
    },
    required: ["areaM2", "typology"]
  }
};

// Tool Implementation Functions
const tools = {
  get_projects: async () => {
    return listProjects();
  },
  get_project_details: async ({ projectId }: { projectId: string }) => {
    const projects = await listProjects();
    const project = projects.find((item) => item.id === projectId);
    if (!project) return { error: "Proyecto no encontrado" };

    const budgetItems = await listProjectBudgetItemsDetailed(projectId);
    
    return {
      ...project,
      budgetItems
    };
  },
  get_inventory: async ({ searchQuery }: { searchQuery?: string }) => {
    const response = await listInventory({ limit: 2000, offset: 0 });
    let materials = response.items;
    if (searchQuery) {
      const searchValue = searchQuery.toLowerCase();
      materials = materials.filter((m: any) => m.name.toLowerCase().includes(searchValue));
    }
    return materials;
  },
  get_financial_summary: async ({ projectId }: { projectId?: string }) => {
    const response = await listTransactions({ projectId, limit: 2000, offset: 0 });
    const transactions = response.items;
    
    const summary = transactions.reduce((acc: any, t: any) => {
      if (t.type === 'Income') acc.totalIncome += t.amount;
      else acc.totalExpense += t.amount;
      return acc;
    }, { totalIncome: 0, totalExpense: 0 });
    
    return {
      ...summary,
      balance: summary.totalIncome - summary.totalExpense,
      transactionCount: transactions.length
    };
  },
  get_clients: async () => {
    return listClients();
  },
  create_notification: async ({ title, body, type }: { title: string, body: string, type: string }) => {
    try {
      await sendNotification(title, body, type as any);
      return { success: true, message: "Notificación enviada al sistema" };
    } catch (error: any) {
      console.error("Error in create_notification tool:", error);
      throw error;
    }
  },
  update_inventory_stock: async ({ materialId, newStock }: { materialId: string, newStock: number }) => {
    await updateInventoryItem(materialId, { stock: newStock });
    return { success: true, message: "Stock actualizado correctamente" };
  },
  get_risk_analysis: async ({ projectId }: { projectId: string }) => {
    const projects = await listProjects();
    const project = projects.find((item) => item.id === projectId) as any;
    if (!project) return { error: "Proyecto no encontrado" };

    const budgetItems = await listProjectBudgetItemsDetailed(projectId);
    const transactionsResponse = await listTransactions({ projectId, limit: 2000, offset: 0 });
    const transactions = transactionsResponse.items;
    const inventoryResponse = await listInventory({ limit: 2000, offset: 0 });
    const inventory = inventoryResponse.items as any[];

    // Analysis Logic
    const risks = [];
    const budgetDeviation = (project.spent / project.budget) - (project.physicalProgress / 100);
    
    if (budgetDeviation > 0.1) {
      risks.push({
        type: "financial",
        severity: "high",
        message: `Desviación presupuestaria crítica: El gasto (${((project.spent/project.budget)*100).toFixed(1)}%) supera significativamente al avance físico (${(project.physicalProgress || 0).toFixed(1)}%).`
      });
    }

    // Check if budget is realistic based on M2
    if (project.area && project.typology) {
      const rates: Record<string, number> = {
        "RESIDENCIAL": 4500,
        "COMERCIAL": 5500,
        "INDUSTRIAL": 6500,
        "CIVIL": 7500,
        "PUBLICA": 5000
      };
      const estimated = Number(project.area || 0) * (rates[project.typology] || 5000);
      if (project.budget < estimated * 0.8) {
        risks.push({
          type: "budget_health",
          severity: "medium",
          message: `Presupuesto posiblemente insuficiente: El presupuesto actual (${project.budget}) es menor al estimado por M2 (${estimated}) para esta tipología.`
        });
      }
    }

    budgetItems.forEach((item: any) => {
      const itemExpenses = transactions.filter((t: any) => t.budgetItemId === item.id).reduce((sum, t: any) => sum + t.amount, 0);
      if (itemExpenses > item.totalItemPrice) {
        risks.push({
          type: "overcost",
          severity: "high",
          item: item.description,
          message: `Sobre costo crítico en renglón: ${item.description}. Presupuestado: ${item.totalItemPrice}, Gastado: ${itemExpenses}.`,
          suggestion: "Revisar rendimientos de mano de obra y posibles desperdicios de material.",
          correctiveAction: "Ajustar el presupuesto de los renglones restantes para compensar la desviación o solicitar una ampliación presupuestaria justificada."
        });
      }

      // Material stock vs budget prediction
      if (item.materials) {
        item.materials.forEach((m: any) => {
          const invMaterial = inventory.find((im: any) => im.name.toLowerCase() === m.name.toLowerCase()) as any;
          if (invMaterial && invMaterial.stock < (m.quantity * item.quantity * 0.3)) { // Less than 30% of total needed
            risks.push({
              type: "inventory",
              severity: "high",
              material: m.name,
              message: `Riesgo de desabastecimiento inminente: El stock de ${m.name} (${invMaterial.stock}) es insuficiente para completar el renglón ${item.description}.`,
              suggestion: "Realizar una orden de compra inmediata para evitar paros en la obra.",
              correctiveAction: "Contactar a proveedores alternativos si el principal tiene tiempos de entrega largos."
            });
          }
        });
      }
    });

    // Future prediction: Burn rate
    const totalSpent = project.spent || 0;
    const totalBudget = project.budget || 1;
    const physicalProgress = project.physicalProgress || 0;
    
    if (physicalProgress > 0 && (totalSpent / totalBudget) > (physicalProgress / 100) * 1.1) {
      risks.push({
        type: "prediction",
        severity: "high",
        message: "Predicción de sobrecosto final: Al ritmo actual, el proyecto excederá el presupuesto total antes de alcanzar el 100% de avance.",
        suggestion: "Implementar un control de costos más estricto y revisar los precios unitarios de los contratos vigentes.",
        correctiveAction: "Realizar un corte de caja y re-negociar con subcontratistas si es posible."
      });
    }

    return {
      projectId,
      projectName: project.name,
      physicalProgress,
      financialProgress: (totalSpent / totalBudget) * 100,
      risks,
      summary: risks.length > 0 
        ? `Se detectaron ${risks.length} riesgos críticos. Se recomienda implementar las acciones correctivas sugeridas de inmediato.` 
        : "El proyecto se encuentra dentro de los parámetros normales de ejecución."
    };
  },
  calculate_estimated_budget: async ({ areaM2, typology }: { areaM2: number, typology: string }) => {
    const rates: Record<string, number> = {
      "RESIDENCIAL": 4500,
      "COMERCIAL": 5500,
      "INDUSTRIAL": 6500,
      "CIVIL": 7500,
      "PUBLICA": 5000
    };
    const rate = rates[typology] || 5000;
    const estimated = areaM2 * rate;
    return {
      areaM2,
      typology,
      suggestedRate: rate,
      estimatedBudget: estimated,
      currency: "Q"
    };
  }
};

export async function getAIResponse(message: string, history: { role: string, text: string }[]) {
  const configuredProvider = String(import.meta.env.VITE_AI_PROVIDER || 'gemini').trim().toLowerCase();
  const DIAGNOSTIC_PREFIX = '[AI_DIAGNOSTIC]';

  if (configuredProvider === 'github-models' || configuredProvider === 'copilot') {
    try {
      const response = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message,
          history: history.slice(-12),
        }),
      });

      const payload = await response.json().catch(() => ({} as any));
      if (!response.ok) {
        const errorMessage = String((payload as any)?.error || response.statusText || 'Error en proveedor AI');
        return `${DIAGNOSTIC_PREFIX} ${errorMessage}`;
      }

      const reply = String((payload as any)?.response || '').trim();
      if (!reply) {
        return `${DIAGNOSTIC_PREFIX} Respuesta vacia del proveedor AI.`;
      }

      return reply;
    } catch (error: any) {
      return `${DIAGNOSTIC_PREFIX} No se pudo conectar con /api/ai/chat: ${String(error?.message || error)}`;
    }
  }

  const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
  const preferredModel = (import.meta.env.VITE_GEMINI_MODEL || 'gemini-2.5-flash').trim();
  const fallbackModels = ['gemini-2.5-flash', 'gemini-1.5-flash', 'gemini-1.5-flash-8b'];
  const candidateModels = Array.from(new Set([preferredModel, ...fallbackModels]));

  const isModelUnavailableError = (errorText: string) => {
    const messageLower = errorText.toLowerCase();
    return (
      messageLower.includes('404') ||
      messageLower.includes('not found') ||
      messageLower.includes('model') ||
      messageLower.includes('unsupported') ||
      messageLower.includes('permission_denied')
    );
  };

  const generateWithModelFallback = async (ai: GoogleGenAI, payload: { contents: Content[]; config: any }) => {
    let lastError: unknown;

    for (const modelName of candidateModels) {
      try {
        const response = await ai.models.generateContent({
          model: modelName,
          ...payload,
        });
        return { response, modelUsed: modelName };
      } catch (error) {
        lastError = error;
        const raw = String((error as any)?.message || error || '');
        if (!isModelUnavailableError(raw)) {
          throw error;
        }
      }
    }

    throw lastError || new Error('No model available for this project/region.');
  };
  
  if (!apiKey) {
    return `${DIAGNOSTIC_PREFIX} Clave no configurada. Falta VITE_GEMINI_API_KEY en variables de entorno.`;
  }

  try {
    const ai = new GoogleGenAI({ apiKey });
    
    const systemInstruction = `
      Eres el Asistente Inteligente de WM_M&S Constructora, experto en análisis predictivo, gestión de riesgos y salud financiera de obras.
      
      Tu misión es MANTENERTE ALERTA y ser PROACTIVO:
      1. Monitoreo Continuo: Analiza todos los proyectos activos. Compara avance físico vs financiero. Si el financiero es mayor, alerta inmediatamente.
      2. Salud Presupuestaria por M2: Usa 'calculate_estimated_budget' para validar si los presupuestos de los proyectos son saludables según su área (M2) y tipología. Si el presupuesto es insuficiente, notifica al gerente.
      3. Predicción de Faltantes: Analiza el stock actual vs lo que falta por ejecutar. Anticipa gastos extras si el material presupuestado no alcanzará según el rendimiento real.
      4. Notificación y Sugerencias: Usa 'create_notification' para enviar sugerencias proactivas al responsable de obra o al gerente. No esperes a que te pregunten si detectas un riesgo.
      
      Reglas de Negocio:
      - Residencial: ~4500 Q/m2
      - Comercial: ~5500 Q/m2
      - Industrial: ~6500 Q/m2
      - Civil: ~7500 Q/m2
      - Publica: ~5000 Q/m2

      Capacidades:
      - Gestión de Proyectos, Inventario, Finanzas y Clientes.
      - Análisis de Riesgos (get_risk_analysis): Incluye validación por M2.
      - Cálculo de Presupuesto Estimado (calculate_estimated_budget).
      - Notificaciones: Envía alertas y sugerencias a los involucrados.

      Responde siempre de forma profesional, técnica y útil en español.
      Si detectas un riesgo, informa la gravedad, la causa raíz y la acción correctiva sugerida. Envía una notificación formal si el riesgo es alto.
    `;

    // Truncate history to avoid token limits (last 10 messages)
    const truncatedHistory = history.slice(-10);

    const contents: Content[] = [
      ...truncatedHistory.map(h => ({ 
        role: h.role === 'user' ? 'user' : 'model', 
        parts: [{ text: h.text }] 
      })),
      { role: "user", parts: [{ text: message }] }
    ];

    const toolDeclarations = [
      getProjectsTool, 
      getProjectDetailsTool, 
      getInventoryTool, 
      getFinancialSummaryTool,
      getClientsTool,
      createNotificationTool,
      updateInventoryStockTool,
      getRiskAnalysisTool,
      calculateEstimatedBudgetTool
    ];

    let { response, modelUsed } = await generateWithModelFallback(ai, {
      contents,
      config: {
        systemInstruction,
        tools: [{ functionDeclarations: toolDeclarations }],
      },
    });

    // Handle Function Calls
    let functionCalls = response.functionCalls;
    
    let maxIterations = 5;
    while (functionCalls && maxIterations > 0) {
      maxIterations--;
      const functionResponses = [];
      
      for (const call of functionCalls) {
        const fnName = call.name as keyof typeof tools;
        const fnArgs = call.args as any;
        
        if (tools[fnName]) {
          try {
            const result = await (tools[fnName] as any)(fnArgs);
            functionResponses.push({
              name: fnName,
              response: { result },
              id: call.id
            });
          } catch (toolError) {
            functionResponses.push({
              name: fnName,
              response: { error: "Error al ejecutar la herramienta interna." },
              id: call.id
            });
          }
        }
      }

      if (functionResponses.length > 0) {
        const modelTurn = response.candidates?.[0]?.content;
        if (modelTurn) {
          contents.push(modelTurn);
        }
        
        contents.push({
          role: "user",
          parts: functionResponses.map(res => ({
            functionResponse: {
              name: res.name,
              response: res.response,
            }
          }))
        });

        ({ response, modelUsed } = await generateWithModelFallback(ai, {
          contents,
          config: {
            systemInstruction,
            tools: [{ functionDeclarations: toolDeclarations }],
          },
        }));
        
        functionCalls = response.functionCalls;
      } else {
        break;
      }
    }

    return response.text || `Respuesta vacía de Gemini (modelo usado: ${modelUsed}). ¿Podrías reformular tu pregunta?`;
  } catch (error: any) {
    const rawError = String(error?.message || error || '');
    const errorMessage = rawError.toLowerCase();
    const diagnostic = (messageText: string) => `${DIAGNOSTIC_PREFIX} ${messageText}`;

    if (errorMessage.includes('api_key') || errorMessage.includes('apikey') || errorMessage.includes('invalid key') || errorMessage.includes('credential')) {
      return diagnostic('API key inválida o mal escrita. Revise VITE_GEMINI_API_KEY y regenere la clave en Google AI Studio/Cloud.');
    }
    if (errorMessage.includes('403') || errorMessage.includes('permission_denied') || errorMessage.includes('forbidden')) {
      return diagnostic(`Permisos insuficientes (403). Verifique API habilitada, restricciones de clave (HTTP referrer/API restrictions) y acceso al modelo configurado (${preferredModel}).`);
    }
    if (errorMessage.includes('429') || errorMessage.includes('quota') || errorMessage.includes('rate') || errorMessage.includes('limit')) {
      return diagnostic('Límite de cuota/rate alcanzado (429). Espere unos minutos o aumente cuota en Google Cloud.');
    }
    if (errorMessage.includes('billing') || errorMessage.includes('payment') || errorMessage.includes('account_disabled')) {
      return diagnostic('Problema de billing en Google Cloud. Active facturación del proyecto y confirme método de pago.');
    }
    if (errorMessage.includes('not found') || errorMessage.includes('404') || errorMessage.includes('model') || errorMessage.includes('unsupported')) {
      return diagnostic(`Modelo no disponible en su proyecto/región. Modelo configurado: ${preferredModel}. Modelos probados automáticamente: ${candidateModels.join(', ')}. Defina VITE_GEMINI_MODEL con uno habilitado en su proyecto.`);
    }
    if (errorMessage.includes('network') || errorMessage.includes('failed to fetch') || errorMessage.includes('timeout')) {
      return diagnostic('Error de red o timeout al conectar con Gemini. Revise conectividad, firewall/proxy y vuelva a intentar.');
    }

    return diagnostic(`Error no clasificado de Gemini. Detalle: ${rawError}`);
  }
}
