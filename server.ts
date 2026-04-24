import 'dotenv/config';
import express from "express";
import type { Request, Response } from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import { Pool } from "pg";
import multer from "multer";
import fs from "fs/promises";
import { randomUUID } from "crypto";
import { GoogleGenAI } from "@google/genai";
import { put } from "@vercel/blob";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);
const DATABASE_URL = process.env.DATABASE_URL;
const AI_PROVIDER = String(process.env.AI_PROVIDER || 'gemini').trim().toLowerCase();
const GITHUB_MODELS_ENDPOINT = String(process.env.GITHUB_MODELS_ENDPOINT || 'https://models.inference.ai.azure.com/chat/completions').trim();
const GITHUB_MODELS_MODEL = String(process.env.GITHUB_MODELS_MODEL || 'gpt-4.1-mini').trim();
const GITHUB_MODELS_TOKEN = String(process.env.GITHUB_MODELS_TOKEN || process.env.GITHUB_TOKEN || '').trim();
const RESEND_API_KEY = String(process.env.RESEND_API_KEY || '').trim();
const REPORTS_FROM_EMAIL = String(process.env.REPORTS_FROM_EMAIL || 'onboarding@resend.dev').trim();
const PG_POOL_MAX = Number(process.env.PG_POOL_MAX || 20);
const PG_IDLE_TIMEOUT_MS = Number(process.env.PG_IDLE_TIMEOUT_MS || 30000);
const PG_CONNECTION_TIMEOUT_MS = Number(process.env.PG_CONNECTION_TIMEOUT_MS || 10000);
const DB_HEALTH_OK_CACHE_MS = Number(process.env.DB_HEALTH_OK_CACHE_MS || 8000);
const DB_HEALTH_FAIL_CACHE_MS = Number(process.env.DB_HEALTH_FAIL_CACHE_MS || 1500);
const DB_HEALTH_RETRY_ATTEMPTS = Number(process.env.DB_HEALTH_RETRY_ATTEMPTS || 2);
const UPLOADS_PUBLIC_DIR = path.join(process.cwd(), "public", "uploads");
const UPLOADS_FALLBACK_DIR = path.join(process.env.TMPDIR || "/tmp", "uploads");
const IS_PRODUCTION = process.env.NODE_ENV === "production";

const pool = DATABASE_URL
  ? new Pool({
      connectionString: DATABASE_URL,
      ssl: process.env.PGSSLMODE === "disable" ? false : { rejectUnauthorized: false },
      max: PG_POOL_MAX,
      idleTimeoutMillis: PG_IDLE_TIMEOUT_MS,
      connectionTimeoutMillis: PG_CONNECTION_TIMEOUT_MS,
      keepAlive: true,
      keepAliveInitialDelayMillis: 10000,
      query_timeout: 30000,
      statement_timeout: 30000,
    })
  : null;

if (pool) {
  pool.on('error', (error) => {
    console.error('[db] pool client error:', error?.message || error);
  });
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 15 * 1024 * 1024,
  },
});

function sanitizePathSegment(segment: string) {
  return segment.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function toSafeRelativePath(rawPath: string) {
  const normalized = rawPath.replace(/\\/g, "/").trim();
  const segments = normalized
    .split("/")
    .map((segment) => segment.trim())
    .filter((segment) => segment && segment !== "." && segment !== "..");

  return segments.map(sanitizePathSegment).join("/");
}

async function resolveWritableUploadsBaseDir() {
  try {
    await fs.mkdir(UPLOADS_PUBLIC_DIR, { recursive: true });
    return UPLOADS_PUBLIC_DIR;
  } catch {
    await fs.mkdir(UPLOADS_FALLBACK_DIR, { recursive: true });
    return UPLOADS_FALLBACK_DIR;
  }
}

type TransactionType = "Income" | "Expense";

interface TransactionRow {
  id: string;
  project_id: string | null;
  budget_item_id: string | null;
  subcontract_id: string | null;
  type: TransactionType;
  category: string;
  amount: string;
  date: string;
  description: string | null;
  account_type: 'project' | 'owner' | null;
  income_origin: string | null;
  funding_source: string | null;
  created_at: string;
}

interface ProjectRow {
  id: string;
  name: string;
  location: string | null;
  project_manager: string | null;
  area: string | null;
  status: string | null;
  budget: string | null;
  spent: string | null;
  physical_progress: string | null;
  financial_progress: string | null;
  start_date: string | null;
  end_date: string | null;
  client_uid: string | null;
  typology: string | null;
  latitude: string | null;
  longitude: string | null;
  created_at: string;
}

interface BudgetItemRow {
  id: string;
  project_id: string;
  description: string;
  category: string | null;
  unit: string | null;
  quantity: string | null;
  material_cost: string | null;
  labor_cost: string | null;
  indirect_cost: string | null;
  total_unit_price: string | null;
  total_item_price: string | null;
  estimated_days: string | null;
  notes: string | null;
  material_details: string | null;
  indirect_factor: string | null;
  materials: any[] | null;
  labor: any[] | null;
  subtasks: any[] | null;
  progress: string | null;
  sort_order: number | null;
  created_at: string | null;
  updated_at: string | null;
}

interface InventoryRow {
  id: string;
  project_id: string;
  name: string;
  unit: string | null;
  stock: string | null;
  min_stock: string | null;
  unit_price: string | null;
  category: string | null;
  suppliers: any[] | null;
  batches: any[] | null;
  created_at: string;
  updated_at: string;
}

interface QuoteRow {
  id: string;
  client_id: string;
  project_id: string;
  quote_date: string;
  status: string;
  total: string;
  items: any[];
  notes: string | null;
  sent_at: string | null;
  created_at: string;
  updated_at: string;
}

interface InventoryTransactionRow {
  id: string;
  material_id: string;
  material_name: string;
  type: string;
  quantity: string | null;
  batch_number: string | null;
  previous_stock: string | null;
  new_stock: string | null;
  reason: string | null;
  project_id: string | null;
  created_at: string;
}

interface DeletedRecordRow {
  id: string;
  type: string;
  original_id: string | null;
  material_id: string | null;
  material_name: string | null;
  batch_id: string | null;
  data: any;
  reason: string | null;
  deleted_at: string;
}

interface PurchaseOrderRow {
  id: string;
  project_id: string | null;
  budget_item_id: string | null;
  material_id: string | null;
  material_name: string;
  quantity: string | null;
  unit: string | null;
  estimated_cost: string | null;
  supplier: string | null;
  supplier_id: string | null;
  notes: string | null;
  status: string;
  order_date: string;
  date_received: string | null;
  date_paid: string | null;
  payment_method: string | null;
  payment_reference: string | null;
  stock_applied: boolean;
  budget_applied: boolean;
  created_at: string;
  updated_at: string;
}

interface SupplierPaymentRow {
  id: string;
  supplier_id: string;
  purchase_order_id: string | null;
  amount: string;
  payment_method: string;
  payment_reference: string | null;
  notes: string | null;
  paid_at: string;
  created_at: string;
}

interface ClientRow {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  contact_person: string | null;
  contacto: string | null;
  status: string;
  notes: string | null;
  location: any;
  attachments: any[] | null;
  last_interaction: string | null;
  created_at: string;
  updated_at: string;
}

interface ClientChatRow {
  id: string;
  client_id: string;
  text: string;
  sender: string;
  created_at: string;
}

interface ClientInteractionRow {
  id: string;
  client_id: string;
  type: string;
  notes: string;
  date: string;
  created_at: string;
}

interface SupplierRow {
  id: string;
  name: string;
  category: string | null;
  contact: string | null;
  email: string | null;
  phone: string | null;
  rating: string | null;
  status: string;
  balance: string | null;
  last_order: string | null;
  created_at: string;
  updated_at: string;
}

interface DocumentRow {
  id: string;
  name: string;
  type: string;
  size: string | null;
  file_url: string | null;
  folder: string;
  author: string | null;
  date: string;
  created_at: string;
  updated_at: string;
}

interface FolderRow {
  id: string;
  name: string;
  color: string | null;
  created_at: string;
}

interface EquipmentRow {
  id: string;
  name: string;
  type: string;
  project_id: string | null;
  daily_rate: string | null;
  estimated_days: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

interface EmployeeRow {
  id: string;
  name: string;
  role: string;
  department: string;
  salary: string | null;
  status: string;
  join_date: string;
  created_at: string;
  updated_at: string;
}

interface AttendanceRow {
  id: string;
  employee_id: string;
  employee_name: string | null;
  type: string;
  timestamp: string;
  created_at: string;
}

interface VacancyRow {
  id: string;
  title: string;
  department: string;
  openings: number;
  status: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

interface EmploymentContractRow {
  id: string;
  employee_id: string;
  employee_name: string;
  employee_role: string;
  employee_department: string;
  salary: string | null;
  start_date: string;
  contract_type: string;
  company_name: string;
  owner_name: string;
  owner_title: string;
  status: string;
  share_token: string;
  sent_at: string | null;
  worker_signed_at: string | null;
  owner_signed_at: string | null;
  worker_signature_data_url: string | null;
  owner_signature_data_url: string | null;
  signed_file_url: string | null;
  signed_file_name: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

interface RiskRow {
  id: string;
  project_id: string;
  title: string;
  description: string | null;
  category: string;
  impact: string;
  probability: string;
  status: string;
  mitigation_plan: string | null;
  contingency_plan: string | null;
  owner: string | null;
  created_at: string;
  updated_at: string;
}

interface SafetyIncidentRow {
  id: string;
  title: string;
  type: string;
  severity: string;
  location: string;
  incident_date: string;
  description: string | null;
  measures: string | null;
  status: string;
  author_email: string | null;
  created_at: string;
  updated_at: string;
}

interface SubcontractRow {
  id: string;
  project_id: string;
  budget_item_id: string | null;
  budget_item_name: string | null;
  contractor: string;
  service: string;
  start_date: string | null;
  end_date: string | null;
  total: string | null;
  paid: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

interface WorkflowRow {
  id: string;
  title: string;
  type: 'quote' | 'purchase_order' | 'subcontract' | 'other';
  reference_id: string;
  status: 'pending' | 'approved' | 'rejected';
  requested_by: string;
  requested_at: string;
  priority: 'low' | 'medium' | 'high';
  description: string;
  amount: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
}

interface ProjectPoiRow {
  id: string;
  project_id: string;
  name: string;
  comment: string | null;
  latitude: string;
  longitude: string;
  created_at: string;
  updated_at: string;
}

interface ProjectLogbookEntryRow {
  id: string;
  project_id: string;
  entry_date: string;
  content: string;
  weather: string;
  workers_count: number;
  photos: any[] | null;
  author_email: string | null;
  created_at: string;
}

interface AuditLogRow {
  id: string;
  project_id: string | null;
  user_id: string | null;
  user_name: string;
  user_email: string | null;
  action: string;
  module: string;
  details: string;
  type: 'create' | 'update' | 'delete' | 'auth' | 'system' | 'read';
  metadata: any;
  user_agent: string | null;
  ip_address: string | null;
  created_at: string;
}

interface NotificationRow {
  id: string;
  title: string;
  body: string;
  type: 'inventory' | 'subcontract' | 'project' | 'system';
  read: boolean;
  created_at: string;
}

interface ReminderRow {
  id: string;
  user_id: string;
  title: string;
  note: string | null;
  reminder_date: string;
  reminder_time: string;
  notify_minutes_before: number;
  completed: boolean;
  source: 'user' | 'ai';
  created_at: string;
  updated_at: string;
}

interface AppUserRow {
  id: string;
  email: string;
  display_name: string;
  photo_url: string | null;
  created_at: string;
  updated_at: string;
  last_login_at: string;
}

interface OcrValidationRow {
  id: string;
  project_id: string | null;
  purchase_order_id: string | null;
  invoice_number: string | null;
  supplier: string | null;
  detected_total: string | null;
  score: number;
  result_status: 'aprobado' | 'revisar' | 'rechazado';
  decision: 'approved' | 'review' | 'rejected';
  auto_apply: boolean;
  auto_action_status: string | null;
  auto_action_summary: string | null;
  created_by: string | null;
  created_at: string;
}

function mapTransaction(row: TransactionRow) {
  return {
    id: row.id,
    projectId: row.project_id || '',
    budgetItemId: row.budget_item_id,
    subcontractId: row.subcontract_id,
    type: row.type,
    category: row.category,
    amount: Number(row.amount),
    date: row.date,
    description: row.description || "",
    accountType: row.account_type || 'project',
    incomeOrigin: row.income_origin || '',
    fundingSource: row.funding_source || '',
    createdAt: row.created_at,
  };
}

function mapSubcontract(row: SubcontractRow) {
  return {
    id: row.id,
    projectId: row.project_id,
    budgetItemId: row.budget_item_id || '',
    budgetItemName: row.budget_item_name || '',
    contractor: row.contractor,
    service: row.service,
    startDate: row.start_date || '',
    endDate: row.end_date || '',
    total: Number(row.total || 0),
    paid: Number(row.paid || 0),
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapWorkflow(row: WorkflowRow) {
  return {
    id: row.id,
    title: row.title,
    type: row.type,
    referenceId: row.reference_id,
    status: row.status,
    requestedBy: row.requested_by,
    requestedAt: row.requested_at,
    priority: row.priority,
    description: row.description,
    amount: row.amount !== null ? Number(row.amount) : undefined,
    resolvedAt: row.resolved_at || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapProjectPoi(row: ProjectPoiRow) {
  return {
    id: row.id,
    projectId: row.project_id,
    name: row.name,
    comment: row.comment || '',
    lat: Number(row.latitude),
    lng: Number(row.longitude),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapProjectLogbookEntry(row: ProjectLogbookEntryRow) {
  return {
    id: row.id,
    projectId: row.project_id,
    date: row.entry_date,
    content: row.content,
    weather: row.weather,
    workersCount: Number(row.workers_count || 0),
    photos: Array.isArray(row.photos) ? row.photos : [],
    authorEmail: row.author_email || '',
    createdAt: row.created_at,
  };
}

function mapAuditLog(row: AuditLogRow) {
  const metadata = row.metadata && typeof row.metadata === 'object' ? row.metadata : {};
  return {
    id: row.id,
    projectId: row.project_id || metadata.projectId || null,
    userId: row.user_id || '',
    userName: row.user_name || 'Usuario',
    userEmail: row.user_email || '',
    action: row.action,
    module: row.module,
    details: row.details,
    type: row.type,
    metadata,
    field: metadata.field || metadata.fieldLabel || '',
    oldValue: metadata.oldValue,
    newValue: metadata.newValue,
    userAgent: row.user_agent || '',
    ipAddress: row.ip_address || '',
    timestamp: row.created_at,
    createdAt: row.created_at,
  };
}

function mapNotification(row: NotificationRow) {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    type: row.type,
    read: Boolean(row.read),
    createdAt: row.created_at,
  };
}

function mapReminder(row: ReminderRow) {
  return {
    id: row.id,
    userId: row.user_id,
    title: row.title,
    note: row.note || '',
    date: row.reminder_date,
    time: row.reminder_time,
    notifyMinutesBefore: Number(row.notify_minutes_before || 0),
    completed: Boolean(row.completed),
    source: row.source === 'ai' ? 'ai' : 'user',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapAppUser(row: AppUserRow) {
  return {
    uid: row.id,
    email: row.email,
    displayName: row.display_name,
    photoURL: row.photo_url,
    emailVerified: true,
    isAnonymous: false,
    tenantId: null,
    providerData: [
      {
        providerId: 'postgres-local',
        displayName: row.display_name,
        email: row.email,
        photoURL: row.photo_url,
      },
    ],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastLoginAt: row.last_login_at,
  };
}

function mapOcrValidation(row: OcrValidationRow) {
  return {
    id: row.id,
    projectId: row.project_id,
    purchaseOrderId: row.purchase_order_id,
    invoiceNumber: row.invoice_number,
    supplier: row.supplier,
    detectedTotal: Number(row.detected_total || 0),
    score: Number(row.score || 0),
    resultStatus: row.result_status,
    decision: row.decision,
    autoApply: Boolean(row.auto_apply),
    autoActionStatus: row.auto_action_status,
    autoActionSummary: row.auto_action_summary,
    createdBy: row.created_by,
    createdAt: row.created_at,
  };
}

function mapProject(row: ProjectRow) {
  const latitude = row.latitude ? Number(row.latitude) : null;
  const longitude = row.longitude ? Number(row.longitude) : null;

  return {
    id: row.id,
    name: row.name,
    location: row.location || '',
    projectManager: row.project_manager || '',
    area: Number(row.area || 0),
    status: row.status || "Planning",
    budget: Number(row.budget || 0),
    spent: Number(row.spent || 0),
    physicalProgress: Number(row.physical_progress || 0),
    financialProgress: Number(row.financial_progress || 0),
    startDate: row.start_date || '',
    endDate: row.end_date || '',
    clientUid: row.client_uid || '',
    typology: row.typology || 'RESIDENCIAL',
    coordinates: latitude !== null && longitude !== null ? { lat: latitude, lng: longitude } : null,
    latitude: latitude !== null ? String(latitude) : '',
    longitude: longitude !== null ? String(longitude) : '',
    createdAt: row.created_at,
  };
}

function mapBudgetItem(row: BudgetItemRow) {
  return {
    id: row.id,
    projectId: row.project_id,
    description: row.description,
    category: row.category || "General",
    unit: row.unit || "",
    quantity: Number(row.quantity || 0),
    materialCost: Number(row.material_cost || 0),
    laborCost: Number(row.labor_cost || 0),
    indirectCost: Number(row.indirect_cost || 0),
    totalUnitPrice: Number(row.total_unit_price || 0),
    totalItemPrice: Number(row.total_item_price || 0),
    estimatedDays: Number(row.estimated_days || 0),
    notes: row.notes || "",
    materialDetails: row.material_details || "",
    indirectFactor: Number(row.indirect_factor || 0.2),
    materials: Array.isArray(row.materials) ? row.materials : [],
    labor: Array.isArray(row.labor) ? row.labor : [],
    subtasks: Array.isArray(row.subtasks) ? row.subtasks : [],
    progress: Number(row.progress || 0),
    total: Number(row.total_item_price || 0),
    order: row.sort_order || 0,
    createdAt: row.created_at || "",
    updatedAt: row.updated_at || "",
  };
}

class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

interface BudgetMaterialInput {
  name: string;
  unit: string;
  quantity: number;
  unitPrice: number;
}

interface BudgetLaborInput {
  role: string;
  yield: number;
  dailyRate: number;
}

interface BudgetComputationInput {
  quantity: number;
  indirectFactor: number;
  materials: BudgetMaterialInput[];
  labor: BudgetLaborInput[];
  fallbackMaterialCost: number;
  fallbackLaborCost: number;
  fallbackEstimatedDays: number;
}

function toFiniteNumber(value: any, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toNonNegativeNumber(value: any, fieldName: string, fallback = 0) {
  const parsed = toFiniteNumber(value, fallback);
  if (parsed < 0) {
    throw new ValidationError(`${fieldName} no puede ser negativo`);
  }
  return parsed;
}

function normalizeBudgetMaterials(input: any): BudgetMaterialInput[] {
  if (!Array.isArray(input)) return [];

  return input
    .map((item) => {
      const name = String(item?.name || '').trim();
      const unit = String(item?.unit || '').trim();
      const quantity = toNonNegativeNumber(item?.quantity, 'materials.quantity');
      const unitPrice = toNonNegativeNumber(item?.unitPrice, 'materials.unitPrice');

      if (!name) {
        throw new ValidationError('Cada material debe tener nombre');
      }

      return {
        name,
        unit,
        quantity,
        unitPrice,
      };
    })
    .filter((item) => item.name.length > 0);
}

function normalizeBudgetLabor(input: any): BudgetLaborInput[] {
  if (!Array.isArray(input)) return [];

  return input
    .map((item) => {
      const role = String(item?.role || '').trim();
      const yieldValue = toFiniteNumber(item?.yield, 0);
      const dailyRate = toNonNegativeNumber(item?.dailyRate, 'labor.dailyRate');

      if (!role) {
        throw new ValidationError('Cada rol de mano de obra debe tener nombre');
      }

      if (yieldValue <= 0) {
        throw new ValidationError('labor.yield debe ser mayor que cero');
      }

      return {
        role,
        yield: yieldValue,
        dailyRate,
      };
    })
    .filter((item) => item.role.length > 0);
}

function computeBudgetMetrics(input: BudgetComputationInput) {
  const quantity = toNonNegativeNumber(input.quantity, 'quantity');
  const indirectFactor = toNonNegativeNumber(input.indirectFactor, 'indirectFactor', 0.2);

  const materialCostFromList = input.materials.reduce((sum, m) => sum + (m.quantity * m.unitPrice), 0);
  const laborCostFromList = input.labor.reduce((sum, l) => sum + (l.dailyRate / l.yield), 0);

  const materialCost = input.materials.length > 0
    ? materialCostFromList
    : toNonNegativeNumber(input.fallbackMaterialCost, 'materialCost');

  const laborCost = input.labor.length > 0
    ? laborCostFromList
    : toNonNegativeNumber(input.fallbackLaborCost, 'laborCost');

  const directCost = materialCost + laborCost;
  const indirectCost = directCost * indirectFactor;
  const totalUnitPrice = directCost + indirectCost;
  const totalItemPrice = quantity * totalUnitPrice;

  let estimatedDays = 0;
  if (input.labor.length > 0) {
    estimatedDays = Math.max(...input.labor.map((l) => quantity / l.yield));
  } else {
    estimatedDays = toNonNegativeNumber(input.fallbackEstimatedDays, 'estimatedDays');
  }

  return {
    quantity,
    materialCost,
    laborCost,
    indirectCost,
    totalUnitPrice,
    totalItemPrice,
    estimatedDays,
    indirectFactor,
  };
}

function mapInventoryItem(row: InventoryRow) {
  return {
    id: row.id,
    projectId: row.project_id,
    name: row.name,
    unit: row.unit || '',
    stock: Number(row.stock || 0),
    minStock: Number(row.min_stock || 0),
    unitPrice: Number(row.unit_price || 0),
    category: row.category || 'Material de Obra',
    suppliers: Array.isArray(row.suppliers) ? row.suppliers : [],
    batches: Array.isArray(row.batches) ? row.batches : [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapInventoryTransaction(row: InventoryTransactionRow) {
  return {
    id: row.id,
    materialId: row.material_id,
    materialName: row.material_name,
    type: row.type,
    quantity: Number(row.quantity || 0),
    batchNumber: row.batch_number || null,
    previousStock: row.previous_stock !== null ? Number(row.previous_stock) : null,
    newStock: row.new_stock !== null ? Number(row.new_stock) : null,
    reason: row.reason || '',
    projectId: row.project_id || null,
    createdAt: row.created_at,
  };
}

function mapDeletedRecord(row: DeletedRecordRow) {
  return {
    id: row.id,
    type: row.type,
    originalId: row.original_id || null,
    materialId: row.material_id || null,
    materialName: row.material_name || null,
    batchId: row.batch_id || null,
    data: row.data ?? null,
    reason: row.reason || '',
    deletedAt: row.deleted_at,
  };
}

function mapPurchaseOrder(row: PurchaseOrderRow) {
  return {
    id: row.id,
    projectId: row.project_id || '',
    budgetItemId: row.budget_item_id || '',
    materialId: row.material_id || '',
    materialName: row.material_name,
    quantity: Number(row.quantity || 0),
    unit: row.unit || '',
    estimatedCost: Number(row.estimated_cost || 0),
    supplier: row.supplier || '',
    supplierId: row.supplier_id || '',
    notes: row.notes || '',
    status: row.status,
    date: row.order_date,
    dateReceived: row.date_received || null,
    datePaid: row.date_paid || null,
    paymentMethod: row.payment_method || null,
    paymentReference: row.payment_reference || null,
    stockApplied: Boolean(row.stock_applied),
    budgetApplied: Boolean(row.budget_applied),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapSupplierPayment(row: SupplierPaymentRow) {
  return {
    id: row.id,
    supplierId: row.supplier_id,
    purchaseOrderId: row.purchase_order_id || null,
    amount: Number(row.amount || 0),
    paymentMethod: row.payment_method,
    paymentReference: row.payment_reference || '',
    notes: row.notes || '',
    paidAt: row.paid_at,
    createdAt: row.created_at,
  };
}

function mapQuote(row: QuoteRow) {
  return {
    id: row.id,
    clientId: row.client_id,
    projectId: row.project_id,
    date: row.quote_date,
    status: row.status,
    total: Number(row.total || 0),
    items: Array.isArray(row.items) ? row.items : [],
    notes: row.notes || '',
    sentAt: row.sent_at || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapClient(row: ClientRow) {
  return {
    id: row.id,
    name: row.name,
    email: row.email || '',
    phone: row.phone || '',
    company: row.company || '',
    contactPerson: row.contact_person || '',
    contacto: row.contacto || '',
    status: row.status || 'Lead',
    notes: row.notes || '',
    location: row.location || null,
    attachments: Array.isArray(row.attachments) ? row.attachments : [],
    lastInteraction: row.last_interaction,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapClientChat(row: ClientChatRow) {
  return {
    id: row.id,
    clientId: row.client_id,
    text: row.text,
    sender: row.sender,
    createdAt: row.created_at,
  };
}

function mapClientInteraction(row: ClientInteractionRow) {
  return {
    id: row.id,
    clientId: row.client_id,
    type: row.type,
    notes: row.notes,
    date: row.date,
    createdAt: row.created_at,
  };
}

function mapSupplier(row: SupplierRow) {
  return {
    id: row.id,
    name: row.name,
    category: row.category || 'Materiales',
    contact: row.contact || '',
    email: row.email || '',
    phone: row.phone || '',
    rating: Number(row.rating || 0),
    status: row.status || 'Verified',
    balance: Number(row.balance || 0),
    lastOrder: row.last_order || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapDocument(row: DocumentRow) {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    size: row.size || '',
    fileUrl: row.file_url || null,
    folder: row.folder,
    author: row.author || 'Usuario',
    date: row.date,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapFolder(row: FolderRow) {
  return {
    id: row.id,
    name: row.name,
    color: row.color || 'text-slate-500',
    createdAt: row.created_at,
  };
}

function mapEquipment(row: EquipmentRow) {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    projectId: row.project_id || '',
    dailyRate: Number(row.daily_rate || 0),
    estimatedDays: Number(row.estimated_days || 0),
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapEmployee(row: EmployeeRow) {
  return {
    id: row.id,
    name: row.name,
    role: row.role,
    department: row.department,
    salary: Number(row.salary || 0),
    status: row.status,
    joinDate: row.join_date,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapAttendance(row: AttendanceRow) {
  return {
    id: row.id,
    employeeId: row.employee_id,
    employeeName: row.employee_name || '',
    type: row.type,
    timestamp: row.timestamp,
    createdAt: row.created_at,
  };
}

function mapVacancy(row: VacancyRow) {
  return {
    id: row.id,
    title: row.title,
    department: row.department,
    openings: Number(row.openings || 0),
    status: row.status === 'Closed' ? 'Closed' : 'Open',
    notes: row.notes || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapEmploymentContract(row: EmploymentContractRow) {
  return {
    id: row.id,
    employeeId: row.employee_id,
    employeeName: row.employee_name,
    employeeRole: row.employee_role,
    employeeDepartment: row.employee_department,
    salary: Number(row.salary || 0),
    startDate: row.start_date,
    contractType: row.contract_type,
    companyName: row.company_name,
    ownerName: row.owner_name,
    ownerTitle: row.owner_title,
    status: row.status,
    shareToken: row.share_token,
    sentAt: row.sent_at,
    workerSignedAt: row.worker_signed_at,
    ownerSignedAt: row.owner_signed_at,
    workerSignatureDataUrl: row.worker_signature_data_url,
    ownerSignatureDataUrl: row.owner_signature_data_url,
    signedFileUrl: row.signed_file_url,
    signedFileName: row.signed_file_name,
    notes: row.notes || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapRisk(row: RiskRow) {
  return {
    id: row.id,
    projectId: row.project_id,
    title: row.title,
    description: row.description || '',
    category: row.category,
    impact: row.impact,
    probability: row.probability,
    status: row.status,
    mitigationPlan: row.mitigation_plan || '',
    contingencyPlan: row.contingency_plan || '',
    owner: row.owner || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapSafetyIncident(row: SafetyIncidentRow) {
  return {
    id: row.id,
    title: row.title,
    type: row.type,
    severity: row.severity,
    location: row.location,
    date: row.incident_date,
    description: row.description || '',
    measures: row.measures || '',
    status: row.status,
    authorEmail: row.author_email || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function requireDatabase() {
  if (!pool) {
    throw new Error("DATABASE_URL no esta configurado");
  }
  return pool;
}

let dbAvailabilityCache: { ok: boolean; checkedAt: number } = { ok: !!pool, checkedAt: 0 };
let dbHealthStats = {
  checks: 0,
  successes: 0,
  failures: 0,
  consecutiveFailures: 0,
  lastSuccessAt: null as string | null,
  lastFailureAt: null as string | null,
  lastError: null as string | null,
};

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function isDatabaseAvailable() {
  if (!pool) return false;
  const now = Date.now();
  const cacheTtl = dbAvailabilityCache.ok ? DB_HEALTH_OK_CACHE_MS : DB_HEALTH_FAIL_CACHE_MS;
  if (now - dbAvailabilityCache.checkedAt < cacheTtl) {
    return dbAvailabilityCache.ok;
  }

  for (let attempt = 1; attempt <= DB_HEALTH_RETRY_ATTEMPTS; attempt++) {
    dbHealthStats.checks += 1;
    try {
      await pool.query('select 1');
      dbAvailabilityCache = { ok: true, checkedAt: Date.now() };
      dbHealthStats.successes += 1;
      dbHealthStats.consecutiveFailures = 0;
      dbHealthStats.lastSuccessAt = new Date().toISOString();
      dbHealthStats.lastError = null;
      return true;
    } catch (error: any) {
      dbHealthStats.failures += 1;
      dbHealthStats.consecutiveFailures += 1;
      dbHealthStats.lastFailureAt = new Date().toISOString();
      dbHealthStats.lastError = String(error?.message || error || 'unknown-db-health-error');
      if (attempt < DB_HEALTH_RETRY_ATTEMPTS) {
        await wait(attempt * 200);
      }
    }
  }

  dbAvailabilityCache = { ok: false, checkedAt: Date.now() };
  return false;
}

function mapFallbackUser(email: string, displayName: string, photoURL: string | null) {
  return {
    uid: randomUUID(),
    email,
    displayName,
    photoURL,
    emailVerified: true,
    isAnonymous: false,
    tenantId: null,
    providerData: [
      {
        providerId: 'local-fallback',
        displayName,
        email,
        photoURL,
      },
    ],
  };
}

function getRequesterUserId(req: Request) {
  return String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
}

function serveFallbackRead(req: Request, res: Response) {
  if (req.path === '/health') {
    return res.json({
      status: 'ok',
      db: 'unavailable',
      telemetry: {
        checks: dbHealthStats.checks,
        successes: dbHealthStats.successes,
        failures: dbHealthStats.failures,
        consecutiveFailures: dbHealthStats.consecutiveFailures,
        lastSuccessAt: dbHealthStats.lastSuccessAt,
        lastFailureAt: dbHealthStats.lastFailureAt,
        lastError: dbHealthStats.lastError,
      },
    });
  }

  if (req.path === '/scheduler/status') {
    return res.json({
      status: 'degraded',
      scheduler: {
        enabled: false,
        reason: 'database-unavailable',
      },
    });
  }

  if (req.path === '/projects') {
    return res.json({ items: [] });
  }
  if (req.path === '/clients') {
    return res.json({ items: [] });
  }
  if (req.path === '/subcontracts') {
    return res.json({ items: [] });
  }
  if (req.path === '/tasks') {
    return res.json({ items: [] });
  }
  if (req.path === '/workflows') {
    return res.json({ items: [] });
  }
  if (req.path === '/deleted-records') {
    return res.json({ items: [] });
  }
  if (req.path === '/inventory') {
    return res.json({ items: [], hasMore: false });
  }
  if (req.path === '/notifications') {
    return res.json({ items: [], hasMore: false });
  }
  if (req.path === '/reminders') {
    return res.json({ items: [] });
  }
  if (req.path === '/settings/thresholds') {
    return res.json({
      materialWeeklySpikeThresholdPct: 10,
      physicalFinancialDeviationThresholdPct: 15,
      updatedAt: null,
      updatedBy: null,
      source: 'fallback',
    });
  }
  if (req.path === '/quotes') {
    return res.json({ items: [] });
  }
  if (req.path === '/quotes/reference-data') {
    return res.json({
      projects: [],
      suppliers: [],
      inventory: [],
      items: [],
    });
  }
  if (req.path === '/safety-incidents') {
    return res.json({ items: [] });
  }
  if (req.path === '/risks') {
    return res.json({ items: [] });
  }
  if (req.path === '/suppliers') {
    return res.json({ items: [] });
  }
  if (req.path === '/purchase-orders') {
    return res.json({ items: [] });
  }
  if (req.path === '/documents') {
    return res.json({ items: [] });
  }
  if (req.path === '/documents/ocr-validations') {
    const limit = Math.min(Math.max(Number(req.query.limit || 20), 1), 200);
    const offset = Math.max(Number(req.query.offset || 0), 0);
    return res.json({ items: [], hasMore: false, limit, offset });
  }
  if (req.path === '/folders') {
    return res.json({ items: [] });
  }
  if (req.path === '/equipment') {
    return res.json({ items: [] });
  }
  if (req.path === '/employees') {
    return res.json({ items: [] });
  }
  if (req.path === '/attendance') {
    return res.json({ items: [] });
  }
  if (req.path === '/audit-logs') {
    return res.json({ items: [] });
  }
  if (req.path === '/transactions') {
    const limit = Math.min(Math.max(Number(req.query.limit || 50), 1), 200);
    const offset = Math.max(Number(req.query.offset || 0), 0);
    return res.json({ items: [], hasMore: false, limit, offset });
  }
  if (req.path === '/notifications/stream') {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();
    res.write('retry: 8000\n\n');
    const heartbeat = setInterval(() => {
      try {
        res.write(': keepalive\n\n');
      } catch {
        clearInterval(heartbeat);
      }
    }, 30000);
    req.on('close', () => clearInterval(heartbeat));
    return;
  }

  return res.status(503).json({ error: 'Base de datos no disponible temporalmente' });
}

export async function createApp(options?: { includeFrontend?: boolean }) {
  const app = express();
  const notificationStreams = new Set<Response>();
  const SCHEDULED_ALERTS_ENABLED = !['0', 'false', 'no', 'off'].includes(
    String(process.env.SERVER_SCHEDULED_ALERTS_ENABLED || 'true').trim().toLowerCase()
  );
  const SCHEDULED_ALERTS_INTERVAL_MS = Math.max(
    30 * 1000,
    Number(process.env.SERVER_SCHEDULED_ALERTS_INTERVAL_MS || 60 * 1000)
  );
  const SCHEDULED_ALERT_HOURS = new Set([8, 16]);
  const schedulerStatus = {
    enabled: SCHEDULED_ALERTS_ENABLED,
    intervalMs: SCHEDULED_ALERTS_INTERVAL_MS,
    runs: 0,
    alertsGenerated: 0,
    dedupedSkips: 0,
    failures: 0,
    lastCheckedAt: null as string | null,
    lastRunAt: null as string | null,
    lastSuccessAt: null as string | null,
    lastErrorAt: null as string | null,
    lastError: null as string | null,
    lastSlot: null as string | null,
    lastSummary: null as Record<string, any> | null,
  };

  const publishNotificationEvent = (
    eventType: 'created' | 'read' | 'deleted',
    notification: ReturnType<typeof mapNotification>
  ) => {
    if (notificationStreams.size === 0) return;

    const payload = JSON.stringify({ event: eventType, notification });
    for (const stream of notificationStreams) {
      try {
        stream.write(`data: ${payload}\n\n`);
      } catch {
        notificationStreams.delete(stream);
      }
    }
  };

  const createSystemNotification = async (title: string, body: string, type: 'inventory' | 'subcontract' | 'project' | 'system' = 'system') => {
    const db = requireDatabase();
    const result = await db.query<NotificationRow>(
      `
        insert into notifications (title, body, type)
        values ($1,$2,$3)
        returning id, title, body, type, read, created_at
      `,
      [title, body, type]
    );

    const createdNotification = mapNotification(result.rows[0]);
    publishNotificationEvent('created', createdNotification);
    return createdNotification;
  };

  const toMoney = (value: any) => {
    const numeric = Number(value || 0);
    return Number.isFinite(numeric) ? numeric : 0;
  };

  const runScheduledCostIntelligence = async () => {
    if (!SCHEDULED_ALERTS_ENABLED || !pool) return;

    const now = new Date();
    schedulerStatus.lastCheckedAt = now.toISOString();
    const hour = now.getHours();
    if (!SCHEDULED_ALERT_HOURS.has(hour)) return;

    schedulerStatus.runs += 1;
    schedulerStatus.lastRunAt = now.toISOString();

    const slot = String(hour).padStart(2, '0');
    const dateKey = now.toISOString().slice(0, 10);
    const runKey = `scheduled_cost_intel_alert_${dateKey}_${slot}`;
    const db = requireDatabase();

    await db.query(
      `
        create table if not exists app_settings (
          setting_key text primary key,
          setting_value text not null,
          updated_at timestamptz not null default now(),
          updated_by text
        )
      `
    );

    const lockResult = await db.query(
      `
        insert into app_settings (setting_key, setting_value, updated_at, updated_by)
        values ($1, $2, now(), 'server-scheduler')
        on conflict (setting_key) do nothing
        returning setting_key
      `,
      [runKey, 'sent']
    );

    if ((lockResult.rowCount || 0) === 0) {
      schedulerStatus.dedupedSkips += 1;
      schedulerStatus.lastSlot = `${dateKey} ${slot}:00`;
      return;
    }

    const projectsResult = await db.query<ProjectRow>(
      `
        select id, name, location, project_manager, area, status, budget, spent, physical_progress, financial_progress,
               start_date, end_date, client_uid, typology, latitude, longitude, created_at
        from projects
        where status in ('In Progress', 'Active')
      `
    );

    const projects = projectsResult.rows.map((row) => ({
      id: row.id,
      name: row.name,
      budget: toMoney(row.budget),
      spent: toMoney(row.spent),
    }));

    const topOverrun = projects
      .map((project) => {
        const remaining = project.budget - project.spent;
        return {
          name: project.name,
          overrun: remaining < 0 ? Math.abs(remaining) : 0,
          remainingPct: project.budget > 0 ? (remaining / project.budget) * 100 : 0,
        };
      })
      .sort((left, right) => right.overrun - left.overrun)[0];

    const redProjects = projects.filter((project) => {
      const remaining = project.budget - project.spent;
      const remainingPct = project.budget > 0 ? (remaining / project.budget) * 100 : 0;
      return remainingPct < 5;
    }).length;

    const purchaseOrdersResult = await db.query<PurchaseOrderRow>(
      `
        select id, project_id, budget_item_id, material_id, material_name, quantity, unit, estimated_cost,
               supplier, supplier_id, notes, status, order_date, date_received, date_paid,
               payment_method, payment_reference, stock_applied, budget_applied, created_at, updated_at
        from purchase_orders
        order by coalesce(date_paid, date_received, order_date, created_at) desc
        limit 200
      `
    );

    const normalizedOrders = purchaseOrdersResult.rows
      .map((row) => {
        const supplierName = String(row.supplier || '').trim() || 'Proveedor sin nombre';
        const materialName = String(row.material_name || '').trim() || 'Material';
        const quantity = toMoney(row.quantity);
        const totalCost = toMoney(row.estimated_cost);
        const unitPrice = quantity > 0 ? totalCost / quantity : 0;
        const timestamp = Date.parse(String(row.date_paid || row.date_received || row.order_date || row.created_at || ''));
        return { supplierName, materialName, unitPrice, timestamp };
      })
      .filter((row) => row.unitPrice > 0 && Number.isFinite(row.timestamp));

    const supplierRows = normalizedOrders.reduce((acc: Record<string, typeof normalizedOrders>, row) => {
      if (!acc[row.supplierName]) acc[row.supplierName] = [];
      acc[row.supplierName].push(row);
      return acc;
    }, {});

    const volatilityRanking = Object.entries(supplierRows)
      .map(([supplierName, rows]) => {
        const materialBuckets = rows.reduce((acc: Record<string, typeof normalizedOrders>, row) => {
          const materialKey = row.materialName.toLowerCase();
          if (!acc[materialKey]) acc[materialKey] = [];
          acc[materialKey].push(row);
          return acc;
        }, {});

        let transitions = 0;
        let totalAbsChange = 0;

        Object.values(materialBuckets).forEach((bucket) => {
          const sorted = [...bucket].sort((left, right) => left.timestamp - right.timestamp);
          for (let index = 1; index < sorted.length; index += 1) {
            const previous = sorted[index - 1].unitPrice;
            const current = sorted[index].unitPrice;
            if (previous <= 0 || current <= 0) continue;
            totalAbsChange += Math.abs(((current - previous) / previous) * 100);
            transitions += 1;
          }
        });

        const volatilityPct = transitions > 0 ? totalAbsChange / transitions : 0;
        return {
          supplierName,
          volatilityPct,
          records: rows.length,
        };
      })
      .filter((row) => row.records >= 2)
      .sort((left, right) => right.volatilityPct - left.volatilityPct);

    const mostVolatile = volatilityRanking[0];
    const bodyParts: string[] = [];

    if (topOverrun && topOverrun.overrun > 0) {
      bodyParts.push(`Proyecto crítico: ${topOverrun.name} (${toMoney(topOverrun.overrun).toLocaleString('es-GT', { style: 'currency', currency: 'GTQ', maximumFractionDigits: 2 })}).`);
    }
    if (redProjects > 0) {
      bodyParts.push(`Proyectos en rojo: ${redProjects}.`);
    }
    if (mostVolatile) {
      bodyParts.push(`Proveedor más volátil: ${mostVolatile.supplierName} (${mostVolatile.volatilityPct.toFixed(1)}%).`);
    }

    if (bodyParts.length === 0) {
      bodyParts.push('Sin alertas críticas en este corte programado.');
    }

    const createdNotification = await createSystemNotification(
      `Resumen programado de costos (${slot}:00)`,
      bodyParts.join(' '),
      'system'
    );

    schedulerStatus.alertsGenerated += 1;
    schedulerStatus.lastSuccessAt = new Date().toISOString();
    schedulerStatus.lastSlot = `${dateKey} ${slot}:00`;
    schedulerStatus.lastSummary = {
      topOverrunProject: topOverrun?.name || null,
      topOverrunAmount: topOverrun?.overrun || 0,
      redProjects,
      mostVolatileSupplier: mostVolatile?.supplierName || null,
      mostVolatilePct: mostVolatile?.volatilityPct || 0,
      notificationId: createdNotification.id || null,
    };

    try {
      await db.query(
        `
          insert into audit_logs (
            project_id,
            user_id,
            user_name,
            user_email,
            action,
            module,
            details,
            type,
            metadata,
            user_agent,
            ip_address
          )
          values ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11)
        `,
        [
          null,
          'server-scheduler',
          'Server Scheduler',
          null,
          'Resumen programado de costos',
          'Scheduler',
          `Alerta programada ${slot}:00 generada correctamente`,
          'system',
          JSON.stringify({
            slot,
            dateKey,
            summary: schedulerStatus.lastSummary,
          }),
          'server',
          null,
        ]
      );
    } catch {
      // Ignore audit persistence failures to avoid breaking scheduler flow.
    }
  };

  let scheduledAlertsTimer: ReturnType<typeof setInterval> | null = null;
  if (SCHEDULED_ALERTS_ENABLED && pool) {
    void runScheduledCostIntelligence().catch((error) => {
      schedulerStatus.failures += 1;
      schedulerStatus.lastErrorAt = new Date().toISOString();
      schedulerStatus.lastError = String(error?.message || error || 'scheduler-initial-run-failed');
      console.error('[scheduler] initial run failed:', error?.message || error);
    });

    scheduledAlertsTimer = setInterval(() => {
      void runScheduledCostIntelligence().catch((error) => {
        schedulerStatus.failures += 1;
        schedulerStatus.lastErrorAt = new Date().toISOString();
        schedulerStatus.lastError = String(error?.message || error || 'scheduler-run-failed');
        console.error('[scheduler] run failed:', error?.message || error);
      });
    }, SCHEDULED_ALERTS_INTERVAL_MS);

    scheduledAlertsTimer.unref?.();
  }

  const configuredCorsOrigins = (process.env.CORS_ORIGINS || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  const derivedCorsOrigins = [process.env.FRONTEND_ORIGIN, process.env.APP_URL]
    .map((value) => String(value || '').trim())
    .filter(Boolean)
    .map((value) => {
      try {
        return new URL(value).origin;
      } catch {
        return '';
      }
    })
    .filter(Boolean);
  const localDevOrigins = [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://localhost:4173',
    'http://127.0.0.1:4173',
    'http://localhost:5173',
    'http://127.0.0.1:5173',
  ];
  const corsOrigins = Array.from(new Set([
    ...configuredCorsOrigins,
    ...derivedCorsOrigins,
    ...localDevOrigins,
  ]));

  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin) return callback(null, true);
        const isAllowed = corsOrigins.includes(origin) || 
                         origin.endsWith('.vercel.app') || 
                         origin.endsWith('.github.io');
        if (isAllowed) {
          callback(null, true);
        } else {
          callback(null, false);
        }
      },
      credentials: true,
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization", "x-user-email"],
    })
  );
  app.use((_req, res, next) => {
    // Allow OAuth popup flows (Google Sign-In) without COOP window.closed warnings.
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
    next();
  });
  app.use(express.json());
  app.use("/uploads", express.static(UPLOADS_PUBLIC_DIR));
  app.use("/uploads", express.static(UPLOADS_FALLBACK_DIR));
  app.get('/favicon.ico', (_req, res) => {
    return res.status(204).end();
  });

  app.use('/api', async (req, res, next) => {
    const dbAvailable = await isDatabaseAvailable();
    if (dbAvailable) return next();

    if (req.path === '/reports/email' && req.method === 'POST') {
      return next();
    }

    if (req.path === '/auth/login' && req.method === 'POST') {
      const email = String(req.body?.email || '').trim().toLowerCase();
      if (!email) {
        return res.status(400).json({ error: 'email es obligatorio' });
      }
      const displayName = String(req.body?.displayName || '').trim() || email.split('@')[0];
      const photoURL = String(req.body?.photoURL || '').trim() || null;
      return res.json(mapFallbackUser(email, displayName, photoURL));
    }

    if (req.method === 'GET') {
      return serveFallbackRead(req, res);
    }

    return res.status(503).json({ error: 'Base de datos no disponible temporalmente' });
  });

  app.get('/api/notifications/stream', (req, res) => {
    if (!pool) {
      return res.status(503).json({ error: 'DATABASE_URL no esta configurado' });
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    res.write('retry: 4000\n\n');
    notificationStreams.add(res);

    const heartbeat = setInterval(() => {
      if (!notificationStreams.has(res)) return;
      try {
        res.write(': keepalive\n\n');
      } catch {
        notificationStreams.delete(res);
      }
    }, 25000);

    req.on('close', () => {
      clearInterval(heartbeat);
      notificationStreams.delete(res);
    });
  });

  app.post('/api/auth/login', async (req, res) => {
    try {
      const db = requireDatabase();
      const email = String(req.body?.email || '').trim().toLowerCase();
      const displayName = String(req.body?.displayName || '').trim();
      const photoURL = String(req.body?.photoURL || '').trim();

      if (!email) {
        return res.status(400).json({ error: 'email es obligatorio' });
      }

      const safeDisplayName = displayName || email.split('@')[0];

      await db.query(
        `
          create table if not exists app_users (
            id text primary key,
            email text not null unique,
            display_name text not null,
            photo_url text,
            created_at timestamptz not null default now(),
            updated_at timestamptz not null default now(),
            last_login_at timestamptz not null default now()
          )
        `
      );

      const result = await db.query<AppUserRow>(
        `
          insert into app_users (id, email, display_name, photo_url, last_login_at)
          values ($1, $2, $3, $4, now())
          on conflict (email)
          do update
          set
            display_name = excluded.display_name,
            photo_url = excluded.photo_url,
            updated_at = now(),
            last_login_at = now()
          returning id, email, display_name, photo_url, created_at, updated_at, last_login_at
        `,
        [randomUUID(), email, safeDisplayName, photoURL || null]
      );

      return res.json(mapAppUser(result.rows[0]));
    } catch (error: any) {
      return res.status(500).json({ error: error?.message || 'No se pudo iniciar sesion' });
    }
  });

  app.post('/api/reports/email', async (req, res) => {
    try {
      const to = String(req.body?.to || '').trim();
      const subject = String(req.body?.subject || '').trim();
      const html = String(req.body?.html || '').trim();
      const fileName = String(req.body?.fileName || 'reporte.pdf').trim();
      const pdfBase64 = String(req.body?.pdfBase64 || '').trim();

      if (!to || !subject || !html || !pdfBase64) {
        return res.status(400).json({ error: 'to, subject, html y pdfBase64 son obligatorios' });
      }

      const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!validEmail.test(to)) {
        return res.status(400).json({ error: 'correo destino inválido' });
      }

      if (!RESEND_API_KEY) {
        return res.status(501).json({
          error: 'Servicio de correo no configurado. Define RESEND_API_KEY y REPORTS_FROM_EMAIL.',
        });
      }

      const safeFileName = fileName.toLowerCase().endsWith('.pdf') ? fileName : `${fileName}.pdf`;

      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: REPORTS_FROM_EMAIL,
          to: [to],
          subject,
          html,
          attachments: [
            {
              filename: safeFileName,
              content: pdfBase64,
            },
          ],
        }),
      });

      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        return res.status(502).json({
          error: 'No se pudo enviar el correo con reporte PDF',
          details: result,
        });
      }

      return res.json({ success: true, providerId: result?.id || null });
    } catch (error: any) {
      return res.status(500).json({
        error: 'Error inesperado al enviar reporte por correo',
        details: String(error?.message || error || ''),
      });
    }
  });

  app.get('/api/settings/thresholds', async (_req, res) => {
    try {
      const db = requireDatabase();

      await db.query(
        `
          create table if not exists app_settings (
            setting_key text primary key,
            setting_value text not null,
            updated_at timestamptz not null default now(),
            updated_by text
          )
        `
      );

      const rows = await db.query<{ setting_key: string; setting_value: string; updated_at: string; updated_by: string | null }>(
        `
          select setting_key, setting_value, updated_at, updated_by
          from app_settings
          where setting_key in (
            'material_weekly_spike_threshold_pct',
            'physical_financial_deviation_threshold_pct'
          )
        `
      );

      const byKey = new Map(rows.rows.map((row) => [row.setting_key, row]));
      const material = Number(byKey.get('material_weekly_spike_threshold_pct')?.setting_value || 10);
      const deviation = Number(byKey.get('physical_financial_deviation_threshold_pct')?.setting_value || 15);
      const latestUpdated = rows.rows
        .map((row) => new Date(row.updated_at).getTime())
        .filter((value) => Number.isFinite(value))
        .sort((a, b) => b - a)[0];
      const latestBy = rows.rows
        .slice()
        .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())[0]?.updated_by || null;

      return res.json({
        materialWeeklySpikeThresholdPct: Number.isFinite(material) ? Math.max(3, Math.min(40, material)) : 10,
        physicalFinancialDeviationThresholdPct: Number.isFinite(deviation) ? Math.max(5, Math.min(40, deviation)) : 15,
        updatedAt: latestUpdated ? new Date(latestUpdated).toISOString() : null,
        updatedBy: latestBy,
        source: 'database',
      });
    } catch (error: any) {
      return res.status(500).json({ error: error?.message || 'No se pudieron leer los umbrales' });
    }
  });

  app.put('/api/settings/thresholds', async (req, res) => {
    try {
      const db = requireDatabase();
      const materialRaw = Number(req.body?.materialWeeklySpikeThresholdPct);
      const deviationRaw = Number(req.body?.physicalFinancialDeviationThresholdPct);

      if (!Number.isFinite(materialRaw) || !Number.isFinite(deviationRaw)) {
        return res.status(400).json({ error: 'Valores de umbral inválidos' });
      }

      const material = Math.max(3, Math.min(40, materialRaw));
      const deviation = Math.max(5, Math.min(40, deviationRaw));
      const updatedBy = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim() || null;

      await db.query(
        `
          create table if not exists app_settings (
            setting_key text primary key,
            setting_value text not null,
            updated_at timestamptz not null default now(),
            updated_by text
          )
        `
      );

      await db.query(
        `
          insert into app_settings (setting_key, setting_value, updated_at, updated_by)
          values
            ('material_weekly_spike_threshold_pct', $1, now(), $3),
            ('physical_financial_deviation_threshold_pct', $2, now(), $3)
          on conflict (setting_key)
          do update
          set
            setting_value = excluded.setting_value,
            updated_at = now(),
            updated_by = excluded.updated_by
        `,
        [String(material), String(deviation), updatedBy]
      );

      return res.json({
        materialWeeklySpikeThresholdPct: material,
        physicalFinancialDeviationThresholdPct: deviation,
        updatedAt: new Date().toISOString(),
        updatedBy,
        source: 'database',
      });
    } catch (error: any) {
      return res.status(500).json({ error: error?.message || 'No se pudieron guardar los umbrales' });
    }
  });

  app.post('/api/uploads', upload.single('file'), async (req, res) => {
    try {
      const file = req.file;
      if (!file) {
        return res.status(400).json({ error: 'Archivo requerido' });
      }

      const requestedPath = String(req.body?.path || '').trim();
      const safePath = toSafeRelativePath(requestedPath || file.originalname);

      const safeDir = path.dirname(safePath) === '.' ? '' : path.dirname(safePath);
      const originalName = path.basename(safePath);
      const timestamp = Date.now();
      const randomToken = Math.random().toString(36).slice(2, 8);
      const finalFileName = `${timestamp}-${randomToken}-${originalName}`;

      const uploadsBaseDir = await resolveWritableUploadsBaseDir();
      const destinationDir = path.join(uploadsBaseDir, safeDir);
      await fs.mkdir(destinationDir, { recursive: true });

      const finalFilePath = path.join(destinationDir, finalFileName);
      await fs.writeFile(finalFilePath, file.buffer);

      const relativeParts = ['uploads'];
      if (safeDir) {
        relativeParts.push(safeDir);
      }
      relativeParts.push(finalFileName);

      const publicUrl = `/${relativeParts.join('/').replace(/\\/g, '/')}`;
      return res.status(201).json({ url: publicUrl });
    } catch (error: any) {
      return res.status(500).json({ error: error?.message || 'No se pudo subir el archivo' });
    }
  });

  // API routes
  app.get("/api/health", async (req, res) => {
    try {
      if (!pool) {
        if (IS_PRODUCTION) {
          return res.status(503).json({ status: "error", db: "not-configured" });
        }
        return res.json({
          status: "ok",
          db: "not-configured",
          telemetry: {
            checks: dbHealthStats.checks,
            successes: dbHealthStats.successes,
            failures: dbHealthStats.failures,
            consecutiveFailures: dbHealthStats.consecutiveFailures,
            lastSuccessAt: dbHealthStats.lastSuccessAt,
            lastFailureAt: dbHealthStats.lastFailureAt,
            lastError: dbHealthStats.lastError,
          },
        });
      }
      await pool.query("select 1");
      return res.json({
        status: "ok",
        db: "connected",
        telemetry: {
          checks: dbHealthStats.checks,
          successes: dbHealthStats.successes,
          failures: dbHealthStats.failures,
          consecutiveFailures: dbHealthStats.consecutiveFailures,
          lastSuccessAt: dbHealthStats.lastSuccessAt,
          lastFailureAt: dbHealthStats.lastFailureAt,
          lastError: dbHealthStats.lastError,
        },
      });
    } catch (error: any) {
      dbHealthStats.checks += 1;
      dbHealthStats.failures += 1;
      dbHealthStats.consecutiveFailures += 1;
      dbHealthStats.lastFailureAt = new Date().toISOString();
      dbHealthStats.lastError = String(error?.message || error || 'db-health-route-error');

      return res.status(500).json({
        status: "error",
        db: "unavailable",
        telemetry: {
          checks: dbHealthStats.checks,
          successes: dbHealthStats.successes,
          failures: dbHealthStats.failures,
          consecutiveFailures: dbHealthStats.consecutiveFailures,
          lastSuccessAt: dbHealthStats.lastSuccessAt,
          lastFailureAt: dbHealthStats.lastFailureAt,
          lastError: dbHealthStats.lastError,
        },
      });
    }
  });

  app.get('/api/scheduler/status', async (_req, res) => {
    return res.json({
      status: 'ok',
      scheduler: {
        ...schedulerStatus,
        activeTimer: Boolean(scheduledAlertsTimer),
        hours: Array.from(SCHEDULED_ALERT_HOURS.values()),
      },
    });
  });

  app.get('/api/ai/health', async (req, res) => {
    const runTest = ['1', 'true', 'yes'].includes(String(req.query.runTest || '').trim().toLowerCase());
    const geminiApiKey = String(process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY || '').trim();
    const githubModelsConfigured = Boolean(GITHUB_MODELS_TOKEN);
    const keySource = process.env.GEMINI_API_KEY
      ? 'GEMINI_API_KEY'
      : (process.env.VITE_GEMINI_API_KEY ? 'VITE_GEMINI_API_KEY' : null);

    if (AI_PROVIDER === 'github-models') {
      if (!githubModelsConfigured) {
        return res.status(503).json({
          status: 'error',
          ai: 'github-models',
          provider: AI_PROVIDER,
          configured: false,
          message: 'GITHUB_MODELS_TOKEN no configurado. Define GITHUB_MODELS_TOKEN en el entorno del servidor.',
        });
      }

      if (!runTest) {
        return res.json({
          status: 'ok',
          ai: 'github-models',
          provider: AI_PROVIDER,
          configured: true,
          endpoint: GITHUB_MODELS_ENDPOINT,
          model: GITHUB_MODELS_MODEL,
          runTest: false,
        });
      }

      try {
        const response = await fetch(GITHUB_MODELS_ENDPOINT, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${GITHUB_MODELS_TOKEN}`,
          },
          body: JSON.stringify({
            model: GITHUB_MODELS_MODEL,
            temperature: 0,
            max_tokens: 16,
            messages: [
              { role: 'system', content: 'Responde solo con la palabra OK.' },
              { role: 'user', content: 'Responde solo con la palabra OK.' },
            ],
          }),
        });

        const payload = await response.json().catch(() => ({} as any));
        if (!response.ok) {
          const errorMessage = String((payload as any)?.error?.message || response.statusText || 'No se pudo validar GitHub Models');
          return res.status(502).json({
            status: 'error',
            ai: 'github-models',
            provider: AI_PROVIDER,
            configured: true,
            endpoint: GITHUB_MODELS_ENDPOINT,
            model: GITHUB_MODELS_MODEL,
            runTest: true,
            message: errorMessage,
          });
        }

        const preview = String((payload as any)?.choices?.[0]?.message?.content || '').slice(0, 120);
        return res.json({
          status: 'ok',
          ai: 'github-models',
          provider: AI_PROVIDER,
          configured: true,
          endpoint: GITHUB_MODELS_ENDPOINT,
          model: GITHUB_MODELS_MODEL,
          runTest: true,
          responsePreview: preview,
        });
      } catch (error: any) {
        return res.status(502).json({
          status: 'error',
          ai: 'github-models',
          provider: AI_PROVIDER,
          configured: true,
          endpoint: GITHUB_MODELS_ENDPOINT,
          model: GITHUB_MODELS_MODEL,
          runTest: true,
          message: error?.message || 'No se pudo validar GitHub Models',
        });
      }
    }

    if (!geminiApiKey) {
      return res.status(503).json({
        status: 'error',
        ai: 'gemini',
        provider: AI_PROVIDER,
        configured: false,
        message: 'Gemini API key no configurada. Define GEMINI_API_KEY en el entorno del servidor.',
      });
    }

    if (!runTest) {
      return res.json({
        status: 'ok',
        ai: 'gemini',
        provider: AI_PROVIDER,
        configured: true,
        keySource,
        runTest: false,
      });
    }

    try {
      const ai = new GoogleGenAI({ apiKey: geminiApiKey });
      const result = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: 'Responde solo con la palabra OK',
      });

      return res.json({
        status: 'ok',
        ai: 'gemini',
        provider: AI_PROVIDER,
        configured: true,
        keySource,
        runTest: true,
        model: 'gemini-3-flash-preview',
        responsePreview: String(result.text || '').slice(0, 120),
      });
    } catch (error: any) {
      return res.status(502).json({
        status: 'error',
        ai: 'gemini',
        provider: AI_PROVIDER,
        configured: true,
        keySource,
        runTest: true,
        message: error?.message || 'No se pudo validar Gemini',
      });
    }
  });

  app.post('/api/ai/chat', async (req, res) => {
    const body = req.body || {};
    const message = String(body.message || '').trim();
    const history = Array.isArray(body.history) ? body.history : [];

    if (!message) {
      return res.status(400).json({ error: 'message es obligatorio' });
    }

    const normalizedHistory = history
      .map((entry: any) => ({
        role: String(entry?.role || '').trim().toLowerCase(),
        text: String(entry?.text || '').trim(),
      }))
      .filter((entry: any) => (entry.role === 'user' || entry.role === 'assistant') && Boolean(entry.text))
      .slice(-12);

    if (AI_PROVIDER === 'github-models') {
      if (!GITHUB_MODELS_TOKEN) {
        return res.status(503).json({
          error: 'Proveedor AI no configurado. Falta GITHUB_MODELS_TOKEN.',
          provider: AI_PROVIDER,
        });
      }

      try {
        const messages = [
          {
            role: 'system',
            content: 'Eres el asistente de WM_M&S Constructora. Responde en espanol, con recomendaciones accionables para operaciones, costos, riesgos y proyectos.',
          },
          ...normalizedHistory.map((entry: any) => ({
            role: entry.role,
            content: entry.text,
          })),
          { role: 'user', content: message },
        ];

        const response = await fetch(GITHUB_MODELS_ENDPOINT, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${GITHUB_MODELS_TOKEN}`,
          },
          body: JSON.stringify({
            model: GITHUB_MODELS_MODEL,
            temperature: 0.3,
            messages,
          }),
        });

        const payload = await response.json().catch(() => ({} as any));

        if (!response.ok) {
          const errorMessage = String((payload as any)?.error?.message || response.statusText || 'Error en GitHub Models');
          return res.status(502).json({
            error: errorMessage,
            provider: AI_PROVIDER,
          });
        }

        const reply = String((payload as any)?.choices?.[0]?.message?.content || '').trim();
        if (!reply) {
          return res.status(502).json({
            error: 'Respuesta vacia de GitHub Models',
            provider: AI_PROVIDER,
          });
        }

        return res.json({
          provider: AI_PROVIDER,
          model: GITHUB_MODELS_MODEL,
          response: reply,
        });
      } catch (error: any) {
        return res.status(502).json({
          error: error?.message || 'No se pudo conectar con GitHub Models',
          provider: AI_PROVIDER,
        });
      }
    }

    const geminiApiKey = String(process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY || '').trim();
    if (!geminiApiKey) {
      return res.status(503).json({
        error: 'Proveedor AI no configurado. Falta GEMINI_API_KEY.',
        provider: AI_PROVIDER,
      });
    }

    try {
      const ai = new GoogleGenAI({ apiKey: geminiApiKey });
      const model = String(process.env.GEMINI_MODEL || process.env.VITE_GEMINI_MODEL || 'gemini-2.5-flash').trim();
      const contents = [
        ...normalizedHistory.map((entry: any) => ({
          role: entry.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: entry.text }],
        })),
        { role: 'user', parts: [{ text: message }] },
      ];

      const result = await ai.models.generateContent({
        model,
        contents,
      });

      const reply = String(result.text || '').trim();
      if (!reply) {
        return res.status(502).json({ error: 'Respuesta vacia de Gemini', provider: AI_PROVIDER });
      }

      return res.json({
        provider: 'gemini',
        model,
        response: reply,
      });
    } catch (error: any) {
      return res.status(502).json({
        error: error?.message || 'No se pudo conectar con Gemini',
        provider: AI_PROVIDER,
      });
    }
  });

  app.post('/api/documents/ocr-validate', async (req, res) => {
    try {
      const db = requireDatabase();
      const rawText = String(req.body?.rawText || '').trim();
      const imageDataUrl = String(req.body?.imageDataUrl || '').trim();
      const purchaseOrderId = String(req.body?.purchaseOrderId || '').trim();
      const projectId = String(req.body?.projectId || '').trim();
      const autoApply = Boolean(req.body?.autoApply);
      const requestedBy = String(req.body?.requestedBy || 'IA Copiloto').trim() || 'IA Copiloto';

      if (!rawText && !imageDataUrl) {
        return res.status(400).json({ error: 'rawText o imageDataUrl es obligatorio' });
      }

      const parseAmount = (value: any) => {
        const normalized = String(value || '').replace(/[^0-9.,-]/g, '').replace(/,/g, '');
        const amount = Number(normalized);
        return Number.isFinite(amount) ? amount : 0;
      };

      const parseByRegex = (text: string) => {
        const supplierMatch = text.match(/(?:proveedor|supplier|empresa)\s*[:\-]\s*([^\n\r]+)/i);
        const totalMatch = text.match(/(?:total|monto|importe)\s*[:\-]?\s*(?:Q|GTQ|\$)?\s*([0-9][\d.,]*)/i);
        const dateMatch = text.match(/(\d{2}[\/\-]\d{2}[\/\-]\d{2,4})/);
        const invoiceMatch = text.match(/(?:factura|invoice|no\.?\s*factura)\s*[:#\-]?\s*([A-Z0-9\-]+)/i);

        return {
          supplier: supplierMatch?.[1]?.trim() || null,
          total: totalMatch ? parseAmount(totalMatch[1]) : 0,
          date: dateMatch?.[1] || null,
          invoiceNumber: invoiceMatch?.[1] || null,
        };
      };

      const extractFromImageWithGemini = async (dataUrl: string) => {
        const geminiApiKey = String(process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY || '').trim();
        if (!geminiApiKey) return null;

        const match = dataUrl.match(/^data:(.+);base64,(.+)$/);
        if (!match) return null;

        const mimeType = match[1];
        const base64Data = match[2];

        const ai = new GoogleGenAI({ apiKey: geminiApiKey });
        const model = String(process.env.GEMINI_MODEL || process.env.VITE_GEMINI_MODEL || 'gemini-2.5-flash').trim();
        const prompt = [
          'Extrae de este documento solo JSON valido con las llaves:',
          'supplier, total, date, invoiceNumber.',
          'Si no encuentras un valor, responde null.',
          'total debe ser numerico sin simbolos.',
        ].join(' ');

        const result = await ai.models.generateContent({
          model,
          contents: [
            {
              role: 'user',
              parts: [
                { text: prompt },
                {
                  inlineData: {
                    mimeType,
                    data: base64Data,
                  },
                },
              ],
            },
          ],
        });

        const text = String(result.text || '').trim();
        const jsonText = text.replace(/```json|```/gi, '').trim();
        try {
          const parsed = JSON.parse(jsonText);
          return {
            supplier: parsed?.supplier ? String(parsed.supplier).trim() : null,
            total: parseAmount(parsed?.total),
            date: parsed?.date ? String(parsed.date).trim() : null,
            invoiceNumber: parsed?.invoiceNumber ? String(parsed.invoiceNumber).trim() : null,
          };
        } catch {
          return null;
        }
      };

      const extractedFromImage = imageDataUrl ? await extractFromImageWithGemini(imageDataUrl) : null;
      const extractedFromText = rawText ? parseByRegex(rawText) : null;
      const extracted = {
        supplier: extractedFromImage?.supplier || extractedFromText?.supplier || null,
        total: extractedFromImage?.total || extractedFromText?.total || 0,
        date: extractedFromImage?.date || extractedFromText?.date || null,
        invoiceNumber: extractedFromImage?.invoiceNumber || extractedFromText?.invoiceNumber || null,
      };

      const checks: Array<{ name: string; status: 'pass' | 'warn' | 'fail'; detail: string }> = [];
      let score = 100;
      let amountVariancePct: number | null = null;
      let supplierMatches: boolean | null = null;
      let linkedPurchaseOrder: PurchaseOrderRow | null = null;

      if (extracted.total <= 0) {
        checks.push({ name: 'Extraccion de monto', status: 'fail', detail: 'No se pudo extraer monto total del documento.' });
        score -= 35;
      } else {
        checks.push({ name: 'Extraccion de monto', status: 'pass', detail: `Monto detectado: Q${extracted.total.toFixed(2)}` });
      }

      if (purchaseOrderId) {
        const poResult = await db.query<PurchaseOrderRow>(
          `
            select id, project_id, budget_item_id, material_id, material_name, quantity, unit, estimated_cost,
                   supplier, supplier_id, notes, status, order_date, date_received, date_paid,
                   payment_method, payment_reference, stock_applied, budget_applied, created_at, updated_at
            from purchase_orders
            where id = $1
            limit 1
          `,
          [purchaseOrderId]
        );

        const po = poResult.rows[0];
        linkedPurchaseOrder = po || null;
        if (!po) {
          checks.push({ name: 'Orden de compra', status: 'fail', detail: 'No se encontró la orden de compra seleccionada.' });
          score -= 35;
        } else {
          const poEstimated = parseAmount(po.estimated_cost);
          if (extracted.total > 0 && poEstimated > 0) {
            const diffPct = Math.abs(((extracted.total - poEstimated) / poEstimated) * 100);
            amountVariancePct = Number(diffPct.toFixed(2));
            if (diffPct <= 8) {
              checks.push({ name: 'Coincidencia de monto OC', status: 'pass', detail: `Variación ${diffPct.toFixed(2)}% (dentro de tolerancia).` });
            } else if (diffPct <= 15) {
              checks.push({ name: 'Coincidencia de monto OC', status: 'warn', detail: `Variación ${diffPct.toFixed(2)}% (revisar).` });
              score -= 12;
            } else {
              checks.push({ name: 'Coincidencia de monto OC', status: 'fail', detail: `Variación ${diffPct.toFixed(2)}% (alto riesgo).` });
              score -= 30;
            }
          }

          if (extracted.supplier && po.supplier) {
            const supplierMatch = String(po.supplier).toLowerCase().includes(String(extracted.supplier).toLowerCase()) ||
              String(extracted.supplier).toLowerCase().includes(String(po.supplier).toLowerCase());
            supplierMatches = supplierMatch;
            if (supplierMatch) {
              checks.push({ name: 'Proveedor', status: 'pass', detail: `Proveedor coincide con OC (${po.supplier}).` });
            } else {
              checks.push({ name: 'Proveedor', status: 'warn', detail: `Proveedor documento (${extracted.supplier}) difiere de OC (${po.supplier}).` });
              score -= 10;
            }
          }
        }
      }

      if (projectId && extracted.total > 0) {
        const projectResult = await db.query<ProjectRow>(
          `
            select id, name, location, project_manager, area, status, budget, spent, physical_progress, financial_progress,
                   start_date, end_date, client_uid, typology, latitude, longitude, created_at
            from projects
            where id = $1
            limit 1
          `,
          [projectId]
        );

        const project = projectResult.rows[0];
        if (!project) {
          checks.push({ name: 'Proyecto', status: 'warn', detail: 'No se encontró el proyecto para validar presupuesto.' });
          score -= 8;
        } else {
          const budget = parseAmount(project.budget);
          const spent = parseAmount(project.spent);
          const remaining = budget - spent;
          if (remaining <= 0) {
            checks.push({ name: 'Presupuesto disponible', status: 'fail', detail: `Proyecto sin saldo disponible (${project.name}).` });
            score -= 25;
          } else if (extracted.total <= remaining * 1.05) {
            checks.push({ name: 'Presupuesto disponible', status: 'pass', detail: `Documento dentro del saldo estimado (${project.name}).` });
          } else {
            checks.push({ name: 'Presupuesto disponible', status: 'warn', detail: `Documento supera saldo estimado en ${(((extracted.total - remaining) / Math.max(1, remaining)) * 100).toFixed(1)}%.` });
            score -= 15;
          }
        }
      }

      const normalizedScore = Math.max(0, Math.min(100, score));
      const resultStatus = normalizedScore >= 80 ? 'aprobado' : normalizedScore >= 60 ? 'revisar' : 'rechazado';
      const failChecks = checks.filter((check) => check.status === 'fail').length;
      const approveScore = Number(process.env.OCR_AUTO_APPROVE_MIN_SCORE || 85);
      const reviewScore = Number(process.env.OCR_AUTO_REVIEW_MIN_SCORE || 60);
      const maxVariancePct = Number(process.env.OCR_AUTO_APPROVE_MAX_VARIANCE_PCT || 8);

      const decision: 'approved' | 'review' | 'rejected' =
        normalizedScore >= approveScore &&
        failChecks === 0 &&
        (amountVariancePct === null || amountVariancePct <= maxVariancePct) &&
        (supplierMatches === null || supplierMatches === true)
          ? 'approved'
          : normalizedScore >= reviewScore
            ? 'review'
            : 'rejected';

      let autoAction: {
        requested: boolean;
        applied: boolean;
        summary: string;
        workflowId?: string | null;
      } = {
        requested: autoApply,
        applied: false,
        summary: 'Sin ejecución automática',
      };

      const createDecisionWorkflow = async (workflowStatus: 'pending' | 'approved' | 'rejected', priority: 'low' | 'medium' | 'high', detail: string) => {
        const workflowId = randomUUID();
        const created = await db.query<WorkflowRow>(
          `
            insert into workflows (
              id,
              title,
              type,
              reference_id,
              status,
              requested_by,
              requested_at,
              priority,
              description,
              amount,
              resolved_at
            ) values ($1,$2,$3,$4,$5,$6,now(),$7,$8,$9,$10)
            returning
              id,
              title,
              type,
              reference_id,
              status,
              requested_by,
              requested_at::text,
              priority,
              description,
              amount,
              resolved_at::text,
              created_at,
              updated_at
          `,
          [
            workflowId,
            'Validación OCR automática',
            'purchase_order',
            purchaseOrderId || projectId || workflowId,
            workflowStatus,
            requestedBy,
            priority,
            detail,
            Number(extracted.total || 0) || null,
            workflowStatus === 'pending' ? null : new Date().toISOString(),
          ]
        );
        return created.rows[0]?.id || null;
      };

      if (autoApply) {
        if (decision === 'approved') {
          if (linkedPurchaseOrder?.id) {
            await db.query(
              `
                update purchase_orders
                set status = 'Completed', updated_at = now()
                where id = $1
              `,
              [linkedPurchaseOrder.id]
            );
          }

          const workflowId = await createDecisionWorkflow(
            'approved',
            'medium',
            `Documento aprobado automáticamente por motor OCR (score ${normalizedScore}).`
          );

          await createSystemNotification(
            'OCR aprobado automáticamente',
            `Documento ${extracted.invoiceNumber || 'sin número'} aprobado. Score ${normalizedScore}.`,
            'project'
          );

          autoAction = {
            requested: true,
            applied: true,
            summary: 'Aprobado y aplicado automáticamente',
            workflowId,
          };
        } else if (decision === 'review') {
          const workflowId = await createDecisionWorkflow(
            'pending',
            'high',
            `Documento requiere revisión manual (score ${normalizedScore}).`
          );

          await createSystemNotification(
            'OCR requiere revisión',
            `Documento ${extracted.invoiceNumber || 'sin número'} enviado a revisión manual. Score ${normalizedScore}.`,
            'project'
          );

          autoAction = {
            requested: true,
            applied: true,
            summary: 'Enviado a revisión manual con workflow pendiente',
            workflowId,
          };
        } else {
          const workflowId = await createDecisionWorkflow(
            'rejected',
            'high',
            `Documento rechazado por motor OCR (score ${normalizedScore}).`
          );

          await createSystemNotification(
            'OCR rechazado automáticamente',
            `Documento ${extracted.invoiceNumber || 'sin número'} rechazado por alto riesgo. Score ${normalizedScore}.`,
            'project'
          );

          autoAction = {
            requested: true,
            applied: true,
            summary: 'Rechazado automáticamente y registrado en workflow',
            workflowId,
          };
        }
      }

      await db.query(
        `
          create table if not exists ocr_validations (
            id text primary key,
            project_id text,
            purchase_order_id text,
            invoice_number text,
            supplier text,
            detected_total numeric,
            score integer not null,
            result_status text not null,
            decision text not null,
            auto_apply boolean not null default false,
            auto_action_status text,
            auto_action_summary text,
            checks jsonb,
            recommendations jsonb,
            created_by text,
            created_at timestamptz not null default now()
          )
        `
      );

      await db.query(
        `
          insert into ocr_validations (
            id,
            project_id,
            purchase_order_id,
            invoice_number,
            supplier,
            detected_total,
            score,
            result_status,
            decision,
            auto_apply,
            auto_action_status,
            auto_action_summary,
            checks,
            recommendations,
            created_by
          )
          values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,$14::jsonb,$15)
        `,
        [
          randomUUID(),
          projectId || null,
          purchaseOrderId || null,
          extracted.invoiceNumber || null,
          extracted.supplier || null,
          Number(extracted.total || 0),
          Math.round(normalizedScore),
          resultStatus,
          decision,
          autoApply,
          autoAction.applied ? 'applied' : 'not_applied',
          autoAction.summary,
          JSON.stringify(checks),
          JSON.stringify(
            checks
              .filter((check) => check.status !== 'pass')
              .map((check) => `Acción sugerida: ${check.name} - ${check.detail}`)
          ),
          requestedBy,
        ]
      );

      return res.json({
        status: resultStatus,
        score: normalizedScore,
        decision,
        extracted,
        checks,
        recommendations: checks
          .filter((check) => check.status !== 'pass')
          .map((check) => `Acción sugerida: ${check.name} - ${check.detail}`),
        autoAction,
      });
    } catch (error: any) {
      return res.status(500).json({ error: error?.message || 'No se pudo validar el documento' });
    }
  });

  app.get('/api/documents/ocr-validations', async (req, res) => {
    try {
      const db = requireDatabase();
      const projectId = String(req.query.projectId || '').trim();
      const purchaseOrderId = String(req.query.purchaseOrderId || '').trim();
      const supplier = String(req.query.supplier || '').trim();
      const invoiceNumber = String(req.query.invoiceNumber || '').trim();
      const from = String(req.query.from || '').trim();
      const to = String(req.query.to || '').trim();
      const limit = Math.min(Math.max(Number(req.query.limit || 20), 1), 200);
      const offset = Math.max(Number(req.query.offset || 0), 0);

      await db.query(
        `
          create table if not exists ocr_validations (
            id text primary key,
            project_id text,
            purchase_order_id text,
            invoice_number text,
            supplier text,
            detected_total numeric,
            score integer not null,
            result_status text not null,
            decision text not null,
            auto_apply boolean not null default false,
            auto_action_status text,
            auto_action_summary text,
            checks jsonb,
            recommendations jsonb,
            created_by text,
            created_at timestamptz not null default now()
          )
        `
      );

      const where: string[] = [];
      const values: any[] = [];
      if (projectId) {
        values.push(projectId);
        where.push(`project_id = $${values.length}`);
      }
      if (purchaseOrderId) {
        values.push(purchaseOrderId);
        where.push(`purchase_order_id = $${values.length}`);
      }
      if (supplier) {
        values.push(`%${supplier.toLowerCase()}%`);
        where.push(`lower(coalesce(supplier, '')) like $${values.length}`);
      }
      if (invoiceNumber) {
        values.push(`%${invoiceNumber.toLowerCase()}%`);
        where.push(`lower(coalesce(invoice_number, '')) like $${values.length}`);
      }
      if (from) {
        values.push(from);
        where.push(`created_at >= $${values.length}::timestamptz`);
      }
      if (to) {
        values.push(to);
        where.push(`created_at <= $${values.length}::timestamptz`);
      }
      values.push(limit);
      values.push(offset);

      const whereClause = where.length > 0 ? `where ${where.join(' and ')}` : '';
      const rows = await db.query<OcrValidationRow>(
        `
          select
            id,
            project_id,
            purchase_order_id,
            invoice_number,
            supplier,
            detected_total,
            score,
            result_status,
            decision,
            auto_apply,
            auto_action_status,
            auto_action_summary,
            created_by,
            created_at
          from ocr_validations
          ${whereClause}
          order by created_at desc
          limit $${values.length - 1}
          offset $${values.length}
        `,
        values
      );

      return res.json({
        items: rows.rows.map(mapOcrValidation),
        hasMore: rows.rows.length === limit,
        limit,
        offset,
      });
    } catch (error: any) {
      return res.status(500).json({ error: error?.message || 'No se pudo obtener historial OCR' });
    }
  });

  app.get("/api/transactions", async (req, res) => {
    try {
      const db = requireDatabase();
      const limit = Math.min(Math.max(Number(req.query.limit || 50), 1), 200);
      const offset = Math.max(Number(req.query.offset || 0), 0);
      const projectId = String(req.query.projectId || "").trim();
      const subcontractId = String(req.query.subcontractId || "").trim();
      const from = String(req.query.from || "").trim();
      const to = String(req.query.to || "").trim();

      const where: string[] = [];
      const values: Array<string | number> = [];

      if (projectId) {
        values.push(projectId);
        where.push(`project_id = $${values.length}`);
      }
      if (subcontractId) {
        values.push(subcontractId);
        where.push(`subcontract_id = $${values.length}`);
      }
      if (from) {
        values.push(from);
        where.push(`date >= $${values.length}`);
      }
      if (to) {
        values.push(to);
        where.push(`date <= $${values.length}`);
      }

      const whereClause = where.length > 0 ? `where ${where.join(" and ")}` : "";

      values.push(limit);
      const limitParam = `$${values.length}`;
      values.push(offset);
      const offsetParam = `$${values.length}`;

      const result = await db.query<TransactionRow>(
        `
          select id, project_id, budget_item_id, subcontract_id, type, category, amount, date::text, description, account_type, income_origin, funding_source, created_at
          from financial_transactions
          ${whereClause}
          order by date desc, created_at desc
          limit ${limitParam} offset ${offsetParam}
        `,
        values
      );

      res.json({
        items: result.rows.map(mapTransaction),
        hasMore: result.rows.length === limit,
        offset,
        limit,
      });
    } catch (error: any) {
      res.status(500).json({ error: error?.message || "No se pudieron obtener transacciones" });
    }
  });

  app.get("/api/projects", async (req, res) => {
    try {
      const db = requireDatabase();
      const result = await db.query<ProjectRow>(
        `
          select
            id,
            name,
            location,
            project_manager,
            area,
            status,
            budget,
            spent,
            physical_progress,
            financial_progress,
            start_date::text,
            end_date::text,
            client_uid,
            typology,
            latitude,
            longitude,
            created_at
          from projects
          order by created_at desc
        `
      );

      return res.json({ items: result.rows.map(mapProject) });
    } catch (error: any) {
      return res.status(500).json({ error: error?.message || "No se pudieron obtener proyectos" });
    }
  });

  app.post('/api/projects', async (req, res) => {
    try {
      const db = requireDatabase();
      const body = req.body || {};

      const name = String(body.name || '').trim();
      const location = String(body.location || '').trim();
      const projectManager = String(body.projectManager || '').trim();
      const status = String(body.status || 'Planning').trim();
      const spent = Number(body.spent || 0);
      const physicalProgress = Number(body.physicalProgress || 0);
      const budget = 0;
      const financialProgress = 0;
      const area = Number(body.area || 0);
      const startDate = String(body.startDate || '').trim();
      const endDate = String(body.endDate || '').trim();
      const clientUid = String(body.clientUid || '').trim();
      const typology = String(body.typology || 'RESIDENCIAL').trim();
      const latitude = body.latitude !== undefined && body.latitude !== '' ? Number(body.latitude) : null;
      const longitude = body.longitude !== undefined && body.longitude !== '' ? Number(body.longitude) : null;

      if (!name || !location) {
        return res.status(400).json({ error: 'name y location son obligatorios' });
      }

      const result = await db.query<ProjectRow>(
        `
          insert into projects (
            name,
            location,
            project_manager,
            area,
            status,
            budget,
            spent,
            physical_progress,
            financial_progress,
            start_date,
            end_date,
            client_uid,
            typology,
            latitude,
            longitude
          )
          values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::date,$11::date,$12,$13,$14,$15)
          returning
            id,
            name,
            location,
            project_manager,
            area,
            status,
            budget,
            spent,
            physical_progress,
            financial_progress,
            start_date::text,
            end_date::text,
            client_uid,
            typology,
            latitude,
            longitude,
            created_at
        `,
        [
          name,
          location,
          projectManager || null,
          area,
          status,
          budget,
          spent,
          physicalProgress,
          financialProgress,
          startDate || null,
          endDate || null,
          clientUid || null,
          typology,
          latitude,
          longitude,
        ]
      );

      return res.status(201).json(mapProject(result.rows[0]));
    } catch (error: any) {
      return res.status(500).json({ error: error?.message || 'No se pudo crear el proyecto' });
    }
  });

  app.put('/api/projects/:projectId', async (req, res) => {
    try {
      const db = requireDatabase();
      const projectId = String(req.params.projectId || '').trim();
      const body = req.body || {};

      if (!projectId) {
        return res.status(400).json({ error: 'projectId requerido' });
      }

      const existingProject = await db.query<{ budget: string | null }>(
        'select budget from projects where id = $1',
        [projectId]
      );
      if (!existingProject.rows[0]) {
        return res.status(404).json({ error: 'Proyecto no encontrado' });
      }

      const name = String(body.name || '').trim();
      const location = String(body.location || '').trim();
      const projectManager = String(body.projectManager || '').trim();
      const status = String(body.status || 'Planning').trim();
      const budget = Number(existingProject.rows[0].budget || 0);
      const spent = Number(body.spent || 0);
      const physicalProgress = Number(body.physicalProgress || 0);
      const financialProgress = budget > 0 ? (spent / budget) * 100 : 0;
      const area = Number(body.area || 0);
      const startDate = String(body.startDate || '').trim();
      const endDate = String(body.endDate || '').trim();
      const clientUid = String(body.clientUid || '').trim();
      const typology = String(body.typology || 'RESIDENCIAL').trim();
      const latitude = body.latitude !== undefined && body.latitude !== '' ? Number(body.latitude) : null;
      const longitude = body.longitude !== undefined && body.longitude !== '' ? Number(body.longitude) : null;

      if (!name || !location) {
        return res.status(400).json({ error: 'name y location son obligatorios' });
      }

      const result = await db.query<ProjectRow>(
        `
          update projects
          set
            name = $2,
            location = $3,
            project_manager = $4,
            area = $5,
            status = $6,
            budget = $7,
            spent = $8,
            physical_progress = $9,
            financial_progress = $10,
            start_date = $11::date,
            end_date = $12::date,
            client_uid = $13,
            typology = $14,
            latitude = $15,
            longitude = $16
          where id = $1
          returning
            id,
            name,
            location,
            project_manager,
            area,
            status,
            budget,
            spent,
            physical_progress,
            financial_progress,
            start_date::text,
            end_date::text,
            client_uid,
            typology,
            latitude,
            longitude,
            created_at
        `,
        [
          projectId,
          name,
          location,
          projectManager || null,
          area,
          status,
          budget,
          spent,
          physicalProgress,
          financialProgress,
          startDate || null,
          endDate || null,
          clientUid || null,
          typology,
          latitude,
          longitude,
        ]
      );

      if (!result.rows[0]) {
        return res.status(404).json({ error: 'Proyecto no encontrado' });
      }

      return res.json(mapProject(result.rows[0]));
    } catch (error: any) {
      return res.status(500).json({ error: error?.message || 'No se pudo actualizar el proyecto' });
    }
  });

  app.delete('/api/projects/:projectId', async (req, res) => {
    try {
      const db = requireDatabase();
      const projectId = String(req.params.projectId || '').trim();
      if (!projectId) {
        return res.status(400).json({ error: 'projectId requerido' });
      }

      const deleted = await db.query('delete from projects where id = $1', [projectId]);
      if (deleted.rowCount === 0) {
        return res.status(404).json({ error: 'Proyecto no encontrado' });
      }

      return res.status(204).send();
    } catch (error: any) {
      return res.status(500).json({ error: error?.message || 'No se pudo eliminar el proyecto' });
    }
  });

  app.get("/api/projects/:projectId/budget-items", async (req, res) => {
    try {
      const db = requireDatabase();
      const projectId = String(req.params.projectId || "").trim();
      if (!projectId) {
        return res.status(400).json({ error: "projectId requerido" });
      }

      const result = await db.query<BudgetItemRow>(
        `
          select
            id,
            project_id,
            description,
            category,
            unit,
            quantity,
            material_cost,
            labor_cost,
            indirect_cost,
            total_unit_price,
            total_item_price,
            estimated_days,
            notes,
            material_details,
            indirect_factor,
            materials,
            labor,
            subtasks,
            progress,
            sort_order,
            created_at,
            updated_at
          from project_budget_items
          where project_id = $1
          order by sort_order asc, description asc
        `,
        [projectId]
      );

      return res.json({ items: result.rows.map(mapBudgetItem) });
    } catch (error: any) {
      return res.status(500).json({ error: error?.message || "No se pudieron obtener partidas" });
    }
  });

  app.post('/api/projects/:projectId/budget-items', async (req, res) => {
    try {
      const db = requireDatabase();
      const projectId = String(req.params.projectId || '').trim();
      const body = req.body || {};
      const description = String(body.description || '').trim();
      const category = String(body.category || '').trim();
      const unit = String(body.unit || '').trim();
      const notes = String(body.notes || '').trim();
      const materialDetails = String(body.materialDetails || '').trim();
      const indirectFactor = toNonNegativeNumber(body.indirectFactor ?? 0.2, 'indirectFactor', 0.2);
      const materials = normalizeBudgetMaterials(body.materials);
      const labor = normalizeBudgetLabor(body.labor);
      const subtasks = Array.isArray(body.subtasks) ? body.subtasks : [];
      const order = Number(body.order || 0);
      const progress = Math.max(0, Math.min(100, toFiniteNumber(body.progress, 0)));

      if (!projectId || !description) {
        return res.status(400).json({ error: 'projectId y description son obligatorios' });
      }

      const metrics = computeBudgetMetrics({
        quantity: body.quantity,
        indirectFactor,
        materials,
        labor,
        fallbackMaterialCost: body.materialCost,
        fallbackLaborCost: body.laborCost,
        fallbackEstimatedDays: body.estimatedDays,
      });

      const result = await db.query<BudgetItemRow>(
        `
          insert into project_budget_items (
            project_id,
            description,
            category,
            unit,
            quantity,
            material_cost,
            labor_cost,
            indirect_cost,
            total_unit_price,
            total_item_price,
            estimated_days,
            notes,
            material_details,
            indirect_factor,
            materials,
            labor,
            subtasks,
            progress,
            sort_order
          )
          values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15::jsonb,$16::jsonb,$17::jsonb,$18,$19)
          returning
            id,
            project_id,
            description,
            category,
            unit,
            quantity,
            material_cost,
            labor_cost,
            indirect_cost,
            total_unit_price,
            total_item_price,
            estimated_days,
            notes,
            material_details,
            indirect_factor,
            materials,
            labor,
            subtasks,
            progress,
            sort_order,
            created_at,
            updated_at
        `,
        [
          projectId,
          description,
          category || null,
          unit || null,
          metrics.quantity,
          metrics.materialCost,
          metrics.laborCost,
          metrics.indirectCost,
          metrics.totalUnitPrice,
          metrics.totalItemPrice,
          metrics.estimatedDays,
          notes || null,
          materialDetails || null,
          metrics.indirectFactor,
          JSON.stringify(materials),
          JSON.stringify(labor),
          JSON.stringify(subtasks),
          order,
          progress,
        ]
      );

      return res.status(201).json(mapBudgetItem(result.rows[0]));
    } catch (error: any) {
      if (error instanceof ValidationError) {
        return res.status(400).json({ error: error.message });
      }
      return res.status(500).json({ error: error?.message || 'No se pudo crear partida' });
    }
  });

  app.patch('/api/projects/:projectId/budget-items/:itemId', async (req, res) => {
    try {
      const db = requireDatabase();
      const projectId = String(req.params.projectId || '').trim();
      const itemId = String(req.params.itemId || '').trim();
      const body = req.body || {};

      if (!projectId || !itemId) {
        return res.status(400).json({ error: 'projectId e itemId son obligatorios' });
      }

      const existingResult = await db.query<BudgetItemRow>(
        `
          select
            id,
            project_id,
            description,
            category,
            unit,
            quantity,
            material_cost,
            labor_cost,
            indirect_cost,
            total_unit_price,
            total_item_price,
            estimated_days,
            notes,
            material_details,
            indirect_factor,
            materials,
            labor,
            subtasks,
            progress,
            sort_order,
            created_at,
            updated_at
          from project_budget_items
          where project_id = $1 and id = $2
        `,
        [projectId, itemId]
      );

      if (!existingResult.rows[0]) {
        return res.status(404).json({ error: 'Partida no encontrada' });
      }

      const existing = mapBudgetItem(existingResult.rows[0]);

      const description = body.description !== undefined
        ? String(body.description || '').trim()
        : existing.description;
      const category = body.category !== undefined
        ? String(body.category || '').trim() || null
        : existing.category;
      const unit = body.unit !== undefined
        ? String(body.unit || '').trim() || null
        : existing.unit;
      const notes = body.notes !== undefined
        ? String(body.notes || '').trim() || null
        : existing.notes;
      const materialDetails = body.materialDetails !== undefined
        ? String(body.materialDetails || '').trim() || null
        : existing.materialDetails;
      const subtasks = body.subtasks !== undefined
        ? (Array.isArray(body.subtasks) ? body.subtasks : [])
        : existing.subtasks;
      const sortOrder = body.order !== undefined ? Number(body.order || 0) : existing.order;
      const progress = body.progress !== undefined
        ? Math.max(0, Math.min(100, toFiniteNumber(body.progress, existing.progress || 0)))
        : Math.max(0, Math.min(100, toFiniteNumber(existing.progress, 0)));

      const materials = body.materials !== undefined
        ? normalizeBudgetMaterials(body.materials)
        : normalizeBudgetMaterials(existing.materials);
      const labor = body.labor !== undefined
        ? normalizeBudgetLabor(body.labor)
        : normalizeBudgetLabor(existing.labor);
      const indirectFactor = body.indirectFactor !== undefined
        ? toNonNegativeNumber(body.indirectFactor, 'indirectFactor', existing.indirectFactor || 0.2)
        : toNonNegativeNumber(existing.indirectFactor, 'indirectFactor', 0.2);

      if (!description) {
        return res.status(400).json({ error: 'description es obligatorio' });
      }

      const metrics = computeBudgetMetrics({
        quantity: body.quantity !== undefined ? body.quantity : existing.quantity,
        indirectFactor,
        materials,
        labor,
        fallbackMaterialCost: body.materialCost !== undefined ? body.materialCost : existing.materialCost,
        fallbackLaborCost: body.laborCost !== undefined ? body.laborCost : existing.laborCost,
        fallbackEstimatedDays: body.estimatedDays !== undefined ? body.estimatedDays : existing.estimatedDays,
      });

      const result = await db.query<BudgetItemRow>(
        `
          update project_budget_items
          set
            description = $1,
            category = $2,
            unit = $3,
            quantity = $4,
            material_cost = $5,
            labor_cost = $6,
            indirect_cost = $7,
            total_unit_price = $8,
            total_item_price = $9,
            estimated_days = $10,
            notes = $11,
            material_details = $12,
            indirect_factor = $13,
            materials = $14::jsonb,
            labor = $15::jsonb,
            subtasks = $16::jsonb,
            progress = $17,
            sort_order = $18,
            updated_at = now()
          where project_id = $19 and id = $20
          returning
            id,
            project_id,
            description,
            category,
            unit,
            quantity,
            material_cost,
            labor_cost,
            indirect_cost,
            total_unit_price,
            total_item_price,
            estimated_days,
            notes,
            material_details,
            indirect_factor,
            materials,
            labor,
            subtasks,
            progress,
            sort_order,
            created_at,
            updated_at
        `,
        [
          description,
          category,
          unit,
          metrics.quantity,
          metrics.materialCost,
          metrics.laborCost,
          metrics.indirectCost,
          metrics.totalUnitPrice,
          metrics.totalItemPrice,
          metrics.estimatedDays,
          notes,
          materialDetails,
          metrics.indirectFactor,
          JSON.stringify(materials),
          JSON.stringify(labor),
          JSON.stringify(subtasks),
          progress,
          sortOrder,
          projectId,
          itemId,
        ]
      );

      return res.json(mapBudgetItem(result.rows[0]));
    } catch (error: any) {
      if (error instanceof ValidationError) {
        return res.status(400).json({ error: error.message });
      }
      return res.status(500).json({ error: error?.message || 'No se pudo actualizar la partida' });
    }
  });

  app.delete('/api/projects/:projectId/budget-items/:itemId', async (req, res) => {
    try {
      const db = requireDatabase();
      const projectId = String(req.params.projectId || '').trim();
      const itemId = String(req.params.itemId || '').trim();

      if (!projectId || !itemId) {
        return res.status(400).json({ error: 'projectId e itemId son obligatorios' });
      }

      const deleted = await db.query(
        'delete from project_budget_items where project_id = $1 and id = $2',
        [projectId, itemId]
      );

      if (deleted.rowCount === 0) {
        // Keep delete idempotent: if the item is already gone, treat as success.
        return res.status(204).send();
      }

      return res.status(204).send();
    } catch (error: any) {
      return res.status(500).json({ error: error?.message || 'No se pudo eliminar la partida' });
    }
  });

  app.post('/api/projects/:projectId/budget-items/reorder', async (req, res) => {
    try {
      const db = requireDatabase();
      const projectId = String(req.params.projectId || '').trim();
      const orderedIds = Array.isArray(req.body?.orderedIds) ? req.body.orderedIds : [];

      if (!projectId || orderedIds.length === 0) {
        return res.status(400).json({ error: 'projectId y orderedIds son obligatorios' });
      }

      await db.query('begin');
      try {
        for (let index = 0; index < orderedIds.length; index += 1) {
          await db.query(
            `
              update project_budget_items
              set sort_order = $3, updated_at = now()
              where project_id = $1 and id = $2
            `,
            [projectId, String(orderedIds[index]), index + 1]
          );
        }
        await db.query('commit');
      } catch (error) {
        await db.query('rollback');
        throw error;
      }

      return res.status(204).send();
    } catch (error: any) {
      return res.status(500).json({ error: error?.message || 'No se pudo reordenar partidas' });
    }
  });

  app.patch('/api/projects/:projectId/budget-summary', async (req, res) => {
    try {
      const db = requireDatabase();
      const projectId = String(req.params.projectId || '').trim();
      const body = req.body || {};
      if (!projectId) {
        return res.status(400).json({ error: 'projectId requerido' });
      }

      const sets: string[] = ['updated_at = now()'];
      const values: any[] = [projectId];

      const addSet = (sqlName: string, value: any, cast = '') => {
        values.push(value);
        const idx = values.length;
        sets.push(`${sqlName} = $${idx}${cast}`);
      };

      if (body.budget !== undefined) addSet('budget', Number(body.budget || 0));
      if (body.typology !== undefined) addSet('typology', String(body.typology || '').trim() || null);
      if (body.budgetStatus !== undefined) addSet('budget_status', String(body.budgetStatus || '').trim() || null);
      if (body.budgetValidationMessage !== undefined) {
        addSet('budget_validation_message', String(body.budgetValidationMessage || '').trim() || null);
      }
      if (body.budgetValidationType !== undefined) {
        addSet('budget_validation_type', String(body.budgetValidationType || '').trim() || null);
      }
      if (body.budgetValidatedAt !== undefined) {
        addSet('budget_validated_at', body.budgetValidatedAt ? String(body.budgetValidatedAt) : null, '::timestamptz');
      }

      if (sets.length === 1) {
        return res.status(400).json({ error: 'No hay campos para actualizar' });
      }

      await db.query(
        `
          update projects
          set ${sets.join(', ')}
          where id = $1
        `,
        values
      );

      return res.status(204).send();
    } catch (error: any) {
      return res.status(500).json({ error: error?.message || 'No se pudo actualizar el resumen de presupuesto' });
    }
  });

  app.get('/api/projects/:projectId/pois', async (req, res) => {
    try {
      const db = requireDatabase();
      const projectId = String(req.params.projectId || '').trim();
      if (!projectId) {
        return res.status(400).json({ error: 'projectId requerido' });
      }

      const result = await db.query<ProjectPoiRow>(
        `
          select id, project_id, name, comment, latitude, longitude, created_at, updated_at
          from project_pois
          where project_id = $1
          order by created_at asc
        `,
        [projectId]
      );

      return res.json({ items: result.rows.map(mapProjectPoi) });
    } catch (error: any) {
      return res.status(500).json({ error: error?.message || 'No se pudieron obtener puntos de interes' });
    }
  });

  app.post('/api/projects/:projectId/pois', async (req, res) => {
    try {
      const db = requireDatabase();
      const projectId = String(req.params.projectId || '').trim();
      const name = String(req.body?.name || '').trim();
      const comment = String(req.body?.comment || '').trim();
      const lat = Number(req.body?.lat);
      const lng = Number(req.body?.lng);

      if (!projectId || !name || !Number.isFinite(lat) || !Number.isFinite(lng)) {
        return res.status(400).json({ error: 'projectId, name, lat y lng son obligatorios' });
      }

      const result = await db.query<ProjectPoiRow>(
        `
          insert into project_pois (project_id, name, comment, latitude, longitude)
          values ($1,$2,$3,$4,$5)
          returning id, project_id, name, comment, latitude, longitude, created_at, updated_at
        `,
        [projectId, name, comment || null, lat, lng]
      );

      return res.status(201).json(mapProjectPoi(result.rows[0]));
    } catch (error: any) {
      return res.status(500).json({ error: error?.message || 'No se pudo crear punto de interes' });
    }
  });

  app.patch('/api/projects/:projectId/pois/:poiId', async (req, res) => {
    try {
      const db = requireDatabase();
      const projectId = String(req.params.projectId || '').trim();
      const poiId = String(req.params.poiId || '').trim();

      if (!projectId || !poiId) {
        return res.status(400).json({ error: 'projectId y poiId son obligatorios' });
      }

      const sets: string[] = [];
      const values: any[] = [];

      const addSet = (name: string, value: any) => {
        values.push(value);
        sets.push(`${name} = $${values.length}`);
      };

      if (req.body?.name !== undefined) addSet('name', String(req.body.name || '').trim());
      if (req.body?.comment !== undefined) addSet('comment', String(req.body.comment || '').trim() || null);
      if (req.body?.lat !== undefined) addSet('latitude', Number(req.body.lat));
      if (req.body?.lng !== undefined) addSet('longitude', Number(req.body.lng));

      if (sets.length === 0) {
        return res.status(400).json({ error: 'No hay campos para actualizar' });
      }

      sets.push('updated_at = now()');
      values.push(projectId, poiId);

      const result = await db.query<ProjectPoiRow>(
        `
          update project_pois
          set ${sets.join(', ')}
          where project_id = $${values.length - 1} and id = $${values.length}
          returning id, project_id, name, comment, latitude, longitude, created_at, updated_at
        `,
        values
      );

      if (!result.rows[0]) {
        return res.status(404).json({ error: 'Punto de interes no encontrado' });
      }

      return res.json(mapProjectPoi(result.rows[0]));
    } catch (error: any) {
      return res.status(500).json({ error: error?.message || 'No se pudo actualizar punto de interes' });
    }
  });

  app.delete('/api/projects/:projectId/pois/:poiId', async (req, res) => {
    try {
      const db = requireDatabase();
      const projectId = String(req.params.projectId || '').trim();
      const poiId = String(req.params.poiId || '').trim();

      if (!projectId || !poiId) {
        return res.status(400).json({ error: 'projectId y poiId son obligatorios' });
      }

      const deleted = await db.query('delete from project_pois where project_id = $1 and id = $2', [projectId, poiId]);
      if (deleted.rowCount === 0) {
        return res.status(404).json({ error: 'Punto de interes no encontrado' });
      }

      return res.status(204).send();
    } catch (error: any) {
      return res.status(500).json({ error: error?.message || 'No se pudo eliminar punto de interes' });
    }
  });

  app.get('/api/projects/:projectId/logbook', async (req, res) => {
    try {
      const db = requireDatabase();
      const projectId = String(req.params.projectId || '').trim();
      if (!projectId) {
        return res.status(400).json({ error: 'projectId requerido' });
      }

      const result = await db.query<ProjectLogbookEntryRow>(
        `
          select
            id,
            project_id,
            entry_date::text,
            content,
            weather,
            workers_count,
            photos,
            author_email,
            created_at
          from project_logbook_entries
          where project_id = $1
          order by entry_date desc, created_at desc
        `,
        [projectId]
      );

      return res.json({ items: result.rows.map(mapProjectLogbookEntry) });
    } catch (error: any) {
      return res.status(500).json({ error: error?.message || 'No se pudo obtener bitacora' });
    }
  });

  app.post('/api/projects/:projectId/logbook', async (req, res) => {
    try {
      const db = requireDatabase();
      const projectId = String(req.params.projectId || '').trim();
      const date = String(req.body?.date || '').trim();
      const content = String(req.body?.content || '').trim();
      const weather = String(req.body?.weather || 'Soleado').trim() || 'Soleado';
      const workersCount = Number(req.body?.workersCount || 0);
      const photos = Array.isArray(req.body?.photos) ? req.body.photos : [];
      const authorEmail = String(req.body?.authorEmail || '').trim() || null;

      if (!projectId || !date || !content) {
        return res.status(400).json({ error: 'projectId, date y content son obligatorios' });
      }

      const result = await db.query<ProjectLogbookEntryRow>(
        `
          insert into project_logbook_entries (
            project_id,
            entry_date,
            content,
            weather,
            workers_count,
            photos,
            author_email
          )
          values ($1,$2::date,$3,$4,$5,$6::jsonb,$7)
          returning
            id,
            project_id,
            entry_date::text,
            content,
            weather,
            workers_count,
            photos,
            author_email,
            created_at
        `,
        [projectId, date, content, weather, workersCount, JSON.stringify(photos), authorEmail]
      );

      return res.status(201).json(mapProjectLogbookEntry(result.rows[0]));
    } catch (error: any) {
      return res.status(500).json({ error: error?.message || 'No se pudo crear entrada de bitacora' });
    }
  });

  app.delete('/api/projects/:projectId/logbook/:entryId', async (req, res) => {
    try {
      const db = requireDatabase();
      const projectId = String(req.params.projectId || '').trim();
      const entryId = String(req.params.entryId || '').trim();

      if (!projectId || !entryId) {
        return res.status(400).json({ error: 'projectId y entryId son obligatorios' });
      }

      const deleted = await db.query(
        'delete from project_logbook_entries where project_id = $1 and id = $2',
        [projectId, entryId]
      );

      if (deleted.rowCount === 0) {
        return res.status(404).json({ error: 'Entrada de bitacora no encontrada' });
      }

      return res.status(204).send();
    } catch (error: any) {
      return res.status(500).json({ error: error?.message || 'No se pudo eliminar entrada de bitacora' });
    }
  });

  // ── Tasks ──────────────────────────────────────────────────────────────
  interface TaskRow {
    id: string;
    title: string;
    description: string | null;
    status: string;
    priority: string;
    project_id: string | null;
    assignee_id: string | null;
    assignee_name: string | null;
    due_date: string | null;
    completed_at: string | null;
    created_by: string | null;
    created_at: string;
    updated_at: string;
  }

  function mapTask(row: TaskRow) {
    return {
      id: row.id,
      title: row.title,
      description: row.description || '',
      status: row.status,
      priority: row.priority,
      projectId: row.project_id || null,
      assigneeId: row.assignee_id || null,
      assigneeName: row.assignee_name || null,
      dueDate: row.due_date || null,
      completedAt: row.completed_at || null,
      createdBy: row.created_by || null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  app.get('/api/tasks', async (req, res) => {
    try {
      const db = requireDatabase();
      const projectId = String(req.query.projectId || '').trim();
      const status = String(req.query.status || '').trim();
      const assigneeId = String(req.query.assigneeId || '').trim();

      const where: string[] = [];
      const values: any[] = [];
      if (projectId) { values.push(projectId); where.push(`project_id = $${values.length}`); }
      if (status) { values.push(status); where.push(`status = $${values.length}`); }
      if (assigneeId) { values.push(assigneeId); where.push(`assignee_id = $${values.length}`); }

      const whereClause = where.length > 0 ? `where ${where.join(' and ')}` : '';
      const result = await db.query<TaskRow>(
        `select id, title, description, status, priority, project_id, assignee_id, assignee_name,
                due_date::text, completed_at, created_by, created_at, updated_at
         from tasks ${whereClause} order by created_at desc`,
        values
      );
      return res.json({ items: result.rows.map(mapTask) });
    } catch (error: any) {
      return res.status(500).json({ error: error?.message || 'No se pudieron obtener tareas' });
    }
  });

  app.post('/api/tasks', async (req, res) => {
    try {
      const db = requireDatabase();
      const title = String(req.body?.title || '').trim();
      if (!title) return res.status(400).json({ error: 'title es obligatorio' });

      const description = String(req.body?.description || '').trim() || null;
      const status = String(req.body?.status || 'pending').trim();
      const priority = String(req.body?.priority || 'medium').trim();
      const projectId = String(req.body?.projectId || '').trim() || null;
      const assigneeId = String(req.body?.assigneeId || '').trim() || null;
      const assigneeName = String(req.body?.assigneeName || '').trim() || null;
      const dueDate = String(req.body?.dueDate || '').trim() || null;
      const createdBy = getRequesterUserId(req) || null;

      const result = await db.query<TaskRow>(
        `insert into tasks (title, description, status, priority, project_id, assignee_id, assignee_name, due_date, created_by)
         values ($1,$2,$3,$4,$5,$6,$7,$8::date,$9)
         returning id, title, description, status, priority, project_id, assignee_id, assignee_name,
                   due_date::text, completed_at, created_by, created_at, updated_at`,
        [title, description, status, priority, projectId, assigneeId, assigneeName, dueDate, createdBy]
      );
      return res.status(201).json(mapTask(result.rows[0]));
    } catch (error: any) {
      return res.status(500).json({ error: error?.message || 'No se pudo crear la tarea' });
    }
  });

  app.patch('/api/tasks/:id', async (req, res) => {
    try {
      const db = requireDatabase();
      const id = String(req.params.id || '').trim();
      if (!id) return res.status(400).json({ error: 'id requerido' });

      const sets: string[] = [];
      const values: any[] = [];
      const addSet = (col: string, val: any) => { values.push(val); sets.push(`${col} = $${values.length}`); };

      if (req.body?.title !== undefined) addSet('title', String(req.body.title || '').trim());
      if (req.body?.description !== undefined) addSet('description', String(req.body.description || '').trim() || null);
      if (req.body?.status !== undefined) {
        const nextStatus = String(req.body.status || '').trim();
        addSet('status', nextStatus);
        if (nextStatus === 'done') addSet('completed_at', new Date().toISOString());
        else addSet('completed_at', null);
      }
      if (req.body?.priority !== undefined) addSet('priority', String(req.body.priority || 'medium').trim());
      if (req.body?.projectId !== undefined) addSet('project_id', String(req.body.projectId || '').trim() || null);
      if (req.body?.assigneeId !== undefined) addSet('assignee_id', String(req.body.assigneeId || '').trim() || null);
      if (req.body?.assigneeName !== undefined) addSet('assignee_name', String(req.body.assigneeName || '').trim() || null);
      if (req.body?.dueDate !== undefined) {
        values.push(req.body.dueDate ? String(req.body.dueDate) : null);
        sets.push(`due_date = $${values.length}::date`);
      }

      if (sets.length === 0) return res.status(400).json({ error: 'No hay campos para actualizar' });
      sets.push('updated_at = now()');
      values.push(id);

      const result = await db.query<TaskRow>(
        `update tasks set ${sets.join(', ')} where id = $${values.length}
         returning id, title, description, status, priority, project_id, assignee_id, assignee_name,
                   due_date::text, completed_at, created_by, created_at, updated_at`,
        values
      );
      if (!result.rows[0]) return res.status(404).json({ error: 'Tarea no encontrada' });
      return res.json(mapTask(result.rows[0]));
    } catch (error: any) {
      return res.status(500).json({ error: error?.message || 'No se pudo actualizar la tarea' });
    }
  });

  app.delete('/api/tasks/:id', async (req, res) => {
    try {
      const db = requireDatabase();
      const id = String(req.params.id || '').trim();
      if (!id) return res.status(400).json({ error: 'id requerido' });

      const deleted = await db.query('delete from tasks where id = $1', [id]);
      if (deleted.rowCount === 0) return res.status(404).json({ error: 'Tarea no encontrada' });
      return res.status(204).send();
    } catch (error: any) {
      return res.status(500).json({ error: error?.message || 'No se pudo eliminar la tarea' });
    }
  });

  app.get('/api/audit-logs', async (req, res) => {
    try {
      const db = requireDatabase();
      const projectId = String(req.query.projectId || '').trim();
      const moduleName = String(req.query.module || '').trim();
      const type = String(req.query.type || '').trim();
      const limit = Math.min(Math.max(Number(req.query.limit || 50), 1), 200);
      const offset = Math.max(Number(req.query.offset || 0), 0);

      const where: string[] = [];
      const values: Array<string | number> = [];

      if (projectId) {
        values.push(projectId);
        where.push(`project_id = $${values.length}`);
      }
      if (moduleName) {
        values.push(moduleName);
        where.push(`module = $${values.length}`);
      }
      if (type) {
        values.push(type);
        where.push(`type = $${values.length}`);
      }

      const whereClause = where.length > 0 ? `where ${where.join(' and ')}` : '';
      values.push(limit);
      const limitParam = `$${values.length}`;
      values.push(offset);
      const offsetParam = `$${values.length}`;

      const result = await db.query<AuditLogRow>(
        `
          select
            id,
            project_id,
            user_id,
            user_name,
            user_email,
            action,
            module,
            details,
            type,
            metadata,
            user_agent,
            ip_address,
            created_at
          from audit_logs
          ${whereClause}
          order by created_at desc
          limit ${limitParam} offset ${offsetParam}
        `,
        values
      );

      return res.json({ items: result.rows.map(mapAuditLog), hasMore: result.rows.length === limit });
    } catch (error: any) {
      return res.status(500).json({ error: error?.message || 'No se pudieron obtener logs de auditoria' });
    }
  });

  app.post('/api/audit-logs', async (req, res) => {
    try {
      const db = requireDatabase();
      const metadata = req.body?.metadata && typeof req.body.metadata === 'object' ? req.body.metadata : {};
      const projectId = String(req.body?.projectId || metadata.projectId || '').trim() || null;
      const userId = String(req.body?.userId || '').trim() || null;
      const userName = String(req.body?.userName || 'Usuario').trim() || 'Usuario';
      const userEmail = String(req.body?.userEmail || '').trim() || null;
      const action = String(req.body?.action || '').trim();
      const moduleName = String(req.body?.module || '').trim();
      const details = String(req.body?.details || '').trim();
      const type = String(req.body?.type || 'system').trim() || 'system';
      const userAgent = String(req.body?.userAgent || '').trim() || null;
      const ipAddress = String(req.body?.ipAddress || '').trim() || null;

      if (!action || !moduleName || !details) {
        return res.status(400).json({ error: 'action, module y details son obligatorios' });
      }

      const allowedTypes = new Set(['create', 'update', 'delete', 'auth', 'system', 'read']);
      const normalizedType = allowedTypes.has(type) ? type : 'system';

      const result = await db.query<AuditLogRow>(
        `
          insert into audit_logs (
            project_id,
            user_id,
            user_name,
            user_email,
            action,
            module,
            details,
            type,
            metadata,
            user_agent,
            ip_address
          )
          values ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11)
          returning
            id,
            project_id,
            user_id,
            user_name,
            user_email,
            action,
            module,
            details,
            type,
            metadata,
            user_agent,
            ip_address,
            created_at
        `,
        [
          projectId,
          userId,
          userName,
          userEmail,
          action,
          moduleName,
          details,
          normalizedType,
          JSON.stringify(metadata),
          userAgent,
          ipAddress,
        ]
      );

      return res.status(201).json(mapAuditLog(result.rows[0]));
    } catch (error: any) {
      return res.status(500).json({ error: error?.message || 'No se pudo registrar log de auditoria' });
    }
  });

  app.delete('/api/audit-logs', async (_req, res) => {
    try {
      const db = requireDatabase();
      const result = await db.query('delete from audit_logs');
      return res.json({ deleted: result.rowCount || 0 });
    } catch (error: any) {
      return res.status(500).json({ error: error?.message || 'No se pudo borrar el historial de auditoria' });
    }
  });

  const ensureRemindersTable = async () => {
    const db = requireDatabase();
    await db.query(
      `
        create table if not exists reminders (
          id text primary key,
          user_id text not null,
          title text not null,
          note text,
          reminder_date date not null,
          reminder_time text not null,
          notify_minutes_before integer not null default 30,
          completed boolean not null default false,
          source text not null default 'user',
          created_at timestamptz not null default now(),
          updated_at timestamptz not null default now()
        )
      `
    );
    await db.query('create index if not exists idx_reminders_user_date on reminders (user_id, reminder_date, reminder_time)');
  };

  app.get('/api/reminders', async (req, res) => {
    try {
      const userId = getRequesterUserId(req);
      if (!userId) {
        return res.status(401).json({ error: 'No autenticado' });
      }

      await ensureRemindersTable();
      const db = requireDatabase();

      const from = String(req.query.from || '').trim();
      const to = String(req.query.to || '').trim();
      const where: string[] = ['user_id = $1'];
      const values: any[] = [userId];

      if (from) {
        values.push(from);
        where.push(`reminder_date >= $${values.length}::date`);
      }

      if (to) {
        values.push(to);
        where.push(`reminder_date <= $${values.length}::date`);
      }

      const result = await db.query<ReminderRow>(
        `
          select
            id,
            user_id,
            title,
            note,
            reminder_date::text,
            reminder_time,
            notify_minutes_before,
            completed,
            source,
            created_at,
            updated_at
          from reminders
          where ${where.join(' and ')}
          order by reminder_date asc, reminder_time asc, created_at asc
        `,
        values
      );

      return res.json({ items: result.rows.map(mapReminder) });
    } catch (error: any) {
      return res.status(500).json({ error: error?.message || 'No se pudieron obtener recordatorios' });
    }
  });

  app.post('/api/reminders', async (req, res) => {
    try {
      const userId = getRequesterUserId(req);
      if (!userId) {
        return res.status(401).json({ error: 'No autenticado' });
      }

      await ensureRemindersTable();
      const db = requireDatabase();

      const title = String(req.body?.title || '').trim();
      const note = String(req.body?.note || '').trim();
      const date = String(req.body?.date || '').trim();
      const time = String(req.body?.time || '09:00').trim();
      const notifyMinutesBefore = Math.max(0, Math.min(1440, Number(req.body?.notifyMinutesBefore || 30)));
      const completed = Boolean(req.body?.completed);
      const source = String(req.body?.source || 'user').trim() === 'ai' ? 'ai' : 'user';

      if (!title || !date) {
        return res.status(400).json({ error: 'title y date son obligatorios' });
      }

      const result = await db.query<ReminderRow>(
        `
          insert into reminders (
            id,
            user_id,
            title,
            note,
            reminder_date,
            reminder_time,
            notify_minutes_before,
            completed,
            source
          )
          values ($1, $2, $3, $4, $5::date, $6, $7, $8, $9)
          returning
            id,
            user_id,
            title,
            note,
            reminder_date::text,
            reminder_time,
            notify_minutes_before,
            completed,
            source,
            created_at,
            updated_at
        `,
        [randomUUID(), userId, title, note || null, date, time, notifyMinutesBefore, completed, source]
      );

      return res.status(201).json(mapReminder(result.rows[0]));
    } catch (error: any) {
      return res.status(500).json({ error: error?.message || 'No se pudo crear recordatorio' });
    }
  });

  app.patch('/api/reminders/:id', async (req, res) => {
    try {
      const userId = getRequesterUserId(req);
      if (!userId) {
        return res.status(401).json({ error: 'No autenticado' });
      }

      await ensureRemindersTable();
      const db = requireDatabase();
      const id = String(req.params.id || '').trim();
      if (!id) {
        return res.status(400).json({ error: 'id requerido' });
      }

      const sets: string[] = [];
      const values: any[] = [];

      const setField = (column: string, value: any, cast = '') => {
        values.push(value);
        sets.push(`${column} = $${values.length}${cast}`);
      };

      if (req.body?.title !== undefined) {
        setField('title', String(req.body.title || '').trim());
      }
      if (req.body?.note !== undefined) {
        const note = String(req.body.note || '').trim();
        setField('note', note || null);
      }
      if (req.body?.date !== undefined) {
        setField('reminder_date', String(req.body.date || '').trim(), '::date');
      }
      if (req.body?.time !== undefined) {
        setField('reminder_time', String(req.body.time || '').trim() || '09:00');
      }
      if (req.body?.notifyMinutesBefore !== undefined) {
        const minutes = Math.max(0, Math.min(1440, Number(req.body.notifyMinutesBefore || 0)));
        setField('notify_minutes_before', minutes);
      }
      if (req.body?.completed !== undefined) {
        setField('completed', Boolean(req.body.completed));
      }
      if (req.body?.source !== undefined) {
        const source = String(req.body.source || 'user').trim() === 'ai' ? 'ai' : 'user';
        setField('source', source);
      }

      if (sets.length === 0) {
        return res.status(400).json({ error: 'No hay cambios para actualizar' });
      }

      sets.push('updated_at = now()');
      values.push(userId, id);

      const result = await db.query<ReminderRow>(
        `
          update reminders
          set ${sets.join(', ')}
          where user_id = $${values.length - 1} and id = $${values.length}
          returning
            id,
            user_id,
            title,
            note,
            reminder_date::text,
            reminder_time,
            notify_minutes_before,
            completed,
            source,
            created_at,
            updated_at
        `,
        values
      );

      if (!result.rows[0]) {
        return res.status(404).json({ error: 'Recordatorio no encontrado' });
      }

      return res.json(mapReminder(result.rows[0]));
    } catch (error: any) {
      return res.status(500).json({ error: error?.message || 'No se pudo actualizar recordatorio' });
    }
  });

  app.delete('/api/reminders/:id', async (req, res) => {
    try {
      const userId = getRequesterUserId(req);
      if (!userId) {
        return res.status(401).json({ error: 'No autenticado' });
      }

      await ensureRemindersTable();
      const db = requireDatabase();
      const id = String(req.params.id || '').trim();
      if (!id) {
        return res.status(400).json({ error: 'id requerido' });
      }

      const deleted = await db.query<ReminderRow>(
        `
          delete from reminders
          where user_id = $1 and id = $2
          returning
            id,
            user_id,
            title,
            note,
            reminder_date::text,
            reminder_time,
            notify_minutes_before,
            completed,
            source,
            created_at,
            updated_at
        `,
        [userId, id]
      );

      if (!deleted.rows[0]) {
        return res.status(404).json({ error: 'Recordatorio no encontrado' });
      }

      return res.status(204).send();
    } catch (error: any) {
      return res.status(500).json({ error: error?.message || 'No se pudo eliminar recordatorio' });
    }
  });

  app.get('/api/notifications', async (req, res) => {
    try {
      const db = requireDatabase();
      const unreadOnly = String(req.query.unreadOnly || '').trim() === 'true';
      const limit = Math.min(Math.max(Number(req.query.limit || 100), 1), 300);
      const offset = Math.max(Number(req.query.offset || 0), 0);

      const whereClause = unreadOnly ? 'where read = false' : '';
      const result = await db.query<NotificationRow>(
        `
          select id, title, body, type, read, created_at
          from notifications
          ${whereClause}
          order by created_at desc
          limit $1 offset $2
        `,
        [limit, offset]
      );

      return res.json({ items: result.rows.map(mapNotification), hasMore: result.rows.length === limit });
    } catch (error: any) {
      return res.status(500).json({ error: error?.message || 'No se pudieron obtener notificaciones' });
    }
  });

  app.post('/api/notifications', async (req, res) => {
    try {
      const db = requireDatabase();
      const title = String(req.body?.title || '').trim();
      const body = String(req.body?.body || '').trim();
      const type = String(req.body?.type || 'project').trim() || 'project';

      if (!title || !body) {
        return res.status(400).json({ error: 'title y body son obligatorios' });
      }

      const allowedTypes = new Set(['inventory', 'subcontract', 'project', 'system']);
      const normalizedType = allowedTypes.has(type) ? type : 'project';

      const result = await db.query<NotificationRow>(
        `
          insert into notifications (title, body, type)
          values ($1,$2,$3)
          returning id, title, body, type, read, created_at
        `,
        [title, body, normalizedType]
      );

      const createdNotification = mapNotification(result.rows[0]);
      publishNotificationEvent('created', createdNotification);
      return res.status(201).json(createdNotification);
    } catch (error: any) {
      return res.status(500).json({ error: error?.message || 'No se pudo crear notificacion' });
    }
  });

  app.patch('/api/notifications/:id/read', async (req, res) => {
    try {
      const db = requireDatabase();
      const id = String(req.params.id || '').trim();
      if (!id) {
        return res.status(400).json({ error: 'id requerido' });
      }

      const updated = await db.query<NotificationRow>(
        `
          update notifications
          set read = true
          where id = $1
          returning id, title, body, type, read, created_at
        `,
        [id]
      );

      if (!updated.rows[0]) {
        return res.status(404).json({ error: 'Notificacion no encontrada' });
      }

      const readNotification = mapNotification(updated.rows[0]);
      publishNotificationEvent('read', readNotification);
      return res.json(readNotification);
    } catch (error: any) {
      return res.status(500).json({ error: error?.message || 'No se pudo marcar la notificacion como leida' });
    }
  });

  app.delete('/api/notifications/:id', async (req, res) => {
    try {
      const db = requireDatabase();
      const id = String(req.params.id || '').trim();
      if (!id) {
        return res.status(400).json({ error: 'id requerido' });
      }

      const deleted = await db.query<NotificationRow>(
        `
          delete from notifications
          where id = $1
          returning id, title, body, type, read, created_at
        `,
        [id]
      );

      if (!deleted.rows[0]) {
        return res.status(404).json({ error: 'Notificacion no encontrada' });
      }

      publishNotificationEvent('deleted', mapNotification(deleted.rows[0]));
      return res.status(204).send();
    } catch (error: any) {
      return res.status(500).json({ error: error?.message || 'No se pudo eliminar la notificacion' });
    }
  });

  app.get("/api/budget-items", async (req, res) => {
    try {
      const db = requireDatabase();
      const projectId = String(req.query.projectId || "").trim();

      if (projectId) {
        const result = await db.query<BudgetItemRow>(
          `
            select
              id,
              project_id,
              description,
              category,
              unit,
              quantity,
              material_cost,
              labor_cost,
              indirect_cost,
              total_unit_price,
              total_item_price,
              estimated_days,
              notes,
              material_details,
              indirect_factor,
              materials,
              labor,
              subtasks,
              progress,
              sort_order,
              created_at,
              updated_at
            from project_budget_items
            where project_id = $1
            order by sort_order asc, description asc
          `,
          [projectId]
        );
        return res.json({ items: result.rows.map(mapBudgetItem) });
      }

      const result = await db.query<BudgetItemRow>(
        `
          select
            id,
            project_id,
            description,
            category,
            unit,
            quantity,
            material_cost,
            labor_cost,
            indirect_cost,
            total_unit_price,
            total_item_price,
            estimated_days,
            notes,
            material_details,
            indirect_factor,
            materials,
            labor,
            subtasks,
            progress,
            sort_order,
            created_at,
            updated_at
          from project_budget_items
          order by project_id asc, sort_order asc, description asc
        `
      );
      return res.json({ items: result.rows.map(mapBudgetItem) });
    } catch (error: any) {
      return res.status(500).json({ error: error?.message || "No se pudieron obtener partidas" });
    }
  });

  app.get('/api/inventory', async (req, res) => {
    try {
      const db = requireDatabase();
      const projectId = String(req.query.projectId || '').trim();
      const limit = Math.min(Math.max(Number(req.query.limit || 50), 1), 200);
      const offset = Math.max(Number(req.query.offset || 0), 0);

      const where: string[] = [];
      const values: Array<string | number> = [];
      if (projectId) {
        values.push(projectId);
        where.push(`project_id = $${values.length}`);
      }
      const whereClause = where.length > 0 ? `where ${where.join(' and ')}` : '';
      values.push(limit);
      const limitParam = `$${values.length}`;
      values.push(offset);
      const offsetParam = `$${values.length}`;

      const result = await db.query<InventoryRow>(
        `
          select
            id,
            project_id,
            name,
            unit,
            stock,
            min_stock,
            unit_price,
            category,
            suppliers,
            batches,
            created_at,
            updated_at
          from inventory_items
          ${whereClause}
          order by name asc
          limit ${limitParam} offset ${offsetParam}
        `,
        values
      );

      return res.json({ items: result.rows.map(mapInventoryItem), hasMore: result.rows.length === limit });
    } catch (error: any) {
      return res.status(500).json({ error: error?.message || 'No se pudo obtener inventario' });
    }
  });

  app.post('/api/inventory', async (req, res) => {
    try {
      const db = requireDatabase();
      const projectId = String(req.body?.projectId || '').trim();
      const name = String(req.body?.name || '').trim();
      const category = String(req.body?.category || 'Material de Obra').trim() || 'Material de Obra';
      const unit = String(req.body?.unit || '').trim();
      const unitPrice = Number(req.body?.unitPrice || 0);
      const stock = Number(req.body?.stock || 0);
      const minStock = Number(req.body?.minStock || 0);
      const suppliers = Array.isArray(req.body?.suppliers) ? req.body.suppliers : [];
      const batches = Array.isArray(req.body?.batches) ? req.body.batches : [];

      if (!projectId || !name) {
        return res.status(400).json({ error: 'projectId y name son obligatorios' });
      }

      const upsert = await db.query<InventoryRow>(
        `
          insert into inventory_items (
            project_id,
            name,
            unit,
            stock,
            min_stock,
            unit_price,
            category,
            suppliers,
            batches
          )
          values ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb)
          on conflict (project_id, name)
          do update set
            unit = excluded.unit,
            stock = inventory_items.stock + excluded.stock,
            min_stock = excluded.min_stock,
            unit_price = excluded.unit_price,
            category = excluded.category,
            suppliers = excluded.suppliers,
            batches = excluded.batches,
            updated_at = now()
          returning
            id,
            project_id,
            name,
            unit,
            stock,
            min_stock,
            unit_price,
            category,
            suppliers,
            batches,
            created_at,
            updated_at
        `,
        [projectId, name, unit || null, stock, minStock, unitPrice, category, JSON.stringify(suppliers), JSON.stringify(batches)]
      );

      return res.status(201).json(mapInventoryItem(upsert.rows[0]));
    } catch (error: any) {
      return res.status(500).json({ error: error?.message || 'No se pudo guardar material de inventario' });
    }
  });

  app.patch('/api/inventory/:id', async (req, res) => {
    try {
      const db = requireDatabase();
      const id = String(req.params.id || '').trim();
      if (!id) return res.status(400).json({ error: 'id requerido' });

      const sets: string[] = [];
      const values: any[] = [];
      const addSet = (name: string, value: any, json = false) => {
        values.push(json ? JSON.stringify(value) : value);
        const p = `$${values.length}`;
        sets.push(json ? `${name} = ${p}::jsonb` : `${name} = ${p}`);
      };

      if (req.body?.name !== undefined) addSet('name', String(req.body.name || '').trim());
      if (req.body?.category !== undefined) addSet('category', String(req.body.category || '').trim() || 'Material de Obra');
      if (req.body?.unit !== undefined) addSet('unit', String(req.body.unit || '').trim() || null);
      if (req.body?.unitPrice !== undefined) addSet('unit_price', Number(req.body.unitPrice || 0));
      if (req.body?.stock !== undefined) addSet('stock', Number(req.body.stock || 0));
      if (req.body?.minStock !== undefined) addSet('min_stock', Number(req.body.minStock || 0));
      if (req.body?.suppliers !== undefined) addSet('suppliers', Array.isArray(req.body.suppliers) ? req.body.suppliers : [], true);
      if (req.body?.batches !== undefined) addSet('batches', Array.isArray(req.body.batches) ? req.body.batches : [], true);

      if (sets.length === 0) return res.status(400).json({ error: 'No hay campos para actualizar' });
      sets.push('updated_at = now()');
      values.push(id);

      const updated = await db.query<InventoryRow>(
        `
          update inventory_items
          set ${sets.join(', ')}
          where id = $${values.length}
          returning
            id,
            project_id,
            name,
            unit,
            stock,
            min_stock,
            unit_price,
            category,
            suppliers,
            batches,
            created_at,
            updated_at
        `,
        values
      );

      if (!updated.rows[0]) return res.status(404).json({ error: 'Material no encontrado' });
      return res.json(mapInventoryItem(updated.rows[0]));
    } catch (error: any) {
      return res.status(500).json({ error: error?.message || 'No se pudo actualizar inventario' });
    }
  });

  app.patch('/api/inventory/:id/stock', async (req, res) => {
    try {
      const db = requireDatabase();
      const id = String(req.params.id || '').trim();
      const delta = Number(req.body?.delta || 0);
      if (!id || !Number.isFinite(delta)) {
        return res.status(400).json({ error: 'id y delta validos son obligatorios' });
      }

      const updated = await db.query<InventoryRow>(
        `
          update inventory_items
          set
            stock = greatest(0, stock + $2),
            updated_at = now()
          where id = $1
          returning
            id,
            project_id,
            name,
            unit,
            stock,
            min_stock,
            unit_price,
            category,
            suppliers,
            batches,
            created_at,
            updated_at
        `,
        [id, delta]
      );

      if (!updated.rows[0]) return res.status(404).json({ error: 'Material no encontrado' });
      return res.json(mapInventoryItem(updated.rows[0]));
    } catch (error: any) {
      return res.status(500).json({ error: error?.message || 'No se pudo ajustar stock' });
    }
  });

  app.delete('/api/inventory/:id', async (req, res) => {
    try {
      const db = requireDatabase();
      const id = String(req.params.id || '').trim();
      if (!id) return res.status(400).json({ error: 'id requerido' });

      const deleted = await db.query('delete from inventory_items where id = $1', [id]);
      if (deleted.rowCount === 0) return res.status(404).json({ error: 'Material no encontrado' });
      return res.status(204).send();
    } catch (error: any) {
      return res.status(500).json({ error: error?.message || 'No se pudo eliminar material' });
    }
  });

  app.post('/api/inventory/sync', async (req, res) => {
    try {
      const db = requireDatabase();
      const projectId = String(req.body?.projectId || '').trim();
      const items = Array.isArray(req.body?.items) ? req.body.items : [];

      if (!projectId) {
        return res.status(400).json({ error: 'projectId es obligatorio' });
      }

      if (items.length === 0) {
        return res.json({ synced: 0 });
      }

      await db.query('begin');
      try {
        for (const raw of items) {
          const name = String(raw?.name || '').trim();
          if (!name) continue;

          const unit = String(raw?.unit || '').trim() || null;
          const stock = Number(raw?.totalQuantity || 0);
          const minStock = stock * 0.1;
          const unitPrice = Number(raw?.unitPrice || 0);
          const category = String(raw?.category || 'Material de Obra').trim() || 'Material de Obra';

          await db.query(
            `
              insert into inventory_items (
                project_id,
                name,
                unit,
                stock,
                min_stock,
                unit_price,
                category
              )
              values ($1,$2,$3,$4,$5,$6,$7)
              on conflict (project_id, name)
              do update set
                unit = excluded.unit,
                stock = excluded.stock,
                min_stock = excluded.min_stock,
                unit_price = excluded.unit_price,
                category = excluded.category,
                updated_at = now()
            `,
            [projectId, name, unit, stock, minStock, unitPrice, category]
          );
        }
        await db.query('commit');
      } catch (error) {
        await db.query('rollback');
        throw error;
      }

      return res.json({ synced: items.length });
    } catch (error: any) {
      return res.status(500).json({ error: error?.message || 'No se pudo sincronizar inventario' });
    }
  });

  app.get('/api/quotes', async (req, res) => {
    try {
      const db = requireDatabase();
      const clientId = String(req.query.clientId || '').trim();
      const projectId = String(req.query.projectId || '').trim();
      const status = String(req.query.status || '').trim();

      const where: string[] = [];
      const values: any[] = [];
      if (clientId) {
        values.push(clientId);
        where.push(`client_id = $${values.length}`);
      }
      if (projectId) {
        values.push(projectId);
        where.push(`project_id = $${values.length}`);
      }
      if (status) {
        values.push(status);
        where.push(`status = $${values.length}`);
      }

      const whereClause = where.length > 0 ? `where ${where.join(' and ')}` : '';
      const rows = await db.query<QuoteRow>(
        `
          select
            id,
            client_id,
            project_id,
            quote_date::text,
            status,
            total,
            items,
            notes,
            sent_at::text,
            created_at,
            updated_at
          from quotes
          ${whereClause}
          order by created_at desc
        `,
        values
      );

      return res.json({ items: rows.rows.map(mapQuote) });
    } catch (error: any) {
      return res.status(500).json({ error: error?.message || 'No se pudieron obtener cotizaciones' });
    }
  });

  app.post('/api/quotes', async (req, res) => {
    try {
      const db = requireDatabase();
      const clientId = String(req.body?.clientId || '').trim();
      const projectId = String(req.body?.projectId || '').trim();
      const date = String(req.body?.date || '').trim();
      const status = String(req.body?.status || 'Pending').trim();
      const total = Number(req.body?.total || 0);
      const items = Array.isArray(req.body?.items) ? req.body.items : [];
      const notes = String(req.body?.notes || '').trim();
      const sentAt = req.body?.sentAt ? String(req.body.sentAt) : null;

      if (!clientId || !projectId || items.length === 0) {
        return res.status(400).json({ error: 'clientId, projectId e items son obligatorios' });
      }

      const insert = await db.query<QuoteRow>(
        `
          insert into quotes (
            client_id,
            project_id,
            quote_date,
            status,
            total,
            items,
            notes,
            sent_at
          ) values ($1,$2,$3::timestamptz,$4,$5,$6::jsonb,$7,$8::timestamptz)
          returning
            id,
            client_id,
            project_id,
            quote_date::text,
            status,
            total,
            items,
            notes,
            sent_at::text,
            created_at,
            updated_at
        `,
        [
          clientId,
          projectId,
          date || new Date().toISOString(),
          status,
          total,
          JSON.stringify(items),
          notes || null,
          sentAt,
        ]
      );

      return res.status(201).json(mapQuote(insert.rows[0]));
    } catch (error: any) {
      return res.status(500).json({ error: error?.message || 'No se pudo crear cotizacion' });
    }
  });

  app.patch('/api/quotes/:id', async (req, res) => {
    try {
      const db = requireDatabase();
      const id = String(req.params.id || '').trim();
      if (!id) return res.status(400).json({ error: 'id requerido' });

      const sets: string[] = [];
      const values: any[] = [];
      const addSet = (name: string, value: any) => {
        values.push(value);
        sets.push(`${name} = $${values.length}`);
      };

      if (req.body?.clientId !== undefined) addSet('client_id', String(req.body.clientId || '').trim());
      if (req.body?.projectId !== undefined) addSet('project_id', String(req.body.projectId || '').trim());
      if (req.body?.status !== undefined) addSet('status', String(req.body.status || '').trim() || 'Pending');
      if (req.body?.total !== undefined) addSet('total', Number(req.body.total || 0));
      if (req.body?.notes !== undefined) addSet('notes', String(req.body.notes || '').trim() || null);
      if (req.body?.items !== undefined) {
        values.push(JSON.stringify(Array.isArray(req.body.items) ? req.body.items : []));
        sets.push(`items = $${values.length}::jsonb`);
      }
      if (req.body?.date !== undefined) {
        values.push(req.body.date ? String(req.body.date) : null);
        sets.push(`quote_date = $${values.length}::timestamptz`);
      }
      if (req.body?.sentAt !== undefined) {
        values.push(req.body.sentAt ? String(req.body.sentAt) : null);
        sets.push(`sent_at = $${values.length}::timestamptz`);
      }

      if (sets.length === 0) return res.status(400).json({ error: 'No hay campos para actualizar' });
      sets.push('updated_at = now()');
      values.push(id);

      const updated = await db.query<QuoteRow>(
        `
          update quotes
          set ${sets.join(', ')}
          where id = $${values.length}
          returning
            id,
            client_id,
            project_id,
            quote_date::text,
            status,
            total,
            items,
            notes,
            sent_at::text,
            created_at,
            updated_at
        `,
        values
      );

      if (!updated.rows[0]) return res.status(404).json({ error: 'Cotizacion no encontrada' });
      return res.json(mapQuote(updated.rows[0]));
    } catch (error: any) {
      return res.status(500).json({ error: error?.message || 'No se pudo actualizar cotizacion' });
    }
  });

  app.delete('/api/quotes/:id', async (req, res) => {
    try {
      const db = requireDatabase();
      const id = String(req.params.id || '').trim();
      if (!id) return res.status(400).json({ error: 'id requerido' });

      const deleted = await db.query('delete from quotes where id = $1', [id]);
      if (deleted.rowCount === 0) return res.status(404).json({ error: 'Cotizacion no encontrada' });
      return res.status(204).send();
    } catch (error: any) {
      return res.status(500).json({ error: error?.message || 'No se pudo eliminar cotizacion' });
    }
  });

  app.get('/api/inventory-transactions', async (req, res) => {
    try {
      const db = requireDatabase();
      const materialId = String(req.query.materialId || '').trim();
      const type = String(req.query.type || '').trim();
      const limit = Math.min(Math.max(Number(req.query.limit || 100), 1), 500);

      const where: string[] = [];
      const values: any[] = [];
      if (materialId) {
        values.push(materialId);
        where.push(`material_id = $${values.length}`);
      }
      if (type) {
        values.push(type);
        where.push(`type = $${values.length}`);
      }
      values.push(limit);
      const whereClause = where.length > 0 ? `where ${where.join(' and ')}` : '';

      const rows = await db.query<InventoryTransactionRow>(
        `
          select
            id,
            material_id,
            material_name,
            type,
            quantity,
            batch_number,
            previous_stock,
            new_stock,
            reason,
            project_id,
            created_at
          from inventory_transactions
          ${whereClause}
          order by created_at desc
          limit $${values.length}
        `,
        values
      );

      return res.json({ items: rows.rows.map(mapInventoryTransaction) });
    } catch (error: any) {
      return res.status(500).json({ error: error?.message || 'No se pudieron obtener transacciones de inventario' });
    }
  });

  app.post('/api/inventory-transactions', async (req, res) => {
    try {
      const db = requireDatabase();
      const materialId = String(req.body?.materialId || '').trim();
      const materialName = String(req.body?.materialName || '').trim();
      const type = String(req.body?.type || '').trim();
      const quantity = Number(req.body?.quantity || 0);
      const batchNumber = req.body?.batchNumber ? String(req.body.batchNumber).trim() : null;
      const previousStock = req.body?.previousStock !== undefined ? Number(req.body.previousStock) : null;
      const newStock = req.body?.newStock !== undefined ? Number(req.body.newStock) : null;
      const reason = req.body?.reason ? String(req.body.reason).trim() : null;
      const projectId = req.body?.projectId ? String(req.body.projectId).trim() : null;

      if (!materialId || !materialName || !type || !Number.isFinite(quantity) || quantity < 0) {
        return res.status(400).json({ error: 'materialId, materialName, type y quantity son obligatorios' });
      }

      const insert = await db.query<InventoryTransactionRow>(
        `
          insert into inventory_transactions (
            material_id,
            material_name,
            type,
            quantity,
            batch_number,
            previous_stock,
            new_stock,
            reason,
            project_id
          ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
          returning
            id,
            material_id,
            material_name,
            type,
            quantity,
            batch_number,
            previous_stock,
            new_stock,
            reason,
            project_id,
            created_at
        `,
        [materialId, materialName, type, quantity, batchNumber, previousStock, newStock, reason, projectId]
      );

      return res.status(201).json(mapInventoryTransaction(insert.rows[0]));
    } catch (error: any) {
      return res.status(500).json({ error: error?.message || 'No se pudo crear transaccion de inventario' });
    }
  });

  app.delete('/api/inventory-transactions/:id', async (req, res) => {
    try {
      const db = requireDatabase();
      const id = String(req.params.id || '').trim();
      if (!id) return res.status(400).json({ error: 'id requerido' });

      const deleted = await db.query('delete from inventory_transactions where id = $1', [id]);
      if (deleted.rowCount === 0) return res.status(404).json({ error: 'Transaccion no encontrada' });
      return res.status(204).send();
    } catch (error: any) {
      return res.status(500).json({ error: error?.message || 'No se pudo eliminar transaccion de inventario' });
    }
  });

  app.get('/api/deleted-records', async (req, res) => {
    try {
      const db = requireDatabase();
      const rows = await db.query<DeletedRecordRow>(
        `
          select
            id,
            type,
            original_id,
            material_id,
            material_name,
            batch_id,
            data,
            reason,
            deleted_at
          from deleted_records
          order by deleted_at desc
        `
      );

      return res.json({ items: rows.rows.map(mapDeletedRecord) });
    } catch (error: any) {
      return res.status(500).json({ error: error?.message || 'No se pudieron obtener registros eliminados' });
    }
  });

  app.post('/api/deleted-records', async (req, res) => {
    try {
      const db = requireDatabase();
      const type = String(req.body?.type || '').trim();
      const originalId = req.body?.originalId ? String(req.body.originalId).trim() : null;
      const materialId = req.body?.materialId ? String(req.body.materialId).trim() : null;
      const materialName = req.body?.materialName ? String(req.body.materialName).trim() : null;
      const batchId = req.body?.batchId ? String(req.body.batchId).trim() : null;
      const reason = req.body?.reason ? String(req.body.reason).trim() : null;
      const data = req.body?.data ?? null;

      if (!type || data === null) {
        return res.status(400).json({ error: 'type y data son obligatorios' });
      }

      const insert = await db.query<DeletedRecordRow>(
        `
          insert into deleted_records (
            type,
            original_id,
            material_id,
            material_name,
            batch_id,
            data,
            reason
          ) values ($1,$2,$3,$4,$5,$6::jsonb,$7)
          returning
            id,
            type,
            original_id,
            material_id,
            material_name,
            batch_id,
            data,
            reason,
            deleted_at
        `,
        [type, originalId, materialId, materialName, batchId, JSON.stringify(data), reason]
      );

      return res.status(201).json(mapDeletedRecord(insert.rows[0]));
    } catch (error: any) {
      return res.status(500).json({ error: error?.message || 'No se pudo guardar registro eliminado' });
    }
  });

  app.delete('/api/deleted-records/:id', async (req, res) => {
    try {
      const db = requireDatabase();
      const id = String(req.params.id || '').trim();
      if (!id) return res.status(400).json({ error: 'id requerido' });

      const deleted = await db.query('delete from deleted_records where id = $1', [id]);
      if (deleted.rowCount === 0) return res.status(404).json({ error: 'Registro no encontrado' });
      return res.status(204).send();
    } catch (error: any) {
      return res.status(500).json({ error: error?.message || 'No se pudo eliminar registro de papelera' });
    }
  });

  app.get('/api/purchase-orders', async (req, res) => {
    try {
      const db = requireDatabase();
      const projectId = String(req.query.projectId || '').trim();
      const supplierId = String(req.query.supplierId || '').trim();
      const status = String(req.query.status || '').trim();

      const where: string[] = [];
      const values: any[] = [];
      if (projectId) {
        values.push(projectId);
        where.push(`project_id = $${values.length}`);
      }
      if (supplierId) {
        values.push(supplierId);
        where.push(`supplier_id = $${values.length}`);
      }
      if (status) {
        values.push(status);
        where.push(`status = $${values.length}`);
      }
      const whereClause = where.length > 0 ? `where ${where.join(' and ')}` : '';

      const rows = await db.query<PurchaseOrderRow>(
        `
          select
            id,
            project_id,
            budget_item_id,
            material_id,
            material_name,
            quantity,
            unit,
            estimated_cost,
            supplier,
            supplier_id,
            notes,
            status,
            order_date::text,
            date_received::text,
            date_paid::text,
            payment_method,
            payment_reference,
            stock_applied,
            budget_applied,
            created_at,
            updated_at
          from purchase_orders
          ${whereClause}
          order by created_at desc
        `,
        values
      );

      return res.json({ items: rows.rows.map(mapPurchaseOrder) });
    } catch (error: any) {
      return res.status(500).json({ error: error?.message || 'No se pudieron obtener ordenes de compra' });
    }
  });

  app.post('/api/purchase-orders', async (req, res) => {
    try {
      const db = requireDatabase();
      const projectId = req.body?.projectId ? String(req.body.projectId).trim() : null;
      const budgetItemId = req.body?.budgetItemId ? String(req.body.budgetItemId).trim() : null;
      const materialId = req.body?.materialId ? String(req.body.materialId).trim() : null;
      const materialName = String(req.body?.materialName || '').trim();
      const quantity = Number(req.body?.quantity || 0);
      const unit = req.body?.unit ? String(req.body.unit).trim() : null;
      const estimatedCost = Number(req.body?.estimatedCost || 0);
      const supplier = req.body?.supplier ? String(req.body.supplier).trim() : null;
      const supplierId = req.body?.supplierId ? String(req.body.supplierId).trim() : null;
      const notes = req.body?.notes ? String(req.body.notes).trim() : null;
      const status = String(req.body?.status || 'Pending').trim() || 'Pending';
      const date = String(req.body?.date || '').trim();

      if (!materialName || !Number.isFinite(quantity) || quantity <= 0) {
        return res.status(400).json({ error: 'materialName y quantity validos son obligatorios' });
      }

      const insert = await db.query<PurchaseOrderRow>(
        `
          insert into purchase_orders (
            project_id,
            budget_item_id,
            material_id,
            material_name,
            quantity,
            unit,
            estimated_cost,
            supplier,
            supplier_id,
            notes,
            status,
            order_date,
            date_received,
            date_paid,
            payment_method,
            payment_reference,
            stock_applied,
            budget_applied
          ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::date,$13::date,$14::date,$15,$16,$17,$18)
          returning
            id,
            project_id,
            budget_item_id,
            material_id,
            material_name,
            quantity,
            unit,
            estimated_cost,
            supplier,
            supplier_id,
            notes,
            status,
            order_date::text,
            date_received::text,
            date_paid::text,
            payment_method,
            payment_reference,
            stock_applied,
            budget_applied,
            created_at,
            updated_at
        `,
        [
          projectId,
          budgetItemId,
          materialId,
          materialName,
          quantity,
          unit,
          estimatedCost,
          supplier,
          supplierId,
          notes,
          status,
          date || new Date().toISOString().slice(0, 10),
          status === 'Completed' ? new Date().toISOString().slice(0, 10) : null,
          status === 'Paid' ? new Date().toISOString().slice(0, 10) : null,
          req.body?.paymentMethod ? String(req.body.paymentMethod).trim() : null,
          req.body?.paymentReference ? String(req.body.paymentReference).trim() : null,
          false,
          false,
        ]
      );

      if (supplierId && Number.isFinite(estimatedCost) && estimatedCost > 0) {
        await db.query(
          `
            update suppliers
            set balance = coalesce(balance, 0) + $1,
                last_order = $2::date,
                updated_at = now()
            where id = $3
          `,
          [estimatedCost, date || new Date().toISOString().slice(0, 10), supplierId]
        );
      }

      return res.status(201).json(mapPurchaseOrder(insert.rows[0]));
    } catch (error: any) {
      return res.status(500).json({ error: error?.message || 'No se pudo crear orden de compra' });
    }
  });

  app.patch('/api/purchase-orders/:id', async (req, res) => {
    try {
      const db = requireDatabase();
      const id = String(req.params.id || '').trim();
      if (!id) return res.status(400).json({ error: 'id requerido' });

      const sets: string[] = [];
      const values: any[] = [];
      const addSet = (name: string, value: any) => {
        values.push(value);
        sets.push(`${name} = $${values.length}`);
      };

      if (req.body?.projectId !== undefined) addSet('project_id', String(req.body.projectId || '').trim() || null);
      if (req.body?.budgetItemId !== undefined) addSet('budget_item_id', String(req.body.budgetItemId || '').trim() || null);
      if (req.body?.materialId !== undefined) addSet('material_id', String(req.body.materialId || '').trim() || null);
      if (req.body?.materialName !== undefined) addSet('material_name', String(req.body.materialName || '').trim());
      if (req.body?.quantity !== undefined) addSet('quantity', Number(req.body.quantity || 0));
      if (req.body?.unit !== undefined) addSet('unit', String(req.body.unit || '').trim() || null);
      if (req.body?.estimatedCost !== undefined) addSet('estimated_cost', Number(req.body.estimatedCost || 0));
      if (req.body?.supplier !== undefined) addSet('supplier', String(req.body.supplier || '').trim() || null);
      if (req.body?.supplierId !== undefined) addSet('supplier_id', String(req.body.supplierId || '').trim() || null);
      if (req.body?.notes !== undefined) addSet('notes', String(req.body.notes || '').trim() || null);
      if (req.body?.status !== undefined) addSet('status', String(req.body.status || '').trim() || 'Pending');
      if (req.body?.date !== undefined) {
        values.push(req.body.date ? String(req.body.date) : null);
        sets.push(`order_date = $${values.length}::date`);
      }
      if (req.body?.dateReceived !== undefined) {
        values.push(req.body.dateReceived ? String(req.body.dateReceived) : null);
        sets.push(`date_received = $${values.length}::date`);
      }
      if (req.body?.datePaid !== undefined) {
        values.push(req.body.datePaid ? String(req.body.datePaid) : null);
        sets.push(`date_paid = $${values.length}::date`);
      }
      if (req.body?.paymentMethod !== undefined) addSet('payment_method', String(req.body.paymentMethod || '').trim() || null);
      if (req.body?.paymentReference !== undefined) addSet('payment_reference', String(req.body.paymentReference || '').trim() || null);
      if (req.body?.stockApplied !== undefined) addSet('stock_applied', Boolean(req.body.stockApplied));
      if (req.body?.budgetApplied !== undefined) addSet('budget_applied', Boolean(req.body.budgetApplied));

      if (sets.length === 0) return res.status(400).json({ error: 'No hay campos para actualizar' });
      sets.push('updated_at = now()');
      values.push(id);

      const updated = await db.query<PurchaseOrderRow>(
        `
          update purchase_orders
          set ${sets.join(', ')}
          where id = $${values.length}
          returning
            id,
            project_id,
            budget_item_id,
            material_id,
            material_name,
            quantity,
            unit,
            estimated_cost,
            supplier,
            supplier_id,
            notes,
            status,
            order_date::text,
            date_received::text,
            date_paid::text,
            payment_method,
            payment_reference,
            stock_applied,
            budget_applied,
            created_at,
            updated_at
        `,
        values
      );

      if (!updated.rows[0]) return res.status(404).json({ error: 'Orden de compra no encontrada' });
      return res.json(mapPurchaseOrder(updated.rows[0]));
    } catch (error: any) {
      return res.status(500).json({ error: error?.message || 'No se pudo actualizar orden de compra' });
    }
  });

  app.delete('/api/purchase-orders/:id', async (req, res) => {
    try {
      const db = requireDatabase();
      const id = String(req.params.id || '').trim();
      if (!id) return res.status(400).json({ error: 'id requerido' });

      const deleted = await db.query('delete from purchase_orders where id = $1', [id]);
      if (deleted.rowCount === 0) return res.status(404).json({ error: 'Orden de compra no encontrada' });
      return res.status(204).send();
    } catch (error: any) {
      return res.status(500).json({ error: error?.message || 'No se pudo eliminar orden de compra' });
    }
  });

  app.get('/api/supplier-payments', async (req, res) => {
    try {
      const db = requireDatabase();
      const supplierId = String(req.query.supplierId || '').trim();
      const purchaseOrderId = String(req.query.purchaseOrderId || '').trim();

      const where: string[] = [];
      const values: any[] = [];
      if (supplierId) {
        values.push(supplierId);
        where.push(`supplier_id = $${values.length}`);
      }
      if (purchaseOrderId) {
        values.push(purchaseOrderId);
        where.push(`purchase_order_id = $${values.length}`);
      }
      const whereClause = where.length > 0 ? `where ${where.join(' and ')}` : '';

      const rows = await db.query<SupplierPaymentRow>(
        `
          select
            id,
            supplier_id,
            purchase_order_id,
            amount,
            payment_method,
            payment_reference,
            notes,
            paid_at::text,
            created_at
          from supplier_payments
          ${whereClause}
          order by created_at desc
        `,
        values
      );

      return res.json({ items: rows.rows.map(mapSupplierPayment) });
    } catch (error: any) {
      return res.status(500).json({ error: error?.message || 'No se pudieron obtener pagos a proveedores' });
    }
  });

  app.post('/api/supplier-payments', async (req, res) => {
    const db = requireDatabase();
    const client = await db.connect();
    try {
      const supplierId = String(req.body?.supplierId || '').trim();
      const purchaseOrderId = req.body?.purchaseOrderId ? String(req.body.purchaseOrderId).trim() : null;
      const amount = Number(req.body?.amount || 0);
      const paymentMethod = String(req.body?.paymentMethod || '').trim();
      const paymentReference = req.body?.paymentReference ? String(req.body.paymentReference).trim() : null;
      const notes = req.body?.notes ? String(req.body.notes).trim() : null;
      const paidAt = String(req.body?.paidAt || '').trim() || new Date().toISOString().slice(0, 10);

      if (!supplierId || !Number.isFinite(amount) || amount <= 0 || !paymentMethod) {
        return res.status(400).json({ error: 'supplierId, amount y paymentMethod son obligatorios' });
      }

      await client.query('begin');

      const supplierResult = await client.query<SupplierRow>(
        `
          select
            id,
            name,
            category,
            contact,
            email,
            phone,
            rating,
            status,
            balance,
            last_order,
            created_at,
            updated_at
          from suppliers
          where id = $1
          for update
        `,
        [supplierId]
      );

      if (!supplierResult.rows[0]) {
        await client.query('rollback');
        return res.status(404).json({ error: 'Proveedor no encontrado' });
      }

      const currentBalance = Number(supplierResult.rows[0].balance || 0);
      const nextBalance = Math.max(0, currentBalance - amount);

      const paymentInsert = await client.query<SupplierPaymentRow>(
        `
          insert into supplier_payments (
            supplier_id,
            purchase_order_id,
            amount,
            payment_method,
            payment_reference,
            notes,
            paid_at
          ) values ($1,$2,$3,$4,$5,$6,$7::date)
          returning
            id,
            supplier_id,
            purchase_order_id,
            amount,
            payment_method,
            payment_reference,
            notes,
            paid_at::text,
            created_at
        `,
        [supplierId, purchaseOrderId, amount, paymentMethod, paymentReference, notes, paidAt]
      );

      await client.query(
        `
          update suppliers
          set balance = $1,
              updated_at = now()
          where id = $2
        `,
        [nextBalance, supplierId]
      );

      if (purchaseOrderId) {
        await client.query(
          `
            update purchase_orders
            set status = 'Paid',
                date_paid = $1::date,
                payment_method = $2,
                payment_reference = $3,
                updated_at = now()
            where id = $4
          `,
          [paidAt, paymentMethod, paymentReference, purchaseOrderId]
        );
      }

      await client.query('commit');
      return res.status(201).json({ payment: mapSupplierPayment(paymentInsert.rows[0]), supplierBalance: nextBalance });
    } catch (error: any) {
      try {
        await client.query('rollback');
      } catch {
        // ignore rollback errors
      }
      return res.status(500).json({ error: error?.message || 'No se pudo registrar pago a proveedor' });
    } finally {
      client.release();
    }
  });

  app.patch('/api/supplier-payments/:id', async (req, res) => {
    const db = requireDatabase();
    const client = await db.connect();
    try {
      const id = String(req.params.id || '').trim();
      if (!id) {
        return res.status(400).json({ error: 'id requerido' });
      }

      await client.query('begin');

      const paymentResult = await client.query<SupplierPaymentRow>(
        `
          select
            id,
            supplier_id,
            purchase_order_id,
            amount,
            payment_method,
            payment_reference,
            notes,
            paid_at::text,
            created_at
          from supplier_payments
          where id = $1
          for update
        `,
        [id]
      );

      const currentPayment = paymentResult.rows[0];
      if (!currentPayment) {
        await client.query('rollback');
        return res.status(404).json({ error: 'Pago a proveedor no encontrado' });
      }

      const nextAmount = req.body?.amount !== undefined ? Number(req.body.amount) : Number(currentPayment.amount || 0);
      if (!Number.isFinite(nextAmount) || nextAmount <= 0) {
        await client.query('rollback');
        return res.status(400).json({ error: 'amount inválido' });
      }

      const nextPaymentMethod = String(req.body?.paymentMethod || currentPayment.payment_method || '').trim();
      if (!nextPaymentMethod) {
        await client.query('rollback');
        return res.status(400).json({ error: 'paymentMethod es obligatorio' });
      }

      const nextPaymentReference = req.body?.paymentReference !== undefined
        ? (req.body.paymentReference ? String(req.body.paymentReference).trim() : null)
        : currentPayment.payment_reference;
      const nextNotes = req.body?.notes !== undefined
        ? (req.body.notes ? String(req.body.notes).trim() : null)
        : currentPayment.notes;
      const nextPaidAt = req.body?.paidAt ? String(req.body.paidAt).trim() : currentPayment.paid_at;

      const supplierResult = await client.query<SupplierRow>(
        `
          select
            id,
            name,
            category,
            contact,
            email,
            phone,
            rating,
            status,
            balance,
            last_order,
            created_at,
            updated_at
          from suppliers
          where id = $1
          for update
        `,
        [currentPayment.supplier_id]
      );

      const supplier = supplierResult.rows[0];
      if (!supplier) {
        await client.query('rollback');
        return res.status(404).json({ error: 'Proveedor asociado no encontrado' });
      }

      const currentAmount = Number(currentPayment.amount || 0);
      const amountDelta = nextAmount - currentAmount;
      const currentBalance = Number(supplier.balance || 0);
      const nextBalance = Math.max(0, currentBalance - amountDelta);

      const updatedPayment = await client.query<SupplierPaymentRow>(
        `
          update supplier_payments
          set amount = $1,
              payment_method = $2,
              payment_reference = $3,
              notes = $4,
              paid_at = $5::date
          where id = $6
          returning
            id,
            supplier_id,
            purchase_order_id,
            amount,
            payment_method,
            payment_reference,
            notes,
            paid_at::text,
            created_at
        `,
        [nextAmount, nextPaymentMethod, nextPaymentReference, nextNotes, nextPaidAt, id]
      );

      await client.query(
        `
          update suppliers
          set balance = $1,
              updated_at = now()
          where id = $2
        `,
        [nextBalance, currentPayment.supplier_id]
      );

      await client.query('commit');
      return res.json({ payment: mapSupplierPayment(updatedPayment.rows[0]), supplierBalance: nextBalance });
    } catch (error: any) {
      try {
        await client.query('rollback');
      } catch {
        // ignore rollback errors
      }
      return res.status(500).json({ error: error?.message || 'No se pudo actualizar pago a proveedor' });
    } finally {
      client.release();
    }
  });

  app.delete('/api/supplier-payments/:id', async (req, res) => {
    const db = requireDatabase();
    const client = await db.connect();
    try {
      const id = String(req.params.id || '').trim();
      if (!id) {
        return res.status(400).json({ error: 'id requerido' });
      }

      await client.query('begin');

      const paymentResult = await client.query<SupplierPaymentRow>(
        `
          select
            id,
            supplier_id,
            purchase_order_id,
            amount,
            payment_method,
            payment_reference,
            notes,
            paid_at::text,
            created_at
          from supplier_payments
          where id = $1
          for update
        `,
        [id]
      );

      const payment = paymentResult.rows[0];
      if (!payment) {
        await client.query('rollback');
        return res.status(404).json({ error: 'Pago a proveedor no encontrado' });
      }

      const supplierResult = await client.query<SupplierRow>(
        `
          select
            id,
            name,
            category,
            contact,
            email,
            phone,
            rating,
            status,
            balance,
            last_order,
            created_at,
            updated_at
          from suppliers
          where id = $1
          for update
        `,
        [payment.supplier_id]
      );

      const supplier = supplierResult.rows[0];
      if (!supplier) {
        await client.query('rollback');
        return res.status(404).json({ error: 'Proveedor asociado no encontrado' });
      }

      const currentBalance = Number(supplier.balance || 0);
      const restoredBalance = currentBalance + Number(payment.amount || 0);

      await client.query('delete from supplier_payments where id = $1', [id]);

      await client.query(
        `
          update suppliers
          set balance = $1,
              updated_at = now()
          where id = $2
        `,
        [restoredBalance, payment.supplier_id]
      );

      await client.query('commit');
      return res.status(204).send();
    } catch (error: any) {
      try {
        await client.query('rollback');
      } catch {
        // ignore rollback errors
      }
      return res.status(500).json({ error: error?.message || 'No se pudo eliminar pago a proveedor' });
    } finally {
      client.release();
    }
  });

  app.get('/api/clients', async (req, res) => {
    try {
      const db = requireDatabase();
      const result = await db.query<ClientRow>(
        `
          select
            id,
            name,
            email,
            phone,
            company,
            contact_person,
            contacto,
            status,
            notes,
            location,
            attachments,
            last_interaction,
            created_at,
            updated_at
          from clients
          order by created_at desc
        `
      );

      return res.json({ items: result.rows.map(mapClient) });
    } catch (error: any) {
      return res.status(500).json({ error: error?.message || 'No se pudieron obtener clientes' });
    }
  });

  app.post('/api/clients', async (req, res) => {
    try {
      const db = requireDatabase();
      const name = String(req.body?.name || '').trim();
      const email = String(req.body?.email || '').trim();
      const phone = String(req.body?.phone || '').trim();
      const company = String(req.body?.company || '').trim();
      const contactPerson = String(req.body?.contactPerson || '').trim();
      const contacto = String(req.body?.contacto || '').trim();
      const status = String(req.body?.status || 'Lead').trim() || 'Lead';
      const notes = String(req.body?.notes || '').trim();
      const location = req.body?.location ?? null;

      if (!name) {
        return res.status(400).json({ error: 'name es obligatorio' });
      }

      const insert = await db.query<ClientRow>(
        `
          insert into clients (
            name,
            email,
            phone,
            company,
            contact_person,
            contacto,
            status,
            notes,
            location,
            last_interaction
          ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb, now())
          returning
            id,
            name,
            email,
            phone,
            company,
            contact_person,
            contacto,
            status,
            notes,
            location,
            attachments,
            last_interaction,
            created_at,
            updated_at
        `,
        [name, email || null, phone || null, company || null, contactPerson || null, contacto || null, status, notes || null, location ? JSON.stringify(location) : null]
      );

      return res.status(201).json(mapClient(insert.rows[0]));
    } catch (error: any) {
      return res.status(500).json({ error: error?.message || 'No se pudo crear cliente' });
    }
  });

  app.patch('/api/clients/:id', async (req, res) => {
    try {
      const db = requireDatabase();
      const id = String(req.params.id || '').trim();
      if (!id) return res.status(400).json({ error: 'id requerido' });

      const sets: string[] = [];
      const values: any[] = [];
      const addSet = (name: string, value: any, json = false) => {
        values.push(json ? JSON.stringify(value) : value);
        const p = `$${values.length}`;
        sets.push(json ? `${name} = ${p}::jsonb` : `${name} = ${p}`);
      };

      if (req.body?.name !== undefined) addSet('name', String(req.body.name || '').trim());
      if (req.body?.email !== undefined) addSet('email', String(req.body.email || '').trim() || null);
      if (req.body?.phone !== undefined) addSet('phone', String(req.body.phone || '').trim() || null);
      if (req.body?.company !== undefined) addSet('company', String(req.body.company || '').trim() || null);
      if (req.body?.contactPerson !== undefined) addSet('contact_person', String(req.body.contactPerson || '').trim() || null);
      if (req.body?.contacto !== undefined) addSet('contacto', String(req.body.contacto || '').trim() || null);
      if (req.body?.status !== undefined) addSet('status', String(req.body.status || '').trim() || 'Lead');
      if (req.body?.notes !== undefined) addSet('notes', String(req.body.notes || '').trim() || null);
      if (req.body?.location !== undefined) addSet('location', req.body.location, true);
      if (req.body?.attachments !== undefined) addSet('attachments', Array.isArray(req.body.attachments) ? req.body.attachments : [], true);
      if (req.body?.lastInteraction !== undefined) {
        values.push(req.body.lastInteraction ? String(req.body.lastInteraction) : null);
        sets.push(`last_interaction = $${values.length}::timestamptz`);
      }

      if (sets.length === 0) return res.status(400).json({ error: 'No hay campos para actualizar' });
      sets.push('updated_at = now()');
      values.push(id);

      const updated = await db.query<ClientRow>(
        `
          update clients
          set ${sets.join(', ')}
          where id = $${values.length}
          returning
            id,
            name,
            email,
            phone,
            company,
            contact_person,
            contacto,
            status,
            notes,
            location,
            attachments,
            last_interaction,
            created_at,
            updated_at
        `,
        values
      );

      if (!updated.rows[0]) return res.status(404).json({ error: 'Cliente no encontrado' });
      return res.json(mapClient(updated.rows[0]));
    } catch (error: any) {
      return res.status(500).json({ error: error?.message || 'No se pudo actualizar cliente' });
    }
  });

  app.post('/api/clients/:id/attachments', async (req, res) => {
    try {
      const db = requireDatabase();
      const id = String(req.params.id || '').trim();
      const attachment = req.body?.attachment;
      if (!id || !attachment) {
        return res.status(400).json({ error: 'id y attachment son obligatorios' });
      }

      const existing = await db.query<ClientRow>(
        `
          select
            id,
            name,
            email,
            phone,
            company,
            contact_person,
            contacto,
            status,
            notes,
            location,
            attachments,
            last_interaction,
            created_at,
            updated_at
          from clients
          where id = $1
        `,
        [id]
      );

      if (!existing.rows[0]) return res.status(404).json({ error: 'Cliente no encontrado' });
      const mergedAttachments = [...(Array.isArray(existing.rows[0].attachments) ? existing.rows[0].attachments : []), attachment];

      const updated = await db.query<ClientRow>(
        `
          update clients
          set attachments = $2::jsonb, updated_at = now()
          where id = $1
          returning
            id,
            name,
            email,
            phone,
            company,
            contact_person,
            contacto,
            status,
            notes,
            location,
            attachments,
            last_interaction,
            created_at,
            updated_at
        `,
        [id, JSON.stringify(mergedAttachments)]
      );

      return res.json(mapClient(updated.rows[0]));
    } catch (error: any) {
      return res.status(500).json({ error: error?.message || 'No se pudo adjuntar archivo al cliente' });
    }
  });

  app.delete('/api/clients/:id', async (req, res) => {
    try {
      const db = requireDatabase();
      const id = String(req.params.id || '').trim();
      if (!id) return res.status(400).json({ error: 'id requerido' });

      const deleted = await db.query('delete from clients where id = $1', [id]);
      if (deleted.rowCount === 0) return res.status(404).json({ error: 'Cliente no encontrado' });
      return res.status(204).send();
    } catch (error: any) {
      return res.status(500).json({ error: error?.message || 'No se pudo eliminar cliente' });
    }
  });

  app.get('/api/clients/:id/chats', async (req, res) => {
    try {
      const db = requireDatabase();
      const id = String(req.params.id || '').trim();
      if (!id) return res.status(400).json({ error: 'id requerido' });

      const rows = await db.query<ClientChatRow>(
        `
          select id, client_id, text, sender, created_at
          from client_chats
          where client_id = $1
          order by created_at asc
          limit 200
        `,
        [id]
      );

      return res.json({ items: rows.rows.map(mapClientChat) });
    } catch (error: any) {
      return res.status(500).json({ error: error?.message || 'No se pudieron obtener mensajes del cliente' });
    }
  });

  app.post('/api/clients/:id/chats', async (req, res) => {
    try {
      const db = requireDatabase();
      const id = String(req.params.id || '').trim();
      const text = String(req.body?.text || '').trim();
      const sender = String(req.body?.sender || 'Admin').trim() || 'Admin';

      if (!id || !text) return res.status(400).json({ error: 'id y text son obligatorios' });

      const insert = await db.query<ClientChatRow>(
        `
          insert into client_chats (client_id, text, sender)
          values ($1,$2,$3)
          returning id, client_id, text, sender, created_at
        `,
        [id, text, sender]
      );

      await db.query('update clients set last_interaction = now(), updated_at = now() where id = $1', [id]);
      return res.status(201).json(mapClientChat(insert.rows[0]));
    } catch (error: any) {
      return res.status(500).json({ error: error?.message || 'No se pudo enviar mensaje al cliente' });
    }
  });

  app.get('/api/clients/:id/interactions', async (req, res) => {
    try {
      const db = requireDatabase();
      const id = String(req.params.id || '').trim();
      if (!id) return res.status(400).json({ error: 'id requerido' });

      const rows = await db.query<ClientInteractionRow>(
        `
          select id, client_id, type, notes, date::text, created_at
          from client_interactions
          where client_id = $1
          order by date desc, created_at desc
          limit 200
        `,
        [id]
      );

      return res.json({ items: rows.rows.map(mapClientInteraction) });
    } catch (error: any) {
      return res.status(500).json({ error: error?.message || 'No se pudieron obtener interacciones del cliente' });
    }
  });

  app.post('/api/clients/:id/interactions', async (req, res) => {
    try {
      const db = requireDatabase();
      const id = String(req.params.id || '').trim();
      const type = String(req.body?.type || '').trim();
      const notes = String(req.body?.notes || '').trim();
      const date = String(req.body?.date || '').trim();

      if (!id || !type || !notes || !date) {
        return res.status(400).json({ error: 'id, type, notes y date son obligatorios' });
      }

      const insert = await db.query<ClientInteractionRow>(
        `
          insert into client_interactions (client_id, type, notes, date)
          values ($1,$2,$3,$4::date)
          returning id, client_id, type, notes, date::text, created_at
        `,
        [id, type, notes, date]
      );

      await db.query('update clients set last_interaction = now(), updated_at = now() where id = $1', [id]);
      return res.status(201).json(mapClientInteraction(insert.rows[0]));
    } catch (error: any) {
      return res.status(500).json({ error: error?.message || 'No se pudo registrar interaccion del cliente' });
    }
  });

  app.get('/api/suppliers', async (req, res) => {
    try {
      const db = requireDatabase();
      const result = await db.query<SupplierRow>(
        `
          select
            id,
            name,
            category,
            contact,
            email,
            phone,
            rating,
            status,
            balance,
            last_order,
            created_at,
            updated_at
          from suppliers
          order by created_at desc
        `
      );

      return res.json({ items: result.rows.map(mapSupplier) });
    } catch (error: any) {
      return res.status(500).json({ error: error?.message || 'No se pudieron obtener proveedores' });
    }
  });

  app.post('/api/suppliers', async (req, res) => {
    try {
      const db = requireDatabase();
      const name = String(req.body?.name || '').trim();
      const category = String(req.body?.category || 'Materiales').trim() || 'Materiales';
      const contact = String(req.body?.contact || '').trim();
      const email = String(req.body?.email || '').trim();
      const phone = String(req.body?.phone || '').trim();
      const rating = Number(req.body?.rating || 5);
      const status = String(req.body?.status || 'Verified').trim() || 'Verified';
      const balance = Number(req.body?.balance || 0);
      const lastOrder = String(req.body?.lastOrder || '').trim();

      if (!name) return res.status(400).json({ error: 'name es obligatorio' });

      const insert = await db.query<SupplierRow>(
        `
          insert into suppliers (
            name,
            category,
            contact,
            email,
            phone,
            rating,
            status,
            balance,
            last_order
          ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
          returning
            id,
            name,
            category,
            contact,
            email,
            phone,
            rating,
            status,
            balance,
            last_order,
            created_at,
            updated_at
        `,
        [name, category, contact || null, email || null, phone || null, rating, status, balance, lastOrder || null]
      );

      return res.status(201).json(mapSupplier(insert.rows[0]));
    } catch (error: any) {
      return res.status(500).json({ error: error?.message || 'No se pudo crear proveedor' });
    }
  });

  app.patch('/api/suppliers/:id', async (req, res) => {
    try {
      const db = requireDatabase();
      const id = String(req.params.id || '').trim();
      if (!id) return res.status(400).json({ error: 'id requerido' });

      const sets: string[] = [];
      const values: any[] = [];
      const addSet = (name: string, value: any) => {
        values.push(value);
        sets.push(`${name} = $${values.length}`);
      };

      if (req.body?.name !== undefined) addSet('name', String(req.body.name || '').trim());
      if (req.body?.category !== undefined) addSet('category', String(req.body.category || '').trim() || 'Materiales');
      if (req.body?.contact !== undefined) addSet('contact', String(req.body.contact || '').trim() || null);
      if (req.body?.email !== undefined) addSet('email', String(req.body.email || '').trim() || null);
      if (req.body?.phone !== undefined) addSet('phone', String(req.body.phone || '').trim() || null);
      if (req.body?.rating !== undefined) addSet('rating', Number(req.body.rating || 0));
      if (req.body?.status !== undefined) addSet('status', String(req.body.status || '').trim() || 'Verified');
      if (req.body?.balance !== undefined) addSet('balance', Number(req.body.balance || 0));
      if (req.body?.lastOrder !== undefined) addSet('last_order', String(req.body.lastOrder || '').trim() || null);

      if (sets.length === 0) return res.status(400).json({ error: 'No hay campos para actualizar' });

      sets.push('updated_at = now()');
      values.push(id);

      const updated = await db.query<SupplierRow>(
        `
          update suppliers
          set ${sets.join(', ')}
          where id = $${values.length}
          returning
            id,
            name,
            category,
            contact,
            email,
            phone,
            rating,
            status,
            balance,
            last_order,
            created_at,
            updated_at
        `,
        values
      );

      if (!updated.rows[0]) return res.status(404).json({ error: 'Proveedor no encontrado' });
      return res.json(mapSupplier(updated.rows[0]));
    } catch (error: any) {
      return res.status(500).json({ error: error?.message || 'No se pudo actualizar proveedor' });
    }
  });

  app.delete('/api/suppliers/:id', async (req, res) => {
    try {
      const db = requireDatabase();
      const id = String(req.params.id || '').trim();
      if (!id) return res.status(400).json({ error: 'id requerido' });

      const deleted = await db.query('delete from suppliers where id = $1', [id]);
      if (deleted.rowCount === 0) return res.status(404).json({ error: 'Proveedor no encontrado' });
      return res.status(204).send();
    } catch (error: any) {
      return res.status(500).json({ error: error?.message || 'No se pudo eliminar proveedor' });
    }
  });

  app.get('/api/documents', async (req, res) => {
    try {
      const db = requireDatabase();
      const result = await db.query<DocumentRow>(
        `
          select
            id,
            name,
            type,
            size,
            file_url,
            folder,
            author,
            date::text,
            created_at,
            updated_at
          from documents
          order by created_at desc
        `
      );

      return res.json({ items: result.rows.map(mapDocument) });
    } catch (error: any) {
      return res.status(500).json({ error: error?.message || 'No se pudieron obtener documentos' });
    }
  });

  app.post('/api/documents', async (req, res) => {
    try {
      const db = requireDatabase();
      const name = String(req.body?.name || '').trim();
      const type = String(req.body?.type || '').trim();
      const size = String(req.body?.size || '').trim();
      const fileUrl = String(req.body?.fileUrl || '').trim();
      const folder = String(req.body?.folder || 'General').trim() || 'General';
      const author = String(req.body?.author || 'Usuario').trim() || 'Usuario';
      const date = String(req.body?.date || '').trim();

      if (!name || !type) {
        return res.status(400).json({ error: 'name y type son obligatorios' });
      }

      const insert = await db.query<DocumentRow>(
        `
          insert into documents (
            name,
            type,
            size,
            file_url,
            folder,
            author,
            date
          ) values ($1,$2,$3,$4,$5,$6,$7::date)
          returning
            id,
            name,
            type,
            size,
            file_url,
            folder,
            author,
            date::text,
            created_at,
            updated_at
        `,
        [name, type, size || null, fileUrl || null, folder, author || null, date || new Date().toISOString().slice(0, 10)]
      );

      return res.status(201).json(mapDocument(insert.rows[0]));
    } catch (error: any) {
      return res.status(500).json({ error: error?.message || 'No se pudo crear documento' });
    }
  });

  app.patch('/api/documents/:id', async (req, res) => {
    try {
      const db = requireDatabase();
      const id = String(req.params.id || '').trim();
      if (!id) return res.status(400).json({ error: 'id requerido' });

      const sets: string[] = [];
      const values: any[] = [];
      const addSet = (name: string, value: any) => {
        values.push(value);
        sets.push(`${name} = $${values.length}`);
      };

      if (req.body?.name !== undefined) addSet('name', String(req.body.name || '').trim());
      if (req.body?.type !== undefined) addSet('type', String(req.body.type || '').trim());
      if (req.body?.size !== undefined) addSet('size', String(req.body.size || '').trim() || null);
      if (req.body?.fileUrl !== undefined) addSet('file_url', String(req.body.fileUrl || '').trim() || null);
      if (req.body?.folder !== undefined) addSet('folder', String(req.body.folder || '').trim() || 'General');
      if (req.body?.author !== undefined) addSet('author', String(req.body.author || '').trim() || null);
      if (req.body?.date !== undefined) {
        values.push(req.body.date ? String(req.body.date) : null);
        sets.push(`date = $${values.length}::date`);
      }

      if (sets.length === 0) return res.status(400).json({ error: 'No hay campos para actualizar' });
      sets.push('updated_at = now()');
      values.push(id);

      const updated = await db.query<DocumentRow>(
        `
          update documents
          set ${sets.join(', ')}
          where id = $${values.length}
          returning
            id,
            name,
            type,
            size,
            file_url,
            folder,
            author,
            date::text,
            created_at,
            updated_at
        `,
        values
      );

      if (!updated.rows[0]) return res.status(404).json({ error: 'Documento no encontrado' });
      return res.json(mapDocument(updated.rows[0]));
    } catch (error: any) {
      return res.status(500).json({ error: error?.message || 'No se pudo actualizar documento' });
    }
  });

  app.delete('/api/documents/:id', async (req, res) => {
    try {
      const db = requireDatabase();
      const id = String(req.params.id || '').trim();
      if (!id) return res.status(400).json({ error: 'id requerido' });

      const deleted = await db.query('delete from documents where id = $1', [id]);
      if (deleted.rowCount === 0) return res.status(404).json({ error: 'Documento no encontrado' });
      return res.status(204).send();
    } catch (error: any) {
      return res.status(500).json({ error: error?.message || 'No se pudo eliminar documento' });
    }
  });

  app.get('/api/folders', async (req, res) => {
    try {
      const db = requireDatabase();
      const result = await db.query<FolderRow>(
        `
          select id, name, color, created_at
          from document_folders
          order by name asc
        `
      );

      return res.json({ items: result.rows.map(mapFolder) });
    } catch (error: any) {
      return res.status(500).json({ error: error?.message || 'No se pudieron obtener carpetas' });
    }
  });

  app.post('/api/folders', async (req, res) => {
    try {
      const db = requireDatabase();
      const name = String(req.body?.name || '').trim();
      const color = String(req.body?.color || 'text-slate-500').trim() || 'text-slate-500';
      if (!name) return res.status(400).json({ error: 'name es obligatorio' });

      const insert = await db.query<FolderRow>(
        `
          insert into document_folders (name, color)
          values ($1,$2)
          on conflict (name)
          do update set color = excluded.color
          returning id, name, color, created_at
        `,
        [name, color]
      );

      return res.status(201).json(mapFolder(insert.rows[0]));
    } catch (error: any) {
      return res.status(500).json({ error: error?.message || 'No se pudo crear carpeta' });
    }
  });

  app.get('/api/equipment', async (req, res) => {
    try {
      const db = requireDatabase();
      const rows = await db.query<EquipmentRow>(
        `
          select
            id,
            name,
            type,
            project_id,
            daily_rate,
            estimated_days,
            status,
            created_at,
            updated_at
          from equipment
          order by created_at desc
        `
      );

      return res.json({ items: rows.rows.map(mapEquipment) });
    } catch (error: any) {
      return res.status(500).json({ error: error?.message || 'No se pudo obtener equipo' });
    }
  });

  app.post('/api/equipment', async (req, res) => {
    try {
      const db = requireDatabase();
      const name = String(req.body?.name || '').trim();
      const type = String(req.body?.type || 'Owned').trim() || 'Owned';
      const projectId = String(req.body?.projectId || '').trim();
      const dailyRate = Number(req.body?.dailyRate || 0);
      const estimatedDays = Number(req.body?.estimatedDays || 0);
      const status = String(req.body?.status || 'Available').trim() || 'Available';

      if (!name) return res.status(400).json({ error: 'name es obligatorio' });

      const insert = await db.query<EquipmentRow>(
        `
          insert into equipment (
            name,
            type,
            project_id,
            daily_rate,
            estimated_days,
            status
          ) values ($1,$2,$3,$4,$5,$6)
          returning
            id,
            name,
            type,
            project_id,
            daily_rate,
            estimated_days,
            status,
            created_at,
            updated_at
        `,
        [name, type, projectId || null, dailyRate, estimatedDays, status]
      );

      return res.status(201).json(mapEquipment(insert.rows[0]));
    } catch (error: any) {
      return res.status(500).json({ error: error?.message || 'No se pudo crear equipo' });
    }
  });

  app.patch('/api/equipment/:id', async (req, res) => {
    try {
      const db = requireDatabase();
      const id = String(req.params.id || '').trim();
      if (!id) return res.status(400).json({ error: 'id requerido' });

      const sets: string[] = [];
      const values: any[] = [];
      const addSet = (name: string, value: any) => {
        values.push(value);
        sets.push(`${name} = $${values.length}`);
      };

      if (req.body?.name !== undefined) addSet('name', String(req.body.name || '').trim());
      if (req.body?.type !== undefined) addSet('type', String(req.body.type || 'Owned').trim() || 'Owned');
      if (req.body?.projectId !== undefined) addSet('project_id', String(req.body.projectId || '').trim() || null);
      if (req.body?.dailyRate !== undefined) addSet('daily_rate', Number(req.body.dailyRate || 0));
      if (req.body?.estimatedDays !== undefined) addSet('estimated_days', Number(req.body.estimatedDays || 0));
      if (req.body?.status !== undefined) addSet('status', String(req.body.status || 'Available').trim() || 'Available');

      if (sets.length === 0) return res.status(400).json({ error: 'No hay campos para actualizar' });

      sets.push('updated_at = now()');
      values.push(id);

      const updated = await db.query<EquipmentRow>(
        `
          update equipment
          set ${sets.join(', ')}
          where id = $${values.length}
          returning
            id,
            name,
            type,
            project_id,
            daily_rate,
            estimated_days,
            status,
            created_at,
            updated_at
        `,
        values
      );

      if (!updated.rows[0]) return res.status(404).json({ error: 'Equipo no encontrado' });
      return res.json(mapEquipment(updated.rows[0]));
    } catch (error: any) {
      return res.status(500).json({ error: error?.message || 'No se pudo actualizar equipo' });
    }
  });

  app.delete('/api/equipment/:id', async (req, res) => {
    try {
      const db = requireDatabase();
      const id = String(req.params.id || '').trim();
      if (!id) return res.status(400).json({ error: 'id requerido' });

      const deleted = await db.query('delete from equipment where id = $1', [id]);
      if (deleted.rowCount === 0) return res.status(404).json({ error: 'Equipo no encontrado' });
      return res.status(204).send();
    } catch (error: any) {
      return res.status(500).json({ error: error?.message || 'No se pudo eliminar equipo' });
    }
  });

  app.get('/api/employees', async (req, res) => {
    try {
      const db = requireDatabase();
      const rows = await db.query<EmployeeRow>(
        `
          select
            id,
            name,
            role,
            department,
            salary,
            status,
            join_date::text,
            created_at,
            updated_at
          from employees
          order by created_at desc
        `
      );

      return res.json({ items: rows.rows.map(mapEmployee) });
    } catch (error: any) {
      return res.status(500).json({ error: error?.message || 'No se pudieron obtener empleados' });
    }
  });

  app.post('/api/employees', async (req, res) => {
    try {
      const db = requireDatabase();
      const name = String(req.body?.name || '').trim();
      const role = String(req.body?.role || '').trim();
      const department = String(req.body?.department || 'Operaciones').trim() || 'Operaciones';
      const salary = Number(req.body?.salary || 0);
      const status = String(req.body?.status || 'Active').trim() || 'Active';
      const joinDate = String(req.body?.joinDate || '').trim() || new Date().toISOString().slice(0, 10);

      if (!name || !role) return res.status(400).json({ error: 'name y role son obligatorios' });

      const insert = await db.query<EmployeeRow>(
        `
          insert into employees (name, role, department, salary, status, join_date)
          values ($1,$2,$3,$4,$5,$6::date)
          returning
            id,
            name,
            role,
            department,
            salary,
            status,
            join_date::text,
            created_at,
            updated_at
        `,
        [name, role, department, salary, status, joinDate]
      );

      return res.status(201).json(mapEmployee(insert.rows[0]));
    } catch (error: any) {
      return res.status(500).json({ error: error?.message || 'No se pudo crear empleado' });
    }
  });

  app.patch('/api/employees/:id', async (req, res) => {
    try {
      const db = requireDatabase();
      const id = String(req.params.id || '').trim();
      if (!id) return res.status(400).json({ error: 'id requerido' });

      const sets: string[] = [];
      const values: any[] = [];
      const addSet = (name: string, value: any) => {
        values.push(value);
        sets.push(`${name} = $${values.length}`);
      };

      if (req.body?.name !== undefined) addSet('name', String(req.body.name || '').trim());
      if (req.body?.role !== undefined) addSet('role', String(req.body.role || '').trim());
      if (req.body?.department !== undefined) addSet('department', String(req.body.department || 'Operaciones').trim() || 'Operaciones');
      if (req.body?.salary !== undefined) addSet('salary', Number(req.body.salary || 0));
      if (req.body?.status !== undefined) addSet('status', String(req.body.status || 'Active').trim() || 'Active');
      if (req.body?.joinDate !== undefined) {
        values.push(req.body.joinDate ? String(req.body.joinDate) : null);
        sets.push(`join_date = $${values.length}::date`);
      }

      if (sets.length === 0) return res.status(400).json({ error: 'No hay campos para actualizar' });
      sets.push('updated_at = now()');
      values.push(id);

      const updated = await db.query<EmployeeRow>(
        `
          update employees
          set ${sets.join(', ')}
          where id = $${values.length}
          returning
            id,
            name,
            role,
            department,
            salary,
            status,
            join_date::text,
            created_at,
            updated_at
        `,
        values
      );

      if (!updated.rows[0]) return res.status(404).json({ error: 'Empleado no encontrado' });
      return res.json(mapEmployee(updated.rows[0]));
    } catch (error: any) {
      return res.status(500).json({ error: error?.message || 'No se pudo actualizar empleado' });
    }
  });

  app.delete('/api/employees/:id', async (req, res) => {
    try {
      const db = requireDatabase();
      const id = String(req.params.id || '').trim();
      if (!id) return res.status(400).json({ error: 'id requerido' });

      const deleted = await db.query('delete from employees where id = $1', [id]);
      if (deleted.rowCount === 0) return res.status(404).json({ error: 'Empleado no encontrado' });
      return res.status(204).send();
    } catch (error: any) {
      return res.status(500).json({ error: error?.message || 'No se pudo eliminar empleado' });
    }
  });

  app.post('/api/attendance', async (req, res) => {
    try {
      const db = requireDatabase();
      const employeeId = String(req.body?.employeeId || '').trim();
      const employeeName = String(req.body?.employeeName || '').trim();
      const type = String(req.body?.type || '').trim();
      const timestamp = String(req.body?.timestamp || '').trim();

      if (!employeeId || !type || !timestamp) {
        return res.status(400).json({ error: 'employeeId, type y timestamp son obligatorios' });
      }

      const insert = await db.query<AttendanceRow>(
        `
          insert into attendance (employee_id, employee_name, type, timestamp)
          values ($1,$2,$3,$4::timestamptz)
          returning
            id,
            employee_id,
            employee_name,
            type,
            timestamp::text,
            created_at
        `,
        [employeeId, employeeName || null, type, timestamp]
      );

      return res.status(201).json(mapAttendance(insert.rows[0]));
    } catch (error: any) {
      return res.status(500).json({ error: error?.message || 'No se pudo registrar asistencia' });
    }
  });

  app.get('/api/attendance', async (req, res) => {
    try {
      const db = requireDatabase();
      const employeeId = String(req.query.employeeId || '').trim();
      const limit = Math.min(Math.max(Number(req.query.limit || 100), 1), 300);
      const offset = Math.max(Number(req.query.offset || 0), 0);

      const values: any[] = [limit, offset];
      let whereClause = '';
      if (employeeId) {
        values.push(employeeId);
        whereClause = `where employee_id = $${values.length}`;
      }

      const rows = await db.query<AttendanceRow>(
        `
          select
            id,
            employee_id,
            employee_name,
            type,
            timestamp::text,
            created_at
          from attendance
          ${whereClause}
          order by timestamp desc
          limit $1 offset $2
        `,
        values
      );

      return res.json({ items: rows.rows.map(mapAttendance), hasMore: rows.rows.length === limit });
    } catch (error: any) {
      return res.status(500).json({ error: error?.message || 'No se pudo obtener asistencia' });
    }
  });

  app.patch('/api/attendance/:id', async (req, res) => {
    try {
      const db = requireDatabase();
      const id = String(req.params.id || '').trim();
      if (!id) return res.status(400).json({ error: 'id requerido' });

      const sets: string[] = [];
      const values: any[] = [];
      const addSet = (name: string, value: any) => {
        values.push(value);
        sets.push(`${name} = $${values.length}`);
      };

      if (req.body?.employeeId !== undefined) addSet('employee_id', String(req.body.employeeId || '').trim());
      if (req.body?.employeeName !== undefined) addSet('employee_name', String(req.body.employeeName || '').trim() || null);
      if (req.body?.type !== undefined) addSet('type', String(req.body.type || '').trim());
      if (req.body?.timestamp !== undefined) {
        values.push(req.body.timestamp ? String(req.body.timestamp) : null);
        sets.push(`timestamp = $${values.length}::timestamptz`);
      }

      if (sets.length === 0) return res.status(400).json({ error: 'No hay campos para actualizar' });

      values.push(id);
      const updated = await db.query<AttendanceRow>(
        `
          update attendance
          set ${sets.join(', ')}
          where id = $${values.length}
          returning
            id,
            employee_id,
            employee_name,
            type,
            timestamp::text,
            created_at
        `,
        values
      );

      if (!updated.rows[0]) return res.status(404).json({ error: 'Asistencia no encontrada' });
      return res.json(mapAttendance(updated.rows[0]));
    } catch (error: any) {
      return res.status(500).json({ error: error?.message || 'No se pudo actualizar asistencia' });
    }
  });

  app.delete('/api/attendance/:id', async (req, res) => {
    try {
      const db = requireDatabase();
      const id = String(req.params.id || '').trim();
      if (!id) return res.status(400).json({ error: 'id requerido' });

      const deleted = await db.query('delete from attendance where id = $1', [id]);
      if (deleted.rowCount === 0) return res.status(404).json({ error: 'Asistencia no encontrada' });
      return res.status(204).send();
    } catch (error: any) {
      return res.status(500).json({ error: error?.message || 'No se pudo eliminar asistencia' });
    }
  });

  app.get('/api/vacancies', async (req, res) => {
    try {
      const db = requireDatabase();
      const rows = await db.query<VacancyRow>(
        `
          select
            id,
            title,
            department,
            openings,
            status,
            notes,
            created_at,
            updated_at
          from vacancies
          order by created_at desc
        `
      );

      return res.json({ items: rows.rows.map(mapVacancy) });
    } catch (error: any) {
      return res.status(500).json({ error: error?.message || 'No se pudieron obtener vacantes' });
    }
  });

  app.post('/api/vacancies', async (req, res) => {
    try {
      const db = requireDatabase();
      const title = String(req.body?.title || '').trim();
      const department = String(req.body?.department || 'Operaciones').trim() || 'Operaciones';
      const openings = Math.max(1, Number(req.body?.openings || 1));
      const status = String(req.body?.status || 'Open').trim() === 'Closed' ? 'Closed' : 'Open';
      const notes = String(req.body?.notes || '').trim();

      if (!title) return res.status(400).json({ error: 'title es obligatorio' });

      const insert = await db.query<VacancyRow>(
        `
          insert into vacancies (title, department, openings, status, notes)
          values ($1,$2,$3,$4,$5)
          returning
            id,
            title,
            department,
            openings,
            status,
            notes,
            created_at,
            updated_at
        `,
        [title, department, openings, status, notes || null]
      );

      return res.status(201).json(mapVacancy(insert.rows[0]));
    } catch (error: any) {
      return res.status(500).json({ error: error?.message || 'No se pudo crear vacante' });
    }
  });

  app.patch('/api/vacancies/:id', async (req, res) => {
    try {
      const db = requireDatabase();
      const id = String(req.params.id || '').trim();
      if (!id) return res.status(400).json({ error: 'id requerido' });

      const sets: string[] = [];
      const values: any[] = [];
      const addSet = (name: string, value: any) => {
        values.push(value);
        sets.push(`${name} = $${values.length}`);
      };

      if (req.body?.title !== undefined) addSet('title', String(req.body.title || '').trim());
      if (req.body?.department !== undefined) {
        addSet('department', String(req.body.department || 'Operaciones').trim() || 'Operaciones');
      }
      if (req.body?.openings !== undefined) addSet('openings', Math.max(1, Number(req.body.openings || 1)));
      if (req.body?.status !== undefined) {
        addSet('status', String(req.body.status || 'Open').trim() === 'Closed' ? 'Closed' : 'Open');
      }
      if (req.body?.notes !== undefined) addSet('notes', String(req.body.notes || '').trim() || null);

      if (sets.length === 0) return res.status(400).json({ error: 'No hay campos para actualizar' });

      sets.push('updated_at = now()');
      values.push(id);

      const updated = await db.query<VacancyRow>(
        `
          update vacancies
          set ${sets.join(', ')}
          where id = $${values.length}
          returning
            id,
            title,
            department,
            openings,
            status,
            notes,
            created_at,
            updated_at
        `,
        values
      );

      if (!updated.rows[0]) return res.status(404).json({ error: 'Vacante no encontrada' });
      return res.json(mapVacancy(updated.rows[0]));
    } catch (error: any) {
      return res.status(500).json({ error: error?.message || 'No se pudo actualizar vacante' });
    }
  });

  app.delete('/api/vacancies/:id', async (req, res) => {
    try {
      const db = requireDatabase();
      const id = String(req.params.id || '').trim();
      if (!id) return res.status(400).json({ error: 'id requerido' });

      const deleted = await db.query('delete from vacancies where id = $1', [id]);
      if (deleted.rowCount === 0) return res.status(404).json({ error: 'Vacante no encontrada' });
      return res.status(204).send();
    } catch (error: any) {
      return res.status(500).json({ error: error?.message || 'No se pudo eliminar vacante' });
    }
  });

  app.get('/api/contracts', async (req, res) => {
    try {
      const db = requireDatabase();
      const rows = await db.query<EmploymentContractRow>(
        `
          select
            id,
            employee_id,
            employee_name,
            employee_role,
            employee_department,
            salary,
            start_date::text,
            contract_type,
            company_name,
            owner_name,
            owner_title,
            status,
            share_token,
            sent_at::text,
            worker_signed_at::text,
            owner_signed_at::text,
            worker_signature_data_url,
            owner_signature_data_url,
            signed_file_url,
            signed_file_name,
            notes,
            created_at,
            updated_at
          from employment_contracts
          order by created_at desc
        `
      );

      return res.json({ items: rows.rows.map(mapEmploymentContract) });
    } catch (error: any) {
      return res.status(500).json({ error: error?.message || 'No se pudieron obtener contratos' });
    }
  });

  app.post('/api/contracts', async (req, res) => {
    try {
      const db = requireDatabase();
      const employeeId = String(req.body?.employeeId || '').trim();
      const startDate = String(req.body?.startDate || '').trim() || new Date().toISOString().slice(0, 10);
      const contractType = String(req.body?.contractType || 'Tiempo indefinido').trim() || 'Tiempo indefinido';
      const companyName = String(req.body?.companyName || '').trim();
      const ownerName = String(req.body?.ownerName || '').trim();
      const ownerTitle = String(req.body?.ownerTitle || '').trim();
      const notes = String(req.body?.notes || '').trim();

      if (!employeeId || !companyName || !ownerName || !ownerTitle) {
        return res.status(400).json({ error: 'employeeId, companyName, ownerName y ownerTitle son obligatorios' });
      }

      const employeeResult = await db.query<EmployeeRow>(
        `
          select
            id,
            name,
            role,
            department,
            salary,
            status,
            join_date::text,
            created_at,
            updated_at
          from employees
          where id = $1
          limit 1
        `,
        [employeeId]
      );

      const employee = employeeResult.rows[0];
      if (!employee) return res.status(404).json({ error: 'Empleado no encontrado' });

      const shareToken = randomUUID().replace(/-/g, '');

      const insert = await db.query<EmploymentContractRow>(
        `
          insert into employment_contracts (
            employee_id,
            employee_name,
            employee_role,
            employee_department,
            salary,
            start_date,
            contract_type,
            company_name,
            owner_name,
            owner_title,
            status,
            share_token,
            notes
          ) values ($1,$2,$3,$4,$5,$6::date,$7,$8,$9,$10,$11,$12,$13)
          returning
            id,
            employee_id,
            employee_name,
            employee_role,
            employee_department,
            salary,
            start_date::text,
            contract_type,
            company_name,
            owner_name,
            owner_title,
            status,
            share_token,
            sent_at::text,
            worker_signed_at::text,
            owner_signed_at::text,
            worker_signature_data_url,
            owner_signature_data_url,
            signed_file_url,
            signed_file_name,
            notes,
            created_at,
            updated_at
        `,
        [
          employee.id,
          employee.name,
          employee.role,
          employee.department,
          Number(employee.salary || 0),
          startDate,
          contractType,
          companyName,
          ownerName,
          ownerTitle,
          'draft',
          shareToken,
          notes || null,
        ]
      );

      return res.status(201).json(mapEmploymentContract(insert.rows[0]));
    } catch (error: any) {
      return res.status(500).json({ error: error?.message || 'No se pudo crear contrato' });
    }
  });

  app.patch('/api/contracts/:id', async (req, res) => {
    try {
      const db = requireDatabase();
      const id = String(req.params.id || '').trim();
      if (!id) return res.status(400).json({ error: 'id requerido' });

      const sets: string[] = [];
      const values: any[] = [];
      const addSet = (name: string, value: any) => {
        values.push(value);
        sets.push(`${name} = $${values.length}`);
      };

      if (req.body?.status !== undefined) addSet('status', String(req.body.status || 'draft').trim());
      if (req.body?.ownerSignatureDataUrl !== undefined) {
        addSet('owner_signature_data_url', String(req.body.ownerSignatureDataUrl || '').trim() || null);
      }
      if (req.body?.workerSignatureDataUrl !== undefined) {
        addSet('worker_signature_data_url', String(req.body.workerSignatureDataUrl || '').trim() || null);
      }
      if (req.body?.signedFileUrl !== undefined) addSet('signed_file_url', String(req.body.signedFileUrl || '').trim() || null);
      if (req.body?.signedFileName !== undefined) addSet('signed_file_name', String(req.body.signedFileName || '').trim() || null);
      if (req.body?.notes !== undefined) addSet('notes', String(req.body.notes || '').trim() || null);
      if (req.body?.sentAt !== undefined) {
        values.push(req.body.sentAt ? String(req.body.sentAt) : null);
        sets.push(`sent_at = $${values.length}::timestamptz`);
      }
      if (req.body?.workerSignedAt !== undefined) {
        values.push(req.body.workerSignedAt ? String(req.body.workerSignedAt) : null);
        sets.push(`worker_signed_at = $${values.length}::timestamptz`);
      }
      if (req.body?.ownerSignedAt !== undefined) {
        values.push(req.body.ownerSignedAt ? String(req.body.ownerSignedAt) : null);
        sets.push(`owner_signed_at = $${values.length}::timestamptz`);
      }

      if (sets.length === 0) return res.status(400).json({ error: 'No hay campos para actualizar' });

      sets.push('updated_at = now()');
      values.push(id);

      const updated = await db.query<EmploymentContractRow>(
        `
          update employment_contracts
          set ${sets.join(', ')}
          where id = $${values.length}
          returning
            id,
            employee_id,
            employee_name,
            employee_role,
            employee_department,
            salary,
            start_date::text,
            contract_type,
            company_name,
            owner_name,
            owner_title,
            status,
            share_token,
            sent_at::text,
            worker_signed_at::text,
            owner_signed_at::text,
            worker_signature_data_url,
            owner_signature_data_url,
            signed_file_url,
            signed_file_name,
            notes,
            created_at,
            updated_at
        `,
        values
      );

      if (!updated.rows[0]) return res.status(404).json({ error: 'Contrato no encontrado' });

      if (
        req.body?.signedFileUrl &&
        req.body?.signedFileName
      ) {
        await db.query(
          `
            insert into documents (name, type, size, file_url, folder, author, date)
            values ($1,$2,$3,$4,$5,$6,$7::date)
          `,
          [
            String(req.body.signedFileName),
            'PDF',
            String(req.body.fileSize || ''),
            String(req.body.signedFileUrl),
            'Legal',
            String(req.body.documentAuthor || 'RRHH'),
            new Date().toISOString().slice(0, 10),
          ]
        );
      }

      return res.json(mapEmploymentContract(updated.rows[0]));
    } catch (error: any) {
      return res.status(500).json({ error: error?.message || 'No se pudo actualizar contrato' });
    }
  });

  app.delete('/api/contracts/:id', async (req, res) => {
    try {
      const db = requireDatabase();
      const id = String(req.params.id || '').trim();
      if (!id) return res.status(400).json({ error: 'id requerido' });

      const deleted = await db.query('delete from employment_contracts where id = $1', [id]);
      if (deleted.rowCount === 0) return res.status(404).json({ error: 'Contrato no encontrado' });
      return res.status(204).send();
    } catch (error: any) {
      return res.status(500).json({ error: error?.message || 'No se pudo eliminar contrato' });
    }
  });

  app.get('/api/contracts/sign/:token', async (req, res) => {
    try {
      const db = requireDatabase();
      const token = String(req.params.token || '').trim();
      if (!token) return res.status(400).json({ error: 'token requerido' });

      const row = await db.query<EmploymentContractRow>(
        `
          select
            id,
            employee_id,
            employee_name,
            employee_role,
            employee_department,
            salary,
            start_date::text,
            contract_type,
            company_name,
            owner_name,
            owner_title,
            status,
            share_token,
            sent_at::text,
            worker_signed_at::text,
            owner_signed_at::text,
            worker_signature_data_url,
            owner_signature_data_url,
            signed_file_url,
            signed_file_name,
            notes,
            created_at,
            updated_at
          from employment_contracts
          where share_token = $1
          limit 1
        `,
        [token]
      );

      if (!row.rows[0]) return res.status(404).json({ error: 'Contrato no encontrado' });
      return res.json(mapEmploymentContract(row.rows[0]));
    } catch (error: any) {
      return res.status(500).json({ error: error?.message || 'No se pudo obtener contrato para firma' });
    }
  });

  app.post('/api/contracts/sign/:token', async (req, res) => {
    try {
      const db = requireDatabase();
      const token = String(req.params.token || '').trim();
      const workerSignatureDataUrl = String(req.body?.workerSignatureDataUrl || '').trim();

      if (!token || !workerSignatureDataUrl.startsWith('data:image/')) {
        return res.status(400).json({ error: 'token y firma del trabajador son obligatorios' });
      }

      const updated = await db.query<EmploymentContractRow>(
        `
          update employment_contracts
          set
            worker_signature_data_url = $1,
            worker_signed_at = now(),
            status = 'worker_signed',
            updated_at = now()
          where share_token = $2
          returning
            id,
            employee_id,
            employee_name,
            employee_role,
            employee_department,
            salary,
            start_date::text,
            contract_type,
            company_name,
            owner_name,
            owner_title,
            status,
            share_token,
            sent_at::text,
            worker_signed_at::text,
            owner_signed_at::text,
            worker_signature_data_url,
            owner_signature_data_url,
            signed_file_url,
            signed_file_name,
            notes,
            created_at,
            updated_at
        `,
        [workerSignatureDataUrl, token]
      );

      if (!updated.rows[0]) return res.status(404).json({ error: 'Contrato no encontrado' });
      return res.json(mapEmploymentContract(updated.rows[0]));
    } catch (error: any) {
      return res.status(500).json({ error: error?.message || 'No se pudo registrar firma del trabajador' });
    }
  });

  app.get('/api/risks', async (req, res) => {
    try {
      const db = requireDatabase();
      const rows = await db.query<RiskRow>(
        `
          select
            id,
            project_id,
            title,
            description,
            category,
            impact,
            probability,
            status,
            mitigation_plan,
            contingency_plan,
            owner,
            created_at,
            updated_at
          from risks
          order by created_at desc
        `
      );

      return res.json({ items: rows.rows.map(mapRisk) });
    } catch (error: any) {
      return res.status(500).json({ error: error?.message || 'No se pudieron obtener riesgos' });
    }
  });

  app.post('/api/risks', async (req, res) => {
    try {
      const db = requireDatabase();
      const projectId = String(req.body?.projectId || '').trim();
      const title = String(req.body?.title || '').trim();
      const description = String(req.body?.description || '').trim();
      const category = String(req.body?.category || 'Technical').trim() || 'Technical';
      const impact = String(req.body?.impact || 'Medium').trim() || 'Medium';
      const probability = String(req.body?.probability || 'Medium').trim() || 'Medium';
      const status = String(req.body?.status || 'Identified').trim() || 'Identified';
      const mitigationPlan = String(req.body?.mitigationPlan || '').trim();
      const contingencyPlan = String(req.body?.contingencyPlan || '').trim();
      const owner = String(req.body?.owner || '').trim();

      if (!projectId || !title) return res.status(400).json({ error: 'projectId y title son obligatorios' });

      const insert = await db.query<RiskRow>(
        `
          insert into risks (
            project_id,
            title,
            description,
            category,
            impact,
            probability,
            status,
            mitigation_plan,
            contingency_plan,
            owner
          ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
          returning
            id,
            project_id,
            title,
            description,
            category,
            impact,
            probability,
            status,
            mitigation_plan,
            contingency_plan,
            owner,
            created_at,
            updated_at
        `,
        [projectId, title, description, category, impact, probability, status, mitigationPlan, contingencyPlan, owner]
      );

      return res.status(201).json(mapRisk(insert.rows[0]));
    } catch (error: any) {
      return res.status(500).json({ error: error?.message || 'No se pudo crear riesgo' });
    }
  });

  app.patch('/api/risks/:id', async (req, res) => {
    try {
      const db = requireDatabase();
      const id = String(req.params.id || '').trim();
      if (!id) return res.status(400).json({ error: 'id requerido' });

      const sets: string[] = [];
      const values: any[] = [];
      const addSet = (name: string, value: any) => {
        values.push(value);
        sets.push(`${name} = $${values.length}`);
      };

      if (req.body?.projectId !== undefined) addSet('project_id', String(req.body.projectId || '').trim());
      if (req.body?.title !== undefined) addSet('title', String(req.body.title || '').trim());
      if (req.body?.description !== undefined) addSet('description', String(req.body.description || '').trim());
      if (req.body?.category !== undefined) addSet('category', String(req.body.category || 'Technical').trim() || 'Technical');
      if (req.body?.impact !== undefined) addSet('impact', String(req.body.impact || 'Medium').trim() || 'Medium');
      if (req.body?.probability !== undefined) addSet('probability', String(req.body.probability || 'Medium').trim() || 'Medium');
      if (req.body?.status !== undefined) addSet('status', String(req.body.status || 'Identified').trim() || 'Identified');
      if (req.body?.mitigationPlan !== undefined) addSet('mitigation_plan', String(req.body.mitigationPlan || '').trim());
      if (req.body?.contingencyPlan !== undefined) addSet('contingency_plan', String(req.body.contingencyPlan || '').trim());
      if (req.body?.owner !== undefined) addSet('owner', String(req.body.owner || '').trim());

      if (sets.length === 0) return res.status(400).json({ error: 'No hay campos para actualizar' });

      sets.push('updated_at = now()');
      values.push(id);

      const updated = await db.query<RiskRow>(
        `
          update risks
          set ${sets.join(', ')}
          where id = $${values.length}
          returning
            id,
            project_id,
            title,
            description,
            category,
            impact,
            probability,
            status,
            mitigation_plan,
            contingency_plan,
            owner,
            created_at,
            updated_at
        `,
        values
      );

      if (!updated.rows[0]) return res.status(404).json({ error: 'Riesgo no encontrado' });
      return res.json(mapRisk(updated.rows[0]));
    } catch (error: any) {
      return res.status(500).json({ error: error?.message || 'No se pudo actualizar riesgo' });
    }
  });

  app.delete('/api/risks/:id', async (req, res) => {
    try {
      const db = requireDatabase();
      const id = String(req.params.id || '').trim();
      if (!id) return res.status(400).json({ error: 'id requerido' });

      const deleted = await db.query('delete from risks where id = $1', [id]);
      if (deleted.rowCount === 0) return res.status(404).json({ error: 'Riesgo no encontrado' });
      return res.status(204).send();
    } catch (error: any) {
      return res.status(500).json({ error: error?.message || 'No se pudo eliminar riesgo' });
    }
  });

  app.get('/api/safety-incidents', async (req, res) => {
    try {
      const db = requireDatabase();
      const rows = await db.query<SafetyIncidentRow>(
        `
          select
            id,
            title,
            type,
            severity,
            location,
            incident_date::text,
            description,
            measures,
            status,
            author_email,
            created_at,
            updated_at
          from safety_incidents
          order by incident_date desc, created_at desc
        `
      );

      return res.json({ items: rows.rows.map(mapSafetyIncident) });
    } catch (error: any) {
      return res.status(500).json({ error: error?.message || 'No se pudieron obtener incidentes' });
    }
  });

  app.post('/api/safety-incidents', async (req, res) => {
    try {
      const db = requireDatabase();
      const title = String(req.body?.title || '').trim();
      const type = String(req.body?.type || 'Accidente').trim() || 'Accidente';
      const severity = String(req.body?.severity || 'Baja').trim() || 'Baja';
      const location = String(req.body?.location || '').trim();
      const date = String(req.body?.date || '').trim() || new Date().toISOString().slice(0, 10);
      const description = String(req.body?.description || '').trim();
      const measures = String(req.body?.measures || '').trim();
      const status = String(req.body?.status || 'Open').trim() || 'Open';
      const authorEmail = String(req.body?.authorEmail || '').trim();

      if (!title || !location || !description) {
        return res.status(400).json({ error: 'title, location y description son obligatorios' });
      }

      const insert = await db.query<SafetyIncidentRow>(
        `
          insert into safety_incidents (
            title,
            type,
            severity,
            location,
            incident_date,
            description,
            measures,
            status,
            author_email
          ) values ($1,$2,$3,$4,$5::date,$6,$7,$8,$9)
          returning
            id,
            title,
            type,
            severity,
            location,
            incident_date::text,
            description,
            measures,
            status,
            author_email,
            created_at,
            updated_at
        `,
        [title, type, severity, location, date, description, measures, status, authorEmail || null]
      );

      return res.status(201).json(mapSafetyIncident(insert.rows[0]));
    } catch (error: any) {
      return res.status(500).json({ error: error?.message || 'No se pudo crear incidente' });
    }
  });

  app.patch('/api/safety-incidents/:id', async (req, res) => {
    try {
      const db = requireDatabase();
      const id = String(req.params.id || '').trim();
      if (!id) return res.status(400).json({ error: 'id requerido' });

      const sets: string[] = [];
      const values: any[] = [];
      const addSet = (name: string, value: any) => {
        values.push(value);
        sets.push(`${name} = $${values.length}`);
      };

      if (req.body?.title !== undefined) addSet('title', String(req.body.title || '').trim());
      if (req.body?.type !== undefined) addSet('type', String(req.body.type || 'Accidente').trim() || 'Accidente');
      if (req.body?.severity !== undefined) addSet('severity', String(req.body.severity || 'Baja').trim() || 'Baja');
      if (req.body?.location !== undefined) addSet('location', String(req.body.location || '').trim());
      if (req.body?.date !== undefined) {
        values.push(req.body.date ? String(req.body.date) : null);
        sets.push(`incident_date = $${values.length}::date`);
      }
      if (req.body?.description !== undefined) addSet('description', String(req.body.description || '').trim());
      if (req.body?.measures !== undefined) addSet('measures', String(req.body.measures || '').trim());
      if (req.body?.status !== undefined) addSet('status', String(req.body.status || 'Open').trim() || 'Open');
      if (req.body?.authorEmail !== undefined) addSet('author_email', String(req.body.authorEmail || '').trim() || null);

      if (sets.length === 0) return res.status(400).json({ error: 'No hay campos para actualizar' });

      sets.push('updated_at = now()');
      values.push(id);

      const updated = await db.query<SafetyIncidentRow>(
        `
          update safety_incidents
          set ${sets.join(', ')}
          where id = $${values.length}
          returning
            id,
            title,
            type,
            severity,
            location,
            incident_date::text,
            description,
            measures,
            status,
            author_email,
            created_at,
            updated_at
        `,
        values
      );

      if (!updated.rows[0]) return res.status(404).json({ error: 'Incidente no encontrado' });
      return res.json(mapSafetyIncident(updated.rows[0]));
    } catch (error: any) {
      return res.status(500).json({ error: error?.message || 'No se pudo actualizar incidente' });
    }
  });

  app.delete('/api/safety-incidents/:id', async (req, res) => {
    try {
      const db = requireDatabase();
      const id = String(req.params.id || '').trim();
      if (!id) return res.status(400).json({ error: 'id requerido' });

      const deleted = await db.query('delete from safety_incidents where id = $1', [id]);
      if (deleted.rowCount === 0) return res.status(404).json({ error: 'Incidente no encontrado' });
      return res.status(204).send();
    } catch (error: any) {
      return res.status(500).json({ error: error?.message || 'No se pudo eliminar incidente' });
    }
  });

  app.get('/api/subcontracts', async (req, res) => {
    try {
      const db = requireDatabase();
      const projectId = String(req.query.projectId || '').trim();
      const status = String(req.query.status || '').trim();

      const where: string[] = [];
      const values: any[] = [];
      if (projectId) {
        values.push(projectId);
        where.push(`project_id = $${values.length}`);
      }
      if (status) {
        values.push(status);
        where.push(`status = $${values.length}`);
      }

      const whereClause = where.length > 0 ? `where ${where.join(' and ')}` : '';
      const rows = await db.query<SubcontractRow>(
        `
          select
            id,
            project_id,
            budget_item_id,
            budget_item_name,
            contractor,
            service,
            start_date::text,
            end_date::text,
            total,
            paid,
            status,
            created_at,
            updated_at
          from subcontracts
          ${whereClause}
          order by created_at desc
        `,
        values
      );

      return res.json({ items: rows.rows.map(mapSubcontract) });
    } catch (error: any) {
      return res.status(500).json({ error: error?.message || 'No se pudieron obtener subcontratos' });
    }
  });

  app.post('/api/subcontracts', async (req, res) => {
    try {
      const db = requireDatabase();
      const projectId = String(req.body?.projectId || '').trim();
      const budgetItemId = String(req.body?.budgetItemId || '').trim();
      const budgetItemName = String(req.body?.budgetItemName || '').trim();
      const contractor = String(req.body?.contractor || '').trim();
      const service = String(req.body?.service || '').trim();
      const startDate = String(req.body?.startDate || '').trim();
      const endDate = String(req.body?.endDate || '').trim();
      const total = Number(req.body?.total || 0);
      const paid = Number(req.body?.paid || 0);
      const status = String(req.body?.status || 'Active').trim() || 'Active';

      if (!projectId || !contractor || !service || !Number.isFinite(total) || total <= 0) {
        return res.status(400).json({ error: 'projectId, contractor, service y total valido son obligatorios' });
      }

      const insert = await db.query<SubcontractRow>(
        `
          insert into subcontracts (
            project_id,
            budget_item_id,
            budget_item_name,
            contractor,
            service,
            start_date,
            end_date,
            total,
            paid,
            status
          ) values ($1,$2,$3,$4,$5,$6::date,$7::date,$8,$9,$10)
          returning
            id,
            project_id,
            budget_item_id,
            budget_item_name,
            contractor,
            service,
            start_date::text,
            end_date::text,
            total,
            paid,
            status,
            created_at,
            updated_at
        `,
        [
          projectId,
          budgetItemId || null,
          budgetItemName,
          contractor,
          service,
          startDate || null,
          endDate || null,
          total,
          paid,
          status,
        ]
      );

      return res.status(201).json(mapSubcontract(insert.rows[0]));
    } catch (error: any) {
      if (String(error?.message || '').includes('uq_subcontracts_project_service')) {
        return res.status(409).json({ error: 'Ya existe un subcontrato para ese servicio en el proyecto' });
      }
      return res.status(500).json({ error: error?.message || 'No se pudo crear subcontrato' });
    }
  });

  app.patch('/api/subcontracts/:id', async (req, res) => {
    try {
      const db = requireDatabase();
      const id = String(req.params.id || '').trim();
      if (!id) return res.status(400).json({ error: 'id requerido' });

      const sets: string[] = [];
      const values: any[] = [];
      const addSet = (name: string, value: any) => {
        values.push(value);
        sets.push(`${name} = $${values.length}`);
      };

      if (req.body?.projectId !== undefined) addSet('project_id', String(req.body.projectId || '').trim());
      if (req.body?.budgetItemId !== undefined) addSet('budget_item_id', String(req.body.budgetItemId || '').trim() || null);
      if (req.body?.budgetItemName !== undefined) addSet('budget_item_name', String(req.body.budgetItemName || '').trim());
      if (req.body?.contractor !== undefined) addSet('contractor', String(req.body.contractor || '').trim());
      if (req.body?.service !== undefined) addSet('service', String(req.body.service || '').trim());
      if (req.body?.startDate !== undefined) {
        values.push(req.body.startDate ? String(req.body.startDate) : null);
        sets.push(`start_date = $${values.length}::date`);
      }
      if (req.body?.endDate !== undefined) {
        values.push(req.body.endDate ? String(req.body.endDate) : null);
        sets.push(`end_date = $${values.length}::date`);
      }
      if (req.body?.total !== undefined) addSet('total', Number(req.body.total || 0));
      if (req.body?.paid !== undefined) addSet('paid', Number(req.body.paid || 0));
      if (req.body?.status !== undefined) addSet('status', String(req.body.status || 'Active').trim() || 'Active');

      if (sets.length === 0) return res.status(400).json({ error: 'No hay campos para actualizar' });

      sets.push('updated_at = now()');
      values.push(id);

      const updated = await db.query<SubcontractRow>(
        `
          update subcontracts
          set ${sets.join(', ')}
          where id = $${values.length}
          returning
            id,
            project_id,
            budget_item_id,
            budget_item_name,
            contractor,
            service,
            start_date::text,
            end_date::text,
            total,
            paid,
            status,
            created_at,
            updated_at
        `,
        values
      );

      if (!updated.rows[0]) return res.status(404).json({ error: 'Subcontrato no encontrado' });
      return res.json(mapSubcontract(updated.rows[0]));
    } catch (error: any) {
      if (String(error?.message || '').includes('uq_subcontracts_project_service')) {
        return res.status(409).json({ error: 'Ya existe un subcontrato para ese servicio en el proyecto' });
      }
      return res.status(500).json({ error: error?.message || 'No se pudo actualizar subcontrato' });
    }
  });

  app.delete('/api/subcontracts/:id', async (req, res) => {
    try {
      const db = requireDatabase();
      const id = String(req.params.id || '').trim();
      if (!id) return res.status(400).json({ error: 'id requerido' });

      const deleted = await db.query('delete from subcontracts where id = $1', [id]);
      if (deleted.rowCount === 0) return res.status(404).json({ error: 'Subcontrato no encontrado' });
      return res.status(204).send();
    } catch (error: any) {
      return res.status(500).json({ error: error?.message || 'No se pudo eliminar subcontrato' });
    }
  });

  app.get('/api/workflows', async (req, res) => {
    try {
      const db = requireDatabase();
      const status = String(req.query.status || '').trim();
      const where: string[] = [];
      const values: any[] = [];

      if (status) {
        values.push(status);
        where.push(`status = $${values.length}`);
      }

      const whereClause = where.length > 0 ? `where ${where.join(' and ')}` : '';
      const rows = await db.query<WorkflowRow>(
        `
          select
            id,
            title,
            type,
            reference_id,
            status,
            requested_by,
            requested_at::text,
            priority,
            description,
            amount,
            resolved_at::text,
            created_at,
            updated_at
          from workflows
          ${whereClause}
          order by requested_at desc
        `,
        values
      );

      return res.json({ items: rows.rows.map(mapWorkflow) });
    } catch (error: any) {
      return res.status(500).json({ error: error?.message || 'No se pudieron obtener workflows' });
    }
  });

  app.post('/api/workflows', async (req, res) => {
    try {
      const db = requireDatabase();
      const title = String(req.body?.title || '').trim();
      const type = String(req.body?.type || 'other').trim() || 'other';
      const referenceId = String(req.body?.referenceId || '').trim();
      const requestedBy = String(req.body?.requestedBy || '').trim();
      const priority = String(req.body?.priority || 'medium').trim() || 'medium';
      const description = String(req.body?.description || '').trim();
      const amount = req.body?.amount !== undefined && req.body?.amount !== null && req.body?.amount !== ''
        ? Number(req.body.amount)
        : null;

      if (!title || !referenceId || !requestedBy || !description) {
        return res.status(400).json({ error: 'title, referenceId, requestedBy y description son obligatorios' });
      }

      const insert = await db.query<WorkflowRow>(
        `
          insert into workflows (
            title,
            type,
            reference_id,
            status,
            requested_by,
            requested_at,
            priority,
            description,
            amount
          ) values ($1,$2,$3,$4,$5,now(),$6,$7,$8)
          returning
            id,
            title,
            type,
            reference_id,
            status,
            requested_by,
            requested_at::text,
            priority,
            description,
            amount,
            resolved_at::text,
            created_at,
            updated_at
        `,
        [title, type, referenceId, 'pending', requestedBy, priority, description, amount]
      );

      return res.status(201).json(mapWorkflow(insert.rows[0]));
    } catch (error: any) {
      return res.status(500).json({ error: error?.message || 'No se pudo crear workflow' });
    }
  });

  app.patch('/api/workflows/:id', async (req, res) => {
    try {
      const db = requireDatabase();
      const id = String(req.params.id || '').trim();
      if (!id) return res.status(400).json({ error: 'id requerido' });

      const sets: string[] = [];
      const values: any[] = [];
      const addSet = (name: string, value: any) => {
        values.push(value);
        sets.push(`${name} = $${values.length}`);
      };

      if (req.body?.title !== undefined) addSet('title', String(req.body.title || '').trim());
      if (req.body?.type !== undefined) addSet('type', String(req.body.type || 'other').trim() || 'other');
      if (req.body?.referenceId !== undefined) addSet('reference_id', String(req.body.referenceId || '').trim());
      if (req.body?.requestedBy !== undefined) addSet('requested_by', String(req.body.requestedBy || '').trim());
      if (req.body?.priority !== undefined) addSet('priority', String(req.body.priority || 'medium').trim() || 'medium');
      if (req.body?.description !== undefined) addSet('description', String(req.body.description || '').trim());
      if (req.body?.amount !== undefined) {
        const amount = req.body.amount === null || req.body.amount === '' ? null : Number(req.body.amount);
        addSet('amount', amount);
      }

      if (sets.length === 0) return res.status(400).json({ error: 'No hay campos para actualizar' });
      sets.push('updated_at = now()');
      values.push(id);

      const updated = await db.query<WorkflowRow>(
        `
          update workflows
          set ${sets.join(', ')}
          where id = $${values.length}
          returning
            id,
            title,
            type,
            reference_id,
            status,
            requested_by,
            requested_at::text,
            priority,
            description,
            amount,
            resolved_at::text,
            created_at,
            updated_at
        `,
        values
      );

      if (!updated.rows[0]) return res.status(404).json({ error: 'Workflow no encontrado' });
      return res.json(mapWorkflow(updated.rows[0]));
    } catch (error: any) {
      return res.status(500).json({ error: error?.message || 'No se pudo actualizar workflow' });
    }
  });

  app.patch('/api/workflows/:id/status', async (req, res) => {
    try {
      const db = requireDatabase();
      const id = String(req.params.id || '').trim();
      const status = String(req.body?.status || '').trim() as 'pending' | 'approved' | 'rejected';
      if (!id) return res.status(400).json({ error: 'id requerido' });
      if (!['pending', 'approved', 'rejected'].includes(status)) {
        return res.status(400).json({ error: 'status invalido' });
      }

      const updated = await db.query<WorkflowRow>(
        `
          update workflows
          set
            status = $1,
            resolved_at = case when $1 in ('approved', 'rejected') then now() else null end,
            updated_at = now()
          where id = $2
          returning
            id,
            title,
            type,
            reference_id,
            status,
            requested_by,
            requested_at::text,
            priority,
            description,
            amount,
            resolved_at::text,
            created_at,
            updated_at
        `,
        [status, id]
      );

      if (!updated.rows[0]) return res.status(404).json({ error: 'Workflow no encontrado' });
      return res.json(mapWorkflow(updated.rows[0]));
    } catch (error: any) {
      return res.status(500).json({ error: error?.message || 'No se pudo actualizar estado del workflow' });
    }
  });

  app.delete('/api/workflows/:id', async (req, res) => {
    try {
      const db = requireDatabase();
      const id = String(req.params.id || '').trim();
      if (!id) return res.status(400).json({ error: 'id requerido' });

      const deleted = await db.query('delete from workflows where id = $1', [id]);
      if (deleted.rowCount === 0) return res.status(404).json({ error: 'Workflow no encontrado' });
      return res.status(204).send();
    } catch (error: any) {
      return res.status(500).json({ error: error?.message || 'No se pudo eliminar workflow' });
    }
  });

  app.post("/api/transactions", async (req, res) => {
    try {
      const db = requireDatabase();
      const projectId = String(req.body?.projectId || "").trim();
      const budgetItemId = String(req.body?.budgetItemId || "").trim();
      const subcontractId = String(req.body?.subcontractId || "").trim();
      const type = String(req.body?.type || "") as TransactionType;
      const category = String(req.body?.category || "").trim();
      const amount = Number(req.body?.amount);
      const date = String(req.body?.date || "").trim();
      const description = String(req.body?.description || "").trim();
      const accountType = String(req.body?.accountType || "project").trim();
      const incomeOrigin = String(req.body?.incomeOrigin || "").trim();
      const fundingSource = String(req.body?.fundingSource || "").trim();

      if (!category || !date || !Number.isFinite(amount) || amount <= 0) {
        return res.status(400).json({ error: "Datos invalidos para crear transaccion" });
      }
      if (type !== "Income" && type !== "Expense") {
        return res.status(400).json({ error: "El tipo debe ser Income o Expense" });
      }
      if (accountType !== 'project' && accountType !== 'owner') {
        return res.status(400).json({ error: "La cuenta debe ser project u owner" });
      }
      if (accountType === 'project' && !projectId) {
        return res.status(400).json({ error: "Debe seleccionar un proyecto cuando la cuenta es por proyecto" });
      }

      const insert = await db.query<TransactionRow>(
        `
          insert into financial_transactions (
            project_id,
            budget_item_id,
            subcontract_id,
            type,
            category,
            amount,
            date,
            description,
            account_type,
            income_origin,
            funding_source
          ) values ($1, $2, $3, $4, $5, $6, $7::date, $8, $9, $10, $11)
          returning id, project_id, budget_item_id, subcontract_id, type, category, amount, date::text, description, account_type, income_origin, funding_source, created_at
        `,
        [
          accountType === 'project' ? projectId : null,
          budgetItemId || null,
          subcontractId || null,
          type,
          category,
          amount,
          date,
          description,
          accountType,
          incomeOrigin || null,
          fundingSource || null,
        ]
      );

      return res.status(201).json(mapTransaction(insert.rows[0]));
    } catch (error: any) {
      return res.status(500).json({ error: error?.message || "No se pudo crear la transaccion" });
    }
  });

  app.patch("/api/transactions/:id", async (req, res) => {
    try {
      const db = requireDatabase();
      const id = String(req.params.id || "").trim();
      if (!id) {
        return res.status(400).json({ error: "Id requerido" });
      }

      const projectId = String(req.body?.projectId || "").trim();
      const budgetItemId = String(req.body?.budgetItemId || "").trim();
      const type = String(req.body?.type || "") as TransactionType;
      const category = String(req.body?.category || "").trim();
      const amount = Number(req.body?.amount);
      const date = String(req.body?.date || "").trim();
      const description = String(req.body?.description || "").trim();
      const accountType = String(req.body?.accountType || "project").trim();
      const incomeOrigin = String(req.body?.incomeOrigin || "").trim();
      const fundingSource = String(req.body?.fundingSource || "").trim();

      if (!category || !date || !Number.isFinite(amount) || amount <= 0) {
        return res.status(400).json({ error: "Datos invalidos para actualizar transaccion" });
      }
      if (type !== "Income" && type !== "Expense") {
        return res.status(400).json({ error: "El tipo debe ser Income o Expense" });
      }
      if (accountType !== 'project' && accountType !== 'owner') {
        return res.status(400).json({ error: "La cuenta debe ser project u owner" });
      }
      if (accountType === 'project' && !projectId) {
        return res.status(400).json({ error: "Debe seleccionar un proyecto cuando la cuenta es por proyecto" });
      }

      const updated = await db.query<TransactionRow>(
        `
          update financial_transactions
          set
            project_id = $1,
            budget_item_id = $2,
            type = $3,
            category = $4,
            amount = $5,
            date = $6::date,
            description = $7,
            account_type = $8,
            income_origin = $9,
            funding_source = $10
          where id = $11
          returning id, project_id, budget_item_id, subcontract_id, type, category, amount, date::text, description, account_type, income_origin, funding_source, created_at
        `,
        [
          accountType === 'project' ? projectId : null,
          budgetItemId || null,
          type,
          category,
          amount,
          date,
          description,
          accountType,
          incomeOrigin || null,
          fundingSource || null,
          id,
        ]
      );

      if (!updated.rows[0]) {
        return res.status(404).json({ error: "Transaccion no encontrada" });
      }

      return res.json(mapTransaction(updated.rows[0]));
    } catch (error: any) {
      return res.status(500).json({ error: error?.message || "No se pudo actualizar la transaccion" });
    }
  });

  app.delete("/api/transactions/:id", async (req, res) => {
    try {
      const db = requireDatabase();
      const id = String(req.params.id || "").trim();
      if (!id) {
        return res.status(400).json({ error: "Id requerido" });
      }

      const deleted = await db.query("delete from financial_transactions where id = $1", [id]);
      if (deleted.rowCount === 0) {
        return res.status(404).json({ error: "Transaccion no encontrada" });
      }

      return res.status(204).send();
    } catch (error: any) {
      return res.status(500).json({ error: error?.message || "No se pudo eliminar la transaccion" });
    }
  });

  if (options?.includeFrontend ?? true) {
    // Vite middleware for development
    if (process.env.NODE_ENV !== "production") {
      const { createServer: createViteServer } = await import('vite');
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: "spa",
      });
      app.use(vite.middlewares);
    } else {
      const distPath = path.join(process.cwd(), 'dist');
      app.use(express.static(distPath));
      app.get('*', (req, res) => {
        res.sendFile(path.join(distPath, 'index.html'));
      });
    }
  }

  return app;
}

async function startServer() {
  const app = await createApp({ includeFrontend: true });

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

if (process.env.VERCEL !== "1") {
  void startServer();
}
