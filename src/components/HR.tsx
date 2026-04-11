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
  Trash2,
  FileSignature,
  Send,
  CheckCircle2
} from 'lucide-react';
import { GoogleGenAI, Type } from "@google/genai";
import { motion, AnimatePresence } from 'motion/react';
import { cn, formatCurrency, handleApiError, OperationType } from '../lib/utils';
import { toast } from 'sonner';
import ConfirmModal from './ConfirmModal';
import { logAction } from '../lib/audit';
import jsPDF from 'jspdf';
import SignaturePad from './SignaturePad';
import {
  AttendanceRecord,
  createAttendance,
  createEmployee,
  deleteAttendance,
  createEmploymentContract,
  createVacancy,
  deleteEmployee,
  deleteEmploymentContract,
  deleteVacancy,
  EmploymentContractRecord,
  listAttendance,
  listEmployees,
  listEmploymentContracts,
  listVacancies,
  updateAttendance,
  updateEmployee,
  updateEmploymentContract,
  updateVacancy,
  VacancyRecord,
} from '../lib/hrApi';
import { drawLogo } from '../lib/pdfUtils';

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
  const [attendanceItems, setAttendanceItems] = useState<AttendanceRecord[]>([]);
  const [editingAttendanceId, setEditingAttendanceId] = useState<string | null>(null);
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

  const [vacancies, setVacancies] = useState<VacancyRecord[]>([]);
  const [contracts, setContracts] = useState<EmploymentContractRecord[]>([]);
  const [vacancyForm, setVacancyForm] = useState({
    id: '',
    title: '',
    department: 'Operaciones',
    openings: '1',
    status: 'Open' as 'Open' | 'Closed',
    notes: '',
  });
  const [contractForm, setContractForm] = useState({
    employeeId: '',
    startDate: new Date().toISOString().slice(0, 10),
    contractType: 'Tiempo indefinido',
    companyName: 'WM_M&S Constructora',
    ownerName: '',
    ownerTitle: 'Representante Legal',
    notes: '',
  });
  const [isSigningOwner, setIsSigningOwner] = useState(false);
  const [ownerSignature, setOwnerSignature] = useState('');
  const [selectedContractId, setSelectedContractId] = useState('');
  const [isContractViewerOpen, setIsContractViewerOpen] = useState(false);
  const [contractViewerUrl, setContractViewerUrl] = useState('');
  const [contractViewerName, setContractViewerName] = useState('');
  const [contractViewerIsObjectUrl, setContractViewerIsObjectUrl] = useState(false);

  const loadEmployees = useCallback(async () => {
    try {
      const items = await listEmployees();
      setEmployees(items);
    } catch (error) {
      handleApiError(error, OperationType.GET, 'employees');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadVacanciesAndContracts = useCallback(async () => {
    try {
      const [vacancyItems, contractItems] = await Promise.all([listVacancies(), listEmploymentContracts()]);
      setVacancies(vacancyItems);
      setContracts(contractItems);
    } catch (error) {
      handleApiError(error, OperationType.GET, 'rrhh');
    }
  }, []);

  const loadAttendance = useCallback(async () => {
    try {
      const response = await listAttendance({ limit: 20, offset: 0 });
      setAttendanceItems(response.items);
    } catch (error) {
      handleApiError(error, OperationType.GET, 'attendance');
    }
  }, []);

  useEffect(() => {
    loadEmployees();
  }, [loadEmployees]);

  useEffect(() => {
    loadVacanciesAndContracts();
  }, [loadVacanciesAndContracts]);

  useEffect(() => {
    loadAttendance();
  }, [loadAttendance]);

  const handleSubmitVacancy = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      if (vacancyForm.id) {
        await updateVacancy(vacancyForm.id, {
          title: vacancyForm.title,
          department: vacancyForm.department,
          openings: Number(vacancyForm.openings || 1),
          status: vacancyForm.status,
          notes: vacancyForm.notes,
        });
        toast.success('Vacante actualizada');
      } else {
        await createVacancy({
          title: vacancyForm.title,
          department: vacancyForm.department,
          openings: Number(vacancyForm.openings || 1),
          status: vacancyForm.status,
          notes: vacancyForm.notes,
        });
        toast.success('Vacante creada');
      }

      setVacancyForm({
        id: '',
        title: '',
        department: 'Operaciones',
        openings: '1',
        status: 'Open',
        notes: '',
      });
      await loadVacanciesAndContracts();
    } catch (error) {
      handleApiError(error, vacancyForm.id ? OperationType.UPDATE : OperationType.WRITE, 'vacancies');
    }
  };

  const handleCreateContract = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!contractForm.employeeId) {
      toast.error('Selecciona un empleado para crear el contrato');
      return;
    }

    try {
      const contract = await createEmploymentContract(contractForm);
      await logAction('Creación de Contrato', 'RRHH', `Contrato creado para ${contract.employeeName}`, 'create', {
        contractId: contract.id,
      });
      toast.success('Contrato creado. Puedes enviarlo para firma móvil.');
      setContractForm((prev) => ({ ...prev, employeeId: '', notes: '' }));
      await loadVacanciesAndContracts();
    } catch (error) {
      handleApiError(error, OperationType.WRITE, 'contracts');
    }
  };

  const handleSendForMobileSignature = async (contract: EmploymentContractRecord) => {
    try {
      await updateEmploymentContract(contract.id, {
        status: 'sent',
        sentAt: new Date().toISOString(),
      } as any);
      const url = `${window.location.origin}${window.location.pathname}#/hr/contract-sign/${contract.shareToken}`;
      await navigator.clipboard.writeText(url);
      toast.success('Enlace copiado. Envíalo al trabajador para firmar desde su móvil.');
      await loadVacanciesAndContracts();
    } catch (error) {
      handleApiError(error, OperationType.UPDATE, 'contracts');
    }
  };

  const buildContractPdf = (contract: EmploymentContractRecord, ownerSignDataUrl: string) => {
    const doc = new jsPDF({ unit: 'pt', format: 'a4' });
    const pageWidth = doc.internal.pageSize.getWidth();
    const left = 50;
    const right = pageWidth - 50;
    const contentWidth = right - left;
    let y = 58;

    const addParagraph = (text: string, spacing = 16, indent = 0) => {
      const lines = doc.splitTextToSize(text, contentWidth - indent);
      doc.text(lines, left + indent, y);
      y += lines.length * spacing;
    };

    const ensureSpace = (required = 110) => {
      const pageHeight = doc.internal.pageSize.getHeight();
      if (y + required <= pageHeight - 70) return;
      doc.addPage();
      y = 58;
    };

    drawLogo(doc, left, 18, 1.2);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(30, 41, 59);
    doc.text('WM_M&S CONSTRUCTORA', left + 66, 32);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(71, 85, 105);
    doc.text(`Documento generado: ${new Date().toLocaleDateString('es-GT')}`, right, 32, { align: 'right' });

    y = 84;
    doc.setDrawColor(203, 213, 225);
    doc.line(left, y - 14, right, y - 14);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(15);
    doc.setTextColor(0, 0, 0);
    doc.text('CONTRATO INDIVIDUAL DE TRABAJO', pageWidth / 2, y, { align: 'center' });

    y += 20;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(30, 41, 59);
    addParagraph(
      'En cumplimiento de la normativa laboral vigente en la Republica de Guatemala, comparecen por una parte WM_M&S Constructora, en calidad de Empleador, y por la otra el Trabajador identificado en este instrumento, quienes acuerdan celebrar el presente contrato individual de trabajo.',
      15
    );

    y += 6;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(15, 23, 42);
    doc.text('I. DATOS DE LAS PARTES', left, y);

    y += 18;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(30, 41, 59);
    addParagraph(`Empleador: ${contract.companyName}`);
    addParagraph(`Representante legal: ${contract.ownerName} (${contract.ownerTitle})`);
    addParagraph(`Trabajador: ${contract.employeeName}`);
    addParagraph(`Puesto y departamento: ${contract.employeeRole} - ${contract.employeeDepartment}`);
    addParagraph(`Tipo de contrato: ${contract.contractType}`);
    addParagraph(`Fecha de inicio de labores: ${contract.startDate}`);
    addParagraph(`Salario mensual pactado: ${formatCurrency(contract.salary)}`);

    ensureSpace(220);
    y += 6;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(15, 23, 42);
    doc.text('II. CLAUSULAS CONTRACTUALES', left, y);

    y += 18;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(30, 41, 59);
    addParagraph('1. Objeto del contrato: El trabajador se obliga a prestar sus servicios personales y subordinados en favor del empleador, con diligencia, buena fe y apego a los lineamientos operativos de la empresa.');
    addParagraph('2. Jornada y disciplina: La jornada, descansos, medidas de seguridad industrial y lineamientos disciplinarios se regiran por el reglamento interno de trabajo y la legislacion laboral aplicable.');
    addParagraph('3. Remuneracion: El empleador pagara al trabajador el salario pactado en forma mensual, en la fecha establecida por la empresa, con los descuentos y prestaciones de ley que correspondan.');
    addParagraph('4. Confidencialidad: El trabajador se compromete a resguardar la informacion tecnica, operativa y administrativa a la que tenga acceso durante la relacion laboral.');
    addParagraph('5. Terminacion: Cualquier terminacion del presente contrato se tramitara de conformidad con las causales y procedimientos establecidos por la normativa vigente.');
    addParagraph('6. Aceptacion: Leido el presente documento, ambas partes manifiestan su conformidad y se obligan a su cumplimiento en todos sus extremos.');

    ensureSpace(170);
    y += 12;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(15, 23, 42);
    doc.text('III. FIRMAS', left, y);

    y += 20;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(51, 65, 85);
    doc.text('Firma del trabajador', left, y);
    doc.text('Firma del empleador', 330, y);

    y += 10;
    if (contract.workerSignatureDataUrl) {
      doc.addImage(contract.workerSignatureDataUrl, 'PNG', left, y, 180, 60);
    }
    doc.addImage(ownerSignDataUrl, 'PNG', 330, y, 180, 60);

    y += 76;
    doc.setDrawColor(148, 163, 184);
    doc.line(left, y, left + 220, y);
    doc.line(330, y, 550, y);

    y += 14;
    doc.setFontSize(9);
    doc.setTextColor(100, 116, 139);
    doc.text(contract.employeeName, left, y);
    doc.text(contract.ownerName || 'Representante legal', 330, y);

    return doc;
  };

  const handleFinalizeContract = async () => {
    const contract = contracts.find((item) => item.id === selectedContractId);
    if (!contract) {
      toast.error('Selecciona un contrato para finalizar');
      return;
    }
    if (!contract.workerSignatureDataUrl) {
      toast.error('El trabajador aun no firma este contrato');
      return;
    }
    if (!ownerSignature) {
      toast.error('Debes capturar la firma del empleador');
      return;
    }

    try {
      const pdf = buildContractPdf(contract, ownerSignature);
      const blob = pdf.output('blob');
      const fileName = `contrato-${contract.employeeName.replace(/\s+/g, '-').toLowerCase()}-${contract.id}.pdf`;
      const fileUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          if (typeof reader.result === 'string') {
            resolve(reader.result);
            return;
          }
          reject(new Error('No se pudo convertir el PDF para archivado persistente'));
        };
        reader.onerror = () => reject(reader.error || new Error('No se pudo leer el PDF generado'));
        reader.readAsDataURL(blob);
      });

      await updateEmploymentContract(contract.id, {
        ownerSignatureDataUrl: ownerSignature,
        ownerSignedAt: new Date().toISOString(),
        status: 'completed',
        signedFileUrl: fileUrl,
        signedFileName: fileName,
      } as any);

      await logAction('Contrato firmado', 'RRHH', `Contrato firmado y archivado de ${contract.employeeName}`, 'update', {
        contractId: contract.id,
      });

      toast.success('Contrato formal firmado y archivado automaticamente en Documentos > Legal.');
      setIsSigningOwner(false);
      setSelectedContractId('');
      setOwnerSignature('');
      await loadVacanciesAndContracts();
    } catch (error) {
      handleApiError(error, OperationType.UPDATE, 'contracts');
    }
  };

  const handleOpenContractViewer = async (fileUrl: string, fileName: string) => {
    if (!fileUrl) {
      toast.error('No hay documento disponible para visualizar');
      return;
    }

    try {
      if (fileUrl.startsWith('data:')) {
        const response = await fetch(fileUrl);
        const blob = await response.blob();
        const objectUrl = URL.createObjectURL(blob);
        setContractViewerUrl(objectUrl);
        setContractViewerIsObjectUrl(true);
      } else {
        setContractViewerUrl(fileUrl);
        setContractViewerIsObjectUrl(false);
      }

      setContractViewerName(fileName || 'contrato-firmado.pdf');
      setIsContractViewerOpen(true);
    } catch (error) {
      console.error('Error opening contract viewer:', error);
      toast.error('No se pudo abrir el contrato');
    }
  };

  const handleCloseContractViewer = () => {
    if (contractViewerIsObjectUrl && contractViewerUrl) {
      URL.revokeObjectURL(contractViewerUrl);
    }
    setIsContractViewerOpen(false);
    setContractViewerUrl('');
    setContractViewerName('');
    setContractViewerIsObjectUrl(false);
  };

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
      handleApiError(error, isEditMode ? OperationType.UPDATE : OperationType.WRITE, 'employees');
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
      handleApiError(error, OperationType.DELETE, 'employees');
    }
  };

  const handleAISuggestions = async () => {
    if (!newEmployee.role) {
      toast.error('Por favor ingrese un cargo antes de sugerir');
      return;
    }

    setIsGenerating(true);
    try {
      const ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_GEMINI_API_KEY });
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
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

  const toLocalDateTimeInput = (value: string) => {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      return new Date().toISOString().slice(0, 16);
    }
    const timezoneOffsetMs = parsed.getTimezoneOffset() * 60 * 1000;
    return new Date(parsed.getTime() - timezoneOffsetMs).toISOString().slice(0, 16);
  };

  const resetAttendanceForm = () => {
    setEditingAttendanceId(null);
    setAttendanceRecord({
      employeeId: '',
      type: 'Entry',
      timestamp: new Date().toISOString().slice(0, 16),
    });
  };

  const handleEditAttendance = (item: AttendanceRecord) => {
    setEditingAttendanceId(item.id);
    setAttendanceRecord({
      employeeId: item.employeeId,
      type: item.type,
      timestamp: toLocalDateTimeInput(item.timestamp),
    });
    setIsAttendanceModalOpen(true);
  };

  const handleDeleteAttendance = async (item: AttendanceRecord) => {
    const confirmed = window.confirm(`¿Eliminar registro de asistencia de ${item.employeeName || 'empleado'}?`);
    if (!confirmed) return;

    try {
      await deleteAttendance(item.id);
      toast.success('Registro de asistencia eliminado');
      await logAction('Eliminación de Asistencia', 'RRHH', `Asistencia eliminada para ${item.employeeName}`, 'delete', {
        attendanceId: item.id,
        employeeId: item.employeeId,
      });
      await loadAttendance();
    } catch (error) {
      handleApiError(error, OperationType.DELETE, 'attendance');
    }
  };

  const handleDeleteContract = async (contract: EmploymentContractRecord) => {
    const confirmed = window.confirm(`¿Eliminar contrato de ${contract.employeeName}?`);
    if (!confirmed) return;

    try {
      await deleteEmploymentContract(contract.id);
      toast.success('Contrato eliminado');
      await logAction('Eliminación de Contrato', 'RRHH', `Contrato eliminado de ${contract.employeeName}`, 'delete', {
        contractId: contract.id,
      });
      await loadVacanciesAndContracts();
    } catch (error) {
      handleApiError(error, OperationType.DELETE, 'contracts');
    }
  };

  const handleAttendanceSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const emp = employees.find(e => e.id === attendanceRecord.employeeId);
      if (editingAttendanceId) {
        await updateAttendance(editingAttendanceId, {
          ...attendanceRecord,
          employeeName: emp?.name,
        });
        toast.success('Asistencia actualizada');
        await logAction('Edición de Asistencia', 'RRHH', `Asistencia ${attendanceRecord.type} actualizada para ${emp?.name}`, 'update', {
          attendanceId: editingAttendanceId,
          employeeId: attendanceRecord.employeeId,
        });
      } else {
        await createAttendance({
          ...attendanceRecord,
          employeeName: emp?.name,
        });
        toast.success(`Asistencia (${attendanceRecord.type}) registrada para ${emp?.name}`);
        await logAction('Registro de Asistencia', 'RRHH', `Asistencia ${attendanceRecord.type} para ${emp?.name}`, 'create', { employeeId: attendanceRecord.employeeId });
      }

      await loadAttendance();
      setIsAttendanceModalOpen(false);
      resetAttendanceForm();
    } catch (error) {
      handleApiError(error, editingAttendanceId ? OperationType.UPDATE : OperationType.WRITE, 'attendance');
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
      handleApiError(error, OperationType.WRITE, 'employees');
    } finally {
      setIsSeeding(false);
    }
  };

  const stats = useMemo(() => {
    const total = employees.length;
    const monthlyPayroll = employees.reduce((acc, emp) => acc + (Number(emp.salary) || 0), 0);
    const onLeave = employees.filter(emp => emp.status === 'On Leave').length;
    const activeVacancies = vacancies.filter((item) => item.status === 'Open').length;
    const newVacancies = vacancies.filter((item) => {
      const created = new Date(item.createdAt || '').getTime();
      return Number.isFinite(created) && created >= Date.now() - 1000 * 60 * 60 * 24 * 7;
    }).length;
    return {
      total,
      monthlyPayroll,
      onLeave,
      activeVacancies,
      newVacancies
    };
  }, [employees, vacancies]);

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
            onClick={() => {
              resetAttendanceForm();
              setIsAttendanceModalOpen(true);
            }}
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
                <h3 className="text-xl font-black text-slate-900 dark:text-white">
                  {editingAttendanceId ? 'Editar Asistencia' : 'Control de Asistencia'}
                </h3>
                <button
                  title="Cerrar modal de asistencia"
                  aria-label="Cerrar modal de asistencia"
                  onClick={() => {
                    setIsAttendanceModalOpen(false);
                    resetAttendanceForm();
                  }}
                  className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors"
                >
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
                  {editingAttendanceId ? 'Guardar Cambios' : 'Registrar Asistencia'}
                </button>
                {editingAttendanceId && (
                  <button
                    type="button"
                    onClick={resetAttendanceForm}
                    className="w-full py-2.5 border border-slate-300 rounded-xl text-xs font-black uppercase tracking-widest text-slate-600"
                  >
                    Cancelar Edición
                  </button>
                )}
              </form>

              <div className="px-6 pb-6">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Registros recientes</p>
                <div className="max-h-44 overflow-auto space-y-2">
                  {attendanceItems.length === 0 ? (
                    <p className="text-xs text-slate-500">No hay registros de asistencia.</p>
                  ) : (
                    attendanceItems.slice(0, 8).map((item) => (
                      <div key={item.id} className="p-2.5 rounded-xl border border-slate-200 flex items-center justify-between gap-2">
                        <div>
                          <p className="text-xs font-bold text-slate-800 dark:text-slate-100">{item.employeeName || 'Empleado'}</p>
                          <p className="text-[10px] text-slate-500">{item.type} · {new Date(item.timestamp).toLocaleString()}</p>
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            title="Editar asistencia"
                            aria-label="Editar asistencia"
                            onClick={() => handleEditAttendance(item)}
                            className="p-1.5 text-slate-500 hover:text-primary"
                          >
                            <Edit2 size={13} />
                          </button>
                          <button
                            type="button"
                            title="Eliminar asistencia"
                            aria-label="Eliminar asistencia"
                            onClick={() => void handleDeleteAttendance(item)}
                            className="p-1.5 text-slate-500 hover:text-rose-600"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
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

        {isSigningOwner && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden border border-slate-100 dark:border-slate-800"
            >
              <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                <h3 className="text-xl font-black text-slate-900 dark:text-white">Firma del Empleador</h3>
                <button
                  title="Cerrar firma"
                  aria-label="Cerrar firma"
                  onClick={() => {
                    setIsSigningOwner(false);
                    setOwnerSignature('');
                    setSelectedContractId('');
                  }}
                  className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors"
                >
                  <X size={20} className="text-slate-500" />
                </button>
              </div>

              <div className="p-6 space-y-4">
                <p className="text-sm text-slate-600 dark:text-slate-300">
                  Firma para cerrar el contrato y generar el PDF final. Al confirmar se archivara automaticamente en Documentos.
                </p>
                <SignaturePad onChange={setOwnerSignature} />
                <button
                  type="button"
                  onClick={handleFinalizeContract}
                  className="w-full py-3 rounded-xl bg-primary text-white font-black uppercase tracking-widest"
                >
                  Firmar y Guardar Contrato
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {isContractViewerOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.98, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.98, y: 10 }}
              className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl w-full max-w-5xl h-[86vh] overflow-hidden border border-slate-100 dark:border-slate-800"
            >
              <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3">
                <h3 className="text-sm sm:text-base font-black text-slate-900 dark:text-white truncate">
                  {contractViewerName || 'Contrato firmado'}
                </h3>
                <div className="flex items-center gap-2">
                  <a
                    href={contractViewerUrl}
                    download={contractViewerName || 'contrato-firmado.pdf'}
                    className="px-3 py-2 rounded-xl border border-slate-300 text-xs font-black uppercase tracking-widest text-slate-700"
                  >
                    Descargar
                  </a>
                  <button
                    title="Cerrar visor de contrato"
                    aria-label="Cerrar visor de contrato"
                    onClick={handleCloseContractViewer}
                    className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors"
                  >
                    <X size={18} className="text-slate-500" />
                  </button>
                </div>
              </div>

              <div className="h-[calc(86vh-70px)] bg-slate-100 dark:bg-slate-950">
                <iframe
                  title="Visor de contrato firmado"
                  src={contractViewerUrl}
                  className="w-full h-full"
                />
              </div>
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
            className="p-4 sm:p-6 bg-white dark:bg-slate-900 glass-card rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm"
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
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 min-w-0">
        {/* Employee List */}
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm overflow-hidden min-w-0">
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
            <div className="overflow-x-auto lg:overflow-x-hidden">
              <table className="w-full text-left border-collapse table-fixed">
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

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm p-6 space-y-5">
          <div className="flex items-center justify-between">
            <h3 className="font-black text-xs uppercase tracking-widest text-slate-900 dark:text-white">Vacantes</h3>
            <button
              type="button"
              onClick={() =>
                setVacancyForm({
                  id: '',
                  title: '',
                  department: 'Operaciones',
                  openings: '1',
                  status: 'Open',
                  notes: '',
                })
              }
              className="text-xs font-bold text-primary"
            >
              Nueva
            </button>
          </div>

          <form onSubmit={handleSubmitVacancy} className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <input
              required
              type="text"
              placeholder="Cargo de vacante"
              value={vacancyForm.title}
              onChange={(e) => setVacancyForm((prev) => ({ ...prev, title: e.target.value }))}
              className="px-4 py-2.5 rounded-xl border border-slate-300 text-sm"
            />
            <input
              required
              type="text"
              placeholder="Departamento"
              value={vacancyForm.department}
              onChange={(e) => setVacancyForm((prev) => ({ ...prev, department: e.target.value }))}
              className="px-4 py-2.5 rounded-xl border border-slate-300 text-sm"
            />
            <input
              required
              type="number"
              min={1}
              placeholder="Plazas"
              value={vacancyForm.openings}
              onChange={(e) => setVacancyForm((prev) => ({ ...prev, openings: e.target.value }))}
              className="px-4 py-2.5 rounded-xl border border-slate-300 text-sm"
            />
            <select
              value={vacancyForm.status}
              onChange={(e) =>
                setVacancyForm((prev) => ({ ...prev, status: e.target.value as 'Open' | 'Closed' }))
              }
              className="px-4 py-2.5 rounded-xl border border-slate-300 text-sm"
            >
              <option value="Open">Abierta</option>
              <option value="Closed">Cerrada</option>
            </select>
            <textarea
              placeholder="Notas"
              value={vacancyForm.notes}
              onChange={(e) => setVacancyForm((prev) => ({ ...prev, notes: e.target.value }))}
              className="md:col-span-2 px-4 py-2.5 rounded-xl border border-slate-300 text-sm"
              rows={2}
            />
            <button className="md:col-span-2 py-2.5 rounded-xl bg-primary text-white text-xs font-black uppercase tracking-widest">
              {vacancyForm.id ? 'Actualizar Vacante' : 'Guardar Vacante'}
            </button>
          </form>

          <div className="space-y-2">
            {vacancies.length === 0 ? (
              <p className="text-xs text-slate-500">No hay vacantes registradas.</p>
            ) : (
              vacancies.map((vacancy) => (
                <div key={vacancy.id} className="p-3 rounded-xl border border-slate-200 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-bold text-slate-900 dark:text-white">{vacancy.title}</p>
                    <p className="text-[11px] text-slate-500">
                      {vacancy.department} · {vacancy.openings} plaza(s) · {vacancy.status === 'Open' ? 'Abierta' : 'Cerrada'}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setVacancyForm({
                          id: vacancy.id,
                          title: vacancy.title,
                          department: vacancy.department,
                          openings: String(vacancy.openings),
                          status: vacancy.status,
                          notes: vacancy.notes || '',
                        })
                      }
                      className="p-2 text-slate-500 hover:text-primary"
                    >
                      <Edit2 size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          await deleteVacancy(vacancy.id);
                          toast.success('Vacante eliminada');
                          await loadVacanciesAndContracts();
                        } catch (error) {
                          handleApiError(error, OperationType.DELETE, 'vacancies');
                        }
                      }}
                      className="p-2 text-slate-500 hover:text-rose-600"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm p-6 space-y-5">
          <h3 className="font-black text-xs uppercase tracking-widest text-slate-900 dark:text-white">Contratos Laborales</h3>

          <form onSubmit={handleCreateContract} className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <select
              required
              value={contractForm.employeeId}
              onChange={(e) => setContractForm((prev) => ({ ...prev, employeeId: e.target.value }))}
              className="px-4 py-2.5 rounded-xl border border-slate-300 text-sm"
            >
              <option value="">Seleccionar empleado...</option>
              {employees.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.name} - {emp.role}
                </option>
              ))}
            </select>
            <input
              type="date"
              value={contractForm.startDate}
              onChange={(e) => setContractForm((prev) => ({ ...prev, startDate: e.target.value }))}
              className="px-4 py-2.5 rounded-xl border border-slate-300 text-sm"
            />
            <input
              type="text"
              placeholder="Tipo de contrato"
              value={contractForm.contractType}
              onChange={(e) => setContractForm((prev) => ({ ...prev, contractType: e.target.value }))}
              className="px-4 py-2.5 rounded-xl border border-slate-300 text-sm"
            />
            <input
              type="text"
              placeholder="Empresa"
              value={contractForm.companyName}
              onChange={(e) => setContractForm((prev) => ({ ...prev, companyName: e.target.value }))}
              className="px-4 py-2.5 rounded-xl border border-slate-300 text-sm"
            />
            <input
              required
              type="text"
              placeholder="Nombre del dueño o representante"
              value={contractForm.ownerName}
              onChange={(e) => setContractForm((prev) => ({ ...prev, ownerName: e.target.value }))}
              className="px-4 py-2.5 rounded-xl border border-slate-300 text-sm"
            />
            <input
              required
              type="text"
              placeholder="Cargo del representante"
              value={contractForm.ownerTitle}
              onChange={(e) => setContractForm((prev) => ({ ...prev, ownerTitle: e.target.value }))}
              className="px-4 py-2.5 rounded-xl border border-slate-300 text-sm"
            />
            <textarea
              placeholder="Notas del contrato"
              value={contractForm.notes}
              onChange={(e) => setContractForm((prev) => ({ ...prev, notes: e.target.value }))}
              className="md:col-span-2 px-4 py-2.5 rounded-xl border border-slate-300 text-sm"
              rows={2}
            />
            <button className="md:col-span-2 py-2.5 rounded-xl bg-primary text-white text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2">
              <FileSignature size={14} />
              Crear Contrato
            </button>
          </form>

          <div className="space-y-2 max-h-[360px] overflow-auto pr-1">
            {contracts.length === 0 ? (
              <p className="text-xs text-slate-500">Aun no hay contratos registrados.</p>
            ) : (
              contracts.map((contract) => (
                <div key={contract.id} className="p-3 rounded-xl border border-slate-200 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-bold text-slate-900 dark:text-white">{contract.employeeName}</p>
                      <p className="text-[11px] text-slate-500">{contract.contractType} · Inicio {contract.startDate}</p>
                    </div>
                    <span className="text-[10px] uppercase font-black tracking-widest text-slate-500">{contract.status}</span>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void handleSendForMobileSignature(contract)}
                      className="px-2.5 py-1.5 rounded-lg border border-slate-300 text-[11px] font-bold text-slate-700 flex items-center gap-1"
                    >
                      <Send size={12} />
                      Enviar Firma Móvil
                    </button>

                    <button
                      type="button"
                      disabled={contract.status !== 'worker_signed'}
                      onClick={() => {
                        setSelectedContractId(contract.id);
                        setIsSigningOwner(true);
                      }}
                      className="px-2.5 py-1.5 rounded-lg border border-slate-300 text-[11px] font-bold text-slate-700 flex items-center gap-1 disabled:opacity-50"
                    >
                      <CheckCircle2 size={12} />
                      Firmar y Cerrar
                    </button>

                    {contract.signedFileUrl && (
                      <button
                        type="button"
                        onClick={() => void handleOpenContractViewer(contract.signedFileUrl || '', contract.signedFileName || '')}
                        className="px-2.5 py-1.5 rounded-lg border border-emerald-300 text-[11px] font-bold text-emerald-700"
                      >
                        Ver PDF
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => void handleDeleteContract(contract)}
                      className="px-2.5 py-1.5 rounded-lg border border-rose-300 text-[11px] font-bold text-rose-700 flex items-center gap-1"
                    >
                      <Trash2 size={12} />
                      Eliminar
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
