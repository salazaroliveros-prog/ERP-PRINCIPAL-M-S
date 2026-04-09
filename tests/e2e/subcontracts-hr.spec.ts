import { expect, test } from '@playwright/test';

type EntityWithId = { id: string };
type ProjectRecord = { id: string; name: string };
type DocumentRecord = { id: string; name: string; folder: string; type: string; fileUrl?: string | null };

function uniqueName(prefix: string) {
  const stamp = Date.now();
  const suffix = Math.floor(Math.random() * 10_000);
  return `${prefix} ${stamp}-${suffix}`;
}

test('subcontrato persiste fecha de inicio y fecha de pago', async ({ request }) => {
  const created: {
    projectId: string | null;
    budgetItemId: string | null;
    subcontractId: string | null;
    transactionId: string | null;
  } = {
    projectId: null,
    budgetItemId: null,
    subcontractId: null,
    transactionId: null,
  };

  try {
    const projectResponse = await request.post('/api/projects', {
      data: {
        name: uniqueName('E2E Subcontrato Fechas'),
        location: 'Ciudad de Guatemala',
        projectManager: 'QA E2E',
        status: 'Planning',
        budget: 100000,
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
    expect(projectResponse.ok()).toBeTruthy();
    created.projectId = ((await projectResponse.json()) as EntityWithId).id;

    const budgetItemResponse = await request.post(`/api/projects/${created.projectId}/budget-items`, {
      data: {
        description: uniqueName('Renglon Subcontrato E2E'),
        category: 'General',
        quantity: 1,
        unit: 'servicio',
        materialCost: 400,
        laborCost: 250,
        indirectFactor: 0.2,
      },
    });
    expect(budgetItemResponse.ok()).toBeTruthy();
    created.budgetItemId = ((await budgetItemResponse.json()) as EntityWithId).id;

    const startDate = '2026-06-10';
    const subcontractResponse = await request.post('/api/subcontracts', {
      data: {
        projectId: created.projectId,
        budgetItemId: created.budgetItemId,
        budgetItemName: 'Renglón E2E',
        contractor: 'Contratista QA',
        service: uniqueName('Servicio QA'),
        startDate,
        endDate: '2026-07-10',
        total: 5000,
        paid: 0,
        status: 'Active',
      },
    });

    expect(subcontractResponse.ok()).toBeTruthy();
    const subcontractBody = (await subcontractResponse.json()) as EntityWithId & { startDate: string };
    created.subcontractId = subcontractBody.id;
    expect(subcontractBody.startDate).toBe(startDate);

    const paymentDate = '2026-06-20';
    const paymentTxResponse = await request.post('/api/transactions', {
      data: {
        projectId: created.projectId,
        budgetItemId: created.budgetItemId,
        subcontractId: created.subcontractId,
        type: 'Expense',
        category: 'Subcontratos',
        amount: 1750,
        date: paymentDate,
        description: 'Pago parcial e2e',
      },
    });

    expect(paymentTxResponse.ok()).toBeTruthy();
    const txBody = (await paymentTxResponse.json()) as EntityWithId & {
      date: string;
      subcontractId: string;
    };
    created.transactionId = txBody.id;
    expect(txBody.date).toBe(paymentDate);
    expect(txBody.subcontractId).toBe(created.subcontractId);

    const listTxResponse = await request.get(`/api/transactions?subcontractId=${created.subcontractId}&limit=50`);
    expect(listTxResponse.ok()).toBeTruthy();
    const listTxBody = (await listTxResponse.json()) as {
      items: Array<{ id: string; date: string; subcontractId: string }>;
    };

    const savedPayment = listTxBody.items.find((item) => item.id === created.transactionId);
    expect(savedPayment).toBeTruthy();
    expect(savedPayment?.date).toBe(paymentDate);
    expect(savedPayment?.subcontractId).toBe(created.subcontractId);
  } finally {
    if (created.transactionId) {
      await request.delete(`/api/transactions/${created.transactionId}`);
    }
    if (created.subcontractId) {
      await request.delete(`/api/subcontracts/${created.subcontractId}`);
    }
    if (created.budgetItemId && created.projectId) {
      await request.delete(`/api/projects/${created.projectId}/budget-items/${created.budgetItemId}`);
    }
    if (created.projectId) {
      await request.delete(`/api/projects/${created.projectId}`);
    }
  }
});

test('cierre de contrato firmado archiva PDF automaticamente en Legal', async ({ request }) => {
  const created: {
    employeeId: string | null;
    contractId: string | null;
    documentId: string | null;
  } = {
    employeeId: null,
    contractId: null,
    documentId: null,
  };

  try {
    const employeeResponse = await request.post('/api/employees', {
      data: {
        name: uniqueName('E2E Empleado Contrato'),
        role: 'Operario',
        department: 'Operaciones',
        salary: 4500,
        status: 'Active',
        joinDate: '2026-01-05',
      },
    });
    expect(employeeResponse.ok()).toBeTruthy();
    created.employeeId = ((await employeeResponse.json()) as EntityWithId).id;

    const contractResponse = await request.post('/api/contracts', {
      data: {
        employeeId: created.employeeId,
        startDate: '2026-04-01',
        contractType: 'Tiempo indefinido',
        companyName: 'WM_M&S Constructora',
        ownerName: 'Representante QA',
        ownerTitle: 'Representante Legal',
        notes: 'Contrato E2E',
      },
    });
    expect(contractResponse.ok()).toBeTruthy();
    created.contractId = ((await contractResponse.json()) as EntityWithId).id;

    const fileName = `contrato-e2e-${Date.now()}.pdf`;
    const fileUrl = `https://example.local/contracts/${fileName}`;

    const closeContractResponse = await request.patch(`/api/contracts/${created.contractId}`, {
      data: {
        status: 'completed',
        workerSignatureDataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8Xw8AAoMBgA3zW1gAAAAASUVORK5CYII=',
        ownerSignatureDataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8Xw8AAoMBgA3zW1gAAAAASUVORK5CYII=',
        workerSignedAt: new Date().toISOString(),
        ownerSignedAt: new Date().toISOString(),
        signedFileName: fileName,
        signedFileUrl: fileUrl,
        fileSize: '18.2 KB',
        documentAuthor: 'RRHH E2E',
      },
    });
    expect(closeContractResponse.ok()).toBeTruthy();

    await expect
      .poll(
        async () => {
          const docsResponse = await request.get('/api/documents');
          if (!docsResponse.ok()) return '';
          const docsBody = (await docsResponse.json()) as { items: DocumentRecord[] };
          const hit = docsBody.items.find((doc) => doc.name === fileName);
          if (!hit) return '';
          created.documentId = hit.id;
          return `${hit.folder}|${hit.type}|${hit.fileUrl || ''}`;
        },
        {
          timeout: 20_000,
          intervals: [500, 1000, 2000],
        }
      )
      .toBe(`Legal|PDF|${fileUrl}`);
  } finally {
    if (created.documentId) {
      await request.delete(`/api/documents/${created.documentId}`);
    }
    if (created.employeeId) {
      await request.delete(`/api/employees/${created.employeeId}`);
    }
  }
});
