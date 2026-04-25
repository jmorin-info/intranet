import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { ALLOW_CROSS_SITE_KEY } from './decorators/allow-cross-site.decorator';

/**
 * SecFetchSiteGuard — defense in depth contre les attaques CSRF / cross-site.
 *
 * Sur les méthodes mutantes (POST/PUT/PATCH/DELETE), vérifie l'en-tête
 * `Sec-Fetch-Site` (Fetch Metadata Request Headers, supporté par tous les
 * navigateurs récents). Refuse les requêtes `cross-site` qui ne ciblent pas
 * une route explicitement opt-in via `@AllowCrossSite()`.
 *
 * Valeurs acceptées :
 *  - `same-origin` (XHR de notre app)               → OK
 *  - `same-site`   (sous-domaine du même eTLD+1)    → OK
 *  - `none`        (navigation directe / typed URL) → OK
 *  - en-tête absent (vieux navigateur, curl, tests) → OK
 *  - `cross-site`                                   → REJETÉ (sauf opt-in)
 *
 * Mode `enforce` piloté par `SEC_FETCH_SITE_ENFORCE` :
 *   - `true`  → rejette avec 403
 *   - `false` (default en dev) → log-only, ne casse pas les requêtes
 *
 * Référence : https://www.w3.org/TR/fetch-metadata/
 */
@Injectable()
export class SecFetchSiteGuard implements CanActivate {
  private readonly logger = new Logger(SecFetchSiteGuard.name);
  private readonly enforce: boolean;
  private static readonly MUTATING_METHODS = new Set([
    'POST',
    'PUT',
    'PATCH',
    'DELETE',
  ]);

  constructor(private readonly reflector: Reflector) {
    // Default :
    //  - prod  → enforce activé (sauf SEC_FETCH_SITE_ENFORCE=false explicite)
    //  - dev   → log-only (sauf SEC_FETCH_SITE_ENFORCE=true explicite)
    const raw = process.env.SEC_FETCH_SITE_ENFORCE;
    if (raw === undefined || raw === '') {
      this.enforce = process.env.NODE_ENV === 'production';
    } else {
      this.enforce = raw.toLowerCase() === 'true';
    }
  }

  canActivate(context: ExecutionContext): boolean {
    // Garder le HTTP-only : si on est sur un transport non-HTTP (ws, rpc), on
    // laisse passer. Les websockets sont gérés par leur propre adapter.
    if (context.getType() !== 'http') return true;

    const req = context.switchToHttp().getRequest<Request>();
    const method = (req.method || '').toUpperCase();

    // Méthodes "safe" (GET/HEAD/OPTIONS) : pas concernées par CSRF.
    if (!SecFetchSiteGuard.MUTATING_METHODS.has(method)) return true;

    // Opt-out explicite (login, webhooks).
    const allowCrossSite = this.reflector.getAllAndOverride<boolean>(
      ALLOW_CROSS_SITE_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (allowCrossSite) return true;

    const headerValue = req.headers['sec-fetch-site'];
    const secFetchSite = (Array.isArray(headerValue)
      ? headerValue[0]
      : headerValue || ''
    )
      .toString()
      .toLowerCase()
      .trim();

    // En-tête absent : vieux navigateur, curl, tests E2E, requêtes server-to-
    // server (webhooks DocuSeal/etc.). On laisse passer — ces requêtes ne
    // proviennent pas d'un contexte navigateur, donc CSRF n'est pas applicable.
    // Le JWT + SameSite cookie restent les protections primaires côté browser.
    // Pour bloquer les webhooks venant d'un domaine non-whitelisté, on s'appuie
    // sur la signature HMAC (cf. signatures/webhook.controller.ts).
    if (!secFetchSite) return true;

    // Valeurs sûres.
    if (
      secFetchSite === 'same-origin' ||
      secFetchSite === 'same-site' ||
      secFetchSite === 'none'
    ) {
      return true;
    }

    // À ce stade : `cross-site` (ou valeur inconnue future).
    const path = (req.originalUrl || req.url || '').split('?')[0];
    const ip =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      req.ip ||
      'unknown';
    const userAgent = (req.headers['user-agent'] as string) || 'unknown';

    if (this.enforce) {
      this.logger.warn(
        `[CSRF] Cross-site mutation BLOCKED: ${method} ${path} from ${ip} (UA="${userAgent}", Sec-Fetch-Site=${secFetchSite})`,
      );
      throw new ForbiddenException('Cross-site requests are not allowed');
    }

    this.logger.warn(
      `[CSRF] Cross-site mutation observed (log-only, SEC_FETCH_SITE_ENFORCE=false): ${method} ${path} from ${ip} (UA="${userAgent}", Sec-Fetch-Site=${secFetchSite})`,
    );
    return true;
  }
}
