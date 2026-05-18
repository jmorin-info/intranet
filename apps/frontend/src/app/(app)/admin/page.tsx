"use client";

/**
 * Hub Admin — organisation en 4 sections thématiques.
 *
 * Référence : docs/admin/HUB_TAXONOMY.md
 *
 *   A. Users & Access       — identités, rôles, revues d'accès
 *   B. Compliance & Audit   — traçabilité, contrôles ISO, RSSI
 *   C. Content & Data      — chartes, workflows, exports, backups
 *   D. Infrastructure & Ops — config, santé, espaces, certificats
 *
 * Chaque item n'apparaît que dans UNE section. Le filtrage RBAC est
 * effectué avec isRoleAtLeast() pour cacher les cards auxquelles l'user
 * n'a pas accès.
 */

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { LucideIcon } from "lucide-react";
import {
  Cog,
  Users,
  Building2,
  UserCheck2,
  ShieldCheck,
  ClipboardList,
  ShieldAlert,
  BarChart3,
  Shield,
  PenLine,
  Layers,
  FileText,
  ClipboardCheck,
  HardDrive,
  Settings,
  HeartPulse,
  Award,
  Globe2,
  UserCog,
  Ticket,
  MessageCircle,
  Camera,
  Activity,
} from "lucide-react";
import { Card, CardContent } from "@omnitech/ui";
import { isRoleAtLeast, UserRole } from "@omnitech/shared";
import { useAuthStore } from "@/stores/auth-store";
import { features } from "@/lib/features";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

interface AdminItem {
  /** Clé i18n sous admin.items (ex: 'users' → admin.items.users.title). */
  key: string;
  href: string;
  icon: LucideIcon;
  minRole: UserRole;
  /** Filtrage feature flag (optionnel). */
  flag?: boolean;
}

interface AdminSection {
  id: "users" | "compliance" | "content" | "infra";
  /** Couleur accent hex (charte SEAL). */
  accent: string;
  icon: LucideIcon;
  items: AdminItem[];
}

interface QuickStats {
  totalUsers: number | null;
  totalDocuments: number | null;
  totalTickets: number | null;
  systemHealth: "ok" | "degraded" | "unknown";
}

// -----------------------------------------------------------------------------
// Taxonomie — 4 sections (voir docs/admin/HUB_TAXONOMY.md)
// -----------------------------------------------------------------------------

function buildSections(): AdminSection[] {
  return [
    {
      id: "users",
      accent: "#296DC1", // SEAL blue
      icon: UserCog,
      items: [
        {
          key: "users",
          href: "/admin/users",
          icon: Users,
          minRole: UserRole.ADMIN,
        },
        {
          key: "departments",
          href: "/admin/departments",
          icon: Building2,
          minRole: UserRole.ADMIN,
        },
        {
          key: "ldapPending",
          href: "/admin/ldap-pending",
          icon: UserCheck2,
          minRole: UserRole.ADMIN,
        },
        {
          key: "accessReviews",
          href: "/admin/access-reviews",
          icon: ShieldCheck,
          minRole: UserRole.SUPER_ADMIN,
        },
        {
          key: "externalAccess",
          href: "/admin/external-access",
          icon: Globe2,
          minRole: UserRole.ADMIN,
        },
        {
          key: "onboarding",
          href: "/admin/onboarding",
          icon: Users,
          minRole: UserRole.ADMIN,
          flag: features.onboardingAdmin,
        },
      ],
    },
    {
      id: "compliance",
      accent: "#892034", // SEAL bordeaux
      icon: ShieldCheck,
      items: [
        {
          key: "audit",
          href: "/admin/audit",
          icon: ClipboardList,
          minRole: UserRole.ADMIN,
        },
        {
          key: "compliance",
          href: "/admin/compliance",
          icon: ShieldCheck,
          minRole: UserRole.REVIEWER,
        },
        {
          key: "adAudit",
          href: "/admin/ad-audit",
          icon: ShieldAlert,
          minRole: UserRole.ADMIN,
        },
        {
          key: "rssiDashboard",
          href: "/admin/rssi-dashboard",
          icon: BarChart3,
          minRole: UserRole.SUPER_ADMIN,
        },
      ],
    },
    {
      id: "content",
      accent: "#F9964A", // SEAL orange
      icon: FileText,
      items: [
        {
          key: "content",
          href: "/admin/content",
          icon: FileText,
          minRole: UserRole.ADMIN,
        },
        {
          key: "chartes",
          href: "/admin/chartes",
          icon: Shield,
          minRole: UserRole.ADMIN,
        },
        {
          key: "signatures",
          href: "/admin/signatures",
          icon: PenLine,
          minRole: UserRole.ADMIN,
        },
        {
          key: "workflows",
          href: "/admin/workflows",
          icon: Layers,
          minRole: UserRole.REVIEWER,
        },
        {
          key: "feedback",
          href: "/admin/feedback",
          icon: MessageCircle,
          minRole: UserRole.ADMIN,
        },
        {
          key: "media",
          href: "/admin/media",
          icon: Camera,
          minRole: UserRole.ADMIN,
        },
        {
          key: "reports",
          href: "/admin/reports",
          icon: BarChart3,
          minRole: UserRole.ADMIN,
        },
        {
          key: "itExports",
          href: "/admin/it-exports",
          icon: ClipboardCheck,
          minRole: UserRole.ADMIN,
        },
        {
          key: "backups",
          href: "/admin/backups",
          icon: HardDrive,
          minRole: UserRole.SUPER_ADMIN,
        },
      ],
    },
    {
      id: "infra",
      accent: "#006233", // SEAL green
      icon: Cog,
      items: [
        {
          key: "config",
          href: "/admin/config",
          icon: Settings,
          minRole: UserRole.SUPER_ADMIN,
        },
        {
          key: "systemHealth",
          href: "/admin/system-health",
          icon: HeartPulse,
          minRole: UserRole.ADMIN,
        },
        {
          key: "systemMonitoring",
          href: "/admin/system-monitoring",
          icon: Activity,
          minRole: UserRole.ADMIN,
        },
        {
          key: "spaces",
          href: "/admin/spaces",
          icon: Layers,
          minRole: UserRole.SUPER_ADMIN,
        },
        {
          key: "ticketSpaces",
          href: "/admin/ticket-spaces",
          icon: Ticket,
          minRole: UserRole.ADMIN,
        },
        {
          key: "certificates",
          href: "/admin/certificates",
          icon: Award,
          minRole: UserRole.ADMIN,
        },
        {
          key: "webdav",
          href: "/admin/webdav",
          icon: HardDrive,
          minRole: UserRole.ADMIN,
        },
      ],
    },
  ];
}

// -----------------------------------------------------------------------------
// Stats compactes (conservées depuis la version précédente)
// -----------------------------------------------------------------------------

const STAT_ITEMS: Array<{
  key: keyof Omit<QuickStats, "systemHealth">;
  /** Clé i18n sous admin.stats. */
  labelKey: "users" | "documents" | "tickets";
  icon: LucideIcon;
  bg: string;
}> = [
  {
    key: "totalUsers",
    labelKey: "users",
    icon: Users,
    bg: "bg-seal-blue/10 text-seal-blue",
  },
  {
    key: "totalDocuments",
    labelKey: "documents",
    icon: FileText,
    bg: "bg-seal-green/10 text-seal-green",
  },
  {
    key: "totalTickets",
    labelKey: "tickets",
    icon: Ticket,
    bg: "bg-seal-orange/10 text-seal-orange",
  },
];

// -----------------------------------------------------------------------------
// Composant principal
// -----------------------------------------------------------------------------

export default function AdminLandingPage() {
  const t = useTranslations("admin");
  const user = useAuthStore((s) => s.user);
  const sections = useMemo(() => buildSections(), []);
  const [stats, setStats] = useState<QuickStats>({
    totalUsers: null,
    totalDocuments: null,
    totalTickets: null,
    systemHealth: "unknown",
  });

  useEffect(() => {
    Promise.allSettled([
      api.get("/users", { params: { limit: 1 } }),
      api.get("/reports/dashboard-stats"),
      api.get("/tickets", { params: { limit: 1 } }),
    ]).then(([usersR, dashR, ticketsR]) => {
      const s: QuickStats = {
        totalUsers: null,
        totalDocuments: null,
        totalTickets: null,
        systemHealth: "ok",
      };
      if (usersR.status === "fulfilled") {
        const d = usersR.value?.data;
        s.totalUsers =
          d?.meta?.total ?? (Array.isArray(d?.data) ? d.data.length : null);
      }
      if (dashR.status === "fulfilled") {
        s.totalDocuments = dashR.value?.data?.totalDocuments ?? null;
        s.systemHealth = "ok";
      } else {
        s.systemHealth = "degraded";
      }
      if (ticketsR.status === "fulfilled") {
        s.totalTickets = ticketsR.value?.data?.meta?.total ?? null;
      }
      setStats(s);
    });
  }, []);

  const healthColor =
    stats.systemHealth === "ok"
      ? "text-seal-green"
      : stats.systemHealth === "degraded"
        ? "text-seal-orange"
        : "text-seal-gray-400";
  const healthBg =
    stats.systemHealth === "ok"
      ? "bg-seal-green/10"
      : stats.systemHealth === "degraded"
        ? "bg-seal-orange/10"
        : "bg-seal-gray-100";
  const healthLabel =
    stats.systemHealth === "ok"
      ? t("stats.healthOk")
      : stats.systemHealth === "degraded"
        ? t("stats.healthDegraded")
        : t("stats.healthLoading");

  // Filtrage RBAC + feature flag
  const visibleSections = useMemo(() => {
    if (!user) return sections;
    return sections
      .map((section) => ({
        ...section,
        items: section.items.filter((item) => {
          if (item.flag === false) return false;
          return isRoleAtLeast(user.role, item.minRole);
        }),
      }))
      .filter((section) => section.items.length > 0);
  }, [sections, user]);

  return (
    <div className="animate-fade-in-up mx-auto max-w-6xl px-4 py-8 md:py-10">
      {/* Header */}
      <header className="mb-8 flex items-center gap-4">
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-seal-orange/15 text-seal-orange shadow-seal">
          <Cog className="h-7 w-7" />
        </span>
        <div>
          <h1 className="text-2xl md:text-3xl font-semibold text-seal-gray-600 dark:text-white">
            {t("title")}
          </h1>
          <p className="text-sm text-seal-gray-400 dark:text-slate-400 mt-1">
            {t("subtitle")}
          </p>
        </div>
      </header>

      {/* Stats compactes */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
        {STAT_ITEMS.map(({ key, labelKey, icon: Icon, bg }) => (
          <div
            key={key}
            className="stagger-item flex items-center gap-3 p-4 rounded-xl border border-seal-gray-100 dark:border-slate-800 bg-white dark:bg-slate-900"
          >
            <div
              className={cn(
                "h-10 w-10 rounded-lg flex items-center justify-center flex-shrink-0",
                bg,
              )}
            >
              <Icon className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xl font-semibold text-seal-gray-600 dark:text-white">
                {stats[key] !== null ? (
                  stats[key]
                ) : (
                  <span className="inline-block w-8 h-5 rounded shimmer" />
                )}
              </p>
              <p className="text-[11px] text-seal-gray-400 dark:text-slate-400">
                {t(`stats.${labelKey}`)}
              </p>
            </div>
          </div>
        ))}
        <div className="stagger-item flex items-center gap-3 p-4 rounded-xl border border-seal-gray-100 dark:border-slate-800 bg-white dark:bg-slate-900">
          <div
            className={cn(
              "h-10 w-10 rounded-lg flex items-center justify-center flex-shrink-0",
              healthBg,
            )}
          >
            <HeartPulse className={cn("h-5 w-5", healthColor)} />
          </div>
          <div>
            <p className={cn("text-xl font-semibold", healthColor)}>
              {healthLabel}
            </p>
            <p className="text-[11px] text-seal-gray-400 dark:text-slate-400">
              {t("stats.systemHealth")}
            </p>
          </div>
        </div>
      </div>

      {/* 4 sections en grid 2×2 (desktop) / 1 colonne (mobile) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {visibleSections.map((section) => {
          const SectionIcon = section.icon;
          return (
            <section
              key={section.id}
              aria-labelledby={`section-${section.id}-title`}
              className="rounded-2xl border border-seal-gray-100 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-card"
            >
              <header className="mb-4 flex items-center gap-3">
                <span
                  className="flex h-10 w-10 items-center justify-center rounded-lg flex-shrink-0"
                  style={{
                    backgroundColor: `${section.accent}1a`,
                    color: section.accent,
                  }}
                >
                  <SectionIcon className="h-5 w-5" />
                </span>
                <div>
                  <h2
                    id={`section-${section.id}-title`}
                    className="text-base font-semibold text-seal-gray-600 dark:text-white"
                  >
                    {t(`sections.${section.id}.title`)}
                  </h2>
                  <p className="text-xs text-seal-gray-400 dark:text-slate-400">
                    {t(`sections.${section.id}.subtitle`)}
                  </p>
                </div>
              </header>
              <ul className="space-y-1.5">
                {section.items.map((item) => {
                  const Icon = item.icon;
                  return (
                    <li key={item.href}>
                      <Link href={item.href} className="group block">
                        <Card
                          hoverable
                          className="transition-transform duration-150 group-hover:-translate-y-0.5"
                        >
                          <CardContent className="py-3">
                            <div className="flex items-start gap-3">
                              <span
                                className="flex h-8 w-8 items-center justify-center rounded-md flex-shrink-0"
                                style={{
                                  backgroundColor: `${section.accent}14`,
                                  color: section.accent,
                                }}
                              >
                                <Icon className="h-4 w-4" />
                              </span>
                              <div className="flex-1 min-w-0">
                                <h3 className="text-sm font-semibold text-seal-gray-600 dark:text-white truncate">
                                  {t(`items.${item.key}.title`)}
                                </h3>
                                <p className="text-xs text-seal-gray-400 dark:text-slate-400 line-clamp-1">
                                  {t(`items.${item.key}.description`)}
                                </p>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </div>

      {/* Footer admin : build version déployé — utile pour le débogage prod */}
      <AdminBuildFooter />
    </div>
  );
}

function AdminBuildFooter() {
  const t = useTranslations("admin.footer");
  const version = process.env.NEXT_PUBLIC_BUILD_VERSION || "dev";
  return (
    <div className="mt-12 pt-4 border-t border-gray-200 dark:border-slate-700 flex items-center justify-between text-[11px] text-seal-gray-400 dark:text-slate-500">
      <span>{t("title")}</span>
      <Link
        href="/changelog"
        className="inline-flex items-center gap-1.5 hover:text-seal-navy dark:hover:text-white transition font-mono"
        title={t("viewChangelog")}
      >
        <span
          className="h-1.5 w-1.5 rounded-full bg-emerald-500"
          aria-hidden="true"
        />
        build {version}
      </Link>
    </div>
  );
}
