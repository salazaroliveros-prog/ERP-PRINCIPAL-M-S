import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { 
  Users, 
  UserPlus, 
  Clock, 
  CreditCard, 
  Calendar,
  Search,
  Filter,
  MoreVertical,
  ChevronRight,
  ChevronLeft,
  TrendingUp,
  Briefcase,
  Award,
  X,
  Plus,
  Sparkles,
  Loader2,
  Edit2,
  Trash2
} from 'lucide-react';
import { GoogleGenAI, Type } from "@google/genai";
import { motion, AnimatePresence } from 'motion/react';
import { cn, formatCurrency, handleFirestoreError, OperationType } from '../lib/utils';
import { toast } from 'sonner';
import ConfirmModal from './ConfirmModal';
import { logAction } from '../lib/audit';
import { createAttendance, createEmployee, deleteEmployee, listEmployees, updateEmployee } from '../lib/hrApi';

export default function HR() {
  const [employees, setEmployees] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(5);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editingEmployeeId, setEditingEmployeeId] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [employeeToDelete, setEmployeeToDelete] = useState<string | null>(null);
  const [isAttendanceModalOpen, setIsAttendanceModalOpen] = useState(false);
  const [isPayrollModalOpen, setIsPayrollModalOpen] = useState(false);
  const [isSeeding, setIsSeeding] = useState(false);
  const [attendanceRecord, setAttendanceRecord] = useState({
    employeeId: '',
    type: 'Entry',
    timestamp: new Date().toISOString().slice(0, 16)
  });
  
  const [newEmployee, setNewEmployee] = useState({
    name: '',
    role: '',
    department: 'Operaciones',
    salary: '',
    status: 'Active',
    joinDate: new Date().toISOString().split('T')[0]
  });

  const loadEmployees = useCallback(async () => {
    try {
      const items = await listEmployees();
      setEmployees(items);
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, 'employees');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadEmployees();
  }, [loadEmployees]);

  const filteredEmployees = useMemo(() => {
    return employees.filter(emp => 
      emp.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      emp.role.toLowerCase().includes(searchTerm.toLowerCase()) ||
      emp.department.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [employees, searchTerm]);

  const totalPages = Math.ceil(filteredEmployees.length / itemsPerPage);
  const paginatedEmployees = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredEmployees.slice(start, start + itemsPerPage);
  }, [filteredEmployees, currentPage, itemsPerPage]);

  const handleAddEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      if (isEditMode && editingEmployeeId) {
        await updateEmployee(editingEmployeeId, {
          ...newEmployee,
          salary: Number(newEmployee.salary),
        });
        toast.success('Empleado actualizado exitosamente');
        await logAction('Edición de Empleado', 'RRHH', `Empleado ${newEmployee.name} actualizado`, 'update', { employeeId: editingEmployeeId });
      } else {
        const created = await createEmployee({
          ...newEmployee,
          salary: Number(newEmployee.salary),
        });
        toast.success('Empleado registrado exitosamente');
        await logAction('Registro de Empleado', 'RRHH', `Nuevo empleado ${newEmployee.name} registrado`, 'create', { employeeId: created.id });
      }

      await loadEmployees();
      
      setIsModalOpen(false);
      resetForm();
    } catch (error) {
      handleFirestoreError(error, isEditMode ? OperationType.UPDATE : OperationType.WRITE, 'employees');
    }
  };

  const resetForm = () => {
    setNewEmployee({
      name: '',
      role: '',
      department: 'Operaciones',
      salary: '',
      status: 'Active',
      joinDate: new Date().toISOString().split('T')[0]
    });
    setIsEditMode(false);
    setEditingEmployeeId(null);
  };

  const handleEdit = (emp: any) => {
    setNewEmployee({
      name: emp.name,
      role: emp.role,
      department: emp.department,
      salary: emp.salary.toString(),
      status: emp.status,
      joinDate: emp.joinDate
    });
    setEditingEmployeeId(emp.id);
    setIsEditMode(true);
    setIsModalOpen(true);
  };

  const handleDelete = (id: string) => {
    setEmployeeToDelete(id);
    setIsDeleteConfirmOpen(true);
  };

  const confirmDelete = async () => {
    if (!employeeToDelete) return;
    try {
      const emp = employees.find(e => e.id === employeeToDelete);
      await deleteEmployee(employeeToDelete);
      toast.success('Empleado eliminado');
      await logAction('Eliminación de Empleado', 'RRHH', `Empleado ${emp?.name} eliminado`, 'delete', { employeeId: employeeToDelete });
      await loadEmployees();
      setIsDeleteConfirmOpen(false);
      setEmployeeToDelete(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, 'employees');
    }
  };

  const handleAISuggestions = async () => {
    if (!newEmployee.role) {
      toast.error('Por favor ingrese un cargo antes de sugerir');
      return;
    }

    setIsGenerating(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `Como experto en recursos humanos para empresas de construcción, sugiere un salario mensual competitivo en dólares para el cargo de "${newEmployee.role}" en el departamento de "${newEmployee.department}". Proporciona la respuesta en español.`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              suggestedSalary: {
                type: Type.NUMBER,
                description: "Salario mensual sugerido."
              }
            },
            required: ["suggestedSalary"]
          }
        }
      });

      const suggestions = JSON.parse(response.text);
      toast.success('Sugerencia generada con éxito');
      if (suggestions.suggestedSalary) {
        setNewEmployee(prev => ({ ...prev, salary: suggestions.suggestedSalary.toString() }));
      }
    } catch (error) {
      console.error('Error generating AI suggestions:', error);
      toast.error('Error al generar sugerencias con IA');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleAttendanceSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const emp = employees.find(e => e.id === attendanceRecord.employeeId);
      await createAttendance({
        ...attendanceRecord,
        employeeName: emp?.name,
      });
      toast.success(`Asistencia (${attendanceRecord.type}) registrada para ${emp?.name}`);
      await logAction('Registro de Asistencia', 'RRHH', `Asistencia ${attendanceRecord.type} para ${emp?.name}`, 'create', { employeeId: attendanceRecord.employeeId });
      setIsAttendanceModalOpen(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'attendance');
    }
  };

  const payrollSummary = useMemo(() => {
    const totalSalary = employees.reduce((acc, emp) => acc + (Number(emp.salary) || 0), 0);
    const byDepartment = employees.reduce((acc: any, emp) => {
      acc[emp.department] = (acc[emp.department] || 0) + (Number(emp.salary) || 0);
      return acc;
    }, {});
    return { totalSalary, byDepartment };
  }, [employees]);

  const seedEmployees = async () => {
    setIsSeeding(true);
    try {
      const sampleEmployees = [
        { name: 'Alejandro Martínez', role: 'Director de Obra', department: 'Operaciones', salary: 4500, status: 'Active', joinDate: '2023-01-15' },
        { name: 'Sofía Rodríguez', role: 'Arquitecta Senior', department: 'Diseño', salary: 3800, status: 'Active', joinDate: '2023-03-20' },
        { name: 'Carlos López', role: 'Contador', department: 'Administración', salary: 3200, status: 'Active', joinDate: '2023-05-10' },
        { name: 'Elena Gómez', role: 'Ingeniera Civil', department: 'Operaciones', salary: 4000, status: 'On Leave', joinDate: '2023-02-28' },
        { name: 'Ricardo Sánchez', role: 'Capataz', department: 'Operaciones', salary: 2800, status: 'Active', joinDate: '2023-06-15' },
        { name: 'Lucía Fernández', role: 'Diseñadora de Interiores', department: 'Diseño', salary: 3400, status: 'Active', joinDate: '2023-08-05' },
        { name: 'Miguel Ángel Torres', role: 'Gerente de Ventas', department: 'Ventas', salary: 3600, status: 'Active', joinDate: '2023-04-12' },
        { name: 'Patricia Ruiz', role: 'Asistente Administrativo', department: 'Administración', salary: 2200, status: 'Inactive', joinDate: '2023-07-20' },
      ];

      for (const emp of sampleEmployees) {
        await createEmployee({
          ...emp,
          joinDate: emp.joinDate,
        });
      }
      toast.success('Datos de ejemplo generados correctamente');
      await logAction('Generación de Datos', 'RRHH', 'Se generaron empleados de ejemplo', 'create');
      await loadEmployees();
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'employees');
    } finally {
      setIsSeeding(false);
    }
  };

  const stats = useMemo(() => {
    const total = employees.length;
    const monthlyPayroll = employees.reduce((acc, emp) => acc + (Number(emp.salary) || 0), 0);
    const onLeave = employees.filter(emp => emp.status === 'On Leave').length;
    return {
      total,
      monthlyPayroll,
      onLeave,
      activeVacancies: 5,
      newVacancies: 3
    };
  }, [employees]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-10 h-10 animate-spin text-primary" />
          <p className="text-xs font-black uppercase tracking-widest text-slate-400">Cargando Directorio...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-20">
      <ConfirmModal
        isOpen={isDeleteConfirmOpen}
        onClose={() => setIsDeleteConfirmOpen(false)}
        onConfirm={confirmDelete}
        title="Eliminar Empleado"
        message="¿Estás seguro de que deseas eliminar este empleado? Esta acción no se puede deshacer."
      />
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight">Recursos Humanos</h1>
          <p className="text-slate-500 dark:text-slate-400 font-medium">Gestión de talento, nómina y asistencia</p>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={seedEmployees}
            disabled={isSeeding}
            className="flex items-center gap-2 px-4 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-sm font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-50 transition-all shadow-sm disabled:opacity-50"
          >
            {isSeeding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles size={18} className="text-primary" />}
            Generar Demo
          </button>
          <button 
            onClick={() => setIsAttendanceModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-sm font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-50 transition-all shadow-sm"
          >
            <Clock size={18} />
            Control de Asistencia
          </button>
          <button 
            onClick={() => {
              resetForm();
              setIsModalOpen(true);
            }}
            className="flex items-center gap-2 px-4 py-2.5 bg-primary text-white rounded-xl text-sm font-bold hover:bg-primary/90 transition-all shadow-lg shadow-primary/20"
          >
            <UserPlus size={18} />
            Nuevo Empleado
          </button>
        </div>
      </div>

      <AnimatePresence>
        {isAttendanceModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl w-full max-w-md overflow-hidden border border-slate-100 dark:border-slate-800"
            >
              <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                <h3 className="text-xl font-black text-slate-900 dark:text-white">Control de Asistencia</h3>
                <button title="Cerrar modal de asistencia" aria-label="Cerrar modal de asistencia" onClick={() => setIsAttendanceModalOpen(false)} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors">
                  <X size={20} className="text-slate-500" />
                </button>
              </div>
              <form onSubmit={handleAttendanceSubmit} className="p-6 space-y-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Empleado</label>
                  <select
                    required
                    title="Seleccionar empleado"
                    aria-label="Seleccionar empleado"
                    value={attendanceRecord.employeeId}
                    onChange={(e) => setAttendanceRecord({ ...attendanceRecord, employeeId: e.target.value })}
                    className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                  >
                    <option value="">Seleccionar Empleado...</option>
                    {employees.filter(e => e.status === 'Active').map(emp => (
                      <option key={emp.id} value={emp.id}>{emp.name}</option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Tipo</label>
                    <select
                      title="Tipo de asistencia"
                      aria-label="Tipo de asistencia"
                      value={attendanceRecord.type}
                      onChange={(e) => setAttendanceRecord({ ...attendanceRecord, type: e.target.value })}
                      className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                    >
                      <option value="Entry">Entrada</option>
                      <option value="Exit">Salida</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Fecha y Hora</label>
                    <input
                      type="datetime-local"
                      title="Fecha y hora de asistencia"
                      placeholder="Selecciona la fecha y hora"
                      value={attendanceRecord.timestamp}
                      onChange={(e) => setAttendanceRecord({ ...attendanceRecord, timestamp: e.target.value })}
                      className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                    />
                  </div>
                </div>
                <button type="submit" className="w-full py-4 bg-primary text-white rounded-2xl font-black uppercase tracking-widest shadow-lg shadow-primary/20 hover:bg-primary/90 transition-all mt-4">
                  Registrar Asistencia
                </button>
              </form>
            </motion.div>
          </div>
        )}

        {isPayrollModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden border border-slate-100 dark:border-slate-800"
            >
              <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                <h3 className="text-xl font-black text-slate-900 dark:text-white">Detalle de Nómina Estimada</h3>
                <button title="Cerrar detalle de nomina" aria-label="Cerrar detalle de nomina" onClick={() => setIsPayrollModalOpen(false)} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors">
                  <X size={20} className="text-slate-500" />
                </button>
              </div>
              <div className="p-6 space-y-6">
                <div className="bg-slate-50 dark:bg-slate-800 p-4 rounded-2xl border border-slate-100 dark:border-slate-700">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Total Mensual</p>
                  <p className="text-3xl font-black text-primary">{formatCurrency(payrollSummary.totalSalary)}</p>
                </div>
                <div className="space-y-3">
                  <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Desglose por Departamento</h4>
                  {Object.entries(payrollSummary.byDepartment).map(([dept, amount]: [string, any]) => (
                    <div key={dept} className="flex items-center justify-between p-3 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-xl">
                      <span className="text-sm font-bold text-slate-700 dark:text-slate-300">{dept}</span>
                      <span className="text-sm font-black text-slate-900 dark:text-white">{formatCurrency(amount)}</span>
                    </div>
                  ))}
                </div>
                <div className="p-4 bg-blue-50 dark:bg-blue-500/10 rounded-2xl border border-blue-100 dark:border-blue-500/20">
                  <p className="text-xs text-blue-700 dark:text-blue-400 font-medium">
                    * Este es un cálculo estimado basado en los salarios actuales de los empleados activos.
                  </p>
                </div>
              </div>
            </motion.div>
          </div>
        )}

        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden border border-slate-100 dark:border-slate-800"
            >
              <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                <h3 className="text-xl font-black text-slate-900 dark:text-white">
                  {isEditMode ? 'Editar Empleado' : 'Nuevo Empleado'}
                </h3>
                <button title="Cerrar formulario de empleado" aria-label="Cerrar formulario de empleado" onClick={() => setIsModalOpen(false)} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors">
                  <X size={20} className="text-slate-500" />
                </button>
              </div>
              <form onSubmit={handleAddEmployee} className="p-6 space-y-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Nombre Completo</label>
                  <input
                    required
                    type="text"
                    title="Nombre completo"
                    placeholder="Nombre del empleado"
                    value={newEmployee.name}
                    onChange={(e) => setNewEmployee({ ...newEmployee, name: e.target.value })}
                    className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Cargo</label>
                      <button
                        type="button"
                        onClick={handleAISuggestions}
                        disabled={isGenerating || !newEmployee.role}
                        className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-blue-600 hover:text-blue-700 disabled:opacity-50 transition-colors"
                      >
                        {isGenerating ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <Sparkles className="w-3 h-3" />
                        )}
                        Sugerir Salario
                      </button>
                    </div>
                    <input
                      required
                      type="text"
                      title="Cargo"
                      placeholder="Cargo del empleado"
                      value={newEmployee.role}
                      onChange={(e) => setNewEmployee({ ...newEmployee, role: e.target.value })}
                      className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Departamento</label>
                    <select
                      title="Departamento"
                      aria-label="Departamento"
                      value={newEmployee.department}
                      onChange={(e) => setNewEmployee({ ...newEmployee, department: e.target.value })}
                      className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                    >
                      <option value="Operaciones">Operaciones</option>
                      <option value="Diseño">Diseño</option>
                      <option value="Administración">Administración</option>
                      <option value="Ventas">Ventas</option>
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Salario Mensual</label>
                      <button
                        type="button"
                        onClick={handleAISuggestions}
                        disabled={isGenerating}
                        className="text-[9px] font-black text-primary uppercase tracking-widest hover:underline disabled:opacity-50 flex items-center gap-1"
                      >
                        {isGenerating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                        Sugerir con IA
                      </button>
                    </div>
                    <input
                      required
                      type="number"
                      title="Salario mensual"
                      placeholder="Salario mensual"
                      value={newEmployee.salary}
                      onChange={(e) => setNewEmployee({ ...newEmployee, salary: e.target.value })}
                      className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Fecha de Ingreso</label>
                    <input
                      required
                      type="date"
                      title="Fecha de ingreso"
                      placeholder="Fecha de ingreso"
                      value={newEmployee.joinDate}
                      onChange={(e) => setNewEmployee({ ...newEmployee, joinDate: e.target.value })}
                      className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Estado</label>
                  <select
                    title="Estado del empleado"
                    aria-label="Estado del empleado"
                    value={newEmployee.status}
                    onChange={(e) => setNewEmployee({ ...newEmployee, status: e.target.value })}
                    className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                  >
                    <option value="Active">Activo</option>
                    <option value="On Leave">Licencia</option>
                    <option value="Inactive">Inactivo</option>
                  </select>
                </div>
                <button type="submit" className="w-full py-4 bg-primary text-white rounded-2xl font-black uppercase tracking-widest shadow-lg shadow-primary/20 hover:bg-primary/90 transition-all mt-4">
                  {isEditMode ? 'Guardar Cambios' : 'Registrar Empleado'}
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {[
          { label: 'Total Empleados', value: stats.total.toString(), icon: Users, color: 'bg-blue-500' },
          { label: 'Nómina Mensual', value: formatCurrency(stats.monthlyPayroll), icon: CreditCard, color: 'bg-emerald-500' },
          { label: 'Vacantes Activas', value: stats.activeVacancies.toString(), icon: Briefcase, color: 'bg-amber-500' },
          { label: 'Nuevas Vacantes', value: stats.newVacancies.toString(), icon: Sparkles, color: 'bg-purple-500' },
        ].map((stat, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            className="p-4 sm:p-6 bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm"
          >
            <div className="flex items-center justify-between mb-3 sm:mb-4">
              <div className={cn("p-2 sm:p-3 rounded-xl text-white shadow-lg", stat.color)}>
                <stat.icon size={16} className="sm:w-5 sm:h-5" />
              </div>
              <TrendingUp size={14} className="text-emerald-500 sm:w-4 sm:h-4" />
            </div>
            <p className="text-[9px] sm:text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">{stat.label}</p>
            <p className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white">{stat.value}</p>
          </motion.div>
        ))}
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Employee List */}
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm overflow-hidden">
            <div className="p-4 sm:p-6 border-b border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <h3 className="font-black text-[10px] sm:text-xs uppercase tracking-widest text-slate-900 dark:text-white">Directorio de Personal</h3>
              <div className="relative w-full sm:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 sm:w-4 sm:h-4" size={14} />
                <input
                  type="text"
                  placeholder="Buscar empleado..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                />
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50/50 dark:bg-slate-800/50">
                    <th className="px-4 sm:px-6 py-3 sm:py-4 text-[9px] sm:text-[10px] font-black text-slate-400 uppercase tracking-widest">Empleado</th>
                    <th className="px-4 sm:px-6 py-3 sm:py-4 text-[9px] sm:text-[10px] font-black text-slate-400 uppercase tracking-widest">Cargo / Depto</th>
                    <th className="px-4 sm:px-6 py-3 sm:py-4 text-[9px] sm:text-[10px] font-black text-slate-400 uppercase tracking-widest">Estado</th>
                    <th className="px-4 sm:px-6 py-3 sm:py-4 text-[9px] sm:text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Salario</th>
                    <th className="px-4 sm:px-6 py-3 sm:py-4 text-[9px] sm:text-[10px] font-black text-slate-400 uppercase tracking-widest"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {paginatedEmployees.length > 0 ? (
                    paginatedEmployees.map((emp) => (
                      <tr key={emp.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors group">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary font-black">
                              {emp.name.charAt(0)}
                            </div>
                            <div>
                              <p className="text-sm font-bold text-slate-900 dark:text-white">{emp.name}</p>
                              <p className="text-[10px] text-slate-400 font-medium tracking-tighter">Ingreso: {emp.joinDate}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <p className="text-sm font-bold text-slate-700 dark:text-slate-300">{emp.role}</p>
                          <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest">{emp.department}</p>
                        </td>
                        <td className="px-6 py-4">
                          <span className={cn(
                            "px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-tighter",
                            emp.status === 'Active' ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400" : 
                            emp.status === 'On Leave' ? "bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400" :
                            "bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-400"
                          )}>
                            {emp.status === 'Active' ? 'Activo' : 
                             emp.status === 'On Leave' ? 'Licencia' : 'Inactivo'}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right font-bold text-slate-900 dark:text-white">
                          {formatCurrency(emp.salary)}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button 
                              title={`Editar ${emp.name}`}
                              aria-label={`Editar ${emp.name}`}
                              onClick={() => handleEdit(emp)}
                              className="p-2 text-slate-400 hover:text-primary transition-colors"
                            >
                              <Edit2 size={16} />
                            </button>
                            <button 
                              title={`Eliminar ${emp.name}`}
                              aria-label={`Eliminar ${emp.name}`}
                              onClick={() => handleDelete(emp.id)}
                              className="p-2 text-slate-400 hover:text-rose-600 transition-colors"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={5} className="px-6 py-12 text-center">
                        <div className="flex flex-col items-center gap-2">
                          <Users size={32} className="text-slate-200 dark:text-slate-700" />
                          <p className="text-sm font-bold text-slate-500 dark:text-slate-400">No se encontraron empleados</p>
                          <p className="text-[10px] text-slate-400 uppercase tracking-widest">Intenta con otro término de búsqueda o registra uno nuevo</p>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-6 py-4 border-t border-slate-100 dark:border-slate-800">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                  Mostrando {paginatedEmployees.length} de {filteredEmployees.length} empleados
                </p>
                <div className="flex items-center gap-2">
                  <button 
                    title="Pagina anterior"
                    aria-label="Pagina anterior"
                    disabled={currentPage === 1}
                    onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                    className="p-1.5 bg-slate-50 dark:bg-slate-800 rounded-lg text-slate-400 hover:text-primary transition-colors disabled:opacity-50"
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <div className="flex items-center gap-1">
                    {Array.from({ length: totalPages }, (_, i) => (
                      <button
                        key={i + 1}
                        title={`Ir a la pagina ${i + 1}`}
                        aria-label={`Ir a la pagina ${i + 1}`}
                        onClick={() => setCurrentPage(i + 1)}
                        className={cn(
                          "w-7 h-7 rounded-lg text-[10px] font-black transition-all",
                          currentPage === i + 1 
                            ? "bg-primary text-white shadow-lg shadow-primary/20" 
                            : "bg-slate-50 dark:bg-slate-800 text-slate-400 hover:text-slate-600"
                        )}
                      >
                        {i + 1}
                      </button>
                    ))}
                  </div>
                  <button 
                    title="Pagina siguiente"
                    aria-label="Pagina siguiente"
                    disabled={currentPage === totalPages}
                    onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                    className="p-1.5 bg-slate-50 dark:bg-slate-800 rounded-lg text-slate-400 hover:text-primary transition-colors disabled:opacity-50"
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Sidebar Widgets */}
        <div className="space-y-6">
          {/* Upcoming Birthdays / Anniversaries */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm p-6">
            <h3 className="font-black text-xs uppercase tracking-widest text-slate-900 dark:text-white mb-6 flex items-center gap-2">
              <Award size={16} className="text-amber-500" />
              Próximos Eventos
            </h3>
            <div className="space-y-4">
              {[
                { name: 'María García', event: 'Aniversario (2 años)', date: 'Mañana' },
                { name: 'Juan Pérez', event: 'Cumpleaños', date: 'En 3 días' },
              ].map((event, i) => (
                <div key={i} className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-100 dark:border-slate-800/50">
                  <div>
                    <p className="text-xs font-bold text-slate-900 dark:text-white">{event.name}</p>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400">{event.event}</p>
                  </div>
                  <span className="text-[9px] font-black text-primary uppercase tracking-tighter">{event.date}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Payroll Summary */}
          <div className="bg-primary rounded-2xl p-6 text-white shadow-xl shadow-primary/20 relative overflow-hidden">
            <div className="relative z-10">
              <h3 className="font-black text-xs uppercase tracking-widest opacity-80 mb-4">Próxima Nómina</h3>
              <div className="flex items-end justify-between mb-6">
                <div>
                  <p className="text-3xl font-black">15 Abr</p>
                  <p className="text-[10px] uppercase font-bold opacity-70 tracking-widest">Fecha de Pago</p>
                </div>
                <div className="text-right">
                  <p className="text-xl font-black">{formatCurrency(62700)}</p>
                  <p className="text-[10px] uppercase font-bold opacity-70 tracking-widest">Total Estimado</p>
                </div>
              </div>
              <button 
                onClick={() => setIsPayrollModalOpen(true)}
                className="w-full py-3 bg-white/20 hover:bg-white/30 backdrop-blur-md rounded-xl text-xs font-black uppercase tracking-widest transition-all"
              >
                Ver Detalles
              </button>
            </div>
            <div className="absolute -right-4 -bottom-4 opacity-10">
              <CreditCard size={120} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
