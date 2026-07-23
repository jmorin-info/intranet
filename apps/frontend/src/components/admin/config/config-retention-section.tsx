"use client";

import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Card, CardContent, CardHeader, Button, Skeleton } from "@omnitech/ui";
import { Archive, ExternalLink } from "lucide-react";
import Link from "next/link";

interface RetentionStats {
  archivable?: number;
  deletable?: number;
  archived?: number;
  deleted?: number;
}

/**
 * Vue synthèse de la rétention documentaire (ISO 27001 A.5.33).
 * Affiche les compteurs via /data-retention/stats et pointe vers la page dédiée.
 */
export function ConfigRetentionSection() {
  const [stats, setStats] = useState<RetentionStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get("/data-retention/stats")
      .then(({ data }) => setStats(data?.data || data || {}))
      .catch(() => setStats(null))
      .finally(() => setLoading(false));
  }, []);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Archive className="h-5 w-5 text-seal-navy dark:text-blue-400" />
            <h2 className="text-sm font-semibold text-seal-navy dark:text-white">
              Rétention documentaire
            </h2>
          </div>
          <Link href="/admin/audit/retention">
            <Button variant="outline" size="sm">
              <ExternalLink className="h-3.5 w-3.5" />
              Gérer la rétention
            </Button>
          </Link>
        </div>
        <p className="text-xs text-seal-gray-500 dark:text-slate-400 mt-1">
          Politique d&apos;archivage / suppression automatisée (ISO 27001 A.5.33)
        </p>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-16 rounded-xl" />
            ))}
          </div>
        ) : stats ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard label="Archivables" value={stats.archivable ?? 0} />
            <StatCard label="Supprimables" value={stats.deletable ?? 0} />
            <StatCard label="Archivés" value={stats.archived ?? 0} />
            <StatCard label="Supprimés" value={stats.deleted ?? 0} />
          </div>
        ) : (
          <p className="text-xs text-seal-gray-500 dark:text-slate-400">
            Rétention non disponible.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-gray-200 dark:border-slate-700 p-3">
      <p className="text-[10px] font-semibold text-seal-gray-500 dark:text-slate-400 uppercase mb-1">
        {label}
      </p>
      <p className="text-lg font-bold text-seal-navy dark:text-white">{value}</p>
    </div>
  );
}
