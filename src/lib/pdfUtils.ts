import { jsPDF } from 'jspdf';
import { COMPANY_DISPLAY_NAME, COMPANY_TAGLINE } from './reportBranding';

const sharedLogoImage = (() => {
  if (typeof window === 'undefined') return null;
  const image = new Image();
  image.src = '/logo.svg';
  return image;
})();

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

export const drawRoundBrandLogo = (doc: any, x: number, y: number, size: number = 14) => {
  const cx = x + size / 2;
  const cy = y + size / 2;
  const radius = size / 2;

  doc.setFillColor(15, 23, 42);
  doc.circle(cx, cy, radius, 'F');
  doc.setDrawColor(242, 125, 38);
  doc.setLineWidth(0.8);
  doc.circle(cx, cy, radius - 0.6);

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(Math.max(8, size * 0.42));
  doc.text('WM', cx, cy + size * 0.13, { align: 'center' });
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

  drawRoundBrandLogo(doc, x, y, 14);

  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text(COMPANY_DISPLAY_NAME, x + 18, y + 5.5);

  doc.setTextColor(100, 116, 139);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.text(COMPANY_TAGLINE, x + 18, y + 10.5);

  doc.setTextColor(30, 41, 59);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text(title, x, y + 21);

  let nextY = y + 27;
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

export const generateExecutiveReport = (data: {
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

  (doc as any).autoTable({
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
  
  (doc as any).autoTable({
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

    (doc as any).autoTable({
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

  doc.save(`Informe_Ejecutivo_${new Date().toISOString().split('T')[0]}.pdf`);
};
