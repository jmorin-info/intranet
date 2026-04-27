"use client";

/**
 * Card "Google Calendar" / "Microsoft Outlook" — stub initial.
 *
 * Implémentation complète dans les commits suivants (statut, connect/sync/disconnect).
 */
import React from "react";
import { Card, CardContent, CardHeader, Skeleton } from "@omnitech/ui";

export interface CalendarIntegrationCardProps {
  provider: "google" | "outlook";
}

export function CalendarIntegrationCard({
  provider,
}: CalendarIntegrationCardProps): React.ReactElement {
  return (
    <Card data-testid={`calendar-card-${provider}`}>
      <CardHeader>
        <h3 className="text-base font-semibold text-seal-navy dark:text-white capitalize">
          {provider === "google" ? "Google Calendar" : "Microsoft Outlook"}
        </h3>
      </CardHeader>
      <CardContent>
        <Skeleton className="h-12 w-full" />
      </CardContent>
    </Card>
  );
}
