"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { noaZodResolver } from "@/lib/noa/zod-resolver";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { useAuthStore } from "@/stores/auth-store";
import { RoleGuard } from "@/components/role-guard";
import { UserRole, USER_ROLE_LABELS, isRoleAtLeast } from "@omnitech/shared";
import { adminUserCreateSchema, type AdminUserCreateFormData } from "@/lib/validation/schemas";
import { useDebounce } from "@/hooks/use-debounce";
import { formatRelativeTime, getInitials } from "@/lib/utils";
import { PageHeader } from "@/components/layout/page-header";
import { ExportCsvButton } from "@/components/ui/export-csv-button";
import {
  Card,
  CardContent,
  Button,
  Badge,
  SearchInput,
  Select,
  DataTable,
  Dialog,
  Input,
  ConfirmDialog,
} from "@omnitech/ui";
import type { Column } from "@omnitech/ui";
import {
  Users,
  Plus,
  Upload,
  Shield,
  RefreshCw,
  Trash2,
  Key,
  Smartphone,
  UserX,
  UserCheck,
  Lock,
  Building2,
} from "lucide-react";
import { useTranslation } from "@/lib/i18n";

const AdminGroupTabs = dynamic(
  () =>
    import("@/components/layout/admin-group-tabs").then((m) => ({
      default: m.AdminGroupTabs,
    })),
  { ssr: false, loading: () => <div className="shimmer h-20 rounded-xl" /> },
);

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface Department {
  id: string;
  name: string;
  code: string;
}

interface UserRecord {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  isActive: boolean;
  jobTitle: string | null;
  department: { id: string; name: string } | null;
  departmentMemberships?: { department: { id: string; name: string } }[];
  mfaEnabled: boolean;
  mfaRequired?: boolean; // Politique MFA imposée par admin (pending activation)
  noaEnabled?: boolean; // Mode humour Noa — opt-in admin/user
  lastLoginAt: string | null;
  createdAt: string;
  avatarUrl: string | null;
}

interface PaginatedResponse {
  data: UserRecord[];
  meta: { total: number; page: number; lastPage: number; limit: number };
}

interface SpaceAccess {
  module: string;
  label: string;
  enabled: boolean;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const PAGE_SIZE = 20;

const ALL_ROLES = Object.values(UserRole);

const ROLE_BADGE_VARIANT: Record<UserRole, string> = {
  [UserRole.SUPER_ADMIN]: "error",
  [UserRole.ADMIN]: "warning",
  [UserRole.DIRECTION]: "primary",
  [UserRole.MANAGER]: "primary",
  [UserRole.REVIEWER]: "info",
  [UserRole.COLLABORATEUR]: "navy",
  [UserRole.AUDITEUR]: "draft",
  [UserRole.PRESTATAIRE]: "success",
};

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function AdminUsersPage() {
  return (
    <RoleGuard minRole={UserRole.ADMIN}>
      <AdminUsersContent />
    </RoleGuard>
  );
}

function AdminUsersContent() {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);

  /* ---- Data state ---- */
  const [usersResponse, setUsersResponse] = useState<PaginatedResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [mfaStats, setMfaStats] = useState<{
    total: number;
    withoutMfa: number;
  }>({ total: 0, withoutMfa: 0 });
  const [ldapSyncTime, setLdapSyncTime] = useState<string | null>(null);

  /* ---- Filters & pagination ---- */
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<"" | "active" | "inactive">("");
  const [page, setPage] = useState(1);
  const [sortBy, setSortBy] = useState("lastName");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");

  const debouncedSearch = useDebounce(search, 300);

  /* ---- Bulk selection ---- */
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDepartmentId, setBulkDepartmentId] = useState("");
  const [bulkRole, setBulkRole] = useState("");

  /* ---- Dialogs ---- */
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [createDepartmentId, setCreateDepartmentId] = useState("");
  const [creating, setCreating] = useState(false);

  const {
    register: registerCreate,
    handleSubmit: handleSubmitCreate,
    reset: resetCreate,
    formState: { errors: createErrors, isSubmitting: createSubmitting },
  } = useForm<AdminUserCreateFormData>({
    // noaZodResolver = zodResolver + filtre humour Noa quand active.
    // Sur /admin/users la route n'est pas dans la whitelist Noa → no-op.
    resolver: noaZodResolver(adminUserCreateSchema),
    mode: "onTouched",
    defaultValues: {
      firstName: "",
      lastName: "",
      email: "",
      password: "",
      role: UserRole.COLLABORATEUR as string,
    },
  });

  const [editRoleUser, setEditRoleUser] = useState<UserRecord | null>(null);
  const [editRoleValue, setEditRoleValue] = useState("");

  const [editDeptUser, setEditDeptUser] = useState<UserRecord | null>(null);
  const [editDeptValue, setEditDeptValue] = useState("");

  const [spaceAccessUser, setSpaceAccessUser] = useState<UserRecord | null>(null);
  const [spaceAccessList, setSpaceAccessList] = useState<SpaceAccess[]>([]);
  const [spaceAccessLoading, setSpaceAccessLoading] = useState(false);

  const [resetPasswordUser, setResetPasswordUser] = useState<UserRecord | null>(null);
  const [resetMfaUser, setResetMfaUser] = useState<UserRecord | null>(null);
  const [toggleActiveUser, setToggleActiveUser] = useState<UserRecord | null>(null);
  const [deleteUser, setDeleteUser] = useState<UserRecord | null>(null);

  const [ldapSyncing, setLdapSyncing] = useState(false);

  /* ------------------------------------------------------------------ */
  /*  Data fetching                                                      */
  /* ------------------------------------------------------------------ */

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string | number> = {
        page,
        limit: PAGE_SIZE,
        sortBy,
        sortOrder,
      };
      if (debouncedSearch) params.search = debouncedSearch;
      if (roleFilter) params.role = roleFilter;
      if (departmentFilter) params.departmentId = departmentFilter;
      if (statusFilter) params.status = statusFilter;

      const { data } = await api.get("/users", { params });
      setUsersResponse(data);
    } catch {
      toast.error("Erreur lors du chargement des utilisateurs");
    } finally {
      setLoading(false);
    }
  }, [page, debouncedSearch, roleFilter, departmentFilter, statusFilter, sortBy, sortOrder]);

  const fetchDepartments = useCallback(async () => {
    try {
      const { data } = await api.get("/departments");
      setDepartments(data?.data || data || []);
    } catch {
      /* silently fail */
    }
  }, []);

  const fetchMfaStats = useCallback(async () => {
    try {
      const { data } = await api.get("/reports/dashboard-stats");
      if (data) {
        setMfaStats({
          total: data.totalUsers ?? 0,
          withoutMfa: data.usersWithoutMfa ?? 0,
        });
      }
    } catch {
      /* silently fail */
    }
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  useEffect(() => {
    fetchDepartments();
    fetchMfaStats();
  }, [fetchDepartments, fetchMfaStats]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setPage(1);
    setSelectedIds(new Set());
  }, [debouncedSearch, roleFilter, departmentFilter, statusFilter]);

  /* ------------------------------------------------------------------ */
  /*  Handlers                                                           */
  /* ------------------------------------------------------------------ */

  const handleSort = (key: string) => {
    if (sortBy === key) {
      setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(key);
      setSortOrder("asc");
    }
  };

  const handleCreateUser = async (data: AdminUserCreateFormData) => {
    setCreating(true);
    try {
      await api.post("/users", {
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email,
        password: data.password,
        role: data.role,
        departmentId: createDepartmentId || undefined,
      });
      toast.success("Utilisateur créé avec succès");
      setShowCreateDialog(false);
      resetCreate();
      setCreateDepartmentId("");
      fetchUsers();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        "Erreur lors de la création";
      toast.error(msg);
    } finally {
      setCreating(false);
    }
  };

  const handleEditRole = async () => {
    if (!editRoleUser || !editRoleValue) return;
    try {
      await api.patch(`/users/${editRoleUser.id}`, { role: editRoleValue });
      toast.success(`Rôle de ${editRoleUser.firstName} ${editRoleUser.lastName} modifié`);
      setEditRoleUser(null);
      fetchUsers();
    } catch {
      toast.error("Erreur lors de la modification du rôle");
    }
  };

  const handleEditDepartment = async () => {
    if (!editDeptUser) return;
    try {
      if (editDeptValue) {
        await api.patch(`/departments/${editDeptValue}/assign-user`, {
          userId: editDeptUser.id,
        });
      } else {
        await api.patch(`/users/${editDeptUser.id}`, { departmentId: null });
      }
      toast.success(`Département de ${editDeptUser.firstName} ${editDeptUser.lastName} modifié`);
      setEditDeptUser(null);
      fetchUsers();
    } catch {
      toast.error("Erreur lors de la modification du département");
    }
  };

  const openSpaceAccess = async (u: UserRecord) => {
    setSpaceAccessUser(u);
    setSpaceAccessLoading(true);
    try {
      const { data } = await api.get(`/users/${u.id}/space-access`);
      setSpaceAccessList(data?.data || data || []);
    } catch {
      toast.error("Erreur lors du chargement des accès");
      setSpaceAccessList([]);
    } finally {
      setSpaceAccessLoading(false);
    }
  };

  const handleToggleSpaceAccess = async (module: string, enabled: boolean) => {
    if (!spaceAccessUser) return;
    try {
      await api.post(`/users/${spaceAccessUser.id}/space-access`, {
        module,
        enabled,
      });
      setSpaceAccessList((prev) => prev.map((s) => (s.module === module ? { ...s, enabled } : s)));
      toast.success(`Accès ${enabled ? "activé" : "désactivé"} pour ${module}`);
    } catch {
      toast.error("Erreur lors de la modification");
    }
  };

  const handleResetPassword = async () => {
    if (!resetPasswordUser) return;
    try {
      await api.post(`/users/${resetPasswordUser.id}/reset-password`);
      toast.success(
        `Mot de passe réinitialisé pour ${resetPasswordUser.firstName} ${resetPasswordUser.lastName}`,
      );
      setResetPasswordUser(null);
    } catch {
      toast.error("Erreur lors de la réinitialisation du mot de passe");
    }
  };

  const handleResetMfa = async () => {
    if (!resetMfaUser) return;
    try {
      await api.post(`/mfa/disable/${resetMfaUser.id}`);
      toast.success(`MFA désactivé pour ${resetMfaUser.firstName} ${resetMfaUser.lastName}`);
      setResetMfaUser(null);
      fetchUsers();
    } catch {
      toast.error("Erreur lors de la désactivation MFA");
    }
  };

  /**
   * Bascule le flag noaEnabled pour un user. Pas de modal de confirmation —
   * c'est un préréglage cosmétique, pas une action sensible. L'utilisateur
   * peut le réactiver/désactiver lui-même depuis /profile.
   */
  const handleToggleNoaForUser = async (u: UserRecord) => {
    const next = !u.noaEnabled;
    try {
      await api.patch(`/users/${u.id}`, { noaEnabled: next });
      toast.success(
        next
          ? `Noa activée pour ${u.firstName} ${u.lastName}`
          : `Noa désactivée pour ${u.firstName} ${u.lastName}`,
      );
      fetchUsers();
    } catch {
      toast.error("Erreur lors de la bascule Noa");
    }
  };

  const handleToggleActive = async () => {
    if (!toggleActiveUser) return;
    try {
      await api.patch(`/users/${toggleActiveUser.id}`, {
        isActive: !toggleActiveUser.isActive,
      });
      toast.success(
        toggleActiveUser.isActive
          ? `${toggleActiveUser.firstName} ${toggleActiveUser.lastName} désactivé`
          : `${toggleActiveUser.firstName} ${toggleActiveUser.lastName} réactivé`,
      );
      setToggleActiveUser(null);
      fetchUsers();
    } catch {
      toast.error("Erreur lors de la modification du statut");
    }
  };

  const handleDeleteUser = async () => {
    if (!deleteUser) return;
    try {
      await api.delete(`/users/${deleteUser.id}`);
      toast.success(`${deleteUser.firstName} ${deleteUser.lastName} supprimé définitivement`);
      setDeleteUser(null);
      fetchUsers();
    } catch {
      toast.error("Erreur lors de la suppression");
    }
  };

  const handleLdapSync = async () => {
    setLdapSyncing(true);
    try {
      await api.post("/ldap/sync-all");
      toast.success("Synchronisation LDAP lancée avec succès");
      setLdapSyncTime(new Date().toISOString());
      fetchUsers();
    } catch {
      toast.error("Erreur lors de la synchronisation LDAP");
    } finally {
      setLdapSyncing(false);
    }
  };

  const handleEnforceMfa = async () => {
    if (
      !confirm(
        "Appliquer la politique MFA à tous les utilisateurs ?\n\n" +
          "Les utilisateurs sans MFA activé seront marqués \"MFA obligatoire\" : à leur prochaine connexion, ils devront configurer leur MFA avant d'accéder à l'intranet.\n\n" +
          "Les comptes déjà MFA-actifs ne sont pas impactés.",
      )
    )
      return;
    try {
      const { data } = await api.post("/mfa/enforce", {});
      const flagged = data?.flagged ?? 0;
      const alreadyEnabled = data?.alreadyEnabled ?? 0;
      toast.success(
        `Politique MFA appliquée · ${flagged} utilisateur(s) flaggés · ${alreadyEnabled} déjà actifs`,
      );
      fetchMfaStats();
      fetchUsers();
    } catch {
      toast.error("Erreur lors de l\u2019application de la politique MFA");
    }
  };

  /* ---- Bulk actions ---- */

  const handleBulkAssignDepartment = async () => {
    if (!bulkDepartmentId || selectedIds.size === 0) return;
    try {
      const promises = Array.from(selectedIds).map((uid) =>
        api.patch(`/departments/${bulkDepartmentId}/assign-user`, {
          userId: uid,
        }),
      );
      await Promise.allSettled(promises);
      toast.success(`Département affecté à ${selectedIds.size} utilisateur(s)`);
      setSelectedIds(new Set());
      setBulkDepartmentId("");
      fetchUsers();
    } catch {
      toast.error("Erreur lors de l\u2019affectation en masse");
    }
  };

  const handleBulkChangeRole = async () => {
    if (!bulkRole || selectedIds.size === 0) return;
    try {
      const promises = Array.from(selectedIds).map((uid) =>
        api.patch(`/users/${uid}`, { role: bulkRole }),
      );
      await Promise.allSettled(promises);
      toast.success(`Rôle modifié pour ${selectedIds.size} utilisateur(s)`);
      setSelectedIds(new Set());
      setBulkRole("");
      fetchUsers();
    } catch {
      toast.error("Erreur lors de la modification en masse");
    }
  };

  const toggleSelectAll = () => {
    if (!usersResponse) return;
    const allIds = usersResponse.data.map((u) => u.id);
    if (selectedIds.size === allIds.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(allIds));
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  /* ------------------------------------------------------------------ */
  /*  Derived data                                                       */
  /* ------------------------------------------------------------------ */

  const users = usersResponse?.data ?? [];
  const meta = usersResponse?.meta;
  const totalPages = meta?.lastPage ?? 1;
  const total = meta?.total ?? 0;

  const mfaPercent =
    mfaStats.total > 0
      ? Math.round(((mfaStats.total - mfaStats.withoutMfa) / mfaStats.total) * 100)
      : 0;

  const isSuperAdmin = user?.role === UserRole.SUPER_ADMIN;

  const departmentOptions = useMemo(
    () => departments.map((d) => ({ value: d.id, label: d.name })),
    [departments],
  );

  const roleOptions = useMemo(
    () => ALL_ROLES.map((r) => ({ value: r, label: USER_ROLE_LABELS[r] })),
    [],
  );

  /* ------------------------------------------------------------------ */
  /*  Column definitions                                                 */
  /* ------------------------------------------------------------------ */

  const columns: Column<UserRecord>[] = useMemo(
    () => [
      {
        key: "select",
        header: "",
        className: "w-10",
        render: (u) => (
          <input
            type="checkbox"
            checked={selectedIds.has(u.id)}
            onChange={() => toggleSelect(u.id)}
            className="rounded border-gray-300 dark:border-slate-600 text-primary focus:ring-primary/20"
            aria-label={`Sélectionner ${u.firstName} ${u.lastName}`}
          />
        ),
      },
      {
        key: "user",
        header: "Utilisateur",
        sortable: true,
        render: (u) => (
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
              <span className="text-xs font-semibold text-primary">
                {getInitials(u.firstName, u.lastName)}
              </span>
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-seal-navy dark:text-white truncate">
                {u.firstName} {u.lastName}
              </p>
              {u.jobTitle && (
                <p className="text-[11px] text-seal-gray-500 dark:text-slate-500 truncate">
                  {u.jobTitle}
                </p>
              )}
              <p className="text-xs text-seal-gray-500 dark:text-slate-400 truncate">{u.email}</p>
            </div>
          </div>
        ),
      },
      {
        key: "role",
        header: "Rôle",
        sortable: true,
        render: (u) => (
          <Badge variant={ROLE_BADGE_VARIANT[u.role] as any}>{USER_ROLE_LABELS[u.role]}</Badge>
        ),
      },
      {
        key: "department",
        header: "Département",
        sortable: true,
        render: (u) => {
          const primary = u.department?.name;
          const secondaryCount = u.departmentMemberships?.length ?? 0;
          if (!primary && secondaryCount === 0) {
            return <span className="text-xs text-seal-gray-500 dark:text-slate-500">&mdash;</span>;
          }
          return (
            <div className="flex items-center gap-1">
              {primary && <Badge variant="primary">{primary}</Badge>}
              {secondaryCount > 0 && <Badge variant="navy">+{secondaryCount}</Badge>}
            </div>
          );
        },
      },
      {
        key: "status",
        header: "Statut",
        render: (u) => (
          <Badge variant={u.isActive ? "success" : "error"}>
            {u.isActive ? "Actif" : "Inactif"}
          </Badge>
        ),
      },
      {
        key: "mfa",
        header: "MFA",
        render: (u) => {
          if (u.mfaEnabled) {
            return <Shield className="h-4 w-4 text-emerald-500" aria-label="MFA activé" />;
          }
          if (u.mfaRequired) {
            return (
              <span
                title="MFA obligatoire à la prochaine connexion"
                className="inline-flex items-center gap-1"
              >
                <Lock
                  className="h-4 w-4 text-amber-500"
                  aria-label="MFA obligatoire à la prochaine connexion"
                />
                <span className="text-[10px] font-medium text-amber-600">Forcé</span>
              </span>
            );
          }
          return (
            <Shield
              className="h-4 w-4 text-gray-300 dark:text-slate-600"
              aria-label="MFA non activé"
            />
          );
        },
      },
      {
        key: "lastLogin",
        header: "Dernière connexion",
        sortable: true,
        render: (u) => (
          <span className="text-xs text-seal-gray-500 dark:text-slate-400">
            {u.lastLoginAt ? formatRelativeTime(u.lastLoginAt) : "Jamais connecté"}
          </span>
        ),
      },
      {
        key: "actions",
        header: "",
        className: "w-12",
        render: (u) => (
          <div className="flex items-center gap-0.5">
            <button
              onClick={() => {
                setEditRoleUser(u);
                setEditRoleValue(u.role);
              }}
              className="rounded-lg p-1.5 text-seal-gray-500 hover:bg-gray-100 dark:hover:bg-slate-800 hover:text-seal-navy dark:hover:text-white"
              title="Modifier le rôle"
              aria-label={`Modifier le rôle de ${u.firstName} ${u.lastName}`}
            >
              <Shield className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => {
                setEditDeptUser(u);
                setEditDeptValue(u.department?.id ?? "");
              }}
              className="rounded-lg p-1.5 text-seal-gray-500 hover:bg-gray-100 dark:hover:bg-slate-800 hover:text-seal-navy dark:hover:text-white"
              title="Modifier le département"
              aria-label={`Modifier le département de ${u.firstName} ${u.lastName}`}
            >
              <Building2 className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => openSpaceAccess(u)}
              className="rounded-lg p-1.5 text-seal-gray-500 hover:bg-gray-100 dark:hover:bg-slate-800 hover:text-seal-navy dark:hover:text-white"
              title="Gérer les accès espaces"
              aria-label={`Gérer les accès espaces de ${u.firstName} ${u.lastName}`}
            >
              <Lock className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => setResetPasswordUser(u)}
              className="rounded-lg p-1.5 text-seal-gray-500 hover:bg-gray-100 dark:hover:bg-slate-800 hover:text-seal-navy dark:hover:text-white"
              title="Réinitialiser le mot de passe"
              aria-label={`Réinitialiser le mot de passe de ${u.firstName} ${u.lastName}`}
            >
              <Key className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => setResetMfaUser(u)}
              className="rounded-lg p-1.5 text-seal-gray-500 hover:bg-gray-100 dark:hover:bg-slate-800 hover:text-seal-navy dark:hover:text-white"
              title="Réinitialiser MFA"
              aria-label={`Réinitialiser le MFA de ${u.firstName} ${u.lastName}`}
            >
              <Smartphone className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => handleToggleNoaForUser(u)}
              className={`rounded-lg p-1.5 hover:bg-gray-100 dark:hover:bg-slate-800 ${u.noaEnabled ? "text-amber-500" : "text-seal-gray-500 hover:text-amber-500"}`}
              title={
                u.noaEnabled
                  ? "Mode humour Noa actif \u2014 cliquer pour désactiver"
                  : "Activer Noa pour cet utilisateur"
              }
              aria-label={`${u.noaEnabled ? "Désactiver" : "Activer"} Noa pour ${u.firstName} ${u.lastName}`}
            >
              <span aria-hidden="true" className="text-sm leading-none">
                🎭
              </span>
            </button>
            <button
              onClick={() => setToggleActiveUser(u)}
              className={`rounded-lg p-1.5 hover:bg-gray-100 dark:hover:bg-slate-800 ${u.isActive ? "text-seal-gray-500 hover:text-amber-600" : "text-seal-gray-500 hover:text-emerald-600"}`}
              title={u.isActive ? "Désactiver le compte" : "Réactiver le compte"}
              aria-label={
                u.isActive
                  ? `Désactiver le compte de ${u.firstName} ${u.lastName}`
                  : `Réactiver le compte de ${u.firstName} ${u.lastName}`
              }
            >
              {u.isActive ? (
                <UserX className="h-3.5 w-3.5" />
              ) : (
                <UserCheck className="h-3.5 w-3.5" />
              )}
            </button>
            {isSuperAdmin && (
              <button
                onClick={() => setDeleteUser(u)}
                className="rounded-lg p-1.5 text-seal-gray-500 hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-600"
                title="Supprimer définitivement"
                aria-label={`Supprimer définitivement ${u.firstName} ${u.lastName}`}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        ),
      },
    ],
    [selectedIds, isSuperAdmin],
  );

  /* ------------------------------------------------------------------ */
  /*  Render                                                             */
  /* ------------------------------------------------------------------ */

  return (
    <div className="space-y-6 animate-fade-in-up">
      <AdminGroupTabs group="identity" />

      <PageHeader
        title="Utilisateurs"
        subtitle="Gestion des comptes, rôles et accès"
        icon={Users}
        hub="admin"
        actions={
          <>
            <ExportCsvButton
              endpoint="/users/export/csv"
              filename="utilisateurs"
              params={{
                ...(roleFilter ? { role: roleFilter } : {}),
                ...(departmentFilter ? { departmentId: departmentFilter } : {}),
                ...(search ? { search } : {}),
              }}
            />
            <Link href="/admin/users/import">
              <Button variant="outline">
                <Upload className="h-4 w-4" />
                Import CSV
              </Button>
            </Link>
            <Button onClick={() => setShowCreateDialog(true)}>
              <Plus className="h-4 w-4" />
              Nouvel utilisateur
            </Button>
          </>
        }
      />

      {/* ---- MFA adoption bar + LDAP sync ---- */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Shield className="h-4 w-4 text-primary" />
                <span className="text-sm font-semibold text-seal-navy dark:text-white">
                  Adoption MFA
                </span>
              </div>
              <span className="text-lg font-bold text-seal-navy dark:text-white">
                {mfaPercent}%
              </span>
            </div>
            <div className="h-2 rounded-full bg-gray-200 dark:bg-slate-700 overflow-hidden">
              <div
                className="h-full rounded-full bg-emerald-500 transition-all duration-500"
                style={{ width: `${mfaPercent}%` }}
              />
            </div>
            <div className="flex items-center justify-between mt-2">
              <span className="text-xs text-seal-gray-500 dark:text-slate-400">
                {mfaStats.withoutMfa} utilisateur
                {mfaStats.withoutMfa !== 1 ? "s" : ""} sans MFA
              </span>
              <Button size="sm" variant="outline" onClick={handleEnforceMfa}>
                <Lock className="h-3.5 w-3.5" />
                Appliquer la politique MFA
              </Button>
            </div>
            <p className="mt-2 text-[11px] text-seal-gray-500 dark:text-slate-500 leading-snug">
              Marque les utilisateurs sans MFA comme « MFA obligatoire ». À leur prochaine
              connexion, ils sont redirigés vers l'enrôlement MFA avant d'accéder à l'intranet. Les
              prestataires sont déjà soumis à cette politique par défaut. ISO 27001 A.8.5.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <RefreshCw className="h-4 w-4 text-primary" />
                  <span className="text-sm font-semibold text-seal-navy dark:text-white">
                    Synchronisation LDAP
                  </span>
                </div>
                <p className="text-xs text-seal-gray-500 dark:text-slate-400">
                  {ldapSyncTime
                    ? `Dernière synchronisation : ${formatRelativeTime(ldapSyncTime)}`
                    : "Aucune synchronisation récente"}
                </p>
              </div>
              <Button onClick={handleLdapSync} loading={ldapSyncing} disabled={ldapSyncing}>
                <RefreshCw className="h-4 w-4" />
                Synchroniser
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ---- Filters ---- */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col lg:flex-row gap-3">
            <SearchInput
              value={search}
              onChange={setSearch}
              placeholder="Rechercher par nom ou email…"
              className="flex-1"
            />

            <Select
              options={departmentOptions}
              placeholder="Tous les départements"
              value={departmentFilter}
              onChange={(e) => setDepartmentFilter(e.target.value)}
              className="lg:w-52"
            />

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as "" | "active" | "inactive")}
              className="rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-seal-navy dark:text-white lg:w-36 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              aria-label="Filtrer par statut"
            >
              <option value="">Tous les statuts</option>
              <option value="active">Actifs</option>
              <option value="inactive">Inactifs</option>
            </select>
          </div>

          {/* Role filter pills */}
          <div className="flex flex-wrap items-center gap-1.5 mt-3">
            <button
              onClick={() => setRoleFilter("")}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                !roleFilter
                  ? "bg-primary text-white"
                  : "bg-gray-100 dark:bg-slate-800 text-seal-gray-500 dark:text-slate-400 hover:bg-gray-200 dark:hover:bg-slate-700"
              }`}
            >
              Tous
            </button>
            {ALL_ROLES.map((role) => (
              <button
                key={role}
                onClick={() => setRoleFilter(roleFilter === role ? "" : role)}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                  roleFilter === role
                    ? "bg-primary text-white"
                    : "bg-gray-100 dark:bg-slate-800 text-seal-gray-500 dark:text-slate-400 hover:bg-gray-200 dark:hover:bg-slate-700"
                }`}
              >
                {USER_ROLE_LABELS[role]}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* ---- Bulk actions bar ---- */}
      {selectedIds.size > 0 && (
        <Card>
          <CardContent className="p-3">
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
              <span className="text-sm font-semibold text-seal-navy dark:text-white">
                {selectedIds.size} utilisateur
                {selectedIds.size !== 1 ? "s" : ""} sélectionné
                {selectedIds.size !== 1 ? "s" : ""}
              </span>
              <div className="flex items-center gap-2 flex-wrap">
                <Select
                  options={departmentOptions}
                  placeholder="Affecter un département"
                  value={bulkDepartmentId}
                  onChange={(e) => setBulkDepartmentId(e.target.value)}
                  className="w-48"
                />
                <Button size="sm" disabled={!bulkDepartmentId} onClick={handleBulkAssignDepartment}>
                  <Building2 className="h-3.5 w-3.5" />
                  Affecter
                </Button>

                <Select
                  options={roleOptions}
                  placeholder="Changer le rôle"
                  value={bulkRole}
                  onChange={(e) => setBulkRole(e.target.value)}
                  className="w-48"
                />
                <Button size="sm" disabled={!bulkRole} onClick={handleBulkChangeRole}>
                  <Shield className="h-3.5 w-3.5" />
                  Appliquer
                </Button>

                <Button size="sm" variant="outline" onClick={() => setSelectedIds(new Set())}>
                  Annuler la sélection
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ---- Data table ---- */}
      <div>
        {/* Select-all checkbox row */}
        {users.length > 0 && (
          <div className="flex items-center gap-2 mb-2 px-1">
            <input
              type="checkbox"
              checked={selectedIds.size === users.length && users.length > 0}
              onChange={toggleSelectAll}
              className="rounded border-gray-300 dark:border-slate-600 text-primary focus:ring-primary/20"
              aria-label="Sélectionner tous les utilisateurs de la page"
            />
            <span className="text-xs text-seal-gray-500 dark:text-slate-400">
              Sélectionner tout ({users.length})
            </span>
          </div>
        )}

        {/* Mobile: cards layout (< md) */}
        <div className="md:hidden space-y-2">
          {loading ? (
            <div className="rounded-card border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-6 text-center text-sm text-seal-gray-500">
              Chargement…
            </div>
          ) : users.length === 0 ? (
            <div className="rounded-card border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-6 text-center text-sm text-seal-gray-500">
              <Users className="mx-auto mb-2 h-8 w-8 opacity-50" />
              Aucun utilisateur trouvé
            </div>
          ) : (
            users.map((u) => (
              <div
                key={u.id}
                className="rounded-card border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3 flex items-start gap-3 min-h-[72px]"
              >
                <input
                  type="checkbox"
                  checked={selectedIds.has(u.id)}
                  onChange={() => toggleSelect(u.id)}
                  className="mt-1 h-5 w-5 rounded border-gray-300 dark:border-slate-600 text-primary focus:ring-primary/20"
                  aria-label={`Sélectionner ${u.firstName} ${u.lastName}`}
                />
                <div className="h-10 w-10 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
                  <span className="text-xs font-semibold text-primary">
                    {getInitials(u.firstName, u.lastName)}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-seal-navy dark:text-white truncate">
                    {u.firstName} {u.lastName}
                  </p>
                  <p className="text-xs text-seal-gray-500 dark:text-slate-400 truncate">
                    {u.email}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <Badge variant={ROLE_BADGE_VARIANT[u.role] as any}>
                      {USER_ROLE_LABELS[u.role]}
                    </Badge>
                    <Badge variant={u.isActive ? "success" : "error"}>
                      {u.isActive ? "Actif" : "Inactif"}
                    </Badge>
                    {u.department?.name && <Badge variant="primary">{u.department.name}</Badge>}
                    {u.mfaEnabled ? (
                      <Shield className="h-4 w-4 text-emerald-500" aria-label="MFA activé" />
                    ) : u.mfaRequired ? (
                      <Lock className="h-4 w-4 text-amber-500" aria-label="MFA obligatoire" />
                    ) : null}
                  </div>
                  <p className="mt-1 text-[11px] text-seal-gray-500 dark:text-slate-500">
                    {u.lastLoginAt
                      ? `Connecté ${formatRelativeTime(u.lastLoginAt)}`
                      : "Jamais connecté"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setEditRoleUser(u);
                    setEditRoleValue(u.role);
                  }}
                  className="flex h-11 w-11 items-center justify-center rounded-lg text-seal-gray-500 hover:bg-gray-100 dark:hover:bg-slate-800"
                  aria-label={`Modifier le rôle de ${u.firstName} ${u.lastName}`}
                >
                  <Shield className="h-4 w-4" />
                </button>
              </div>
            ))
          )}
          {totalPages > 1 && (
            <div className="flex items-center justify-between gap-2 pt-2">
              <Button
                size="sm"
                variant="outline"
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
                className="min-h-[44px]"
              >
                Précédent
              </Button>
              <span className="text-xs text-seal-gray-500">
                {page} / {totalPages}
              </span>
              <Button
                size="sm"
                variant="outline"
                disabled={page >= totalPages}
                onClick={() => setPage(page + 1)}
                className="min-h-[44px]"
              >
                Suivant
              </Button>
            </div>
          )}
        </div>

        {/* Desktop: full DataTable (>= md) */}
        <div className="hidden md:block">
          <DataTable
            columns={columns}
            data={users}
            keyExtractor={(u) => u.id}
            loading={loading}
            sortBy={sortBy}
            sortOrder={sortOrder}
            onSort={handleSort}
            page={page}
            totalPages={totalPages}
            total={total}
            onPageChange={setPage}
            emptyMessage="Aucun utilisateur trouvé"
            emptyIcon={<Users className="h-12 w-12 text-seal-gray-500 dark:text-slate-500" />}
          />
        </div>
      </div>

      {/* ================================================================ */}
      {/*  DIALOGS                                                         */}
      {/* ================================================================ */}

      {/* ---- Create user dialog ---- */}
      <Dialog
        open={showCreateDialog}
        onClose={() => {
          setShowCreateDialog(false);
          resetCreate();
          setCreateDepartmentId("");
        }}
        title="Créer un utilisateur"
        description="Remplissez les informations du nouvel utilisateur."
      >
        <form onSubmit={handleSubmitCreate(handleCreateUser)} className="space-y-3" noValidate>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Input
                label="Prénom"
                placeholder="Jean"
                error={createErrors.firstName?.message}
                {...registerCreate("firstName")}
              />
            </div>
            <div>
              <Input
                label="Nom"
                placeholder="Dupont"
                error={createErrors.lastName?.message}
                {...registerCreate("lastName")}
              />
            </div>
          </div>
          <Input
            label="Adresse email"
            type="email"
            placeholder="jean.dupont@omnitech-security.fr"
            autoComplete="off"
            error={createErrors.email?.message}
            {...registerCreate("email")}
          />
          <Input
            label="Mot de passe"
            type="password"
            placeholder="••••••••"
            autoComplete="new-password"
            error={createErrors.password?.message}
            {...registerCreate("password")}
          />
          <Select
            label="Rôle"
            options={roleOptions}
            error={createErrors.role?.message}
            {...registerCreate("role")}
          />
          <Select
            label="Département"
            options={departmentOptions}
            placeholder="Aucun département"
            value={createDepartmentId}
            onChange={(e) => setCreateDepartmentId(e.target.value)}
          />
          <div className="flex justify-end gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setShowCreateDialog(false);
                resetCreate();
                setCreateDepartmentId("");
              }}
            >
              Annuler
            </Button>
            <Button
              type="submit"
              loading={creating || createSubmitting}
              disabled={creating || createSubmitting}
            >
              Créer l&apos;utilisateur
            </Button>
          </div>
        </form>
      </Dialog>

      {/* ---- Edit role dialog ---- */}
      <Dialog
        open={!!editRoleUser}
        onClose={() => setEditRoleUser(null)}
        title="Modifier le rôle"
        description={
          editRoleUser
            ? `Changer le rôle de ${editRoleUser.firstName} ${editRoleUser.lastName}`
            : ""
        }
      >
        <div className="space-y-3">
          <Select
            label="Nouveau rôle"
            options={roleOptions}
            value={editRoleValue}
            onChange={(e) => setEditRoleValue(e.target.value)}
          />
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outline" onClick={() => setEditRoleUser(null)}>
              Annuler
            </Button>
            <Button onClick={handleEditRole}>Enregistrer</Button>
          </div>
        </div>
      </Dialog>

      {/* ---- Edit department dialog ---- */}
      <Dialog
        open={!!editDeptUser}
        onClose={() => setEditDeptUser(null)}
        title="Modifier le département"
        description={
          editDeptUser
            ? `Changer le département de ${editDeptUser.firstName} ${editDeptUser.lastName}`
            : ""
        }
      >
        <div className="space-y-3">
          <Select
            label="Département"
            options={departmentOptions}
            placeholder="Aucun département"
            value={editDeptValue}
            onChange={(e) => setEditDeptValue(e.target.value)}
          />
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outline" onClick={() => setEditDeptUser(null)}>
              Annuler
            </Button>
            <Button onClick={handleEditDepartment}>Enregistrer</Button>
          </div>
        </div>
      </Dialog>

      {/* ---- Space access dialog ---- */}
      <Dialog
        open={!!spaceAccessUser}
        onClose={() => setSpaceAccessUser(null)}
        title="Accès aux espaces"
        description={
          spaceAccessUser
            ? `Gérer les accès de ${spaceAccessUser.firstName} ${spaceAccessUser.lastName}`
            : ""
        }
      >
        <div className="space-y-2">
          {spaceAccessLoading ? (
            <div className="py-8 text-center text-sm text-seal-gray-500 dark:text-slate-400">
              Chargement des accès…
            </div>
          ) : spaceAccessList.length === 0 ? (
            <div className="py-8 text-center text-sm text-seal-gray-500 dark:text-slate-400">
              Aucun espace configuré
            </div>
          ) : (
            spaceAccessList.map((space) => (
              <div
                key={space.module}
                className="flex items-center justify-between rounded-lg border border-gray-100 dark:border-slate-700 p-3"
              >
                <div>
                  <p className="text-sm font-semibold text-seal-navy dark:text-white">
                    {space.label}
                  </p>
                  <p className="text-xs text-seal-gray-500 dark:text-slate-400 font-mono">
                    {space.module}
                  </p>
                </div>
                <button
                  onClick={() => handleToggleSpaceAccess(space.module, !space.enabled)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    space.enabled ? "bg-emerald-500" : "bg-gray-300 dark:bg-slate-600"
                  }`}
                  role="switch"
                  aria-checked={space.enabled}
                  aria-label={`${space.enabled ? "Désactiver" : "Activer"} ${space.label}`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                      space.enabled ? "translate-x-6" : "translate-x-1"
                    }`}
                  />
                </button>
              </div>
            ))
          )}
          <div className="flex justify-end pt-2">
            <Button variant="outline" onClick={() => setSpaceAccessUser(null)}>
              Fermer
            </Button>
          </div>
        </div>
      </Dialog>

      {/* ---- Confirm: Reset password ---- */}
      <ConfirmDialog
        open={!!resetPasswordUser}
        onClose={() => setResetPasswordUser(null)}
        onConfirm={handleResetPassword}
        title="Réinitialiser le mot de passe"
        description={
          resetPasswordUser
            ? `Voulez-vous réinitialiser le mot de passe de ${resetPasswordUser.firstName} ${resetPasswordUser.lastName} ? Un email sera envoyé à ${resetPasswordUser.email}.`
            : ""
        }
        confirmLabel="Réinitialiser"
        variant="primary"
      />

      {/* ---- Confirm: Reset MFA ---- */}
      <ConfirmDialog
        open={!!resetMfaUser}
        onClose={() => setResetMfaUser(null)}
        onConfirm={handleResetMfa}
        title="Désactiver le MFA"
        description={
          resetMfaUser
            ? `Voulez-vous désactiver l\u2019authentification multifacteur de ${resetMfaUser.firstName} ${resetMfaUser.lastName} ? L\u2019utilisateur devra reconfigurer son MFA à la prochaine connexion.`
            : ""
        }
        confirmLabel="Désactiver MFA"
        variant="danger"
      />

      {/* ---- Confirm: Toggle active ---- */}
      <ConfirmDialog
        open={!!toggleActiveUser}
        onClose={() => setToggleActiveUser(null)}
        onConfirm={handleToggleActive}
        title={toggleActiveUser?.isActive ? "Désactiver le compte" : "Réactiver le compte"}
        description={
          toggleActiveUser
            ? toggleActiveUser.isActive
              ? `Voulez-vous désactiver le compte de ${toggleActiveUser.firstName} ${toggleActiveUser.lastName} ? L\u2019utilisateur ne pourra plus se connecter.`
              : `Voulez-vous réactiver le compte de ${toggleActiveUser.firstName} ${toggleActiveUser.lastName} ?`
            : ""
        }
        confirmLabel={toggleActiveUser?.isActive ? "Désactiver" : "Réactiver"}
        variant={toggleActiveUser?.isActive ? "danger" : "primary"}
      />

      {/* ---- Confirm: Delete user (SUPER_ADMIN only) ---- */}
      <ConfirmDialog
        open={!!deleteUser}
        onClose={() => setDeleteUser(null)}
        onConfirm={handleDeleteUser}
        title="Supprimer définitivement"
        description={
          deleteUser
            ? `Êtes-vous certain de vouloir supprimer définitivement le compte de ${deleteUser.firstName} ${deleteUser.lastName} (${deleteUser.email}) ? Cette action est irréversible.`
            : ""
        }
        confirmLabel="Supprimer définitivement"
        variant="danger"
      />
    </div>
  );
}
