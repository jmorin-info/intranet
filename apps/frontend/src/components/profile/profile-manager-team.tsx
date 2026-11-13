"use client";

import React from "react";
import { Card, CardContent, CardHeader } from "@omnitech/ui";
import { Users } from "lucide-react";
import type { AuthUser } from "@/stores/auth-store";
import { getInitials } from "@/lib/utils";

interface ProfileManagerTeamProps {
  user: AuthUser;
}

export function ProfileManagerTeam({ user }: ProfileManagerTeamProps) {
  const hasManager = !!user.manager;
  const hasSubordinates = user.subordinates && user.subordinates.length > 0;
  if (!hasManager && !hasSubordinates) return null;

  return (
    <Card>
      <CardHeader>
        <h2 className="text-lg font-medium text-seal-navy dark:text-white flex items-center gap-2">
          <Users className="h-5 w-5 text-primary" />
          Organisation
        </h2>
      </CardHeader>
      <CardContent className="space-y-3">
        {user.manager && (
          <div className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-slate-800 rounded-lg">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary text-sm font-semibold">
              {getInitials(user.manager.firstName, user.manager.lastName)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-seal-navy dark:text-white">
                Manager : {user.manager.firstName} {user.manager.lastName}
              </p>
              <p className="text-xs text-seal-gray-500 dark:text-slate-400">{user.manager.email}</p>
            </div>
          </div>
        )}
        {user.subordinates && user.subordinates.length > 0 && (
          <div className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-slate-800 rounded-lg">
            <Users className="h-5 w-5 text-primary" />
            <div>
              <p className="text-sm font-semibold text-seal-navy dark:text-white">
                Équipe : {user.subordinates.length} collaborateur
                {user.subordinates.length > 1 ? "s" : ""}
              </p>
              <p className="text-xs text-seal-gray-500 dark:text-slate-400">
                {user.subordinates.map((s) => `${s.firstName} ${s.lastName}`).join(", ")}
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
