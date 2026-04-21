'use client';

import { useState } from 'react';
import { Download, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { downloadFromApi } from '@/lib/download';

interface ExportCsvButtonProps {
  /** Chemin backend relatif (ex: `/users/export/csv`). Le client ajoute le préfixe API. */
  endpoint: string;
  /** Prefix du nom de fichier côté client (un horodatage sera ajouté). */
  filename: string;
  /** Filtres transmis au backend comme query params. */
  params?: Record<string, unknown>;
  label?: string;
  disabled?: boolean;
  className?: string;
  /** Callback optionnel après succès (ex: toast custom, analytics). */
  onSuccess?: () => void;
}

function stampFilename(prefix: string): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const date = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
  const time = `${pad(now.getHours())}${pad(now.getMinutes())}`;
  return `${prefix}_${date}_${time}.csv`;
}

/**
 * Bouton "Exporter CSV" qui délègue la génération au backend (endpoint
 * authentifié + RBAC + audit log ISO 27001 A.5.10). Utilise downloadFromApi
 * pour conserver le JWT dans le header, jamais dans l'URL.
 */
export function ExportCsvButton({
  endpoint,
  filename,
  params,
  label = 'Exporter CSV',
  disabled,
  className,
  onSuccess,
}: ExportCsvButtonProps) {
  const [loading, setLoading] = useState(false);

  const handleExport = async () => {
    if (loading || disabled) return;
    setLoading(true);
    try {
      await downloadFromApi(endpoint, stampFilename(filename), params);
      toast.success('Export généré');
      onSuccess?.();
    } catch (err) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status === 403) toast.error('Export refusé (droits insuffisants)');
      else if (status === 413) toast.error('Export trop volumineux (> 10 000 lignes) — affinez les filtres');
      else toast.error("Erreur lors de l'export");
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleExport}
      disabled={loading || disabled}
      className={
        className ||
        'inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-medium text-seal-navy dark:text-white hover:bg-gray-50 dark:hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F9964A]'
      }
      aria-busy={loading}
    >
      {loading ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
      ) : (
        <Download className="h-3.5 w-3.5" aria-hidden="true" />
      )}
      {label}
    </button>
  );
}
