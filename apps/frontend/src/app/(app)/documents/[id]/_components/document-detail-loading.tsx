"use client";

import React from "react";
import { Card, CardContent, Skeleton } from "@omnitech/ui";

/**
 * Skeleton de chargement de la page Document Detail.
 * Reproduit la structure : breadcrumb + header card + (timeline + tabs + content) + sidebar.
 * Préserve la charte SEAL via Skeleton + classes existantes.
 */
export const DocumentDetailLoading = React.memo(function DocumentDetailLoading() {
  return (
    <div className="space-y-6 animate-fade-in-up">
      {/* Breadcrumb */}
      <Skeleton className="h-4 w-56 shimmer" />
      {/* Header card */}
      <Card>
        <CardContent className="space-y-4 p-6">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex-1 min-w-0 space-y-3">
              <div className="flex items-center gap-2">
                <Skeleton className="h-5 w-20 rounded-full shimmer" />
                <Skeleton className="h-5 w-24 rounded-full shimmer" />
                <Skeleton className="h-5 w-16 rounded-full shimmer" />
              </div>
              <Skeleton className="h-4 w-32 shimmer" />
              <Skeleton className="h-7 w-3/4 shimmer" />
              <Skeleton className="h-4 w-full shimmer" />
              <Skeleton className="h-4 w-5/6 shimmer" />
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <Skeleton className="h-9 w-24 rounded-btn shimmer" />
              <Skeleton className="h-9 w-28 rounded-btn shimmer" />
            </div>
          </div>
        </CardContent>
      </Card>
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        <div className="lg:col-span-3 space-y-4">
          {/* Workflow timeline */}
          <Skeleton className="h-20 w-full rounded-card shimmer" />
          {/* Tabs */}
          <div className="flex items-center gap-1 border-b border-gray-200 dark:border-slate-700">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-9 w-24 shimmer" />
            ))}
          </div>
          {/* Tab content */}
          <Card>
            <CardContent className="space-y-3 p-6">
              <Skeleton className="h-4 w-full shimmer" />
              <Skeleton className="h-4 w-11/12 shimmer" />
              <Skeleton className="h-4 w-10/12 shimmer" />
              <Skeleton className="h-4 w-9/12 shimmer" />
            </CardContent>
          </Card>
        </div>
        {/* Sidebar */}
        <div className="lg:col-span-1 space-y-3">
          <Skeleton className="h-32 w-full rounded-card shimmer" />
          <Skeleton className="h-24 w-full rounded-card shimmer" />
        </div>
      </div>
    </div>
  );
});
