"use client";

import { useMemo, useState, useEffect } from "react";
import { isRouteEnabled } from "@/lib/features";
import { ShieldCheck } from "lucide-react";
import { HubLanding, type HubCard } from "@/components/layout/hub-landing";
import { api } from "@/lib/api";
import { useCmsBlocks, getBlockData } from "@/lib/cms-client";
import { ICON_REGISTRY, FALLBACK_CARDS, normalizeCard, type SecurityCard } from "./_cms";

export default function SecurityHubPage() {
  const blocks = useCmsBlocks(["hub.security.cards"], "fr");
  const [badges, setBadges] = useState<Record<string, number | undefined>>({});

  useEffect(() => {
    Promise.allSettled([
      api.get("/incidents", { params: { limit: 1 } }),
      api.get("/alerts"),
      api.get("/veille/bulletins", { params: { limit: 1 } }),
      api.get("/chartes"),
      api.get("/tickets", { params: { limit: 1 } }),
    ]).then(([incR, alertsR, veilleR, chartesR, ticketsR]) => {
      const b: Record<string, number | undefined> = {};
      if (incR.status === "fulfilled") b.incidents = incR.value?.data?.meta?.total;
      if (alertsR.status === "fulfilled") {
        const d = alertsR.value?.data;
        b.alerts = Array.isArray(d) ? d.length : (d?.meta?.total ?? d?.meta?.unreadCount);
      }
      if (veilleR.status === "fulfilled") b.veille = veilleR.value?.data?.meta?.total;
      if (chartesR.status === "fulfilled") {
        const d = chartesR.value?.data;
        b.chartes = Array.isArray(d) ? d.length : d?.meta?.total;
      }
      if (ticketsR.status === "fulfilled") b.tickets = ticketsR.value?.data?.meta?.total;
      setBadges(b);
    });
  }, []);

  const cards: HubCard[] = useMemo(() => {
    const rawList = getBlockData<unknown[]>(blocks, "hub.security.cards", []);
    const fromCms = Array.isArray(rawList)
      ? rawList.map(normalizeCard).filter((c): c is SecurityCard => c !== null)
      : [];
    // Masque les tuiles de modules désactivés (CMS + FALLBACK_CARDS) via la
    // source unique isRouteEnabled.
    const source = (fromCms.length > 0 ? fromCms : FALLBACK_CARDS).filter((c) =>
      isRouteEnabled(c.href),
    );
    return source.map((c) => ({
      title: c.title,
      description: c.description,
      href: c.href,
      icon: ICON_REGISTRY[c.iconKey],
      badge: c.badgeKey ? badges[c.badgeKey] : undefined,
    }));
  }, [blocks, badges]);

  return (
    <div className="animate-fade-in-up">
      <HubLanding
        title="Sécurité & Conformité"
        subtitle="Incidents, alertes, veille cyber et supports aux utilisateurs."
        accent="#892034"
        variant="bordeaux"
        icon={ShieldCheck}
        cards={cards}
      />
    </div>
  );
}
