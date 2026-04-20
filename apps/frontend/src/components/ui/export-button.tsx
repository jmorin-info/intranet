'use client';

import { Download } from 'lucide-react';
import { toast } from 'sonner';
import { downloadCsv, type CsvColumn } from '@/lib/export-csv';

interface ExportButtonProps<T extends Record<string, unknown>> {
  /** Module name used for the filename (e.g. "documents", "utilisateurs"). */
  filename: string;
  rows: T[];
  columns: CsvColumn<T>[];
  /** Optional report title shown in the CSV header line. */
  reportName?: string;
  label?: string;
  disabled?: boolean;
  className?: string;
}

/**
 * Bouton generique "Exporter en CSV" pour les listes admin (ISO 27001 --
 * preuves auditables : export horodate dans le nom de fichier).
 */
export function ExportButton<T extends Record<string, unknown>>({
  filename,
  rows,
  columns,
  reportName,
  label = 'Exporter CSV',
  disabled,
  className,
}: ExportButtonProps<T>) {
  const handleExport = () => {
    downloadCsv(filename, rows, columns, reportName);
    toast.success(`Export généré : ${rows.length} ligne(s)`);
  };

  return (
    <button
      type="button"
      disabled={disabled || rows.length === 0}
      onClick={handleExport}
      className={
        className ||
        'inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-medium text-seal-navy dark:text-white hover:bg-gray-50 dark:hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition'
      }
      title={`Télécharger ${rows.length} lignes au format CSV`}
    >
      <Download className="h-3.5 w-3.5" />
      {label}
      {rows.length > 0 && (
        <span className="text-[10px] text-seal-gray-500 dark:text-slate-500">({rows.length})</span>
      )}
    </button>
  );
}
