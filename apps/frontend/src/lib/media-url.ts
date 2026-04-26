/**
 * Renvoie l'URL telle quelle — depuis la migration cookie httpOnly
 * (ANSSI A.5.34 / OWASP A05), le navigateur attache automatiquement le
 * cookie `accessToken` aux requêtes same-origin (<img>, <video>,
 * window.open vers /api/...). Plus besoin d'exposer le JWT en query param.
 *
 * Conservé en helper pour ne pas casser les call-sites qui l'enroulent
 * autour des URLs media. Rétrocompat : si une session legacy a encore un
 * token en localStorage et pas de cookie, on le réinjecte une dernière fois
 * en query — le backend accepte les deux schémas via JwtStrategy.
 */
export function withAuthToken(url: string | null | undefined): string {
  if (!url) return '';
  if (typeof window === 'undefined') return url;
  const legacyToken = window.localStorage.getItem('accessToken');
  if (!legacyToken) return url;
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}token=${encodeURIComponent(legacyToken)}`;
}
