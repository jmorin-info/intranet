"use client";

/**
 * Vue 360° des accès effectifs (`/admin/access-overview`).
 *
 * Synthèse non-éditable qui croise pour un utilisateur :
 *   - son rôle global (et la hiérarchie ROLE_HIERARCHY associée)
 *   - son département principal et les modules autorisés à ce département
 *   - les overrides USER-level sur SpaceAccessConfig
 *
 * Source : appels READ-ONLY aux endpoints existants
 *   GET /users/directory          → liste users (sélecteur)
 *   GET /spaces/modules           → catalogue modules
 *   GET /users/:id/space-access   → règles USER scope
 *   GET /spaces/configs           → règles GLOBAL/ROLE/DEPARTMENT
 *
 * NE MODIFIE PAS la logique d'autorisation backend — affiche uniquement.
 *
 * Bouton "Tester en tant que..." = simulation locale (recalcul des règles
 * front-end). Pas de switch d'auth, pas d'appel privilégié.
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardHeader,
  Badge,
  Skeleton,
  Select,
  Button,
} from "@omnitech/ui";
import {
  KeyRound,
  Eye,
  Settings,
  Layers,
  ShieldCheck,
  Building2,
  Check,
  X,
  Info,
  Crown,
} from "lucide-react";
import { UserRole, USER_ROLE_LABELS, ROLE_HIERARCHY } from "@omnitech/shared";
import { PageHeader } from "@/components/layout/page-header";
import { RoleGuard } from "@/components/role-guard";
import { AdminGroupTabs } from "@/components/layout/admin-group-tabs";
import { api } from "@/lib/api";
import { logger } from "@/lib/logger";
import { useAuthStore } from "@/stores/auth-store";
import { useTranslation } from "@/lib/i18n";

// ── Types ────────────────────────────────────────────────────────────

interface DirectoryUser {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
  jobTitle: string | null;
  departmentId: string | null;
  department: { id: string; name: string; code: string } | null;
}

interface ModuleDef {
  code: string;
  label: string;
  alwaysOn?: boolean;
  section?: string;
}

interface SpaceConfig {
  id: string;
  module: string;
  scopeType: "GLOBAL" | "DEPARTMENT" | "ROLE" | "USER";
  scopeValue: string | null;
  enabled: boolean;
}

const SECTION_LABELS: Record<string, string> = {
  monEspace: "Mon espace",
  work: "Travail & connaissance",
  security: "Sécurité & conformité",
  admin: "Administration",
  transverse: "Transversal",
};
const SECTION_ORDER = ["monEspace", "work", "security", "admin", "transverse"];

// Reproduit la résolution backend (cf. SpacesService.getModulesForUser).
// Priorité : USER > ROLE > DEPARTMENT > GLOBAL > default(true).
function resolveEnabled(args: {
  module: ModuleDef;
  userId: string;
  role: string;
  departmentId: string | null;
  configs: SpaceConfig[];
}): {
  enabled: boolean;
  source:
    | "USER"
    | "ROLE"
    | "DEPARTMENT"
    | "GLOBAL"
    | "DEFAULT"
    | "ALWAYS_ON"
    | "ADMIN_OVERRIDE";
} {
  const { module, userId, role, departmentId, configs } = args;
  if (module.alwaysOn) return { enabled: true, source: "ALWAYS_ON" };

  let enabled = true;
  let source:
    | "USER"
    | "ROLE"
    | "DEPARTMENT"
    | "GLOBAL"
    | "DEFAULT"
    | "ALWAYS_ON"
    | "ADMIN_OVERRIDE" = "DEFAULT";

  const g = configs.find(
    (c) => c.module === module.code && c.scopeType === "GLOBAL",
  );
  if (g) {
    enabled = g.enabled;
    source = "GLOBAL";
  }
  if (departmentId) {
    const d = configs.find(
      (c) =>
        c.module === module.code &&
        c.scopeType === "DEPARTMENT" &&
        c.scopeValue === departmentId,
    );
    if (d) {
      enabled = d.enabled;
      source = "DEPARTMENT";
    }
  }
  const r = configs.find(
    (c) =>
      c.module === module.code &&
      c.scopeType === "ROLE" &&
      c.scopeValue === role,
  );
  if (r) {
    enabled = r.enabled;
    source = "ROLE";
  }
  const u = configs.find(
    (c) =>
      c.module === module.code &&
      c.scopeType === "USER" &&
      c.scopeValue === userId,
  );
  if (u) {
    enabled = u.enabled;
    source = "USER";
  }
  // Mirror backend: ADMIN/SUPER_ADMIN voient toujours admin module
  if (
    module.code === "admin" &&
    ROLE_HIERARCHY[role as UserRole] >= ROLE_HIERARCHY[UserRole.ADMIN]
  ) {
    enabled = true;
    if (source !== "USER" && source !== "ROLE") source = "ADMIN_OVERRIDE";
  }
  return { enabled, source };
}

// ── Page ─────────────────────────────────────────────────────────────

export default function AccessOverviewPage() {
  const { t } = useTranslation();
  const me = useAuthStore((s) => s.user);

  const [users, setUsers] = useState<DirectoryUser[]>([]);
  const [modules, setModules] = useState<ModuleDef[]>([]);
  const [configs, setConfigs] = useState<SpaceConfig[]>([]);
  const [loading, setLoading] = useState(true);

  // selectedUserId = user inspecté (sélecteur)
  // simulationActive = true → on prétend "voir comme" cet utilisateur
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [simulationActive, setSimulationActive] = useState(false);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [usersRes, modulesRes, configsRes] = await Promise.allSettled([
        api.get("/users/directory", { params: { limit: 200 } }),
        api.get("/spaces/modules"),
        api.get("/spaces/configs"),
      ]);
      if (usersRes.status === "fulfilled") {
        const list: DirectoryUser[] =
          usersRes.value.data?.data || usersRes.value.data || [];
        setUsers(Array.isArray(list) ? list : []);
      } else {
        logger.error(usersRes.reason, {
          page: "admin/access-overview",
          context: "load users",
        });
      }
      if (modulesRes.status === "fulfilled") {
        setModules(modulesRes.value.data?.modules || []);
      } else {
        logger.error(modulesRes.reason, {
          page: "admin/access-overview",
          context: "load modules",
        });
      }
      if (configsRes.status === "fulfilled") {
        setConfigs(configsRes.value.data?.data || []);
      } else {
        logger.error(configsRes.reason, {
          page: "admin/access-overview",
          context: "load configs",
        });
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const selectedUser = useMemo(
    () => users.find((u) => u.id === selectedUserId) || null,
    [users, selectedUserId],
  );

  // Modules groupés par section
  const modulesBySection = useMemo(() => {
    const map = new Map<string, ModuleDef[]>();
    for (const m of modules) {
      const sec = m.section ?? "transverse";
      const list = map.get(sec) ?? [];
      list.push(m);
      map.set(sec, list);
    }
    return SECTION_ORDER.map((sec) => ({
      section: sec,
      label: SECTION_LABELS[sec] ?? sec,
      modules: map.get(sec) ?? [],
    })).filter((g) => g.modules.length > 0);
  }, [modules]);

  // Calcul des accès effectifs pour l'user sélectionné
  const effective = useMemo(() => {
    if (!selectedUser) return null;
    const rows = modules.map((m) => {
      const r = resolveEnabled({
        module: m,
        userId: selectedUser.id,
        role: selectedUser.role,
        departmentId: selectedUser.departmentId,
        configs,
      });
      return { module: m, ...r };
    });
    const allowed = rows.filter((r) => r.enabled).length;
    return { rows, allowed, total: rows.length };
  }, [selectedUser, modules, configs]);

  const userOptions = useMemo(
    () => [
      { value: "", label: "— Sélectionner un utilisateur —" },
      ...users.map((u) => ({
        value: u.id,
        label: `${u.lastName.toUpperCase()} ${u.firstName} (${USER_ROLE_LABELS[u.role as UserRole] || u.role})`,
      })),
    ],
    [users],
  );

  const isSuperAdmin = me?.role === UserRole.SUPER_ADMIN;

  return (
    <RoleGuard minRole={UserRole.SUPER_ADMIN}>
      <div className="space-y-6">
        <AdminGroupTabs group="identity" />
        <PageHeader
          title={t("admin.access.overview.title") as string}
          subtitle={t("admin.access.overview.subtitle") as string}
          icon={KeyRound}
          hub="admin"
        />

        {/* Bandeau orientation */}
        <div className="rounded-card border border-blue-200 bg-blue-50 dark:border-blue-900/40 dark:bg-blue-900/10 px-4 py-3 text-sm flex gap-3">
          <Info className="h-5 w-5 flex-shrink-0 text-blue-600 dark:text-blue-400 mt-0.5" />
          <div className="space-y-1">
            <p className="text-seal-navy dark:text-white font-semibold">
              {t("admin.access.overview.bannerTitle") as string}
            </p>
            <p className="text-seal-gray-500 dark:text-slate-400 text-xs">
              {t("admin.access.overview.bannerDesc") as string}{" "}
              <Link
                href="/admin/config"
                className="inline-flex items-center gap-1 font-semibold text-primary hover:underline"
              >
                <Settings className="h-3.5 w-3.5" /> Configuration globale
              </Link>{" "}
              ·{" "}
              <Link
                href="/admin/access?tab=departments"
                className="inline-flex items-center gap-1 font-semibold text-primary hover:underline"
              >
                <Layers className="h-3.5 w-3.5" /> Départements & modules
              </Link>{" "}
              ·{" "}
              <Link
                href="/admin/access?tab=users"
                className="inline-flex items-center gap-1 font-semibold text-primary hover:underline"
              >
                <KeyRound className="h-3.5 w-3.5" /> Override par utilisateur
              </Link>
            </p>
          </div>
        </div>

        {/* Sélecteur user */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <h2 className="text-sm font-semibold text-seal-navy dark:text-white flex items-center gap-2">
                  <Eye className="h-4 w-4" />
                  {t("admin.access.overview.selectUser") as string}
                </h2>
                <p className="text-xs text-seal-gray-500 dark:text-slate-400 mt-1">
                  {t("admin.access.overview.selectHelp") as string}
                </p>
              </div>
              {selectedUser && isSuperAdmin && (
                <Button
                  variant={simulationActive ? "primary" : "outline"}
                  size="sm"
                  onClick={() => setSimulationActive((v) => !v)}
                  aria-pressed={simulationActive}
                >
                  <Eye className="h-4 w-4" />
                  {simulationActive
                    ? (t("admin.access.overview.simulationOn") as string)
                    : (t("admin.access.overview.simulate") as string)}
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-10 rounded-lg" />
            ) : (
              <Select
                value={selectedUserId}
                onChange={(e) => {
                  setSelectedUserId(e.target.value);
                  setSimulationActive(false);
                }}
                options={userOptions}
                aria-label={t("admin.access.overview.selectUser") as string}
              />
            )}
            {simulationActive && selectedUser && (
              <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-900/10 dark:border-amber-900/40 px-3 py-2 text-xs text-amber-900 dark:text-amber-200 flex items-center gap-2">
                <Crown className="h-4 w-4" />
                {t("admin.access.overview.simulationNotice") as string}{" "}
                <span className="font-semibold">
                  {selectedUser.firstName} {selectedUser.lastName}
                </span>{" "}
                · {t("admin.access.overview.readOnly") as string}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Synthèse */}
        {selectedUser && effective && (
          <>
            {/* Cartes meta */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card>
                <CardContent className="py-4">
                  <p className="text-[10px] uppercase tracking-wider text-seal-gray-500 dark:text-slate-500">
                    {t("admin.access.overview.role") as string}
                  </p>
                  <p className="mt-1 text-sm font-semibold text-seal-navy dark:text-white flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4 text-primary" />
                    {USER_ROLE_LABELS[selectedUser.role as UserRole] ||
                      selectedUser.role}
                    <Badge variant="navy" className="font-mono text-[10px]">
                      L{ROLE_HIERARCHY[selectedUser.role as UserRole] ?? "?"}
                    </Badge>
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="py-4">
                  <p className="text-[10px] uppercase tracking-wider text-seal-gray-500 dark:text-slate-500">
                    {t("admin.access.overview.department") as string}
                  </p>
                  <p className="mt-1 text-sm font-semibold text-seal-navy dark:text-white flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-primary" />
                    {selectedUser.department?.name || "—"}
                    {selectedUser.department && (
                      <Badge variant="navy" className="font-mono text-[10px]">
                        {selectedUser.department.code}
                      </Badge>
                    )}
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="py-4">
                  <p className="text-[10px] uppercase tracking-wider text-seal-gray-500 dark:text-slate-500">
                    {t("admin.access.overview.modules") as string}
                  </p>
                  <p className="mt-1 text-sm font-semibold text-seal-navy dark:text-white flex items-center gap-2">
                    <KeyRound className="h-4 w-4 text-primary" />
                    {effective.allowed} / {effective.total}{" "}
                    <span className="text-xs font-normal text-seal-gray-500 dark:text-slate-400">
                      {t("admin.access.overview.allowed") as string}
                    </span>
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Tableau modules × accès effectif */}
            <Card>
              <CardHeader>
                <h3 className="text-sm font-semibold text-seal-navy dark:text-white">
                  {t("admin.access.overview.tableTitle") as string}
                </h3>
                <p className="text-xs text-seal-gray-500 dark:text-slate-400 mt-1">
                  {t("admin.access.overview.tableHelp") as string}
                </p>
              </CardHeader>
              <CardContent className="p-0 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 dark:border-slate-700">
                      <th className="text-left px-4 py-2 text-[10px] uppercase tracking-widest font-medium text-seal-gray-500 dark:text-slate-500">
                        Module
                      </th>
                      <th className="text-center px-3 py-2 text-[10px] uppercase tracking-widest font-medium text-seal-gray-500 dark:text-slate-500">
                        {t("admin.access.overview.effective") as string}
                      </th>
                      <th className="text-left px-3 py-2 text-[10px] uppercase tracking-widest font-medium text-seal-gray-500 dark:text-slate-500">
                        {t("admin.access.overview.source") as string}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-slate-800">
                    {modulesBySection.map((group) => (
                      <React.Fragment key={group.section}>
                        <tr className="bg-seal-navy/5 dark:bg-slate-800/60">
                          <td
                            colSpan={3}
                            className="px-4 py-1.5 text-[11px] font-semibold uppercase tracking-widest text-seal-navy dark:text-slate-300"
                          >
                            {group.label}
                          </td>
                        </tr>
                        {group.modules.map((mod) => {
                          const row = effective.rows.find(
                            (r) => r.module.code === mod.code,
                          );
                          if (!row) return null;
                          return (
                            <tr
                              key={mod.code}
                              className="hover:bg-gray-50 dark:hover:bg-slate-800/40"
                            >
                              <td className="px-4 py-2">
                                <div className="font-semibold text-seal-navy dark:text-white text-xs">
                                  {mod.label}
                                </div>
                                <div className="text-[10px] font-mono text-seal-gray-500 dark:text-slate-500">
                                  {mod.code}
                                </div>
                              </td>
                              <td className="px-3 py-2 text-center">
                                {row.enabled ? (
                                  <span className="inline-flex items-center justify-center h-6 w-6 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
                                    <Check className="h-3.5 w-3.5" />
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center justify-center h-6 w-6 rounded-full bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300">
                                    <X className="h-3.5 w-3.5" />
                                  </span>
                                )}
                              </td>
                              <td className="px-3 py-2">
                                <SourceBadge source={row.source} />
                              </td>
                            </tr>
                          );
                        })}
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>

            {/* Légende */}
            <div className="flex flex-wrap gap-2 text-[11px] text-seal-gray-500 dark:text-slate-400">
              <SourceBadge source="USER" /> override utilisateur ·
              <SourceBadge source="ROLE" /> règle rôle ·
              <SourceBadge source="DEPARTMENT" /> règle département ·
              <SourceBadge source="GLOBAL" /> règle globale ·
              <SourceBadge source="DEFAULT" /> par défaut ·
              <SourceBadge source="ALWAYS_ON" /> module obligatoire
            </div>
          </>
        )}

        {!loading && !selectedUser && (
          <Card>
            <CardContent className="py-10 text-center text-seal-gray-500 dark:text-slate-400 text-sm">
              {t("admin.access.overview.empty") as string}
            </CardContent>
          </Card>
        )}
      </div>
    </RoleGuard>
  );
}

function SourceBadge({
  source,
}: {
  source:
    | "USER"
    | "ROLE"
    | "DEPARTMENT"
    | "GLOBAL"
    | "DEFAULT"
    | "ALWAYS_ON"
    | "ADMIN_OVERRIDE";
}) {
  const map: Record<string, { label: string; cls: string }> = {
    USER: {
      label: "USER",
      cls: "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300",
    },
    ROLE: {
      label: "ROLE",
      cls: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
    },
    DEPARTMENT: {
      label: "DEPT",
      cls: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
    },
    GLOBAL: {
      label: "GLOBAL",
      cls: "bg-gray-100 text-gray-700 dark:bg-slate-700 dark:text-slate-300",
    },
    DEFAULT: {
      label: "défaut",
      cls: "bg-gray-50 text-gray-500 dark:bg-slate-800 dark:text-slate-500",
    },
    ALWAYS_ON: {
      label: "always-on",
      cls: "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300",
    },
    ADMIN_OVERRIDE: {
      label: "admin",
      cls: "bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-300",
    },
  };
  const cfg = map[source] ?? { label: source, cls: "" };
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-mono uppercase tracking-wider ${cfg.cls}`}
    >
      {cfg.label}
    </span>
  );
}
