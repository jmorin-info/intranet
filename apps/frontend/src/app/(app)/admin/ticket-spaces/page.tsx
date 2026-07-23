"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  Inbox,
  Monitor,
  Briefcase,
  Shield,
  Plus,
  Trash2,
  UserPlus,
  UserMinus,
  ArrowLeft,
  Edit3,
  X,
  Check,
  Users,
  Tag,
  Building2,
  Settings2,
  Save,
  Clock,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  Button,
  Input,
  Textarea,
  Badge,
  EmptyState,
  Skeleton,
  ConfirmDialog,
} from "@omnitech/ui";
import { PageHeader } from "@/components/layout/page-header";
import { useAuthStore } from "@/stores/auth-store";
import { api } from "@/lib/api";

type Permission = "VIEWER" | "CREATOR" | "AGENT" | "MANAGER";

interface Member {
  id: string;
  spaceId: string;
  userId: string | null;
  role: string | null;
  departmentId: string | null;
  permission: Permission;
  createdAt: string;
}

interface Subcategory {
  value: string;
  label: string;
  color?: string;
}

interface SpaceConfig {
  subcategories?: Subcategory[];
  defaultPriority?: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  requireDescription?: boolean;
  requireAttachment?: boolean;
}

interface SlaConfig {
  CRITICAL?: number;
  HIGH?: number;
  MEDIUM?: number;
  LOW?: number;
}

interface Space {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  icon: string | null;
  color: string | null;
  isDefault: boolean;
  isActive: boolean;
  allowedCategories?: string[];
  slaConfig?: SlaConfig | null;
  config?: SpaceConfig | null;
  members?: Member[];
}

const GLOBAL_CATEGORIES = [
  { value: "INCIDENT", label: "Incident" },
  { value: "REQUEST", label: "Demande" },
  { value: "ACCESS", label: "Accès" },
  { value: "HARDWARE", label: "Matériel" },
  { value: "SOFTWARE", label: "Logiciel" },
  { value: "NETWORK", label: "Réseau" },
  { value: "SECURITY", label: "Sécurité" },
  { value: "OTHER", label: "Autre" },
];

const SLA_DEFAULTS: Record<string, SlaConfig> = {
  general: { CRITICAL: 4, HIGH: 24, MEDIUM: 72, LOW: 168 },
  it: { CRITICAL: 2, HIGH: 8, MEDIUM: 48, LOW: 120 },
  securite: { CRITICAL: 1, HIGH: 4, MEDIUM: 24, LOW: 72 },
  "services-generaux": { CRITICAL: 8, HIGH: 48, MEDIUM: 120, LOW: 240 },
};

interface UserLite {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
}

interface DepartmentLite {
  id: string;
  name: string;
}

const PERMISSIONS: Array<{ value: Permission; label: string; desc: string }> = [
  { value: "VIEWER", label: "Viewer", desc: "Lecture seule des tickets" },
  { value: "CREATOR", label: "Creator", desc: "Peut créer et lire" },
  { value: "AGENT", label: "Agent", desc: "Créer, lire, commenter, être assigné" },
  { value: "MANAGER", label: "Manager", desc: "Contrôle total + gestion membres" },
];

const ROLE_OPTIONS = [
  "COLLABORATEUR",
  "REVIEWER",
  "AUDITEUR",
  "DIRECTION",
  "ADMIN",
  "SUPER_ADMIN",
  "PRESTATAIRE",
];

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  Inbox,
  Monitor,
  Briefcase,
  Shield,
};

export default function TicketSpacesAdminPage() {
  const user = useAuthStore((s) => s.user);
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [users, setUsers] = useState<UserLite[]>([]);
  const [departments, setDepartments] = useState<DepartmentLite[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createDesc, setCreateDesc] = useState("");
  const [creating, setCreating] = useState(false);

  // Add member state
  const [memberScope, setMemberScope] = useState<"user" | "role" | "department">("user");
  const [memberUserId, setMemberUserId] = useState("");
  const [memberRole, setMemberRole] = useState("COLLABORATEUR");
  const [memberDeptId, setMemberDeptId] = useState("");
  const [memberPermission, setMemberPermission] = useState<Permission>("CREATOR");
  const [addingMember, setAddingMember] = useState(false);

  // Space config state (edited from the Configuration panel)
  const [draftAllowed, setDraftAllowed] = useState<string[]>([]);
  const [draftSla, setDraftSla] = useState<SlaConfig>({});
  const [draftSubcats, setDraftSubcats] = useState<Subcategory[]>([]);
  const [newSubcatValue, setNewSubcatValue] = useState("");
  const [newSubcatLabel, setNewSubcatLabel] = useState("");
  const [savingConfig, setSavingConfig] = useState(false);
  const [deleteSpaceConfirm, setDeleteSpaceConfirm] = useState<Space | null>(null);
  const [removeMemberConfirm, setRemoveMemberConfirm] = useState<Member | null>(null);

  const loadSpaces = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get<Space[]>("/ticket-spaces");
      setSpaces(data);
      if (!selectedId && data.length > 0) {
        const first = data[0];
        if (first) setSelectedId(first.id);
      }
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Erreur de chargement des espaces");
    } finally {
      setLoading(false);
    }
  }, [selectedId]);

  useEffect(() => {
    loadSpaces();
    api
      .get("/users", { params: { limit: 500 } })
      .then(({ data }) => {
        setUsers(Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data : []);
      })
      .catch(() => setUsers([]));
    api
      .get("/departments")
      .then(({ data }) => {
        setDepartments(Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data : []);
      })
      .catch(() => setDepartments([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedSpace = useMemo(
    () => spaces.find((s) => s.id === selectedId) ?? null,
    [spaces, selectedId],
  );

  const loadMembers = useCallback(async (spaceId: string) => {
    try {
      const { data } = await api.get<Space>(`/ticket-spaces/${spaceId}`);
      setSpaces((prev) => prev.map((s) => (s.id === spaceId ? data : s)));
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Erreur chargement membres");
    }
  }, []);

  useEffect(() => {
    if (selectedId) loadMembers(selectedId);
  }, [selectedId, loadMembers]);

  // Sync config editor state when a different space is selected or after reload.
  useEffect(() => {
    if (!selectedSpace) return;
    setDraftAllowed(selectedSpace.allowedCategories ?? []);
    setDraftSla((selectedSpace.slaConfig as SlaConfig) ?? {});
    setDraftSubcats((selectedSpace.config as SpaceConfig)?.subcategories ?? []);
    setNewSubcatValue("");
    setNewSubcatLabel("");
  }, [selectedSpace]);

  const handleSaveConfig = useCallback(async () => {
    if (!selectedSpace) return;
    setSavingConfig(true);
    try {
      await api.patch(`/ticket-spaces/${selectedSpace.id}`, {
        allowedCategories: draftAllowed,
        slaConfig: Object.keys(draftSla).length > 0 ? draftSla : null,
        config: {
          ...(selectedSpace.config ?? {}),
          subcategories: draftSubcats,
        },
      });
      toast.success("Configuration enregistrée");
      await loadMembers(selectedSpace.id);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Erreur enregistrement");
    } finally {
      setSavingConfig(false);
    }
  }, [selectedSpace, draftAllowed, draftSla, draftSubcats, loadMembers]);

  const toggleAllowedCategory = (cat: string) => {
    setDraftAllowed((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat],
    );
  };

  const addSubcategory = () => {
    const v = newSubcatValue.trim().toLowerCase().replace(/\s+/g, "-");
    const l = newSubcatLabel.trim();
    if (!v || !l) {
      toast.error("Code et libellé requis");
      return;
    }
    if (draftSubcats.some((s) => s.value === v)) {
      toast.error("Code déjà existant");
      return;
    }
    setDraftSubcats([...draftSubcats, { value: v, label: l }]);
    setNewSubcatValue("");
    setNewSubcatLabel("");
  };

  const removeSubcategory = (value: string) => {
    setDraftSubcats(draftSubcats.filter((s) => s.value !== value));
  };

  const handleCreate = async () => {
    const name = createName.trim();
    if (!name) {
      toast.error("Nom requis");
      return;
    }
    setCreating(true);
    try {
      await api.post("/ticket-spaces", { name, description: createDesc.trim() || undefined });
      toast.success(`Espace "${name}" créé`);
      setShowCreate(false);
      setCreateName("");
      setCreateDesc("");
      await loadSpaces();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Erreur création");
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteSpace = (space: Space) => {
    if (space.isDefault) {
      toast.error("L'espace par défaut ne peut pas être supprimé.");
      return;
    }
    setDeleteSpaceConfirm(space);
  };

  const confirmDeleteSpace = async () => {
    if (!deleteSpaceConfirm) return;
    const space = deleteSpaceConfirm;
    setDeleteSpaceConfirm(null);
    try {
      await api.delete(`/ticket-spaces/${space.id}`);
      toast.success(`Espace supprimé`);
      setSelectedId(null);
      await loadSpaces();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Erreur suppression");
    }
  };

  const handleAddMember = async () => {
    if (!selectedSpace) return;
    const payload: Record<string, unknown> = { permission: memberPermission };
    if (memberScope === "user") {
      if (!memberUserId) {
        toast.error("Sélectionnez un utilisateur");
        return;
      }
      payload.userId = memberUserId;
    } else if (memberScope === "role") {
      payload.role = memberRole;
    } else {
      if (!memberDeptId) {
        toast.error("Sélectionnez un département");
        return;
      }
      payload.departmentId = memberDeptId;
    }
    setAddingMember(true);
    try {
      await api.post(`/ticket-spaces/${selectedSpace.id}/members`, payload);
      toast.success("Membre ajouté");
      setMemberUserId("");
      setMemberDeptId("");
      await loadMembers(selectedSpace.id);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Erreur ajout membre");
    } finally {
      setAddingMember(false);
    }
  };

  const handleRemoveMember = (member: Member) => {
    if (!selectedSpace) return;
    setRemoveMemberConfirm(member);
  };

  const confirmRemoveMember = async () => {
    if (!selectedSpace || !removeMemberConfirm) return;
    const member = removeMemberConfirm;
    setRemoveMemberConfirm(null);
    try {
      await api.delete(`/ticket-spaces/${selectedSpace.id}/members/${member.id}`);
      toast.success("Membre retiré");
      await loadMembers(selectedSpace.id);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Erreur suppression membre");
    }
  };

  const handleChangePermission = async (member: Member, newPerm: Permission) => {
    if (!selectedSpace || member.permission === newPerm) return;
    try {
      await api.patch(`/ticket-spaces/${selectedSpace.id}/members/${member.id}`, {
        permission: newPerm,
      });
      toast.success("Permission mise à jour");
      await loadMembers(selectedSpace.id);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Erreur mise à jour");
    }
  };

  const memberLabel = (m: Member): { primary: string; secondary: string } => {
    if (m.userId) {
      const u = users.find((x) => x.id === m.userId);
      return {
        primary: u ? `${u.firstName} ${u.lastName}` : `User ${m.userId.slice(0, 8)}…`,
        secondary: u?.email ?? "Utilisateur",
      };
    }
    if (m.role)
      return { primary: `Rôle : ${m.role}`, secondary: "Tous les utilisateurs de ce rôle" };
    if (m.departmentId) {
      const d = departments.find((x) => x.id === m.departmentId);
      return {
        primary: `Département : ${d?.name ?? m.departmentId.slice(0, 8)}`,
        secondary: "Tous les membres de ce département",
      };
    }
    return { primary: "—", secondary: "" };
  };

  if (loading) {
    return (
      <div className="p-6">
        <Skeleton className="h-8 w-64" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 bg-gray-50 dark:bg-slate-950 min-h-screen">
      <div className="flex items-center gap-3">
        <Link
          href="/admin"
          className="text-seal-gray-500 hover:text-seal-navy dark:hover:text-white"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <PageHeader
          title="Espaces de ticketing"
          subtitle="Créez des espaces distincts (IT, RH, Sécurité, …) et gérez l'accès par utilisateur, rôle ou département."
          icon={Inbox}
          hub="admin"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left : Spaces list */}
        <div className="space-y-3">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-seal-navy dark:text-white">
                  Espaces ({spaces.length})
                </h2>
                <Button size="sm" onClick={() => setShowCreate(true)}>
                  <Plus className="h-3.5 w-3.5 mr-1" /> Nouveau
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-1.5">
              {spaces.map((space) => {
                const Icon = (space.icon && ICONS[space.icon]) || Inbox;
                const active = space.id === selectedId;
                return (
                  <button
                    key={space.id}
                    type="button"
                    onClick={() => setSelectedId(space.id)}
                    className={`w-full text-left flex items-center gap-3 px-3 py-2 rounded-lg transition ${
                      active
                        ? "bg-seal-orange/10 border border-seal-orange/30"
                        : "hover:bg-gray-100 dark:hover:bg-slate-800 border border-transparent"
                    }`}
                  >
                    <Icon
                      className="h-4 w-4 flex-shrink-0"
                      style={{ color: space.color ?? "#676d7f" }}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-seal-navy dark:text-white truncate">
                          {space.name}
                        </span>
                        {space.isDefault && (
                          <Badge variant="seal-blue" className="text-[9px]">
                            défaut
                          </Badge>
                        )}
                      </div>
                      <p className="text-[11px] text-seal-gray-500 line-clamp-1">
                        {space.description ?? "—"}
                      </p>
                    </div>
                  </button>
                );
              })}
              {spaces.length === 0 && (
                <EmptyState
                  title="Aucun espace"
                  description="Créez le premier espace de ticketing."
                />
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right : Detail + Members */}
        <div className="lg:col-span-2 space-y-4">
          {selectedSpace ? (
            <>
              <Card>
                <CardHeader>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h2 className="text-lg font-semibold text-seal-navy dark:text-white">
                        {selectedSpace.name}
                      </h2>
                      <p className="text-xs text-seal-gray-500 mt-0.5">
                        Slug : <code className="font-mono">{selectedSpace.slug}</code>
                      </p>
                      {selectedSpace.description && (
                        <p className="text-sm text-seal-gray-500 dark:text-slate-400 mt-2">
                          {selectedSpace.description}
                        </p>
                      )}
                    </div>
                    {!selectedSpace.isDefault && (
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={() => handleDeleteSpace(selectedSpace)}
                      >
                        <Trash2 className="h-3.5 w-3.5 mr-1" /> Supprimer
                      </Button>
                    )}
                  </div>
                </CardHeader>
              </Card>

              {/* Configuration de l'espace (catégories / SLA / sous-catégories) */}
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-seal-navy dark:text-white flex items-center gap-2">
                      <Settings2 className="h-4 w-4" />
                      Configuration de l&apos;espace
                    </h3>
                    <Button
                      size="sm"
                      onClick={handleSaveConfig}
                      loading={savingConfig}
                      disabled={savingConfig}
                    >
                      <Save className="h-3.5 w-3.5 mr-1" /> Enregistrer
                    </Button>
                  </div>
                  <p className="text-[11px] text-seal-gray-500 mt-1">
                    Seuls les managers de cet espace (et les administrateurs) peuvent modifier ces
                    paramètres.
                  </p>
                </CardHeader>
                <CardContent className="space-y-5">
                  {/* Allowed categories */}
                  <div>
                    <label className="text-xs font-medium text-seal-navy dark:text-white flex items-center gap-1.5 mb-2">
                      <Tag className="h-3.5 w-3.5" /> Catégories génériques autorisées
                    </label>
                    <p className="text-[11px] text-seal-gray-500 mb-2">
                      Cochez les catégories standards disponibles dans cet espace. Si tout est
                      décoché, toutes les catégories sont autorisées. Pour ajouter des catégories{" "}
                      <strong>spécifiques à votre métier</strong> (RMA, Congés, Conformité…),
                      utilisez la section &quot;Catégories personnalisées&quot; ci-dessous.
                    </p>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                      {GLOBAL_CATEGORIES.map((c) => {
                        const checked = draftAllowed.includes(c.value);
                        return (
                          <label
                            key={c.value}
                            className={`flex items-center gap-2 p-2 rounded border cursor-pointer text-xs transition ${
                              checked
                                ? "border-seal-orange bg-seal-orange/5"
                                : "border-gray-200 dark:border-slate-700 hover:border-seal-orange/50"
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleAllowedCategory(c.value)}
                              className="h-3.5 w-3.5"
                            />
                            <span className="text-seal-navy dark:text-white">{c.label}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>

                  {/* SLA config */}
                  <div>
                    <label className="text-xs font-medium text-seal-navy dark:text-white flex items-center gap-1.5 mb-2">
                      <Clock className="h-3.5 w-3.5" /> SLA de résolution (en heures)
                    </label>
                    <p className="text-[11px] text-seal-gray-500 mb-2">
                      Temps maximum avant résolution attendu par priorité. Laisser vide pour
                      utiliser les SLA globaux par défaut.
                    </p>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                      {(["CRITICAL", "HIGH", "MEDIUM", "LOW"] as const).map((prio) => (
                        <div key={prio}>
                          <label className="text-[10px] uppercase font-semibold text-seal-gray-500">
                            {prio}
                          </label>
                          <Input
                            type="number"
                            min={0}
                            value={draftSla[prio] ?? ""}
                            onChange={(e) => {
                              const raw = e.target.value;
                              const num = raw === "" ? undefined : parseInt(raw, 10);
                              setDraftSla((prev) => ({
                                ...prev,
                                [prio]: num,
                              }));
                            }}
                            placeholder={String(SLA_DEFAULTS.general?.[prio] ?? "")}
                          />
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Custom categories (subcategories) */}
                  <div>
                    <label className="text-xs font-medium text-seal-navy dark:text-white flex items-center gap-1.5 mb-2">
                      <Plus className="h-3.5 w-3.5" /> Catégories personnalisées de cet espace
                    </label>
                    <p className="text-[11px] text-seal-gray-500 mb-2">
                      Créez vos propres catégories métier : &quot;RMA&quot;, &quot;Déploiement&quot;
                      pour l&apos;IT ; &quot;Congés&quot;, &quot;Paie&quot; pour les RH ;
                      &quot;Conformité&quot;, &quot;Audit&quot; pour la Sécurité. Elles
                      s&apos;afficheront dans le formulaire de création de ticket de cet espace, en
                      complément des catégories génériques cochées ci-dessus.
                    </p>
                    <div className="space-y-1.5">
                      {draftSubcats.length === 0 && (
                        <p className="text-[11px] text-seal-gray-500 italic py-2">
                          Aucune catégorie personnalisée pour l&apos;instant — ajoutez-en une
                          ci-dessous.
                        </p>
                      )}
                      {draftSubcats.map((s) => (
                        <div
                          key={s.value}
                          className="flex items-center gap-2 p-2 rounded border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800/50"
                        >
                          <code className="text-[11px] font-mono text-seal-orange bg-white dark:bg-slate-900 px-1.5 py-0.5 rounded">
                            {s.value}
                          </code>
                          <span className="text-sm text-seal-navy dark:text-white flex-1">
                            {s.label}
                          </span>
                          <button
                            type="button"
                            onClick={() => removeSubcategory(s.value)}
                            aria-label="Retirer"
                            className="p-1 rounded hover:bg-red-50 dark:hover:bg-red-900/20 text-red-500"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                    <div className="mt-2 flex items-end gap-2">
                      <div className="w-36">
                        <label className="text-[10px] uppercase font-semibold text-seal-gray-500">
                          Code
                        </label>
                        <Input
                          value={newSubcatValue}
                          onChange={(e) => setNewSubcatValue(e.target.value)}
                          placeholder="rma"
                        />
                      </div>
                      <div className="flex-1">
                        <label className="text-[10px] uppercase font-semibold text-seal-gray-500">
                          Libellé
                        </label>
                        <Input
                          value={newSubcatLabel}
                          onChange={(e) => setNewSubcatLabel(e.target.value)}
                          placeholder="Retour matériel (RMA)"
                        />
                      </div>
                      <Button size="sm" onClick={addSubcategory}>
                        <Plus className="h-3.5 w-3.5 mr-1" /> Ajouter
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Membres */}
              <Card>
                <CardHeader>
                  <h3 className="text-sm font-semibold text-seal-navy dark:text-white flex items-center gap-2">
                    <Users className="h-4 w-4" />
                    Membres ({selectedSpace.members?.length ?? 0})
                  </h3>
                </CardHeader>
                <CardContent className="space-y-3">
                  {/* Add member row */}
                  <div className="rounded-lg border border-dashed border-seal-gray-300 dark:border-slate-700 p-3 space-y-2">
                    <div className="flex items-center gap-2 text-xs">
                      <span className="text-seal-gray-500">Scope :</span>
                      {(["user", "role", "department"] as const).map((s) => (
                        <button
                          key={s}
                          type="button"
                          onClick={() => setMemberScope(s)}
                          className={`px-2 py-1 rounded text-[11px] font-medium transition ${
                            memberScope === s
                              ? "bg-seal-orange text-white"
                              : "bg-gray-100 dark:bg-slate-800 text-seal-gray-500 hover:bg-gray-200"
                          }`}
                        >
                          {s === "user" ? "Utilisateur" : s === "role" ? "Rôle" : "Département"}
                        </button>
                      ))}
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2 items-end">
                      {memberScope === "user" && (
                        <select
                          className="w-full rounded border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1.5 text-sm"
                          value={memberUserId}
                          onChange={(e) => setMemberUserId(e.target.value)}
                        >
                          <option value="">— Choisir un utilisateur —</option>
                          {users.map((u) => (
                            <option key={u.id} value={u.id}>
                              {u.firstName} {u.lastName} — {u.role}
                            </option>
                          ))}
                        </select>
                      )}
                      {memberScope === "role" && (
                        <select
                          className="w-full rounded border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1.5 text-sm"
                          value={memberRole}
                          onChange={(e) => setMemberRole(e.target.value)}
                        >
                          {ROLE_OPTIONS.map((r) => (
                            <option key={r} value={r}>
                              {r}
                            </option>
                          ))}
                        </select>
                      )}
                      {memberScope === "department" && (
                        <select
                          className="w-full rounded border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1.5 text-sm"
                          value={memberDeptId}
                          onChange={(e) => setMemberDeptId(e.target.value)}
                        >
                          <option value="">— Choisir un département —</option>
                          {departments.map((d) => (
                            <option key={d.id} value={d.id}>
                              {d.name}
                            </option>
                          ))}
                        </select>
                      )}
                      <select
                        className="w-full rounded border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1.5 text-sm"
                        value={memberPermission}
                        onChange={(e) => setMemberPermission(e.target.value as Permission)}
                      >
                        {PERMISSIONS.map((p) => (
                          <option key={p.value} value={p.value}>
                            {p.label}
                          </option>
                        ))}
                      </select>
                      <Button size="sm" onClick={handleAddMember} loading={addingMember}>
                        <UserPlus className="h-3.5 w-3.5 mr-1" /> Ajouter
                      </Button>
                    </div>
                  </div>

                  {/* Members list */}
                  <div className="space-y-1.5">
                    {(selectedSpace.members ?? []).length === 0 && (
                      <p className="text-xs text-seal-gray-500 py-4 text-center">
                        Aucun membre pour cet espace.
                      </p>
                    )}
                    {(selectedSpace.members ?? []).map((m) => {
                      const { primary, secondary } = memberLabel(m);
                      const scopeIcon = m.userId ? (
                        <Users className="h-3.5 w-3.5" />
                      ) : m.role ? (
                        <Tag className="h-3.5 w-3.5" />
                      ) : (
                        <Building2 className="h-3.5 w-3.5" />
                      );
                      return (
                        <div
                          key={m.id}
                          className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-800"
                        >
                          <span className="text-seal-gray-500">{scopeIcon}</span>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-seal-navy dark:text-white truncate">
                              {primary}
                            </p>
                            <p className="text-[11px] text-seal-gray-500 truncate">{secondary}</p>
                          </div>
                          <select
                            value={m.permission}
                            onChange={(e) =>
                              handleChangePermission(m, e.target.value as Permission)
                            }
                            className="text-xs rounded border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1"
                          >
                            {PERMISSIONS.map((p) => (
                              <option key={p.value} value={p.value}>
                                {p.label}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            onClick={() => handleRemoveMember(m)}
                            aria-label="Retirer le membre"
                            className="p-1.5 rounded hover:bg-red-50 dark:hover:bg-red-900/20 text-red-500 transition"
                          >
                            <UserMinus className="h-4 w-4" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            </>
          ) : (
            <EmptyState
              title="Sélectionnez un espace"
              description="Choisissez un espace dans la liste de gauche pour voir ses membres."
            />
          )}
        </div>
      </div>

      {/* Create space modal */}
      {showCreate && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50"
          onClick={() => setShowCreate(false)}
        >
          <div
            className="bg-white dark:bg-slate-900 rounded-xl shadow-xl max-w-md w-full p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-seal-navy dark:text-white">
                Nouvel espace
              </h2>
              <button onClick={() => setShowCreate(false)} aria-label="Fermer">
                <X className="h-5 w-5 text-seal-gray-500" />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-seal-gray-500">Nom *</label>
                <Input
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                  placeholder="RH, Finance, …"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-seal-gray-500">Description</label>
                <Textarea
                  value={createDesc}
                  onChange={(e) => setCreateDesc(e.target.value)}
                  rows={3}
                  placeholder="Description courte de l'espace"
                />
              </div>
              <p className="text-[11px] text-seal-gray-500">
                Vous serez ajouté comme <strong>Manager</strong> de cet espace automatiquement.
              </p>
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setShowCreate(false)}>
                Annuler
              </Button>
              <Button onClick={handleCreate} loading={creating}>
                Créer
              </Button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!deleteSpaceConfirm}
        onClose={() => setDeleteSpaceConfirm(null)}
        onConfirm={confirmDeleteSpace}
        title="Supprimer l'espace"
        description={
          deleteSpaceConfirm
            ? `Supprimer l'espace "${deleteSpaceConfirm.name}" ? Les tickets seront réassignés à l'espace par défaut.`
            : ""
        }
        variant="danger"
      />

      <ConfirmDialog
        open={!!removeMemberConfirm}
        onClose={() => setRemoveMemberConfirm(null)}
        onConfirm={confirmRemoveMember}
        title="Retirer le membre"
        description="Retirer ce membre de l'espace ?"
        variant="danger"
      />
    </div>
  );
}
