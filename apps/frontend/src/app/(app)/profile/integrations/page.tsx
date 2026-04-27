"use client";

/**
 * Page utilisateur — Mes intégrations (Wave B item enrichissement F1).
 *
 * Permet à chaque utilisateur de :
 *  - Connecter / déconnecter son Google Calendar et son Outlook M365
 *  - Générer / lister / révoquer ses tokens WebDAV pour la sync Obsidian
 *  - Activer les notifications push Web (réutilise <PushNotificationsPrompt />)
 *
 * Backend déjà en place :
 *  - GET /calendar/integrations/status, GET/DELETE /calendar/connect/{google,outlook}
 *  - POST/GET/DELETE /users/me/webdav-token
 *
 * Charte SEAL (PANTONE), responsive (cards en colonnes), i18n FR/EN.
 */

import React, { useEffect } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Plug, ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { CalendarIntegrationCard } from "@/components/profile/integrations/calendar-integration-card";
import { WebdavIntegrationCard } from "@/components/profile/integrations/webdav-integration-card";

// PushNotificationsPrompt monte usePushNotifications (window/Notification) → SSR off
const PushNotificationsPrompt = dynamic(
  () =>
    import("@/components/notifications/push-notifications-prompt").then((m) => ({
      default: m.PushNotificationsPrompt,
    })),
  { ssr: false, loading: () => <div className="shimmer h-32 rounded-xl" /> },
);

export default function ProfileIntegrationsPage() {
  const t = useTranslations("profile.integrations");
  const tCal = useTranslations("profile.integrations.calendar");
  const searchParams = useSearchParams();

  // Toast de retour OAuth (?integration=google&status=ok)
  useEffect(() => {
    const integration = searchParams?.get("integration");
    const status = searchParams?.get("status");
    if (status !== "ok") return;
    if (integration === "google") {
      toast.success(tCal("connectedToastGoogle"));
    } else if (integration === "outlook") {
      toast.success(tCal("connectedToastOutlook"));
    }
    // L'effet ne dépend que des query params à l'arrivée — pas de cleanup nécessaire
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  return (
    <div className="container mx-auto px-4 py-6 max-w-5xl">
      <Link
        href="/profile"
        className="inline-flex items-center text-sm text-seal-blue hover:underline mb-3"
      >
        <ArrowLeft className="w-4 h-4 mr-1" />
        {t("back")}
      </Link>

      <PageHeader
        title={t("title")}
        subtitle={t("subtitle")}
        icon={Plug}
        hub="monEspace"
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Calendar (Google + Outlook) — 2 cards regroupées */}
        <section
          aria-labelledby="integrations-calendar-heading"
          className="space-y-4"
        >
          <h2
            id="integrations-calendar-heading"
            className="text-lg font-semibold text-seal-navy dark:text-white"
          >
            {tCal("sectionTitle")}
          </h2>
          <p className="text-sm text-seal-gray-500 dark:text-slate-400">
            {tCal("sectionDescription")}
          </p>
          <CalendarIntegrationCard provider="google" />
          <CalendarIntegrationCard provider="outlook" />
        </section>

        {/* WebDAV (Obsidian) + Push notifications */}
        <section
          aria-labelledby="integrations-other-heading"
          className="space-y-4"
        >
          <h2
            id="integrations-other-heading"
            className="text-lg font-semibold text-seal-navy dark:text-white"
          >
            {t("webdav.sectionTitle")}
          </h2>
          <WebdavIntegrationCard />

          <h2 className="text-lg font-semibold text-seal-navy dark:text-white pt-4">
            {t("push.sectionTitle")}
          </h2>
          <p className="text-sm text-seal-gray-500 dark:text-slate-400">
            {t("push.sectionDescription")}
          </p>
          <PushNotificationsPrompt />
        </section>
      </div>
    </div>
  );
}
