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

/**
 * Centralised cookie options for the access token (JWT) — ANSSI A.5.34, OWASP A05.
 *
 * Migration : le JWT vivait précédemment en `localStorage`, exposé à toute XSS.
 * Désormais il est posé en cookie httpOnly + SameSite=Strict. Le frontend
 * conserve `withCredentials: true` ; aucun JS n'a plus à lire le token.
 *
 * Flags :
 *  - httpOnly: true                     → inaccessible via document.cookie (XSS).
 *  - secure: NODE_ENV==='production'    → HTTPS-only en prod.
 *  - sameSite: 'strict'                 → CSRF defense (mêmes considérations
 *                                         que le refreshToken — l'app est
 *                                         same-origin via Nginx).
 *  - path: '/api'                       → cookie envoyé sur tous les endpoints
 *                                         API (le JWT sert pour TOUTES les
 *                                         requêtes authentifiées, pas seulement
 *                                         /auth/refresh).
 *  - maxAge: 15 min                     → cohérent avec le TTL access token.
 *  - domain: undefined                  → host-only cookie.
 */
export const ACCESS_TOKEN_COOKIE_NAME = 'accessToken';
export const ACCESS_TOKEN_COOKIE_PATH = '/api';
export const ACCESS_TOKEN_MAX_AGE_MS = 15 * 60 * 1000; // 15 minutes

export function getAccessCookieOptions(): CookieOptions {
  const isProduction = process.env.NODE_ENV === 'production';
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'strict',
    path: ACCESS_TOKEN_COOKIE_PATH,
    maxAge: ACCESS_TOKEN_MAX_AGE_MS,
  };
}

export function setAccessTokenCookie(res: Response, accessToken: string): void {
  res.cookie(ACCESS_TOKEN_COOKIE_NAME, accessToken, getAccessCookieOptions());
}

export function clearAccessTokenCookie(res: Response): void {
  res.clearCookie(ACCESS_TOKEN_COOKIE_NAME, {
    path: ACCESS_TOKEN_COOKIE_PATH,
  });
}
