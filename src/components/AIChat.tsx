import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Bot, Send, X, MessageSquare, Sparkles, AlertTriangle, TrendingUp, Wrench, Loader2, MoreVertical, History, Construction, DollarSign, Mic, MicOff, Trash2, BarChart3 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn, handleApiError, OperationType } from '../lib/utils';
import { getAIResponse } from '../lib/gemini';
import { auth } from '../lib/authStorageClient';
import { listProjectBudgetItemsDetailed, listProjects } from '../lib/projectsApi';
import { listTransactions } from '../lib/financialsApi';
import { listInventory } from '../lib/operationsApi';
import { listRisks } from '../lib/risksApi';
import { buildExecutiveReportPdf, buildMaterialsLineReportPdf } from '../lib/pdfUtils';
import { sendPdfReportByEmail } from '../lib/reportsApi';
import { sendNotification } from '../lib/notifications';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';

interface Message {
  role: 'user' | 'assistant';
  text: string;
  timestamp: Date;
}

interface PortfolioAlert {
  severity: 'low' | 'medium' | 'high';
  type: 'cost' | 'schedule' | 'inventory' | 'budget-health';
  projectId?: string;
  projectName?: string;
  message: string;
  suggestion: string;
}

interface PortfolioControlSnapshot {
  createdAt: string;
  score: number;
  status: 'verde' | 'amarillo' | 'rojo';
  high: number;
  medium: number;
  low: number;
}

const MARKET_RATE_BY_TYPOLOGY: Record<string, number> = {
  RESIDENCIAL: 4500,
  COMERCIAL: 6500,
  INDUSTRIAL: 5500,
  CIVIL: 3500,
  PUBLICA: 4000,
  SALUD: 8500,
  EDUCACION: 5000,
  DEPORTIVA: 4800,
  INFRAESTRUCTURA: 7500,
  TURISMO: 7000,
};

const CONTROL_MONITOR_INTERVAL_MS = 20 * 60 * 1000;
const CONTROL_HISTORY_STORAGE_KEY = 'wm_ai_control_history_v1';
const CONTROL_HISTORY_MAX_ITEMS = 24;

const loadControlHistory = () => {
  if (typeof window === 'undefined') return [] as PortfolioControlSnapshot[];
    // Mostrar acceso discreto: botón pequeño en la esquina inferior derecha
    const [showAgentButton, setShowAgentButton] = useState(true);

    // ...existing code...

    const latestControlSnapshot = controlHistory[0] || null;
    const previousControlSnapshot = controlHistory[1] || null;
    const scoreDelta = latestControlSnapshot && previousControlSnapshot
      ? Number((latestControlSnapshot.score - previousControlSnapshot.score).toFixed(1))
      : null;

    // ...existing code...

    return (
      <div className={cn(
        "fixed z-[100] transition-all duration-300",
        isOpen && isMobile ? "inset-0 flex items-end justify-center p-4" : "bottom-20 sm:bottom-6 right-6"
      )}>
        <AnimatePresence>
          {!isOpen && showAgentButton && (
            <motion.button
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0, opacity: 0 }}
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              onClick={() => setIsOpen(true)}
              className="w-8 h-8 sm:w-10 sm:h-10 bg-primary text-white rounded-full shadow-lg flex items-center justify-center hover:bg-primary-hover transition-all group fixed bottom-4 right-4 z-[110]"
              style={{ opacity: 0.7 }}
              title="Abrir Asistente IA"
            >
              <Bot size={18} className="group-hover:scale-110 transition-transform" />
            </motion.button>
          )}
        </AnimatePresence>
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();

const getPdfBase64 = (doc: any) => {
  const dataUri = String(doc.output('datauristring') || '');
  const base64Content = dataUri.includes(',') ? dataUri.split(',')[1] : dataUri;
  return base64Content.trim();
};

const parseGeminiDiagnostic = (text: string) => {
  if (!text.startsWith(GEMINI_DIAGNOSTIC_PREFIX) && !text.startsWith(AI_DIAGNOSTIC_PREFIX)) {
    return null;
  }
  return text
    .replace(GEMINI_DIAGNOSTIC_PREFIX, '')
    .replace(AI_DIAGNOSTIC_PREFIX, '')
    .trim();
};

export default function AIChat() {
  const navigate = useNavigate();
  const CHAT_AUTO_HIDE_STORAGE_KEY = 'wm_ai_chat_auto_hide';
  const CHAT_PANEL_WIDTH = 400;
  const CHAT_PANEL_HEIGHT = 600;
  const CHAT_INACTIVITY_AUTO_CLOSE_MS = 30000;
  const [isMobile, setIsMobile] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      text: '¡Hola! Soy el Asistente IA de WM_M&S. ¿En qué puedo ayudarte hoy? Puedo calcular presupuestos, sugerir mejoras o resolver dudas sobre tus proyectos.',
      timestamp: new Date()
    }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showQuickActions, setShowQuickActions] = useState(false);
  const [isFetchingHistory, setIsFetchingHistory] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [showHistoryMenu, setShowHistoryMenu] = useState(false);
  const [isAutoHideEnabled, setIsAutoHideEnabled] = useState(true);
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [controlHistory, setControlHistory] = useState<PortfolioControlSnapshot[]>([]);
  const monitorInFlightRef = useRef(false);
  const recognitionRef = useRef<any>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 640);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const savedPreference = localStorage.getItem(CHAT_AUTO_HIDE_STORAGE_KEY);
    if (savedPreference === 'true') {
      setIsAutoHideEnabled(true);
    } else if (savedPreference === 'false') {
      setIsAutoHideEnabled(false);
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    localStorage.setItem(CHAT_AUTO_HIDE_STORAGE_KEY, String(isAutoHideEnabled));
  }, [isAutoHideEnabled]);

  useEffect(() => {
    setControlHistory(loadControlHistory());
  }, []);

  const saveControlSnapshot = (snapshot: PortfolioControlSnapshot) => {
    setControlHistory((prev) => {
      const next = [snapshot, ...prev]
        .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
        .slice(0, CONTROL_HISTORY_MAX_ITEMS);
      persistControlHistory(next);
      return next;
    });
  };

  const autoHideAssistant = () => {
    if (!isAutoHideEnabled) return;
    window.setTimeout(() => {
      setShowQuickActions(false);
      setIsOpen(false);
    }, 8000);
  };

  const hideAssistantManually = () => {
    setShowQuickActions(false);
    setShowHistoryMenu(false);
    setIsOpen(false);
  };

  useEffect(() => {
    if (typeof window !== 'undefined' && ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window)) {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = false;
      recognitionRef.current.interimResults = false;
      recognitionRef.current.lang = 'es-ES';

      recognitionRef.current.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        setInput(transcript);
        setIsListening(false);
        toast.info(`Voz reconocida: "${transcript}"`);
      };

      recognitionRef.current.onerror = (event: any) => {
        setIsListening(false);
        setError("Error en el reconocimiento de voz: " + event.error);
      };

      recognitionRef.current.onend = () => {
        setIsListening(false);
      };
    }
  }, []);

  const toggleListening = () => {
    if (isListening) {
      recognitionRef.current?.stop();
    } else {
      setError(null);
      try {
        recognitionRef.current?.start();
        setIsListening(true);
      } catch (err) {
        setError("No se pudo iniciar el micrófono.");
      }
    }
  };

  const deleteMessage = (index: number) => {
    setMessages(prev => prev.filter((_, i) => i !== index));
    toast.info('Mensaje eliminado');
  };

  const clearChat = () => {
    setMessages([
      {
        role: 'assistant',
        text: '¡Hola! Soy el Asistente IA de WM_M&S. ¿En qué puedo ayudarte hoy? Puedo calcular presupuestos, sugerir mejoras o resolver dudas sobre tus proyectos.',
        timestamp: new Date()
      }
    ]);
    setShowHistoryMenu(false);
    toast.info('Chat reiniciado');
  };

  const fetchReportData = async () => {
    try {
      const [projects, transactionsResponse, inventoryResponse, risks] = await Promise.all([
        listProjects(),
        listTransactions({ limit: 2000, offset: 0 }),
        listInventory({ limit: 2000, offset: 0 }),
        listRisks(),
      ]);

      const transactions = transactionsResponse.items;
      
      const totalIncome = transactions.filter(t => t.type === 'Income').reduce((acc, t) => acc + (t.amount || 0), 0);
      const totalExpense = transactions.filter(t => t.type === 'Expense').reduce((acc, t) => acc + (t.amount || 0), 0);

      const inventoryAlerts = inventoryResponse.items
        .filter((item: any) => item.stock <= (item.minStock || 0));

      const activeProjects = projects.filter((project: any) => {
        const status = String(project?.status || '').toLowerCase();
        return status !== 'completed' && status !== 'cancelled';
      });

      const alerts: PortfolioAlert[] = [];
      const pros: string[] = [];
      const cons: string[] = [];

      activeProjects.forEach((project: any) => {
        const budget = Number(project?.budget || 0);
        const spent = Number(project?.spent || 0);
        const physicalProgress = Number(project?.physicalProgress || 0);
        const financialProgress = budget > 0 ? (spent / budget) * 100 : 0;
        const progressGap = financialProgress - physicalProgress;

        if (budget > 0 && progressGap > 12) {
          alerts.push({
            severity: 'high',
            type: 'cost',
            projectId: project.id,
            projectName: project.name,
            message: `${project.name}: el avance financiero supera al físico por ${progressGap.toFixed(1)}%.`,
            suggestion: 'Revisar rendimientos, compras y gastos indirectos; ejecutar ajuste presupuestario inmediato.',
          });
          cons.push(`${project.name}: posible sobrecosto por desalineación físico-financiera.`);
        } else if (progressGap > 6) {
          alerts.push({
            severity: 'medium',
            type: 'cost',
            projectId: project.id,
            projectName: project.name,
            message: `${project.name}: desviación moderada físico-financiera (${progressGap.toFixed(1)}%).`,
            suggestion: 'Aplicar control semanal de costos por renglón y validar compras pendientes.',
          });
        }

        const area = Number(project?.area || 0);
        const typologyKey = String(project?.typology || '').toUpperCase();
        const expectedRate = MARKET_RATE_BY_TYPOLOGY[typologyKey];
        if (area > 0 && budget > 0 && expectedRate) {
          const expectedBudget = area * expectedRate;
          if (budget < expectedBudget * 0.8) {
            alerts.push({
              severity: 'high',
              type: 'budget-health',
              projectId: project.id,
              projectName: project.name,
              message: `${project.name}: presupuesto base por debajo del mercado estimado para ${typologyKey}.`,
              suggestion: 'Ajustar baseline o recortar alcance para evitar ampliaciones tardías.',
            });
            cons.push(`${project.name}: baseline bajo respecto a costo estimado por m2.`);
          } else if (budget >= expectedBudget * 0.9 && budget <= expectedBudget * 1.1) {
            pros.push(`${project.name}: presupuesto base saludable frente al benchmark de ${typologyKey}.`);
          }
        }

        const startDate = project?.startDate ? new Date(project.startDate) : null;
        const endDate = project?.endDate ? new Date(project.endDate) : null;
        if (startDate && endDate && !Number.isNaN(startDate.getTime()) && !Number.isNaN(endDate.getTime())) {
          const now = Date.now();
          const totalDuration = endDate.getTime() - startDate.getTime();
          const elapsed = now - startDate.getTime();
          if (totalDuration > 0 && elapsed > 0) {
            const expectedPhysical = Math.min(100, Math.max(0, (elapsed / totalDuration) * 100));
            const delayGap = expectedPhysical - physicalProgress;
            if (delayGap > 15) {
              alerts.push({
                severity: 'high',
                type: 'schedule',
                projectId: project.id,
                projectName: project.name,
                message: `${project.name}: atraso crítico de ${delayGap.toFixed(1)}% frente al cronograma esperado.`,
                suggestion: 'Reprogramar ruta crítica y reforzar cuadrillas en frentes de mayor impacto.',
              });
              cons.push(`${project.name}: riesgo alto de incumplimiento de plazo contractual.`);
            }
          }
        }

        const hasHealthyProgress = physicalProgress >= 60 && progressGap <= 5;
        if (hasHealthyProgress) {
          pros.push(`${project.name}: avance físico estable con control financiero aceptable.`);
        }
      });

      if (inventoryAlerts.length > 0) {
        alerts.push({
          severity: inventoryAlerts.length >= 5 ? 'high' : 'medium',
          type: 'inventory',
          message: `Se detectaron ${inventoryAlerts.length} materiales en nivel crítico de inventario.`,
          suggestion: 'Emitir órdenes de compra y priorizar materiales de ruta crítica.',
        });
      } else {
        pros.push('Inventario general sin alertas críticas de stock mínimo.');
      }

      const high = alerts.filter((item) => item.severity === 'high').length;
      const medium = alerts.filter((item) => item.severity === 'medium').length;
      const low = alerts.filter((item) => item.severity === 'low').length;

      return {
        projects,
        activeProjects,
        transactions,
        inventory: inventoryResponse.items,
        financials: { totalIncome, totalExpense },
        inventoryAlerts,
        risks,
        portfolioControl: {
          alerts,
          pros,
          cons,
          status: high > 0 ? 'rojo' : medium > 0 ? 'amarillo' : 'verde',
          score: Math.max(0, Math.min(100, 100 - (high * 18) - (medium * 8))),
          alertSummary: {
            high,
            medium,
            low,
          },
        },
      };
    } catch (error) {
      handleApiError(error, OperationType.GET, 'multiple_collections');
      return null;
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleScroll = async (e: React.UIEvent<HTMLDivElement>) => {
    const target = e.currentTarget;
    if (target.scrollTop === 0 && !isFetchingHistory && messages.length > 1) {
      setIsFetchingHistory(true);
      // Simulate fetching history
      setTimeout(() => {
        const oldMessages: Message[] = [
          {
            role: 'assistant',
            text: '--- Historial cargado ---',
            timestamp: new Date(Date.now() - 1000000)
          }
        ];
        setMessages(prev => [...oldMessages, ...prev]);
        setIsFetchingHistory(false);
        // Maintain scroll position roughly
        target.scrollTop = 50;
      }, 1000);
    }
  };

  useEffect(() => {
    if (isOpen) {
      scrollToBottom();
    }
  }, [messages, isOpen]);

  useEffect(() => {
    const handleAICommand = async (event: any) => {
      const { command, params } = event.detail;
      setIsOpen(true);

      if (command === 'QUICK_PROMPT') {
        const prompt = String(params?.text || '').trim();
        if (!prompt) return;

        // Reuse the main send flow to keep command handling consistent.
        void handleSend(prompt);
        return;
      }
      
      if (command === 'Análisis de Riesgos Profundo') {
        const prompt = `Realiza un análisis de riesgos exhaustivo para el proyecto "${params.projectName}" (ID: ${params.projectId}). Identifica desviaciones, predice sobrecostos futuros y sugiere acciones correctivas inmediatas.`;
        setInput(prompt);
        // We can't call handleSend directly easily because of state updates, 
        // but we can simulate the flow or just set the input and let the user click send,
        // or better, trigger the logic.
        // Let's trigger it.
        const userMsg: Message = { role: 'user', text: prompt, timestamp: new Date() };
        setMessages(prev => [...prev, userMsg]);
        setIsLoading(true);
        
        try {
          const response = await getAIResponse(prompt, messages.map(m => ({ role: m.role, text: m.text })));
          const diagnostic = response ? parseGeminiDiagnostic(response) : null;
          if (diagnostic) {
            setError(diagnostic);
          } else {
            setMessages(prev => [...prev, { role: 'assistant', text: response || "Error en el análisis.", timestamp: new Date() }]);
          }
        } catch (err) {
          setError("Error al procesar el análisis de riesgos.");
        } finally {
          setIsLoading(false);
          autoHideAssistant();
        }
      } else if (command === 'GENERATE_EXECUTIVE_REPORT') {
        const prompt = `Generar informe ejecutivo para el proyecto "${params.projectName}" (ID: ${params.projectId}).`;
        const userMsg: Message = { role: 'user', text: prompt, timestamp: new Date() };
        setMessages(prev => [...prev, userMsg]);
        setIsLoading(true);
        
        const data = await fetchReportData();
        if (data) {
          // Filter data for specific project if needed, but fetchReportData gets all.
          // For now, we'll generate the global one or a specific one if pdfUtils supports it.
          const reportDoc = buildExecutiveReportPdf(data);
          reportDoc.save(`Informe_Ejecutivo_${new Date().toISOString().split('T')[0]}.pdf`);
          setMessages(prev => [...prev, { 
            role: 'assistant', 
            text: `He generado el informe ejecutivo para ${params.projectName}. El archivo PDF se ha descargado automáticamente.`, 
            timestamp: new Date() 
          }]);
        } else {
          setError("No se pudieron obtener los datos para el informe.");
        }
        setIsLoading(false);
        autoHideAssistant();
      } else if (command === 'CONTROL_TOTAL_PORTFOLIO') {
        const prompt = 'Ejecuta control total del ERP: analiza pros y contras de proyectos en ejecución, sobrecostos, presupuesto corto, inventario y tiempos de obra.';
        const userMsg: Message = { role: 'user', text: prompt, timestamp: new Date() };
        setMessages(prev => [...prev, userMsg]);
        setIsLoading(true);

        const data = await fetchReportData();
        if (!data) {
          setError('No se pudieron obtener datos para el control total.');
          setIsLoading(false);
          return;
        }

        const summary = data.portfolioControl?.alertSummary || { high: 0, medium: 0, low: 0 };
        saveControlSnapshot({
          createdAt: new Date().toISOString(),
          score: Number(data.portfolioControl?.score || 0),
          status: (data.portfolioControl?.status || 'verde') as 'verde' | 'amarillo' | 'rojo',
          high: Number(summary.high || 0),
          medium: Number(summary.medium || 0),
          low: Number(summary.low || 0),
        });

        const controlPrompt = `
        Eres director de PMO y costos de una constructora.
        Analiza este snapshot y responde en español con:
        1) Semáforo ejecutivo (verde/amarillo/rojo)
        2) Top 5 alertas críticas
        3) Pros y contras por proyectos en ejecución
        4) Acciones de 7 días y 30 días
        5) Riesgos de sobrecostos por presupuesto corto y desviación de cronograma
        6) Recomendaciones para bodega y finanzas

        Snapshot:
        ${JSON.stringify(data.portfolioControl)}
        `;

        const response = await getAIResponse(controlPrompt, messages.map(m => ({ role: m.role, text: m.text })));
        const diagnostic = response ? parseGeminiDiagnostic(response) : null;
        if (diagnostic) {
          setError(diagnostic);
        } else {
          setMessages(prev => [...prev, {
            role: 'assistant',
            text: response || 'No fue posible generar el análisis integral en este momento.',
            timestamp: new Date()
          }]);
        }

        const highAlerts = data.portfolioControl.alerts.filter((item: PortfolioAlert) => item.severity === 'high');
        for (const alert of highAlerts.slice(0, 2)) {
          await sendNotification(
            `Control Total IA: ${alert.projectName || 'Riesgo crítico'}`,
            `${alert.message} ${alert.suggestion}`,
            alert.type === 'inventory' ? 'inventory' : 'project'
          );
        }

        setIsLoading(false);
        autoHideAssistant();
      }
    };

    window.addEventListener('AI_COMMAND', handleAICommand);
    return () => window.removeEventListener('AI_COMMAND', handleAICommand);
  }, [messages]);

  const runAutomatedMonitoring = async () => {
    if (monitorInFlightRef.current || !navigator.onLine) {
      return;
    }

    monitorInFlightRef.current = true;
    setIsMonitoring(true);
    try {
      const data = await fetchReportData();
      const highAlerts = data?.portfolioControl?.alerts?.filter((item: PortfolioAlert) => item.severity === 'high') || [];

      for (const alert of highAlerts.slice(0, 3)) {
        await sendNotification(
          `Alerta IA: ${alert.projectName || 'Portafolio'}`,
          `${alert.message} ${alert.suggestion}`,
          alert.type === 'inventory' ? 'inventory' : 'project'
        );
      }
    } catch {
      // Silent background monitoring failure.
    } finally {
      monitorInFlightRef.current = false;
      setIsMonitoring(false);
    }
  };

  useEffect(() => {
    void runAutomatedMonitoring();
    const intervalId = window.setInterval(() => {
      void runAutomatedMonitoring();
    }, CONTROL_MONITOR_INTERVAL_MS);

    return () => {
      window.clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    const handleOpenAIChat = () => {
      window.dispatchEvent(new CustomEvent('SIDE_TOOL_WINDOW_OPEN', { detail: { source: 'ai-chat' } }));
      setIsOpen(true);
    };

    const handleSideToolOpen = (event: Event) => {
      const customEvent = event as CustomEvent<{ source?: string }>;
      if (customEvent.detail?.source && customEvent.detail.source !== 'ai-chat') {
        setShowQuickActions(false);
        setShowHistoryMenu(false);
        setIsOpen(false);
      }
    };

    window.addEventListener('OPEN_AI_CHAT', handleOpenAIChat);
    window.addEventListener('SIDE_TOOL_WINDOW_OPEN', handleSideToolOpen);
    return () => {
      window.removeEventListener('OPEN_AI_CHAT', handleOpenAIChat);
      window.removeEventListener('SIDE_TOOL_WINDOW_OPEN', handleSideToolOpen);
    };
  }, []);

  useEffect(() => {
    if (!isOpen || !isAutoHideEnabled) return;

    let inactivityTimer: number | null = null;

    const closePanel = () => {
      setShowQuickActions(false);
      setShowHistoryMenu(false);
      setIsOpen(false);
    };

    const resetTimer = () => {
      if (inactivityTimer) {
        window.clearTimeout(inactivityTimer);
      }
      inactivityTimer = window.setTimeout(closePanel, CHAT_INACTIVITY_AUTO_CLOSE_MS);
    };

    const events: Array<keyof WindowEventMap> = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll'];
    events.forEach((eventName) => window.addEventListener(eventName, resetTimer, { passive: true }));
    resetTimer();

    return () => {
      if (inactivityTimer) {
        window.clearTimeout(inactivityTimer);
      }
      events.forEach((eventName) => window.removeEventListener(eventName, resetTimer));
    };
  }, [isOpen, isAutoHideEnabled]);

  const handleSend = async (forcedInput?: string) => {
    // Validation: Prevent empty or whitespace-only messages, ensure valid characters
    const trimmedInput = (forcedInput ?? input).trim();
    const messagePattern = /[a-zA-Z0-9áéíóúÁÉÍÓÚñÑ\s\?\!\.\,]/;
    
    if (!trimmedInput || !messagePattern.test(trimmedInput)) {
      setError("Por favor, escribe un mensaje válido.");
      return;
    }

    if (isLoading) return;

    const userMessage: Message = {
      role: 'user',
      text: trimmedInput,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);
    setError(null);
    setShowQuickActions(false);

    // Check for "informe ejecutivo" command
    const lowerInput = trimmedInput.toLowerCase();

    // Command: Abrir centro de control real (físico-financiero)
    if (
      lowerInput.includes('control fisico financiero') ||
      lowerInput.includes('control físico financiero') ||
      lowerInput.includes('panel ejecutivo') ||
      lowerInput.includes('tablero de control')
    ) {
      const assistantMessage: Message = {
        role: 'assistant',
        text: 'Perfecto. Te llevo al tablero y enfoco el Centro de Control Ejecutivo para revisar físico vs financiero, riesgos y acciones prioritarias.',
        timestamp: new Date()
      };
      setMessages(prev => [...prev, assistantMessage]);

      navigate('/');
      window.setTimeout(() => {
        window.dispatchEvent(new CustomEvent('FOCUS_EXECUTIVE_CONTROL_CENTER'));
      }, 120);

      setIsLoading(false);
      autoHideAssistant();
      return;
    }

    // Command: Abrir módulo de analítica con gráficas
    if (
      lowerInput.includes('abrir analitica') ||
      lowerInput.includes('abrir analítica') ||
      lowerInput.includes('abrir analytics') ||
      lowerInput.includes('graficas de control') ||
      lowerInput.includes('gráficas de control')
    ) {
      const assistantMessage: Message = {
        role: 'assistant',
        text: 'Abriendo analítica avanzada para revisar tendencias, costos y desempeño con gráficas en tiempo real.',
        timestamp: new Date()
      };
      setMessages(prev => [...prev, assistantMessage]);

      navigate('/analytics');

      setIsLoading(false);
      autoHideAssistant();
      return;
    }
    
    // Command: Abrir Calculadora
    if (lowerInput.includes('abrir calculadora') || lowerInput.includes('calculadora de costos') || lowerInput.includes('estimar costos')) {
      const assistantMessage: Message = {
        role: 'assistant',
        text: 'Entendido. Estoy activando la calculadora de estimación por área en el módulo de presupuesto. Asegúrate de estar en la pestaña de presupuesto del proyecto para verla.',
        timestamp: new Date()
      };
      setMessages(prev => [...prev, assistantMessage]);
      
      // Dispatch custom event
      window.dispatchEvent(new CustomEvent('OPEN_COST_CALCULATOR'));
      setIsLoading(false);
      autoHideAssistant();
      return;
    }

    // Command: Reporte Detallado de Presupuesto
    if (lowerInput.includes('reporte detallado del presupuesto') || lowerInput.includes('reporte de presupuesto') || lowerInput.includes('pdf del presupuesto')) {
      const assistantMessage: Message = {
        role: 'assistant',
        text: 'Preparando el reporte PDF detallado del presupuesto actual (incluyendo materiales y mano de obra). Un momento...',
        timestamp: new Date()
      };
      setMessages(prev => [...prev, assistantMessage]);
      
      // Dispatch custom event
      window.dispatchEvent(new CustomEvent('GENERATE_BUDGET_REPORT'));
      setIsLoading(false);
      autoHideAssistant();
      return;
    }

    // Command: Análisis de Riesgos Profundo
    if (lowerInput.includes('analizar riesgos') || lowerInput.includes('análisis de riesgos') || lowerInput.includes('situación crítica')) {
      const assistantMessage: Message = {
        role: 'assistant',
        text: 'Iniciando análisis profundo de riesgos predictivos. Estoy cruzando datos de avance físico, financiero, inventario y presupuestos por M2. Un momento...',
        timestamp: new Date()
      };
      setMessages(prev => [...prev, assistantMessage]);
      
      // We let the normal AI flow handle this but with a more specific prompt to trigger the tool
      const response = await getAIResponse("Realiza un análisis de riesgos exhaustivo de todos los proyectos activos. Identifica desviaciones, predice sobrecostos futuros y sugiere acciones correctivas inmediatas.", messages.map(m => ({ role: m.role, text: m.text })));
      const diagnostic = response ? parseGeminiDiagnostic(response) : null;
      if (diagnostic) {
        setError(diagnostic);
      } else {
        const aiMessage: Message = {
          role: 'assistant',
          text: response || "No se pudo completar el análisis en este momento.",
          timestamp: new Date()
        };
        setMessages(prev => [...prev, aiMessage]);
      }
      setIsLoading(false);
      autoHideAssistant();
      return;
    }

    // Command: Control Total de Portafolio
    if (
      lowerInput.includes('control total') ||
      lowerInput.includes('copiloto integral') ||
      lowerInput.includes('analiza pro y contra') ||
      lowerInput.includes('alertas de sobrecostos')
    ) {
      const assistantMessage: Message = {
        role: 'assistant',
        text: 'Activando control total del ERP: analizando presupuesto, bodega, finanzas y duración de obra para generar alertas y recomendaciones ejecutivas.',
        timestamp: new Date()
      };
      setMessages(prev => [...prev, assistantMessage]);

      navigate('/');
      window.setTimeout(() => {
        window.dispatchEvent(new CustomEvent('FOCUS_EXECUTIVE_CONTROL_CENTER'));
      }, 120);

      const data = await fetchReportData();
      if (!data) {
        setError('No pude obtener datos para el control total.');
        setIsLoading(false);
        return;
      }

      const summary = data.portfolioControl?.alertSummary || { high: 0, medium: 0, low: 0 };
      saveControlSnapshot({
        createdAt: new Date().toISOString(),
        score: Number(data.portfolioControl?.score || 0),
        status: (data.portfolioControl?.status || 'verde') as 'verde' | 'amarillo' | 'rojo',
        high: Number(summary.high || 0),
        medium: Number(summary.medium || 0),
        low: Number(summary.low || 0),
      });

      const controlPrompt = `
      Eres director de PMO y costos de una constructora.
      Analiza este snapshot y responde en español con:
      1) Semáforo ejecutivo (verde/amarillo/rojo)
      2) Top 5 alertas críticas
      3) Pros y contras por proyectos en ejecución
      4) Acciones de 7 días y 30 días
      5) Riesgos de sobrecostos por presupuesto corto y desviación de cronograma
      6) Recomendaciones para bodega y finanzas

      Snapshot:
      ${JSON.stringify(data.portfolioControl)}
      `;

      const response = await getAIResponse(controlPrompt, messages.map(m => ({ role: m.role, text: m.text })));
      const diagnostic = response ? parseGeminiDiagnostic(response) : null;
      if (diagnostic) {
        setError(diagnostic);
      } else {
        setMessages(prev => [...prev, {
          role: 'assistant',
          text: response || 'No fue posible generar el análisis integral en este momento.',
          timestamp: new Date()
        }]);
      }

      const highAlerts = data.portfolioControl.alerts.filter((item: PortfolioAlert) => item.severity === 'high');
      for (const alert of highAlerts.slice(0, 2)) {
        await sendNotification(
          `Control Total IA: ${alert.projectName || 'Riesgo crítico'}`,
          `${alert.message} ${alert.suggestion}`,
          alert.type === 'inventory' ? 'inventory' : 'project'
        );
      }

      setIsLoading(false);
      autoHideAssistant();
      return;
    }

    if (lowerInput.includes('informe ejecutivo') || lowerInput.includes('generar reporte') || lowerInput.includes('enviar pdf')) {
      const assistantMessage: Message = {
        role: 'assistant',
        text: 'Entendido. Estoy generando y enviando el informe ejecutivo en PDF por correo de inmediato.',
        timestamp: new Date()
      };
      setMessages(prev => [...prev, assistantMessage]);
      
      try {
        const data = await fetchReportData();
        if (!data) {
          setError('No se pudieron obtener los datos para el informe.');
          setIsLoading(false);
          autoHideAssistant();
          return;
        }

        const recipientEmail = getEmailFromPrompt(trimmedInput) || String(auth.currentUser?.email || '').trim().toLowerCase();
        if (!recipientEmail) {
          setError('No encontré un correo destino. Incluye un correo en tu mensaje.');
          setIsLoading(false);
          autoHideAssistant();
          return;
        }

        const reportDoc = buildExecutiveReportPdf(data);
        const pdfBase64 = getPdfBase64(reportDoc);
        await sendPdfReportByEmail({
          to: recipientEmail,
          subject: 'Informe Ejecutivo Gerencial WM_M&S',
          html: '<p>Adjunto encontrarás el informe ejecutivo gerencial en PDF.</p>',
          fileName: `Informe_Ejecutivo_${new Date().toISOString().slice(0, 10)}.pdf`,
          pdfBase64,
        });

        const successMessage: Message = {
          role: 'assistant',
          text: `¡Listo! El informe ejecutivo fue enviado por correo a ${recipientEmail}.`,
          timestamp: new Date()
        };
        setMessages(prev => [...prev, successMessage]);
        toast.success(`Informe enviado a ${recipientEmail}`);
      } catch (error) {
        handleApiError(error, OperationType.CREATE, 'reporte ejecutivo por correo');
      }

      setIsLoading(false);
      autoHideAssistant();
      return;
    }

    if (
      lowerInput.includes('desglose de materiales') ||
      lowerInput.includes('materiales del renglon') ||
      lowerInput.includes('materiales del renglón')
    ) {
      const lineMatch = trimmedInput.match(/rengl[oó]n\s*(?:n[oº°.]*)?\s*(\d+)/i);
      const requestedLineOrder = Number(lineMatch?.[1] || 0);
      const allProjects = await listProjects();
      const normalizedInput = trimmedInput.toLowerCase();
      const targetProject = allProjects.find((project) => normalizedInput.includes(String(project.name || '').toLowerCase()));

      if (!targetProject || !requestedLineOrder) {
        setMessages(prev => [
          ...prev,
          {
            role: 'assistant',
            text: 'Para enviar el desglose de materiales en PDF necesito que indiques el nombre del proyecto y el número de renglón. Ejemplo: "Envía desglose de materiales del proyecto Torre Norte renglón 12 a correo@dominio.com".',
            timestamp: new Date(),
          },
        ]);
        setIsLoading(false);
        autoHideAssistant();
        return;
      }

      const recipientEmail = getEmailFromPrompt(trimmedInput) || String(auth.currentUser?.email || '').trim().toLowerCase();
      if (!recipientEmail) {
        setError('No encontré un correo destino. Incluye un correo en tu mensaje.');
        setIsLoading(false);
        autoHideAssistant();
        return;
      }

      try {
        const detailedItems = await listProjectBudgetItemsDetailed(targetProject.id);
        const targetLine = detailedItems.find((item) => Number(item.order || 0) === requestedLineOrder);

        if (!targetLine) {
          setMessages(prev => [
            ...prev,
            {
              role: 'assistant',
              text: `No encontré el renglón ${requestedLineOrder} en el proyecto ${targetProject.name}.`,
              timestamp: new Date(),
            },
          ]);
          setIsLoading(false);
          autoHideAssistant();
          return;
        }

        const materialsDoc = buildMaterialsLineReportPdf({
          project: { name: targetProject.name, location: targetProject.location },
          lineItem: targetLine,
        });

        await sendPdfReportByEmail({
          to: recipientEmail,
          subject: `Desglose de materiales - ${targetProject.name} renglón ${requestedLineOrder}`,
          html: `<p>Adjunto se envía el desglose de materiales del proyecto <strong>${targetProject.name}</strong>, renglón <strong>${requestedLineOrder}</strong>.</p>`,
          fileName: `Desglose_Materiales_${slugifyText(targetProject.name)}_renglon_${requestedLineOrder}.pdf`,
          pdfBase64: getPdfBase64(materialsDoc),
        });

        setMessages(prev => [
          ...prev,
          {
            role: 'assistant',
            text: `Listo. Envié el desglose de materiales del renglón ${requestedLineOrder} de ${targetProject.name} a ${recipientEmail}.`,
            timestamp: new Date(),
          },
        ]);

        toast.success(`Desglose enviado a ${recipientEmail}`);
      } catch (error) {
        handleApiError(error, OperationType.CREATE, 'desglose de materiales por correo');
      }

      setIsLoading(false);
      autoHideAssistant();
      return;
    }

    try {
      const history = messages.map(m => ({ role: m.role, text: m.text }));
      const response = await getAIResponse(trimmedInput, history);
      const diagnostic = response ? parseGeminiDiagnostic(response) : null;
      if (diagnostic) {
        setError(diagnostic);
        return;
      }

      if (!response) {
        throw new Error('EMPTY_RESPONSE');
      }

      const assistantMessage: Message = {
        role: 'assistant',
        text: response,
        timestamp: new Date()
      };

      setMessages(prev => [...prev, assistantMessage]);
    } catch (err: any) {
      if (err.message === 'EMPTY_RESPONSE') {
        setError("La IA no devolvió ninguna respuesta. Intenta de nuevo.");
      } else if (err.name === 'AbortError' || err.message?.includes('timeout')) {
        setError("La respuesta de la IA está tardando demasiado. Revisa tu conexión.");
      } else if (err.message?.includes('network') || !navigator.onLine) {
        setError("Error de red al contactar la IA. Verifica tu conexión a internet.");
      } else {
        setError("Ocurrió un problema inesperado al procesar tu consulta.");
      }
    } finally {
      setIsLoading(false);
      autoHideAssistant();
    }
  };

  const quickActions = [
    { icon: BarChart3, label: "Centro de Control Real", prompt: "Abrir tablero de control físico financiero" },
    { icon: Bot, label: "Control Total ERP", prompt: "Ejecuta control total del ERP: analiza pros y contras de proyectos en ejecución, sobrecostos, presupuesto corto, inventario y tiempos de obra." },
    { icon: TrendingUp, label: "Salud Global M2", prompt: "Realiza un análisis de salud presupuestaria de todos los proyectos activos basado en sus M2 y tipología. Envía sugerencias si detectas riesgos." },
    { icon: AlertTriangle, label: "Análisis de Riesgos", prompt: "Realiza un análisis de riesgos proactivo y predictivo para mis proyectos actuales. Identifica desviaciones críticas, predice sobrecostos futuros y sugiere acciones correctivas inmediatas para mitigar situaciones críticas." },
    { icon: Construction, label: "Estado de Obra", prompt: "Explícame el estado actual de la obra [Nombre]" },
    { icon: DollarSign, label: "Resumen Gastos", prompt: "Dame un resumen de los gastos del mes pasado" },
    { icon: TrendingUp, label: "Calcular Presupuesto", prompt: "Ayúdame a calcular un presupuesto para una obra de 100m2 con acabados medios." },
    { icon: Sparkles, label: "Sugerir Mejoras", prompt: "¿Qué mejoras sugieres para optimizar el inventario actual?" },
    { icon: Wrench, label: "Ajustes Plataforma", prompt: "¿Cómo puedo configurar alertas automáticas para stock bajo?" }
  ];

<<<<<<< HEAD
  const latestControlSnapshot = controlHistory[0] || null;
  const previousControlSnapshot = controlHistory[1] || null;
  const scoreDelta = latestControlSnapshot && previousControlSnapshot
    ? Number((latestControlSnapshot.score - previousControlSnapshot.score).toFixed(1))
    : null;
=======
  // Mostrar acceso discreto: botón pequeño en la esquina inferior derecha
  const [showAgentButton, setShowAgentButton] = useState(true);

  return (
    <div className={cn(
      "fixed z-[100] transition-all duration-300",
      isOpen && isMobile && !isMinimized ? "inset-0 flex items-end justify-center p-4" : "bottom-20 sm:bottom-6 right-6"
    )}>
      <AnimatePresence>
        {!isOpen && showAgentButton && (
          <motion.button
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            onClick={() => setIsOpen(true)}
            className="w-8 h-8 sm:w-10 sm:h-10 bg-primary text-white rounded-full shadow-lg flex items-center justify-center hover:bg-primary-hover transition-all group fixed bottom-4 right-4 z-[110]"
            style={{ opacity: 0.7 }}
            title="Abrir Asistente IA"
          >
            <Bot size={18} className="group-hover:scale-110 transition-transform" />
          </motion.button>
        )}
      </AnimatePresence>
>>>>>>> b07b928 (Panel de métricas interactivo: gauges, widgets personalizables y reorganización drag & drop)

  const weeklyBaselineSnapshot = useMemo(() => {
    if (!latestControlSnapshot || controlHistory.length < 2) return null;

    const latestTime = new Date(latestControlSnapshot.createdAt).getTime();
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    const targetTime = latestTime - sevenDaysMs;

    const candidates = controlHistory
      .slice(1)
      .map((snapshot) => ({
        snapshot,
        distance: Math.abs(new Date(snapshot.createdAt).getTime() - targetTime),
      }))
      // Only consider snapshots close to one week window (+/- 3 days) to keep trend meaningful.
      .filter((item) => item.distance <= (3 * 24 * 60 * 60 * 1000))
      .sort((left, right) => left.distance - right.distance);

    return candidates[0]?.snapshot || null;
  }, [controlHistory, latestControlSnapshot]);

  const weeklyScoreDelta = latestControlSnapshot && weeklyBaselineSnapshot
    ? Number((latestControlSnapshot.score - weeklyBaselineSnapshot.score).toFixed(1))
    : null;

  return (
    <>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, x: 36 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 36 }}
            className={cn(
              "fixed z-[100] bg-white rounded-2xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden",
              isMobile
                ? "inset-x-3 top-16 bottom-3"
                : "right-16 top-1/2 -translate-y-1/2"
            )}
            style={!isMobile ? { width: CHAT_PANEL_WIDTH, height: CHAT_PANEL_HEIGHT } : undefined}
          >
            {/* Header */}
            <div className="bg-slate-900 text-white p-4 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
                  <Bot size={20} />
                </div>
                <div>
                  <h3 className="font-bold text-sm">Asistente WM_IA</h3>
                  <div className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full"></span>
                    <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">
                      {isMonitoring ? 'Monitoreando' : 'En línea'}
                    </span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <div className="relative">
                  <button 
                    onClick={() => setShowHistoryMenu(!showHistoryMenu)}
                    className="p-1.5 hover:bg-white/10 rounded-md transition-colors"
                    title="Opciones de Chat"
                  >
                    <MoreVertical size={16} />
                  </button>
                  <AnimatePresence>
                    {showHistoryMenu && (
                      <motion.div
                        initial={{ opacity: 0, y: 10, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 10, scale: 0.95 }}
                        className="absolute right-0 mt-2 w-48 bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-slate-100 dark:border-slate-700 py-1 z-50"
                      >
                        <button
                          onClick={clearChat}
                          className="w-full flex items-center gap-2 px-4 py-2 text-xs font-bold text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-colors text-left"
                        >
                          <Trash2 size={14} />
                          Limpiar Chat
                        </button>
                        <button
                          onClick={() => {
                            setShowHistoryMenu(false);
                            if (!controlHistory.length) {
                              toast.info('Aún no hay análisis de control total guardados.');
                              return;
                            }
                            toast.info(`Último análisis: score ${controlHistory[0].score}% (${controlHistory[0].status.toUpperCase()})`);
                          }}
                          className="w-full flex items-center gap-2 px-4 py-2 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors text-left"
                        >
                          <History size={14} />
                          Ver Historial
                        </button>
                        <button
                          onClick={() => {
                            setIsAutoHideEnabled((prev) => {
                              const next = !prev;
                              toast.info(next ? 'Auto-ocultado activado' : 'Auto-ocultado desactivado');
                              return next;
                            });
                            setShowHistoryMenu(false);
                          }}
                          className="w-full flex items-center justify-between gap-2 px-4 py-2 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors text-left"
                        >
                          <span className="flex items-center gap-2">
                            <MessageSquare size={14} />
                            Auto-ocultar
                          </span>
                          <span
                            className={cn(
                              "relative inline-flex h-5 w-9 items-center rounded-full transition-colors",
                              isAutoHideEnabled ? "bg-emerald-500" : "bg-slate-300 dark:bg-slate-600"
                            )}
                            aria-hidden="true"
                          >
                            <span
                              className={cn(
                                "inline-block h-4 w-4 transform rounded-full bg-white transition-transform",
                                isAutoHideEnabled ? "translate-x-4" : "translate-x-0.5"
                              )}
                            />
                          </span>
                        </button>
                        <button
                          onClick={hideAssistantManually}
                          className="w-full flex items-center gap-2 px-4 py-2 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors text-left"
                        >
                          <X size={14} />
                          Ocultar ahora
                        </button>

                        <div className="mt-1 px-3 py-2 border-t border-slate-100 dark:border-slate-700">
                          <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-2">Últimos análisis</p>
                          {controlHistory.length === 0 ? (
                            <p className="text-[10px] text-slate-500">Sin análisis guardados aún.</p>
                          ) : (
                            <div className="space-y-1.5 max-h-44 overflow-y-auto custom-scrollbar pr-1">
                              {latestControlSnapshot && weeklyScoreDelta !== null && (
                                <div className="rounded-lg border border-slate-200 dark:border-slate-700 px-2 py-1.5 bg-white dark:bg-slate-700/20">
                                  <p className="text-[9px] font-black uppercase tracking-widest text-slate-500">Tendencia semanal</p>
                                  <p className={cn(
                                    "text-[10px] font-black mt-0.5",
                                    weeklyScoreDelta >= 0 ? "text-emerald-600" : "text-rose-600"
                                  )}>
                                    {weeklyScoreDelta >= 0 ? '+' : ''}{weeklyScoreDelta}% vs hace 7 días
                                  </p>
                                  <p className="text-[9px] text-slate-500">
                                    Base: {new Date(weeklyBaselineSnapshot!.createdAt).toLocaleDateString('es-GT', { day: '2-digit', month: 'short' })}
                                  </p>
                                </div>
                              )}

                              {controlHistory.slice(0, 4).map((item, index) => {
                                const isCurrent = index === 0;
                                return (
                                  <div key={`${item.createdAt}_${index}`} className="rounded-lg border border-slate-100 dark:border-slate-700 px-2 py-1.5 bg-slate-50 dark:bg-slate-700/30">
                                    <div className="flex items-center justify-between gap-2">
                                      <span className={cn(
                                        "text-[9px] font-black uppercase",
                                        item.status === 'verde' && "text-emerald-600",
                                        item.status === 'amarillo' && "text-amber-600",
                                        item.status === 'rojo' && "text-rose-600"
                                      )}>
                                        {item.status}
                                      </span>
                                      <span className="text-[9px] font-bold text-slate-500">{item.score}%</span>
                                    </div>
                                    <p className="text-[9px] text-slate-500 mt-0.5">
                                      {new Date(item.createdAt).toLocaleString('es-GT', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                                    </p>
                                    <p className="text-[9px] text-slate-500">H:{item.high} M:{item.medium} L:{item.low}</p>
                                    {isCurrent && scoreDelta !== null && (
                                      <p className={cn(
                                        "text-[9px] font-bold mt-0.5",
                                        scoreDelta >= 0 ? "text-emerald-600" : "text-rose-600"
                                      )}>
                                        Tendencia vs anterior: {scoreDelta >= 0 ? '+' : ''}{scoreDelta}%
                                      </p>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
                <button 
                  onClick={hideAssistantManually}
                  title="Cerrar"
                  className="p-1.5 hover:bg-white/10 rounded-md transition-colors"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            <>
                {/* Messages Area */}
                <div 
                  ref={scrollContainerRef}
                  onScroll={handleScroll}
                  className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50/50 relative"
                >
                  {isFetchingHistory && (
                    <div className="flex justify-center py-2">
                      <Loader2 size={16} className="animate-spin text-primary" />
                    </div>
                  )}
                  
                    {messages.map((msg, i) => (
                      <div 
                        key={i}
                        className={cn(
                          "flex flex-col max-w-[85%] group",
                          msg.role === 'user' ? "ml-auto items-end" : "mr-auto items-start"
                        )}
                      >
                        <div className="relative">
                          <div className={cn(
                            "p-3 rounded-2xl text-sm shadow-sm whitespace-pre-wrap leading-relaxed",
                            msg.role === 'user' 
                              ? "bg-primary text-white rounded-tr-none" 
                              : "bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-tl-none"
                          )}>
                            {msg.text}
                          </div>
                          {i > 0 && (
                            <button
                              onClick={() => deleteMessage(i)}
                              className={cn(
                                "absolute -top-2 p-1 bg-white dark:bg-slate-800 rounded-full shadow-md border border-slate-100 dark:border-slate-700 text-rose-500 opacity-0 group-hover:opacity-100 transition-opacity",
                                msg.role === 'user' ? "-left-2" : "-right-2"
                              )}
                              title="Eliminar mensaje"
                            >
                              <X size={10} />
                            </button>
                          )}
                        </div>
                        <span className="text-[10px] text-slate-400 mt-1 px-1">
                          {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    ))}
                  
                  {isLoading && (
                    <div className="flex flex-col items-start mr-auto max-w-[85%]">
                      <div className="flex items-center gap-2 p-3 bg-white text-slate-500 border border-slate-200 rounded-2xl rounded-tl-none text-sm shadow-sm italic">
                        <Loader2 size={14} className="animate-spin text-primary" />
                        Asistente está escribiendo...
                      </div>
                    </div>
                  )}

                  {error && (
                    <div className="flex items-center gap-2 p-3 bg-rose-50 border border-rose-100 rounded-xl text-rose-600 text-xs font-medium">
                      <AlertTriangle size={14} className="shrink-0" />
                      {error}
                    </div>
                  )}
                  
                  <div ref={messagesEndRef} />
                </div>

                {/* Quick Actions Popup oculto por defecto, solo se muestra si showQuickActions y showAgentButton están activos */}
                <AnimatePresence>
                  {showQuickActions && showAgentButton && (
                    <motion.div 
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 10 }}
                      className="absolute bottom-24 left-4 right-4 bg-white rounded-2xl shadow-2xl border border-slate-200 p-4 z-10"
                    >
                      <div className="flex items-center justify-between mb-3">
                        <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Acciones Rápidas</h4>
                        <button onClick={() => setShowQuickActions(false)} className="text-slate-400 hover:text-slate-600" title="Cerrar acciones rápidas">
                          <X size={14} />
                        </button>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        {quickActions.map((action, i) => (
                          <button
                            key={i}
                            onClick={() => {
                              setInput(action.prompt);
                              setShowQuickActions(false);
                              setTimeout(() => inputRef.current?.focus(), 100);
                            }}
                            className="flex items-center gap-2 p-2 bg-slate-50 border border-slate-100 rounded-xl text-[11px] text-slate-600 hover:border-primary hover:text-primary transition-all text-left group"
                          >
                            <action.icon size={14} className="shrink-0 group-hover:scale-110 transition-transform" />
                            <span className="line-clamp-1 font-bold">{action.label}</span>
                          </button>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Input Area */}
                <div className="p-4 border-t border-slate-100 bg-white shrink-0">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setShowQuickActions(!showQuickActions)}
                      className={cn(
                        "w-10 h-10 rounded-xl flex items-center justify-center transition-all",
                        showQuickActions ? "bg-primary text-white" : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                      )}
                      title="Acciones Rápidas"
                    >
                      <Sparkles size={18} />
                    </button>
                    <input
                      ref={inputRef}
                      type="text"
                      value={input}
                      onChange={(e) => {
                        setInput(e.target.value);
                        if (error) setError(null);
                      }}
                      onKeyPress={(e) => e.key === 'Enter' && handleSend()}
                      placeholder="Escribe tu consulta aquí..."
                      className="flex-1 bg-slate-100 border-none rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary transition-all outline-none"
                    />
                    <button
                      onClick={toggleListening}
                      className={cn(
                        "w-10 h-10 rounded-xl flex items-center justify-center transition-all",
                        isListening ? "bg-rose-500 text-white animate-pulse" : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                      )}
                      title={isListening ? "Detener micrófono" : "Usar voz"}
                    >
                      {isListening ? <MicOff size={18} /> : <Mic size={18} />}
                    </button>
                    <button
                      onClick={() => {
                        void handleSend();
                      }}
                      disabled={!input.trim() || isLoading}
                      className="px-4 h-10 bg-primary text-white rounded-xl flex items-center justify-center gap-2 hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-primary-shadow font-bold text-sm"
                    >
                      <span className="hidden sm:inline">Enviar</span>
                      <Send size={16} />
                    </button>
                  </div>
                  <p className="text-[9px] text-slate-400 text-center mt-3 uppercase tracking-widest font-bold">
                    Potenciado por Gemini AI • WM_M&S ERP
                  </p>
                </div>
              </>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
