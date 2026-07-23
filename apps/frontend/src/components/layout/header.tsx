"use client";

import React, { useState, useRef, useEffect, useMemo } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuthStore } from "@/stores/auth-store";
import { useNotificationStore, type Notification } from "@/stores/notification-store";
import { api } from "@/lib/api";
import { isRoleAtLeast, UserRole } from "@omnitech/shared";
import { Avatar } from "@omnitech/ui";
import { formatRelativeTime, getInitials } from "@/lib/utils";
import { useUIStore } from "@/stores/ui-store";
import { getAvatarUrl } from "@/lib/avatar";
import { StatusBar } from "./status-bar";
import { FocusModeToggle } from "@/components/ui/focus-mode-toggle";
import { useTranslation } from "@/lib/i18n";
import {
  Bell,
  User,
  LogOut,
  Settings,
  ChevronDown,
  Moon,
  Sun,
  Globe,
  Menu,
  Search,
  ChevronRight,
  ExternalLink,
  Home,
  Plus,
  FileText,
  Ticket,
  Newspaper,
  ShieldAlert,
  Layers,
  Sparkles,
} from "lucide-react";
import { restartOnboardingTour } from "@/components/onboarding-tour";

/**
 * Map each top-level route segment to its parent hub, so breadcrumbs can
 * prefix the current hub before the page title (Accueil > Hub > ... > Page).
 * Keep in sync with sidebar.tsx.
 */
interface HubCrumb {
  label: string;
  href: string;
  accent: "navy" | "blue" | "bordeaux" | "orange";
}
const HUB_BY_SEGMENT: Record<string, HubCrumb> = {
  // Mon espace (navy) — no hub landing (dashboard IS the landing)
  dashboard: { label: "Mon espace", href: "/dashboard", accent: "navy" },
  notifications: { label: "Mon espace", href: "/dashboard", accent: "navy" },
  profile: { label: "Mon espace", href: "/dashboard", accent: "navy" },
  tickets: { label: "Mon espace", href: "/dashboard", accent: "navy" },
  signatures: { label: "Mon espace", href: "/dashboard", accent: "navy" },
  calendar: { label: "Mon espace", href: "/dashboard", accent: "navy" },
  mfa: { label: "Mon espace", href: "/dashboard", accent: "navy" },
  // Travail & Connaissance
  documents: {
    label: "Travail & Connaissance",
    href: "/hub/work",
    accent: "blue",
  },
  procedures: {
    label: "Travail & Connaissance",
    href: "/hub/work",
    accent: "blue",
  },
  news: { label: "Travail & Connaissance", href: "/hub/work", accent: "blue" },
  wiki: { label: "Travail & Connaissance", href: "/hub/work", accent: "blue" },
  runbooks: {
    label: "Travail & Connaissance",
    href: "/hub/work",
    accent: "blue",
  },
  directory: {
    label: "Travail & Connaissance",
    href: "/hub/work",
    accent: "blue",
  },
  files: { label: "Travail & Connaissance", href: "/hub/work", accent: "blue" },
  search: {
    label: "Travail & Connaissance",
    href: "/hub/work",
    accent: "blue",
  },
  tools: { label: "Travail & Connaissance", href: "/hub/work", accent: "blue" },
  certificates: { label: "Mon espace", href: "/dashboard", accent: "navy" },
  // Sécurité & Conformité
  incidents: {
    label: "Sécurité & Conformité",
    href: "/hub/security",
    accent: "bordeaux",
  },
  alerts: {
    label: "Sécurité & Conformité",
    href: "/hub/security",
    accent: "bordeaux",
  },
  veille: {
    label: "Sécurité & Conformité",
    href: "/hub/security",
    accent: "bordeaux",
  },
  chartes: {
    label: "Sécurité & Conformité",
    href: "/hub/security",
    accent: "bordeaux",
  },
  helpdesk: {
    label: "Sécurité & Conformité",
    href: "/hub/security",
    accent: "bordeaux",
  },
  quiz: {
    label: "Sécurité & Conformité",
    href: "/hub/security",
    accent: "bordeaux",
  },
  satisfaction: {
    label: "Sécurité & Conformité",
    href: "/hub/security",
    accent: "bordeaux",
  },
  // Administration
  admin: { label: "Administration", href: "/admin", accent: "orange" },
  extranet: { label: "Administration", href: "/admin", accent: "orange" },
};

// Shared control class — all controls share the same 36px height for visual alignment.
// Focus ring élargi à 3px (audit a11y) pour rester perceptible sur les fonds
// orangés et clairs ; offset-2 conservé pour distinguer du contenu.
const CONTROL_BASE =
  "inline-flex h-9 items-center justify-center rounded-lg text-seal-gray-500 dark:text-slate-400 " +
  "hover:bg-gray-100 dark:hover:bg-slate-800 hover:text-seal-blue dark:hover:text-seal-orange " +
  "transition-colors focus-visible:outline-none focus-visible:ring-[3px] " +
  "focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-white " +
  "dark:focus-visible:ring-offset-slate-900";

interface TicketSpace {
  id: string;
  name: string;
  slug: string;
  color?: string | null;
  icon?: string | null;
  isDefault: boolean;
}

export function Header() {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const { notifications: storeNotifications, unreadCount, markAsRead } = useNotificationStore();
  const { toggleMobileSidebar, activeSpaceId, setActiveSpace } = useUIStore();
  const pathname = usePathname();
  const router = useRouter();
  const [showNotifPopup, setShowNotifPopup] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showCreateMenu, setShowCreateMenu] = useState(false);
  const [showSpaceMenu, setShowSpaceMenu] = useState(false);
  const [lastLoginAt, setLastLoginAt] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState<boolean>(true);
  const [spaces, setSpaces] = useState<TicketSpace[]>([]);
  const notifRef = useRef<HTMLDivElement>(null);
  const userRef = useRef<HTMLDivElement>(null);
  const createRef = useRef<HTMLDivElement>(null);
  const spaceRef = useRef<HTMLDivElement>(null);

  // Derive the 5 most recent notifications from the centralized store (no extra API call)
  const recentNotifs = useMemo(() => storeNotifications.slice(0, 5), [storeNotifications]);

  const BREADCRUMB_LABELS: Record<string, string> = {
    dashboard: "Tableau de bord",
    documents: "Documents",
    tickets: "Tickets",
    incidents: "Incidents",
    news: "Actualités",
    veille: "Veille cyber",
    wiki: "Wiki",
    helpdesk: "Support",
    calendar: "Calendrier",
    directory: "Annuaire",
    notifications: "Notifications",
    alerts: "Alertes",
    profile: "Mon profil",
    search: "Recherche",
    satisfaction: "Satisfaction",
    quiz: "Quiz",
    mfa: "MFA",
    signatures: "Signatures",
    files: "Fichiers",
    changelog: "Nouveautés",
    admin: "Administration",
    users: "Utilisateurs",
    compliance: "Conformité",
    config: "Configuration",
    departments: "Départements",
    onboarding: "Intégration",
    chartes: "Chartes",
    reports: "Rapports",
    "audit-log": "Journal d'audit",
    "ad-audit": "Audit AD",
    "access-reviews": "Revue des accès",
    "external-access": "Accès externes",
    "rssi-dashboard": "Dashboard RSSI",
    "it-exports": "Exports IT",
    spaces: "Espaces & modules",
    tools: "Outils",
    pdf: "PDF",
    new: "Nouveau",
    "new-inline": "Nouveau (en ligne)",
    edit: "Modifier",
    editor: "Éditeur",
    compose: "Rédiger",
    import: "Import CSV",
    pending: "En attente",
    organigramme: "Organigramme",
    contacts: "Contacts externes",
    runbooks: "Runbooks",
    certificates: "Certifications",
    workflows: "Workflows d'approbation",
    "audit-timeline": "Frise audit",
    "system-health": "Santé système",
    "dark-mode-audit": "Audit dark mode",
    backups: "Sauvegardes",
    "ldap-pending": "Validation LDAP",
    scanner: "Scanner",
    procedures: "Procédures",
  };

  const pathSegments = pathname.split("/").filter(Boolean);
  const rawBreadcrumbs = pathSegments.map((segment, i) => ({
    label:
      BREADCRUMB_LABELS[segment] ||
      segment.charAt(0).toUpperCase() + segment.slice(1).replace(/-/g, " "),
    href: "/" + pathSegments.slice(0, i + 1).join("/"),
    isLast: i === pathSegments.length - 1,
  }));

  // Resolve the hub for the current top-level segment and prepend it, so the
  // trail always reads Accueil > Hub > Page (unless we're already on a hub
  // landing or on a dashboard-level route where the hub is implicit).
  const topSegment = pathSegments[0] ?? "";
  const hub = HUB_BY_SEGMENT[topSegment];
  const isHubLanding = topSegment === "hub" || pathname === "/admin";
  const isSubAdmin = topSegment === "admin" && pathSegments.length > 1;
  // Don't duplicate: if the user is on /dashboard, /hub/work, /admin, etc. skip the hub crumb.
  const showHub =
    hub &&
    !isHubLanding &&
    !(topSegment === "dashboard" && pathSegments.length === 1) &&
    !(topSegment === "admin" && !isSubAdmin);

  const allBreadcrumbs: Array<(typeof rawBreadcrumbs)[number]> =
    showHub && hub
      ? [{ label: hub.label, href: hub.href, isLast: false }, ...rawBreadcrumbs]
      : rawBreadcrumbs;

  // For long paths (>4 segments): first, ellipsis, last 2
  type BreadcrumbItem =
    | (typeof allBreadcrumbs)[number]
    | {
        ellipsis: true;
        href?: undefined;
        label?: undefined;
        isLast?: undefined;
      };
  const breadcrumbs: BreadcrumbItem[] =
    allBreadcrumbs.length > 4
      ? [allBreadcrumbs[0]!, { ellipsis: true } as const, ...allBreadcrumbs.slice(-2)]
      : allBreadcrumbs;

  // Accent color per current hub for the last breadcrumb crumb.
  const lastAccentClass = useMemo(() => {
    if (!hub) return "text-seal-navy dark:text-white";
    switch (hub.accent) {
      case "blue":
        return "text-seal-blue dark:text-seal-blue";
      case "bordeaux":
        return "text-seal-bordeaux dark:text-seal-bordeaux";
      case "orange":
        return "text-seal-orange dark:text-seal-orange";
      case "navy":
      default:
        return "text-seal-navy dark:text-white";
    }
  }, [hub]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setShowNotifPopup(false);
      }
      if (userRef.current && !userRef.current.contains(e.target as Node)) {
        setShowUserMenu(false);
      }
      if (createRef.current && !createRef.current.contains(e.target as Node)) {
        setShowCreateMenu(false);
      }
      if (spaceRef.current && !spaceRef.current.contains(e.target as Node)) {
        setShowSpaceMenu(false);
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setShowNotifPopup(false);
        setShowUserMenu(false);
        setShowCreateMenu(false);
        setShowSpaceMenu(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKey);
    };
  }, []);

  // Online / offline indicator
  useEffect(() => {
    if (typeof navigator === "undefined") return;
    setIsOnline(navigator.onLine);
    const up = () => setIsOnline(true);
    const down = () => setIsOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
    };
  }, []);

  // Fetch last login date
  useEffect(() => {
    if (!user) return;
    api
      .get("/auth/me")
      .then(({ data }) => {
        if (data?.lastLoginAt) setLastLoginAt(data.lastLoginAt);
      })
      .catch(() => {});
  }, [user]);

  // Fetch ticket spaces for the space context indicator
  useEffect(() => {
    if (!user) return;
    api
      .get("/tickets/spaces")
      .then((r) => {
        const data = Array.isArray(r.data) ? r.data : [];
        setSpaces(data);
      })
      .catch(() => setSpaces([]));
  }, [user]);

  const activeSpace = spaces.find((s) => s.id === activeSpaceId) ?? null;

  if (!user) return null;

  const isAdmin = isRoleAtLeast(user.role, UserRole.ADMIN);
  const isSuperAdmin = isRoleAtLeast(user.role, UserRole.SUPER_ADMIN);
  const roleLabel =
    user.role === UserRole.SUPER_ADMIN
      ? "Super admin"
      : user.role === UserRole.ADMIN
        ? "Admin"
        : user.role === UserRole.DIRECTION
          ? "Direction"
          : null;

  const handleBellClick = () => {
    const next = !showNotifPopup;
    setShowNotifPopup(next);
    if (next) {
      setShowUserMenu(false);
      setShowCreateMenu(false);
    }
  };

  const getNotifHref = (n: Notification): string | null => {
    if (!n.resourceType || !n.resourceId) return null;
    const typeToPath: Record<string, string> = {
      Document: "documents",
      NewsPost: "news",
      Ticket: "tickets",
    };
    const path = typeToPath[n.resourceType];
    return path ? `/${path}/${n.resourceId}` : null;
  };

  const handleNotifClick = async (n: Notification) => {
    if (!n.isRead) {
      api.patch(`/notifications/${n.id}/read`).catch(() => {});
      markAsRead(n.id); // updates store → recentNotifs re-derives automatically
    }
    setShowNotifPopup(false);
    const href = getNotifHref(n);
    if (href) router.push(href);
  };

  const openQuickSearch = () => {
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", ctrlKey: true }));
  };

  const createActions: Array<{
    label: string;
    href: string;
    icon: React.ElementType;
    visible: boolean;
  }> = [
    {
      label: "Nouveau ticket",
      href: "/tickets?create=true",
      icon: Ticket,
      visible: true,
    },
    {
      label: "Nouveau document",
      href: "/documents/new",
      icon: FileText,
      visible: true,
    },
    {
      label: "Signaler un incident",
      href: "/incidents?create=true",
      icon: ShieldAlert,
      visible: true,
    },
    {
      label: "Rédiger une actualité",
      href: "/news/compose",
      icon: Newspaper,
      visible: isAdmin,
    },
  ];
  const visibleCreateActions = createActions.filter((a) => a.visible);

  return (
    <header className="sticky top-0 z-40 flex h-16 items-center justify-between border-b border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 md:px-6 shadow-[0_1px_0_0_rgba(249,150,74,0.15)]">
      {/* Animated gradient top bar — 4px, subtle shift */}
      <div
        aria-hidden="true"
        className="header-gradient-bar pointer-events-none absolute top-0 left-0 right-0 h-[4px] bg-gradient-to-r from-seal-blue via-primary to-seal-bordeaux opacity-90"
      />

      {/* LEFT — hamburger + breadcrumbs */}
      <div className="flex items-center gap-2 min-w-0">
        {/* Mobile hamburger */}
        <button
          onClick={toggleMobileSidebar}
          className={`lg:hidden -ml-2 w-9 px-0 ${CONTROL_BASE}`}
          aria-label="Ouvrir le menu"
        >
          <Menu className="h-5 w-5" />
        </button>

        {/* Breadcrumb navigation — fade on route change */}
        <nav
          key={pathname}
          aria-label="Fil d'Ariane"
          className="hidden sm:flex items-center gap-1.5 text-[13px] text-seal-gray-500 dark:text-slate-400 breadcrumb-fade min-w-0"
        >
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-1 hover:text-seal-blue dark:hover:text-seal-orange transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 rounded"
            aria-label="Accueil"
          >
            <Home className="h-3.5 w-3.5" />
            <span>Accueil</span>
          </Link>
          {breadcrumbs.map((crumb, idx) => (
            <React.Fragment key={"ellipsis" in crumb ? `ellipsis-${idx}` : `${idx}-${crumb.href}`}>
              <ChevronRight className="h-3.5 w-3.5 text-seal-gray-500/40 dark:text-slate-600 flex-shrink-0" />
              {"ellipsis" in crumb ? (
                <span
                  className="text-seal-gray-500/60 dark:text-slate-500 px-0.5"
                  aria-label="Segments masqués"
                  title="Segments masqués"
                >
                  ...
                </span>
              ) : crumb.isLast ? (
                <span className={`font-semibold truncate max-w-[200px] ${lastAccentClass}`}>
                  {crumb.label}
                </span>
              ) : (
                <Link
                  href={crumb.href}
                  className="hover:text-seal-blue dark:hover:text-seal-orange transition-colors truncate focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 rounded"
                >
                  {crumb.label}
                </Link>
              )}
            </React.Fragment>
          ))}
        </nav>

        {/* Mobile: show last two segments for context when possible */}
        <div className="sm:hidden flex items-center gap-1 text-[13px] min-w-0">
          {allBreadcrumbs.length >= 2 &&
            (() => {
              const prev = allBreadcrumbs[allBreadcrumbs.length - 2];
              return prev ? (
                <>
                  <Link
                    href={prev.href}
                    className="text-seal-gray-500 dark:text-slate-400 truncate hover:text-seal-blue dark:hover:text-seal-orange transition-colors"
                  >
                    {prev.label}
                  </Link>
                  <ChevronRight className="h-3.5 w-3.5 text-seal-gray-500/40 dark:text-slate-600 flex-shrink-0" />
                </>
              ) : null;
            })()}
          <span className={`font-semibold truncate ${lastAccentClass}`}>
            {allBreadcrumbs[allBreadcrumbs.length - 1]?.label || "Accueil"}
          </span>
        </div>
      </div>

      {/* RIGHT — controls */}
      <div className="flex items-center gap-1.5">
        {/* Space context indicator */}
        {spaces.length > 1 && (
          <div ref={spaceRef} className="relative hidden sm:block">
            <button
              onClick={() => {
                setShowSpaceMenu((v) => !v);
                setShowNotifPopup(false);
                setShowUserMenu(false);
                setShowCreateMenu(false);
              }}
              className={`${CONTROL_BASE} gap-1.5 px-2.5 text-[12px]`}
              aria-label="Sélectionner un espace"
              aria-haspopup="menu"
              aria-expanded={showSpaceMenu}
              title="Espace actif"
            >
              {activeSpace ? (
                <>
                  <span
                    className="h-2 w-2 rounded-full flex-shrink-0"
                    style={{ backgroundColor: activeSpace.color || "#6b7280" }}
                  />
                  <span className="max-w-[100px] truncate font-medium">{activeSpace.name}</span>
                </>
              ) : (
                <>
                  <Layers className="h-3.5 w-3.5" />
                  <span className="hidden lg:inline font-medium">Tous les espaces</span>
                </>
              )}
              <ChevronDown
                className={`h-3 w-3 transition-transform ${showSpaceMenu ? "rotate-180" : ""}`}
              />
            </button>
            {showSpaceMenu && (
              <div
                role="menu"
                aria-label="Espaces"
                className="header-dropdown-in absolute right-0 top-full mt-2 w-52 max-w-[calc(100vw-2rem)] rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-xl py-1 z-50"
              >
                <div className="px-4 py-2 border-b border-gray-100 dark:border-slate-700">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-seal-gray-500 dark:text-slate-500">
                    Espace actif
                  </p>
                </div>
                <div className="py-1">
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setActiveSpace(null);
                      setShowSpaceMenu(false);
                    }}
                    className={`flex w-full items-center gap-2.5 px-4 py-2 text-sm transition-colors hover:bg-gray-50 dark:hover:bg-slate-800 ${
                      !activeSpaceId
                        ? "text-seal-blue dark:text-seal-orange font-semibold"
                        : "text-seal-navy dark:text-slate-200"
                    }`}
                  >
                    <Layers className="h-3.5 w-3.5 text-seal-gray-500 dark:text-slate-400" />
                    Tous les espaces
                  </button>
                  {spaces.map((space) => (
                    <button
                      key={space.id}
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setActiveSpace(space.id);
                        setShowSpaceMenu(false);
                      }}
                      className={`flex w-full items-center gap-2.5 px-4 py-2 text-sm transition-colors hover:bg-gray-50 dark:hover:bg-slate-800 ${
                        activeSpaceId === space.id
                          ? "text-seal-blue dark:text-seal-orange font-semibold"
                          : "text-seal-navy dark:text-slate-200"
                      }`}
                    >
                      <span
                        className="h-2.5 w-2.5 rounded-full flex-shrink-0"
                        style={{ backgroundColor: space.color || "#6b7280" }}
                      />
                      {space.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Quick search — input-like bar, always visible kbd */}
        <button
          onClick={openQuickSearch}
          className={
            "hidden sm:inline-flex h-9 items-center gap-2 rounded-lg border border-gray-200 dark:border-slate-700 " +
            "bg-gray-50/60 dark:bg-slate-800/40 px-3 text-[13px] text-seal-gray-500 dark:text-slate-400 " +
            "hover:bg-white dark:hover:bg-slate-800 hover:border-primary/40 hover:shadow-[0_0_0_1px_rgba(249,150,74,0.15)] " +
            "transition-all duration-200 md:w-[200px] lg:w-[260px] w-10 " +
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 " +
            "dark:focus-visible:ring-offset-slate-900"
          }
          title="Navigation rapide (Ctrl+K)"
          aria-label="Recherche rapide"
        >
          <Search className="h-4 w-4 flex-shrink-0" />
          <span className="hidden md:inline flex-1 text-left">Naviguer...</span>
          <kbd className="hidden md:inline-flex items-center gap-0.5 rounded border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-900 px-1.5 py-0.5 text-[10px] font-mono font-semibold text-seal-gray-500 dark:text-slate-400">
            Ctrl K
          </kbd>
        </button>

        {/* Create / quick actions menu */}
        {visibleCreateActions.length > 0 && (
          <div ref={createRef} className="relative">
            <button
              onClick={() => {
                setShowCreateMenu((v) => !v);
                setShowUserMenu(false);
                setShowNotifPopup(false);
              }}
              className={`${CONTROL_BASE} gap-1 px-2.5 text-[13px] font-semibold text-seal-blue dark:text-seal-orange hover:bg-seal-blue/10 dark:hover:bg-seal-orange/10`}
              aria-label="Nouvelle action rapide"
              aria-haspopup="menu"
              aria-expanded={showCreateMenu}
              title="Créer..."
            >
              <Plus className="h-4 w-4" />
              <span className="hidden lg:inline">Nouveau</span>
            </button>
            {showCreateMenu && (
              <div
                role="menu"
                aria-label="Actions rapides"
                className="header-dropdown-in absolute right-0 top-full mt-2 w-60 max-w-[calc(100vw-2rem)] rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-xl py-1 z-50"
              >
                <div className="px-4 py-2 border-b border-gray-100 dark:border-slate-700">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-seal-gray-500 dark:text-slate-500">
                    Actions rapides
                  </p>
                </div>
                <div className="py-1">
                  {visibleCreateActions.map((action) => {
                    const Icon = action.icon;
                    return (
                      <Link
                        key={action.href}
                        href={action.href}
                        role="menuitem"
                        onClick={() => setShowCreateMenu(false)}
                        className="flex items-center gap-2.5 px-4 py-2 text-sm text-seal-navy dark:text-slate-200 hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors focus-visible:outline-none focus-visible:bg-gray-50 dark:focus-visible:bg-slate-800"
                      >
                        <Icon className="h-4 w-4 text-seal-blue dark:text-seal-orange" />
                        {action.label}
                      </Link>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Focus mode toggle */}
        <FocusModeToggle />

        {/* Dark mode toggle */}
        <DarkModeToggle />

        {/* Language toggle */}
        <LanguageToggle />

        {/* Notifications dropdown */}
        <div ref={notifRef} className="relative">
          <button
            onClick={handleBellClick}
            className={`${CONTROL_BASE} relative w-9`}
            aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} non lues)` : ""}`}
            aria-haspopup="menu"
            aria-expanded={showNotifPopup}
          >
            <Bell className="h-[18px] w-[18px]" />
            {unreadCount > 0 && (
              <span className="absolute -right-0.5 top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-semibold text-white ring-2 ring-white dark:ring-slate-900 animate-pulse">
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            )}
          </button>

          {showNotifPopup && (
            <div
              role="menu"
              aria-label="Notifications récentes"
              className="header-dropdown-in absolute right-0 top-full mt-2 w-80 max-w-[calc(100vw-2rem)] bg-white dark:bg-slate-900 rounded-xl shadow-xl border border-gray-200 dark:border-slate-700 overflow-hidden z-50"
            >
              <div className="px-4 py-3 border-b border-gray-100 dark:border-slate-700 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-seal-navy dark:text-white">
                  Notifications
                </h3>
                <Link
                  href="/notifications"
                  className="text-xs text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded"
                  onClick={() => setShowNotifPopup(false)}
                >
                  Tout voir
                </Link>
              </div>
              <div className="max-h-80 overflow-y-auto scrollbar-thin">
                {recentNotifs.length === 0 ? (
                  <p className="text-xs text-seal-gray-500 dark:text-slate-400 text-center py-6">
                    Aucune notification
                  </p>
                ) : (
                  recentNotifs.map((n) => (
                    <button
                      key={n.id}
                      type="button"
                      role="menuitem"
                      onClick={() => handleNotifClick(n)}
                      className={`w-full text-left flex items-start gap-3 px-4 py-3 border-b border-gray-50 dark:border-slate-800 hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors focus-visible:outline-none focus-visible:bg-gray-50 dark:focus-visible:bg-slate-800 ${!n.isRead ? "bg-primary/5" : ""}`}
                    >
                      {/* Unread indicator dot */}
                      <div className="pt-1.5 flex-shrink-0">
                        <div
                          className={`h-2 w-2 rounded-full ${!n.isRead ? "bg-primary" : "bg-transparent"}`}
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-seal-navy dark:text-white line-clamp-1">
                          {n.title}
                        </p>
                        {n.body && (
                          <p className="text-[10px] text-seal-gray-500 dark:text-slate-400 line-clamp-1 mt-0.5">
                            {n.body}
                          </p>
                        )}
                        <p className="text-[10px] text-seal-gray-500 dark:text-slate-500 mt-1">
                          {formatRelativeTime(n.createdAt)}
                        </p>
                      </div>
                      {getNotifHref(n) && (
                        <ExternalLink
                          className="h-3.5 w-3.5 text-seal-gray-500 dark:text-slate-500 flex-shrink-0 mt-1"
                          aria-hidden="true"
                        />
                      )}
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* Global Status Bar — macOS-menubar-style indicator cluster */}
        <StatusBar />

        {/* User menu */}
        <div ref={userRef} className="relative">
          <button
            onClick={() => {
              setShowUserMenu((v) => !v);
              setShowNotifPopup(false);
              setShowCreateMenu(false);
            }}
            className={
              "inline-flex h-9 items-center gap-2 rounded-lg px-1.5 sm:pr-2.5 " +
              "hover:bg-gray-100 dark:hover:bg-slate-800 hover:ring-1 hover:ring-primary/20 " +
              "transition-colors focus-visible:outline-none focus-visible:ring-2 " +
              "focus-visible:ring-primary focus-visible:ring-offset-2 " +
              "dark:focus-visible:ring-offset-slate-900"
            }
            aria-label="Menu utilisateur"
            aria-haspopup="menu"
            aria-expanded={showUserMenu}
          >
            <span className="relative">
              <Avatar
                src={getAvatarUrl(user.avatarUrl)}
                initials={getInitials(user.firstName, user.lastName)}
                size="sm"
              />
              {/* Online / offline indicator on avatar */}
              <span
                className={`absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full ring-2 ring-white dark:ring-slate-900 ${
                  isOnline ? "bg-emerald-500" : "bg-red-500"
                }`}
                title={isOnline ? t("header.connected") : t("header.offline")}
                aria-label={isOnline ? t("header.connected") : t("header.offline")}
              />
            </span>
            <span className="hidden sm:flex flex-col items-start leading-tight">
              <span className="text-[13px] font-semibold text-seal-navy dark:text-white">
                {user.firstName}
              </span>
              {roleLabel && (
                <span className="text-[9px] uppercase tracking-wide font-semibold text-seal-orange">
                  {roleLabel}
                </span>
              )}
            </span>
            <ChevronDown
              className={`h-3.5 w-3.5 text-seal-gray-500 dark:text-slate-400 transition-transform ${showUserMenu ? "rotate-180" : ""}`}
            />
          </button>

          {showUserMenu && (
            <div
              role="menu"
              aria-label="Menu utilisateur"
              className="header-dropdown-in absolute right-0 top-full mt-2 w-56 max-w-[calc(100vw-2rem)] rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-xl py-1 z-50"
            >
              <div className="px-4 py-2.5 border-b border-gray-100 dark:border-slate-700">
                <p className="text-sm font-semibold text-seal-navy dark:text-white truncate">
                  {user.firstName} {user.lastName}
                </p>
                <p className="text-[11px] text-seal-gray-500 dark:text-slate-400 truncate">
                  {user.email}
                </p>
                {lastLoginAt && (
                  <p className="text-[10px] text-seal-gray-500/70 dark:text-slate-500 mt-1">
                    Dernière connexion : {formatRelativeTime(lastLoginAt)}
                  </p>
                )}
              </div>
              <div className="py-1">
                <Link
                  href="/profile"
                  role="menuitem"
                  className="flex items-center gap-2.5 px-4 py-2 text-sm text-seal-navy dark:text-slate-200 hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors focus-visible:outline-none focus-visible:bg-gray-50 dark:focus-visible:bg-slate-800"
                  onClick={() => setShowUserMenu(false)}
                >
                  <User className="h-4 w-4 text-seal-gray-500 dark:text-slate-400" />
                  Mon profil
                </Link>
                {isSuperAdmin && (
                  <Link
                    href="/admin/config"
                    role="menuitem"
                    className="flex items-center gap-2.5 px-4 py-2 text-sm text-seal-navy dark:text-slate-200 hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors focus-visible:outline-none focus-visible:bg-gray-50 dark:focus-visible:bg-slate-800"
                    onClick={() => setShowUserMenu(false)}
                  >
                    <Settings className="h-4 w-4 text-seal-gray-500 dark:text-slate-400" />
                    Paramètres système
                  </Link>
                )}
              </div>
              <Link
                href="/testimonials"
                role="menuitem"
                className="flex items-center gap-2.5 px-4 py-2 text-sm text-seal-navy dark:text-slate-200 hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors focus-visible:outline-none focus-visible:bg-gray-50 dark:focus-visible:bg-slate-800"
                onClick={() => setShowUserMenu(false)}
              >
                <Sparkles className="h-4 w-4 text-seal-gray-500 dark:text-slate-400" />
                Partager mon avis
              </Link>
              <Link
                href="/welcome"
                role="menuitem"
                className="flex items-center gap-2.5 px-4 py-2 text-sm text-seal-navy dark:text-slate-200 hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors focus-visible:outline-none focus-visible:bg-gray-50 dark:focus-visible:bg-slate-800"
                onClick={() => setShowUserMenu(false)}
              >
                <ExternalLink className="h-4 w-4 text-seal-gray-500 dark:text-slate-400" />
                Portail OMNITECH
              </Link>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setShowUserMenu(false);
                  restartOnboardingTour();
                }}
                className="flex w-full items-center gap-2.5 px-4 py-2 text-sm text-seal-navy dark:text-slate-200 hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors focus-visible:outline-none focus-visible:bg-gray-50 dark:focus-visible:bg-slate-800"
              >
                <Sparkles className="h-4 w-4 text-seal-gray-500 dark:text-slate-400" />
                Relancer la visite guidée
              </button>
              <hr className="my-1 border-gray-100 dark:border-slate-700" />
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setShowUserMenu(false);
                  logout();
                }}
                className="flex w-full items-center gap-2.5 px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors focus-visible:outline-none focus-visible:bg-red-50 dark:focus-visible:bg-red-900/20"
              >
                <LogOut className="h-4 w-4" />
                Déconnexion
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

function DarkModeToggle() {
  const { t } = useTranslation();
  const { darkMode, toggleDarkMode } = useUIStore();
  return (
    <button
      onClick={toggleDarkMode}
      className={
        "inline-flex h-9 w-9 items-center justify-center rounded-lg text-seal-gray-500 dark:text-slate-400 " +
        "hover:bg-gray-100 dark:hover:bg-slate-800 hover:text-seal-blue dark:hover:text-seal-orange " +
        "transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary " +
        "focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900"
      }
      title={darkMode ? t("header.lightMode") : t("header.darkMode")}
      aria-label={darkMode ? t("header.activateLight") : t("header.activateDark")}
      aria-pressed={darkMode}
    >
      {darkMode ? <Sun className="h-[18px] w-[18px]" /> : <Moon className="h-[18px] w-[18px]" />}
    </button>
  );
}

function LanguageToggle() {
  const { t } = useTranslation();
  const { locale, setLocale } = useUIStore();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  const LANGS: Array<{ value: "fr" | "en"; label: string; flag: string }> = [
    { value: "fr", label: "Français", flag: "🇫🇷" },
    { value: "en", label: "English", flag: "🇬🇧" },
  ];
  const current = LANGS.find((l) => l.value === locale) ?? LANGS[0]!;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className={
          "inline-flex h-9 w-9 items-center justify-center rounded-lg text-base " +
          "text-seal-gray-500 dark:text-slate-400 " +
          "hover:bg-gray-100 dark:hover:bg-slate-800 hover:text-seal-blue dark:hover:text-seal-orange " +
          "transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary " +
          "focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900"
        }
        title={locale === "fr" ? t("header.switchToEn") : t("header.switchToFr")}
        aria-label={`${t("header.language") || "Language"}: ${current.label}`}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <span aria-hidden="true">{current.flag}</span>
      </button>
      {open && (
        <div
          role="menu"
          aria-label={t("header.language") || "Language"}
          className="header-dropdown-in absolute right-0 top-full mt-2 w-44 max-w-[calc(100vw-2rem)] rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-xl py-1 z-50"
        >
          {LANGS.map((lang) => {
            const active = lang.value === locale;
            return (
              <button
                key={lang.value}
                type="button"
                role="menuitemradio"
                aria-checked={active}
                onClick={() => {
                  setLocale(lang.value);
                  setOpen(false);
                  // next-intl reads the cookie via src/i18n/request.ts on the
                  // next RSC render — router.refresh() triggers it without a
                  // hard reload (preserves client state, sidebar scroll, etc.).
                  router.refresh();
                }}
                className={`flex w-full items-center gap-2.5 px-4 py-2 text-sm transition-colors hover:bg-gray-50 dark:hover:bg-slate-800 focus-visible:outline-none focus-visible:bg-gray-50 dark:focus-visible:bg-slate-800 ${
                  active
                    ? "text-seal-blue dark:text-seal-orange font-semibold"
                    : "text-seal-navy dark:text-slate-200"
                }`}
              >
                <span className="text-base" aria-hidden="true">
                  {lang.flag}
                </span>
                <span className="flex-1 text-left">{lang.label}</span>
                {active && (
                  <span className="text-[11px] uppercase tracking-wide">{lang.value}</span>
                )}
              </button>
            );
          })}
          <div className="px-4 pt-1.5 pb-1 text-[10px] text-seal-gray-500/70 dark:text-slate-500 border-t border-gray-100 dark:border-slate-700 mt-1">
            <Globe className="h-3 w-3 inline mr-1" />
            {locale === "fr" ? t("header.switchToEn") : t("header.switchToFr")}
          </div>
        </div>
      )}
    </div>
  );
}
