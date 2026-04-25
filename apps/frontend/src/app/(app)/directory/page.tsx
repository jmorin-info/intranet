"use client";

import React, { useEffect, useState, useMemo } from "react";
import { api } from "@/lib/api";
import { useAuthStore } from "@/stores/auth-store";
import { useTranslation } from "@/lib/i18n";
import { UserRole, isRoleAtLeast } from "@omnitech/shared";
import {
  Card,
  CardContent,
  Badge,
  SearchInput,
  Select,
  Avatar,
} from "@omnitech/ui";
import {
  Users,
  Mail,
  Building2,
  Search,
  GitBranchPlus,
  Phone,
  MapPin,
  ExternalLink,
  LayoutGrid,
  List,
  Download,
} from "lucide-react";
import Link from "next/link";
import { getAvatarUrl } from "@/lib/avatar";
import { logger } from "@/lib/logger";
import { formatUserName } from "@/lib/utils";
import { PageHeader } from "@/components/layout/page-header";

interface DirectoryUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  departmentId: string | null;
  department: { id: string; name: string } | null;
  isActive: boolean;
  lastLoginAt: string | null;
  jobTitle: string | null;
  phone: string | null;
  location: string | null;
  avatarUrl: string | null;
}

const ROLE_COLORS: Record<string, string> = {
  SUPER_ADMIN: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  ADMIN:
    "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
  REVIEWER:
    "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
  COLLABORATEUR:
    "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  PRESTATAIRE:
    "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300",
};

const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN: "Super Admin",
  ADMIN: "Admin",
  REVIEWER: "Réviseur",
  COLLABORATEUR: "Collaborateur",
  PRESTATAIRE: "Prestataire",
};

const AVATAR_COLORS = [
  "bg-blue-500",
  "bg-emerald-500",
  "bg-violet-500",
  "bg-amber-500",
  "bg-rose-500",
  "bg-cyan-500",
  "bg-indigo-500",
  "bg-teal-500",
  "bg-orange-500",
  "bg-pink-500",
  "bg-lime-600",
  "bg-fuchsia-500",
];

function getAvatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length] || "";
}

type ViewMode = "grid" | "list";

export default function DirectoryPage() {
  const user = useAuthStore((s) => s.user);
  const { t } = useTranslation();
  const isAdmin = user && isRoleAtLeast(user.role, UserRole.ADMIN);
  const [users, setUsers] = useState<DirectoryUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("grid");

  useEffect(() => {
    async function fetchUsers() {
      try {
        const res = await api.get("/users/directory", {
          params: { limit: 200 },
        });
        const data = res.data?.data || res.data || [];
        setUsers(Array.isArray(data) ? data : []);
      } catch (err) {
        logger.error(err, { page: "directory", context: "load users" });
      } finally {
        setLoading(false);
      }
    }
    fetchUsers();
  }, [t]);

  const departments = useMemo(() => {
    const deptMap = new Map<string, string>();
    users.forEach((u) => {
      if (u.department) {
        deptMap.set(u.department.id, u.department.name);
      }
    });
    return Array.from(deptMap.entries())
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [users]);

  const roles = useMemo(() => {
    const roleSet = new Set<string>();
    users.forEach((u) => roleSet.add(u.role));
    return Array.from(roleSet).sort();
  }, [users]);

  const departmentCounts = useMemo(() => {
    const counts = new Map<string, { name: string; count: number }>();
    users
      .filter((u) => u.isActive)
      .forEach((u) => {
        const key = u.department?.id ?? "__none__";
        const name = u.department?.name ?? "Sans département";
        const entry = counts.get(key);
        if (entry) {
          entry.count++;
        } else {
          counts.set(key, { name, count: 1 });
        }
      });
    return Array.from(counts.entries())
      .map(([id, { name, count }]) => ({ id, name, count }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [users]);

  const isOnline = (lastLoginAt: string | null): boolean => {
    if (!lastLoginAt) return false;
    return Date.now() - new Date(lastLoginAt).getTime() < 5 * 60 * 1000;
  };

  const handleExportCsv = () => {
    const header = [
      "Prénom",
      "Nom",
      "Email",
      "Poste",
      "Département",
      "Téléphone",
      "Localisation",
      "Rôle",
    ];
    const rows = filteredUsers.map((u) => [
      u.firstName,
      u.lastName,
      u.email,
      u.jobTitle ?? "",
      u.department?.name ?? "",
      u.phone ?? "",
      u.location ?? "",
      ROLE_LABELS[u.role] ?? u.role,
    ]);
    const csvContent = [header, ...rows]
      .map((row) =>
        row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(","),
      )
      .join("\n");
    const blob = new Blob(["\uFEFF" + csvContent], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `annuaire_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      if (!u.isActive) return false;
      const q = search.toLowerCase();
      if (q) {
        const fullName = formatUserName(u).toLowerCase();
        const dept = (u.department?.name || "").toLowerCase();
        if (
          !fullName.includes(q) &&
          !u.email.toLowerCase().includes(q) &&
          !dept.includes(q)
        )
          return false;
      }
      if (departmentFilter && u.department?.id !== departmentFilter)
        return false;
      if (roleFilter && u.role !== roleFilter) return false;
      return true;
    });
  }, [users, search, departmentFilter, roleFilter]);

  const getInitials = (first: string, last: string) =>
    `${first.charAt(0)}${last.charAt(0)}`.toUpperCase();

  return (
    <div className="space-y-6 animate-fade-in-up">
      <PageHeader
        title={t("directory.title")}
        subtitle={t("directory.subtitle")}
        icon={Users}
        hub="monEspace"
        actions={
          !loading ? (
            <Badge className="bg-primary/10 text-primary dark:bg-primary/20">
              {filteredUsers.length} {t("directory.employees")}
            </Badge>
          ) : undefined
        }
      />

      {/* Tab navigation */}
      <div className="flex items-center gap-1 border-b border-gray-200 dark:border-slate-700 overflow-x-auto">
        <div className="flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold text-primary border-b-2 border-primary">
          <Users className="h-4 w-4" />
          Annuaire
        </div>
        <Link
          href="/directory/organigramme"
          className="flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium text-seal-gray-500 dark:text-slate-400 hover:text-seal-navy dark:hover:text-white border-b-2 border-transparent hover:border-gray-300 dark:hover:border-slate-600 transition-colors"
        >
          <GitBranchPlus className="h-4 w-4" />
          Organigramme
        </Link>
        <Link
          href="/directory/contacts"
          className="flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium text-seal-gray-500 dark:text-slate-400 hover:text-seal-navy dark:hover:text-white border-b-2 border-transparent hover:border-gray-300 dark:hover:border-slate-600 transition-colors"
        >
          <ExternalLink className="h-4 w-4" />
          Contacts externes
        </Link>
      </div>

      {/* Filters + view toggle — sticky */}
      <div className="sticky top-0 z-20">
        <Card className="shadow-sm rounded-xl">
          <CardContent className="p-4">
            <div className="flex flex-col md:flex-row gap-3">
              {/* Search */}
              <div className="flex-1">
                <SearchInput
                  value={search}
                  onChange={setSearch}
                  placeholder={t("directory.searchPlaceholder")}
                />
              </div>
              {/* Department filter */}
              <div className="w-full md:w-56">
                <Select
                  value={departmentFilter}
                  onChange={(e) => setDepartmentFilter(e.target.value)}
                  options={departments}
                  placeholder={t("directory.allDepartments")}
                />
              </div>
              {/* View toggle */}
              <div className="flex items-center gap-1 rounded-lg border border-gray-200 dark:border-slate-700 p-1 self-start md:self-auto">
                <button
                  onClick={() => setViewMode("grid")}
                  title="Vue grille"
                  className={`p-1.5 rounded-md transition-all duration-200 ${
                    viewMode === "grid"
                      ? "bg-primary text-white shadow-sm"
                      : "text-seal-gray-500 dark:text-slate-400 hover:text-seal-navy dark:hover:text-white hover:bg-gray-50 dark:hover:bg-slate-800"
                  }`}
                >
                  <LayoutGrid className="h-4 w-4" />
                </button>
                <button
                  onClick={() => setViewMode("list")}
                  title="Vue liste"
                  className={`p-1.5 rounded-md transition-all duration-200 ${
                    viewMode === "list"
                      ? "bg-primary text-white shadow-sm"
                      : "text-seal-gray-500 dark:text-slate-400 hover:text-seal-navy dark:hover:text-white hover:bg-gray-50 dark:hover:bg-slate-800"
                  }`}
                >
                  <List className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Role pills — visible to all */}
            {roles.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 mt-3 pt-3 border-t border-gray-100 dark:border-slate-700">
                <span className="text-[10px] font-semibold text-seal-gray-500 dark:text-slate-500 uppercase tracking-wider mr-1">
                  Rôle
                </span>
                <button
                  onClick={() => setRoleFilter("")}
                  className={`px-3 py-1 rounded-full text-xs font-medium transition-all duration-200 ${
                    roleFilter === ""
                      ? "bg-primary text-white shadow-sm"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600"
                  }`}
                >
                  {t("common.all")}
                </button>
                {roles.map((role) => (
                  <button
                    key={role}
                    onClick={() =>
                      setRoleFilter(roleFilter === role ? "" : role)
                    }
                    className={`px-3 py-1 rounded-full text-xs font-medium transition-all duration-200 ${
                      roleFilter === role
                        ? "bg-primary text-white shadow-sm"
                        : "bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600"
                    }`}
                  >
                    {ROLE_LABELS[role] || role}
                  </button>
                ))}
                {/* Result counter */}
                {!loading && (
                  <span className="ml-auto text-xs text-seal-gray-500 dark:text-slate-400">
                    {filteredUsers.length} résultat
                    {filteredUsers.length !== 1 ? "s" : ""}
                  </span>
                )}
              </div>
            )}
            {/* Department count pills */}
            {departmentCounts.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 mt-3 pt-3 border-t border-gray-100 dark:border-slate-700">
                <span className="text-[10px] font-semibold text-seal-gray-500 dark:text-slate-500 uppercase tracking-wider mr-1">
                  Départements
                </span>
                {departmentCounts.map((d) => (
                  <button
                    key={d.id}
                    onClick={() =>
                      setDepartmentFilter(
                        departmentFilter === d.id
                          ? ""
                          : d.id === "__none__"
                            ? ""
                            : d.id,
                      )
                    }
                    className={`px-3 py-1 rounded-full text-xs font-medium transition-all duration-200 ${
                      departmentFilter === d.id
                        ? "bg-primary text-white shadow-sm"
                        : "bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600"
                    }`}
                  >
                    {d.name} ({d.count})
                  </button>
                ))}
                {/* Export CSV */}
                <button
                  onClick={handleExportCsv}
                  className="ml-auto inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600 transition-all duration-200"
                >
                  <Download className="h-3 w-3" />
                  Exporter CSV
                </button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Loading state */}
      {loading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="p-6">
                <div className="flex flex-col items-center gap-3">
                  <div className="w-16 h-16 rounded-full shimmer" />
                  <div className="w-32 h-4 rounded shimmer" />
                  <div className="w-20 h-3 rounded shimmer" />
                  <div className="w-40 h-3 rounded shimmer" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && filteredUsers.length === 0 && (
        <Card>
          <CardContent className="p-12 text-center">
            <Search className="h-12 w-12 mx-auto text-gray-300 dark:text-slate-600 mb-4" />
            <p className="text-lg font-medium text-seal-navy dark:text-white">
              {t("common.noResults")}
            </p>
            <p className="text-sm text-seal-gray-500 dark:text-slate-400 mt-1">
              {t("directory.noResultsHint")}
            </p>
          </CardContent>
        </Card>
      )}

      {/* User grid view */}
      {!loading && filteredUsers.length > 0 && viewMode === "grid" && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredUsers.map((u) => {
            const initials = getInitials(u.firstName, u.lastName);
            const colorClass = getAvatarColor(u.firstName + u.lastName);
            return (
              <Card
                key={u.id}
                hoverable
                className="stagger-item shadow-sm rounded-xl group"
              >
                <CardContent className="p-5">
                  <div className="flex flex-col items-center text-center gap-3">
                    {/* Avatar — prominent + online indicator */}
                    <div className="relative">
                      <Avatar
                        src={getAvatarUrl(u.avatarUrl)}
                        initials={initials}
                        size="lg"
                        className={`!w-20 !h-20 !text-xl ring-2 ring-white dark:ring-slate-800 shadow-md group-hover:scale-105 transition-transform duration-200 ${!u.avatarUrl ? colorClass : ""}`}
                      />
                      <span
                        title={
                          isOnline(u.lastLoginAt) ? "En ligne" : "Hors ligne"
                        }
                        className={`absolute bottom-0 right-0 block h-4 w-4 rounded-full ring-2 ring-white dark:ring-slate-800 ${
                          isOnline(u.lastLoginAt)
                            ? "bg-emerald-500"
                            : "bg-gray-300 dark:bg-slate-600"
                        }`}
                      />
                    </div>

                    {/* Name + job title block */}
                    <div className="space-y-0.5">
                      <h3 className="font-medium text-seal-navy dark:text-white text-sm leading-tight">
                        {formatUserName(u)}
                      </h3>
                      {u.jobTitle && (
                        <p className="text-xs text-seal-gray-500 dark:text-slate-400 truncate max-w-[180px]">
                          {u.jobTitle}
                        </p>
                      )}
                    </div>

                    {/* Department badge */}
                    {u.department && (
                      <Badge className="bg-primary/10 text-primary dark:bg-primary/20 text-[11px] font-medium">
                        {u.department.name}
                      </Badge>
                    )}

                    {/* Location */}
                    {u.location && (
                      <div className="flex items-center gap-1.5 text-[11px] text-seal-gray-500 dark:text-slate-400">
                        <MapPin className="h-3 w-3 flex-shrink-0" />
                        <span className="truncate">{u.location}</span>
                      </div>
                    )}

                    {/* Contact icons row */}
                    <div className="flex items-center gap-1 pt-1 border-t border-gray-100 dark:border-slate-700 w-full justify-center">
                      <a
                        href={`mailto:${u.email}`}
                        title={u.email}
                        className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-seal-gray-500 dark:text-slate-400 hover:text-primary hover:bg-primary/10 transition-all duration-200"
                      >
                        <Mail className="h-4 w-4" />
                      </a>
                      {u.phone && (
                        <a
                          href={`tel:${u.phone}`}
                          title={u.phone}
                          className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-seal-gray-500 dark:text-slate-400 hover:text-primary hover:bg-primary/10 transition-all duration-200"
                        >
                          <Phone className="h-4 w-4" />
                        </a>
                      )}
                    </div>

                    {/* Role badge — discrete */}
                    <Badge
                      className={`text-[9px] ${isAdmin ? ROLE_COLORS[u.role] || "bg-gray-100 text-gray-800 dark:bg-slate-800 dark:text-slate-200" : "bg-gray-100 text-gray-600 dark:bg-slate-700 dark:text-slate-300"}`}
                    >
                      {isAdmin
                        ? ROLE_LABELS[u.role] || u.role
                        : "Collaborateur"}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* User list view */}
      {!loading && filteredUsers.length > 0 && viewMode === "list" && (
        <Card className="shadow-sm rounded-xl overflow-hidden">
          <div className="divide-y divide-gray-100 dark:divide-slate-800">
            {filteredUsers.map((u) => {
              const initials = getInitials(u.firstName, u.lastName);
              const colorClass = getAvatarColor(u.firstName + u.lastName);
              return (
                <div
                  key={u.id}
                  className="flex items-center gap-3 px-5 py-3 hover:bg-gray-50 dark:hover:bg-slate-800/50 transition-colors duration-200"
                >
                  {/* Avatar + online indicator */}
                  <div className="relative flex-shrink-0">
                    <Avatar
                      src={getAvatarUrl(u.avatarUrl)}
                      initials={initials}
                      size="md"
                      className={`${!u.avatarUrl ? colorClass : ""}`}
                    />
                    <span
                      title={
                        isOnline(u.lastLoginAt) ? "En ligne" : "Hors ligne"
                      }
                      className={`absolute bottom-0 right-0 block h-3 w-3 rounded-full ring-2 ring-white dark:ring-slate-800 ${
                        isOnline(u.lastLoginAt)
                          ? "bg-emerald-500"
                          : "bg-gray-300 dark:bg-slate-600"
                      }`}
                    />
                  </div>

                  {/* Name + job title */}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-seal-navy dark:text-white text-sm truncate">
                      {formatUserName(u)}
                    </p>
                    {u.jobTitle && (
                      <p className="text-xs text-seal-gray-500 dark:text-slate-400 truncate">
                        {u.jobTitle}
                      </p>
                    )}
                  </div>

                  {/* Department badge */}
                  {u.department && (
                    <div className="hidden sm:block flex-shrink-0">
                      <Badge className="bg-primary/10 text-primary dark:bg-primary/20 text-[10px] font-medium">
                        {u.department.name}
                      </Badge>
                    </div>
                  )}

                  {/* Role — discrete */}
                  <div className="hidden md:block flex-shrink-0">
                    <Badge
                      className={`text-[9px] ${isAdmin ? ROLE_COLORS[u.role] || "bg-gray-100 text-gray-800 dark:bg-slate-800 dark:text-slate-200" : "bg-gray-100 text-gray-600 dark:bg-slate-700 dark:text-slate-300"}`}
                    >
                      {isAdmin
                        ? ROLE_LABELS[u.role] || u.role
                        : "Collaborateur"}
                    </Badge>
                  </div>

                  {/* Contact actions */}
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <a
                      href={`mailto:${u.email}`}
                      title={u.email}
                      className="p-1.5 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-seal-gray-500 dark:text-slate-400 hover:text-primary hover:bg-primary/10 transition-all duration-200"
                    >
                      <Mail className="h-4 w-4" />
                    </a>
                    {u.phone && (
                      <a
                        href={`tel:${u.phone}`}
                        title={u.phone}
                        className="p-1.5 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-seal-gray-500 dark:text-slate-400 hover:text-primary hover:bg-primary/10 transition-all duration-200"
                      >
                        <Phone className="h-4 w-4" />
                      </a>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}
    </div>
  );
}
