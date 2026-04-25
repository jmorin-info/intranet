/**
 * Wrapper autour de `zodResolver` (react-hook-form / @hookform/resolvers) qui
 * réécrit chaque message d'erreur via `noa(...)` en catégorie 'zod'.
 *
 * Usage :
 *   import { noaZodResolver } from '@/lib/noa/zod-resolver';
 *   useForm({ resolver: noaZodResolver(myZodSchema), ... });
 *
 * Sécurité :
 *  - Si Noa n'est pas active (flag global OFF, user OFF, route hors whitelist
 *    ou route blacklistée — ex: /auth/login), `noa()` est un no-op et renvoie
 *    le message d'origine. Donc PAS de blague sur l'écran de login.
 *  - Aucun champ avec `id` matchant /password|mfa|otp|token/i n'est filtré
 *    (defense en profondeur — même si la route le permettait, on ne touche
 *    pas aux erreurs sécurité).
 */

import type { ZodSchema } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { noa } from './index';

const SECURITY_FIELD_RE = /password|mfa|otp|token|secret|backup[_-]?code/i;

function shouldBypassField(fieldName: string): boolean {
  return SECURITY_FIELD_RE.test(fieldName);
}

/**
 * Wrap un schéma Zod en injectant Noa sur les `message` retournés.
 * Conserve la signature exacte de `zodResolver` pour rester compatible
 * avec l'inférence de types côté react-hook-form (`useForm<MyForm>`).
 *
 * On ne re-type pas le retour : on s'appuie sur le type inféré de
 * `zodResolver(schema)` et on emballe son résultat sans changer sa forme.
 */
export function noaZodResolver<T extends ZodSchema>(schema: T) {
  const base = zodResolver(schema);
  // On respecte la signature exacte de `base` (Resolver<z.infer<T>>) pour
  // garder l'inférence côté useForm — sinon RHF râle "Type 'Resolver<unknown>'
  // is not assignable to Resolver<MyForm>".
  const wrapped: typeof base = (async (values, context, options) => {
    const result = await base(values, context, options);
    if (!result.errors || Object.keys(result.errors).length === 0) {
      return result;
    }

    const rewritten: Record<string, unknown> = {};
    for (const [key, err] of Object.entries(
      result.errors as Record<string, unknown>,
    )) {
      if (!err || typeof err !== 'object') {
        rewritten[key] = err;
        continue;
      }
      const errObj = err as { message?: string; type?: string };
      if (typeof errObj.message === 'string' && !shouldBypassField(key)) {
        rewritten[key] = { ...errObj, message: noa(errObj.message, 'zod') };
      } else {
        rewritten[key] = err;
      }
    }

    return { ...result, errors: rewritten as typeof result.errors };
  }) as typeof base;

  return wrapped;
}
