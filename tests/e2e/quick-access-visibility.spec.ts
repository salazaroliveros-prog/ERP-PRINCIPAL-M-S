import { expect, test } from '@playwright/test';

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

async function expectDockVisible(page: import('@playwright/test').Page) {
  const aiButton = page.locator('button[title="Asistente IA"]');
  const shortcutsButton = page.locator('button[title="Atajos"]');

  await expect(aiButton).toBeVisible();
  await expect(shortcutsButton).toBeVisible();
}

test.beforeEach(async ({ context }) => {
  await context.addInitScript(seedLocalAuth);
});

test('dock de acceso rapido permanece visible con scroll y cambio de modulos', async ({ page, baseURL }) => {
  await page.goto(`${baseURL ?? 'http://127.0.0.1:3000'}/#/`);

  await expectDockVisible(page);

  // Open quick actions panel and validate visibility.
  await page.locator('button[title="Atajos"]').click();
  await expect(page.getByText('Acciones rapidas')).toBeVisible();

  // Scroll inside app main container and assert dock remains visible.
  const main = page.locator('main').first();
  await main.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await expectDockVisible(page);
  await expect(page.getByText('Acciones rapidas')).toBeVisible();

  // Change modules and keep validating visibility.
  await page.goto(`${baseURL ?? 'http://127.0.0.1:3000'}/#/financials`);
  await expect(page.getByRole('button', { name: 'Nuevo Registro' })).toBeVisible();
  await expectDockVisible(page);

  await page.goto(`${baseURL ?? 'http://127.0.0.1:3000'}/#/documents`);
  await expect(page.getByRole('button', { name: 'Subir Archivo' })).toBeVisible();
  await expectDockVisible(page);

  await page.goto(`${baseURL ?? 'http://127.0.0.1:3000'}/#/projects`);
  await expect(page.getByRole('button', { name: 'Nueva Obra' })).toBeVisible();
  await expectDockVisible(page);
});
