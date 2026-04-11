import { expect, test } from '@playwright/test';

type EntityWithId = { id: string };

type InventoryRecord = {
  id: string;
  name: string;
  stock: number;
};

function seedLocalAuth() {
  const user = {
    uid: 'e2e-user',
    email: 'e2e@wmms.local',
    displayName: 'E2E User',
    photoURL: null,
    emailVerified: true,
    isAnonymous: false,
    tenantId: null,
    providerData: [
      {
        providerId: 'local-e2e',
        displayName: 'E2E User',
        email: 'e2e@wmms.local',
        photoURL: null,
      },
    ],
  };

  window.localStorage.setItem('erp_local_auth_user', JSON.stringify(user));
}

function uniqueName(prefix: string) {
  const stamp = Date.now();
  const suffix = Math.floor(Math.random() * 10_000);
  return `${prefix} ${stamp}-${suffix}`;
}

test.beforeEach(async ({ context }) => {
  await context.addInitScript(seedLocalAuth);
});

test('clientes: botones de tarjeta chat y editar funcionan en movil', async ({ page, baseURL, request, isMobile }) => {
  test.skip(!isMobile, 'Validacion tactil para perfil movil.');

  const clientName = uniqueName('E2E Cliente Mobile');
  let clientId: string | null = null;

  try {
    const createClientResponse = await request.post('/api/clients', {
      data: {
        name: clientName,
        company: 'WM QA',
        email: `${Date.now()}@qa.local`,
        phone: '5555-5555',
        contacto: 'Contacto QA',
        status: 'Active',
        notes: 'Cliente para prueba movil',
      },
    });

    expect(createClientResponse.ok()).toBeTruthy();
    clientId = ((await createClientResponse.json()) as EntityWithId).id;

    await page.goto(`${baseURL ?? 'http://127.0.0.1:3000'}/#/clients`);
    await expect(page.getByRole('button', { name: 'Nuevo Prospecto' })).toBeVisible();

    await page.getByPlaceholder('Buscar cliente...').fill(clientName);
    await expect(page.getByTestId(`client-card-${clientId}`)).toBeVisible();

    await page.getByTestId(`client-card-chat-${clientId}`).click();
    await expect(page.getByPlaceholder('Escribe un mensaje...').first()).toBeVisible();
    await page.keyboard.press('Escape');

    await page.reload();
    await page.getByPlaceholder('Buscar cliente...').fill(clientName);
    await expect(page.getByTestId(`client-card-${clientId}`)).toBeVisible();

    await page.getByTestId(`client-card-edit-${clientId}`).click();
    await expect(page.getByRole('heading', { name: 'Editar Cliente' })).toBeVisible();
  } finally {
    if (clientId) {
      await request.delete(`/api/clients/${clientId}`);
    }
  }
});

test('subcontratos: botones de pago y editar funcionan en movil', async ({ page, baseURL, request, isMobile }) => {
  test.skip(!isMobile, 'Validacion tactil para perfil movil.');

  const projectName = uniqueName('E2E Sub Project');
  const subContractor = uniqueName('E2E Contratista');

  let projectId: string | null = null;
  let budgetItemId: string | null = null;
  let subcontractId: string | null = null;

  try {
    const createProjectResponse = await request.post('/api/projects', {
      data: {
        name: projectName,
        location: 'Ciudad de Guatemala',
        projectManager: 'QA Mobile',
        status: 'Planning',
        budget: 100000,
        spent: 0,
        physicalProgress: 0,
        financialProgress: 0,
        area: 200,
        startDate: '2026-01-01',
        endDate: '2026-12-31',
        clientUid: '',
        typology: 'RESIDENCIAL',
      },
    });

    expect(createProjectResponse.ok()).toBeTruthy();
    projectId = ((await createProjectResponse.json()) as EntityWithId).id;

    const createBudgetItemResponse = await request.post(`/api/projects/${projectId}/budget-items`, {
      data: {
        description: uniqueName('Renglon Sub Mobile'),
        category: 'General',
        quantity: 1,
        unit: 'servicio',
        materialCost: 250,
        laborCost: 250,
        indirectFactor: 0.2,
      },
    });

    expect(createBudgetItemResponse.ok()).toBeTruthy();
    budgetItemId = ((await createBudgetItemResponse.json()) as EntityWithId).id;

    const createSubcontractResponse = await request.post('/api/subcontracts', {
      data: {
        projectId,
        budgetItemId,
        budgetItemName: 'Renglon QA',
        contractor: subContractor,
        service: 'Instalacion QA',
        startDate: '2026-02-01',
        endDate: '2026-08-01',
        total: 5000,
        paid: 0,
        status: 'Active',
      },
    });

    expect(createSubcontractResponse.ok()).toBeTruthy();
    subcontractId = ((await createSubcontractResponse.json()) as EntityWithId).id;

    await page.goto(`${baseURL ?? 'http://127.0.0.1:3000'}/#/subcontracts`);
    await expect(page.getByRole('button', { name: /Nuevo Subcontrato|Nuevo/i })).toBeVisible();

    await page.getByPlaceholder('Buscar...').fill(subContractor);
    await expect(page.getByTestId(`subcontract-card-${subcontractId}`)).toBeVisible();

    await page.getByTestId(`subcontract-card-pay-${subcontractId}`).click();
    await expect(page.getByRole('heading', { name: 'Registrar Pago' })).toBeVisible();
    await page.getByRole('button', { name: 'Cerrar', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Registrar Pago' })).toBeHidden();

    await page.getByTestId(`subcontract-card-edit-${subcontractId}`).click();
    await expect(page.getByRole('heading', { name: 'Editar Subcontrato' })).toBeVisible();
  } finally {
    if (subcontractId) {
      try {
        await request.delete(`/api/subcontracts/${subcontractId}`);
      } catch {
        // Context may close after timeout/failure; best effort cleanup.
      }
    }
    if (budgetItemId && projectId) {
      try {
        await request.delete(`/api/projects/${projectId}/budget-items/${budgetItemId}`);
      } catch {
        // Context may close after timeout/failure; best effort cleanup.
      }
    }
    if (projectId) {
      try {
        await request.delete(`/api/projects/${projectId}`);
      } catch {
        // Context may close after timeout/failure; best effort cleanup.
      }
    }
  }
});

test('inventario: botones incrementar y editar funcionan en movil', async ({ page, baseURL, request, isMobile }) => {
  test.skip(!isMobile, 'Validacion tactil para perfil movil.');

  const materialName = uniqueName('E2E Material Mobile');
  const inventoryProjectName = uniqueName('E2E Inventory Project');
  let projectId: string | null = null;
  let materialId: string | null = null;

  try {
    const createProjectResponse = await request.post('/api/projects', {
      data: {
        name: inventoryProjectName,
        location: 'Ciudad de Guatemala',
        projectManager: 'QA Mobile',
        status: 'Planning',
        budget: 70000,
        spent: 0,
        physicalProgress: 0,
        financialProgress: 0,
        area: 120,
        startDate: '2026-01-01',
        endDate: '2026-12-31',
        clientUid: '',
        typology: 'RESIDENCIAL',
      },
    });
    expect(createProjectResponse.ok()).toBeTruthy();
    projectId = ((await createProjectResponse.json()) as EntityWithId).id;

    const createMaterialResponse = await request.post('/api/inventory', {
      data: {
        name: materialName,
        category: 'Materiales',
        unit: 'Unidad',
        unitPrice: 10,
        stock: 3,
        minStock: 1,
        suppliers: [],
        batches: [],
        projectId,
      },
    });

    expect(createMaterialResponse.ok()).toBeTruthy();
    materialId = ((await createMaterialResponse.json()) as EntityWithId).id;

    await page.goto(`${baseURL ?? 'http://127.0.0.1:3000'}/#/inventory`);
    await expect(page.getByPlaceholder('Buscar material...')).toBeVisible();

    await page.getByPlaceholder('Buscar material...').fill(materialName);
    await expect(page.getByTestId(`inventory-card-${materialId}`)).toBeVisible();

    await page.getByTestId(`inventory-card-inc-${materialId}`).click();

    await expect
      .poll(async () => {
        const listResponse = await request.get('/api/inventory?limit=200&offset=0');
        if (!listResponse.ok()) return -1;
        const body = (await listResponse.json()) as { items: InventoryRecord[] };
        const found = body.items.find((item) => item.id === materialId);
        return Number(found?.stock ?? -1);
      })
      .toBe(4);

    await page.getByTestId(`inventory-card-edit-${materialId}`).click();
    await expect(page.getByRole('heading', { name: 'Editar Material' })).toBeVisible();
  } finally {
    if (materialId) {
      try {
        await request.delete(`/api/inventory/${materialId}`);
      } catch {
        // Context may close after timeout/failure; best effort cleanup.
      }
    }
    if (projectId) {
      try {
        await request.delete(`/api/projects/${projectId}`);
      } catch {
        // Context may close after timeout/failure; best effort cleanup.
      }
    }
  }
});
