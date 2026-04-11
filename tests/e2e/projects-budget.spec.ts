import { expect, test } from '@playwright/test';

type ProjectRecord = {
  id: string;
  name: string;
};

type BudgetItemRecord = {
  id: string;
  description: string;
  quantity: number;
  totalUnitPrice: number;
  totalItemPrice: number;
  materialCost: number;
  laborCost: number;
  materials?: Array<{ name: string; quantity: number; unitPrice: number }>;
  labor?: Array<{ role: string; yield: number; dailyRate: number }>;
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

async function openProjectsPage(page: import('@playwright/test').Page, baseURL: string | undefined) {
  await page.goto(`${baseURL ?? 'http://127.0.0.1:3000'}/#/projects`);
  await expect(page.getByRole('button', { name: 'Nueva Obra' })).toBeVisible();
  await page.getByTitle('Vista Tabla').click();
  const searchInput = page.getByPlaceholder('Buscar por nombre, ubicación o director...');
  await expect(searchInput).toBeVisible();
  await searchInput.fill('');
}

async function createProjectFromUi(page: import('@playwright/test').Page, name: string) {
  await page.getByRole('button', { name: 'Nueva Obra' }).click();

  await page.getByPlaceholder('Ej: Edificio Las Margaritas').fill(name);
  await page.getByPlaceholder('Ej: Ciudad de Guatemala').fill('Ciudad de Guatemala');
  await page.getByPlaceholder('Nombre del responsable').fill('QA E2E');
  await page.getByRole('button', { name: 'Siguiente', exact: true }).click();

  const projectForm = page.locator('#project-form');
  await projectForm
    .locator('div:has(> label:has-text("Área de Construcción (m²)")) input[type="number"]')
    .fill('120');
  await projectForm
    .locator('div:has(> label:has-text("Monto Ejecutado (GTQ)")) input[type="number"]')
    .fill('0');
  await page.getByRole('button', { name: 'Siguiente', exact: true }).click();

  const startDateInput = page.locator(
    '#project-form div:has(> label:has-text("Fecha Inicio")) input'
  );
  const endDateInput = page.locator(
    '#project-form div:has(> label:has-text("Fecha Fin Estimada")) input'
  );
  await startDateInput.fill('01/01/2026');
  await endDateInput.fill('31/12/2026');

  await page.getByRole('button', { name: 'Finalizar Registro' }).click();
  await expect(page.getByPlaceholder('Buscar por nombre, ubicación o director...')).toBeVisible();

  await page.getByPlaceholder('Buscar por nombre, ubicación o director...').fill(name);
}

async function fetchProjectByName(request: import('@playwright/test').APIRequestContext, name: string) {
  const projectsResponse = await request.get('/api/projects');
  expect(projectsResponse.ok()).toBeTruthy();
  const body = (await projectsResponse.json()) as { items: ProjectRecord[] };
  return body.items.find((item) => item.name === name);
}

async function waitForProjectByName(
  request: import('@playwright/test').APIRequestContext,
  name: string
) {
  await expect
    .poll(
      async () => {
        const project = await fetchProjectByName(request, name);
        return project?.id ?? '';
      },
      {
        timeout: 30_000,
        intervals: [500, 1000, 2000],
      }
    )
    .not.toBe('');

  return (await fetchProjectByName(request, name))!;
}

async function openBudgetForProject(page: import('@playwright/test').Page, projectName: string) {
  await page.reload();
  await expect(page.getByRole('button', { name: 'Nueva Obra' })).toBeVisible();
  await page.getByTitle('Vista Tabla').click();
  await page.getByPlaceholder('Buscar por nombre, ubicación o director...').fill(projectName);
  await expect
    .poll(async () => page.locator('button[title="Presupuesto"]').count(), {
      timeout: 20_000,
      intervals: [500, 1000, 2000],
    })
    .toBeGreaterThan(0);
  const budgetButton = page.locator('button[title="Presupuesto"]').first();
  await expect(budgetButton).toBeVisible();
  await budgetButton.click();
  await expect(page.getByRole('button', { name: 'Agregar Renglón' })).toBeVisible();
}

async function addBudgetItemViaUi(page: import('@playwright/test').Page, itemDescription: string) {
  await page.getByRole('button', { name: 'Agregar Renglón' }).click();
  await page.getByPlaceholder('Ej: Cimentación a base de zapata corrida...').fill(itemDescription);
  await page.getByPlaceholder('Unidad (m2, m3...)').fill('m2');
  await page.getByPlaceholder('Cantidad').fill('5');
  await page.getByPlaceholder('C. Mat.').fill('100');
  await page.getByPlaceholder('C. M.O.').fill('80');
  await page.getByRole('button', { name: 'Guardar Renglón' }).click();
  await expect(page.getByRole('heading', { name: 'Nuevo Renglón de Presupuesto' })).toBeHidden();
}

test.beforeEach(async ({ context }) => {
  await context.addInitScript(seedLocalAuth);
});

test('crea una obra desde el flujo UI por pasos', async ({ page, baseURL, request }) => {
  const projectName = uniqueName('E2E Proyecto');

  await openProjectsPage(page, baseURL);
  await createProjectFromUi(page, projectName);

  const project = await waitForProjectByName(request, projectName);
  expect(project).toBeTruthy();

  const budgetResponse = await request.get(`/api/projects/${project.id}/budget-items`);
  expect(budgetResponse.ok()).toBeTruthy();
  const budgetBody = (await budgetResponse.json()) as { items: BudgetItemRecord[] };
  expect(Array.isArray(budgetBody.items)).toBe(true);
  expect(budgetBody.items.every((item) => Number(item.quantity) >= 0)).toBe(true);
});

test('agrega renglon de presupuesto y persiste calculos en API', async ({ page, baseURL, request }) => {
  const projectName = uniqueName('E2E Presupuesto');
  const itemDescription = uniqueName('Renglon E2E');

  await openProjectsPage(page, baseURL);
  await createProjectFromUi(page, projectName);

  await openBudgetForProject(page, projectName);
  await addBudgetItemViaUi(page, itemDescription);
  await expect(page.locator('p, h4').filter({ hasText: itemDescription }).first()).toBeVisible();

  const project = await waitForProjectByName(request, projectName);
  expect(project).toBeTruthy();

  const budgetResponse = await request.get(`/api/projects/${project!.id}/budget-items`);
  expect(budgetResponse.ok()).toBeTruthy();

  const budgetBody = (await budgetResponse.json()) as { items: BudgetItemRecord[] };
  const createdItem = budgetBody.items.find((item) => item.description === itemDescription);
  expect(createdItem).toBeTruthy();
  expect(Number(createdItem!.quantity)).toBe(5);

  const expectedTotal = 5 * (100 + 80) * (1 + 0.2);
  expect(Number(createdItem!.totalItemPrice)).toBeCloseTo(expectedTotal, 2);
});

test('rechaza crear renglon con cantidad negativa', async ({ page, baseURL, request }) => {
  const projectName = uniqueName('E2E Negativo');
  const itemDescription = uniqueName('Renglon Negativo');

  await openProjectsPage(page, baseURL);
  await createProjectFromUi(page, projectName);

  const project = await waitForProjectByName(request, projectName);
  expect(project).toBeTruthy();

  const createResponse = await request.post(`/api/projects/${project.id}/budget-items`, {
    data: {
      description: itemDescription,
      unit: 'm2',
      quantity: -1,
      materialCost: 100,
      laborCost: 80,
      indirectFactor: 0.2,
    },
  });
  expect(createResponse.ok()).toBe(false);
  expect(createResponse.status()).toBe(400);

  const budgetResponse = await request.get(`/api/projects/${project!.id}/budget-items`);
  expect(budgetResponse.ok()).toBeTruthy();
  const budgetBody = (await budgetResponse.json()) as { items: BudgetItemRecord[] };
  expect(budgetBody.items.some((item) => item.description === itemDescription)).toBe(false);
});

test('valida y limpia automaticamente datos de prueba', async ({ page, baseURL, request }) => {
  const projectName = uniqueName('E2E TEST Auto Limpieza');

  await openProjectsPage(page, baseURL);
  await createProjectFromUi(page, projectName);

  const projectBefore = await waitForProjectByName(request, projectName);
  expect(projectBefore).toBeTruthy();

  await page.getByRole('button', { name: /BORRAR DATOS DE PRUEBA/i }).click();
  await expect(page.getByRole('heading', { name: 'Limpieza de Datos de Prueba' })).toBeVisible();
  await page.getByRole('button', { name: 'Eliminar Datos de Prueba' }).click();
  await expect(page.getByText('Limpieza completada:', { exact: false })).toBeVisible({ timeout: 30_000 });

  await page.getByPlaceholder('Buscar por nombre, ubicación o director...').fill(projectName);

  await expect
    .poll(
      async () => {
        const projectsAfter = await request.get('/api/projects');
        if (!projectsAfter.ok()) return true;
        const body = (await projectsAfter.json()) as { items: ProjectRecord[] };
        return body.items.some((item) => item.id === projectBefore.id);
      },
      { timeout: 30_000, intervals: [500, 1000, 2000] }
    )
    .toBe(false);
});

test('limpieza real elimina proyectos y datos relacionados de prueba', async ({ page, baseURL, request }) => {
  const projectName = uniqueName('TEST Limpieza Real');
  const clientName = uniqueName('TEST Cliente Limpieza');
  const quoteNote = uniqueName('QA Cotizacion Limpieza');
  const transactionDescription = uniqueName('PRUEBA Transaccion Limpieza');

  await openProjectsPage(page, baseURL);
  await createProjectFromUi(page, projectName);

  const project = await waitForProjectByName(request, projectName);
  expect(project).toBeTruthy();

  const createClientResponse = await request.post('/api/clients', {
    data: {
      name: clientName,
      email: `${Date.now()}@test-cleanup.local`,
      company: 'DATOS DE PRUEBA',
      contactPerson: 'QA',
      status: 'Lead',
    },
  });
  expect(createClientResponse.ok()).toBeTruthy();
  const createdClient = (await createClientResponse.json()) as { id: string };

  const createQuoteResponse = await request.post('/api/quotes', {
    data: {
      clientId: createdClient.id,
      projectId: project!.id,
      date: new Date().toISOString(),
      status: 'Pending',
      total: 1250,
      notes: quoteNote,
      items: [
        {
          description: 'TEST item limpieza',
          quantity: 1,
          unitPrice: 1250,
        },
      ],
    },
  });
  expect(createQuoteResponse.ok()).toBeTruthy();
  const createdQuote = (await createQuoteResponse.json()) as { id: string };

  const createTransactionResponse = await request.post('/api/transactions', {
    data: {
      projectId: project!.id,
      budgetItemId: '',
      type: 'Expense',
      category: 'TEST Categoria',
      amount: 500,
      date: '2026-01-10',
      description: transactionDescription,
    },
  });
  expect(createTransactionResponse.ok()).toBeTruthy();
  const createdTransaction = (await createTransactionResponse.json()) as { id: string };

  await page.reload();
  await expect(page.getByRole('button', { name: /BORRAR DATOS DE PRUEBA/i })).toBeVisible();

  await page.getByRole('button', { name: /BORRAR DATOS DE PRUEBA/i }).click();
  await expect(page.getByRole('heading', { name: 'Limpieza de Datos de Prueba' })).toBeVisible();
  await page.getByRole('button', { name: 'Eliminar Datos de Prueba' }).click();

  const projectsAfter = await request.get('/api/projects');
  expect(projectsAfter.ok()).toBeTruthy();
  const projectBody = (await projectsAfter.json()) as { items: ProjectRecord[] };
  expect(projectBody.items.some((item) => item.id === project!.id)).toBe(false);

  const clientsAfter = await request.get('/api/clients');
  expect(clientsAfter.ok()).toBeTruthy();
  const clientBody = (await clientsAfter.json()) as { items: Array<{ id: string }> };
  expect(clientBody.items.some((item) => item.id === createdClient.id)).toBe(false);

  const quotesAfter = await request.get('/api/quotes');
  expect(quotesAfter.ok()).toBeTruthy();
  const quoteBody = (await quotesAfter.json()) as { items: Array<{ id: string }> };
  expect(quoteBody.items.some((item) => item.id === createdQuote.id)).toBe(false);

  const transactionsAfter = await request.get('/api/transactions?limit=200');
  expect(transactionsAfter.ok()).toBeTruthy();
  const transactionBody = (await transactionsAfter.json()) as { items: Array<{ id: string }> };
  expect(transactionBody.items.some((item) => item.id === createdTransaction.id)).toBe(false);
});
