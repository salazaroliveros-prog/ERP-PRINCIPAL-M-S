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

function uniqueName(prefix: string, index: number) {
  const stamp = Date.now();
  return `${prefix} ${stamp}-${index}`;
}

test.beforeEach(async ({ context }) => {
  await context.addInitScript(seedLocalAuth);
});

test('dashboard movil: KPI/charts mantienen legibilidad con resumen top 6', async ({
  page,
  request,
  baseURL,
  isMobile,
}) => {
  test.skip(!isMobile, 'Validacion de legibilidad para perfil movil.');

  const createdProjectIds: string[] = [];

  try {
    for (let i = 0; i < 7; i += 1) {
      const createProjectResponse = await request.post('/api/projects', {
        data: {
          name: uniqueName('E2E Dash Mobile', i),
          location: 'Ciudad de Guatemala',
          projectManager: 'QA Mobile',
          status: 'Planning',
          budget: 100000 + (i * 1000),
          spent: 25000 + (i * 500),
          physicalProgress: 20 + i,
          financialProgress: 15 + i,
          area: 100 + i,
          startDate: '2026-01-01',
          endDate: '2026-12-31',
          clientUid: '',
          typology: 'RESIDENCIAL',
        },
      });

      if (!createProjectResponse.ok()) {
        const errorBody = await createProjectResponse.text();
        throw new Error(`No se pudo crear proyecto seed (${createProjectResponse.status()}): ${errorBody}`);
      }
      const projectId = ((await createProjectResponse.json()) as EntityWithId).id;
      createdProjectIds.push(projectId);
    }

    await page.goto(`${baseURL ?? 'http://127.0.0.1:3000'}/#/`);

    await expect(page.getByText('Salud Financiera por Proyecto')).toBeVisible();
    await expect(page.getByText('Comparativa de Avance (Físico vs Financiero)')).toBeVisible();

    // Functional check: mobile summary guards are rendered when datasets exceed six projects.
    await expect(page.getByText('Mostrando top 6 obras por monto para evitar solapamiento.')).toBeVisible();
    await expect(page.getByText('Vista móvil resumida: top 6 obras con mayor avance.')).toBeVisible();
  } finally {
    await Promise.all(
      createdProjectIds.map(async (projectId) => {
        try {
          await request.delete(`/api/projects/${projectId}`);
        } catch {
          // Best effort cleanup.
        }
      }),
    );
  }
});
