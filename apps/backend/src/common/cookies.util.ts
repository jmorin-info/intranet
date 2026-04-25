import type { CookieOptions, Response } from 'express';

/**
 * Centralised cookie options for the refresh token (ANSSI R16).
 *
 * Flags :
 *  - httpOnly: true                 → inaccessible via document.cookie (XSS).
 *  - secure: NODE_ENV==='production'→ HTTPS-only en prod (HTTP toléré en dev).
 *  - sameSite: 'strict'             → CSRF defense. Le refresh est uniquement
 *                                      déclenché par notre propre app via
 *                                      `/api/v1/auth/refresh` (XHR same-origin),
 *                                      jamais par un callback OAuth tiers, donc
 *                                      'strict' est plus sûr que 'lax' sans
 *                                      effet de bord.
 *  - path: '/api/v1/auth/refresh'   → cookie envoyé uniquement sur /refresh
 *                                      (et /logout via clearCookie ciblé).
 *  - maxAge: 7 jours                → cohérent avec le TTL refresh (7j).
 *  - domain: undefined              → host-only cookie (plus sûr que .domain).
 */
export const REFRESH_TOKEN_COOKIE_NAME = 'refreshToken';
export const REFRESH_TOKEN_COOKIE_PATH = '/api/v1/auth/refresh';
export const REFRESH_TOKEN_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export function getRefreshCookieOptions(): CookieOptions {
  const isProduction = process.env.NODE_ENV === 'production';
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'strict',
    path: REFRESH_TOKEN_COOKIE_PATH,
    maxAge: REFRESH_TOKEN_MAX_AGE_MS,
    // domain volontairement non défini → host-only cookie (ANSSI R16).
  };
}

export function setRefreshTokenCookie(res: Response, refreshToken: string): void {
  res.cookie(REFRESH_TOKEN_COOKIE_NAME, refreshToken, getRefreshCookieOptions());
}

export function clearRefreshTokenCookie(res: Response): void {
  res.clearCookie(REFRESH_TOKEN_COOKIE_NAME, {
    path: REFRESH_TOKEN_COOKIE_PATH,
  });
}
