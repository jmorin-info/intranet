"use client";

/**
 * Section "Notifications push" — wrapper qui réutilise <PushNotificationsPrompt />
 * et gère gracieusement le cas où le composant retourne null (plateforme
 * incompatible & non-iOS) en affichant une carte explicative.
 *
 * Wave B item enrichissement F1 — Section #3 de /profile/integrations.
 */

import React, { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { BellOff } from "lucide-react";
import { Card, CardContent, CardHeader } from "@omnitech/ui";
import { PushNotificationsPrompt } from "@/components/notifications/push-notifications-prompt";
import {
  detectPlatform,
  getWebPushReadiness,
  type DetectedPlatform,
  type WebPushReadiness,
} from "@/lib/platform-detection";

export function PushIntegrationSection(): React.ReactElement {
  const t = useTranslations("profile.integrations.push");
  const [readiness, setReadiness] = useState<WebPushReadiness>("unsupported");
  const [platform, setPlatform] = useState<DetectedPlatform>("unknown");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setHydrated(true);
    setReadiness(getWebPushReadiness());
    setPlatform(detectPlatform());
  }, []);

  if (!hydrated) return <div className="shimmer h-32 rounded-xl" />;

  // Cas où PushNotificationsPrompt s'auto-cache (unsupported && !iOS) → on
  // affiche un fallback explicatif pour ne pas laisser un trou dans la page.
  const willHide = readiness === "unsupported" && platform !== "ios";
  if (willHide) {
    return (
      <Card data-testid="push-section-fallback">
        <CardHeader>
          <h3 className="text-base font-semibold text-seal-navy dark:text-white flex items-center gap-2">
            <BellOff className="h-5 w-5 text-seal-gray-500" />
            {t("sectionTitle")}
          </h3>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-seal-gray-500 dark:text-slate-400">
            Ce navigateur ne supporte pas les notifications push. Utilise un
            navigateur récent (Chrome, Firefox, Edge, Safari ≥ 16.4) ou
            installe l'intranet en PWA sur ton mobile.
          </p>
        </CardContent>
      </Card>
    );
  }

  return <PushNotificationsPrompt />;
}
