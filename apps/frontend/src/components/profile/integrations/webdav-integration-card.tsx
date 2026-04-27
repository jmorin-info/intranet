"use client";

/**
 * Card "Sync vault Obsidian (WebDAV)" — stub initial.
 *
 * Implémentation complète dans le commit suivant (mint / list / revoke).
 */
import React from "react";
import { Card, CardContent, CardHeader, Skeleton } from "@omnitech/ui";

export function WebdavIntegrationCard(): React.ReactElement {
  return (
    <Card data-testid="webdav-card">
      <CardHeader>
        <h3 className="text-base font-semibold text-seal-navy dark:text-white">
          Obsidian WebDAV
        </h3>
      </CardHeader>
      <CardContent>
        <Skeleton className="h-12 w-full" />
      </CardContent>
    </Card>
  );
}
