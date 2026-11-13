"use client";

import React from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader } from "@omnitech/ui";
import { FileText, ExternalLink, Activity, Bug, ScrollText } from "lucide-react";

interface LogLink {
  id: string;
  label: string;
  description: string;
  href: string;
  icon: React.ElementType;
  external?: boolean;
  /** Fonctionnalité pas encore construite — carte affichée mais non cliquable. */
  disabled?: boolean;
}

/**
 * Liens vers les dashboards de logs et observabilité : Sentry, pino, audit logs, drill-down.
 */
export function ConfigLogsSection() {
  const links: LogLink[] = [
    {
      id: "sentry",
      label: "Sentry",
      description: "Erreurs, traces et profiling applicatif",
      href: process.env.NEXT_PUBLIC_SENTRY_URL || "https://sentry.io",
      icon: Bug,
      external: true,
    },
    {
      id: "audit",
      label: "Audit logs",
      description: "Journal d'audit ISO 27001 (connexions, actions sensibles)",
      href: "/admin/audit",
      icon: ScrollText,
    },
    {
      id: "monitoring",
      label: "Monitoring",
      description: "Dashboards système (CPU, RAM, disque, utilisation)",
      href: "/admin/system-monitoring",
      icon: Activity,
    },
    {
      id: "pino",
      label: "Logs applicatifs (pino)",
      description: "Fichiers logs côté serveur (backend NestJS)",
      href: "/admin/logs",
      icon: FileText,
      // Pas de page /admin/logs construite pour l'instant — carte désactivée
      // plutôt qu'un lien mort (404).
      disabled: true,
    },
  ];

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <ScrollText className="h-5 w-5 text-seal-navy dark:text-blue-400" />
          <h2 className="text-sm font-semibold text-seal-navy dark:text-white">
            Logs & observabilité
          </h2>
        </div>
        <p className="text-xs text-seal-gray-500 dark:text-slate-400 mt-1">
          Accès rapide aux dashboards de logs, erreurs et monitoring
        </p>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          {links.map((link) => {
            const Icon = link.icon;
            const content = (
              <div
                className={`rounded-xl border border-gray-200 dark:border-slate-700 p-4 h-full ${
                  link.disabled
                    ? "opacity-60 cursor-not-allowed"
                    : "hover:border-primary hover:shadow-sm transition-all"
                }`}
              >
                <div className="flex items-start justify-between mb-2">
                  <Icon className="h-5 w-5 text-seal-navy dark:text-blue-400" />
                  {link.disabled ? (
                    <span className="inline-flex items-center rounded-full bg-gray-100 dark:bg-slate-800 px-1.5 py-0.5 text-[9px] font-semibold text-seal-gray-500 dark:text-slate-400">
                      À venir
                    </span>
                  ) : (
                    <ExternalLink className="h-3.5 w-3.5 text-seal-gray-500 dark:text-slate-400" />
                  )}
                </div>
                <p className="text-sm font-semibold text-seal-navy dark:text-white">{link.label}</p>
                <p className="text-[11px] text-seal-gray-500 dark:text-slate-400 mt-0.5 leading-snug">
                  {link.description}
                </p>
              </div>
            );
            if (link.disabled) {
              return (
                <div key={link.id} aria-disabled="true">
                  {content}
                </div>
              );
            }
            return link.external ? (
              <a key={link.id} href={link.href} target="_blank" rel="noopener noreferrer">
                {content}
              </a>
            ) : (
              <Link key={link.id} href={link.href}>
                {content}
              </Link>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
