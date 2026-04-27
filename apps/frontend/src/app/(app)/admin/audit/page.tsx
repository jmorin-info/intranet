"use client";

/**
 * Page unifiée Audit — fusion des anciennes pages /admin/audit-log et
 * /admin/audit-timeline en deux onglets d'une seule URL (/admin/audit).
 *
 * Deep-link :
 *   /admin/audit            → onglet « Journal d'audit » (log)
 *   /admin/audit?tab=log    → idem
 *   /admin/audit?tab=timeline → onglet « Chronologie »
 *
 * Les anciennes URLs (/admin/audit-log et /admin/audit-timeline) sont
 * redirigées via next.config.js (308) pour ne pas casser les liens externes.
 *
 * Référence : docs/admin/HUB_TAXONOMY.md, quick win #8 et #9 de l'audit.
 */

import React, { useCallback, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { ClipboardList, Activity } from "lucide-react";
import { Tabs } from "@omnitech/ui";
import { UserRole } from "@omnitech/shared";
import { PageHeader } from "@/components/layout/page-header";
import { RoleGuard } from "@/components/role-guard";
import { AdminGroupTabs } from "@/components/layout/admin-group-tabs";
import { AuditLogView } from "@/components/admin/audit-log-view";
import { AuditTimelineView } from "@/components/admin/audit-timeline-view";

type AuditTab = "log" | "timeline";

function isAuditTab(value: string | null): value is AuditTab {
  return value === "log" || value === "timeline";
}

export default function AdminAuditPage() {
  const t = useTranslations("admin.audit.page");
  const router = useRouter();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab");
  const activeTab: AuditTab = isAuditTab(tabParam) ? tabParam : "log";

  const handleTabChange = useCallback(
    (tabId: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (tabId === "log") {
        params.delete("tab");
      } else {
        params.set("tab", tabId);
      }
      const query = params.toString();
      router.replace(query ? `/admin/audit?${query}` : "/admin/audit");
    },
    [router, searchParams],
  );

  const tabs = useMemo(
    () => [
      {
        id: "log",
        label: t("tabLog"),
        icon: <ClipboardList className="h-4 w-4" />,
      },
      {
        id: "timeline",
        label: t("tabTimeline"),
        icon: <Activity className="h-4 w-4" />,
      },
    ],
    [t],
  );

  return (
    <RoleGuard minRole={UserRole.ADMIN}>
      <div className="p-6 space-y-6 bg-gray-50 dark:bg-slate-950 min-h-screen">
        <AdminGroupTabs group="audit" />

        <PageHeader
          title={t("title")}
          subtitle={t("subtitle")}
          icon={ClipboardList}
          hub="admin"
          meta={
            <Tabs
              tabs={tabs}
              activeTab={activeTab}
              onChange={handleTabChange}
            />
          }
        />

        {activeTab === "log" ? <AuditLogView /> : <AuditTimelineView />}
      </div>
    </RoleGuard>
  );
}
