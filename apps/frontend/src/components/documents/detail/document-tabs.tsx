"use client";

import React from "react";
import { Card, CardContent, Tabs } from "@omnitech/ui";
import {
  FileText,
  Eye,
  PenLine,
  Layers,
  History,
  CheckCircle2,
  Shield,
  MessageSquare,
} from "lucide-react";

export interface TabDef {
  id: string;
  label: string;
  icon?: React.ReactNode;
  count?: number;
}

interface DocumentTabsProps {
  activeTab: string;
  onChange: (tab: string) => void;
  tabs: TabDef[];
  children: React.ReactNode;
}

export function DocumentTabs({
  activeTab,
  onChange,
  tabs,
  children,
}: DocumentTabsProps) {
  return (
    <Card className="shadow-sm rounded-xl">
      <Tabs tabs={tabs} activeTab={activeTab} onChange={onChange} />
      <CardContent>{children}</CardContent>
    </Card>
  );
}

/**
 * Construit la liste des onglets disponibles pour un document donné.
 */
export function buildDocumentTabs(args: {
  canPreview: boolean;
  isNative: boolean;
  versionsCount: number;
  signaturesCount: number;
  acksCount: number;
  commentsCount: number;
  hasIsoAnalysis: boolean;
  isoAnalysisCount: number;
}): TabDef[] {
  const {
    canPreview,
    isNative,
    versionsCount,
    signaturesCount,
    acksCount,
    commentsCount,
    hasIsoAnalysis,
    isoAnalysisCount,
  } = args;
  return [
    ...(canPreview && !isNative
      ? [
          {
            id: "preview",
            label: "Aperçu",
            icon: <Eye className="h-3.5 w-3.5" />,
          },
        ]
      : []),
    ...(isNative
      ? [
          {
            id: "inline-edit",
            label: "Éditer en ligne",
            icon: <PenLine className="h-3.5 w-3.5" />,
          },
        ]
      : []),
    {
      id: "details",
      label: "Détails",
      icon: <FileText className="h-3.5 w-3.5" />,
    },
    {
      id: "versions",
      label: "Versions",
      count: versionsCount,
      icon: <Layers className="h-3.5 w-3.5" />,
    },
    {
      id: "signatures",
      label: "Signatures électroniques",
      count: signaturesCount,
      icon: <PenLine className="h-3.5 w-3.5" />,
    },
    {
      id: "acknowledgments",
      label: "Lectures confirmées",
      count: acksCount,
      icon: <CheckCircle2 className="h-3.5 w-3.5" />,
    },
    {
      id: "history",
      label: "Historique",
      icon: <History className="h-3.5 w-3.5" />,
    },
    {
      id: "comments",
      label: "Commentaires",
      count: commentsCount,
      icon: <MessageSquare className="h-3.5 w-3.5" />,
    },
    ...(hasIsoAnalysis
      ? [
          {
            id: "iso-analysis",
            label: "Analyse ISO",
            count: isoAnalysisCount,
            icon: <Shield className="h-3.5 w-3.5" />,
          },
        ]
      : []),
  ];
}
