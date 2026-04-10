#!/usr/bin/env node

const BASE_URL = (process.env.LOCAL_API_BASE_URL || 'http://localhost:3000').replace(/\/+$/, '');
const SMOKE_USER_EMAIL = (process.env.SMOKE_USER_EMAIL || 'smoke-test@example.com').trim().toLowerCase();

const results = [];
const created = {
  projectId: null,
  budgetItemId: null,
  clientId: null,
  supplierId: null,
  inventoryId: null,
  quoteId: null,
  subcontractId: null,
  workflowId: null,
  riskId: null,
  safetyId: null,
  employeeId: null,
  documentId: null,
  purchaseOrderId: null,
  inventoryTxId: null,
  deletedRecordId: null,
  notificationId: null,
  transactionId: null,
};

function logResult(ok, step, status, detail) {
  results.push({ ok, step, status, detail });
  const tag = ok ? 'OK  ' : 'FAIL';
  console.log(`${tag} ${step} [${status}]${detail ? ` ${detail}` : ''}`);
}

async function callApi(step, method, path, body, expectedStatuses = [200]) {
  const url = `${BASE_URL}${path}`;
  try {
    const response = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'x-user-email': SMOKE_USER_EMAIL,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    const text = await response.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text;
    }

    const ok = expectedStatuses.includes(response.status);
    const detail = ok
      ? ''
      : (typeof data === 'string' ? data.slice(0, 200) : JSON.stringify(data).slice(0, 200));

    logResult(ok, step, response.status, detail);
    return { ok, status: response.status, data };
  } catch (error) {
    logResult(false, step, 'ERR', error instanceof Error ? error.message : String(error));
    return { ok: false, status: 'ERR', data: null };
  }
}

async function checkSse(step, path) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2500);
  try {
    const response = await fetch(`${BASE_URL}${path}`, {
      headers: {
        Accept: 'text/event-stream',
        'x-user-email': SMOKE_USER_EMAIL,
      },
      signal: controller.signal,
    });
    const contentType = response.headers.get('content-type') || '';
    const ok = response.ok && contentType.includes('text/event-stream');
    logResult(ok, step, response.status, ok ? '' : `content-type=${contentType}`);
    return ok;
  } catch (error) {
    const isAbort = error instanceof Error && error.name === 'AbortError';
    logResult(isAbort, step, isAbort ? 200 : 'ERR', isAbort ? 'stream opened' : String(error));
    return isAbort;
  } finally {
    clearTimeout(timeout);
    controller.abort();
  }
}

async function run() {
  console.log(`Running local smoke tests on ${BASE_URL}`);

  await callApi('health', 'GET', '/api/health');
  await checkSse('notifications stream', '/api/notifications/stream');
  await callApi('login', 'POST', '/api/auth/login', {
    email: SMOKE_USER_EMAIL,
    displayName: 'Smoke Test',
  });

  const projectCreate = await callApi('create project', 'POST', '/api/projects', {
    name: `Proyecto Smoke ${Date.now()}`,
    location: 'Ciudad',
    projectManager: 'Tester',
    status: 'Planning',
    budget: 10000,
    spent: 0,
    physicalProgress: 0,
    financialProgress: 0,
    area: 100,
    startDate: '2026-04-01',
    endDate: '2026-12-01',
    clientUid: '',
    typology: 'RESIDENCIAL',
  }, [201]);
  if (projectCreate.ok) created.projectId = projectCreate.data?.id;

  await callApi('list projects', 'GET', '/api/projects');
  if (created.projectId) {
    await callApi('update project', 'PUT', `/api/projects/${created.projectId}`, {
      name: 'Proyecto Smoke Editado',
      location: 'Ciudad',
      projectManager: 'Tester',
      status: 'In Progress',
      budget: 12000,
      spent: 250,
      physicalProgress: 10,
      financialProgress: 5,
      area: 100,
      startDate: '2026-04-01',
      endDate: '2026-12-01',
      clientUid: '',
      typology: 'RESIDENCIAL',
    });
  }

  const budgetItemCreate = created.projectId
    ? await callApi('create budget item', 'POST', `/api/projects/${created.projectId}/budget-items`, {
        description: 'Partida Smoke',
        category: 'General',
        totalItemPrice: 500,
        order: 1,
      }, [201])
    : { ok: false };
  if (budgetItemCreate.ok) created.budgetItemId = budgetItemCreate.data?.id;

  if (created.projectId) {
    await callApi('list project budget items', 'GET', `/api/projects/${created.projectId}/budget-items`);

    if (created.budgetItemId) {
      await callApi(
        'reject negative budget quantity',
        'PATCH',
        `/api/projects/${created.projectId}/budget-items/${created.budgetItemId}`,
        { quantity: -1 },
        [400]
      );
    }
  }

  const clientCreate = await callApi('create client', 'POST', '/api/clients', {
    name: 'Cliente Smoke',
    email: 'cliente.smoke@example.com',
    phone: '555-0000',
    status: 'Active',
  }, [201]);
  if (clientCreate.ok) created.clientId = clientCreate.data?.id;

  await callApi('list clients', 'GET', '/api/clients');
  if (created.clientId) {
    await callApi('update client', 'PATCH', `/api/clients/${created.clientId}`, { notes: 'actualizado' });
    await callApi('create client chat', 'POST', `/api/clients/${created.clientId}/chats`, { text: 'Hola', sender: 'system' }, [201]);
    await callApi('list client chats', 'GET', `/api/clients/${created.clientId}/chats`);
    await callApi('create client interaction', 'POST', `/api/clients/${created.clientId}/interactions`, {
      type: 'call',
      notes: 'seguimiento',
      date: '2026-04-07',
    }, [201]);
    await callApi('list client interactions', 'GET', `/api/clients/${created.clientId}/interactions`);
  }

  const supplierCreate = await callApi('create supplier', 'POST', '/api/suppliers', {
    name: 'Proveedor Smoke',
    category: 'Materiales',
  }, [201]);
  if (supplierCreate.ok) created.supplierId = supplierCreate.data?.id;
  await callApi('list suppliers', 'GET', '/api/suppliers');

  const inventoryCreate = await callApi('create inventory item', 'POST', '/api/inventory', {
    projectId: created.projectId || 'default-project',
    name: 'Cemento Smoke',
    category: 'Material',
    unit: 'kg',
    unitPrice: 10,
    stock: 20,
    minStock: 5,
    suppliers: [],
    batches: [],
  }, [201]);
  if (inventoryCreate.ok) created.inventoryId = inventoryCreate.data?.id;

  await callApi('list inventory', 'GET', '/api/inventory?limit=10');
  if (created.inventoryId) {
    await callApi('update inventory', 'PATCH', `/api/inventory/${created.inventoryId}`, { stock: 25 });
    await callApi('adjust inventory stock', 'PATCH', `/api/inventory/${created.inventoryId}/stock`, { delta: 2 });
  }

  const quoteCreate = await callApi('create quote', 'POST', '/api/quotes', {
    clientId: created.clientId || '',
    projectId: created.projectId || 'default-project',
    date: '2026-04-07',
    status: 'Pending',
    total: 100,
    notes: 'quote smoke',
    items: [{ description: 'Item', quantity: 1, unitPrice: 100 }],
  }, [201]);
  if (quoteCreate.ok) created.quoteId = quoteCreate.data?.id;

  await callApi('list quotes', 'GET', '/api/quotes');

  const subcontractCreate = await callApi('create subcontract', 'POST', '/api/subcontracts', {
    projectId: created.projectId || 'default-project',
    budgetItemId: created.budgetItemId || '',
    budgetItemName: 'Partida Smoke',
    contractor: 'Contratista Smoke',
    service: 'Servicio',
    total: 500,
    paid: 0,
    status: 'Active',
    startDate: '2026-04-07',
    endDate: '2026-05-07',
  }, [201]);
  if (subcontractCreate.ok) created.subcontractId = subcontractCreate.data?.id;
  await callApi('list subcontracts', 'GET', '/api/subcontracts?status=Active');

  const workflowCreate = await callApi('create workflow', 'POST', '/api/workflows', {
    title: 'Workflow Smoke',
    type: 'other',
    referenceId: created.projectId || 'default-project',
    priority: 'medium',
    description: 'validacion',
    amount: 10,
    requestedBy: 'smoke@test.com',
  }, [201]);
  if (workflowCreate.ok) created.workflowId = workflowCreate.data?.id;
  await callApi('list workflows', 'GET', '/api/workflows?status=pending');

  const riskCreate = await callApi('create risk', 'POST', '/api/risks', {
    projectId: created.projectId || 'default-project',
    title: 'Riesgo Smoke',
    description: 'desc',
  }, [201]);
  if (riskCreate.ok) created.riskId = riskCreate.data?.id;
  await callApi('list risks', 'GET', '/api/risks');

  const safetyCreate = await callApi('create safety incident', 'POST', '/api/safety-incidents', {
    title: 'Incidente Smoke',
    location: 'Obra',
    date: '2026-04-07',
    description: 'Descripcion de incidente smoke',
  }, [201]);
  if (safetyCreate.ok) created.safetyId = safetyCreate.data?.id;
  await callApi('list safety incidents', 'GET', '/api/safety-incidents');

  const employeeCreate = await callApi('create employee', 'POST', '/api/employees', {
    name: 'Empleado Smoke',
    role: 'Operador',
    department: 'Campo',
    salary: 1000,
    status: 'Active',
    joinDate: '2026-04-01',
  }, [201]);
  if (employeeCreate.ok) created.employeeId = employeeCreate.data?.id;
  await callApi('list employees', 'GET', '/api/employees');
  if (created.employeeId) {
    await callApi('create attendance', 'POST', '/api/attendance', {
      employeeId: created.employeeId,
      type: 'check-in',
      timestamp: new Date().toISOString(),
    }, [201]);
  }

  const folderCreate = await callApi('create folder', 'POST', '/api/folders', {
    name: `Folder Smoke ${Date.now()}`,
    color: 'text-slate-500',
  }, [201]);
  await callApi('list folders', 'GET', '/api/folders');

  const documentCreate = await callApi('create document', 'POST', '/api/documents', {
    name: 'Documento Smoke',
    type: 'pdf',
    folder: folderCreate.ok ? folderCreate.data?.name : 'General',
    size: '10 KB',
    date: '2026-04-07',
  }, [201]);
  if (documentCreate.ok) created.documentId = documentCreate.data?.id;
  await callApi('list documents', 'GET', '/api/documents');

  const auditCreate = await callApi('create audit log', 'POST', '/api/audit-logs', {
    action: 'smoke_test',
    module: 'testing',
    details: 'local smoke test',
    type: 'system',
  }, [201]);
  await callApi('list audit logs', 'GET', '/api/audit-logs?limit=10');

  const notificationCreate = await callApi('create notification', 'POST', '/api/notifications', {
    title: 'Notificacion Smoke',
    body: 'Prueba',
    type: 'system',
  }, [201]);
  if (notificationCreate.ok) created.notificationId = notificationCreate.data?.id;
  await callApi('list notifications', 'GET', '/api/notifications?limit=20&offset=0');
  if (created.notificationId) {
    await callApi('mark notification read', 'PATCH', `/api/notifications/${created.notificationId}/read`);
  }

  const transactionCreate = await callApi('create financial transaction', 'POST', '/api/transactions', {
    projectId: created.projectId || 'default-project',
    budgetItemId: created.budgetItemId || null,
    type: 'Expense',
    category: 'General',
    amount: 100,
    date: '2026-04-07',
    description: 'tx smoke',
  }, [201]);
  if (transactionCreate.ok) created.transactionId = transactionCreate.data?.id;
  await callApi('list transactions', 'GET', '/api/transactions?limit=10');

  const poCreate = await callApi('create purchase order', 'POST', '/api/purchase-orders', {
    projectId: created.projectId || 'default-project',
    materialId: created.inventoryId || null,
    materialName: 'Cemento Smoke',
    quantity: 2,
    unit: 'kg',
    estimatedCost: 20,
    supplier: 'Proveedor Smoke',
    supplierId: created.supplierId || null,
    status: 'Pending',
    date: '2026-04-07',
  }, [201]);
  if (poCreate.ok) created.purchaseOrderId = poCreate.data?.id;
  await callApi('list purchase orders', 'GET', '/api/purchase-orders');

  const invTxCreate = await callApi('create inventory transaction', 'POST', '/api/inventory-transactions', {
    materialId: created.inventoryId,
    materialName: 'Cemento Smoke',
    type: 'in',
    quantity: 1,
    reason: 'smoke',
  }, [201]);
  if (invTxCreate.ok) created.inventoryTxId = invTxCreate.data?.id;
  await callApi('list inventory transactions', 'GET', '/api/inventory-transactions?limit=20');

  const deletedCreate = await callApi('create deleted record', 'POST', '/api/deleted-records', {
    type: 'inventory',
    materialId: created.inventoryId,
    materialName: 'Cemento Smoke',
    data: { note: 'smoke' },
    reason: 'cleanup test',
  }, [201]);
  if (deletedCreate.ok) created.deletedRecordId = deletedCreate.data?.id;
  await callApi('list deleted records', 'GET', '/api/deleted-records');

  // Cleanup in reverse order
  if (created.deletedRecordId) await callApi('cleanup deleted record', 'DELETE', `/api/deleted-records/${created.deletedRecordId}`, undefined, [204]);
  if (created.inventoryTxId) await callApi('cleanup inventory transaction', 'DELETE', `/api/inventory-transactions/${created.inventoryTxId}`, undefined, [204]);
  if (created.purchaseOrderId) await callApi('cleanup purchase order', 'DELETE', `/api/purchase-orders/${created.purchaseOrderId}`, undefined, [204]);
  if (created.transactionId) await callApi('cleanup financial transaction', 'DELETE', `/api/transactions/${created.transactionId}`, undefined, [204]);
  if (created.documentId) await callApi('cleanup document', 'DELETE', `/api/documents/${created.documentId}`, undefined, [204]);
  if (created.employeeId) await callApi('cleanup employee', 'DELETE', `/api/employees/${created.employeeId}`, undefined, [204]);
  if (created.safetyId) await callApi('cleanup safety incident', 'DELETE', `/api/safety-incidents/${created.safetyId}`, undefined, [204]);
  if (created.riskId) await callApi('cleanup risk', 'DELETE', `/api/risks/${created.riskId}`, undefined, [204]);
  if (created.workflowId) await callApi('cleanup workflow', 'DELETE', `/api/workflows/${created.workflowId}`, undefined, [204]);
  if (created.subcontractId) await callApi('cleanup subcontract', 'DELETE', `/api/subcontracts/${created.subcontractId}`, undefined, [204]);
  if (created.quoteId) await callApi('cleanup quote', 'DELETE', `/api/quotes/${created.quoteId}`, undefined, [204]);
  if (created.inventoryId) await callApi('cleanup inventory item', 'DELETE', `/api/inventory/${created.inventoryId}`, undefined, [204]);
  if (created.clientId) await callApi('cleanup client', 'DELETE', `/api/clients/${created.clientId}`, undefined, [204]);
  if (created.supplierId) await callApi('cleanup supplier', 'DELETE', `/api/suppliers/${created.supplierId}`, undefined, [204]);
  if (created.projectId) await callApi('cleanup project', 'DELETE', `/api/projects/${created.projectId}`, undefined, [204]);

  const failures = results.filter((item) => !item.ok);
  console.log('');
  console.log(`Summary: ${results.length - failures.length}/${results.length} passed`);

  if (failures.length > 0) {
    console.log('Failed steps:');
    failures.forEach((f) => console.log(`- ${f.step} [${f.status}] ${f.detail || ''}`));
    process.exit(1);
  }
}

run().catch((error) => {
  console.error('Smoke test failed unexpectedly:', error);
  process.exit(1);
});
