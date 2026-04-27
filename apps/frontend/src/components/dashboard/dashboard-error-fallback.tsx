"use client";

import React from "react";
import { Button, Card, CardContent } from "@omnitech/ui";
import { AlertTriangle } from "lucide-react";
import { useTranslations } from "next-intl";

export interface DashboardErrorFallbackProps {
  /** Reset the error flag in `useDashboardData` (called before reload). */
  onReset: () => void;
}

/**
 * Encart d'erreur affiché si `useDashboardData` ne parvient pas à charger les
 * données critiques. CTA → reset + reload de la page.
 */
export const DashboardErrorFallback = React.memo(function DashboardErrorFallback({
  onReset,
}: DashboardErrorFallbackProps) {
  const t = useTranslations("dashboard");
  return (
    <div className="p-6">
      <Card>
        <CardContent className="py-8 text-center">
          <AlertTriangle className="h-8 w-8 text-amber-500 mx-auto mb-3" />
          <p className="text-sm text-seal-gray-500 dark:text-slate-400">
            {t("loadError")}
          </p>
          <Button
            className="mt-4"
            onClick={() => {
              onReset();
              window.location.reload();
            }}
          >
            {t("retry")}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
});
