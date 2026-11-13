"use client";

/**
 * Espace de gestion fine des signatures et exemptions.
 *
 * Page admin distincte de `/admin/signatures` (qui gère l'ancien système
 * `SignatureRequest` doc-par-doc). Cette page exploite les nouveaux endpoints :
 *  - GET    /signature-campaigns                            → liste campagnes
 *  - GET    /signature-campaigns/:id                        → détail campagne
 *  - POST   /signature-campaigns/:id/signatures             → ajoute users
 *  - DELETE /signature-campaigns/:id/signatures/:userId     → retire user
 *  - POST   /signature-campaigns/:id/signatures/:u/reset    → re-signe requise
 *  - POST   /signature-campaigns/:id/signatures/:u/remind   → relance ciblée
 *  - GET    /chartes                                        → liste chartes
 *  - GET    /chartes/:id/exemptions                         → exemptions actives
 *  - POST   /chartes/:id/exemptions                         → exemption avec motif
 *  - DELETE /chartes/:id/exemptions/:exemptionId            → lever exemption
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import {
  Card,
  CardContent,
  CardHeader,
  Badge,
  Button,
  Dialog,
  Skeleton,
  Input,
  Textarea,
  ConfirmDialog,
} from "@omnitech/ui";
import {
  Users,
  ShieldCheck,
  RefreshCw,
  UserMinus,
  UserPlus,
  Bell,
  AlertTriangle,
  Search,
  CheckCircle2,
  XCircle,
  Clock,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { logger } from "@/lib/logger";
import { PageHeader } from "@/components/layout/page-header";
import { formatDateTime } from "@/lib/utils";

const AdminGroupTabs = dynamic(
  () =>
    import("@/components/layout/admin-group-tabs").then((m) => ({
      default: m.AdminGroupTabs,
    })),
  { ssr: false, loading: () => <div className="shimmer h-20 rounded-xl" /> },
);

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

type SignatureStatus = "PENDING" | "OPENED" | "SIGNED" | "DECLINED" | "EXPIRED";

interface UserLite {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
}

interface CampaignSignature {
  id: string;
  userId: string;
  status: SignatureStatus;
  sentAt: string | null;
  openedAt: string | null;
  signedAt: string | null;
  remindersSent: number;
  lastReminderAt: string | null;
  user?: UserLite;
}

interface CampaignDetail {
  id: string;
  title: string;
  description: string | null;
  status: string;
  sourceType: string;
  dueAt: string | null;
  signatures: CampaignSignature[];
  _count?: { signatures: number };
}

interface CampaignListItem {
  id: string;
  title: string;
  status: string;
  dueAt: string | null;
  _count?: { signatures: number };
}

interface CharteExemption {
  id: string;
  charteId: string;
  userId: string;
  reason: string;
  exemptedAt: string;
  expiresAt: string | null;
  revokedAt: string | null;
  user?: UserLite;
  exemptedBy?: UserLite;
}

interface CharteListItem {
  id: string;
  title: string;
  slug: string;
  isMandatory: boolean;
  isActive: boolean;
  signedByDirection: boolean;
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

const STATUS_LABEL: Record<SignatureStatus, string> = {
  PENDING: "En attente",
  OPENED: "Ouvert",
  SIGNED: "Signé",
  DECLINED: "Refusé",
  EXPIRED: "Expiré",
};

function statusVariant(s: SignatureStatus) {
  switch (s) {
    case "SIGNED":
      return "success";
    case "PENDING":
      return "warning";
    case "OPENED":
      return "info";
    case "DECLINED":
      return "error";
    case "EXPIRED":
      return "draft";
    default:
      return "info";
  }
}

// -----------------------------------------------------------------------------
// Vue détail d'une campagne — tableau signataires + actions inline
// -----------------------------------------------------------------------------

function CampaignDetailView({
  campaignId,
  onClose,
  onChange,
}: {
  campaignId: string;
  onClose: () => void;
  onChange: () => void;
}) {
  const [detail, setDetail] = useState<CampaignDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [filter, setFilter] = useState<"ALL" | SignatureStatus>("ALL");
  const [addOpen, setAddOpen] = useState(false);
  const [removeUserId, setRemoveUserId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/signature-campaigns/${campaignId}`);
      setDetail(data);
    } catch (err) {
      logger.error(err, { context: "campaign-detail" });
      toast.error("Impossible de charger le détail de la campagne");
    } finally {
      setLoading(false);
    }
  }, [campaignId]);

  useEffect(() => {
    load();
  }, [load]);

  function handleRemove(userId: string) {
    setRemoveUserId(userId);
  }

  async function confirmRemove() {
    if (!removeUserId) return;
    const userId = removeUserId;
    setRemoveUserId(null);
    setBusyId(userId);
    try {
      await api.delete(`/signature-campaigns/${campaignId}/signatures/${userId}`);
      toast.success("Personne retirée de la campagne");
      await load();
      onChange();
    } catch (e: any) {
      toast.error(e?.response?.data?.message || "Échec du retrait");
    } finally {
      setBusyId(null);
    }
  }

  async function handleReset(userId: string) {
    const reason = prompt("Motif du re-déclenchement de signature (sera tracé dans l'audit) :");
    if (!reason?.trim()) return;
    setBusyId(userId);
    try {
      await api.post(`/signature-campaigns/${campaignId}/signatures/${userId}/reset`, { reason });
      toast.success("Signature re-armée — l'utilisateur doit re-signer");
      await load();
      onChange();
    } catch (e: any) {
      toast.error(e?.response?.data?.message || "Échec du reset");
    } finally {
      setBusyId(null);
    }
  }

  async function handleRemind(userId: string) {
    setBusyId(userId);
    try {
      await api.post(`/signature-campaigns/${campaignId}/signatures/${userId}/remind`);
      toast.success("Relance envoyée");
      await load();
    } catch (e: any) {
      toast.error(e?.response?.data?.message || "Échec de la relance");
    } finally {
      setBusyId(null);
    }
  }

  // Stabilise la reference : sans useMemo, `[]` est recree a chaque render
  // quand detail.signatures est absent -> useMemo plus bas recompute pour rien.
  const signatures = useMemo(() => detail?.signatures || [], [detail?.signatures]);
  const filtered = useMemo(
    () => (filter === "ALL" ? signatures : signatures.filter((s) => s.status === filter)),
    [signatures, filter],
  );

  if (loading || !detail) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-10 rounded" />
        <Skeleton className="h-64 rounded" />
      </div>
    );
  }

  const counts = signatures.reduce<Record<string, number>>(
    (acc, s) => {
      acc[s.status] = (acc[s.status] || 0) + 1;
      acc.ALL = (acc.ALL || 0) + 1;
      return acc;
    },
    { ALL: 0, PENDING: 0, OPENED: 0, SIGNED: 0, DECLINED: 0, EXPIRED: 0 },
  );

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-seal-navy dark:text-white">{detail.title}</h3>
          {detail.description && (
            <p className="text-sm text-seal-gray-500 dark:text-slate-400 mt-1">
              {detail.description}
            </p>
          )}
          <div className="flex gap-2 mt-2 text-xs text-seal-gray-500 dark:text-slate-400">
            <Badge variant="info">{detail.status}</Badge>
            <Badge variant="primary">{detail.sourceType}</Badge>
            {detail.dueAt && (
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {formatDateTime(detail.dueAt)}
              </span>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setAddOpen(true)}>
            <UserPlus className="h-4 w-4" />
            Ajouter
          </Button>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Fermer
          </Button>
        </div>
      </div>

      {/* Filter chips */}
      <div className="flex flex-wrap gap-1.5">
        {(["ALL", "PENDING", "OPENED", "SIGNED", "DECLINED", "EXPIRED"] as const).map((s) => {
          const active = filter === s;
          return (
            <button
              key={s}
              type="button"
              onClick={() => setFilter(s)}
              className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                active
                  ? "bg-primary text-white border-primary"
                  : "bg-white dark:bg-slate-800 border-gray-200 dark:border-slate-700 text-seal-gray-500 dark:text-slate-400 hover:border-primary/40"
              }`}
            >
              {s === "ALL" ? "Tous" : STATUS_LABEL[s as SignatureStatus]} · {counts[s] || 0}
            </button>
          );
        })}
      </div>

      {/* Tableau signataires */}
      <div className="rounded-card border border-gray-200 dark:border-slate-700 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 dark:bg-slate-800 text-xs uppercase tracking-wider text-seal-gray-500 dark:text-slate-400">
              <th className="text-left px-4 py-2 font-medium">Personne</th>
              <th className="text-left px-4 py-2 font-medium">Statut</th>
              <th className="text-left px-4 py-2 font-medium">Signée le</th>
              <th className="text-left px-4 py-2 font-medium">Relances</th>
              <th className="text-right px-4 py-2 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
            {filtered.length === 0 && (
              <tr>
                <td
                  colSpan={5}
                  className="px-4 py-12 text-center text-sm text-seal-gray-500 dark:text-slate-400"
                >
                  Aucun signataire dans ce filtre.
                </td>
              </tr>
            )}
            {filtered.map((s) => (
              <tr key={s.id} className="hover:bg-gray-50/50 dark:hover:bg-slate-800/40">
                <td className="px-4 py-2.5">
                  <div className="font-medium text-seal-navy dark:text-white">
                    {s.user?.firstName} {s.user?.lastName}
                  </div>
                  <div className="text-xs text-seal-gray-500 dark:text-slate-400">
                    {s.user?.email}
                  </div>
                </td>
                <td className="px-4 py-2.5">
                  <Badge variant={statusVariant(s.status) as any}>{STATUS_LABEL[s.status]}</Badge>
                </td>
                <td className="px-4 py-2.5 text-xs text-seal-gray-500 dark:text-slate-400">
                  {s.signedAt ? formatDateTime(s.signedAt) : "—"}
                </td>
                <td className="px-4 py-2.5 text-xs text-seal-gray-500 dark:text-slate-400">
                  {s.remindersSent}
                  {s.lastReminderAt && (
                    <span className="ml-1">({formatDateTime(s.lastReminderAt)})</span>
                  )}
                </td>
                <td className="px-4 py-2.5">
                  <div className="flex justify-end gap-1">
                    {s.status !== "SIGNED" && s.status !== "DECLINED" && (
                      <Button
                        variant="ghost"
                        size="icon"
                        title="Relancer"
                        onClick={() => handleRemind(s.userId)}
                        disabled={busyId === s.userId}
                        className="h-8 w-8"
                      >
                        <Bell className="h-4 w-4" />
                      </Button>
                    )}
                    {s.status === "SIGNED" && (
                      <Button
                        variant="ghost"
                        size="icon"
                        title="Re-armer la signature"
                        onClick={() => handleReset(s.userId)}
                        disabled={busyId === s.userId}
                        className="h-8 w-8"
                      >
                        <RefreshCw className="h-4 w-4" />
                      </Button>
                    )}
                    {s.status !== "SIGNED" && (
                      <Button
                        variant="ghost"
                        size="icon"
                        title="Retirer de la campagne"
                        onClick={() => handleRemove(s.userId)}
                        disabled={busyId === s.userId}
                        className="h-8 w-8 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                      >
                        <UserMinus className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {addOpen && (
        <AddSignersDialog
          campaignId={campaignId}
          existingUserIds={signatures.map((s) => s.userId)}
          onClose={() => setAddOpen(false)}
          onAdded={() => {
            setAddOpen(false);
            load();
            onChange();
          }}
        />
      )}

      <ConfirmDialog
        open={!!removeUserId}
        onClose={() => setRemoveUserId(null)}
        onConfirm={confirmRemove}
        title="Retirer de la campagne"
        description="Retirer cette personne de la campagne ?"
        variant="danger"
      />
    </div>
  );
}

// -----------------------------------------------------------------------------
// Dialog d'ajout de signataires
// -----------------------------------------------------------------------------

function AddSignersDialog({
  campaignId,
  existingUserIds,
  onClose,
  onAdded,
}: {
  campaignId: string;
  existingUserIds: string[];
  onClose: () => void;
  onAdded: () => void;
}) {
  const [users, setUsers] = useState<UserLite[]>([]);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const existingSet = useMemo(() => new Set(existingUserIds), [existingUserIds]);

  useEffect(() => {
    api
      .get("/users?limit=500")
      .then(({ data }) => setUsers(Array.isArray(data) ? data : data?.data || []))
      .catch(() => setUsers([]));
  }, []);

  const filtered = users.filter((u) => {
    if (existingSet.has(u.id)) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      `${u.firstName} ${u.lastName}`.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)
    );
  });

  async function handleSubmit() {
    if (selected.length === 0) return;
    setSubmitting(true);
    try {
      await api.post(`/signature-campaigns/${campaignId}/signatures`, {
        userIds: selected,
      });
      toast.success(`${selected.length} personne(s) ajoutée(s)`);
      onAdded();
    } catch (e: any) {
      toast.error(e?.response?.data?.message || "Échec de l'ajout");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title="Ajouter des signataires"
      description={`Ces personnes recevront l'obligation de signer cette campagne.`}
    >
      <div className="space-y-3">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-seal-gray-500" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher par nom ou email…"
            className="pl-9"
          />
        </div>
        <div className="max-h-72 overflow-y-auto border border-gray-200 dark:border-slate-700 rounded">
          {filtered.length === 0 ? (
            <div className="p-4 text-center text-sm text-seal-gray-500">
              Aucun utilisateur disponible
            </div>
          ) : (
            filtered.map((u) => {
              const checked = selected.includes(u.id);
              return (
                <label
                  key={u.id}
                  className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-gray-50 dark:hover:bg-slate-800 border-b border-gray-100 dark:border-slate-700 last:border-0"
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() =>
                      setSelected((prev) =>
                        checked ? prev.filter((id) => id !== u.id) : [...prev, u.id],
                      )
                    }
                  />
                  <div className="flex-1">
                    <div className="text-sm font-medium text-seal-navy dark:text-white">
                      {u.firstName} {u.lastName}
                    </div>
                    <div className="text-xs text-seal-gray-500 dark:text-slate-400">{u.email}</div>
                  </div>
                </label>
              );
            })
          )}
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Annuler
          </Button>
          <Button
            variant="primary"
            onClick={handleSubmit}
            loading={submitting}
            disabled={selected.length === 0}
          >
            Ajouter ({selected.length})
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

// -----------------------------------------------------------------------------
// Panneau exemptions d'une charte
// -----------------------------------------------------------------------------

function ChartesExemptionsPanel({ charte }: { charte: CharteListItem }) {
  const [exemptions, setExemptions] = useState<CharteExemption[]>([]);
  const [loading, setLoading] = useState(true);
  const [grantOpen, setGrantOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/chartes/${charte.id}/exemptions`);
      setExemptions(Array.isArray(data) ? data : []);
    } catch {
      setExemptions([]);
    } finally {
      setLoading(false);
    }
  }, [charte.id]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleRevoke(exemptionId: string) {
    const reason = prompt("Motif de la levée d'exemption (audit) :");
    if (!reason?.trim()) return;
    try {
      await api.delete(`/chartes/${charte.id}/exemptions/${exemptionId}`, {
        data: { reason },
      } as any);
      toast.success("Exemption levée — l'utilisateur redevient soumis à l'obligation");
      load();
    } catch (e: any) {
      toast.error(e?.response?.data?.message || "Échec de la révocation");
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold text-seal-navy dark:text-white">
              Exemptions actives — {charte.title}
            </h3>
            <p className="text-xs text-seal-gray-500 dark:text-slate-400 mt-0.5">
              Personnes nominativement dispensées de signer cette charte mandatory.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => setGrantOpen(true)}>
            <UserPlus className="h-4 w-4" />
            Exempter une personne
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-24" />
        ) : exemptions.length === 0 ? (
          <p className="text-sm text-seal-gray-500 dark:text-slate-400 py-6 text-center">
            Aucune exemption active.
          </p>
        ) : (
          <ul className="divide-y divide-gray-100 dark:divide-slate-700">
            {exemptions.map((e) => (
              <li key={e.id} className="py-2.5 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-seal-navy dark:text-white">
                    {e.user?.firstName} {e.user?.lastName}
                  </div>
                  <div className="text-xs text-seal-gray-500 dark:text-slate-400">
                    {e.user?.email}
                  </div>
                  <div className="text-xs text-seal-gray-500 dark:text-slate-400 mt-1 italic">
                    « {e.reason} »
                  </div>
                  <div className="text-[10px] text-seal-gray-500 dark:text-slate-500 mt-0.5">
                    Accordée le {formatDateTime(e.exemptedAt)} par {e.exemptedBy?.firstName}{" "}
                    {e.exemptedBy?.lastName}
                    {e.expiresAt && <> · expire le {formatDateTime(e.expiresAt)}</>}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleRevoke(e.id)}
                  className="text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                >
                  <XCircle className="h-4 w-4" />
                  Lever
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
      {grantOpen && (
        <GrantExemptionDialog
          charteId={charte.id}
          charteTitle={charte.title}
          existingUserIds={exemptions.map((e) => e.userId)}
          onClose={() => setGrantOpen(false)}
          onGranted={() => {
            setGrantOpen(false);
            load();
          }}
        />
      )}
    </Card>
  );
}

function GrantExemptionDialog({
  charteId,
  charteTitle,
  existingUserIds,
  onClose,
  onGranted,
}: {
  charteId: string;
  charteTitle: string;
  existingUserIds: string[];
  onClose: () => void;
  onGranted: () => void;
}) {
  const [users, setUsers] = useState<UserLite[]>([]);
  const [userId, setUserId] = useState<string>("");
  const [search, setSearch] = useState("");
  const [reason, setReason] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const existingSet = useMemo(() => new Set(existingUserIds), [existingUserIds]);

  useEffect(() => {
    api
      .get("/users?limit=500")
      .then(({ data }) => setUsers(Array.isArray(data) ? data : data?.data || []))
      .catch(() => setUsers([]));
  }, []);

  const filtered = users.filter((u) => {
    if (existingSet.has(u.id)) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      `${u.firstName} ${u.lastName}`.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)
    );
  });

  async function handleSubmit() {
    if (!userId || !reason.trim()) {
      toast.error("Sélectionnez une personne et précisez un motif (audit)");
      return;
    }
    setSubmitting(true);
    try {
      await api.post(`/chartes/${charteId}/exemptions`, {
        userId,
        reason: reason.trim(),
        expiresAt: expiresAt || null,
      });
      toast.success("Exemption accordée");
      onGranted();
    } catch (e: any) {
      toast.error(e?.response?.data?.message || "Échec de l'exemption");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={`Exempter de "${charteTitle}"`}
      description="L'utilisateur ne sera plus obligé de signer cette charte. Motif obligatoire (audit ISO 27001)."
    >
      <div className="space-y-3">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-seal-gray-500" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher une personne…"
            className="pl-9"
          />
        </div>
        <div className="max-h-48 overflow-y-auto border border-gray-200 dark:border-slate-700 rounded">
          {filtered.slice(0, 50).map((u) => (
            <label
              key={u.id}
              className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-gray-50 dark:hover:bg-slate-800 border-b border-gray-100 dark:border-slate-700 last:border-0"
            >
              <input
                type="radio"
                name="exempt-user"
                checked={userId === u.id}
                onChange={() => setUserId(u.id)}
              />
              <div className="flex-1">
                <div className="text-sm font-medium text-seal-navy dark:text-white">
                  {u.firstName} {u.lastName}
                </div>
                <div className="text-xs text-seal-gray-500">{u.email}</div>
              </div>
            </label>
          ))}
        </div>
        <Textarea
          label="Motif (obligatoire — sera audité)"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Ex : prestataire externe ponctuel, congé longue durée, dispense direction…"
          rows={3}
        />
        <div>
          <label className="block text-[13px] font-semibold text-seal-navy dark:text-white mb-1">
            Date d'expiration (optionnel)
          </label>
          <input
            type="date"
            value={expiresAt}
            onChange={(e) => setExpiresAt(e.target.value)}
            className="w-full rounded-btn border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-seal-navy dark:text-white"
          />
          <p className="text-[11px] text-seal-gray-500 mt-1">
            Vide = exemption permanente jusqu'à révocation manuelle.
          </p>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Annuler
          </Button>
          <Button
            variant="primary"
            onClick={handleSubmit}
            loading={submitting}
            disabled={!userId || !reason.trim()}
          >
            Exempter
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

// -----------------------------------------------------------------------------
// Page principale
// -----------------------------------------------------------------------------

export default function ManageSignaturesPage() {
  const [tab, setTab] = useState<"campaigns" | "chartes">("campaigns");
  const [campaigns, setCampaigns] = useState<CampaignListItem[]>([]);
  const [chartes, setChartes] = useState<CharteListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [c, ch] = await Promise.all([
        api.get("/signature-campaigns").catch(() => ({ data: [] })),
        api.get("/chartes").catch(() => ({ data: [] })),
      ]);
      setCampaigns(Array.isArray(c.data) ? c.data : []);
      setChartes(
        (Array.isArray(ch.data) ? ch.data : []).filter(
          (x: CharteListItem) => x.isMandatory && x.isActive,
        ),
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  return (
    <div className="space-y-6">
      <AdminGroupTabs group="identity" />
      <PageHeader
        title="Gestion fine des signatures"
        subtitle="Exempter, relancer ou re-armer des signatures sans relancer toute une campagne"
        icon={ShieldCheck}
        hub="admin"
      />

      {/* Sub-tabs */}
      <div className="flex gap-2 border-b border-gray-200 dark:border-slate-700">
        {(["campaigns", "chartes"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => {
              setTab(t);
              setSelectedCampaignId(null);
            }}
            className={`text-sm px-3 py-2 -mb-px border-b-2 transition-colors ${
              tab === t
                ? "border-primary text-primary font-medium"
                : "border-transparent text-seal-gray-500 hover:text-seal-navy dark:hover:text-white"
            }`}
          >
            {t === "campaigns"
              ? `Campagnes (${campaigns.length})`
              : `Chartes mandatory (${chartes.length})`}
          </button>
        ))}
      </div>

      {loading && <Skeleton className="h-48 rounded-card" />}

      {!loading && tab === "campaigns" && (
        <>
          {selectedCampaignId ? (
            <Card>
              <CardContent>
                <CampaignDetailView
                  campaignId={selectedCampaignId}
                  onClose={() => setSelectedCampaignId(null)}
                  onChange={reload}
                />
              </CardContent>
            </Card>
          ) : campaigns.length === 0 ? (
            <Card>
              <CardContent>
                <div className="text-center py-12 text-sm text-seal-gray-500 dark:text-slate-400">
                  <AlertTriangle className="h-10 w-10 mx-auto mb-2 opacity-50" />
                  Aucune campagne de signature pour le moment.
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {campaigns.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setSelectedCampaignId(c.id)}
                  className="text-left rounded-card border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 hover:border-primary/40 hover:shadow-card-hover transition-all"
                >
                  <div className="flex items-start justify-between mb-2">
                    <h4 className="text-sm font-semibold text-seal-navy dark:text-white line-clamp-2">
                      {c.title}
                    </h4>
                    <Badge variant="info">{c.status}</Badge>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-seal-gray-500 dark:text-slate-400">
                    <span className="flex items-center gap-1">
                      <Users className="h-3 w-3" />
                      {c._count?.signatures || 0} signataires
                    </span>
                    {c.dueAt && (
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {formatDateTime(c.dueAt)}
                      </span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {!loading && tab === "chartes" && (
        <div className="space-y-4">
          {chartes.length === 0 ? (
            <Card>
              <CardContent>
                <div className="text-center py-12 text-sm text-seal-gray-500 dark:text-slate-400">
                  Aucune charte mandatory active.
                </div>
              </CardContent>
            </Card>
          ) : (
            chartes.map((ch) => <ChartesExemptionsPanel key={ch.id} charte={ch} />)
          )}
        </div>
      )}
    </div>
  );
}
