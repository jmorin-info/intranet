"use client";

import React, { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import {
  Card,
  CardContent,
  Button,
  Dialog,
  Input,
  Select,
  Badge,
  EmptyState,
  Skeleton,
} from "@omnitech/ui";
import { ShieldCheck, Trash2, Plus, User, Building2, Tag } from "lucide-react";

interface Permission {
  id: string;
  level: "READ" | "COMMENT" | "EDIT" | "ADMIN";
  expiresAt: string | null;
  createdAt: string;
  user?: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
  } | null;
  department?: { id: string; name: string; code: string } | null;
  role?: string | null;
  grantedBy?: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
  } | null;
}

interface DepartmentOption {
  id: string;
  name: string;
  code: string;
}
interface UserOption {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
}

const ROLE_OPTIONS = [
  { value: "COLLABORATEUR", label: "Collaborateur" },
  { value: "MANAGER", label: "Manager" },
  { value: "REVIEWER", label: "Réviseur" },
  { value: "AUDITEUR", label: "Auditeur" },
  { value: "DIRECTION", label: "Direction" },
  { value: "ADMIN", label: "Administrateur" },
];

const LEVEL_OPTIONS = [
  { value: "READ", label: "Lecture" },
  { value: "COMMENT", label: "Commentaire" },
  { value: "EDIT", label: "Édition" },
  { value: "ADMIN", label: "Administration" },
];

const LEVEL_BADGE: Record<Permission["level"], string> = {
  READ: "bg-blue-100 text-blue-800",
  COMMENT: "bg-emerald-100 text-emerald-800",
  EDIT: "bg-amber-100 text-amber-800",
  ADMIN: "bg-rose-100 text-rose-800",
};

interface PermissionsPanelProps {
  documentId: string;
  /** L'utilisateur courant a-t-il le droit d'administrer (owner / ADMIN+) ? */
  canAdmin: boolean;
}

/**
 * Panneau de gestion des permissions GED granulaires (ISO 27001 A.5.15).
 * Liste les permissions explicites + permet d'en ajouter / révoquer.
 */
export function PermissionsPanel({
  documentId,
  canAdmin,
}: PermissionsPanelProps) {
  const [perms, setPerms] = useState<Permission[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [departments, setDepartments] = useState<DepartmentOption[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<Permission[]>(
        `/documents/${documentId}/permissions`,
      );
      setPerms(res.data);
    } catch (e: any) {
      const status = e?.response?.status;
      if (status === 403) {
        // Pas droit d'admin — on n'affiche rien plutôt que crasher
        setPerms([]);
      } else {
        toast.error("Impossible de charger les permissions");
      }
    } finally {
      setLoading(false);
    }
  }, [documentId]);

  useEffect(() => {
    if (canAdmin) load();
    else setLoading(false);
  }, [canAdmin, load]);

  // Lazy-load users & departments only when the modal opens
  useEffect(() => {
    if (!showAdd) return;
    if (users.length === 0) {
      api
        .get<{ data: UserOption[] } | UserOption[]>(`/users?limit=200`)
        .then((r) => {
          const list = Array.isArray(r.data)
            ? r.data
            : (r.data as any)?.data || [];
          setUsers(list);
        })
        .catch(() => undefined);
    }
    if (departments.length === 0) {
      api
        .get<DepartmentOption[]>(`/departments`)
        .then((r) =>
          setDepartments(
            Array.isArray(r.data) ? r.data : (r.data as any)?.data || [],
          ),
        )
        .catch(() => undefined);
    }
  }, [showAdd, users.length, departments.length]);

  const handleRevoke = async (permId: string) => {
    if (!confirm("Révoquer cette permission ?")) return;
    try {
      await api.delete(`/documents/${documentId}/permissions/${permId}`);
      toast.success("Permission révoquée");
      await load();
    } catch {
      toast.error("Impossible de révoquer");
    }
  };

  const formatTarget = (p: Permission) => {
    if (p.user) {
      return (
        <span className="inline-flex items-center gap-1.5 text-sm">
          <User className="h-3.5 w-3.5 text-seal-navy/70" />
          {p.user.firstName} {p.user.lastName}{" "}
          <span className="text-xs text-seal-gray-500">({p.user.email})</span>
        </span>
      );
    }
    if (p.department) {
      return (
        <span className="inline-flex items-center gap-1.5 text-sm">
          <Building2 className="h-3.5 w-3.5 text-seal-navy/70" />
          Département {p.department.name}{" "}
          <span className="text-xs text-seal-gray-500">
            ({p.department.code})
          </span>
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 text-sm">
        <Tag className="h-3.5 w-3.5 text-seal-navy/70" />
        Rôle {p.role}
      </span>
    );
  };

  if (!canAdmin) {
    return (
      <Card>
        <CardContent className="py-8">
          <EmptyState
            title="Accès restreint"
            description="Seul le propriétaire ou un administrateur peut gérer les permissions."
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="space-y-4 p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-seal-navy" />
            <h3 className="font-semibold text-seal-navy">
              Permissions explicites
            </h3>
          </div>
          <Button variant="primary" size="sm" onClick={() => setShowAdd(true)}>
            <Plus className="h-3.5 w-3.5" />
            Ajouter
          </Button>
        </div>

        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : perms.length === 0 ? (
          <EmptyState
            title="Aucune permission explicite"
            description="Ce document utilise les règles d'accès basées sur la classification."
          />
        ) : (
          <ul className="divide-y divide-gray-100 dark:divide-slate-700">
            {perms.map((p) => (
              <li
                key={p.id}
                className="flex items-center justify-between gap-3 py-3"
              >
                <div className="flex-1 min-w-0">
                  <div>{formatTarget(p)}</div>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-seal-gray-500">
                    <Badge className={LEVEL_BADGE[p.level]}>{p.level}</Badge>
                    {p.expiresAt && (
                      <span>
                        Expire le{" "}
                        {new Date(p.expiresAt).toLocaleDateString("fr-FR")}
                      </span>
                    )}
                    {p.grantedBy && (
                      <span>
                        Accordé par {p.grantedBy.firstName}{" "}
                        {p.grantedBy.lastName}
                      </span>
                    )}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleRevoke(p.id)}
                  aria-label="Révoquer la permission"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>

      <AddPermissionDialog
        open={showAdd}
        onClose={() => setShowAdd(false)}
        documentId={documentId}
        users={users}
        departments={departments}
        onAdded={() => {
          setShowAdd(false);
          load();
        }}
      />
    </Card>
  );
}

interface AddPermissionDialogProps {
  open: boolean;
  onClose: () => void;
  documentId: string;
  users: UserOption[];
  departments: DepartmentOption[];
  onAdded: () => void;
}

function AddPermissionDialog({
  open,
  onClose,
  documentId,
  users,
  departments,
  onAdded,
}: AddPermissionDialogProps) {
  const [targetType, setTargetType] = useState<"user" | "department" | "role">(
    "user",
  );
  const [userId, setUserId] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [role, setRole] = useState("");
  const [level, setLevel] = useState<Permission["level"]>("READ");
  const [expiresAt, setExpiresAt] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const reset = () => {
    setTargetType("user");
    setUserId("");
    setDepartmentId("");
    setRole("");
    setLevel("READ");
    setExpiresAt("");
  };

  const handleSubmit = async () => {
    const body: Record<string, unknown> = {
      level,
      expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
    };
    if (targetType === "user") {
      if (!userId) {
        toast.error("Sélectionnez un utilisateur");
        return;
      }
      body.userId = userId;
    } else if (targetType === "department") {
      if (!departmentId) {
        toast.error("Sélectionnez un département");
        return;
      }
      body.departmentId = departmentId;
    } else {
      if (!role) {
        toast.error("Sélectionnez un rôle");
        return;
      }
      body.role = role;
    }

    setSubmitting(true);
    try {
      await api.post(`/documents/${documentId}/permissions`, body);
      toast.success("Permission accordée");
      reset();
      onAdded();
    } catch (e: any) {
      const msg = e?.response?.data?.message || "Impossible d'ajouter";
      toast.error(typeof msg === "string" ? msg : "Erreur");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={() => {
        reset();
        onClose();
      }}
      title="Ajouter une permission"
      description="Accorde un accès cumulatif (READ → COMMENT → EDIT → ADMIN) à un utilisateur, un département ou un rôle."
      size="md"
    >
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-seal-navy mb-1">
            Cible
          </label>
          <div className="grid grid-cols-3 gap-2">
            {(["user", "department", "role"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTargetType(t)}
                className={`px-3 py-2 rounded-btn text-sm border transition-colors ${
                  targetType === t
                    ? "bg-seal-navy text-white border-seal-navy"
                    : "bg-white dark:bg-slate-900 border-gray-200 dark:border-slate-700 text-seal-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-800"
                }`}
              >
                {t === "user"
                  ? "Utilisateur"
                  : t === "department"
                    ? "Département"
                    : "Rôle"}
              </button>
            ))}
          </div>
        </div>

        {targetType === "user" && (
          <Select
            label="Utilisateur"
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            options={[
              { value: "", label: "— Sélectionner —" },
              ...users.map((u) => ({
                value: u.id,
                label: `${u.firstName} ${u.lastName} (${u.email})`,
              })),
            ]}
          />
        )}
        {targetType === "department" && (
          <Select
            label="Département"
            value={departmentId}
            onChange={(e) => setDepartmentId(e.target.value)}
            options={[
              { value: "", label: "— Sélectionner —" },
              ...departments.map((d) => ({
                value: d.id,
                label: `${d.name} (${d.code})`,
              })),
            ]}
          />
        )}
        {targetType === "role" && (
          <Select
            label="Rôle"
            value={role}
            onChange={(e) => setRole(e.target.value)}
            options={[
              { value: "", label: "— Sélectionner —" },
              ...ROLE_OPTIONS,
            ]}
          />
        )}

        <Select
          label="Niveau"
          value={level}
          onChange={(e) => setLevel(e.target.value as Permission["level"])}
          options={LEVEL_OPTIONS}
        />

        <Input
          label="Expiration (optionnel)"
          type="date"
          value={expiresAt}
          onChange={(e) => setExpiresAt(e.target.value)}
        />

        <div className="flex justify-end gap-2 pt-2">
          <Button
            variant="outline"
            onClick={() => {
              reset();
              onClose();
            }}
            disabled={submitting}
          >
            Annuler
          </Button>
          <Button variant="primary" onClick={handleSubmit} loading={submitting}>
            Accorder
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
