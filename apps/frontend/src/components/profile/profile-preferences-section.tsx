"use client";

import React, { useState, useEffect } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Card, CardContent, CardHeader } from "@omnitech/ui";
import { Bell, Eye, Globe, CheckCircle2 } from "lucide-react";
import { useUIStore } from "@/stores/ui-store";
import { useGlanceStore } from "@/stores/glance-store";
import { useTranslation } from "@/lib/i18n";
import type { ApiError, NotifPrefs } from "./types";

export function ProfilePreferencesSection() {
  const { locale, setLocale } = useUIStore();
  const glanceEnabled = useGlanceStore((s) => s.enabled);
  const setGlanceEnabled = useGlanceStore((s) => s.setEnabled);
  const { t } = useTranslation();

  const [notifPrefs, setNotifPrefs] = useState<NotifPrefs>({
    emailDocuments: true,
    emailTickets: true,
    emailSecurityAlerts: true,
    emailNews: true,
    dailySummary: false,
    pushBrowser: false,
  });
  const [savingNotifPrefs, setSavingNotifPrefs] = useState(false);

  useEffect(() => {
    api
      .get("/users/me/notification-preferences")
      .then(({ data }) => {
        if (data) {
          setNotifPrefs({
            emailDocuments: data.emailDocuments ?? true,
            emailTickets: data.emailTickets ?? true,
            emailSecurityAlerts: true, // always forced
            emailNews: data.emailNews ?? true,
            dailySummary: data.dailySummary ?? false,
            pushBrowser: data.pushBrowser ?? false,
          });
        }
      })
      .catch(() => {});
  }, []);

  const toggleNotifPref = async (key: keyof NotifPrefs) => {
    if (key === "emailSecurityAlerts") return; // cannot toggle
    const previous = notifPrefs;
    const updated = { ...notifPrefs, [key]: !notifPrefs[key] };
    setNotifPrefs(updated);
    setSavingNotifPrefs(true);
    try {
      await api.patch("/users/me/notification-preferences", {
        emailDocuments: updated.emailDocuments,
        emailTickets: updated.emailTickets,
        emailNews: updated.emailNews,
        dailySummary: updated.dailySummary,
        pushBrowser: updated.pushBrowser,
      });
      toast.success(t("profile.preferenceUpdated"));
    } catch (err) {
      setNotifPrefs(previous);
      toast.error(
        (err as ApiError)?.response?.data?.message ||
          (err as ApiError)?.message ||
          t("profile.preferenceError"),
      );
    } finally {
      setSavingNotifPrefs(false);
    }
  };

  const notifPrefItems = [
    {
      key: "emailDocuments" as const,
      label: "Email pour documents",
      desc: "Revue, approbation et publication de documents",
      forced: false,
    },
    {
      key: "emailTickets" as const,
      label: "Email pour tickets assignés",
      desc: "Création, mise à jour et assignation de tickets",
      forced: false,
    },
    {
      key: "emailSecurityAlerts" as const,
      label: "Email pour alertes sécurité",
      desc: "Alertes de sécurité critiques (toujours actif)",
      forced: true,
    },
    {
      key: "emailNews" as const,
      label: "Email pour actualités",
      desc: "Nouvelles de l'entreprise et communications internes",
      forced: false,
    },
    {
      key: "dailySummary" as const,
      label: "Résumé quotidien",
      desc: "Recevoir un email résumé chaque matin",
      forced: false,
    },
    {
      key: "pushBrowser" as const,
      label: "Push navigateur",
      desc: "Notifications push dans le navigateur",
      forced: false,
    },
  ];

  return (
    <>
      {/* Notification preferences */}
      <Card>
        <CardHeader>
          <h2 className="text-lg font-medium text-seal-navy dark:text-white flex items-center gap-2">
            <Bell className="h-5 w-5 text-primary" />
            Preferences de notification
          </h2>
        </CardHeader>
        <CardContent className="space-y-3">
          {notifPrefItems.map((pref) => (
            <div
              key={pref.key}
              className="flex items-center justify-between p-3 bg-gray-50 dark:bg-slate-800 rounded-lg"
            >
              <div>
                <p className="text-sm font-semibold text-seal-navy dark:text-white">
                  {pref.label}
                </p>
                <p className="text-xs text-seal-gray-500 dark:text-slate-400">
                  {pref.desc}
                </p>
              </div>
              <button
                onClick={() => toggleNotifPref(pref.key)}
                disabled={savingNotifPrefs || pref.forced}
                aria-label={`Activer/désactiver : ${pref.label}`}
                aria-checked={notifPrefs[pref.key]}
                role="switch"
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:opacity-60 ${notifPrefs[pref.key] ? "bg-primary" : "bg-gray-300 dark:bg-slate-600"} ${pref.forced ? "cursor-not-allowed" : ""}`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${notifPrefs[pref.key] ? "translate-x-6" : "translate-x-1"}`}
                />
              </button>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Navigation preferences — Glance */}
      <Card>
        <CardHeader>
          <h2 className="text-lg font-medium text-seal-navy dark:text-white flex items-center gap-2">
            <Eye className="h-5 w-5 text-primary" />
            Préférences de navigation
          </h2>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-slate-800 rounded-lg">
            <div className="pr-4">
              <p className="text-sm font-semibold text-seal-navy dark:text-white">
                Glance — aperçu Alt+Clic
              </p>
              <p className="text-xs text-seal-gray-500 dark:text-slate-400">
                Maintenez{" "}
                <kbd className="px-1 py-0.5 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-600 rounded text-[10px] font-mono font-semibold">
                  Alt
                </kbd>{" "}
                et cliquez sur un lien interne pour l&apos;ouvrir en
                surimpression sans quitter la page courante. Inspiré de Zen
                Browser.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setGlanceEnabled(!glanceEnabled)}
              aria-label="Activer/désactiver : Glance (aperçu Alt+Clic)"
              aria-checked={glanceEnabled}
              role="switch"
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 ${glanceEnabled ? "bg-primary" : "bg-gray-300 dark:bg-slate-600"}`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${glanceEnabled ? "translate-x-6" : "translate-x-1"}`}
              />
            </button>
          </div>
        </CardContent>
      </Card>

      {/* Language preference */}
      <Card>
        <CardHeader>
          <h2 className="text-lg font-medium text-seal-navy dark:text-white flex items-center gap-2">
            <Globe className="h-5 w-5 text-primary" />
            Langue de l&apos;interface
          </h2>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-seal-gray-500 dark:text-slate-400 mb-3">
            Choisissez la langue d&apos;affichage de l&apos;application.
          </p>
          <div className="flex gap-3">
            {(
              [
                { value: "fr", label: "Français", flag: "🇫🇷" },
                { value: "en", label: "English", flag: "🇬🇧" },
              ] as const
            ).map(({ value, label, flag }) => (
              <button
                key={value}
                onClick={() => {
                  setLocale(value);
                  toast.success(`Langue changée : ${label}`);
                }}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-lg border-2 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${locale === value ? "border-primary bg-primary/10 text-primary dark:text-primary" : "border-gray-200 dark:border-slate-700 text-seal-navy dark:text-white hover:border-primary/40 hover:bg-gray-50 dark:hover:bg-slate-800"}`}
              >
                <span className="text-base">{flag}</span>
                {label}
                {locale === value && (
                  <CheckCircle2 className="h-4 w-4 text-primary ml-1" />
                )}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>
    </>
  );
}
