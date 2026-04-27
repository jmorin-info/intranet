"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { QuickLinks } from "@/components/widgets/quick-links";

/**
 * Bloc "Accès rapide" du dashboard — uniformise le label + style autour du
 * widget QuickLinks. Mémoïsé pour éviter les re-renders au refresh data.
 */
export const DashboardQuickLinksRow = React.memo(function DashboardQuickLinksRow() {
  const t = useTranslations("dashboard");
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <div className="rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-3 lg:col-span-2">
        <p className="text-[10px] font-medium uppercase tracking-widest text-seal-gray-500 dark:text-slate-500 mb-2">
          {t("quickAccess")}
        </p>
        <QuickLinks />
      </div>
    </div>
  );
});
