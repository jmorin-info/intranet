/**
 * CSV export utility — RFC 4180 compliant, French Excel optimised.
 *
 * Features:
 * - BOM UTF-8 (\uFEFF) for Excel FR
 * - Semicolon separator (standard Excel FR)
 * - Header line with report name + generation date + "OMNITECH Security"
 * - Dates formatted DD/MM/YYYY HH:mm
 * - Booleans: true -> "Oui", false -> "Non"
 * - null/undefined -> ""
 */

export interface CsvColumn<T> {
  header: string;
  accessor: keyof T | ((row: T) => string | number | boolean | null | undefined);
}

/** Format an ISO date string or Date to DD/MM/YYYY HH:mm. */
function formatDateFr(value: string | Date): string {
  const d = typeof value === 'string' ? new Date(value) : value;
  if (isNaN(d.getTime())) return String(value);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Format a raw value with French conventions. */
function formatValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'boolean') return value ? 'Oui' : 'Non';
  if (
    typeof value === 'string' &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value)
  ) {
    return formatDateFr(value);
  }
  if (value instanceof Date) return formatDateFr(value);
  return String(value);
}

function formatCsvCell(value: unknown): string {
  const str = formatValue(value);
  if (str === '') return '';
  // Escape per RFC 4180: wrap in " if contains ";", ", \n, \r ; double any internal quote.
  if (/[";;\n\r]/.test(str) || str.includes(';')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function rowsToCsv<T extends Record<string, unknown>>(
  rows: T[],
  columns: CsvColumn<T>[],
  reportName?: string,
): string {
  const lines: string[] = [];

  // Report header
  const now = new Date();
  const generatedAt = formatDateFr(now);
  const title = reportName || 'Export';
  lines.push(
    formatCsvCell(`${title} - OMNITECH Security - Genere le ${generatedAt}`),
  );
  lines.push(''); // blank separator line

  // Column headers
  const headerLine = columns.map((c) => formatCsvCell(c.header)).join(';');
  lines.push(headerLine);

  // Data rows
  for (const row of rows) {
    lines.push(
      columns
        .map((c) => {
          const raw =
            typeof c.accessor === 'function'
              ? c.accessor(row)
              : (row[c.accessor] as string | number | boolean | null | undefined);
          return formatCsvCell(raw);
        })
        .join(';'),
    );
  }

  // BOM pour qu'Excel reconnaisse l'UTF-8 et affiche les accents correctement
  return '\uFEFF' + lines.join('\r\n');
}

/** Generate a standardised filename: {module}_{YYYYMMDD}_{HHmm}.csv */
export function csvFilename(module: string): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const date = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
  const time = `${pad(now.getHours())}${pad(now.getMinutes())}`;
  return `${module}_${date}_${time}.csv`;
}

export function downloadCsv<T extends Record<string, unknown>>(
  module: string,
  rows: T[],
  columns: CsvColumn<T>[],
  reportName?: string,
): void {
  if (typeof window === 'undefined') return;
  const csv = rowsToCsv(rows, columns, reportName);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  const filename = csvFilename(module);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
