/**
 * Utilitaires de génération de slug intelligents pour toutes les ressources
 * qui ont besoin d'une URL lisible (chartes, wiki, news, runbooks, etc.).
 *
 * Règles communes :
 *  - normalisation Unicode (retrait des accents : "é" → "e")
 *  - minuscules
 *  - séparateur tiret ("ma charte" → "ma-charte")
 *  - caractères non [a-z0-9-] remplacés par rien
 *  - troncature configurable (défaut 80 chars)
 *  - tirets consécutifs compactés, tirets de début/fin supprimés
 *  - unicité garantie via callback externe (ex: lookup DB) avec suffixe numérique
 */

export interface SlugifyOptions {
  maxLength?: number;
  fallback?: string;
}

const DEFAULT_MAX = 80;

/**
 * Convertit une chaîne libre en slug propre (sans vérifier l'unicité).
 * Exemples :
 *   'Politique de sécurité — v2'   → 'politique-de-securite-v2'
 *   'Réponse à incident #42 !'     → 'reponse-a-incident-42'
 *   '   '                           → '' (ou options.fallback si défini)
 */
export function slugify(input: string, options: SlugifyOptions = {}): string {
  const maxLength = options.maxLength ?? DEFAULT_MAX;
  if (!input || typeof input !== 'string') {
    return options.fallback ?? '';
  }
  const normalized = input
    .normalize('NFD') // décompose accents
    .replace(/[\u0300-\u036f]/g, '') // retire diacritiques
    .toLowerCase()
    .trim();

  let slug = normalized
    .replace(/[_\s]+/g, '-') // underscores et espaces comme séparateurs
    .replace(/[^a-z0-9-]/g, '') // alphanum + tirets seulement
    .replace(/-+/g, '-') // tirets multiples → 1 tiret
    .replace(/^-+|-+$/g, '') // trim tirets
    .slice(0, maxLength)
    .replace(/-+$/g, ''); // re-trim après troncature

  if (!slug) {
    slug = options.fallback ?? '';
  }

  return slug;
}

/**
 * Génère un slug unique en appelant `isTaken(candidate)` tant que le slug
 * proposé est déjà pris. Ajoute `-2`, `-3`, ... comme suffixe.
 *
 * @param title     Titre source (ex: 'Politique de sécurité')
 * @param isTaken   Async callback qui retourne true si le slug existe déjà
 * @param options   { maxLength, fallback, maxAttempts }
 * @returns         slug unique (jamais vide)
 */
export async function generateUniqueSlug(
  title: string,
  isTaken: (candidate: string) => Promise<boolean>,
  options: SlugifyOptions & { maxAttempts?: number } = {},
): Promise<string> {
  const maxAttempts = options.maxAttempts ?? 100;
  const base = slugify(title, { ...options, fallback: options.fallback ?? 'untitled' });

  if (!(await isTaken(base))) {
    return base;
  }

  // Tronquer la base pour laisser place au suffixe
  const maxLen = options.maxLength ?? DEFAULT_MAX;
  for (let i = 2; i <= maxAttempts; i++) {
    const suffix = `-${i}`;
    const trimmed = base.slice(0, Math.max(1, maxLen - suffix.length)).replace(/-+$/g, '');
    const candidate = `${trimmed}${suffix}`;
    if (!(await isTaken(candidate))) {
      return candidate;
    }
  }

  // Fallback extrême : timestamp court
  const ts = Date.now().toString(36);
  const trimmedBase = base.slice(0, Math.max(1, maxLen - ts.length - 1));
  return `${trimmedBase}-${ts}`;
}
