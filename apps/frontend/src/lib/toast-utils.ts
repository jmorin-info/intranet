import { toast } from 'sonner';
import { t } from '@/lib/i18n';

/**
 * Standardized toast wrapper for the OMNITECH intranet.
 *
 * Purpose:
 *  - Enforce i18n for all user-facing messages
 *  - Consistent tone and formatting
 *  - Sanitize error messages (never expose raw API errors)
 *  - Single import instead of `toast` + `t` everywhere
 *
 * Usage:
 *   showToast('success', 'documents.saved')              // i18n key
 *   showToast('error', 'documents.saveFailed')            // i18n key
 *   showToast('success', null, 'Vue sauvegardée')         // fallback literal
 *   showToast('error', null, undefined, err)               // from caught error
 */

type ToastType = 'success' | 'error' | 'info' | 'warning';

export function showToast(
  type: ToastType,
  i18nKey?: string | null,
  fallbackMessage?: string,
  error?: unknown,
) {
  let message: string;

  if (i18nKey) {
    message = t(i18nKey);
  } else if (fallbackMessage) {
    message = fallbackMessage;
  } else if (error) {
    // Sanitize: never expose raw API error details to users
    const raw = error instanceof Error ? error.message : String(error);
    // If the error looks like a user-friendly message (short, no stack trace), use it
    message = raw.length < 120 && !raw.includes('\n') ? raw : t('common.genericError');
  } else {
    message = t('common.genericError');
  }

  switch (type) {
    case 'success':
      toast.success(message);
      break;
    case 'error':
      toast.error(message);
      break;
    case 'info':
      toast.info(message);
      break;
    case 'warning':
      toast.warning(message);
      break;
  }
}

/**
 * Shorthand helpers for the most common patterns.
 */
export const toastSuccess = (i18nKey: string) => showToast('success', i18nKey);
export const toastError = (i18nKey: string) => showToast('error', i18nKey);
export const toastFromError = (err: unknown) => showToast('error', null, undefined, err);
