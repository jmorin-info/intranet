"use client";

/**
 * Page Chat — embed Rocket.Chat dans une iframe plein écran.
 *
 * Configuration :
 *   - NEXT_PUBLIC_CHAT_URL = https://chat.omnitech-security.fr
 *   - Rocket.Chat doit avoir l'embedding autorisé depuis intranet.omnitech-security.fr
 *     (Admin → Général → iFrame Integration → Enable)
 *
 * SSO :
 *   - Après configuration LDAP côté Rocket.Chat, les utilisateurs sont
 *     auto-provisionnés et peuvent se connecter avec leurs identifiants AD.
 *   - Option future : OAuth2 via l'intranet pour login transparent.
 */
import { useEffect, useState } from "react";
import {
  MessageSquare,
  ExternalLink,
  AlertCircle,
  Loader2,
} from "lucide-react";
import { useTranslation } from "@/lib/i18n";
import { PageHeader } from "@/components/layout/page-header";

const CHAT_URL = process.env.NEXT_PUBLIC_CHAT_URL || "";

export default function ChatPage() {
  const { t } = useTranslation();
  const [status, setStatus] = useState<
    "loading" | "ready" | "unconfigured" | "unreachable"
  >("loading");

  useEffect(() => {
    if (!CHAT_URL) {
      setStatus("unconfigured");
      return;
    }
    // Vérifie si le serveur Rocket.Chat répond
    fetch(`${CHAT_URL}/api/info`, { mode: "no-cors" })
      .then(() => setStatus("ready"))
      .catch(() => setStatus("unreachable"));
  }, []);

  if (status === "unconfigured") {
    return (
      <div className="max-w-4xl mx-auto space-y-6 animate-fade-in-up">
        <PageHeader
          title={t("chat.title")}
          subtitle="Messagerie d'équipe Rocket.Chat"
          icon={MessageSquare}
          hub="monEspace"
        />
        <section
          role="alert"
          aria-label={t("chat.notConfigured")}
          className="rounded-xl border border-amber-200 dark:border-amber-900/40 bg-amber-50 dark:bg-amber-900/20 p-4 sm:p-6 flex items-start gap-3"
        >
          <AlertCircle
            className="h-5 w-5 text-amber-500 flex-shrink-0 mt-0.5"
            aria-hidden="true"
          />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-amber-700 dark:text-amber-300">
              {t("chat.notConfigured")}
            </p>
            <p className="text-xs text-amber-600 dark:text-amber-400 mt-1 break-words">
              Définissez <code>NEXT_PUBLIC_CHAT_URL</code> dans le{" "}
              <code>.env</code> frontend (ex:{" "}
              <code>https://chat.omnitech-security.fr</code>) puis rebuild +
              restart.
            </p>
            <p className="text-xs text-amber-600 dark:text-amber-400 mt-2">
              Déploiement Rocket.Chat : voir{" "}
              <code>infra/rocketchat-compose.yml</code>.
            </p>
          </div>
        </section>
      </div>
    );
  }

  if (status === "unreachable") {
    return (
      <div className="max-w-4xl mx-auto space-y-6 animate-fade-in-up">
        <PageHeader
          title={t("chat.title")}
          subtitle="Messagerie d'équipe Rocket.Chat"
          icon={MessageSquare}
          hub="monEspace"
        />
        <section
          role="alert"
          aria-label={t("chat.serverUnreachable")}
          className="rounded-xl border border-red-200 dark:border-red-900/40 bg-red-50 dark:bg-red-900/20 p-4 sm:p-6 flex items-start gap-3"
        >
          <AlertCircle
            className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5"
            aria-hidden="true"
          />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-red-700 dark:text-red-300">
              {t("chat.serverUnreachable")}
            </p>
            <p className="text-xs text-red-600 dark:text-red-400 mt-1 break-words">
              Vérifiez que Rocket.Chat est démarré et accessible à l'adresse{" "}
              {CHAT_URL}.
            </p>
            <a
              href={CHAT_URL}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Tester Rocket.Chat dans un nouvel onglet"
              className="inline-flex items-center gap-1 mt-2 text-xs font-semibold text-red-700 dark:text-red-300 underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 rounded"
            >
              Tester directement{" "}
              <ExternalLink className="h-3 w-3" aria-hidden="true" />
            </a>
          </div>
        </section>
      </div>
    );
  }

  if (status === "loading") {
    return (
      <div className="h-[calc(100vh-140px)] -mx-4 -my-2 flex flex-col">
        <div className="flex items-center justify-between px-4 py-2 border-b border-gray-200 dark:border-slate-700">
          <div className="flex items-center gap-2">
            <MessageSquare
              className="h-5 w-5 text-primary"
              aria-hidden="true"
            />
            <h2 className="text-lg font-semibold text-seal-navy dark:text-white">
              {t("chat.title")}
            </h2>
          </div>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center gap-3 bg-white dark:bg-slate-900">
          <Loader2
            className="h-8 w-8 text-primary animate-spin"
            aria-hidden="true"
          />
          <p className="text-sm text-seal-gray-500 dark:text-slate-400">
            Connexion à Rocket.Chat…
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-140px)] -mx-4 -my-2 flex flex-col">
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-200 dark:border-slate-700 gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <MessageSquare
            className="h-5 w-5 text-primary flex-shrink-0"
            aria-hidden="true"
          />
          <h2 className="text-lg font-semibold text-seal-navy dark:text-white truncate">
            {t("chat.title")}
          </h2>
          <span className="hidden sm:inline text-[10px] uppercase tracking-wider text-seal-gray-500 dark:text-slate-500">
            Rocket.Chat
          </span>
        </div>
        <a
          href={CHAT_URL}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Ouvrir Rocket.Chat dans un nouvel onglet"
          className="flex items-center gap-1 text-xs text-seal-gray-500 dark:text-slate-400 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded px-2 py-1 min-h-[44px] sm:min-h-0 whitespace-nowrap"
        >
          <span className="hidden sm:inline">Ouvrir dans un nouvel onglet</span>
          <span className="sm:hidden">Nouvel onglet</span>
          <ExternalLink className="h-3 w-3" aria-hidden="true" />
        </a>
      </div>
      <iframe
        src={CHAT_URL}
        title="Rocket.Chat"
        className="flex-1 w-full border-0 bg-white dark:bg-slate-900"
        allow="microphone; camera; clipboard-read; clipboard-write; display-capture; autoplay"
      />
    </div>
  );
}
