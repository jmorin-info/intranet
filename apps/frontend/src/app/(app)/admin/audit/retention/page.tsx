"use client";

/**
 * Page : Rétention & anonymisation des journaux d'audit (RGPD).
 *
 * Item 29 — Wave B post-launch. Affiche la politique active, les compteurs
 * actuels, et permet de :
 *   - éditer fullDays / anonymizedDays (PATCH /audit/retention)
 *   - lancer une anonymisation manuelle (POST /audit/anonymize-now)
 *
 * Justification RGPD :
 *   - Article 5(c) — minimisation des données
 *   - Article 17 — droit à l'effacement
 *
 * Charte graphique : seal-* (bleu marine OMNITECH Security).
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ShieldCheck, RefreshCw, Save, PlayCircle, AlertTriangle, Info, Lock } from "lucide-react";
import { UserRole } from "@omnitech/shared";
import { Button, Card, CardContent, CardHeader, Input, ConfirmDialog } from "@omnitech/ui";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { PageHeader } from "@/components/layout/page-header";
import { RoleGuard } from "@/components/role-guard";
import { AdminGroupTabs } from "@/components/layout/admin-group-tabs";
import { useTranslation } from "@/lib/i18n";
import { formatDateTime } from "@/lib/utils";

interface RetentionPolicy {
  fullDays: number | null;
  anonymizedDays: number | null;
  lastRunAt: string | null;
}

interface RetentionStats {
  policy: RetentionPolicy;
  auditLogsToAnonymize: number;
  auditLogsToDelete: number;
  cutoffs: { fullDays: string | null; anonymizedDays: string | null };
}

interface AnonymizeResult {
  anonymizedCount: number;
  deletedCount: number;
  durationMs: number;
  errors: Array<{ id: string; error: string }>;
}

const NEVER_TOKEN = "NEVER";

function formatDays(value: number | null): string {
  return value === null ? NEVER_TOKEN : String(value);
}

function parseDaysInput(raw: string): number | null | undefined {
  const trimmed = raw.trim();
  if (trimmed === "") return undefined;
  if (trimmed.toUpperCase() === NEVER_TOKEN) return null;
  const parsed = parseInt(trimmed, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return undefined;
  return parsed;
}

export default function AdminAuditRetentionPage() {
  const { t } = useTranslation();
  const [stats, setStats] = useState<RetentionStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [fullDaysInput, setFullDaysInput] = useState("");
  const [anonDaysInput, setAnonDaysInput] = useState("");
  const [runConfirmOpen, setRunConfirmOpen] = useState(false);
  const [lastRunResult, setLastRunResult] = useState<AnonymizeResult | null>(null);

  const fetchStats = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get<RetentionStats>("/audit/retention");
      setStats(data);
      setFullDaysInput(formatDays(data.policy.fullDays));
      setAnonDaysInput(formatDays(data.policy.anonymizedDays));
    } catch (e) {
      console.error("Failed to fetch retention stats", e);
      toast.error(t("admin.audit.retention.errors.load") as string);
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  const policyDirty = useMemo(() => {
    if (!stats) return false;
    return (
      formatDays(stats.policy.fullDays) !== fullDaysInput.trim() ||
      formatDays(stats.policy.anonymizedDays) !== anonDaysInput.trim()
    );
  }, [stats, fullDaysInput, anonDaysInput]);

  const validation = useMemo(() => {
    const full = parseDaysInput(fullDaysInput);
    const anon = parseDaysInput(anonDaysInput);
    if (full === undefined && fullDaysInput.trim() !== "") {
      return t("admin.audit.retention.errors.invalidFull") as string;
    }
    if (anon === undefined && anonDaysInput.trim() !== "") {
      return t("admin.audit.retention.errors.invalidAnon") as string;
    }
    if (
      full !== null &&
      full !== undefined &&
      anon !== null &&
      anon !== undefined &&
      full >= anon
    ) {
      return t("admin.audit.retention.errors.fullGteAnon") as string;
    }
    return null;
  }, [fullDaysInput, anonDaysInput, t]);

  const handleSave = useCallback(async () => {
    if (validation) {
      toast.error(validation);
      return;
    }
    setSaving(true);
    try {
      const body: Record<string, number | null | string> = {};
      const full = parseDaysInput(fullDaysInput);
      const anon = parseDaysInput(anonDaysInput);
      if (full !== undefined) body.fullDays = full === null ? NEVER_TOKEN : full;
      if (anon !== undefined) body.anonymizedDays = anon === null ? NEVER_TOKEN : anon;
      await api.patch("/audit/retention", body);
      toast.success(t("admin.audit.retention.saveSuccess") as string);
      await fetchStats();
    } catch (e: unknown) {
      const message = (e as { response?: { data?: { message?: string } } }).response?.data?.message;
      toast.error(message || (t("admin.audit.retention.errors.save") as string));
    } finally {
      setSaving(false);
    }
  }, [fullDaysInput, anonDaysInput, validation, t, fetchStats]);

  const handleRunNow = useCallback(() => {
    setRunConfirmOpen(true);
  }, []);

  const confirmRunNow = useCallback(async () => {
    setRunConfirmOpen(false);
    setRunning(true);
    try {
      const { data } = await api.post<AnonymizeResult>("/audit/anonymize-now", {});
      setLastRunResult(data);
      toast.success(
        (t("admin.audit.retention.runSuccess") as string).replace(
          "{anonymized}",
          String(data.anonymizedCount),
        ),
      );
      await fetchStats();
    } catch (e: unknown) {
      const message = (e as { response?: { data?: { message?: string } } }).response?.data?.message;
      toast.error(message || (t("admin.audit.retention.errors.run") as string));
    } finally {
      setRunning(false);
    }
  }, [t, fetchStats]);

  return (
    <RoleGuard minRole={UserRole.SUPER_ADMIN}>
      <div className="p-6 space-y-6 bg-gray-50 dark:bg-slate-950 min-h-screen">
        <AdminGroupTabs group="audit" />

        <PageHeader
          title={t("admin.audit.retention.title") as string}
          subtitle={t("admin.audit.retention.subtitle") as string}
          icon={ShieldCheck}
          hub="admin"
        />

        {/* Bandeau RGPD informatif */}
        <div className="rounded-card border border-blue-200 bg-blue-50 dark:border-blue-900/40 dark:bg-blue-900/10 px-4 py-3 text-sm flex gap-3">
          <Info className="h-5 w-5 flex-shrink-0 text-blue-600 dark:text-blue-400 mt-0.5" />
          <div className="space-y-1">
            <p className="text-seal-navy dark:text-white font-semibold">
              {t("admin.audit.retention.rgpdTitle") as string}
            </p>
            <p className="text-seal-gray-500 dark:text-slate-400 text-xs">
              {t("admin.audit.retention.rgpdDesc") as string}
            </p>
          </div>
        </div>

        {/* Compteurs actuels */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-seal-navy dark:text-white flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-seal-navy dark:text-blue-400" />
                {t("admin.audit.retention.statsTitle") as string}
              </h2>
              <Button variant="outline" size="sm" onClick={fetchStats} disabled={loading}>
                <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
                {t("common.refresh") as string}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div
                    key={i}
                    className="h-20 animate-pulse rounded-xl bg-gray-100 dark:bg-slate-800"
                  />
                ))}
              </div>
            ) : stats ? (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <StatCard
                  label={t("admin.audit.retention.toAnonymize") as string}
                  value={stats.auditLogsToAnonymize}
                />
                <StatCard
                  label={t("admin.audit.retention.toDelete") as string}
                  value={stats.auditLogsToDelete}
                />
                <StatCard
                  label={t("admin.audit.retention.fullDays") as string}
                  value={formatDays(stats.policy.fullDays)}
                />
                <StatCard
                  label={t("admin.audit.retention.anonymizedDays") as string}
                  value={formatDays(stats.policy.anonymizedDays)}
                />
              </div>
            ) : (
              <p className="text-xs text-seal-gray-500 dark:text-slate-400">
                {t("admin.audit.retention.errors.load") as string}
              </p>
            )}
            {stats?.policy.lastRunAt ? (
              <p className="mt-3 text-xs text-seal-gray-500 dark:text-slate-400">
                {t("admin.audit.retention.lastRun") as string}{" "}
                <strong className="text-seal-navy dark:text-white">
                  {formatDateTime(new Date(stats.policy.lastRunAt))}
                </strong>
              </p>
            ) : null}
          </CardContent>
        </Card>

        {/* Édition de la politique */}
        <Card>
          <CardHeader>
            <h2 className="text-sm font-semibold text-seal-navy dark:text-white flex items-center gap-2">
              <Lock className="h-5 w-5 text-seal-navy dark:text-blue-400" />
              {t("admin.audit.retention.policyTitle") as string}
            </h2>
            <p className="text-xs text-seal-gray-500 dark:text-slate-400 mt-1">
              {t("admin.audit.retention.policyHint") as string}
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <label className="block text-sm">
                <span className="block font-medium text-seal-navy dark:text-white mb-1">
                  {t("admin.audit.retention.fullDaysLabel") as string}
                </span>
                <Input
                  type="text"
                  inputMode="numeric"
                  value={fullDaysInput}
                  onChange={(e) => setFullDaysInput(e.target.value)}
                  placeholder="90"
                  aria-label={t("admin.audit.retention.fullDaysLabel") as string}
                />
                <span className="block mt-1 text-xs text-seal-gray-500 dark:text-slate-400">
                  {t("admin.audit.retention.fullDaysHelp") as string}
                </span>
              </label>
              <label className="block text-sm">
                <span className="block font-medium text-seal-navy dark:text-white mb-1">
                  {t("admin.audit.retention.anonymizedDaysLabel") as string}
                </span>
                <Input
                  type="text"
                  inputMode="numeric"
                  value={anonDaysInput}
                  onChange={(e) => setAnonDaysInput(e.target.value)}
                  placeholder="730"
                  aria-label={t("admin.audit.retention.anonymizedDaysLabel") as string}
                />
                <span className="block mt-1 text-xs text-seal-gray-500 dark:text-slate-400">
                  {t("admin.audit.retention.anonymizedDaysHelp") as string}
                </span>
              </label>
            </div>
            {validation ? (
              <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 dark:border-red-900/40 dark:bg-red-900/10 p-3 text-xs text-red-700 dark:text-red-300">
                <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                <span>{validation}</span>
              </div>
            ) : null}
            <div className="flex items-center justify-end gap-2">
              <Button
                variant="primary"
                onClick={handleSave}
                disabled={saving || !policyDirty || validation !== null}
              >
                <Save className="h-3.5 w-3.5" />
                {saving
                  ? (t("common.loading") as string)
                  : (t("admin.audit.retention.save") as string)}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Action manuelle */}
        <Card>
          <CardHeader>
            <h2 className="text-sm font-semibold text-seal-navy dark:text-white flex items-center gap-2">
              <PlayCircle className="h-5 w-5 text-seal-navy dark:text-blue-400" />
              {t("admin.audit.retention.runNowTitle") as string}
            </h2>
            <p className="text-xs text-seal-gray-500 dark:text-slate-400 mt-1">
              {t("admin.audit.retention.runNowHint") as string}
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-seal-gray-500 dark:text-slate-400">
                {t("admin.audit.retention.runNowExplain") as string}
              </span>
              <Button variant="outline" onClick={handleRunNow} disabled={running}>
                <PlayCircle className={`h-3.5 w-3.5 ${running ? "animate-spin" : ""}`} />
                {running
                  ? (t("admin.audit.retention.running") as string)
                  : (t("admin.audit.retention.runNow") as string)}
              </Button>
            </div>
            {lastRunResult ? (
              <div className="rounded-lg border border-gray-200 dark:border-slate-700 p-3 space-y-1 text-xs text-seal-gray-500 dark:text-slate-400">
                <p>
                  <strong className="text-seal-navy dark:text-white">
                    {t("admin.audit.retention.runResult.anonymized") as string}:
                  </strong>{" "}
                  {lastRunResult.anonymizedCount}
                </p>
                <p>
                  <strong className="text-seal-navy dark:text-white">
                    {t("admin.audit.retention.runResult.deleted") as string}:
                  </strong>{" "}
                  {lastRunResult.deletedCount}
                </p>
                <p>
                  <strong className="text-seal-navy dark:text-white">
                    {t("admin.audit.retention.runResult.duration") as string}:
                  </strong>{" "}
                  {lastRunResult.durationMs} ms
                </p>
                {lastRunResult.errors.length > 0 ? (
                  <p className="text-red-600 dark:text-red-400">
                    {t("admin.audit.retention.runResult.errors") as string}:{" "}
                    {lastRunResult.errors.length}
                  </p>
                ) : null}
              </div>
            ) : null}
          </CardContent>
        </Card>

        <ConfirmDialog
          open={runConfirmOpen}
          onClose={() => setRunConfirmOpen(false)}
          onConfirm={confirmRunNow}
          title={t("admin.audit.retention.title") as string}
          description={t("admin.audit.retention.runConfirm") as string}
          variant="danger"
        />
      </div>
    </RoleGuard>
  );
}

function StatCard({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-xl border border-gray-200 dark:border-slate-700 p-3 bg-white dark:bg-slate-900">
      <p className="text-[10px] font-semibold text-seal-gray-500 dark:text-slate-400 uppercase mb-1">
        {label}
      </p>
      <p className="text-lg font-bold text-seal-navy dark:text-white">{value}</p>
    </div>
  );
}
