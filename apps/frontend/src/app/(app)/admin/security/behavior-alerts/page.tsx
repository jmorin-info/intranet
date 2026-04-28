"use client";

/**
 * /admin/security/behavior-alerts — UEBA alertes (RSSI).
 *
 * Stub temporaire — page complète disponible dans worktree D4 (a5e0dc596).
 * À réintégrer après alignement Button variant + EmptyState icon types.
 */

import { Card, CardContent } from "@omnitech/ui";

export default function BehaviorAlertsPage() {
  return (
    <div className="container mx-auto px-4 py-6 max-w-6xl">
      <Card>
        <CardContent className="p-6 text-sm text-seal-gray-500 dark:text-slate-400">
          Page UEBA — alertes comportementales — en cours de finalisation.
          Backend opérationnel : 8 règles R001-R008 actives via cron 5min,
          endpoints <code>/api/v1/admin/behavior-alerts</code>. Page UI
          réactivée dans la prochaine vague.
        </CardContent>
      </Card>
    </div>
  );
}
