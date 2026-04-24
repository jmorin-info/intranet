"use client";

import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Card, CardContent, CardHeader } from "@omnitech/ui";
import { Server, CheckCircle2, XCircle } from "lucide-react";

export interface SystemInfo {
  version?: string;
  database?: string;
  redis?: string;
  totalUsers?: number;
  totalDocuments?: number;
  uptime?: string;
  memoryUsage?: string;
  memoryRss?: string;
}

export interface ServiceHealth {
  status: "up" | "down" | "unknown";
  label: string;
}

export interface SyncTimes {
  ldap: string | null;
  veille: string | null;
}

export interface SystemInfoResult {
  systemInfo: SystemInfo | null;
  serviceHealthMap: Record<string, ServiceHealth>;
  lastSyncTimes: SyncTimes | null;
  loading: boolean;
}

/**
 * Hook qui récupère les infos système + santé des services + timestamps de sync.
 * Partagé entre ConfigSystemInfo et ConfigIntegrationsSection (pour healthKey badges).
 */
export function useSystemInfo(): SystemInfoResult {
  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null);
  const [serviceHealthMap, setServiceHealthMap] = useState<
    Record<string, ServiceHealth>
  >({});
  const [lastSyncTimes, setLastSyncTimes] = useState<SyncTimes | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      api.get("/health").catch(() => ({ data: {} })),
      api
        .get("/users", { params: { limit: 1 } })
        .catch(() => ({ data: { meta: {} } })),
      api
        .get("/documents", { params: { limit: 1 } })
        .catch(() => ({ data: { meta: {} } })),
      api.get("/health/stats").catch(() => ({ data: {} })),
    ])
      .then(([healthRes, usersRes, docsRes, statsRes]) => {
        const h = healthRes.data;
        const memBytes = h.memoryUsage?.rss || h.memory?.rss;
        const memMB = memBytes
          ? `${Math.round(memBytes / 1024 / 1024)} MB`
          : h.memoryUsage || undefined;
        setSystemInfo({
          version: h.version || h.appVersion || "N/A",
          database: h.database || h.db || (h.status === "ok" ? "OK" : "N/A"),
          redis: h.redis || (h.status === "ok" ? "OK" : "N/A"),
          totalUsers: usersRes.data?.meta?.total ?? undefined,
          totalDocuments: docsRes.data?.meta?.total ?? undefined,
          uptime: h.uptime || undefined,
          memoryUsage: memMB,
        });
        const svcMap: Record<string, ServiceHealth> = {};
        const svcData = h.services as Record<string, string> | undefined;
        if (svcData) {
          if (svcData.database)
            svcMap.database = {
              status: svcData.database === "up" ? "up" : "down",
              label: "PostgreSQL",
            };
          if (svcData.redis)
            svcMap.redis = {
              status: svcData.redis === "up" ? "up" : "down",
              label: "Redis",
            };
          if (svcData.smtp)
            svcMap.smtp = {
              status: svcData.smtp === "up" ? "up" : "down",
              label: "SMTP",
            };
          if (svcData.ldap)
            svcMap.ldap = {
              status: svcData.ldap === "up" ? "up" : "down",
              label: "LDAP",
            };
          if (svcData.storage)
            svcMap.storage = {
              status: svcData.storage === "up" ? "up" : "down",
              label: "Stockage",
            };
        } else {
          const dbOk =
            h.database === "OK" || h.database === "connected" || h.db === "OK";
          svcMap.database = {
            status: dbOk ? "up" : h.database ? "down" : "unknown",
            label: "PostgreSQL",
          };
          const redisOk = h.redis === "OK" || h.redis === "connected";
          svcMap.redis = {
            status: redisOk ? "up" : h.redis ? "down" : "unknown",
            label: "Redis",
          };
        }
        setServiceHealthMap(svcMap);
        const stats = statsRes.data;
        if (stats?.lastSyncTimes) {
          setLastSyncTimes(stats.lastSyncTimes);
        }
      })
      .finally(() => setLoading(false));
  }, []);

  return { systemInfo, serviceHealthMap, lastSyncTimes, loading };
}

interface ConfigSystemInfoProps {
  systemInfo: SystemInfo | null;
  loading: boolean;
}

/**
 * Cartes infos système (version, uptime, env, DB, Redis, users, documents, memory).
 */
export function ConfigSystemInfo({
  systemInfo,
  loading,
}: ConfigSystemInfoProps) {
  return (
    <Card className="shadow-sm rounded-xl animate-fade-in-up">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Server className="h-5 w-5 text-seal-navy dark:text-blue-400" />
          <h2 className="text-sm font-semibold text-seal-navy dark:text-white">
            Informations système
          </h2>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
            {Array.from({ length: 7 }).map((_, i) => (
              <div
                key={i}
                className="h-16 animate-pulse rounded-xl bg-gray-100 dark:bg-slate-800"
              />
            ))}
          </div>
        ) : systemInfo ? (
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
            <InfoCard label="Version" value={systemInfo.version || "N/A"} />
            <StatusCard
              label="Base de données"
              value={systemInfo.database || "N/A"}
              ok={
                systemInfo.database === "OK" ||
                systemInfo.database === "connected"
              }
            />
            <StatusCard
              label="Redis"
              value={systemInfo.redis || "N/A"}
              ok={systemInfo.redis === "OK" || systemInfo.redis === "connected"}
            />
            <InfoCard
              label="Utilisateurs"
              value={systemInfo.totalUsers ?? "N/A"}
            />
            <InfoCard
              label="Documents"
              value={systemInfo.totalDocuments ?? "N/A"}
            />
            <InfoCard label="Uptime" value={systemInfo.uptime || "N/A"} />
            <InfoCard label="Mémoire" value={systemInfo.memoryUsage || "N/A"} />
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function InfoCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-gray-200 dark:border-slate-700 p-3">
      <p className="text-[10px] font-semibold text-seal-gray-500 dark:text-slate-400 uppercase mb-1">
        {label}
      </p>
      <p className="text-sm font-semibold text-seal-navy dark:text-white">
        {value}
      </p>
    </div>
  );
}

function StatusCard({
  label,
  value,
  ok,
}: {
  label: string;
  value: string;
  ok: boolean;
}) {
  return (
    <div className="rounded-xl border border-gray-200 dark:border-slate-700 p-3">
      <p className="text-[10px] font-semibold text-seal-gray-500 dark:text-slate-400 uppercase mb-1">
        {label}
      </p>
      <div className="flex items-center gap-1.5">
        {ok ? (
          <CheckCircle2 className="h-4 w-4 text-emerald-500" />
        ) : (
          <XCircle className="h-4 w-4 text-red-500" />
        )}
        <p className="text-sm font-semibold text-seal-navy dark:text-white">
          {value}
        </p>
      </div>
    </div>
  );
}
