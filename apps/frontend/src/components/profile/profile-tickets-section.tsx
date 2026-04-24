"use client";

import React from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, Button } from "@omnitech/ui";
import { FolderOpen } from "lucide-react";

interface ProfileTicketsSectionProps {
  myOpenTickets: number;
}

export function ProfileTicketsSection({
  myOpenTickets,
}: ProfileTicketsSectionProps) {
  return (
    <Card>
      <CardHeader>
        <h2 className="text-lg font-medium text-seal-navy dark:text-white flex items-center gap-2">
          <FolderOpen className="h-5 w-5 text-primary" />
          Mes tickets
        </h2>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between p-3 rounded-lg bg-gray-50 dark:bg-slate-800">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-amber-50 dark:bg-amber-900/30 flex items-center justify-center">
              <FolderOpen className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <p className="text-lg font-medium text-seal-navy dark:text-white">
                {myOpenTickets}
              </p>
              <p className="text-[11px] text-seal-gray-500 dark:text-slate-400">
                Tickets ouverts
              </p>
            </div>
          </div>
          <Link href="/tickets">
            <Button variant="outline" size="sm">
              Voir mes tickets
            </Button>
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
