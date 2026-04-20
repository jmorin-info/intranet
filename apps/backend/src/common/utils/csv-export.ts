/**
 * CSV export helpers — ISO 27001 A.5.10 (export controle).
 * Sanitizes formula injection (cells starting with =, +, -, @, |, %, \r, \t prefixed with single quote).
 *
 * Features:
 * - BOM UTF-8 for Excel French compatibility
 * - Separator `;` (standard Excel FR)
 * - Header line with report name + generation date + site name
 * - Dates formatted DD/MM/YYYY HH:mm
 * - Booleans translated: true -> "Oui", false -> "Non"
 * - null/undefined -> ""
 */

const FORMULA_TRIGGERS = /^[=+\-@|%\t\r]/;

/** Format an ISO date string to DD/MM/YYYY HH:mm (French format). */
export function formatDateFr(value: string | Date | null | undefined): string {
  if (!value) return '';
  const d = value instanceof Date ? value : new Date(value);
  if (isNaN(d.getTime())) return String(value);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Translate a boolean to French Oui/Non. */
export function booleanFr(value: unknown): string {
  if (value === true) return 'Oui';
  if (value === false) return 'Non';
  return '';
}

/** Format a cell value with French conventions. */
function formatValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'boolean') return booleanFr(value);
  // Auto-detect ISO date strings
  if (
    typeof value === 'string' &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value)
  ) {
    return formatDateFr(value);
  }
  if (value instanceof Date) return formatDateFr(value);
  return String(value);
}

export function escapeCsvCell(value: unknown): string {
  const str = formatValue(value);
  if (str === '') return '';
  let out = str;
  // Prevent CSV formula injection
  if (FORMULA_TRIGGERS.test(out)) {
    out = "'" + out;
  }
  // Escape double quotes and wrap if contains separator, quote, or newline
  if (/[";;\n\r]/.test(out) || out.includes(';')) {
    out = '"' + out.replace(/"/g, '""') + '"';
  }
  return out;
}

export interface CsvColumn<T> {
  header: string;
  accessor: (row: T) => unknown;
}

export function rowsToCsv<T>(
  rows: T[],
  columns: CsvColumn<T>[],
  reportName?: string,
): string {
  const lines: string[] = [];

  // Report header line: name + date + site
  const now = new Date();
  const generatedAt = formatDateFr(now);
  const title = reportName || 'Export';
  lines.push(
    escapeCsvCell(`${title} - OMNITECH Security - Genere le ${generatedAt}`),
  );
  lines.push(''); // blank separator line

  // Column headers
  const headerLine = columns.map((c) => escapeCsvCell(c.header)).join(';');
  lines.push(headerLine);

  // Data rows
  for (const row of rows) {
    lines.push(columns.map((c) => escapeCsvCell(c.accessor(row))).join(';'));
  }

  // BOM for Excel UTF-8 compatibility + semicolon separator
  return '\uFEFF' + lines.join('\r\n');
}

export function csvFilename(prefix: string): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const date = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
  const time = `${pad(now.getHours())}${pad(now.getMinutes())}`;
  return `${prefix}_${date}_${time}.csv`;
}
