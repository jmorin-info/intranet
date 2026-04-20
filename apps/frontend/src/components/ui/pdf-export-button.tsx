'use client';

import { useState } from 'react';
import { FileText, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { generateSignedPdf, type SignedPdfRequest } from '@/lib/export-pdf';
import { useTranslation } from '@/lib/i18n';

interface Props {
  payload: SignedPdfRequest | (() => SignedPdfRequest);
  label?: string;
  className?: string;
  disabled?: boolean;
}

/**
 * Bouton générique "Exporter en PDF signé". Traçabilité audit.
 *
 * Affiche un toast de succès avec l'ID d'export et les 8 premiers
 * caractères du hash SHA-256 pour preuve.
 */
export function PdfExportButton({ payload, label = 'Exporter PDF signé', className, disabled }: Props) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);

  const handleClick = async () => {
    setLoading(true);
    try {
      const resolved = typeof payload === 'function' ? payload() : payload;
      const { exportId, hash } = await generateSignedPdf(resolved);
      toast.success(t('component.pdfExport.success'), {
        description: `Export ${exportId.slice(0, 8)} • SHA-256 ${hash.slice(0, 12)}…`,
      });
    } catch (err: any) {
      toast.error(t('component.pdfExport.error'), {
        description: err?.response?.data?.message || err?.message || 'Erreur inconnue',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled || loading}
      className={
        className ||
        'inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-medium text-seal-navy dark:text-white hover:bg-gray-50 dark:hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition'
      }
    >
      {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />}
      {label}
    </button>
  );
}
