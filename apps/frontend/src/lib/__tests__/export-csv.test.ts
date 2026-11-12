import { describe, expect, it } from 'vitest';
import { rowsToCsv } from '../export-csv';

describe('CSV spreadsheet safety', () => {
  const exportCell = (value: unknown) => rowsToCsv([{ value }], [{ header: 'Valeur', accessor: 'value' }]).split('\r\n').slice(3).join('\r\n');

  it.each(['=HYPERLINK("https://example.test")', '+SUM(1,2)', '-2+3', '@SUM(A1)', '  =1+1', '\t=1+1', '\r\n@SUM(A1)', '\u0000-1+1', '\u007f+1'])('neutralizes formula %j after initial whitespace or controls', (value) => {
    const cell = exportCell(value)!;
    expect(cell.startsWith("'") || cell.startsWith('"\'')).toBe(true);
  });

  it('preserves numeric values, ordinary text and French booleans', () => {
    expect(exportCell(-42)).toBe('-42');
    expect(exportCell(3.14)).toBe('3.14');
    expect(exportCell('Document')).toBe('Document');
    expect(exportCell(true)).toBe('Oui');
    expect(exportCell(null)).toBe('');
    expect(exportCell('Titre; avec "citation"')).toBe('"Titre; avec ""citation"""');
  });

  it('also protects column headers and the report title', () => {
    const csv = rowsToCsv([], [{ header: '=A1', accessor: 'value' }], '@report');
    expect(csv).toContain("'@report");
    expect(csv).toContain("'=A1");
  });
});
