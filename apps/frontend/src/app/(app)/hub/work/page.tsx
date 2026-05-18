"use client";

import { useMemo, useState, useEffect } from "react";
import { Briefcase } from "lucide-react";
import { HubLanding, type HubCard } from "@/components/layout/hub-landing";
import { api } from "@/lib/api";
import { useCmsBlocks, getBlockData } from "@/lib/cms-client";
import {
  ICON_REGISTRY,
  FALLBACK_CARDS,
  normalizeCard,
  type WorkCard,
} from "./_cms";

export default function WorkHubPage() {
  const blocks = useCmsBlocks(["hub.work.cards"], "fr");
  const [badges, setBadges] = useState<Record<string, number | undefined>>({});

  useEffect(() => {
    Promise.allSettled([
      api.get("/documents", { params: { limit: 1 } }),
      api.get("/runbooks"),
      api.get("/wiki"),
      api.get("/news", { params: { limit: 1 } }),
    ]).then(([docsR, procsR, wikiR, newsR]) => {
      const b: Record<string, number | undefined> = {};
      if (docsR.status === "fulfilled") b.docs = docsR.value?.data?.meta?.total;
      if (procsR.status === "fulfilled") {
        const d = procsR.value?.data;
        b.procs = Array.isArray(d) ? d.length : d?.meta?.total;
      }
      if (wikiR.status === "fulfilled") {
        const d = wikiR.value?.data;
        b.wiki = Array.isArray(d) ? d.length : d?.meta?.total;
      }
      if (newsR.status === "fulfilled") b.news = newsR.value?.data?.meta?.total;
      setBadges(b);
    });
  }, []);

  const cards: HubCard[] = useMemo(() => {
    const rawList = getBlockData<unknown[]>(blocks, "hub.work.cards", []);
    const fromCms = Array.isArray(rawList)
      ? rawList.map(normalizeCard).filter((c): c is WorkCard => c !== null)
      : [];
    const source = fromCms.length > 0 ? fromCms : FALLBACK_CARDS;
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
        title="Travail & Connaissance"
        subtitle="Documents, procédures, wiki et ressources opérationnelles."
        accent="#296DC1"
        variant="blue"
        icon={Briefcase}
        cards={cards}
      />
    </div>
  );
}
