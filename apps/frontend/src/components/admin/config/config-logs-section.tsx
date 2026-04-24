"use client";

import React from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader } from "@omnitech/ui";
import {
  FileText,
  ExternalLink,
  Activity,
  Bug,
  ScrollText,
} from "lucide-react";

interface LogLink {
  id: string;
  label: string;
  description: string;
  href: string;
  icon: React.ElementType;
  external?: boolean;
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
      href: "/admin/monitoring",
      icon: Activity,
    },
    {
      id: "pino",
      label: "Logs applicatifs (pino)",
      description: "Fichiers logs côté serveur (backend NestJS)",
      href: "/admin/logs",
      icon: FileText,
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
              <div className="rounded-xl border border-gray-200 dark:border-slate-700 p-4 hover:border-primary hover:shadow-sm transition-all h-full">
                <div className="flex items-start justify-between mb-2">
                  <Icon className="h-5 w-5 text-seal-navy dark:text-blue-400" />
                  <ExternalLink className="h-3.5 w-3.5 text-seal-gray-500 dark:text-slate-400" />
                </div>
                <p className="text-sm font-semibold text-seal-navy dark:text-white">
                  {link.label}
                </p>
                <p className="text-[11px] text-seal-gray-500 dark:text-slate-400 mt-0.5 leading-snug">
                  {link.description}
                </p>
              </div>
            );
            return link.external ? (
              <a
                key={link.id}
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
              >
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
