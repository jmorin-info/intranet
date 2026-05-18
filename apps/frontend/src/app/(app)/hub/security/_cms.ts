import type { LucideIcon } from "lucide-react";
import {
  ShieldAlert,
  Rss,
  BookOpen,
  Headset,
  GraduationCap,
  Star,
  Siren,
} from "lucide-react";

export type SecurityIconKey =
  | "Siren"
  | "ShieldAlert"
  | "Rss"
  | "BookOpen"
  | "Headset"
  | "GraduationCap"
  | "Star";

export const ICON_REGISTRY: Record<SecurityIconKey, LucideIcon> = {
  Siren,
  ShieldAlert,
  Rss,
  BookOpen,
  Headset,
  GraduationCap,
  Star,
};

export const BADGE_KEYS = {
  incidents: true,
  alerts: true,
  veille: true,
  chartes: true,
  tickets: true,
} as const;

export type SecurityBadgeKey = keyof typeof BADGE_KEYS;

export interface SecurityCard {
  title: string;
  description: string;
  href: string;
  iconKey: SecurityIconKey;
  badgeKey?: SecurityBadgeKey;
}

export const FALLBACK_CARDS: SecurityCard[] = [
  {
    title: "Incidents",
    description:
      "Cycle de vie des incidents de sécurité et plans de remédiation.",
    href: "/incidents",
    iconKey: "Siren",
    badgeKey: "incidents",
  },
  {
    title: "Alertes",
    description: "Alertes de sécurité et accusés de lecture.",
    href: "/alerts",
    iconKey: "ShieldAlert",
    badgeKey: "alerts",
  },
  {
    title: "Veille cyber",
    description: "Bulletins CERT-FR / ANSSI agrégés pour le kit OMNITECH.",
    href: "/veille",
    iconKey: "Rss",
    badgeKey: "veille",
  },
  {
    title: "Chartes & politiques",
    description: "Chartes signées, politiques de sécurité et attestations.",
    href: "/chartes",
    iconKey: "BookOpen",
    badgeKey: "chartes",
  },
  {
    title: "Helpdesk & Self-service",
    description: "FAQ, base de connaissances et création de tickets assistée.",
    href: "/helpdesk",
    iconKey: "Headset",
    badgeKey: "tickets",
  },
  {
    title: "Quiz sécurité",
    description: "Campagnes de sensibilisation et quiz de formation.",
    href: "/quiz",
    iconKey: "GraduationCap",
  },
  {
    title: "Satisfaction",
    description: "Enquêtes de satisfaction et collecte de retours.",
    href: "/satisfaction",
    iconKey: "Star",
  },
];

function isBadgeKey(s: string): s is SecurityBadgeKey {
  return s in BADGE_KEYS;
}

export function normalizeCard(raw: unknown): SecurityCard | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const title = typeof o.title === "string" ? o.title : null;
  const description = typeof o.description === "string" ? o.description : null;
  const href = typeof o.href === "string" ? o.href : null;
  const iconKey = typeof o.iconKey === "string" ? o.iconKey : null;
  if (!title || !description || !href || !iconKey) return null;
  if (!(iconKey in ICON_REGISTRY)) return null;
  const badgeKey =
    typeof o.badgeKey === "string" && isBadgeKey(o.badgeKey)
      ? o.badgeKey
      : undefined;
  return {
    title,
    description,
    href,
    iconKey: iconKey as SecurityIconKey,
    badgeKey,
  };
}
