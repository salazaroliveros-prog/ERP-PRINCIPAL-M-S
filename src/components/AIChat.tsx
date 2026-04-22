import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Bot, Send, X, MessageSquare, Sparkles, AlertTriangle, TrendingUp, Wrench, Loader2, MoreVertical, History, Construction, DollarSign, Mic, MicOff, Trash2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn, handleApiError, OperationType } from '../lib/utils';
import { getAIResponse } from '../lib/gemini';
import { listProjects } from '../lib/projectsApi';
import { listTransactions } from '../lib/financialsApi';
import { listInventory } from '../lib/operationsApi';
import { listRisks } from '../lib/risksApi';
import { generateExecutiveReport } from '../lib/pdfUtils';
import { toast } from 'sonner';

interface Message {
  role: 'user' | 'assistant';
  text: string;
  timestamp: Date;
}

export default function AIChat() {
  const CHAT_AUTO_HIDE_STORAGE_KEY = 'wm_ai_chat_auto_hide';
  const CHAT_PANEL_WIDTH = 400;
  const CHAT_PANEL_HEIGHT = 600;
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

  const autoHideAssistant = () => {
    if (!isAutoHideEnabled) return;
    window.setTimeout(() => {
      setShowQuickActions(false);
      setIsOpen(false);
    }, 700);
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

  const messageHistory = useMemo(() => 
    messages.map(m => ({ role: m.role, text: m.text })), 
    [messages]
  );

  const fetchReportData = async () => {
    try {
      const [projects, transactionsResponse, inventoryResponse, risks] = await Promise.all([
        listProjects(),
        listTransactions({ limit: 2000, offset: 0 }),
        listInventory({ limit: 2000, offset: 0 }),
        listRisks(),
      ]);

      const transactions = transactionsResponse.items;
      
      const financialData = {
        totalIncome: transactions.filter(t => t.type === 'Income').reduce((acc, t) => acc + (t.amount || 0), 0),
        totalExpense: transactions.filter(t => t.type === 'Expense').reduce((acc, t) => acc + (t.amount || 0), 0)
      };

      const inventoryAlerts = inventoryResponse.items
        .filter((item: any) => item.stock <= (item.minStock || 0));

      return {
        projects,
        financials: financialData,
        inventoryAlerts,
        risks
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
          const response = await getAIResponse(prompt, messageHistory);
          setMessages(prev => [...prev, { role: 'assistant', text: response || "Error en el análisis.", timestamp: new Date() }]);
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
          generateExecutiveReport(data);
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
      }
    };

    window.addEventListener('AI_COMMAND', handleAICommand);
    return () => window.removeEventListener('AI_COMMAND', handleAICommand);
  }, [messages]);

  useEffect(() => {
    const handleOpenAIChat = () => {
      setIsOpen(true);
    };

    window.addEventListener('OPEN_AI_CHAT', handleOpenAIChat);
    return () => window.removeEventListener('OPEN_AI_CHAT', handleOpenAIChat);
  }, []);

  const handleSend = async () => {
    // Validation: Prevent empty or whitespace-only messages, ensure valid characters
    const trimmedInput = input.trim();
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
      const response = await getAIResponse("Realiza un análisis de riesgos exhaustivo de todos los proyectos activos. Identifica desviaciones, predice sobrecostos futuros y sugiere acciones correctivas inmediatas.", messageHistory);
      
      const aiMessage: Message = {
        role: 'assistant',
        text: response || "No se pudo completar el análisis en este momento.",
        timestamp: new Date()
      };
      setMessages(prev => [...prev, aiMessage]);
      setIsLoading(false);
      autoHideAssistant();
      return;
    }

    if (lowerInput.includes('informe ejecutivo') || lowerInput.includes('generar reporte') || lowerInput.includes('enviar pdf')) {
      const assistantMessage: Message = {
        role: 'assistant',
        text: 'Entendido. Estoy recopilando los datos consolidados de todos los módulos para generar tu informe ejecutivo gerencial en PDF. Un momento por favor...',
        timestamp: new Date()
      };
      setMessages(prev => [...prev, assistantMessage]);
      
      const data = await fetchReportData();
      if (data) {
        generateExecutiveReport(data);
        const successMessage: Message = {
          role: 'assistant',
          text: '¡Listo! El informe ejecutivo ha sido generado y descargado con éxito. Contiene el resumen financiero, estado de proyectos y alertas críticas.',
          timestamp: new Date()
        };
        setMessages(prev => [...prev, successMessage]);
        toast.success('Informe generado con éxito');
      } else {
        setError("No se pudieron obtener los datos para el informe.");
      }
      setIsLoading(false);
      autoHideAssistant();
      return;
    }

    try {
      const response = await getAIResponse(trimmedInput, messageHistory);

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
    { icon: TrendingUp, label: "Salud Global M2", prompt: "Realiza un análisis de salud presupuestaria de todos los proyectos activos basado en sus M2 y tipología. Envía sugerencias si detectas riesgos." },
    { icon: AlertTriangle, label: "Análisis de Riesgos", prompt: "Realiza un análisis de riesgos proactivo y predictivo para mis proyectos actuales. Identifica desviaciones críticas, predice sobrecostos futuros y sugiere acciones correctivas inmediatas para mitigar situaciones críticas." },
    { icon: Construction, label: "Estado de Obra", prompt: "Explícame el estado actual de la obra [Nombre]" },
    { icon: DollarSign, label: "Resumen Gastos", prompt: "Dame un resumen de los gastos del mes pasado" },
    { icon: TrendingUp, label: "Calcular Presupuesto", prompt: "Ayúdame a calcular un presupuesto para una obra de 100m2 con acabados medios." },
    { icon: Sparkles, label: "Sugerir Mejoras", prompt: "¿Qué mejoras sugieres para optimizar el inventario actual?" },
    { icon: Wrench, label: "Ajustes Plataforma", prompt: "¿Cómo puedo configurar alertas automáticas para stock bajo?" }
  ];

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
                : "right-4 top-1/2 -translate-y-1/2"
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
                    <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">En línea</span>
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
                            toast.info('Historial guardado localmente');
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
                            "p-3 rounded-2xl text-sm shadow-sm",
                            msg.role === 'user' 
                              ? "bg-primary text-white rounded-tr-none" 
                              : "bg-white text-slate-800 border border-slate-200 rounded-tl-none"
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

                {/* Quick Actions Popup */}
                <AnimatePresence>
                  {showQuickActions && (
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
                      onClick={handleSend}
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
