"use client";

import React from "react";
import { UserRole } from "@omnitech/shared";
import { Settings } from "lucide-react";
import { AdminGroupTabs } from "@/components/layout/admin-group-tabs";
import { PageHeader } from "@/components/layout/page-header";
import { RoleGuard } from "@/components/role-guard";
import { useTranslation } from "@/lib/i18n";

import {
  ConfigSystemInfo,
  useSystemInfo,
} from "@/components/admin/config/config-system-info";
import { ConfigBannersSection } from "@/components/admin/config/config-banners-section";
import { ConfigMeiliSection } from "@/components/admin/config/config-meili-section";
import { ConfigIntegrationsSection } from "@/components/admin/config/config-integrations-section";
import { ConfigAppSection } from "@/components/admin/config/config-app-section";
import { ConfigAccessMatrix } from "@/components/admin/config/config-access-matrix";
import { ConfigRetentionSection } from "@/components/admin/config/config-retention-section";
import { ConfigFeatureFlagsSection } from "@/components/admin/config/config-feature-flags-section";
import { ConfigLogsSection } from "@/components/admin/config/config-logs-section";

/**
 * Admin Config orchestrator.
 *
 * Découpage :
 * - ConfigSystemInfo      → cartes santé (version, DB, Redis, users, uptime, RAM)
 * - ConfigIntegrationsSection → synthèse LDAP / DocuSeal / Ollama (badges status)
 * - ConfigBannersSection  → bannières prioritaires P1/P2/P3 (+ linkUrl)
 * - ConfigMeiliSection    → Meilisearch (stats + reindex)
 * - ConfigAppSection      → AppConfig générique (tabs key/value + LDAP/SMTP/KnowBe4)
 * - ConfigAccessMatrix    → matrice documentaire ISO 27001 A.5.15
 * - ConfigRetentionSection → rétention documentaire ISO 27001 A.5.33
 * - ConfigFeatureFlagsSection → toggles feature.* (AppConfig)
 * - ConfigLogsSection     → liens Sentry, audit, monitoring, pino
 *
 * Sections sensibles (AppSection, AccessMatrix, FeatureFlags) protégées par
 * ROLE_HIERARCHY SUPER_ADMIN via RoleGuard.
 */
export default function AdminConfigPage() {
  const { t } = useTranslation();
  const { systemInfo, serviceHealthMap, lastSyncTimes, loading } =
    useSystemInfo();

  return (
    <RoleGuard minRole={UserRole.SUPER_ADMIN}>
      <div className="space-y-6">
        <AdminGroupTabs group="config" />
        <PageHeader
          title={t("nav.config")}
          subtitle="Paramètres système de l'intranet OMNITECH"
          icon={Settings}
          hub="admin"
        />

        {/* Informations système (version, DB, Redis, users, uptime, RAM) */}
        <ConfigSystemInfo systemInfo={systemInfo} loading={loading} />

        {/* Synthèse des intégrations : LDAP, DocuSeal, Ollama */}
        <ConfigIntegrationsSection serviceHealthMap={serviceHealthMap} />

        {/* Bannières prioritaires */}
        <ConfigBannersSection />

        {/* Meilisearch */}
        <ConfigMeiliSection />

        {/* AppConfig générique : tabs (général, LDAP, SMTP, DocuSeal, Intégrations) */}
        <ConfigAppSection
          serviceHealthMap={serviceHealthMap}
          lastSyncTimes={lastSyncTimes}
        />

        {/* Matrice des accès (documentaire ISO 27001 A.5.15) */}
        <ConfigAccessMatrix />

        {/* Rétention documentaire (ISO 27001 A.5.33) */}
        <ConfigRetentionSection />

        {/* Feature flags */}
        <ConfigFeatureFlagsSection />

        {/* Logs & observabilité */}
        <ConfigLogsSection />
      </div>
    </RoleGuard>
  );
}
