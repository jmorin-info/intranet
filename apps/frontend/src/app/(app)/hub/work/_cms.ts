import type { LucideIcon } from "lucide-react";
import {
  FileText,
  ClipboardEdit,
  Newspaper,
  BookMarked,
  Users,
  HardDrive,
  Search,
  FileType,
} from "lucide-react";

export type WorkIconKey =
  | "FileText"
  | "ClipboardEdit"
  | "Newspaper"
  | "BookMarked"
  | "Users"
  | "HardDrive"
  | "Search"
  | "FileType";

export const ICON_REGISTRY: Record<WorkIconKey, LucideIcon> = {
  FileText,
  ClipboardEdit,
  Newspaper,
  BookMarked,
  Users,
  HardDrive,
  Search,
  FileType,
};

export const BADGE_KEYS = {
  docs: true,
  procs: true,
  wiki: true,
  news: true,
} as const;

export type WorkBadgeKey = keyof typeof BADGE_KEYS;

export interface WorkCard {
  title: string;
  description: string;
  href: string;
  iconKey: WorkIconKey;
  badgeKey?: WorkBadgeKey;
}

export const FALLBACK_CARDS: WorkCard[] = [
  {
    title: "Documents (GED)",
    description:
      "Politiques, procédures, notes internes — recherche, validation et signature.",
    href: "/documents",
    iconKey: "FileText",
    badgeKey: "docs",
  },
  {
    title: "Procédures opérationnelles",
    description: "Bibliothèque des procédures métier et runbooks IT.",
    href: "/procedures",
    iconKey: "ClipboardEdit",
    badgeKey: "procs",
  },
  {
    title: "Actualités",
    description: "Communications internes, annonces et notes de direction.",
    href: "/news",
    iconKey: "Newspaper",
    badgeKey: "news",
  },
  {
    title: "Wiki & Runbooks",
    description: "Base de connaissances collaborative et runbooks IT.",
    href: "/wiki",
    iconKey: "BookMarked",
    badgeKey: "wiki",
  },
  {
    title: "Annuaire",
    description: "Collaborateurs, organigramme, départements et contacts.",
    href: "/directory",
    iconKey: "Users",
  },
  {
    title: "Fichiers réseau",
    description: "Partages SMB et ressources réseau autorisées.",
    href: "/files",
    iconKey: "HardDrive",
  },
  {
    title: "Recherche globale",
    description: "Rechercher dans documents, wiki, actualités et tickets.",
    href: "/search",
    iconKey: "Search",
  },
  {
    title: "Outils PDF",
    description: "Fusion, découpe, OCR et utilitaires PDF.",
    href: "/tools/pdf",
    iconKey: "FileType",
  },
];

function isBadgeKey(s: string): s is WorkBadgeKey {
  return s in BADGE_KEYS;
}

export function normalizeCard(raw: unknown): WorkCard | null {
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
    iconKey: iconKey as WorkIconKey,
    badgeKey,
  };
}
