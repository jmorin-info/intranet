"use client";

import React from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, Button } from "@omnitech/ui";
import { Shield, Clock, Monitor, FileText } from "lucide-react";
import { formatDate } from "@/lib/utils";
import type { ProfileData } from "./types";

interface ProfileSecuritySectionProps {
  profile: ProfileData | null;
}

export function ProfileSecuritySection({
  profile,
}: ProfileSecuritySectionProps) {
  return (
    <Card>
      <CardHeader>
        <h2 className="text-lg font-medium text-seal-navy dark:text-white">
          Sécurité du compte
        </h2>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* MFA Status — prominent */}
        <div
          className={`flex items-center justify-between p-4 rounded-xl border-2 transition-colors duration-200 ${
            profile?.mfaEnabled
              ? "bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800"
              : "bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800"
          }`}
        >
          <div className="flex items-center gap-3">
            <div
              className={`h-10 w-10 rounded-full flex items-center justify-center ${
                profile?.mfaEnabled
                  ? "bg-emerald-100 dark:bg-emerald-900/40"
                  : "bg-amber-100 dark:bg-amber-900/40"
              }`}
            >
              <Shield
                className={`h-5 w-5 ${profile?.mfaEnabled ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"}`}
              />
            </div>
            <div>
              <p className="text-sm font-semibold text-seal-navy dark:text-white flex items-center gap-1.5">
                Authentification MFA
                {profile?.mfaEnabled ? (
                  <span className="text-emerald-600 dark:text-emerald-400 text-xs font-medium">
                    Activé
                  </span>
                ) : (
                  <span className="text-amber-600 dark:text-amber-400 text-xs font-medium">
                    Désactivé
                  </span>
                )}
              </p>
              <p className="text-xs text-seal-gray-500 dark:text-slate-400">
                {profile?.mfaEnabled
                  ? "TOTP configuré — votre compte est protégé"
                  : "Votre compte n’est pas protégé par un second facteur"}
              </p>
            </div>
          </div>
          <Link href="/mfa">
            <Button
              variant={profile?.mfaEnabled ? "outline" : "primary"}
              size="sm"
            >
              {profile?.mfaEnabled ? "Gérer" : "Activer maintenant"}
            </Button>
          </Link>
        </div>

        {/* Last login */}
        {profile?.lastLoginAt && (
          <div className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-slate-800 rounded-lg">
            <Clock className="h-5 w-5 text-seal-gray-500" />
            <div>
              <p className="text-sm font-semibold text-seal-navy dark:text-white">
                Dernière connexion
              </p>
              <p className="text-xs text-seal-gray-500 dark:text-slate-400">
                {formatDate(profile.lastLoginAt)}
              </p>
            </div>
          </div>
        )}

        {/* Active session info */}
        <div className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-slate-800 rounded-lg">
          <Monitor className="h-5 w-5 text-primary" />
          <div>
            <p className="text-sm font-semibold text-seal-navy dark:text-white">
              Session active
            </p>
            <p className="text-xs text-seal-gray-500 dark:text-slate-400">
              {profile?.lastLoginAt
                ? `Connecté depuis le ${new Date(profile.lastLoginAt).toLocaleDateString("fr-FR")} à ${new Date(profile.lastLoginAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}`
                : `Connecté le ${new Date().toLocaleDateString("fr-FR")}`}{" "}
              &mdash;{" "}
              {typeof navigator !== "undefined" &&
              navigator?.userAgent?.includes("Windows")
                ? "Windows"
                : typeof navigator !== "undefined" &&
                    navigator?.userAgent?.includes("Mac")
                  ? "macOS"
                  : "Linux"}
            </p>
          </div>
        </div>

        {/* Chartes status */}
        <div className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-slate-800 rounded-lg">
          <FileText className="h-5 w-5 text-emerald-500" />
          <div>
            <p className="text-sm font-semibold text-seal-navy dark:text-white">
              Chartes obligatoires
            </p>
            <p className="text-xs text-seal-gray-500 dark:text-slate-400">
              {profile?.chartesAcceptedAt
                ? `Signées le ${formatDate(profile.chartesAcceptedAt)}`
                : "En attente de signature"}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
