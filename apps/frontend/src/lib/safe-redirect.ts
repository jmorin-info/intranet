/** Conserve uniquement les chemins de retour internes après authentification. */
export function safeRedirectPath(value: string | null | undefined): string {
  const fallback = "/dashboard";
  if (!value || !value.startsWith("/") || value.startsWith("//")) return fallback;
  if (/[\\\u0000-\u0020\u007f]/.test(value)) return fallback;

  // Refuser les séparateurs/contrôles encodés dans le chemin ; les query
  // params restent encodés et ne sont jamais interprétés comme destination.
  const path = value.split(/[?#]/, 1)[0] ?? "";
  if (/%(?:2f|5c|0[0-9a-f]|1[0-9a-f]|7f)/i.test(path)) return fallback;

  try {
    const base = "https://intranet.invalid";
    const target = new URL(value, base);
    if (target.origin !== base || target.pathname.startsWith("//")) return fallback;
    return `${target.pathname}${target.search}${target.hash}`;
  } catch {
    return fallback;
  }
}
