"use client";

import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, Badge } from "@omnitech/ui";
import { Flag } from "lucide-react";

interface AppConfigItem {
  id: string;
  key: string;
  value: string;
  description: string | null;
}

/**
 * Feature flags administrés via AppConfig (clés préfixées "feature.").
 * Toggles auto-save — aucune modification pending, état reflété immédiatement.
 */
export function ConfigFeatureFlagsSection() {
  const [flags, setFlags] = useState<AppConfigItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState<Record<string, boolean>>({});

  const fetchFlags = () => {
    setLoading(true);
    api
      .get("/config")
      .then(({ data }) => {
        const all: AppConfigItem[] = data?.data || data || [];
        setFlags(all.filter((c) => c.key.startsWith("feature.")));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchFlags();
  }, []);

  const handleToggle = async (flag: AppConfigItem) => {
    const newVal = flag.value === "true" ? "false" : "true";
    setPending((p) => ({ ...p, [flag.key]: true }));
    try {
      await api.patch(`/config/${flag.key}`, { value: newVal });
      toast.success(
        `${flag.key} : ${newVal === "true" ? "activé" : "désactivé"}`,
      );
      fetchFlags();
    } catch {
      toast.error(`Erreur de mise à jour ${flag.key}`);
    } finally {
      setPending((p) => ({ ...p, [flag.key]: false }));
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Flag className="h-5 w-5 text-seal-navy dark:text-blue-400" />
          <h2 className="text-sm font-semibold text-seal-navy dark:text-white">
            Feature flags
          </h2>
        </div>
        <p className="text-xs text-seal-gray-500 dark:text-slate-400 mt-1">
          Bascules fonctionnelles (clés{" "}
          <code className="font-mono">feature.*</code> de AppConfig)
        </p>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="h-12 animate-pulse rounded-lg bg-gray-100 dark:bg-slate-800"
              />
            ))}
          </div>
        ) : flags.length === 0 ? (
          <p className="text-xs text-seal-gray-500 dark:text-slate-400 py-4 text-center">
            Aucun feature flag configuré. Créez des clés préfixées{" "}
            <code className="font-mono">feature.</code> dans AppConfig pour les
            faire apparaître ici.
          </p>
        ) : (
          <div className="space-y-2">
            {flags.map((flag) => {
              const isOn = flag.value === "true";
              const isPending = pending[flag.key] ?? false;
              return (
                <div
                  key={flag.key}
                  className="flex items-center justify-between rounded-lg border border-gray-200 dark:border-slate-700 p-3"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-seal-navy dark:text-white font-mono">
                        {flag.key}
                      </p>
                      <Badge variant={isOn ? "success" : "draft"}>
                        {isOn ? "ON" : "OFF"}
                      </Badge>
                    </div>
                    {flag.description && (
                      <p className="text-xs text-seal-gray-500 dark:text-slate-400 mt-0.5">
                        {flag.description}
                      </p>
                    )}
                  </div>
                  <button
                    onClick={() => handleToggle(flag)}
                    disabled={isPending}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors disabled:opacity-50 ${
                      isOn ? "bg-primary" : "bg-gray-300 dark:bg-slate-600"
                    }`}
                    aria-label={`Basculer ${flag.key}`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        isOn ? "translate-x-6" : "translate-x-1"
                      }`}
                    />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
