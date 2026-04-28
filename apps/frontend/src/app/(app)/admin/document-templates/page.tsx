"use client";

/**
 * /admin/document-templates — page admin de gestion des templates docs.
 *
 * Stub temporaire — le composant complet sera réintroduit après alignement
 * avec le type Column<T> du DataTable de @omnitech/ui (key + render au lieu
 * de accessor). Voir worktree-agent-aa82b7046e34551c3 pour la version full.
 */

import { Card, CardContent } from "@omnitech/ui";

export default function AdminDocumentTemplatesPage() {
  return (
    <div className="container mx-auto px-4 py-6 max-w-5xl">
      <Card>
        <CardContent className="p-6 text-sm text-seal-gray-500 dark:text-slate-400">
          Page admin Templates documents — en cours de finalisation.
          L&apos;API backend est opérationnelle (
          <code>/api/v1/document-templates</code>) ; l&apos;interface UI sera
          réactivée dans la prochaine vague (alignement Column type).
        </CardContent>
      </Card>
    </div>
  );
}
