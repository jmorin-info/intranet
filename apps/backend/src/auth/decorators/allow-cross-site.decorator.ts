import { SetMetadata } from '@nestjs/common';

/**
 * Marque une route comme autorisée à être appelée depuis un contexte cross-site
 * (Sec-Fetch-Site=cross-site). Utilisé par `SecFetchSiteGuard` pour bypasser la
 * vérification sur :
 *  - /auth/login (peut venir d'un IdP SSO externe)
 *  - webhooks externes (DocuSeal, etc.)
 *
 * Utiliser avec parcimonie — chaque opt-out élargit la surface CSRF.
 */
export const ALLOW_CROSS_SITE_KEY = 'allowCrossSite';
export const AllowCrossSite = () => SetMetadata(ALLOW_CROSS_SITE_KEY, true);
