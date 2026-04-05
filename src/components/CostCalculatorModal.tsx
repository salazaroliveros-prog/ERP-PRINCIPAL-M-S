import React, { useState, useMemo } from 'react';
import { X, Calculator, Check, Plus, Info, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { MARKET_DATA, AREA_FACTORS, APU_TEMPLATES } from '../constants/apuData';
import { formatCurrency, cn } from '../lib/utils';
import { toast } from 'sonner';

interface CostCalculatorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImport: (items: any[]) => void;
  initialTypology?: string;
}

export function CostCalculatorModal({ isOpen, onClose, onImport, initialTypology }: CostCalculatorModalProps) {
  const [area, setArea] = useState<number>(0);
  const [typology, setTypology] = useState<string>(initialTypology || 'RESIDENCIAL');
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());

  const estimatedItems = useMemo(() => {
    if (area <= 0) return [];
    
    const factors = AREA_FACTORS[typology] || AREA_FACTORS.RESIDENCIAL;
    const templates = APU_TEMPLATES[typology] || APU_TEMPLATES.RESIDENCIAL;
    
    return templates.map(template => {
      const factor = factors[template.description] || 0;
      const quantity = area * factor;
      
      // Calculate unit costs
      const materialCost = template.materials.reduce((sum, m) => sum + (m.quantity * m.unitPrice), 0);
      const laborCost = template.labor.reduce((sum, l) => sum + (l.dailyRate / l.yield), 0);
      const directCost = materialCost + laborCost;
      const indirectCost = directCost * template.indirectFactor;
      const totalUnitPrice = directCost + indirectCost;
      
      return {
        ...template,
        quantity: Number(quantity.toFixed(2)),
        materialCost,
        laborCost,
        indirectCost,
        totalUnitPrice,
        totalItemPrice: quantity * totalUnitPrice
      };
    }).filter(item => item.quantity > 0);
  }, [area, typology]);

  const totalEstimation = useMemo(() => {
    return estimatedItems
      .filter(item => selectedItems.has(item.description))
      .reduce((sum, item) => sum + item.totalItemPrice, 0);
  }, [estimatedItems, selectedItems]);

  const handleToggleItem = (description: string) => {
    const next = new Set(selectedItems);
    if (next.has(description)) {
      next.delete(description);
    } else {
      next.add(description);
    }
    setSelectedItems(next);
  };

  const handleSelectAll = () => {
    if (selectedItems.size === estimatedItems.length) {
      setSelectedItems(new Set());
    } else {
      setSelectedItems(new Set(estimatedItems.map(i => i.description)));
    }
  };

  const handleImport = () => {
    const itemsToImport = estimatedItems.filter(item => selectedItems.has(item.description));
    if (itemsToImport.length === 0) {
      toast.error('Selecciona al menos un ítem para importar');
      return;
    }
    onImport(itemsToImport);
    onClose();
    toast.success(`${itemsToImport.length} ítems importados al presupuesto`);
  };

  React.useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-6 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 text-blue-600 rounded-lg">
              <Calculator className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900">Calculadora de Estimación por Área</h2>
              <p className="text-sm text-gray-500">Estima cantidades y costos basados en m² y tipología</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-200 rounded-full transition-colors">
            <X className="w-6 h-6 text-gray-500" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-8">
          {/* Inputs */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                Área del Proyecto (m²)
                <Info className="w-4 h-4 text-gray-400" />
              </label>
              <div className="relative">
                <input
                  type="number"
                  value={area || ''}
                  onChange={(e) => setArea(Number(e.target.value))}
                  className="w-full pl-4 pr-12 py-3 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all text-lg font-medium"
                  placeholder="Ej: 150"
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 font-medium">m²</span>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-semibold text-gray-700">Tipología del Proyecto</label>
              <select
                value={typology}
                onChange={(e) => setTypology(e.target.value)}
                className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all text-lg"
              >
                {Object.keys(MARKET_DATA).map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
          </div>

          {area > 0 ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-gray-900 flex items-center gap-2">
                  Ítems Estimados
                  <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-xs font-medium">
                    {estimatedItems.length} sugeridos
                  </span>
                </h3>
                <button
                  onClick={handleSelectAll}
                  className="text-sm text-blue-600 font-medium hover:underline"
                >
                  {selectedItems.size === estimatedItems.length ? 'Deseleccionar todo' : 'Seleccionar todo'}
                </button>
              </div>

              <div className="border border-gray-100 rounded-xl overflow-hidden divide-y divide-gray-100">
                {estimatedItems.map((item) => (
                  <div
                    key={item.description}
                    onClick={() => handleToggleItem(item.description)}
                    className={cn(
                      "p-4 flex items-center gap-4 cursor-pointer transition-colors group",
                      selectedItems.has(item.description) ? "bg-blue-50/50" : "hover:bg-gray-50"
                    )}
                  >
                    <div className={cn(
                      "w-6 h-6 rounded border-2 flex items-center justify-center transition-all",
                      selectedItems.has(item.description) 
                        ? "bg-blue-600 border-blue-600 text-white" 
                        : "border-gray-200 group-hover:border-blue-400"
                    )}>
                      {selectedItems.has(item.description) && <Check className="w-4 h-4" />}
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-gray-900 truncate">{item.description}</p>
                      <div className="flex items-center gap-3 text-xs text-gray-500 mt-1">
                        <span className="bg-gray-100 px-1.5 py-0.5 rounded">Factor: {AREA_FACTORS[typology]?.[item.description] || 0}</span>
                        <span>Cant. Est: <span className="font-bold text-gray-700">{item.quantity} {item.unit}</span></span>
                      </div>
                    </div>

                    <div className="text-right">
                      <p className="text-sm font-bold text-gray-900">{formatCurrency(item.totalItemPrice)}</p>
                      <p className="text-[10px] text-gray-400">P.U: {formatCurrency(item.totalUnitPrice)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="py-12 flex flex-col items-center justify-center text-center space-y-4 bg-gray-50 rounded-2xl border-2 border-dashed border-gray-200">
              <div className="p-4 bg-white rounded-full shadow-sm">
                <Calculator className="w-12 h-12 text-gray-300" />
              </div>
              <div className="max-w-xs">
                <p className="text-gray-900 font-bold">Ingresa el área para comenzar</p>
                <p className="text-sm text-gray-500">Calcularemos automáticamente los ítems y cantidades necesarias para tu proyecto.</p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-gray-100 bg-gray-50/50 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="text-center sm:text-left">
            <p className="text-sm text-gray-500">Total Estimado Seleccionado</p>
            <p className="text-2xl font-black text-blue-600">{formatCurrency(totalEstimation)}</p>
          </div>
          
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <button
              onClick={onClose}
              className="flex-1 sm:flex-none px-6 py-3 text-gray-700 font-bold hover:bg-gray-200 rounded-xl transition-all"
            >
              Cancelar
            </button>
            <button
              onClick={handleImport}
              disabled={selectedItems.size === 0}
              className="flex-1 sm:flex-none px-8 py-3 bg-blue-600 text-white font-bold rounded-xl shadow-lg shadow-blue-200 hover:bg-blue-700 disabled:opacity-50 disabled:shadow-none transition-all flex items-center justify-center gap-2"
            >
              <Plus className="w-5 h-5" />
              Importar {selectedItems.size} ítems
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
