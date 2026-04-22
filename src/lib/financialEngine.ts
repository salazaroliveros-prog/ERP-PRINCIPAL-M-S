// src/lib/financialEngine.ts
// Motor centralizado para cálculos financieros del ERP

export interface BudgetItem {
  id: string;
  materialCost: number;
  laborCost: number;
  indirectCost: number;
  quantity: number;
  progress: number;
  isLocked?: boolean;
}

/**
 * Calcula el costo total planificado de un ítem
 */
export const calculateTotalPlanned = (item: BudgetItem): number => {
  return (item.materialCost + item.laborCost + item.indirectCost) * (item.quantity || 1);
};

/**
 * Calcula el gasto actual basado en el progreso
 */
export const calculateCurrentSpent = (item: BudgetItem): number => {
  const totalPlanned = calculateTotalPlanned(item);
  return totalPlanned * (item.progress / 100);
};

/**
 * Determina el estado de salud financiera de un renglón
 * @returns 'healthy' | 'warning' | 'critical'
 */
export const getBudgetHealthStatus = (item: BudgetItem, actualExpenses: number): 'healthy' | 'warning' | 'critical' => {
  const totalPlanned = calculateTotalPlanned(item);
  if (actualExpenses <= totalPlanned) return 'healthy';
  
  const variance = ((actualExpenses - totalPlanned) / totalPlanned) * 100;
  if (variance <= 10) return 'warning';
  return 'critical';
};

/**
 * Valida si un ítem puede ser editado
 */
export const canEditBudgetItem = (item: BudgetItem, isAdmin: boolean): boolean => {
  if (item.isLocked && !isAdmin) return false;
  return true;
};
