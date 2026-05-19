import { getThemeCss } from "@/lib/cms-theme";

/**
 * Injecte les overrides CSS issus du bloc CMS `theme.tokens` dans le `<head>`.
 *
 * - Rendu côté serveur via `getThemeCss()` (cache `unstable_cache` 5 min,
 *   géré dans `lib/cms.ts`).
 * - Le CSS est blacklistable en stricte : seules les CSS vars whitelistées
 *   peuvent être surchargées (cf. `cms-theme.ts`). Pas de risque d'injection.
 * - Doit être placé APRÈS l'import de `globals.css` dans le layout pour
 *   l'emporter par cascade.
 */
export async function ThemeStyles({ nonce }: { nonce?: string }) {
  const css = await getThemeCss();
  if (!css) return null;
  return (
    <style
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{ __html: css }}
      nonce={nonce}
      data-cms-theme="true"
    />
  );
}
