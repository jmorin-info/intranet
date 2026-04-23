"use client";

import React, { useEffect, useState, useMemo, useCallback } from "react";
import { api } from "@/lib/api";
import { useTranslation } from "@/lib/i18n";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  Button,
  DataTable,
  Dialog,
  ConfirmDialog,
  Input,
  Badge,
} from "@omnitech/ui";
import type { Column } from "@omnitech/ui";
import {
  Plus,
  Edit,
  Trash2,
  Building2,
  Users,
  ChevronDown,
  ChevronUp,
  Calendar,
  UserPlus,
  UserMinus,
  FileText,
  Ticket,
  Image as ImageIcon,
  Crown,
  AlertCircle,
} from "lucide-react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { ExportButton } from "@/components/ui/export-button";
import { PageHeader } from "@/components/layout/page-header";

const AdminGroupTabs = dynamic(
  () =>
    import("@/components/layout/admin-group-tabs").then((m) => ({
      default: m.AdminGroupTabs,
    })),
  { ssr: false, loading: () => <div className="shimmer h-20 rounded-xl" /> },
);
import { EmptyState } from "@omnitech/ui";

interface DepartmentUser {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
}

interface DeptManager {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
  avatarUrl?: string | null;
}

interface Department {
  id: string;
  name: string;
  code: string;
  _count?: {
    users: number;
    userMemberships?: number;
    tickets?: number;
    calendarEvents?: number;
    mediaAlbums?: number;
  };
  managers?: DeptManager[];
  createdAt: string;
}

export default function AdminDepartmentsPage() {
  const { t } = useTranslation();
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDialog, setShowDialog] = useState(false);
  const [editDept, setEditDept] = useState<Department | null>(null);
  const [deleteDept, setDeleteDept] = useState<Department | null>(null);
  const [form, setForm] = useState({ name: "", code: "" });
  const [saving, setSaving] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [deptUsers, setDeptUsers] = useState<Record<string, DepartmentUser[]>>(
    {},
  );
  const [loadingUsers, setLoadingUsers] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"cards" | "table">("cards");
  const [assignDeptId, setAssignDeptId] = useState<string | null>(null);
  const [availableUsers, setAvailableUsers] = useState<any[]>([]);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [removingUserId, setRemovingUserId] = useState<string | null>(null);
  const [addingUser, setAddingUser] = useState(false);
  const [userSearch, setUserSearch] = useState("");

  const refreshDeptMembers = async (deptId: string) => {
    try {
      const { data } = await api.get(`/departments/${deptId}/members`);
      setDeptUsers((prev) => ({ ...prev, [deptId]: data?.data || data || [] }));
    } catch {
      // keep existing data on error
    }
  };

  const handleRemoveUser = async (deptId: string, userId: string) => {
    setRemovingUserId(userId);
    try {
      await api.patch(`/departments/${deptId}/remove-user`, { userId });
      toast.success("Collaborateur retiré du département");
      await Promise.all([refreshDeptMembers(deptId), fetchDepartments()]);
    } catch {
      toast.error("Erreur lors du retrait de l'utilisateur");
    } finally {
      setRemovingUserId(null);
    }
  };

  const fetchDepartments = async (showLoader = false) => {
    if (showLoader) setLoading(true);
    try {
      const { data } = await api.get("/departments");
      setDepartments(data?.data || data || []);
    } catch {
      // graceful
    } finally {
      if (showLoader) setLoading(false);
    }
  };

  useEffect(() => {
    fetchDepartments(true);
  }, []);

  const openCreate = () => {
    setEditDept(null);
    setForm({ name: "", code: "" });
    setShowDialog(true);
  };

  const openEdit = (dept: Department) => {
    setEditDept(dept);
    setForm({ name: dept.name, code: dept.code });
    setShowDialog(true);
  };

  const handleSave = async () => {
    if (!form.name || !form.code) {
      toast.error(t("departments.nameCodeRequired"));
      return;
    }
    setSaving(true);
    try {
      if (editDept) {
        await api.patch(`/departments/${editDept.id}`, form);
        toast.success(t("departments.updated"));
      } else {
        await api.post("/departments", form);
        toast.success(t("departments.created"));
      }
      setShowDialog(false);
      fetchDepartments();
    } catch (error: unknown) {
      const msg =
        (error as { response?: { data?: { message?: string } } })?.response
          ?.data?.message || "Erreur";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteDept) return;
    try {
      await api.delete(`/departments/${deleteDept.id}`);
      toast.success(t("departments.deleted"));
      setDeleteDept(null);
      fetchDepartments();
    } catch {
      toast.error(t("departments.deleteError"));
    }
  };

  const toggleExpand = async (deptId: string) => {
    if (expandedId === deptId) {
      setExpandedId(null);
      return;
    }
    setExpandedId(deptId);
    if (!deptUsers[deptId]) {
      setLoadingUsers(deptId);
      try {
        const { data } = await api.get(`/departments/${deptId}/members`);
        setDeptUsers((prev) => ({
          ...prev,
          [deptId]: data?.data || data || [],
        }));
      } catch {
        setDeptUsers((prev) => ({ ...prev, [deptId]: [] }));
      } finally {
        setLoadingUsers(null);
      }
    }
  };

  const roleColors: Record<string, string> = {
    SUPER_ADMIN: "bg-red-500",
    ADMIN: "bg-amber-500",
    QUALITY_MANAGER: "bg-blue-500",
    DEPARTMENT_HEAD: "bg-purple-500",
    COLLABORATOR: "bg-emerald-500",
    COLLABORATEUR: "bg-emerald-500",
    READER: "bg-gray-400",
    AUDITEUR: "bg-gray-400",
    REVIEWER: "bg-blue-500",
    DIRECTION: "bg-indigo-500",
    PRESTATAIRE: "bg-teal-500",
  };

  const roleLabels: Record<string, string> = {
    SUPER_ADMIN: "Super Admin",
    ADMIN: "Admin",
    QUALITY_MANAGER: "Resp. qualité",
    DEPARTMENT_HEAD: "Chef dept.",
    COLLABORATOR: "Collaborateur",
    COLLABORATEUR: "Collaborateur",
    READER: "Lecteur",
    AUDITEUR: "Auditeur",
    REVIEWER: "Réviseur",
    DIRECTION: "Direction",
    PRESTATAIRE: "Prestataire",
  };

  const cardGradients = [
    "from-primary via-primary/80 to-blue-400",
    "from-emerald-500 via-emerald-400 to-teal-400",
    "from-amber-500 via-orange-400 to-yellow-400",
    "from-violet-500 via-purple-400 to-indigo-400",
    "from-rose-500 via-pink-400 to-red-400",
    "from-cyan-500 via-sky-400 to-blue-400",
  ];

  const columns: Column<Department>[] = [
    {
      key: "code",
      header: t("departments.header.code"),
      render: (d) => (
        <span className="font-mono font-semibold text-seal-navy dark:text-white">
          {d.code}
        </span>
      ),
    },
    {
      key: "name",
      header: t("departments.header.name"),
      render: (d) => (
        <span className="text-sm font-semibold text-seal-navy dark:text-white">
          {d.name}
        </span>
      ),
    },
    {
      key: "users",
      header: t("departments.header.users"),
      render: (d) => (
        <span className="text-sm text-seal-gray-500 dark:text-slate-400">
          {(d._count?.users ?? 0) + (d._count?.userMemberships ?? 0)}
        </span>
      ),
    },
    {
      key: "actions",
      header: "",
      className: "w-20",
      render: (d) => (
        <div className="flex items-center gap-1">
          <button
            onClick={(e) => {
              e.stopPropagation();
              openEdit(d);
            }}
            className="rounded-lg p-1.5 text-seal-gray-500 hover:bg-gray-100 dark:hover:bg-slate-800 hover:text-seal-navy dark:hover:text-white"
          >
            <Edit className="h-4 w-4" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setDeleteDept(d);
            }}
            className="rounded-lg p-1.5 text-seal-gray-500 hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-600"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <AdminGroupTabs group="identity" />
      <PageHeader
        title={t("departments.title")}
        subtitle={t("departments.subtitle")}
        icon={Building2}
        hub="admin"
        actions={
          <>
            <ExportButton
              filename="departements"
              rows={
                (departments || []) as unknown as Array<Record<string, unknown>>
              }
              columns={[
                { header: "ID", accessor: (r: any) => r?.id || "" },
                { header: "Code", accessor: (r: any) => r?.code || "" },
                { header: "Nom", accessor: (r: any) => r?.name || "" },
                {
                  header: "Nombre utilisateurs",
                  accessor: (r: any) =>
                    (r?._count?.users ?? 0) + (r?._count?.userMemberships ?? 0),
                },
                { header: "Créé le", accessor: (r: any) => r?.createdAt || "" },
              ]}
            />
            <Button onClick={openCreate}>
              <Plus className="h-4 w-4" />
              {t("departments.new")}
            </Button>
          </>
        }
      />

      {/* View mode toggle */}
      <div className="flex justify-end">
        <div className="inline-flex rounded-lg border border-gray-200 dark:border-slate-700 overflow-hidden">
          <button
            onClick={() => setViewMode("cards")}
            className={`px-3 py-1.5 text-xs font-semibold transition-colors ${viewMode === "cards" ? "bg-primary text-white" : "text-seal-gray-500 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-800"}`}
          >
            Cartes
          </button>
          <button
            onClick={() => setViewMode("table")}
            className={`px-3 py-1.5 text-xs font-semibold transition-colors ${viewMode === "table" ? "bg-primary text-white" : "text-seal-gray-500 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-800"}`}
          >
            Table
          </button>
        </div>
      </div>

      {viewMode === "table" ? (
        <DataTable
          columns={columns}
          data={departments}
          keyExtractor={(d) => d.id}
          loading={loading}
          emptyMessage={t("departments.empty")}
          emptyIcon={
            <Building2 className="h-12 w-12 text-seal-gray-500 dark:text-slate-500" />
          }
        />
      ) : loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="h-40 animate-pulse bg-gray-100 dark:bg-slate-800 rounded-card" />
            </Card>
          ))}
        </div>
      ) : departments.length === 0 ? (
        <EmptyState
          type="general"
          title={t("departments.empty")}
          description="Créez un premier département pour organiser vos équipes."
          action={
            <Button onClick={openCreate}>
              <Plus className="h-4 w-4" />
              {t("departments.new")}
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {departments.map((dept) => {
            const userCount =
              (dept._count?.users ?? 0) + (dept._count?.userMemberships ?? 0);
            const users = deptUsers[dept.id] || [];
            const isExpanded = expandedId === dept.id;
            const isLoadingThisDept = loadingUsers === dept.id;

            // Compute role distribution for mini bar
            const roleCounts: Record<string, number> = {};
            users.forEach((u) => {
              roleCounts[u.role] = (roleCounts[u.role] || 0) + 1;
            });

            return (
              <Card
                key={dept.id}
                className="overflow-hidden group hover:shadow-lg transition-shadow duration-200"
              >
                <CardContent className="p-0">
                  {/* Gradient top border */}
                  <div
                    className={`h-1.5 bg-gradient-to-r ${cardGradients[departments.indexOf(dept) % cardGradients.length]}`}
                  />

                  {/* Header */}
                  <div className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                          <Building2 className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                          <h3 className="font-semibold text-seal-navy dark:text-white">
                            {dept.name}
                          </h3>
                          <span className="font-mono text-xs text-seal-gray-500 dark:text-slate-400">
                            {dept.code}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            openEdit(dept);
                          }}
                          className="rounded-lg p-1.5 text-seal-gray-500 hover:bg-gray-100 dark:hover:bg-slate-800 hover:text-seal-navy dark:hover:text-white"
                        >
                          <Edit className="h-4 w-4" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteDept(dept);
                          }}
                          className="rounded-lg p-1.5 text-seal-gray-500 hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-600"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>

                    {/* Manager display */}
                    {users.length > 0 &&
                      (() => {
                        const manager = users.find((u) =>
                          [
                            "DIRECTION",
                            "DEPARTMENT_HEAD",
                            "ADMIN",
                            "SUPER_ADMIN",
                          ].includes(u.role),
                        );
                        if (!manager) return null;
                        return (
                          <div className="flex items-center gap-2 mt-3 rounded-lg bg-primary/5 dark:bg-primary/10 px-3 py-2">
                            <div className="h-6 w-6 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
                              <span className="text-[9px] font-medium text-primary">
                                {manager.firstName[0]}
                                {manager.lastName[0]}
                              </span>
                            </div>
                            <div className="min-w-0">
                              <p className="text-[11px] uppercase tracking-wider text-seal-gray-500 dark:text-slate-500 font-medium leading-none">
                                Responsable
                              </p>
                              <p className="text-xs font-medium text-seal-navy dark:text-white truncate">
                                {manager.firstName} {manager.lastName}
                              </p>
                            </div>
                          </div>
                        );
                      })()}

                    {/* Managers (enriched) */}
                    {dept.managers && dept.managers.length > 0 && (
                      <div className="mt-3 space-y-1">
                        {dept.managers.slice(0, 2).map((m) => (
                          <div
                            key={m.id}
                            className="flex items-center gap-2 rounded-lg bg-primary/5 dark:bg-primary/10 px-3 py-1.5"
                          >
                            <Crown className="h-3 w-3 text-primary flex-shrink-0" />
                            <span className="text-xs font-medium text-seal-navy dark:text-white truncate">
                              {m.firstName} {m.lastName}
                            </span>
                            <span className="text-[10px] text-seal-gray-500 dark:text-slate-500 ml-auto uppercase tracking-wider">
                              {m.role.replace(/_/g, " ")}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                    {(!dept.managers || dept.managers.length === 0) &&
                      userCount > 0 && (
                        <div className="mt-3 flex items-center gap-1.5 rounded-lg bg-amber-50 dark:bg-amber-900/20 px-3 py-1.5 text-amber-700 dark:text-amber-300">
                          <AlertCircle className="h-3 w-3 flex-shrink-0" />
                          <span className="text-[11px]">
                            Aucun responsable désigné (ADMIN / DIRECTION)
                          </span>
                        </div>
                      )}

                    {/* Member count - prominent */}
                    <div className="flex items-center flex-wrap gap-2 mt-3">
                      <div className="flex items-center gap-2 bg-gray-50 dark:bg-slate-800 rounded-xl px-3 py-2">
                        <Users className="h-4 w-4 text-primary" />
                        <span className="text-lg font-medium text-seal-navy dark:text-white">
                          {userCount}
                        </span>
                        <span className="text-xs text-seal-gray-500 dark:text-slate-400">
                          membre{userCount !== 1 ? "s" : ""}
                        </span>
                      </div>
                      {(dept._count?.tickets ?? 0) > 0 && (
                        <div
                          className="flex items-center gap-1 text-xs text-seal-gray-500 dark:text-slate-400"
                          title="Tickets rattachés"
                        >
                          <Ticket className="h-3.5 w-3.5" />
                          <span className="font-semibold text-seal-navy dark:text-white">
                            {dept._count?.tickets}
                          </span>
                        </div>
                      )}
                      {(dept._count?.calendarEvents ?? 0) > 0 && (
                        <div
                          className="flex items-center gap-1 text-xs text-seal-gray-500 dark:text-slate-400"
                          title="Événements calendrier"
                        >
                          <Calendar className="h-3.5 w-3.5" />
                          <span className="font-semibold text-seal-navy dark:text-white">
                            {dept._count?.calendarEvents}
                          </span>
                        </div>
                      )}
                      {(dept._count?.mediaAlbums ?? 0) > 0 && (
                        <div
                          className="flex items-center gap-1 text-xs text-seal-gray-500 dark:text-slate-400"
                          title="Albums média"
                        >
                          <ImageIcon className="h-3.5 w-3.5" />
                          <span className="font-semibold text-seal-navy dark:text-white">
                            {dept._count?.mediaAlbums}
                          </span>
                        </div>
                      )}
                      <div
                        className="flex items-center gap-1.5 text-xs text-seal-gray-500 dark:text-slate-400 ml-auto"
                        title="Date de création"
                      >
                        {new Date(dept.createdAt).toLocaleDateString("fr-FR")}
                      </div>
                    </div>

                    {/* Mini avatar stack */}
                    {userCount > 0 && (
                      <div className="flex items-center mt-3 -space-x-2">
                        {Array.from({ length: Math.min(userCount, 5) }).map(
                          (_, i) => (
                            <div
                              key={i}
                              className="h-7 w-7 rounded-full bg-primary/20 border-2 border-white dark:border-slate-900 flex items-center justify-center"
                            >
                              <span className="text-[10px] font-semibold text-primary">
                                {users[i]
                                  ? `${users[i].firstName[0]}${users[i].lastName[0]}`
                                  : "?"}
                              </span>
                            </div>
                          ),
                        )}
                        {userCount > 5 && (
                          <div className="h-7 w-7 rounded-full bg-gray-200 dark:bg-slate-700 border-2 border-white dark:border-slate-900 flex items-center justify-center">
                            <span className="text-[10px] font-semibold text-seal-gray-500">
                              +{userCount - 5}
                            </span>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Role distribution bar (if users loaded) */}
                    {users.length > 0 && (
                      <div className="mt-4 p-3 bg-gray-50/50 dark:bg-slate-800/30 rounded-xl">
                        <p className="text-[10px] font-semibold text-seal-gray-500 dark:text-slate-500 uppercase tracking-wider mb-2">
                          Répartition des rôles
                        </p>
                        <div className="h-2 rounded-full bg-gray-200 dark:bg-slate-700 overflow-hidden flex">
                          {Object.entries(roleCounts).map(([role, count]) => (
                            <div
                              key={role}
                              className={`h-full ${roleColors[role] || "bg-gray-400"} first:rounded-l-full last:rounded-r-full transition-all`}
                              style={{
                                width: `${(count / users.length) * 100}%`,
                              }}
                              title={`${roleLabels[role] || role}: ${count}`}
                            />
                          ))}
                        </div>
                        <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2">
                          {Object.entries(roleCounts).map(([role, count]) => (
                            <span
                              key={role}
                              className="flex items-center gap-1 text-[10px] text-seal-gray-500 dark:text-slate-400"
                            >
                              <span
                                className={`h-2 w-2 rounded-sm ${roleColors[role] || "bg-gray-400"}`}
                              />
                              {roleLabels[role] || role.replace(/_/g, " ")}{" "}
                              <span className="font-semibold text-seal-navy dark:text-white">
                                {count}
                              </span>
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Expand toggle */}
                  <button
                    onClick={() => toggleExpand(dept.id)}
                    className="w-full py-2 px-4 text-xs font-semibold text-primary hover:bg-primary/5 border-t border-gray-100 dark:border-slate-700 flex items-center justify-center gap-1 transition-colors"
                  >
                    {isExpanded ? (
                      <ChevronUp className="h-3.5 w-3.5" />
                    ) : (
                      <ChevronDown className="h-3.5 w-3.5" />
                    )}
                    {isExpanded
                      ? "Masquer les utilisateurs"
                      : userCount > 0
                        ? "Voir les utilisateurs"
                        : "Gérer les utilisateurs"}
                  </button>

                  {/* Expanded user list */}
                  {isExpanded && (
                    <div className="border-t border-gray-100 dark:border-slate-700 bg-gray-50 dark:bg-slate-800/50">
                      {isLoadingThisDept ? (
                        <div className="p-4 text-center text-xs text-seal-gray-500 dark:text-slate-400 flex items-center justify-center gap-2">
                          <div className="h-3 w-3 border-2 border-seal-gray-500/30 border-t-taupe rounded-full animate-spin" />
                          Chargement...
                        </div>
                      ) : users.length === 0 ? (
                        <div className="p-4 text-center text-xs text-seal-gray-500 dark:text-slate-400">
                          Aucun utilisateur trouvé
                        </div>
                      ) : (
                        <div className="divide-y divide-gray-100 dark:divide-slate-700 max-h-60 overflow-y-auto">
                          {users.map((u) => (
                            <div
                              key={u.id}
                              className="flex items-center gap-3 px-4 py-2.5"
                            >
                              <div className="h-8 w-8 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
                                <span className="text-xs font-semibold text-primary">
                                  {u.firstName[0]}
                                  {u.lastName[0]}
                                </span>
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-semibold text-seal-navy dark:text-white truncate">
                                  {u.firstName} {u.lastName}
                                </p>
                                <p className="text-xs text-seal-gray-500 dark:text-slate-400 truncate">
                                  {u.email}
                                </p>
                              </div>
                              <Badge variant="info">
                                {u.role.replace(/_/g, " ")}
                              </Badge>
                              <button
                                onClick={() => handleRemoveUser(dept.id, u.id)}
                                disabled={removingUserId === u.id}
                                className="rounded-lg p-1.5 text-seal-gray-500 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                                title="Retirer du département"
                                aria-label="Retirer l'utilisateur du département"
                              >
                                <UserMinus className="h-4 w-4" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                      {/* Department access overview */}
                      <div className="px-4 py-3 border-t border-gray-200 dark:border-slate-700">
                        <h4 className="text-xs font-semibold text-seal-gray-500 dark:text-slate-400 mb-3">
                          Accès et ressources
                        </h4>
                        <div className="grid grid-cols-3 gap-3">
                          <Link
                            href={`/admin/users?department=${dept.id}`}
                            className="p-3 bg-gray-50 dark:bg-slate-800 rounded-lg text-center hover:bg-gray-100 dark:hover:bg-slate-700 transition"
                          >
                            <Users className="h-5 w-5 text-primary mx-auto mb-1" />
                            <p className="text-xs font-semibold text-seal-navy dark:text-white">
                              {users.length} utilisateurs
                            </p>
                          </Link>
                          <Link
                            href={`/documents?search=${encodeURIComponent(dept.name)}`}
                            className="p-3 bg-gray-50 dark:bg-slate-800 rounded-lg text-center hover:bg-gray-100 dark:hover:bg-slate-700 transition"
                          >
                            <FileText className="h-5 w-5 text-primary mx-auto mb-1" />
                            <p className="text-xs font-semibold text-seal-navy dark:text-white">
                              Documents
                            </p>
                          </Link>
                          <Link
                            href={`/tickets?search=${encodeURIComponent(dept.name)}`}
                            className="p-3 bg-gray-50 dark:bg-slate-800 rounded-lg text-center hover:bg-gray-100 dark:hover:bg-slate-700 transition"
                          >
                            <Ticket className="h-5 w-5 text-primary mx-auto mb-1" />
                            <p className="text-xs font-semibold text-seal-navy dark:text-white">
                              Tickets
                            </p>
                          </Link>
                        </div>
                      </div>

                      <div className="px-4 py-3 border-t border-gray-100 dark:border-slate-700">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={async () => {
                            try {
                              const { data } =
                                await api.get("/users?limit=200");
                              const allUsers = data?.data || [];
                              const currentMemberIds = new Set(
                                users.map((m: DepartmentUser) => m.id),
                              );
                              setAvailableUsers(
                                allUsers.filter(
                                  (u: any) => !currentMemberIds.has(u.id),
                                ),
                              );
                              setAssignDeptId(dept.id);
                              setSelectedUserId("");
                              setUserSearch("");
                            } catch {
                              toast.error(
                                "Erreur lors du chargement des utilisateurs",
                              );
                            }
                          }}
                        >
                          <UserPlus className="h-3.5 w-3.5" /> Ajouter un
                          collaborateur
                        </Button>
                        {assignDeptId === dept.id && (
                          <div className="mt-3 space-y-2">
                            <input
                              type="text"
                              placeholder={t("departments.assign.searchPh")}
                              value={userSearch}
                              onChange={(e) => setUserSearch(e.target.value)}
                              aria-label={t("departments.assign.searchPh")}
                              className="w-full rounded border px-3 py-2 text-sm dark:bg-slate-800 dark:border-slate-600 dark:text-white focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
                            />
                            <div className="flex gap-2">
                              <select
                                aria-label="Sélectionner un collaborateur"
                                className="flex-1 rounded border px-3 py-2 text-sm dark:bg-slate-800 dark:border-slate-600 dark:text-white focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
                                value={selectedUserId}
                                onChange={(e) =>
                                  setSelectedUserId(e.target.value)
                                }
                              >
                                <option value="">
                                  Sélectionner un collaborateur...
                                </option>
                                {availableUsers
                                  .filter((u) => {
                                    if (!userSearch) return true;
                                    const search = userSearch.toLowerCase();
                                    return (
                                      `${u.firstName} ${u.lastName}`
                                        .toLowerCase()
                                        .includes(search) ||
                                      u.email?.toLowerCase().includes(search)
                                    );
                                  })
                                  .map((u) => {
                                    const userDepts: string[] = [];
                                    if (u.department?.name)
                                      userDepts.push(u.department.name);
                                    if (u.departmentMemberships) {
                                      u.departmentMemberships.forEach(
                                        (m: any) => {
                                          if (m.department?.name)
                                            userDepts.push(m.department.name);
                                        },
                                      );
                                    }
                                    const deptLabel =
                                      userDepts.length > 0
                                        ? ` [${userDepts.join(", ")}]`
                                        : "";
                                    return (
                                      <option key={u.id} value={u.id}>
                                        {u.firstName} {u.lastName} ({u.email})
                                        {deptLabel}
                                      </option>
                                    );
                                  })}
                              </select>
                              <Button
                                size="sm"
                                disabled={!selectedUserId || addingUser}
                                loading={addingUser}
                                onClick={async () => {
                                  setAddingUser(true);
                                  try {
                                    await api.patch(
                                      `/departments/${dept.id}/assign-user`,
                                      { userId: selectedUserId },
                                    );
                                    toast.success("Collaborateur ajouté");
                                    setAssignDeptId(null);
                                    setSelectedUserId("");
                                    setUserSearch("");
                                    await Promise.all([
                                      refreshDeptMembers(dept.id),
                                      fetchDepartments(),
                                    ]);
                                  } catch {
                                    toast.error("Erreur lors de l'ajout");
                                  } finally {
                                    setAddingUser(false);
                                  }
                                }}
                              >
                                {t("departments.assign.add")}
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  setAssignDeptId(null);
                                  setUserSearch("");
                                }}
                              >
                                {t("common.cancel")}
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog
        open={showDialog}
        onClose={() => setShowDialog(false)}
        title={
          editDept ? t("departments.editTitle") : t("departments.createTitle")
        }
      >
        <div className="space-y-3">
          <Input
            label={t("departments.label.name")}
            placeholder={t("departments.namePlaceholder")}
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          <Input
            label={t("departments.label.code")}
            placeholder={t("departments.codePlaceholder")}
            value={form.code}
            onChange={(e) =>
              setForm({ ...form, code: e.target.value.toUpperCase() })
            }
          />
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outline" onClick={() => setShowDialog(false)}>
              {t("common.cancel")}
            </Button>
            <Button onClick={handleSave} loading={saving} disabled={saving}>
              {saving
                ? "Enregistrement…"
                : editDept
                  ? t("departments.save")
                  : t("common.create")}
            </Button>
          </div>
        </div>
      </Dialog>

      <ConfirmDialog
        open={!!deleteDept}
        onClose={() => setDeleteDept(null)}
        onConfirm={handleDelete}
        title={t("departments.deleteTitle")}
        description={`${t("departments.deleteTitle")} "${deleteDept?.name}" ? ${t("departments.deleteDescription")}`}
        confirmLabel={t("common.delete")}
        variant="danger"
      />
    </div>
  );
}
