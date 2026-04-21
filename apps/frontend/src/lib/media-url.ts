/**
 * Ajoute le JWT courant comme query param `?token=...` à une URL servie par
 * un endpoint backend protégé par JwtStrategy. Nécessaire pour les <img>,
 * <video> et téléchargements (window.open) qui ne peuvent pas envoyer le
 * header Authorization: Bearer.
 *
 * Le backend (apps/backend/src/auth/strategies/jwt.strategy.ts::extractJwt)
 * accepte explicitement le token en query param pour ce cas d'usage.
 *
 * Retourne l'URL inchangée si pas de token (SSR ou non authentifié) : la
 * requête échouera en 401 côté navigateur, mais l'app ne plantera pas.
 */
export function withAuthToken(url: string | null | undefined): string {
  if (!url) return '';
  if (typeof window === 'undefined') return url;
  const token = window.localStorage.getItem('accessToken');
  if (!token) return url;
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}token=${encodeURIComponent(token)}`;
}
