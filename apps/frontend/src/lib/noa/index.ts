/**
 * Helper "Noa" — réécriture humoristique cadrée de certains messages d'UI.
 *
 * Architecture :
 *  - Source de vérité runtime :
 *      • feature flag global `feature.humor.noa` (AppConfig — exposé via /config)
 *      • flag user `noaEnabled` (User table — exposé via /auth/me)
 *      • route courante (whitelist d'inclusion + blacklist explicite)
 *  - Si l'une des conditions n'est pas remplie → renvoie le message original.
 *  - Sinon : pioche aléatoire pondérée dans `messages.ts`, avec 15% de
 *    chance de garder l'original (anti-monotonie).
 *
 * IMPORTANT — defensive design :
 *  - On utilise une whitelist statique des routes éligibles (`NOA_ALLOWED_ROUTES`).
 *  - Toute route non listée → bypass (message original).
 *  - On garde aussi une blacklist explicite (`NOA_BLOCKED_ROUTES`) qui prévaut
 *    sur la whitelist en cas de superposition (ex: `/profile/security` vs
 *    `/profile`).
 *  - Pas d'API. Pas de logger.error qui contienne du texte Noa (jamais de
 *    sarcasme dans un audit log ou une trace Sentry).
 */

import {
  type NoaCategory,
  type NoaMessage,
  noaMessagesByCategory,
} from './messages';

// ---------------------------------------------------------------------------
// Whitelist d'inclusion — Noa active SEULEMENT sur ces préfixes.
// ---------------------------------------------------------------------------
// Les routes hors whitelist bypass automatiquement (message original).
// Préfixe = startsWith(route, prefix) après normalisation (sans trailing /).
const NOA_ALLOWED_ROUTES: ReadonlyArray<string> = [
  '/dashboard',
  '/news',
  '/tickets',
  '/calendar',
  '/directory',
  '/files',
  '/media',
  '/tips',
  '/profile',
];

// ---------------------------------------------------------------------------
// Blacklist explicite — toujours bypass, même si dans la whitelist.
// ---------------------------------------------------------------------------
// Couvre les zones sensibles : auth, MFA, sécurité du profil, audit logs,
// incidents, conformité ISO, signatures réglementaires, trust public, légal,
// API. Cette liste prévaut sur la whitelist (ex: /profile/security).
const NOA_BLOCKED_ROUTES: ReadonlyArray<string> = [
  '/auth',
  '/mfa',
  '/profile/security',
  '/admin/audit-logs',
  '/admin/audit',
  '/admin/incidents',
  '/admin/compliance',
  '/admin/signatures',
  '/trust',
  '/legal',
  '/api',
  '/login',
  '/forgot-password',
  '/reset-password',
];

function normalizeRoute(route: string): string {
  if (!route) return '/';
  // Strip query/hash + trailing slash (sauf pour la racine).
  const noQuery = (route.split('?')[0] ?? route).split('#')[0] ?? route;
  if (noQuery.length > 1 && noQuery.endsWith('/')) return noQuery.slice(0, -1);
  return noQuery;
}

/**
 * Indique si une route est éligible au filtrage Noa.
 * Ordre : 1/ blacklist explicite (gagne) → 2/ whitelist (sinon bypass).
 */
export function isRouteAllowedForNoa(route: string | null | undefined): boolean {
  if (!route) return false;
  const r = normalizeRoute(route);
  for (const blocked of NOA_BLOCKED_ROUTES) {
    if (r === blocked || r.startsWith(blocked + '/')) return false;
  }
  for (const allowed of NOA_ALLOWED_ROUTES) {
    if (r === allowed || r.startsWith(allowed + '/')) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// État runtime — alimenté par les hooks React (cf. ./runtime.ts).
// ---------------------------------------------------------------------------
// On garde un store ultra-simple en module pour que `noa()` soit utilisable
// hors React (ex: dans un resolver Zod). Les hooks `useNoaProvider` (cf.
// runtime.ts) maintiennent ce store à jour à partir de l'auth-store et
// de la config /config (feature flag).
//
// État par défaut : tout désactivé. Tant que `useNoaProvider` n'a pas tourné,
// `noa()` est un no-op pur. C'est le comportement attendu en SSR aussi.
interface NoaRuntimeState {
  flagEnabled: boolean;
  userEnabled: boolean;
  pathname: string | null;
}

const state: NoaRuntimeState = {
  flagEnabled: false,
  userEnabled: false,
  pathname: null,
};

/** API interne — appelée uniquement par le hook `useNoaProvider`. */
export function setNoaRuntimeState(next: Partial<NoaRuntimeState>): void {
  if (next.flagEnabled !== undefined) state.flagEnabled = next.flagEnabled;
  if (next.userEnabled !== undefined) state.userEnabled = next.userEnabled;
  if (next.pathname !== undefined) state.pathname = next.pathname;
}

/** Helpers pour la sidebar / debug : Noa est-elle "potentiellement" active ? */
export function isNoaActiveForUser(): boolean {
  return state.flagEnabled === true && state.userEnabled === true;
}

/** Tient compte de la route courante en plus du flag/user. */
export function isNoaActiveHere(): boolean {
  return isNoaActiveForUser() && isRouteAllowedForNoa(state.pathname);
}

// ---------------------------------------------------------------------------
// Random pondéré
// ---------------------------------------------------------------------------
function pickWeighted(messages: ReadonlyArray<NoaMessage>): NoaMessage | null {
  if (messages.length === 0) return null;
  const total = messages.reduce((acc, m) => acc + (m.weight ?? 1), 0);
  let r = Math.random() * total;
  for (const m of messages) {
    r -= m.weight ?? 1;
    if (r <= 0) return m;
  }
  return messages[messages.length - 1] ?? null;
}

// ---------------------------------------------------------------------------
// API publique
// ---------------------------------------------------------------------------

/**
 * Si Noa est active pour l'utilisateur ET la route courante est éligible,
 * pioche un message du catalogue de la `category` demandée. Sinon renvoie
 * `originalMessage` tel quel.
 *
 * 15% de chance de garder l'original même quand active (anti-monotonie).
 *
 * Pas d'effet de bord (pas de log, pas d'API). Sûr à appeler dans un resolver
 * Zod ou un render React.
 */
export function noa(
  originalMessage: string,
  category: NoaCategory,
  _context?: { route?: string },
): string {
  // Bypass total si pas active : on évite même de toucher au PRNG pour ne
  // pas générer de bruit non-déterministe en SSR.
  if (!isNoaActiveForUser()) return originalMessage;

  // Route override (utile pour les composants qui connaissent leur route
  // sans dépendre de window). Sinon on retombe sur le pathname runtime.
  const route = _context?.route ?? state.pathname;
  if (!isRouteAllowedForNoa(route)) return originalMessage;

  // Anti-monotonie : 15% de chance de garder le message d'origine.
  if (Math.random() < 0.15) return originalMessage;

  const candidates = noaMessagesByCategory[category];
  const picked = pickWeighted(candidates);
  return picked ? picked.text : originalMessage;
}

export type { NoaCategory, NoaMessage } from './messages';
