"use client";

import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, Button, Badge } from "@omnitech/ui";
import { RefreshCw, Search, Database } from "lucide-react";

interface MeiliStats {
  available: boolean;
  enabled: boolean;
  indexes: Record<string, number>;
  error?: string;
}

interface ReindexResult {
  documents: number;
  tickets: number;
  wiki: number;
  news: number;
}

/**
 * Meilisearch : stats par index + bouton reindex + rafraîchissement.
 */
export function ConfigMeiliSection() {
  const [stats, setStats] = useState<MeiliStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [reindexing, setReindexing] = useState(false);
  const [reindexResult, setReindexResult] = useState<ReindexResult | null>(
    null,
  );

  const fetchStats = () => {
    setLoading(true);
    api
      .get("/search/stats")
      .then(({ data }) => setStats(data))
      .catch(() => setStats({ available: false, enabled: false, indexes: {} }))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchStats();
  }, []);

  const handleReindex = async () => {
    setReindexing(true);
    setReindexResult(null);
    try {
      const { data } = await api.post("/search/reindex");
      if (data.success) {
        toast.success(data.message || "Réindexation terminée");
        setReindexResult(data.indexed);
        fetchStats();
      } else {
        toast.error("Erreur de reindexation");
      }
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Erreur de reindexation");
    } finally {
      setReindexing(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Search className="h-5 w-5 text-seal-navy dark:text-blue-400" />
          <h2 className="text-sm font-semibold text-seal-navy dark:text-white">
            Meilisearch
          </h2>
          {stats && (
            <Badge variant={stats.available ? "success" : "error"}>
              {stats.available ? "Connecté" : "Hors ligne"}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-xs text-seal-gray-500 dark:text-slate-400 mb-4">
          Moteur de recherche federee pour l&apos;intranet. Indexe les
          documents, tickets, wiki et actualites.
        </p>

        {/* Stats */}
        {loading ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="h-16 animate-pulse rounded-xl bg-gray-100 dark:bg-slate-800"
              />
            ))}
          </div>
        ) : stats?.available ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            {Object.entries(stats.indexes).map(([name, count]) => (
              <div
                key={name}
                className="rounded-xl border border-gray-200 dark:border-slate-700 p-3"
              >
                <p className="text-[10px] font-semibold text-seal-gray-500 dark:text-slate-400 uppercase mb-1">
                  {name === "wiki"
                    ? "Wiki"
                    : name === "documents"
                      ? "Documents"
                      : name === "news"
                        ? "Actualites"
                        : name === "tickets"
                          ? "Tickets"
                          : name}
                </p>
                <div className="flex items-center gap-1.5">
                  <Database className="h-4 w-4 text-primary" />
                  <p className="text-sm font-semibold text-seal-navy dark:text-white">
                    {count >= 0 ? count : "N/A"}
                  </p>
                </div>
              </div>
            ))}
          </div>
        ) : stats && !stats.available ? (
          <div className="mb-4 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-xs text-red-700 dark:text-red-400">
            {stats.error || "Meilisearch non disponible"}
          </div>
        ) : null}

        {/* Reindex result */}
        {reindexResult && (
          <div className="mb-4 p-3 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 text-xs text-emerald-700 dark:text-emerald-400">
            <p className="font-semibold mb-1">Réindexation terminée</p>
            <div className="flex gap-3">
              <span>{reindexResult.wiki} wiki</span>
              <span>{reindexResult.documents} documents</span>
              <span>{reindexResult.news} actualites</span>
              <span>{reindexResult.tickets} tickets</span>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-2">
          <Button
            variant="primary"
            size="sm"
            onClick={handleReindex}
            loading={reindexing}
            disabled={reindexing}
          >
            <RefreshCw
              className={`h-4 w-4${reindexing ? " animate-spin" : ""}`}
            />
            Reindexer tout
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={fetchStats}
            disabled={loading}
          >
            <RefreshCw className={`h-4 w-4${loading ? " animate-spin" : ""}`} />
            Rafraichir les stats
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
