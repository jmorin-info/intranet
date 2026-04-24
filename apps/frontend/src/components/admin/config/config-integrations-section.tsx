"use client";

import React from "react";
import { Card, CardContent, CardHeader, Badge } from "@omnitech/ui";
import {
  Plug,
  Shield,
  PenLine,
  Sparkles,
  CheckCircle2,
  XCircle,
  RefreshCw,
} from "lucide-react";
import type { ServiceHealth } from "./config-system-info";

interface ConfigIntegrationsSectionProps {
  serviceHealthMap: Record<string, ServiceHealth>;
}

/**
 * Vue de synthèse des intégrations externes : LDAP, DocuSeal, Ollama.
 * Affiche uniquement l'état de connexion (badges). La configuration fine
 * se fait dans ConfigAppSection (tabs LDAP / DocuSeal / Intégrations).
 */
export function ConfigIntegrationsSection({
  serviceHealthMap,
}: ConfigIntegrationsSectionProps) {
  const integrations = [
    {
      id: "ldap",
      label: "LDAP / Active Directory",
      description:
        "Authentification centralisée et synchronisation des comptes AD",
      icon: Shield,
      status: serviceHealthMap.ldap?.status || "unknown",
    },
    {
      id: "docuseal",
      label: "DocuSeal",
      description:
        "Signature électronique des chartes et documents réglementaires",
      icon: PenLine,
      status:
        (serviceHealthMap.docuseal?.status as "up" | "down" | "unknown") ||
        "unknown",
    },
    {
      id: "ollama",
      label: "Ollama (IA locale)",
      description:
        "Moteur d'inférence IA pour le Helpdesk Chatbot et le RAG documentaire",
      icon: Sparkles,
      status:
        (serviceHealthMap.ollama?.status as "up" | "down" | "unknown") ||
        "unknown",
    },
  ];

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Plug className="h-5 w-5 text-seal-navy dark:text-blue-400" />
          <h2 className="text-sm font-semibold text-seal-navy dark:text-white">
            Intégrations externes
          </h2>
        </div>
        <p className="text-xs text-seal-gray-500 dark:text-slate-400 mt-1">
          État de connexion des services tiers. Utilisez les onglets ci-dessous
          pour configurer les paramètres.
        </p>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {integrations.map((intg) => {
            const Icon = intg.icon;
            return (
              <div
                key={intg.id}
                className="rounded-xl border border-gray-200 dark:border-slate-700 p-4"
              >
                <div className="flex items-start justify-between mb-2">
                  <Icon className="h-5 w-5 text-seal-navy dark:text-blue-400" />
                  <StatusBadge status={intg.status} />
                </div>
                <p className="text-sm font-semibold text-seal-navy dark:text-white">
                  {intg.label}
                </p>
                <p className="text-[11px] text-seal-gray-500 dark:text-slate-400 mt-0.5 leading-snug">
                  {intg.description}
                </p>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

function StatusBadge({ status }: { status: "up" | "down" | "unknown" }) {
  if (status === "up") {
    return (
      <Badge variant="success">
        <CheckCircle2 className="h-3 w-3" /> Connecté
      </Badge>
    );
  }
  if (status === "down") {
    return (
      <Badge variant="error">
        <XCircle className="h-3 w-3" /> Hors ligne
      </Badge>
    );
  }
  return (
    <Badge variant="draft">
      <RefreshCw className="h-3 w-3" /> Inconnu
    </Badge>
  );
}
