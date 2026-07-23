"use client";

import React, { useMemo } from "react";
import { formatDate as formatDateUtil } from "@/lib/utils";
import { Minus, Plus, Equal, FileText, Hash, Calendar, HardDrive } from "lucide-react";

export interface DiffVersion {
  id: string;
  versionNumber: string;
  checksum: string;
  fileSizeBytes: number;
  fileType: string;
  createdAt: string;
  changeLog?: string | null;
  /** Contenu texte extrait si disponible (PDF plain text, docs inline, etc.) */
  content?: string | null;
  uploadedBy?: { firstName: string; lastName: string };
}

interface VersionDiffProps {
  left: DiffVersion;
  right: DiffVersion;
}

type DiffLine =
  | { type: "equal"; value: string }
  | { type: "add"; value: string }
  | { type: "del"; value: string };

/**
 * Longest Common Subsequence (LCS) sur lignes de texte.
 * Implémentation itérative en O(n*m) mémoire.
 */
function computeLcsDiff(a: string, b: string): DiffLine[] {
  const aLines = a.split(/\r?\n/);
  const bLines = b.split(/\r?\n/);
  const n = aLines.length;
  const m = bLines.length;

  // Matrice de longueurs LCS
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));

  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      if (aLines[i] === bLines[j]) {
        dp[i]![j] = (dp[i + 1]![j + 1] ?? 0) + 1;
      } else {
        dp[i]![j] = Math.max(dp[i + 1]![j] ?? 0, dp[i]![j + 1] ?? 0);
      }
    }
  }

  // Remontée pour construire le diff
  const diff: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (aLines[i] === bLines[j]) {
      diff.push({ type: "equal", value: aLines[i]! });
      i++;
      j++;
    } else if ((dp[i + 1]?.[j] ?? 0) >= (dp[i]?.[j + 1] ?? 0)) {
      diff.push({ type: "del", value: aLines[i]! });
      i++;
    } else {
      diff.push({ type: "add", value: bLines[j]! });
      j++;
    }
  }
  while (i < n) {
    diff.push({ type: "del", value: aLines[i++]! });
  }
  while (j < m) {
    diff.push({ type: "add", value: bLines[j++]! });
  }
  return diff;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
  return `${(bytes / 1024 / 1024).toFixed(2)} Mo`;
}

function formatDate(iso: string): string {
  try {
    return formatDateUtil(iso, {
      day: "numeric",
      month: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
    });
  } catch {
    return iso;
  }
}

export function VersionDiff({ left, right }: VersionDiffProps) {
  const canTextDiff = Boolean(
    left.content && right.content && left.content.length + right.content.length < 200_000,
  );

  const diff = useMemo<DiffLine[] | null>(() => {
    if (!canTextDiff) return null;
    return computeLcsDiff(left.content || "", right.content || "");
  }, [canTextDiff, left.content, right.content]);

  const stats = useMemo(() => {
    if (!diff) return { added: 0, removed: 0, unchanged: 0 };
    let added = 0;
    let removed = 0;
    let unchanged = 0;
    for (const line of diff) {
      if (line.type === "add") added++;
      else if (line.type === "del") removed++;
      else unchanged++;
    }
    return { added, removed, unchanged };
  }, [diff]);

  const metaChanges = useMemo(() => {
    const rows: Array<{
      label: string;
      icon: React.ComponentType<{ className?: string }>;
      leftV: string;
      rightV: string;
      changed: boolean;
    }> = [
      {
        label: "Taille",
        icon: HardDrive,
        leftV: formatSize(left.fileSizeBytes),
        rightV: formatSize(right.fileSizeBytes),
        changed: left.fileSizeBytes !== right.fileSizeBytes,
      },
      {
        label: "Checksum SHA-256",
        icon: Hash,
        leftV: left.checksum,
        rightV: right.checksum,
        changed: left.checksum !== right.checksum,
      },
      {
        label: "Date",
        icon: Calendar,
        leftV: formatDate(left.createdAt),
        rightV: formatDate(right.createdAt),
        changed: true,
      },
      {
        label: "Type",
        icon: FileText,
        leftV: left.fileType,
        rightV: right.fileType,
        changed: left.fileType !== right.fileType,
      },
    ];
    return rows;
  }, [left, right]);

  return (
    <div className="space-y-4">
      {/* En-tête */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-lg border border-[#892034]/30 bg-[#892034]/5 p-3">
          <p className="text-[10px] uppercase tracking-wide text-[#837274]">Version A</p>
          <p className="text-sm font-semibold text-slate-900 dark:text-white">
            v{left.versionNumber}
          </p>
          <p className="text-[10px] text-[#837274]">{formatDate(left.createdAt)}</p>
        </div>
        <div className="rounded-lg border border-[#006233]/30 bg-[#006233]/5 p-3">
          <p className="text-[10px] uppercase tracking-wide text-[#837274]">Version B</p>
          <p className="text-sm font-semibold text-slate-900 dark:text-white">
            v{right.versionNumber}
          </p>
          <p className="text-[10px] text-[#837274]">{formatDate(right.createdAt)}</p>
        </div>
      </div>

      {/* Métadonnées */}
      <div className="rounded-lg border border-gray-200 dark:border-slate-700">
        <div className="border-b border-gray-200 dark:border-slate-700 px-3 py-2">
          <p className="text-xs font-semibold text-slate-900 dark:text-white">Métadonnées</p>
        </div>
        <ul className="divide-y divide-gray-100 dark:divide-slate-800">
          {metaChanges.map((row) => {
            const Icon = row.icon;
            return (
              <li key={row.label} className="flex items-start gap-2 px-3 py-2 text-xs">
                <Icon className="mt-0.5 h-3.5 w-3.5 text-[#837274]" />
                <div className="flex-1">
                  <p className="text-[10px] uppercase text-[#837274]">{row.label}</p>
                  <div className="grid grid-cols-2 gap-2 mt-0.5">
                    <span
                      className={`font-mono break-all ${row.changed ? "text-[#892034]" : "text-slate-900 dark:text-slate-200"}`}
                    >
                      {row.leftV}
                    </span>
                    <span
                      className={`font-mono break-all ${row.changed ? "text-[#006233]" : "text-slate-900 dark:text-slate-200"}`}
                    >
                      {row.rightV}
                    </span>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      {/* Diff textuel si disponible */}
      {diff ? (
        <div className="rounded-lg border border-gray-200 dark:border-slate-700">
          <div className="flex items-center justify-between border-b border-gray-200 dark:border-slate-700 px-3 py-2">
            <p className="text-xs font-semibold text-slate-900 dark:text-white">
              Diff textuel (LCS)
            </p>
            <div className="flex items-center gap-3 text-[10px]">
              <span className="inline-flex items-center gap-1 text-[#006233]">
                <Plus className="h-3 w-3" /> {stats.added}
              </span>
              <span className="inline-flex items-center gap-1 text-[#892034]">
                <Minus className="h-3 w-3" /> {stats.removed}
              </span>
              <span className="inline-flex items-center gap-1 text-[#837274]">
                <Equal className="h-3 w-3" /> {stats.unchanged}
              </span>
            </div>
          </div>
          <pre className="max-h-[420px] overflow-auto p-0 text-[11px] leading-relaxed">
            {diff.map((line, idx) => {
              const cls =
                line.type === "add"
                  ? "bg-[#006233]/10 text-[#006233]"
                  : line.type === "del"
                    ? "bg-[#892034]/10 text-[#892034]"
                    : "text-[#837274]";
              const prefix = line.type === "add" ? "+ " : line.type === "del" ? "- " : "  ";
              return (
                <div key={idx} className={`whitespace-pre-wrap px-3 py-0.5 font-mono ${cls}`}>
                  {prefix}
                  {line.value || " "}
                </div>
              );
            })}
          </pre>
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-gray-300 dark:border-slate-700 p-4 text-center">
          <FileText className="mx-auto mb-2 h-5 w-5 text-[#837274]" />
          <p className="text-xs text-[#837274]">
            Diff textuel indisponible pour ces versions (contenu non extractible ou trop
            volumineux). Seules les métadonnées sont comparées.
          </p>
        </div>
      )}
    </div>
  );
}

export default VersionDiff;
