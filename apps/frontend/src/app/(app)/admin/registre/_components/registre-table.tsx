"use client";

/**
 * RegistreTable — tableau principal de /admin/registre.
 *
 * Colonnes alignees avec le fichier Excel REG_016 :
 *   Reference | Type | Niveau pyramide | Nom | Etat | Classification |
 *   Priorite | Bloquant | Proprietaire | Controles ISO | Version |
 *   Periodicite revue | Format
 *
 * - Tri SERVEUR par colonne (whitelist : reference / name / priority /
 *   documentLevel / updatedAt — cf. RegistreSortBy backend).
 * - Pagination SERVEUR (page courante + total renvoyes par le parent).
 * - Charte SEAL (text-seal-navy, bg-seal-blue/10, ...).
 */

import React from "react";
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
} from "@omnitech/shared";
import { Card, CardContent, Badge, Button, EmptyState } from "@omnitech/ui";
import { ArrowUp, ArrowDown, ArrowUpDown, FileText } from "lucide-react";
import { ClassificationBadge } from "@/components/ui/classification-badge";

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
  /** Contrôle de cohérence PGID §15.1 calculé côté backend. */
  coherence?: string | null;
}

/**
 * Whitelist des colonnes triables COTE SERVEUR — doit etre alignee avec
 * `RegistreSortBy` cote backend (apps/backend/src/registre/types.ts).
 * Note: "name" est l'alias logique de la colonne SQL `title`.
 */
export type RegistreSortBy = "reference" | "name" | "priority" | "documentLevel" | "updatedAt";

export type RegistreSortDir = "asc" | "desc";

interface RegistreTableProps {
  rows: RegistreRow[];
  /** Cardinal global du jeu filtre (avant pagination). */
  total: number;
  /** Page courante 1-indexee. */
  page: number;
  /** Taille de page (lignes max affichees par page). */
  pageSize: number;
  sortBy: RegistreSortBy;
  sortDir: RegistreSortDir;
  onSortChange: (next: RegistreSortBy, dir: RegistreSortDir) => void;
  onPageChange: (next: number) => void;
}

const PRIORITY_BADGE: Record<DocumentPriority, string> = {
  CRITICAL:
    "bg-red-50 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800",
  HIGH: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800",
  MEDIUM:
    "bg-seal-blue/10 text-seal-navy border-seal-blue/30 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800",
  LOW: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-800",
};

const LEVEL_BADGE: Record<DocumentLevel, string> = {
  GOVERNANCE: "bg-purple-50 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
  OPERATIONAL: "bg-seal-blue/10 text-seal-navy dark:bg-blue-900/30 dark:text-blue-300",
  EVIDENCE: "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
  COMMUNICATION: "bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
};

function getCategoryLabel(cat: string): string {
  const k = cat as DocumentCategory;
  return DOCUMENT_CATEGORY_LABELS[k] ?? cat;
}

function getCategoryCode(cat: string): string {
  const k = cat as DocumentCategory;
  return DOCUMENT_CATEGORY_CODE[k] ?? "—";
}

function getStatusLabel(status: string): string {
  return DOCUMENT_STATUS_LABELS[status as DocumentStatus] ?? status ?? "—";
}

interface ColumnDef {
  /**
   * Cle de tri serveur (whitelist RegistreSortBy) ou `null` si la colonne
   * n'est pas triable. Les colonnes non triables sont affichees sans bouton
   * (ex. Controles ISO, Format — pas de tri SQL pertinent).
   */
  key: RegistreSortBy | null;
  label: string;
  /** Largeur indicative (Tailwind). */
  className?: string;
}

const COLUMNS: ColumnDef[] = [
  { key: "reference", label: "Reference", className: "min-w-[110px]" },
  { key: null, label: "Type", className: "min-w-[120px]" },
  { key: "documentLevel", label: "Niveau", className: "min-w-[140px]" },
  { key: "name", label: "Nom", className: "min-w-[220px]" },
  { key: null, label: "Etat", className: "min-w-[120px]" },
  { key: null, label: "Classification", className: "min-w-[140px]" },
  { key: "priority", label: "Priorite", className: "min-w-[110px]" },
  { key: null, label: "Bloquant", className: "min-w-[80px]" },
  { key: null, label: "Proprietaire", className: "min-w-[150px]" },
  { key: null, label: "Controles ISO", className: "min-w-[140px]" },
  { key: null, label: "Version", className: "min-w-[80px]" },
  { key: null, label: "Periodicite revue", className: "min-w-[140px]" },
  { key: null, label: "Format", className: "min-w-[80px]" },
  { key: null, label: "Coherence", className: "min-w-[120px]" },
];

export function RegistreTable({
  rows,
  total,
  page,
  pageSize,
  sortBy,
  sortDir,
  onSortChange,
  onPageChange,
}: RegistreTableProps) {
  // Pagination serveur — Math.max evite Page 0/0 quand total = 0
  // (cas EmptyState ci-dessous, le footer n'est pas affiche).
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);

  // Toggle direction quand on reclique sur la colonne active, sinon repart
  // en 'asc' sur la nouvelle colonne. Comportement classique des tableaux.
  const handleSort = (key: RegistreSortBy | null) => {
    if (!key) return;
    if (sortBy === key) {
      onSortChange(key, sortDir === "asc" ? "desc" : "asc");
    } else {
      onSortChange(key, "asc");
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
                  const isActive = sortable && sortBy === col.key;
                  return (
                    <th
                      key={`${col.label}-${idx}`}
                      scope="col"
                      aria-sort={
                        isActive
                          ? sortDir === "asc"
                            ? "ascending"
                            : "descending"
                          : sortable
                            ? "none"
                            : undefined
                      }
                      className={`text-left py-2.5 px-3 font-semibold text-seal-navy dark:text-white whitespace-nowrap ${col.className ?? ""}`}
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
                            sortDir === "asc" ? (
                              <ArrowUp className="h-3 w-3" />
                            ) : (
                              <ArrowDown className="h-3 w-3" />
                            )
                          ) : (
                            <ArrowUpDown className="h-3 w-3 opacity-40" />
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
              {rows.map((row) => (
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
                      <span className="font-mono">{getCategoryCode(String(row.category))}</span>
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
                      <span className="text-seal-gray-500 dark:text-slate-500">—</span>
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
                      <span className="text-seal-gray-500 dark:text-slate-500">—</span>
                    )}
                  </td>
                  <td className="py-2 px-3 whitespace-nowrap">
                    {row.blocking ? (
                      <Badge variant="error">Oui</Badge>
                    ) : (
                      <span className="text-seal-gray-500 dark:text-slate-500">Non</span>
                    )}
                  </td>
                  <td className="py-2 px-3 text-seal-gray-500 dark:text-slate-400">
                    {row.ownerName || "—"}
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
                            title={row.isoControls.join(", ")}
                          >
                            +{row.isoControls.length - 3}
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="text-seal-gray-500 dark:text-slate-500">—</span>
                    )}
                  </td>
                  <td className="py-2 px-3 font-mono text-[11px] text-seal-gray-500 dark:text-slate-400 whitespace-nowrap">
                    {row.version || "—"}
                  </td>
                  <td className="py-2 px-3 text-seal-gray-500 dark:text-slate-400 whitespace-nowrap">
                    {row.reviewPeriodicity || "—"}
                  </td>
                  <td className="py-2 px-3 whitespace-nowrap">
                    {row.format ? (
                      <span className="inline-flex items-center gap-1 rounded bg-gray-100 dark:bg-slate-800 px-1.5 py-0.5 text-[10px] font-mono uppercase text-seal-gray-500 dark:text-slate-400">
                        <FileText className="h-3 w-3" aria-hidden="true" />
                        {row.format}
                      </span>
                    ) : (
                      <span className="text-seal-gray-500 dark:text-slate-500">—</span>
                    )}
                  </td>
                  <td className="py-2 px-3 whitespace-nowrap">
                    {row.coherence && row.coherence !== "Conforme" ? (
                      <span
                        title={row.coherence}
                        className="inline-flex items-center rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-[10px] font-semibold text-red-700 dark:border-red-800 dark:bg-red-900/30 dark:text-red-300"
                      >
                        Anomalie
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:border-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300">
                        Conforme
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination — pilotee par le parent (mode serveur).
            Affiche "X documents trouves" + "Page X / Y" + navigation. */}
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-t border-gray-100 dark:border-slate-800">
          <p className="text-[11px] text-seal-gray-500 dark:text-slate-400" aria-live="polite">
            {total === 0
              ? "Aucun resultat"
              : `${total} document${total > 1 ? "s" : ""} trouve${total > 1 ? "s" : ""} — Page ${safePage} / ${totalPages}`}
          </p>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onPageChange(Math.max(1, safePage - 1))}
              disabled={safePage <= 1}
              aria-label="Page precedente"
            >
              Precedente
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onPageChange(Math.min(totalPages, safePage + 1))}
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
