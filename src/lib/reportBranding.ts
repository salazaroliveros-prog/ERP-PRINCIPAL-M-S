export const COMPANY_DISPLAY_NAME = 'CONSTRUCTORA WM/M&S';
export const COMPANY_TAGLINE = 'Edificando el Futuro';

export function getBrandedCsvPreamble(reportTitle: string, details: string[] = []) {
  return [
    [COMPANY_DISPLAY_NAME],
    [COMPANY_TAGLINE],
    [`Reporte: ${reportTitle}`],
    ...details.map((line) => [line]),
    [`Fecha de emisión: ${new Date().toISOString().split('T')[0]}`],
    [],
  ];
}

export function escapeCsvCell(value: unknown) {
  const text = String(value ?? '');
  return `"${text.replace(/"/g, '""')}"`;
}
