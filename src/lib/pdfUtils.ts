import { jsPDF } from 'jspdf';

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

export const generateExecutiveReport = (data: {
  projects: any[],
  financials: { totalIncome: number, totalExpense: number },
  inventoryAlerts: any[],
  risks: any[]
}) => {
  const doc = new jsPDF() as any;
  const { projects, financials, inventoryAlerts, risks } = data;

  // Header
  doc.setFillColor(30, 41, 59); // Slate-800
  doc.rect(0, 0, 210, 45, 'F');
  
  drawLogo(doc, 20, 10, 1.5);
  
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text('INFORME EJECUTIVO GERENCIAL', 190, 25, { align: 'right' });
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(`Fecha de Emisión: ${new Date().toLocaleDateString()}`, 190, 32, { align: 'right' });

  // 1. Resumen Financiero
  doc.setTextColor(30, 41, 59);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('1. Resumen Financiero Consolidado', 20, 60);
  
  const balance = financials.totalIncome - financials.totalExpense;
  const margin = financials.totalIncome > 0 ? (balance / financials.totalIncome) * 100 : 0;

  (doc as any).autoTable({
    startY: 65,
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
