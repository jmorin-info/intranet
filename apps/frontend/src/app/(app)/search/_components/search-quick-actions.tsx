"use client";

/**
 * <SearchQuickActions />
 * ======================
 *
 * Affiche les actions rapides de la "command palette" inline quand la query
 * matche un keyword (creer document, ticket, profil, parametres, aide...).
 * Garde l'experience v1 ou taper "ticket" propose immediatement de creer un.
 */

import React from "react";
import Link from "next/link";
import {
  FilePlus,
  HelpCircle,
  Settings,
  Ticket,
  User,
  Zap,
} from "lucide-react";
import { Badge, Card, CardContent } from "@omnitech/ui";
import { useTranslation } from "@/lib/i18n";

interface QuickAction {
  label: string;
  description: string;
  href: string;
  icon: React.ElementType;
  keywords: string[];
}

const QUICK_ACTIONS: QuickAction[] = [
  {
    label: "Nouveau document",
    description: "Créer un nouveau document dans la GED",
    href: "/documents/new",
    icon: FilePlus,
    keywords: [
      "nouveau document",
      "creer document",
      "créer document",
      "new doc",
      "ajouter document",
    ],
  },
  {
    label: "Nouveau ticket",
    description: "Ouvrir un ticket de support IT",
    href: "/tickets?create=true",
    icon: Ticket,
    keywords: [
      "nouveau ticket",
      "creer ticket",
      "créer ticket",
      "new ticket",
      "ouvrir ticket",
      "support",
    ],
  },
  {
    label: "Mon profil",
    description: "Voir et modifier mon profil",
    href: "/profile",
    icon: User,
    keywords: ["profil", "profile", "mon profil", "mon compte", "compte"],
  },
  {
    label: "Paramètres",
    description: "Configuration de la plateforme",
    href: "/admin/config",
    icon: Settings,
    keywords: [
      "paramètres",
      "parametres",
      "parametre",
      "config",
      "configuration",
      "settings",
      "réglages",
      "reglages",
    ],
  },
  {
    label: "Aide",
    description: "Accéder à l'assistant IT et au helpdesk",
    href: "/helpdesk",
    icon: HelpCircle,
    keywords: [
      "aide",
      "help",
      "helpdesk",
      "assistance",
      "support",
      "assistant",
    ],
  },
];

export function matchQuickActions(query: string): QuickAction[] {
  if (!query || query.length < 2) return [];
  const q = query.toLowerCase().trim();
  return QUICK_ACTIONS.filter(
    (action) =>
      action.keywords.some((kw) => kw.includes(q) || q.includes(kw)) ||
      action.label.toLowerCase().includes(q),
  );
}

interface Props {
  query: string;
}

export function SearchQuickActions({ query }: Props): React.ReactElement | null {
  const { t } = useTranslation();
  const actions = matchQuickActions(query);

  if (actions.length === 0 || !query) return null;

  return (
    <div>
      <h2 className="text-sm font-semibold text-seal-navy dark:text-white mb-2 flex items-center gap-2">
        <Zap className="h-4 w-4 text-primary" aria-hidden="true" />{" "}
        {t("search.quickActions")}
      </h2>
      <div className="space-y-1.5">
        {actions.map((action) => {
          const Icon = action.icon;
          return (
            <Link key={action.href} href={action.href}>
              <Card hoverable>
                <CardContent className="py-2.5 flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 flex-shrink-0">
                    <Icon className="h-4 w-4 text-primary" aria-hidden="true" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-seal-navy dark:text-white">
                      {action.label}
                    </p>
                    <p className="text-[11px] text-seal-gray-500 dark:text-slate-400">
                      {action.description}
                    </p>
                  </div>
                  <Badge variant="navy" className="text-[10px]">
                    Action
                  </Badge>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
