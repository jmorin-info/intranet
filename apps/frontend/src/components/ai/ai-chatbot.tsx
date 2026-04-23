"use client";

import React, { useRef, useEffect, useState, useCallback } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import {
  Bot,
  X,
  Send,
  Trash2,
  ChevronDown,
  Sparkles,
  FileText,
  Ticket,
  Shield,
  HelpCircle,
  Zap,
} from "lucide-react";
import { useAuthStore } from "@/stores/auth-store";
import { useChatbotStore, type ChatMessage } from "@/stores/chatbot-store";
import { useTranslation } from "@/lib/i18n";
import { api } from "@/lib/api";
import {
  getPageContext,
  getActionsForRole,
  executeAction,
  trackPageView,
} from "@/lib/copilot";

// ── Module context detection ─────────────────────────────────��────

function detectModule(path: string): string {
  if (path.startsWith("/documents")) return "documents";
  if (path.startsWith("/tickets")) return "tickets";
  if (path.startsWith("/incidents")) return "incidents";
  if (path.startsWith("/veille")) return "veille";
  if (path.startsWith("/admin")) return "admin";
  if (path.startsWith("/wiki")) return "wiki";
  if (path.startsWith("/news")) return "news";
  if (path.startsWith("/dashboard")) return "dashboard";
  if (path.startsWith("/profile")) return "profile";
  if (path.startsWith("/search")) return "search";
  return "general";
}

function moduleLabel(mod: string): string {
  const labels: Record<string, string> = {
    documents: "Documents GED",
    tickets: "Tickets support",
    incidents: "Incidents sécurité",
    veille: "Veille cyber",
    admin: "Administration",
    wiki: "Base de connaissances",
    news: "Actualités",
    dashboard: "Tableau de bord",
    profile: "Profil",
    search: "Recherche",
    general: "Intranet",
  };
  return labels[mod] || "Intranet";
}

// ── Quick suggestions per module ──────────────────────────��───────

function getQuickSuggestions(mod: string): string[] {
  const base = ["Que puis-je faire ici ?", "Raccourcis clavier"];
  const modSuggestions: Record<string, string[]> = {
    documents: [
      "Comment créer un document ?",
      "Expliquer le workflow de validation",
      "Quels documents sont en retard de revue ?",
    ],
    tickets: [
      "Comment créer un ticket ?",
      "Quels tickets me sont assignés ?",
      "Expliquer les niveaux de priorité",
    ],
    incidents: [
      "Comment déclarer un incident ?",
      "Quel est le protocole d'investigation ?",
      "Incidents ouverts ce mois",
    ],
    veille: [
      "Résumer les alertes de la semaine",
      "Quelles sont les vulnérabilités critiques ?",
      "Générer un bulletin",
    ],
    admin: [
      "Combien d'utilisateurs actifs ?",
      "Taux d'adoption MFA",
      "Prochaines tâches de conformité",
    ],
    wiki: [
      "Rechercher dans la base de connaissances",
      "Articles les plus consultés",
      "Créer une nouvelle page",
    ],
    dashboard: [
      "Résumé de mon activité",
      "Tâches en attente",
      "État de la conformité ISO",
    ],
    general: ["Naviguer vers les documents", "Mon profil", "État du système"],
  };
  return [...(modSuggestions[mod] || modSuggestions.general!), ...base].slice(
    0,
    4,
  );
}

// ── Local intelligence engine (heuristic, no ML) ──────────────────

interface AssistantResponse {
  content: string;
  actions?: Array<{ label: string; href: string }>;
}

async function generateResponse(
  query: string,
  module: string,
  userRole: string,
): Promise<AssistantResponse> {
  const q = query.toLowerCase();
  const isAdmin = userRole === "SUPER_ADMIN" || userRole === "ADMIN";
  const isReviewer =
    isAdmin || userRole === "DIRECTION" || userRole === "REVIEWER";

  // ── Navigation + creation intents ──────────────────────────────
  if (
    q.includes("document") &&
    (q.includes("créer") || q.includes("nouveau"))
  ) {
    return {
      content:
        "Pour créer un document, cliquez sur **Nouveau document**. Choisissez la catégorie (Politique, Procédure, Plan, etc.) et la classification ISO 27001 (Public, Interne, Confidentiel, Secret). Le document passera ensuite par le workflow de validation configuré.",
      actions: [
        { label: "Créer un document", href: "/documents/new" },
        { label: "Créer en ligne (éditeur)", href: "/documents/new-inline" },
      ],
    };
  }
  if (
    q.includes("ticket") &&
    (q.includes("créer") ||
      q.includes("nouveau") ||
      q.includes("ouvrir") ||
      q.includes("demande"))
  ) {
    return {
      content:
        "Créez un ticket pour toute demande : **support IT**, **déploiement**, **accès**, **matériel**, **logiciel** ou **réseau**. Le ticket sera routé automatiquement. Les SLA sont calculés selon la priorité choisie.",
      actions: [{ label: "Créer un ticket", href: "/tickets?create=true" }],
    };
  }
  if (
    q.includes("incident") &&
    (q.includes("déclarer") || q.includes("signaler") || q.includes("sécurité"))
  ) {
    return {
      content:
        "Déclarez immédiatement tout événement suspect : **intrusion**, **phishing**, **fuite de données**, **malware**. Le protocole ISO 27001 A.5.24 sera automatiquement déclenché avec traçabilité complète.",
      actions: [{ label: "Déclarer un incident", href: "/incidents" }],
    };
  }

  // ── Process + workflow explanations ─────────────────────────────
  if (
    q.includes("workflow") ||
    q.includes("validation") ||
    q.includes("processus") ||
    q.includes("approbation")
  ) {
    return {
      content:
        "**Workflow de validation documentaire :**\n1. **Brouillon** — Rédaction par l'auteur\n2. **En revue** — Relecture par un réviseur\n3. **Revue validée** — Prêt pour approbation\n4. **Approbation** — Validation par la direction\n5. **Approuvé** — Document officiel\n\nChaque étape est traçable et conforme ISO 27001 A.5.1.",
      actions: [
        { label: "Voir les workflows", href: "/admin/workflows" },
        { label: "File de validation", href: "/documents/pending" },
      ],
    };
  }
  if (
    q.includes("classification") ||
    q.includes("confidentialité") ||
    q.includes("confidentiel") ||
    q.includes("secret")
  ) {
    return {
      content:
        "**Classification ISO 27001 A.5.12 :**\n- 🟢 **Public** — Diffusable sans restriction\n- 🔵 **Interne** — Réservé aux collaborateurs\n- 🟠 **Confidentiel** — Accès sur besoin d'en connaître\n- 🔴 **Secret** — Cercle restreint, validation RSSI obligatoire\n\nLa classification détermine les droits d'accès, de partage et de téléchargement.",
    };
  }

  // ── ISO 27001 + compliance ─────────────────────────────────────
  if (
    q.includes("iso") ||
    q.includes("conformité") ||
    q.includes("compliance") ||
    q.includes("27001")
  ) {
    return {
      content:
        "L'intranet OMNITECH est conçu selon **ISO 27001:2022**. Il couvre :\n- **A.5** — Contrôles organisationnels (politiques, rôles, classification)\n- **A.6** — Contrôles des personnes (sensibilisation, formation)\n- **A.7** — Contrôles physiques\n- **A.8** — Contrôles technologiques (audit, chiffrement, accès)\n\nLe module Conformité suit la couverture des 93 contrôles de l'Annexe A.",
      actions: isAdmin
        ? [
            { label: "Tableau de conformité", href: "/admin/compliance" },
            { label: "Rapports ISO", href: "/admin/reports" },
          ]
        : [{ label: "Voir les procédures", href: "/procedures" }],
    };
  }

  // ── Shortcuts + keyboard ───────────────────────────────────────
  if (
    q.includes("raccourci") ||
    q.includes("clavier") ||
    q.includes("shortcut")
  ) {
    return {
      content:
        "**Raccourcis clavier principaux :**\n- `⌘K` ou `Ctrl+.` — Palette de commandes\n- `?` — Afficher tous les raccourcis\n- `Ctrl+Shift+D` — Documents\n- `Ctrl+Shift+T` — Tickets\n- `Ctrl+Shift+I` — Incidents\n- `Ctrl+Shift+N` — Actualités\n- `Alt` — Mode focus (masquer le superflu)\n- `Ctrl+Alt+1-5` — Naviguer entre les hubs\n- `/` (sur la page recherche) — Focus dans le champ",
    };
  }

  // ── MFA + security ─────────────────────────────────────────────
  if (
    q.includes("mfa") ||
    q.includes("double authentification") ||
    q.includes("2fa") ||
    q.includes("totp")
  ) {
    return {
      content:
        "Le **MFA (Multi-Factor Authentication)** ajoute une couche de sécurité à votre compte. Utilisez une application TOTP (Microsoft Authenticator, Google Authenticator, Authy) pour générer des codes à 6 chiffres lors de la connexion.",
      actions: [{ label: "Configurer le MFA", href: "/mfa" }],
    };
  }
  if (
    q.includes("mot de passe") ||
    q.includes("password") ||
    q.includes("réinitialiser")
  ) {
    return {
      content:
        "Pour **changer votre mot de passe**, accédez à votre profil. Le mot de passe doit contenir au minimum **12 caractères** avec : une majuscule, une minuscule, un chiffre et un caractère spécial.",
      actions: [
        { label: "Mon profil", href: "/profile" },
        { label: "Mot de passe oublié", href: "/forgot-password" },
      ],
    };
  }

  // ── Admin-specific intents ─────────────────────────────────────
  if (
    isAdmin &&
    (q.includes("utilisateur") || q.includes("user") || q.includes("compte"))
  ) {
    return {
      content:
        "En tant qu'administrateur, vous pouvez :\n- **Créer** des comptes utilisateurs\n- **Assigner** des rôles et départements\n- **Importer** via CSV depuis l'Active Directory\n- **Désactiver** ou **supprimer** des comptes\n- **Appliquer** la politique MFA\n- **Synchroniser** avec le LDAP",
      actions: [
        { label: "Gestion des utilisateurs", href: "/admin/users" },
        { label: "Import CSV", href: "/admin/users/import" },
      ],
    };
  }
  if (
    isAdmin &&
    (q.includes("ldap") ||
      q.includes("active directory") ||
      q.includes("synchroni"))
  ) {
    return {
      content:
        "La synchronisation **LDAP / Active Directory** permet d'importer automatiquement les comptes depuis votre annuaire AD. Configurez le serveur LDAPS, le filtre de recherche et le mapping des rôles dans la configuration.",
      actions: [
        { label: "Configuration LDAP", href: "/admin/config" },
        { label: "Validation LDAP", href: "/admin/ldap-pending" },
      ],
    };
  }
  if (
    isAdmin &&
    (q.includes("audit") || q.includes("journal") || q.includes("trace"))
  ) {
    return {
      content:
        "Le **journal d'audit** (ISO 27001 A.8.15) enregistre toutes les actions : connexions, modifications, créations, suppressions. Filtrez par sévérité, action ou utilisateur pour investiguer.",
      actions: [
        { label: "Journal d'audit", href: "/admin/audit?tab=log" },
        { label: "Timeline audit", href: "/admin/audit?tab=timeline" },
      ],
    };
  }

  // ── Veille + alerts ────────────────────────────────────────────
  if (
    q.includes("veille") ||
    q.includes("cert") ||
    q.includes("anssi") ||
    q.includes("vulnérabilité") ||
    q.includes("cve")
  ) {
    return {
      content:
        "La **veille cybersécurité** agrège automatiquement les flux CERT-FR, ANSSI et NVD. Chaque alerte peut être traitée (**Appliqué**, **N/A**, **Risque accepté**). Des bulletins hebdomadaires résument les menaces de la semaine.",
      actions: [
        { label: "Veille cyber", href: "/veille" },
        { label: "Alertes actives", href: "/alerts" },
      ],
    };
  }

  // ── Wiki + knowledge base ──────────────────────────────────────
  if (
    q.includes("wiki") ||
    q.includes("connaissance") ||
    q.includes("documentation") ||
    q.includes("procédure")
  ) {
    return {
      content:
        "La **base de connaissances** regroupe les runbooks, procédures opérationnelles, FAQ et schémas d'architecture. Chaque collaborateur peut contribuer. Le wiki est versionné avec historique et partage sélectif.",
      actions: [
        { label: "Wiki", href: "/wiki" },
        { label: "Runbooks IT", href: "/runbooks" },
        { label: "Procédures", href: "/procedures" },
      ],
    };
  }

  // ── Search ─────────────────────────────────────────────────────
  if (q.includes("cherch") || q.includes("trouver") || q.includes("recherch")) {
    return {
      content:
        "Utilisez la **recherche globale** (⌘K) pour trouver documents, tickets, wiki et actualités en un seul endroit. La recherche v2 (Meilisearch) offre des résultats groupés par type avec filtrage intelligent.",
      actions: [
        { label: "Recherche", href: "/search" },
        { label: "Recherche avancée", href: "/search/v2" },
      ],
    };
  }

  // ── Module context help (fallback) ─────────────────────────────
  if (
    q.includes("que puis-je") ||
    q.includes("aide") ||
    q.includes("comment") ||
    q.includes("quoi faire") ||
    q.includes("ici")
  ) {
    const moduleHelp: Record<string, AssistantResponse> = {
      documents: {
        content:
          "📄 **Documents GED** — Créez, consultez et gérez les documents ISO 27001. Filtrez par statut, catégorie ou classification. Chaque document suit un workflow de validation configurable par l'administrateur.",
        actions: [
          { label: "Créer un document", href: "/documents/new" },
          { label: "File de validation", href: "/documents/pending" },
        ],
      },
      tickets: {
        content:
          "🎫 **Espace Tickets** — Créez des demandes (support IT, déploiement, matériel, accès) et suivez leur progression. Les SLA sont calculés automatiquement. Vous pouvez filtrer, trier et exporter les données.",
        actions: [{ label: "Créer un ticket", href: "/tickets?create=true" }],
      },
      incidents: {
        content:
          "🚨 **Incidents de sécurité** — Déclarez et suivez les incidents (intrusion, phishing, fuite, malware). Chaque incident est tracé de la déclaration à la clôture, conforme ISO 27001 A.5.24.",
        actions: [{ label: "Déclarer un incident", href: "/incidents" }],
      },
      veille: {
        content:
          "🛡️ **Veille Cyber** — Flux automatisés CERT-FR et ANSSI. Traitez les alertes, marquez-les comme appliquées ou N/A, et générez des bulletins hebdomadaires pour votre équipe.",
        actions: [{ label: "Générer un bulletin", href: "/veille" }],
      },
      dashboard: {
        content:
          "📊 **Tableau de bord** — Vue d'ensemble de vos tâches, statistiques et alertes. Personnalisez les widgets visibles et accédez rapidement à vos actions prioritaires.",
        actions: [
          { label: "Créer un document", href: "/documents/new" },
          { label: "Créer un ticket", href: "/tickets?create=true" },
        ],
      },
      admin: {
        content:
          "⚙️ **Administration** — Gérez les utilisateurs, départements, conformité ISO, workflows, audit et configuration système. Chaque module est accessible depuis les onglets de navigation.",
        actions: [
          { label: "Utilisateurs", href: "/admin/users" },
          { label: "Conformité", href: "/admin/compliance" },
        ],
      },
      wiki: {
        content:
          "📚 **Wiki** — Base de connaissances collaborative. Créez des pages, organisez par catégories, ajoutez des images et partagez avec votre équipe. L'éditeur supporte le HTML et le formatage riche.",
        actions: [{ label: "Nouvelle page", href: "/wiki" }],
      },
      news: {
        content:
          "📰 **Actualités** — Communications internes de l'entreprise. Consultez les articles épinglés et récents. Les administrateurs peuvent publier et cibler des audiences spécifiques.",
        actions: [{ label: "Rédiger un article", href: "/news/compose" }],
      },
      profile: {
        content:
          "👤 **Mon profil** — Mettez à jour votre photo, vos coordonnées et vos préférences. Changez votre mot de passe et exportez vos données (RGPD).",
        actions: [{ label: "Modifier le profil", href: "/profile" }],
      },
      search: {
        content:
          "🔍 **Recherche** — Trouvez documents, tickets, wiki et actualités. Utilisez les filtres intelligents ou tapez en langage naturel (« tickets ouverts cette semaine »).",
      },
    };
    return (
      moduleHelp[module] || {
        content:
          "Je suis l'**assistant OMNITECH Security**. Je peux :\n\n• 🧭 **Naviguer** — Accéder à une page ou un module\n• 📝 **Créer** — Documents, tickets, incidents\n• 📖 **Expliquer** — Workflows, ISO 27001, classification\n• ⌨️ **Raccourcis** — Commandes clavier\n• 🔍 **Rechercher** — Trouver une information\n\nQue souhaitez-vous faire ?",
      }
    );
  }

  // ── RAG search fallback ────────────────────────────────────────
  try {
    const { data } = await api.post("/rag/ask", { question: query });
    if (data?.answer) {
      const actions: Array<{ label: string; href: string }> = [];
      if (data.sources?.length > 0) {
        for (const src of data.sources.slice(0, 3)) {
          const typeLabels: Record<string, string> = {
            DOCUMENT: "Document",
            WIKI: "Wiki",
            PROCEDURE: "Procédure",
            RUNBOOK: "Runbook",
          };
          const label = typeLabels[src.sourceType] || src.sourceType;
          const hrefMap: Record<string, string> = {
            DOCUMENT: `/documents/${src.sourceId}`,
            WIKI: "/wiki",
            PROCEDURE: `/procedures/${src.sourceId}`,
            RUNBOOK: "/runbooks",
          };
          actions.push({
            label: `${label} : ${src.title || src.sourceId}`,
            href: hrefMap[src.sourceType] || "#",
          });
        }
      }
      return {
        content: data.answer,
        actions: actions.length > 0 ? actions : undefined,
      };
    }
  } catch {
    /* RAG not available, continue to fallback */
  }

  // ── Generic fallback ───────────────────────────────────────────
  return {
    content:
      "Je n'ai pas trouvé de réponse précise. Voici comment je peux vous aider :\n\n• **« Créer un document »** — Lancer la création\n• **« Que puis-je faire ici ? »** — Aide contextuelle\n• **« Raccourcis clavier »** — Liste des raccourcis\n• **« ISO 27001 »** — Expliquer la conformité\n• **« Mot de passe »** — Gérer vos accès\n\nOu posez une question libre — je chercherai dans la base de connaissances.",
    actions: [
      { label: "Créer un ticket", href: "/tickets?create=true" },
      { label: "Recherche globale", href: "/search" },
    ],
  };
}

// ── Haptic feedback (safe local util, no cross-package dep) ───────
function hapticTap(): void {
  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    try {
      navigator.vibrate(5);
    } catch {
      /* ignore */
    }
  }
}

// ── Chatbot Component ─────────────────────────────────────────────

interface AIChatbotProps {
  /**
   * `floating` (default) — original behaviour: FAB + floating sheet.
   * `embedded` — renders inline (no FAB, no fullscreen sheet, no dialog
   *              wrapper). Used on the `/helpdesk` hub so the same
   *              chatbot/store/history is visible as a full-width panel.
   *              The outer `open` state is ignored in embedded mode.
   */
  mode?: 'floating' | 'embedded';
  /** Custom placeholder for the input (embedded usage). */
  placeholder?: string;
}

export function AIChatbot({ mode = 'floating', placeholder }: AIChatbotProps = {}) {
  const { t } = useTranslation();
  const pathname = usePathname();
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const {
    open,
    messages,
    loading,
    toggle,
    close,
    addMessage,
    setLoading,
    clearHistory,
  } = useChatbotStore();
  const embedded = mode === 'embedded';
  const [input, setInput] = useState("");
  const [showActions, setShowActions] = useState(false);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomAnchorRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const module = detectModule(pathname || "/");
  const pageContext = getPageContext(pathname || "/");
  const contextActions = getActionsForRole(
    pageContext,
    user?.role || "COLLABORATEUR",
  );

  // Track page views for usage analytics
  useEffect(() => {
    if (pathname) trackPageView(pathname);
  }, [pathname]);

  // Auto-scroll to bottom on new messages — only if user hasn't scrolled up manually
  useEffect(() => {
    if (!isAtBottom) return;
    if (bottomAnchorRef.current) {
      bottomAnchorRef.current.scrollIntoView({
        behavior: "smooth",
        block: "end",
      });
    } else if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages.length, loading, isAtBottom]);

  // Track scroll position to decide auto-scroll behaviour
  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const threshold = 60; // px slack from bottom
    const atBottom =
      el.scrollHeight - el.scrollTop - el.clientHeight < threshold;
    setIsAtBottom(atBottom);
  }, []);

  // Focus input when panel opens + haptic on open + lock body scroll on mobile
  useEffect(() => {
    if (open) {
      hapticTap();
      setTimeout(() => inputRef.current?.focus(), 100);
      // Mobile body scroll lock while sheet is open
      if (
        typeof window !== "undefined" &&
        window.matchMedia("(max-width: 1023px)").matches
      ) {
        const prevOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        return () => {
          document.body.style.overflow = prevOverflow;
        };
      }
    }
    return undefined;
  }, [open]);

  // Close on ESC
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close]);

  const handleSend = useCallback(
    async (text?: string) => {
      const query = (text || input).trim();
      if (!query || loading) return;

      hapticTap();
      setIsAtBottom(true); // sending a message -> user wants to see the bottom

      const userMsg: ChatMessage = {
        id: `u-${Date.now()}`,
        role: "user",
        content: query,
        timestamp: Date.now(),
        context: { page: pathname || "/", module },
      };
      addMessage(userMsg);
      setInput("");
      setLoading(true);

      try {
        const response = await generateResponse(
          query,
          module,
          user?.role || "COLLABORATEUR",
        );
        const assistantMsg: ChatMessage = {
          id: `a-${Date.now()}`,
          role: "assistant",
          content:
            response.content +
            (response.actions
              ? "\n\n" +
                response.actions
                  .map((a) => `→ [${a.label}](${a.href})`)
                  .join("\n")
              : ""),
          timestamp: Date.now(),
          context: { page: pathname || "/", module },
        };
        addMessage(assistantMsg);
      } catch {
        addMessage({
          id: `e-${Date.now()}`,
          role: "assistant",
          content:
            "Désolé, une erreur est survenue. Réessayez dans quelques instants.",
          timestamp: Date.now(),
        });
      } finally {
        setLoading(false);
      }
    },
    [input, loading, pathname, module, user?.role, addMessage, setLoading],
  );

  const suggestions = getQuickSuggestions(module);

  // ── Embedded mode ─────────────────────────────────────────────
  // Renders the same conversation inline, sharing the same zustand store
  // (same history as the FAB). No fixed positioning, no FAB, no scrim.
  if (embedded) {
    return (
      <div
        role="region"
        aria-label="Assistant OMNITECH"
        className="relative flex flex-col bg-white dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-slate-700 shadow-sm overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 dark:border-slate-800 bg-gradient-to-r from-[#004469]/5 to-[#F68D2E]/5 px-4 py-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-[#004469] to-[#F68D2E] shrink-0">
              <Sparkles className="h-4 w-4 text-white" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-seal-navy dark:text-white truncate">
                Assistant OMNITECH
              </h3>
              <p className="text-[11px] text-seal-gray-500 dark:text-slate-500 truncate">
                Je peux répondre directement ou créer un ticket si besoin.
              </p>
            </div>
          </div>
          {messages.length > 0 && (
            <button
              onClick={() => {
                hapticTap();
                clearHistory();
              }}
              className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800 text-seal-gray-500 hover:text-red-500 transition"
              title="Effacer l'historique"
              aria-label="Effacer l'historique"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* Messages */}
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="overflow-y-auto px-4 py-3 space-y-3 min-h-[260px] max-h-[440px]"
        >
          {messages.length === 0 && !loading && (
            <div className="flex flex-col items-center justify-center text-center py-6 px-2">
              <p className="text-base font-semibold text-seal-navy dark:text-white mb-1">
                Bonjour{user?.firstName ? ` ${user.firstName}` : ''} !
              </p>
              <p className="text-sm text-seal-gray-500 dark:text-slate-400 mb-5 max-w-sm">
                Décrivez votre problème — je peux peut-être répondre directement.
                Sinon, créez un ticket en un clic.
              </p>
              <div className="flex flex-col gap-2 w-full max-w-md">
                {suggestions.map((s) => (
                  <button
                    key={s}
                    onClick={() => handleSend(s)}
                    className="w-full rounded-xl border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 px-4 py-2.5 text-sm font-medium text-seal-navy dark:text-slate-200 hover:border-[#004469] hover:text-[#004469] dark:hover:border-blue-400 dark:hover:text-blue-400 transition text-left"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed break-words [overflow-wrap:anywhere] ${
                  msg.role === 'user'
                    ? 'bg-[#004469] text-white rounded-br-md'
                    : 'bg-gray-50 dark:bg-slate-800 text-seal-navy dark:text-slate-200 border border-gray-100 dark:border-slate-700 rounded-bl-md'
                }`}
              >
                {msg.content.split('\n').map((line, i) => {
                  const linkMatch = line.match(/^→ \[(.+?)\]\((.+?)\)$/);
                  if (linkMatch) {
                    return (
                      <Link
                        key={i}
                        href={linkMatch[2]!}
                        className="flex items-center gap-1.5 mt-1.5 text-xs font-medium text-[#004469] dark:text-blue-400 hover:underline"
                      >
                        <ChevronDown className="h-3 w-3 rotate-[-90deg]" />
                        {linkMatch[1]}
                      </Link>
                    );
                  }
                  const parts = line.split(/(\*\*[^*]+\*\*)/g);
                  return (
                    <p key={i} className={i > 0 ? 'mt-1' : ''}>
                      {parts.map((part, j) =>
                        part.startsWith('**') && part.endsWith('**') ? (
                          <strong key={j} className="font-semibold">
                            {part.slice(2, -2)}
                          </strong>
                        ) : (
                          <span key={j}>{part}</span>
                        ),
                      )}
                    </p>
                  );
                })}
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex justify-start">
              <div className="bg-gray-50 dark:bg-slate-800 border border-gray-100 dark:border-slate-700 rounded-2xl rounded-bl-md px-4 py-3">
                <div className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-[#004469] dark:bg-blue-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="h-2 w-2 rounded-full bg-[#004469] dark:bg-blue-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="h-2 w-2 rounded-full bg-[#004469] dark:bg-blue-400 animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            </div>
          )}
          <div ref={bottomAnchorRef} aria-hidden />
        </div>

        {/* Input */}
        <div className="shrink-0 border-t border-gray-100 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2.5">
          <div className="flex items-center gap-2">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder={placeholder || 'Décrivez votre problème, je peux peut-être répondre directement.'}
              className="flex-1 min-h-[44px] rounded-xl bg-gray-50 dark:bg-slate-800 border border-transparent focus:border-[#004469] focus:bg-white dark:focus:bg-slate-900 px-3.5 text-sm text-seal-navy dark:text-white placeholder-seal-taupe/50 dark:placeholder-slate-500 focus:outline-none transition"
              disabled={loading}
            />
            <button
              onClick={() => handleSend()}
              disabled={!input.trim() || loading}
              aria-label="Envoyer le message"
              className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#004469] text-white disabled:opacity-30 disabled:pointer-events-none hover:bg-[#003352] active:scale-95 transition shrink-0"
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Floating trigger button ───────────────────────────────────
  if (!open) {
    return (
      <button
        onClick={() => {
          hapticTap();
          toggle();
        }}
        className="fixed bottom-20 right-4 lg:bottom-6 lg:right-6 z-40 flex h-14 w-14 lg:h-12 lg:w-12 items-center justify-center rounded-full bg-[#004469] text-white shadow-xl hover:bg-[#003352] hover:scale-105 active:scale-95 transition-all duration-200 group touch-manipulation"
        title="Assistant OMNITECH"
        aria-label="Ouvrir l'assistant IA"
      >
        <Sparkles className="h-6 w-6 lg:h-5 lg:w-5 group-hover:rotate-12 transition-transform" />
        {messages.length > 0 && (
          <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-[#F68D2E] text-[9px] font-bold text-white">
            {Math.min(messages.length, 9)}
          </span>
        )}
      </button>
    );
  }

  // ── Chat panel: fullscreen sheet (mobile) / floating (desktop) ─
  return (
    <>
      {/* Mobile scrim (tap to close) — hidden ≥ lg */}
      <div
        onClick={close}
        aria-hidden
        className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm lg:hidden animate-in fade-in duration-200"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label="Assistant OMNITECH"
        className={[
          // Mobile: fullscreen sheet slide-up from bottom
          "fixed inset-0 z-50 flex flex-col bg-white dark:bg-slate-900",
          "h-[100dvh] w-full",
          "animate-in slide-in-from-bottom-8 fade-in duration-300",
          // Desktop override: floating rounded panel
          "lg:inset-auto lg:bottom-6 lg:right-6 lg:h-auto lg:w-[380px] lg:max-w-[calc(100vw-2rem)]",
          "lg:rounded-2xl lg:border lg:border-gray-200 lg:dark:border-slate-700 lg:shadow-2xl",
          "lg:animate-in lg:slide-in-from-bottom-4 lg:duration-200",
        ].join(" ")}
      >
        {/* Header — sticky on mobile with safe-area padding */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-100 dark:border-slate-800 bg-white/90 dark:bg-slate-900/90 backdrop-blur px-4 py-3 pt-[calc(env(safe-area-inset-top)+0.75rem)] lg:pt-3">
          {/* Mobile grab-handle */}
          <div
            aria-hidden
            className="absolute left-1/2 top-1.5 -translate-x-1/2 h-1 w-10 rounded-full bg-gray-300 dark:bg-slate-700 lg:hidden"
          />
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="flex h-9 w-9 lg:h-8 lg:w-8 items-center justify-center rounded-lg bg-[#004469]/10 dark:bg-[#004469]/30 shrink-0">
              <Bot className="h-4 w-4 text-[#004469] dark:text-blue-400" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-seal-navy dark:text-white truncate">
                Assistant OMNITECH
              </h3>
              <p className="text-[10px] text-seal-gray-500 dark:text-slate-500 truncate">
                {moduleLabel(module)}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={() => {
                hapticTap();
                setShowActions(!showActions);
              }}
              className={`flex h-11 w-11 lg:h-8 lg:w-8 items-center justify-center rounded-lg transition active:scale-95 touch-manipulation ${showActions ? "bg-[#004469]/10 text-[#004469] dark:bg-blue-900/30 dark:text-blue-400" : "hover:bg-gray-100 dark:hover:bg-slate-800 text-seal-gray-500"}`}
              title="Actions rapides"
              aria-label="Actions rapides"
            >
              <Zap className="h-4 w-4 lg:h-3.5 lg:w-3.5" />
            </button>
            {messages.length > 0 && (
              <button
                onClick={() => {
                  hapticTap();
                  clearHistory();
                }}
                className="flex h-11 w-11 lg:h-8 lg:w-8 items-center justify-center rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800 text-seal-gray-500 hover:text-red-500 transition active:scale-95 touch-manipulation"
                title="Effacer l'historique"
                aria-label="Effacer l'historique"
              >
                <Trash2 className="h-4 w-4 lg:h-3.5 lg:w-3.5" />
              </button>
            )}
            <button
              onClick={close}
              className="flex h-11 w-11 lg:h-8 lg:w-8 items-center justify-center rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800 text-seal-gray-500 transition active:scale-95 touch-manipulation"
              aria-label="Fermer l'assistant"
            >
              <X className="h-5 w-5 lg:h-4 lg:w-4" />
            </button>
          </div>
        </div>

        {/* Context Actions Panel */}
        {showActions && contextActions.length > 0 && (
          <div className="shrink-0 border-b border-gray-100 dark:border-slate-800 px-4 py-3 bg-gray-50/50 dark:bg-slate-800/50">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-seal-gray-500 dark:text-slate-500 mb-2">
              Actions disponibles · {pageContext.intent}
            </p>
            <div className="space-y-1">
              {contextActions.slice(0, 4).map((action) => (
                <button
                  key={action.id}
                  onClick={() => {
                    hapticTap();
                    if (action.href) {
                      executeAction(action, router);
                      setTimeout(close, 150);
                    }
                  }}
                  className="w-full flex items-center gap-2.5 rounded-lg px-2.5 py-2.5 min-h-[44px] text-left hover:bg-white dark:hover:bg-slate-700 transition group active:scale-[0.99] touch-manipulation"
                >
                  <div className="flex h-8 w-8 items-center justify-center rounded-md bg-[#004469]/10 dark:bg-[#004469]/30 text-[#004469] dark:text-blue-400 group-hover:bg-[#004469]/20 transition flex-shrink-0">
                    <Zap className="h-3.5 w-3.5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-medium text-seal-navy dark:text-white truncate">
                      {action.label}
                    </p>
                    <p className="text-[11px] text-seal-gray-500 dark:text-slate-500 truncate">
                      {action.description}
                    </p>
                  </div>
                </button>
              ))}
            </div>
            {pageContext.helpText && (
              <p className="mt-2 text-[10px] text-seal-gray-500/70 dark:text-slate-600 italic">
                💡 {pageContext.helpText}
              </p>
            )}
          </div>
        )}

        {/* Messages — flex-1, overflow, natural mobile height */}
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 py-3 space-y-3 sm:space-y-4 lg:max-h-[400px] lg:min-h-[200px]"
        >
          {messages.length === 0 && !loading && (
            <div className="flex flex-col items-center justify-center text-center py-8 sm:py-6 px-2">
              <div className="relative mb-4">
                <div
                  className="absolute inset-0 animate-pulse rounded-full bg-[#F68D2E]/20 blur-xl"
                  aria-hidden
                />
                <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-[#004469] to-[#F68D2E] shadow-lg">
                  <Sparkles className="h-7 w-7 text-white" />
                </div>
              </div>
              <p className="text-base font-semibold text-seal-navy dark:text-white mb-1">
                Bonjour{user?.firstName ? ` ${user.firstName}` : ""} !
              </p>
              <p className="text-sm text-seal-gray-500 dark:text-slate-400 mb-5 max-w-xs">
                Je suis votre assistant. Posez-moi une question ou choisissez
                une suggestion.
              </p>
              <div className="flex flex-col gap-2 w-full max-w-sm">
                {suggestions.map((s) => (
                  <button
                    key={s}
                    onClick={() => handleSend(s)}
                    className="w-full rounded-xl border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 px-4 py-3 min-h-[44px] text-sm font-medium text-seal-navy dark:text-slate-200 hover:border-[#004469] hover:text-[#004469] dark:hover:border-blue-400 dark:hover:text-blue-400 active:scale-[0.98] transition touch-manipulation text-left"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[85%] sm:max-w-[75%] lg:max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed break-words [overflow-wrap:anywhere] ${
                  msg.role === "user"
                    ? "bg-[#004469] text-white rounded-br-md"
                    : "bg-gray-50 dark:bg-slate-800 text-seal-navy dark:text-slate-200 border border-gray-100 dark:border-slate-700 rounded-bl-md"
                }`}
              >
                {msg.content.split("\n").map((line, i) => {
                  // Render action links
                  const linkMatch = line.match(/^→ \[(.+?)\]\((.+?)\)$/);
                  if (linkMatch) {
                    return (
                      <Link
                        key={i}
                        href={linkMatch[2]!}
                        onClick={() => {
                          hapticTap();
                          setTimeout(close, 100);
                        }}
                        className="flex items-center gap-1.5 mt-1.5 text-xs font-medium text-[#004469] dark:text-blue-400 hover:underline active:scale-[0.98] touch-manipulation"
                      >
                        <ChevronDown className="h-3 w-3 rotate-[-90deg]" />
                        {linkMatch[1]}
                      </Link>
                    );
                  }
                  // Bold markdown
                  const parts = line.split(/(\*\*[^*]+\*\*)/g);
                  return (
                    <p key={i} className={i > 0 ? "mt-1" : ""}>
                      {parts.map((part, j) =>
                        part.startsWith("**") && part.endsWith("**") ? (
                          <strong key={j} className="font-semibold">
                            {part.slice(2, -2)}
                          </strong>
                        ) : (
                          <span key={j}>{part}</span>
                        ),
                      )}
                    </p>
                  );
                })}
                <p className="mt-1.5 text-[11px] opacity-60">
                  {new Date(msg.timestamp).toLocaleTimeString("fr-FR", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex justify-start">
              <div className="bg-gray-50 dark:bg-slate-800 border border-gray-100 dark:border-slate-700 rounded-2xl rounded-bl-md px-4 py-3">
                <div className="flex items-center gap-1.5">
                  <span
                    className="h-2 w-2 rounded-full bg-[#004469] dark:bg-blue-400 animate-bounce"
                    style={{ animationDelay: "0ms" }}
                  />
                  <span
                    className="h-2 w-2 rounded-full bg-[#004469] dark:bg-blue-400 animate-bounce"
                    style={{ animationDelay: "150ms" }}
                  />
                  <span
                    className="h-2 w-2 rounded-full bg-[#004469] dark:bg-blue-400 animate-bounce"
                    style={{ animationDelay: "300ms" }}
                  />
                </div>
              </div>
            </div>
          )}

          <div ref={bottomAnchorRef} aria-hidden />
        </div>

        {/* Horizontal-scroll quick suggestions when conversation exists */}
        {messages.length > 0 && !loading && (
          <div className="shrink-0 px-4 pb-2 pt-1">
            <div className="flex gap-2 overflow-x-auto scrollbar-none pb-1 -mx-4 px-4">
              {suggestions.map((s) => (
                <button
                  key={s}
                  onClick={() => handleSend(s)}
                  className="shrink-0 rounded-full bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 px-3 py-1.5 text-xs font-medium text-seal-gray-500 dark:text-slate-400 hover:text-seal-navy dark:hover:text-white active:scale-95 transition touch-manipulation"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Input — sticky bottom with safe-area inset */}
        <div className="shrink-0 border-t border-gray-100 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2.5 pb-[calc(env(safe-area-inset-bottom)+0.625rem)] lg:pb-2.5">
          <div className="flex items-center gap-2">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder="Posez une question..."
              className="flex-1 min-h-[44px] rounded-xl bg-gray-50 dark:bg-slate-800 border border-transparent focus:border-[#004469] focus:bg-white dark:focus:bg-slate-900 px-3.5 text-base lg:text-sm text-seal-navy dark:text-white placeholder-seal-taupe/50 dark:placeholder-slate-500 focus:outline-none transition touch-manipulation"
              inputMode="text"
              autoComplete="off"
              autoCorrect="on"
              enterKeyHint="send"
              disabled={loading}
            />
            <button
              onClick={() => handleSend()}
              disabled={!input.trim() || loading}
              aria-label="Envoyer le message"
              className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#004469] text-white disabled:opacity-30 disabled:pointer-events-none hover:bg-[#003352] active:scale-95 transition touch-manipulation shrink-0"
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
