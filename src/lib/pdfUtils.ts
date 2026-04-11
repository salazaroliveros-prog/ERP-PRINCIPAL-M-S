import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { COMPANY_DISPLAY_NAME, COMPANY_TAGLINE } from './reportBranding';

const sharedLogoImage = (() => {
  if (typeof window === 'undefined') return null;
  const image = new Image();
  image.src = '/logo.svg';
  return image;
})();

const circularLogoCache = new Map<number, string>();

const getCircularLogoDataUrl = (size: number) => {
  if (typeof document === 'undefined' || !sharedLogoImage || !sharedLogoImage.complete) {
    return null;
  }

  if (circularLogoCache.has(size)) {
    return circularLogoCache.get(size)!;
  }

  const canvasSize = Math.max(64, size * 4);
  const canvas = document.createElement('canvas');
  canvas.width = canvasSize;
  canvas.height = canvasSize;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.clearRect(0, 0, canvasSize, canvasSize);
  ctx.save();
  ctx.beginPath();
  ctx.arc(canvasSize / 2, canvasSize / 2, canvasSize / 2, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvasSize, canvasSize);
  ctx.drawImage(sharedLogoImage, 0, 0, canvasSize, canvasSize);
  ctx.restore();

  const dataUrl = canvas.toDataURL('image/png');
  circularLogoCache.set(size, dataUrl);
  return dataUrl;
};

export const drawLogo = (doc: any, x: number, y: number, scale: number = 1) => {
  const imageWidth = 42 * scale;
  const imageHeight = 16 * scale;

  if (sharedLogoImage && sharedLogoImage.complete) {
    try {
      doc.addImage(sharedLogoImage, 'SVG', x, y, imageWidth, imageHeight);
      return;
    } catch {
      // Fall back to vector drawing if SVG image embedding is unavailable.
    }
  }

  // Orange Square for WM
  doc.setFillColor(212, 136, 6); // #D48806
  doc.rect(x, y, 22 * scale, 15 * scale, 'F');
  
  // White WM
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(10 * scale);
  doc.setFont('times', 'bold');
  doc.text('WM', x + 11 * scale, y + 10 * scale, { align: 'center' });

  // Black &
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(11 * scale);
  doc.text('&', x + 28 * scale, y + 10 * scale, { align: 'center' });

  // Dark Blue S
  doc.setTextColor(51, 65, 85); // #334155
  doc.setFontSize(14 * scale);
  doc.text('S', x + 38 * scale, y + 10 * scale, { align: 'center' });

  // Subtext
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(4 * scale);
  doc.setFont('times', 'normal');
  
  const subtextY = y + 18 * scale;
  doc.setTextColor(212, 136, 6);
  doc.text('W', x, subtextY);
  doc.setTextColor(0, 0, 0);
  doc.text('M', x + 1.5 * scale, subtextY);
  doc.setTextColor(51, 65, 85);
  doc.text('S', x + 5 * scale, subtextY);
  doc.setTextColor(0, 0, 0);
  doc.text('ERVICIOS DE GUATEMALA S.A.', x + 6.5 * scale, subtextY);
};

export const drawRoundBrandLogo = (doc: any, x: number, y: number, size: number = 18) => {
  const cx = x + size / 2;
  const cy = y + size / 2;
  const radius = size / 2;

  doc.setFillColor(255, 255, 255);
  doc.circle(cx, cy, radius, 'F');
  doc.setDrawColor(242, 125, 38);
  doc.setLineWidth(1.2);
  doc.circle(cx, cy, radius - 0.4);

  const circularLogo = getCircularLogoDataUrl(size - 2);
  if (circularLogo) {
    try {
      doc.addImage(circularLogo, 'PNG', x + 1, y + 1, size - 2, size - 2);
      return;
    } catch {
      // Fall through to text fallback if image embedding fails.
    }
  }

  doc.setFillColor(15, 23, 42);
  doc.circle(cx, cy, radius - 1.6, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(Math.max(8, size * 0.36));
  doc.text('WM', cx, cy + size * 0.12, { align: 'center' });
};

export const drawReportHeader = (
  doc: any,
  title: string,
  options: { subtitle?: string; dateText?: string; x?: number; y?: number } = {}
) => {
  const x = options.x ?? 14;
  const y = options.y ?? 10;
  const subtitle = options.subtitle;
  const dateText = options.dateText;

  drawRoundBrandLogo(doc, x, y, 18);

  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text(COMPANY_DISPLAY_NAME, x + 22, y + 7);

  doc.setTextColor(100, 116, 139);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.text(COMPANY_TAGLINE, x + 22, y + 12.5);

  doc.setTextColor(30, 41, 59);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text(title, x, y + 24);

  let nextY = y + 31;
  if (subtitle) {
    doc.setTextColor(71, 85, 105);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    doc.text(subtitle, x, nextY);
    nextY += 5;
  }

  if (dateText) {
    doc.setTextColor(100, 116, 139);
    doc.setFontSize(8.5);
    doc.text(dateText, x, nextY);
    nextY += 5;
  }

  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.4);
  doc.line(x, nextY, 196, nextY);

  return nextY + 4;
};

export const buildExecutiveReportPdf = (data: {
  projects: any[],
  financials: { totalIncome: number, totalExpense: number },
  inventoryAlerts: any[],
  risks: any[]
}) => {
  const doc = new jsPDF() as any;
  const { projects, financials, inventoryAlerts, risks } = data;

  const headerBottom = drawReportHeader(doc, 'INFORME EJECUTIVO GERENCIAL', {
    dateText: `Fecha de Emisión: ${new Date().toLocaleDateString()}`,
  });

  // 1. Resumen Financiero
  doc.setTextColor(30, 41, 59);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('1. Resumen Financiero Consolidado', 20, headerBottom + 8);
  
  const balance = financials.totalIncome - financials.totalExpense;
  const margin = financials.totalIncome > 0 ? (balance / financials.totalIncome) * 100 : 0;

  autoTable(doc, {
    startY: headerBottom + 13,
    head: [['Concepto', 'Valor']],
    body: [
      ['Ingresos Totales', `$${financials.totalIncome.toLocaleString()}`],
      ['Egresos Totales', `$${financials.totalExpense.toLocaleString()}`],
      ['Balance Neto', `$${balance.toLocaleString()}`],
      ['Margen Operativo', `${margin.toFixed(1)}%`]
    ],
    theme: 'grid',
    headStyles: { fillColor: [30, 41, 59] },
    styles: { fontSize: 10 }
  });

  // 2. Estado de Proyectos
  doc.setFontSize(14);
  doc.text('2. Estado de Proyectos Activos', 20, (doc as any).lastAutoTable.finalY + 15);
  
  autoTable(doc, {
    startY: (doc as any).lastAutoTable.finalY + 20,
    head: [['Proyecto', 'Ubicación', 'Presupuesto', 'Avance Físico', 'Estado']],
    body: projects.map(p => [
      p.name,
      p.location,
      `$${p.budget.toLocaleString()}`,
      `${(p.physicalProgress || 0).toFixed(1)}%`,
      p.status
    ]),
    theme: 'striped',
    headStyles: { fillColor: [37, 99, 235] },
    styles: { fontSize: 9 }
  });

  // 3. Alertas y Riesgos
  if (risks.length > 0 || inventoryAlerts.length > 0) {
    doc.addPage();
    doc.setFontSize(14);
    doc.text('3. Alertas Críticas y Gestión de Riesgos', 20, 20);

    const alertRows = [
      ...risks.map(r => ['Riesgo de Proyecto', r.description || r.name, 'Alta']),
      ...inventoryAlerts.map(i => ['Stock Bajo', `Material: ${i.name} (Quedan ${i.stock} ${i.unit})`, 'Media'])
    ];

    autoTable(doc, {
      startY: 25,
      head: [['Tipo de Alerta', 'Detalle', 'Prioridad']],
      body: alertRows,
      theme: 'grid',
      headStyles: { fillColor: [225, 29, 72] }, // Rose-600
      styles: { fontSize: 10 }
    });
  }

  // Footer
  const pageCount = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184);
    doc.text(`Página ${i} de ${pageCount} - Generado por Asistente IA WM_M&S`, 105, 285, { align: 'center' });
  }

  return doc;
};

export const generateExecutiveReport = (data: {
  projects: any[],
  financials: { totalIncome: number, totalExpense: number },
  inventoryAlerts: any[],
  risks: any[]
}) => {
  const doc = buildExecutiveReportPdf(data);
  doc.save(`Informe_Ejecutivo_${new Date().toISOString().split('T')[0]}.pdf`);
};

export const buildMaterialsLineReportPdf = (input: {
  project: { name: string; location?: string | null };
  lineItem: {
    order?: number | null;
    description: string;
    unit?: string;
    quantity?: number;
    totalItemPrice?: number;
    materials?: Array<{ name?: string; unit?: string; quantity?: number; unitPrice?: number }>;
  };
}) => {
  const doc = new jsPDF() as any;
  const { project, lineItem } = input;
  const materials = Array.isArray(lineItem.materials) ? lineItem.materials : [];

  const titleSuffix = lineItem.order ? `Renglón ${lineItem.order}` : 'Renglón';
  const headerBottom = drawReportHeader(doc, `DESGLOSE DE MATERIALES - ${titleSuffix.toUpperCase()}`, {
    subtitle: `Proyecto: ${project.name}${project.location ? ` · ${project.location}` : ''}`,
    dateText: `Fecha de Emisión: ${new Date().toLocaleDateString()}`,
  });

  doc.setTextColor(30, 41, 59);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text(lineItem.description || 'Sin descripción', 14, headerBottom + 6);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(71, 85, 105);
  doc.text(
    `Unidad: ${lineItem.unit || '-'} | Cantidad: ${Number(lineItem.quantity || 0).toFixed(2)} | Total renglón: ${Number(lineItem.totalItemPrice || 0).toLocaleString('es-GT', { style: 'currency', currency: 'GTQ', maximumFractionDigits: 2 })}`,
    14,
    headerBottom + 12
  );

  const rows = materials.map((material) => {
    const quantity = Number(material?.quantity || 0);
    const unitPrice = Number(material?.unitPrice || 0);
    return [
      String(material?.name || 'Material'),
      String(material?.unit || '-'),
      quantity.toFixed(2),
      unitPrice.toLocaleString('es-GT', { style: 'currency', currency: 'GTQ', maximumFractionDigits: 2 }),
      (quantity * unitPrice).toLocaleString('es-GT', { style: 'currency', currency: 'GTQ', maximumFractionDigits: 2 }),
    ];
  });

  autoTable(doc, {
    startY: headerBottom + 17,
    head: [['Material', 'Unidad', 'Cantidad', 'P. Unitario', 'Subtotal']],
    body: rows.length > 0 ? rows : [['Sin materiales cargados', '-', '-', '-', '-']],
    theme: 'grid',
    headStyles: { fillColor: [37, 99, 235] },
    styles: { fontSize: 9 },
  });

  const pageCount = doc.internal.getNumberOfPages();
  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page);
    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184);
    doc.text(`Página ${page} de ${pageCount} - Reporte de materiales WM_M&S`, 105, 285, { align: 'center' });
  }

  return doc;
};
