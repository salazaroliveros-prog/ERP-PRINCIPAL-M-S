import { expect, test } from '@playwright/test';

type EntityWithId = { id: string };

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

test('acciones de tarjeta en obras responden en movil', async ({ page, baseURL, request, isMobile }) => {
  test.skip(!isMobile, 'Esta prueba valida interacciones tactiles en perfil movil.');

  const projectName = uniqueName('E2E Mobile Acciones');
  let projectId: string | null = null;

  try {
    const createProjectResponse = await request.post('/api/projects', {
      data: {
        name: projectName,
        location: 'Ciudad de Guatemala',
        projectManager: 'QA Mobile',
        status: 'Planning',
        budget: 250000,
        spent: 50000,
        physicalProgress: 20,
        financialProgress: 20,
        area: 180,
        startDate: '2026-01-01',
        endDate: '2026-12-31',
        clientUid: '',
        typology: 'RESIDENCIAL',
      },
    });

    expect(createProjectResponse.ok()).toBeTruthy();
    projectId = ((await createProjectResponse.json()) as EntityWithId).id;

    await page.goto(`${baseURL ?? 'http://127.0.0.1:3000'}/#/projects`);
    await expect(page.getByRole('button', { name: 'Nueva Obra' })).toBeVisible();

    const searchInput = page.getByPlaceholder('Buscar por nombre, ubicación o director...');
    await searchInput.fill(projectName);

    const projectCard = page.getByTestId(`project-card-${projectId}`);

    await expect(projectCard).toBeVisible();

    await page.getByTestId(`project-card-map-${projectId}`).click();
    await expect(page.locator('.leaflet-container').first()).toBeVisible();
    await page.keyboard.press('Escape');

    await page.getByTestId(`project-card-budget-${projectId}`).click();
    await expect(page.getByRole('button', { name: 'Agregar Renglón' })).toBeVisible();
    await page.keyboard.press('Escape');

    await page.getByTestId(`project-card-edit-${projectId}`).click();
    await expect(page.getByRole('heading', { name: 'Editar Obra' })).toBeVisible();
  } finally {
    if (projectId) {
      await request.delete(`/api/projects/${projectId}`);
    }
  }
});
