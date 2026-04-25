/**
 * Wrapper toast Noa-compatible. Utilise `sonner` (déjà standardisé dans
 * `lib/toast-utils.ts`). Si Noa active sur la route courante, réécrit le
 * message succès. Autres niveaux (error/warning/info) restent intouchés —
 * on ne joue pas avec les erreurs.
 */

import { toast } from 'sonner';
import { noa } from './index';

export const noaToast = {
  /**
   * Toast succès — réécrit via Noa si active. Pour les erreurs / warnings,
   * utiliser directement `toast.error(...)` ou `showToast('error', ...)` :
   * Noa n'a aucune raison de blaguer sur un échec.
   */
  success(message: string): void {
    toast.success(noa(message, 'success'));
  },
};
