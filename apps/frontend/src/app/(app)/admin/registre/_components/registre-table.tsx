'use client';

/**
 * RegistreTable — tableau principal de /admin/registre.
 *
 * Colonnes alignees avec le fichier Excel REG_016 :
 *   Reference | Type | Niveau pyramide | Nom | Etat | Classification |
 *   Priorite | Bloquant | Proprietaire | Controles ISO | Version |
 *   Periodicite revue | Format
 *
 * - Tri client par colonne (V1 ; serveur si volumetrie depasse).
 * - Pagination simple (50 lignes / page).
 * - Charte SEAL (text-seal-navy, bg-seal-blue/10, ...).
 */

import React, { useMemo, useState } from 'react';
import {
  DocumentCategory,
  DocumentLevel,
  DocumentPriority,
  DOCUMENT_CATEGORY_LABELS,
  DOCUMENT_LEVEL_LABELS,
  DOCUMENT_PRIORITY_LABELS,
  DOCUMENT_CATEGORY_CODE,
  DOCUMENT_STATUS_LABELS,
  type DocumentStatus,
} from '@omnitech/shared';
import { Card, CardContent, Badge, Button, EmptyState } from '@omnitech/ui';
import { ChevronUp, ChevronDown, ChevronsUpDown, FileText } from 'lucide-react';
import {
  ClassificationBadge,
} from '@/components/ui/classification-badge';

export interface RegistreRow {
  id: string;
  reference: string;
  title: string;
  category: DocumentCategory | string;
  documentLevel: DocumentLevel | null;
  status: DocumentStatus | string;
  classification: string | null;
  priority: DocumentPriority | null;
  blocking: boolean;
  ownerName: string | null;
  isoControls: string[];
  version: string | null;
  reviewPeriodicity: string | null;
  format: string | null;
}

interface RegistreTableProps {
  rows: RegistreRow[];
  pageSize?: number;
}

type SortKey =
  | 'reference'
  | 'category'
  | 'documentLevel'
  | 'title'
  | 'status'
  | 'classification'
  | 'priority'
  | 'blocking'
  | 'ownerName'
  | 'version';

type SortDirection = 'asc' | 'desc';

const PRIORITY_BADGE: Record<DocumentPriority, string> = {
  CRITICAL:
    'bg-red-50 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800',
  HIGH:
    'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800',
  MEDIUM:
    'bg-seal-blue/10 text-seal-navy border-seal-blue/30 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800',
  LOW:
    'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-800',
};

const LEVEL_BADGE: Record<DocumentLevel, string> = {
  GOVERNANCE:
    'bg-purple-50 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
  OPERATIONAL:
    'bg-seal-blue/10 text-seal-navy dark:bg-blue-900/30 dark:text-blue-300',
  EVIDENCE:
    'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  COMMUNICATION:
    'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
};

function getCategoryLabel(cat: string): string {
  const k = cat as DocumentCategory;
  return DOCUMENT_CATEGORY_LABELS[k] ?? cat;
}

function getCategoryCode(cat: string): string {
  const k = cat as DocumentCategory;
  return DOCUMENT_CATEGORY_CODE[k] ?? '—';
}

function getStatusLabel(status: string): string {
  return (
    DOCUMENT_STATUS_LABELS[status as DocumentStatus] ?? status ?? '—'
  );
}

function compareValues(a: unknown, b: unknown): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  if (typeof a === 'boolean' && typeof b === 'boolean') {
    return a === b ? 0 : a ? -1 : 1;
  }
  return String(a).localeCompare(String(b), 'fr', { sensitivity: 'base' });
}

interface ColumnDef {
  key: SortKey | null;
  label: string;
  /** Largeur indicative (Tailwind). */
  className?: string;
}

const COLUMNS: ColumnDef[] = [
  { key: 'reference', label: 'Reference', className: 'min-w-[110px]' },
  { key: 'category', label: 'Type', className: 'min-w-[120px]' },
  { key: 'documentLevel', label: 'Niveau', className: 'min-w-[140px]' },
  { key: 'title', label: 'Nom', className: 'min-w-[220px]' },
  { key: 'status', label: 'Etat', className: 'min-w-[120px]' },
  { key: 'classification', label: 'Classification', className: 'min-w-[140px]' },
  { key: 'priority', label: 'Priorite', className: 'min-w-[110px]' },
  { key: 'blocking', label: 'Bloquant', className: 'min-w-[80px]' },
  { key: 'ownerName', label: 'Proprietaire', className: 'min-w-[150px]' },
  { key: null, label: 'Controles ISO', className: 'min-w-[140px]' },
  { key: 'version', label: 'Version', className: 'min-w-[80px]' },
  { key: null, label: 'Periodicite revue', className: 'min-w-[140px]' },
  { key: null, label: 'Format', className: 'min-w-[80px]' },
];

export function RegistreTable({ rows, pageSize = 50 }: RegistreTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>('reference');
  const [sortDir, setSortDir] = useState<SortDirection>('asc');
  const [page, setPage] = useState(1);

  // Reset page si le dataset reduit
  React.useEffect(() => {
    setPage(1);
  }, [rows.length]);

  const sortedRows = useMemo(() => {
    const copy = rows.slice();
    copy.sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      const cmp = compareValues(av, bv);
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return copy;
  }, [rows, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sortedRows.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageRows = useMemo(
    () => sortedRows.slice((safePage - 1) * pageSize, safePage * pageSize),
    [sortedRows, safePage, pageSize],
  );

  const handleSort = (key: SortKey | null) => {
    if (!key) return;
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  if (rows.length === 0) {
    return (
      <Card>
        <CardContent className="py-8">
          <EmptyState
            type="documents"
            title="Aucun document dans le perimetre"
            description="Aucune information documentee ne correspond aux filtres courants. Ajustez les filtres ou ajoutez des documents au SMSI."
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b-2 border-gray-200 dark:border-slate-700 bg-gray-50/50 dark:bg-slate-900/40">
                {COLUMNS.map((col, idx) => {
                  const sortable = col.key !== null;
                  const isActive = sortable && sortKey === col.key;
                  return (
                    <th
                      key={`${col.label}-${idx}`}
                      scope="col"
                      className={`text-left py-2.5 px-3 font-semibold text-seal-navy dark:text-white whitespace-nowrap ${col.className ?? ''}`}
                    >
                      {sortable ? (
                        <button
                          type="button"
                          onClick={() => handleSort(col.key)}
                          aria-label={`Trier par ${col.label}`}
                          className="inline-flex items-center gap-1 hover:text-primary focus:outline-none focus-visible:underline"
                        >
                          {col.label}
                          {isActive ? (
                            sortDir === 'asc' ? (
                              <ChevronUp className="h-3 w-3" />
                            ) : (
                              <ChevronDown className="h-3 w-3" />
                            )
                          ) : (
                            <ChevronsUpDown className="h-3 w-3 opacity-40" />
                          )}
                        </button>
                      ) : (
                        col.label
                      )}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {pageRows.map((row) => (
                <tr
                  key={row.id}
                  className="border-b border-gray-100 dark:border-slate-800 transition-colors hover:bg-gray-50 dark:hover:bg-slate-800/50"
                >
                  <td className="py-2 px-3 font-mono text-[11px] text-seal-navy dark:text-white whitespace-nowrap">
                    {row.reference}
                  </td>
                  <td className="py-2 px-3">
                    <span
                      title={getCategoryLabel(String(row.category))}
                      className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 dark:bg-slate-800 px-2 py-0.5 text-[10px] font-semibold text-seal-navy dark:text-slate-200"
                    >
                      <span className="font-mono">
                        {getCategoryCode(String(row.category))}
                      </span>
                      <span className="text-seal-gray-500 dark:text-slate-400 normal-case">
                        {getCategoryLabel(String(row.category))}
                      </span>
                    </span>
                  </td>
                  <td className="py-2 px-3">
                    {row.documentLevel ? (
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${LEVEL_BADGE[row.documentLevel]}`}
                      >
                        {DOCUMENT_LEVEL_LABELS[row.documentLevel]}
                      </span>
                    ) : (
                      <span className="text-seal-gray-500 dark:text-slate-500">
                        —
                      </span>
                    )}
                  </td>
                  <td className="py-2 px-3 text-seal-navy dark:text-white max-w-[340px]">
                    <span className="line-clamp-2" title={row.title}>
                      {row.title}
                    </span>
                  </td>
                  <td className="py-2 px-3 whitespace-nowrap">
                    <Badge variant="navy">{getStatusLabel(String(row.status))}</Badge>
                  </td>
                  <td className="py-2 px-3 whitespace-nowrap">
                    <ClassificationBadge level={row.classification} size="xs" />
                  </td>
                  <td className="py-2 px-3 whitespace-nowrap">
                    {row.priority ? (
                      <span
                        className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${PRIORITY_BADGE[row.priority]}`}
                      >
                        {DOCUMENT_PRIORITY_LABELS[row.priority]}
                      </span>
                    ) : (
                      <span className="text-seal-gray-500 dark:text-slate-500">
                        —
                      </span>
                    )}
                  </td>
                  <td className="py-2 px-3 whitespace-nowrap">
                    {row.blocking ? (
                      <Badge variant="error">Oui</Badge>
                    ) : (
                      <span className="text-seal-gray-500 dark:text-slate-500">
                        Non
                      </span>
                    )}
                  </td>
                  <td className="py-2 px-3 text-seal-gray-500 dark:text-slate-400">
                    {row.ownerName || '—'}
                  </td>
                  <td className="py-2 px-3">
                    {row.isoControls.length > 0 ? (
                      <div className="flex flex-wrap gap-1 max-w-[180px]">
                        {row.isoControls.slice(0, 3).map((ctrl) => (
                          <span
                            key={ctrl}
                            className="inline-flex items-center rounded bg-seal-blue/10 text-seal-navy dark:bg-blue-900/30 dark:text-blue-300 px-1.5 py-0.5 text-[10px] font-mono"
                          >
                            {ctrl}
                          </span>
                        ))}
                        {row.isoControls.length > 3 && (
                          <span
                            className="inline-flex items-center rounded bg-gray-100 dark:bg-slate-800 text-seal-gray-500 dark:text-slate-400 px-1.5 py-0.5 text-[10px]"
                            title={row.isoControls.join(', ')}
                          >
                            +{row.isoControls.length - 3}
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="text-seal-gray-500 dark:text-slate-500">
                        —
                      </span>
                    )}
                  </td>
                  <td className="py-2 px-3 font-mono text-[11px] text-seal-gray-500 dark:text-slate-400 whitespace-nowrap">
                    {row.version || '—'}
                  </td>
                  <td className="py-2 px-3 text-seal-gray-500 dark:text-slate-400 whitespace-nowrap">
                    {row.reviewPeriodicity || '—'}
                  </td>
                  <td className="py-2 px-3 whitespace-nowrap">
                    {row.format ? (
                      <span className="inline-flex items-center gap-1 rounded bg-gray-100 dark:bg-slate-800 px-1.5 py-0.5 text-[10px] font-mono uppercase text-seal-gray-500 dark:text-slate-400">
                        <FileText className="h-3 w-3" aria-hidden="true" />
                        {row.format}
                      </span>
                    ) : (
                      <span className="text-seal-gray-500 dark:text-slate-500">
                        —
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-t border-gray-100 dark:border-slate-800">
          <p className="text-[11px] text-seal-gray-500 dark:text-slate-400">
            {sortedRows.length === 0
              ? 'Aucun resultat'
              : `Page ${safePage} / ${totalPages} — ${sortedRows.length} document${sortedRows.length > 1 ? 's' : ''}`}
          </p>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={safePage <= 1}
              aria-label="Page precedente"
            >
              Precedente
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={safePage >= totalPages}
              aria-label="Page suivante"
            >
              Suivante
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
