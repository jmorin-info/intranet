/**
 * Messages d'erreur IA différenciés (fix 2026-07).
 *
 * Avant : tous les catch autour des appels IA affichaient un générique
 * « IA non disponible actuellement » — impossible pour l'utilisateur de
 * distinguer un 403 (habilitations), un 429 (throttle 5/min sur le résumé)
 * ou un vrai timeout/surcharge du moteur LLM (503).
 *
 * Utilisé par use-document-detail.ts, ai-chatbot.tsx et ai-search-modal.tsx.
 */

interface AiErrorShape {
  name?: string;
  code?: string;
  message?: string;
  response?: { status?: number; data?: { message?: string } };
}

export const AI_ERROR_MESSAGES = {
  forbidden:
    "Accès restreint : vos habilitations ne permettent pas d'utiliser l'IA sur ce contenu.",
  rateLimited: "Trop de requêtes IA — réessayez dans une minute.",
  overloaded: "L'IA est momentanément surchargée — réessayez dans quelques minutes.",
  generic: "IA non disponible actuellement. Réessayez dans quelques instants.",
} as const;

/**
 * Traduit une erreur (axios ou fetch) en message utilisateur actionnable.
 * Le message backend (response.data.message) est prioritaire pour 403 :
 * il précise le contexte (classification du document).
 */
export function aiErrorMessage(err: unknown, fallback: string = AI_ERROR_MESSAGES.generic): string {
  const e = (err ?? {}) as AiErrorShape;
  const status = e.response?.status;
  const backendMessage = e.response?.data?.message;

  if (status === 403) return backendMessage || AI_ERROR_MESSAGES.forbidden;
  if (status === 429) return AI_ERROR_MESSAGES.rateLimited;
  if (status === 503 || status === 504) return AI_ERROR_MESSAGES.overloaded;
  // Timeout axios (ECONNABORTED) ou fetch avorté par timeout côté client.
  if (e.code === "ECONNABORTED" || /timeout/i.test(e.message ?? "")) {
    return AI_ERROR_MESSAGES.overloaded;
  }
  return fallback;
}
