"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { useAuthStore } from "@/stores/auth-store";
import { isRoleAtLeast, UserRole } from "@omnitech/shared";
import { formatDate, formatRelativeTime } from "@/lib/utils";
import { toast } from "sonner";
import { showToast } from "@/lib/toast-utils";
import { ExportButton } from "@/components/ui/export-button";
import { PdfExportButton } from "@/components/ui/pdf-export-button";
import { AdminGroupTabs } from "@/components/layout/admin-group-tabs";
import { PageHeader } from "@/components/layout/page-header";
import { Badge, Button, Card, CardContent, Dialog, EmptyState, Skeleton, Tabs } from "@omnitech/ui";
import {
  ShieldCheck,
  CalendarDays,
  Users,
  UserCheck,
  UserX,
  UserCog,
  Clock,
  Plus,
  Eye,
  CheckCircle2,
  AlertTriangle,
  Building2,
  FileText,
  X,
  Loader2,
  KeyRound,
  UserMinus,
  Info,
} from "lucide-react";
import { useTranslation } from "@/lib/i18n";

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

type CampaignStatus = "DRAFT" | "ACTIVE" | "COMPLETED" | "CANCELLED";
type ReviewStatus = "PENDING" | "APPROVED" | "REVOKED" | "MODIFIED" | "EXPIRED";
type ReviewDecision = "KEEP" | "REVOKE" | "CHANGE_ROLE" | "CHANGE_DEPT";
type CampaignType = "ACCESS_RIGHTS" | "PASSWORDS" | "INACTIVE_USERS";
type TabKey = "access" | "passwords" | "inactive" | "my";

interface CampaignStats {
  total: number;
  completed: number;
  progress: number;
  PENDING: number;
  APPROVED: number;
  REVOKED: number;
  MODIFIED: number;
  EXPIRED: number;
}

interface Campaign {
  id: string;
  name: string;
  description?: string | null;
  type?: CampaignType;
  startDate: string;
  dueDate: string;
  status: CampaignStatus;
  createdById: string;
  scopeDepartmentId?: string | null;
  scopeRoles: string[];
  completedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  stats?: CampaignStats;
}

interface ReviewUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  isActive: boolean;
  lastLoginAt?: string | null;
  mfaEnabled?: boolean;
  createdAt: string;
  department?: { id: string; name: string; code?: string | null } | null;
}

interface Review {
  id: string;
  campaignId: string;
  userId: string;
  reviewerId?: string | null;
  status: ReviewStatus;
  decision?: ReviewDecision | null;
  comments?: string | null;
  reviewedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  user?: ReviewUser | null;
  reviewer?: ReviewUser | null;
  campaign?: {
    id: string;
    name: string;
    dueDate: string;
    status: CampaignStatus;
    type?: CampaignType;
  };
}

interface CampaignDetail extends Campaign {
  reviews: Review[];
}

interface Department {
  id: string;
  name: string;
  code?: string | null;
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

const CAMPAIGN_STATUS_VARIANT: Record<
  CampaignStatus,
  "info" | "primary" | "success" | "warning" | "error" | "navy" | "draft"
> = {
  DRAFT: "draft",
  ACTIVE: "primary",
  COMPLETED: "success",
  CANCELLED: "error",
};

const CAMPAIGN_STATUS_LABEL: Record<CampaignStatus, string> = {
  DRAFT: "Brouillon",
  ACTIVE: "En cours",
  COMPLETED: "Clôturée",
  CANCELLED: "Annulée",
};

const REVIEW_STATUS_VARIANT: Record<
  ReviewStatus,
  "info" | "primary" | "success" | "warning" | "error" | "navy" | "archived"
> = {
  PENDING: "warning",
  APPROVED: "success",
  REVOKED: "error",
  MODIFIED: "primary",
  EXPIRED: "archived",
};

const REVIEW_STATUS_LABEL: Record<ReviewStatus, string> = {
  PENDING: "En attente",
  APPROVED: "Maintenu",
  REVOKED: "Révoqué",
  MODIFIED: "Modifié",
  EXPIRED: "Expiré",
};

const CAMPAIGN_TYPE_LABEL: Record<CampaignType, string> = {
  ACCESS_RIGHTS: "Accès",
  PASSWORDS: "Mots de passe",
  INACTIVE_USERS: "Comptes inactifs",
};

function fullName(user?: ReviewUser | null): string {
  if (!user) return "Utilisateur inconnu";
  return `${user.firstName} ${user.lastName}`;
}

function getCampaignType(c: Campaign | CampaignDetail | null | undefined): CampaignType {
  return (c?.type as CampaignType) || "ACCESS_RIGHTS";
}

// -----------------------------------------------------------------------------
// Page
// -----------------------------------------------------------------------------

export default function AccessReviewsPage() {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const [tab, setTab] = useState<TabKey>("access");
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [myReviews, setMyReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState<{
    open: boolean;
    type: CampaignType;
  }>({
    open: false,
    type: "ACCESS_RIGHTS",
  });
  const [openCampaign, setOpenCampaign] = useState<CampaignDetail | null>(null);
  const [openCampaignLoading, setOpenCampaignLoading] = useState(false);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [confirmCloseId, setConfirmCloseId] = useState<string | null>(null);

  const isAdmin = !!user && isRoleAtLeast(user.role, UserRole.ADMIN);

  const loadCampaigns = useCallback(async () => {
    try {
      const { data } = await api.get("/access-reviews/campaigns");
      setCampaigns(data || []);
    } catch {
      toast.error("Impossible de charger les campagnes");
    }
  }, []);

  const loadMyReviews = useCallback(async () => {
    try {
      const { data } = await api.get("/access-reviews/my");
      setMyReviews(data || []);
    } catch {
      toast.error("Impossible de charger vos revues");
    }
  }, []);

  const loadDepartments = useCallback(async () => {
    try {
      const { data } = await api.get("/departments");
      setDepartments(Array.isArray(data) ? data : data?.data || []);
    } catch {
      /* optional */
    }
  }, []);

  const refreshAll = useCallback(async () => {
    setLoading(true);
    await Promise.all([loadCampaigns(), loadMyReviews()]);
    setLoading(false);
  }, [loadCampaigns, loadMyReviews]);

  useEffect(() => {
    refreshAll();
    loadDepartments();
  }, [refreshAll, loadDepartments]);

  const handleViewCampaign = useCallback(async (id: string) => {
    setOpenCampaignLoading(true);
    try {
      const { data } = await api.get(`/access-reviews/campaigns/${id}`);
      setOpenCampaign(data);
    } catch {
      toast.error("Impossible de charger la campagne");
    } finally {
      setOpenCampaignLoading(false);
    }
  }, []);

  const requestCloseCampaign = useCallback((id: string) => {
    setConfirmCloseId(id);
  }, []);

  const performCloseCampaign = useCallback(
    async (id: string) => {
      try {
        await api.post(`/access-reviews/campaigns/${id}/close`);
        toast.success("Campagne clôturée");
        setConfirmCloseId(null);
        await loadCampaigns();
        if (openCampaign?.id === id) {
          await handleViewCampaign(id);
        }
      } catch {
        toast.error("Erreur lors de la clôture");
      }
    },
    [loadCampaigns, openCampaign?.id, handleViewCampaign],
  );

  const handleSubmitDecision = useCallback(
    async (reviewId: string, decision: ReviewDecision, comments?: string) => {
      try {
        await api.post(`/access-reviews/${reviewId}/decision`, {
          decision,
          comments,
        });
        toast.success("Décision enregistrée");
        await Promise.all([loadMyReviews(), loadCampaigns()]);
        if (openCampaign) {
          await handleViewCampaign(openCampaign.id);
        }
      } catch (err) {
        const e = err as { response?: { data?: { message?: string } } };
        toast.error(e.response?.data?.message || "Erreur lors de la soumission");
      }
    },
    [loadMyReviews, loadCampaigns, openCampaign, handleViewCampaign],
  );

  // Campagnes filtrées par type pour chaque onglet
  const campaignsByType = useMemo(() => {
    const groups: Record<CampaignType, Campaign[]> = {
      ACCESS_RIGHTS: [],
      PASSWORDS: [],
      INACTIVE_USERS: [],
    };
    for (const c of campaigns) {
      groups[getCampaignType(c)].push(c);
    }
    return groups;
  }, [campaigns]);

  const pendingCount = useMemo(
    () => myReviews.filter((r) => r.status === "PENDING").length,
    [myReviews],
  );
  const activeCount = useMemo(
    () => campaigns.filter((c) => c.status === "ACTIVE").length,
    [campaigns],
  );

  const openCreate = (type: CampaignType) => setShowCreate({ open: true, type });

  return (
    <div className="space-y-6 animate-fade-in-up">
      <AdminGroupTabs group="identity" />
      <PageHeader
        title="Revues d'accès"
        subtitle="Accès, mots de passe et comptes inactifs (ISO 27001 A.5.18)"
        icon={ShieldCheck}
        hub="admin"
        actions={
          <>
            <ExportButton
              filename="revues-acces"
              rows={(campaigns || []) as unknown as Array<Record<string, unknown>>}
              columns={[
                { header: "ID", accessor: "id" },
                { header: "Nom", accessor: "name" },
                {
                  header: "Type",
                  accessor: (r: any) => CAMPAIGN_TYPE_LABEL[getCampaignType(r)],
                },
                { header: "Statut", accessor: "status" },
                { header: "Début", accessor: (r: any) => r?.startDate || "" },
                { header: "Échéance", accessor: (r: any) => r?.dueDate || "" },
              ]}
            />
            <PdfExportButton
              payload={() => ({
                title: "Revue périodique des accès",
                subtitle: "ISO 27001 A.5.18 — Accès, mots de passe, comptes inactifs",
                reference: `REVIEW-${new Date().toISOString().slice(0, 10)}`,
                context: "Extrait du portail OMNITECH Intranet",
                sections: [
                  {
                    heading: "Campagnes",
                    paragraphs:
                      (campaigns || []).length === 0
                        ? ["Aucune campagne enregistrée."]
                        : (campaigns || []).map(
                            (c: any) =>
                              `${c.name || c.id} — type: ${CAMPAIGN_TYPE_LABEL[getCampaignType(c)]} — statut: ${c.status || "n/a"} — échéance: ${c.dueDate?.slice(0, 10) || "?"}`,
                          ),
                  },
                  {
                    heading: "Synthèse",
                    paragraphs: [
                      `Nombre de campagnes: ${(campaigns || []).length}`,
                      `Campagnes actives: ${activeCount}`,
                      `Campagnes d'accès: ${campaignsByType.ACCESS_RIGHTS.length}`,
                      `Campagnes mots de passe: ${campaignsByType.PASSWORDS.length}`,
                      `Campagnes comptes inactifs: ${campaignsByType.INACTIVE_USERS.length}`,
                      "Ce document a été généré automatiquement. Le hash SHA-256 en pied de page garantit son intégrité.",
                    ],
                  },
                ],
              })}
            />
            {isAdmin && (
              <Button onClick={() => openCreate(getCampaignTypeFromTab(tab))}>
                <Plus className="h-4 w-4" />
                Nouvelle campagne
              </Button>
            )}
          </>
        }
      />

      {/* Bloc introductif ISO 27001 A.5.18 */}
      <Card className="border-l-4 border-l-primary bg-primary/5 dark:bg-primary/10">
        <CardContent className="py-3 px-4 flex items-start gap-3">
          <Info className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
          <div className="text-sm text-seal-navy dark:text-slate-200">
            <p className="font-medium">
              Cette section permet de réviser périodiquement les accès, mots de passe et comptes
              inactifs conformément à ISO 27001 A.5.18.
            </p>
            <p className="text-xs text-seal-gray-500 dark:text-slate-400 mt-1">
              Chaque campagne génère automatiquement une revue par utilisateur concerné, que les
              managers et le RSSI instruisent (maintien, révocation, modification de rôle /
              service). Les décisions sont tracées dans l&apos;AuditLog à fin d&apos;audit.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Summary bar */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <Card className="border-l-4 border-l-primary">
          <CardContent className="py-3 px-4 flex items-center gap-3">
            <CalendarDays className="h-5 w-5 text-primary" />
            <div>
              <p className="text-xs text-seal-gray-500 dark:text-slate-400">Campagnes actives</p>
              <p className="text-xl text-seal-navy dark:text-white">{activeCount}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-amber-400">
          <CardContent className="py-3 px-4 flex items-center gap-3">
            <Clock className="h-5 w-5 text-amber-500" />
            <div>
              <p className="text-xs text-seal-gray-500 dark:text-slate-400">Revues à traiter</p>
              <p className="text-xl text-seal-navy dark:text-white">{pendingCount}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-indigo-400">
          <CardContent className="py-3 px-4 flex items-center gap-3">
            <KeyRound className="h-5 w-5 text-indigo-500" />
            <div>
              <p className="text-xs text-seal-gray-500 dark:text-slate-400">Revues MDP</p>
              <p className="text-xl text-seal-navy dark:text-white">
                {campaignsByType.PASSWORDS.length}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-rose-400">
          <CardContent className="py-3 px-4 flex items-center gap-3">
            <UserMinus className="h-5 w-5 text-rose-500" />
            <div>
              <p className="text-xs text-seal-gray-500 dark:text-slate-400">Revues inactifs</p>
              <p className="text-xl text-seal-navy dark:text-white">
                {campaignsByType.INACTIVE_USERS.length}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs
        tabs={[
          {
            id: "access",
            label: "Accès",
            count: campaignsByType.ACCESS_RIGHTS.length,
          },
          {
            id: "passwords",
            label: "Mots de passe",
            count: campaignsByType.PASSWORDS.length,
          },
          {
            id: "inactive",
            label: "Utilisateurs inactifs",
            count: campaignsByType.INACTIVE_USERS.length,
          },
          { id: "my", label: "Mes revues", count: pendingCount },
        ]}
        activeTab={tab}
        onChange={(id) => setTab(id as TabKey)}
      />

      {/* Tooltip d'aide sous l'onglet actif (équivalent tooltip ISO A.5.18) */}
      <div className="text-xs text-seal-gray-500 dark:text-slate-400 -mt-2 px-1 flex items-start gap-2">
        <Info className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
        <span>{getTabHelpText(tab)}</span>
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      ) : tab === "my" ? (
        <MyReviewsList reviews={myReviews} onDecision={handleSubmitDecision} />
      ) : (
        <CampaignsList
          campaigns={
            tab === "access"
              ? campaignsByType.ACCESS_RIGHTS
              : tab === "passwords"
                ? campaignsByType.PASSWORDS
                : campaignsByType.INACTIVE_USERS
          }
          campaignType={getCampaignTypeFromTab(tab)}
          isAdmin={isAdmin}
          onView={handleViewCampaign}
          onClose={requestCloseCampaign}
          onCreate={() => openCreate(getCampaignTypeFromTab(tab))}
        />
      )}

      {/* Create campaign modal */}
      {showCreate.open && (
        <CreateCampaignDialog
          open={showCreate.open}
          type={showCreate.type}
          onClose={() => setShowCreate({ open: false, type: showCreate.type })}
          departments={departments}
          onCreated={() => {
            setShowCreate({ open: false, type: showCreate.type });
            refreshAll();
          }}
        />
      )}

      {/* Campaign detail drawer */}
      {(openCampaign || openCampaignLoading) && (
        <CampaignDetailDrawer
          campaign={openCampaign}
          loading={openCampaignLoading}
          isAdmin={isAdmin}
          onClose={() => setOpenCampaign(null)}
          onDecision={handleSubmitDecision}
          onCloseCampaign={requestCloseCampaign}
        />
      )}

      {/* Confirm close campaign */}
      {confirmCloseId && (
        <Dialog
          open={!!confirmCloseId}
          onClose={() => setConfirmCloseId(null)}
          title="Clôturer la campagne ?"
          description="Les revues en attente seront marquées comme expirées. Cette action est définitive et tracée à l'audit."
        >
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setConfirmCloseId(null)}>
              Annuler
            </Button>
            <Button variant="danger" onClick={() => void performCloseCampaign(confirmCloseId)}>
              <X className="h-3.5 w-3.5" />
              Clôturer définitivement
            </Button>
          </div>
        </Dialog>
      )}
    </div>
  );
}

function getCampaignTypeFromTab(tab: TabKey): CampaignType {
  if (tab === "passwords") return "PASSWORDS";
  if (tab === "inactive") return "INACTIVE_USERS";
  return "ACCESS_RIGHTS";
}

function getTabHelpText(tab: TabKey): string {
  switch (tab) {
    case "access":
      return "Revue classique ISO 27001 A.5.18 : vérifier que chaque utilisateur a le bon rôle et service.";
    case "passwords":
      return "Cible les comptes créés il y a plus de 6 mois (fallback en l'absence de passwordChangedAt) ou sans MFA activée.";
    case "inactive":
      return "Cible les comptes actifs dont la dernière connexion remonte à plus de 90 jours — proposer la désactivation.";
    case "my":
      return "Liste des revues qui vous sont assignées en tant que relecteur.";
  }
}

// -----------------------------------------------------------------------------
// Campaigns list
// -----------------------------------------------------------------------------

function CampaignsList({
  campaigns,
  campaignType,
  isAdmin,
  onView,
  onClose,
  onCreate,
}: {
  campaigns: Campaign[];
  campaignType: CampaignType;
  isAdmin: boolean;
  onView: (id: string) => void;
  onClose: (id: string) => void;
  onCreate: () => void;
}) {
  if (campaigns.length === 0) {
    return (
      <EmptyState
        type="general"
        title={
          campaignType === "PASSWORDS"
            ? "Aucune revue mot de passe"
            : campaignType === "INACTIVE_USERS"
              ? "Aucune revue de comptes inactifs"
              : "Aucune campagne"
        }
        description={
          campaignType === "PASSWORDS"
            ? "Lancez une revue pour identifier les mots de passe non renouvelés et les comptes sans MFA."
            : campaignType === "INACTIVE_USERS"
              ? "Lancez une revue des comptes sans connexion depuis 90 jours — une campagne mensuelle automatique est prévue par cron."
              : "Créez une campagne pour lancer une revue périodique des accès."
        }
        action={
          isAdmin ? (
            <Button onClick={onCreate}>
              <Plus className="h-4 w-4" />
              Nouvelle campagne
            </Button>
          ) : undefined
        }
      />
    );
  }
  return (
    <div className="space-y-3">
      {campaigns.map((c, idx) => {
        const stats = c.stats || {
          total: 0,
          completed: 0,
          progress: 0,
          PENDING: 0,
          APPROVED: 0,
          REVOKED: 0,
          MODIFIED: 0,
          EXPIRED: 0,
        };
        const overdue = c.status === "ACTIVE" && new Date(c.dueDate).getTime() < Date.now();
        const statusBadgeClass: Record<CampaignStatus, string> = {
          ACTIVE: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
          COMPLETED: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
          DRAFT: "bg-gray-100 text-gray-600 dark:bg-slate-700 dark:text-slate-300",
          CANCELLED: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
        };
        const overdueClass = overdue
          ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
          : "";
        const effectiveStatusClass = overdue ? overdueClass : statusBadgeClass[c.status];
        const type = getCampaignType(c);
        const TypeIcon =
          type === "PASSWORDS" ? KeyRound : type === "INACTIVE_USERS" ? UserMinus : ShieldCheck;
        return (
          <Card
            key={c.id}
            className={`stagger-item ${overdue ? "border-l-4 border-l-red-500" : c.status === "ACTIVE" ? "border-l-4 border-l-primary" : ""}`}
            style={{ animationDelay: `${idx * 40}ms` }}
          >
            <CardContent className="py-4">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <TypeIcon className="h-4 w-4 text-seal-gray-500 dark:text-slate-400" />
                    <h3 className="text-seal-navy dark:text-white">{c.name}</h3>
                    <Badge variant="info">{CAMPAIGN_TYPE_LABEL[type]}</Badge>
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${effectiveStatusClass}`}
                    >
                      {overdue ? "En retard" : CAMPAIGN_STATUS_LABEL[c.status]}
                    </span>
                    {overdue && (
                      <Badge variant="error">
                        <AlertTriangle className="h-3 w-3" /> Échéance dépassée
                      </Badge>
                    )}
                  </div>
                  {c.description && (
                    <p className="text-sm text-seal-gray-500 dark:text-slate-400 mt-1 line-clamp-2">
                      {c.description}
                    </p>
                  )}
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-xs text-seal-gray-500 dark:text-slate-400">
                    <span className="flex items-center gap-1">
                      <CalendarDays className="h-3 w-3" />
                      Échéance : {formatDate(c.dueDate)}
                    </span>
                    <span className="flex items-center gap-1">
                      <Users className="h-3 w-3" />
                      {stats.total} utilisateurs
                    </span>
                    {c.completedAt && (
                      <span className="flex items-center gap-1">
                        <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                        Clôturée {formatRelativeTime(c.completedAt)}
                      </span>
                    )}
                  </div>
                  {/* Progress bar */}
                  <div className="mt-3">
                    <div className="flex items-center justify-between text-[10px] text-seal-gray-500 dark:text-slate-500 mb-1">
                      <span>
                        Avancement : {stats.completed} / {stats.total}
                      </span>
                      <span>{stats.progress}%</span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-gray-100 dark:bg-slate-800 overflow-hidden">
                      <div
                        className="h-full bg-primary transition-all duration-500"
                        style={{ width: `${stats.progress}%` }}
                      />
                    </div>
                    <div className="flex flex-wrap gap-2 mt-2">
                      {stats.APPROVED > 0 && (
                        <span className="text-[10px] text-emerald-600 dark:text-emerald-400">
                          {stats.APPROVED} maintenus
                        </span>
                      )}
                      {stats.REVOKED > 0 && (
                        <span className="text-[10px] text-red-600 dark:text-red-400">
                          {stats.REVOKED} révoqués
                        </span>
                      )}
                      {stats.MODIFIED > 0 && (
                        <span className="text-[10px] text-primary">{stats.MODIFIED} modifiés</span>
                      )}
                      {stats.EXPIRED > 0 && (
                        <span className="text-[10px] text-seal-gray-500">
                          {stats.EXPIRED} expirés
                        </span>
                      )}
                      {stats.PENDING > 0 && (
                        <span className="text-[10px] text-amber-600 dark:text-amber-400">
                          {stats.PENDING} en attente
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex flex-col gap-2">
                  <Button size="sm" variant="outline" onClick={() => onView(c.id)}>
                    <Eye className="h-3 w-3" />
                    Voir
                  </Button>
                  {isAdmin && c.status === "ACTIVE" && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-red-500 hover:text-red-600"
                      onClick={() => onClose(c.id)}
                    >
                      <X className="h-3 w-3" />
                      Clôturer
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

// -----------------------------------------------------------------------------
// My reviews list
// -----------------------------------------------------------------------------

function MyReviewsList({
  reviews,
  onDecision,
}: {
  reviews: Review[];
  onDecision: (id: string, decision: ReviewDecision, comments?: string) => Promise<void>;
}) {
  if (reviews.length === 0) {
    return (
      <EmptyState
        type="general"
        title="Aucune revue en attente"
        description="Vous n'avez pas de revue d'accès à traiter pour le moment."
      />
    );
  }
  return (
    <div className="space-y-3">
      {reviews.map((r, idx) => (
        <div key={r.id} className="stagger-item" style={{ animationDelay: `${idx * 40}ms` }}>
          <ReviewCard review={r} onDecision={onDecision} />
        </div>
      ))}
    </div>
  );
}

function ReviewCard({
  review,
  onDecision,
}: {
  review: Review;
  onDecision: (id: string, decision: ReviewDecision, comments?: string) => Promise<void>;
}) {
  const [comments, setComments] = useState("");
  const [submitting, setSubmitting] = useState<ReviewDecision | null>(null);

  const submit = async (decision: ReviewDecision) => {
    setSubmitting(decision);
    try {
      await onDecision(review.id, decision, comments.trim() || undefined);
      setComments("");
    } finally {
      setSubmitting(null);
    }
  };

  const u = review.user;
  const campaignType = (review.campaign?.type as CampaignType) || "ACCESS_RIGHTS";
  return (
    <Card>
      <CardContent className="py-4">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-seal-navy dark:text-white">{fullName(u)}</span>
              {u && <Badge variant="navy">{u.role}</Badge>}
              {u?.department && (
                <Badge variant="info">
                  <Building2 className="h-3 w-3" />
                  {u.department.name}
                </Badge>
              )}
              {review.campaign && (
                <Badge variant="primary">
                  <FileText className="h-3 w-3" />
                  {review.campaign.name}
                </Badge>
              )}
              <Badge variant="info">{CAMPAIGN_TYPE_LABEL[campaignType]}</Badge>
              <Badge variant={REVIEW_STATUS_VARIANT[review.status]}>
                {REVIEW_STATUS_LABEL[review.status]}
              </Badge>
              {campaignType === "PASSWORDS" && u && u.mfaEnabled === false && (
                <Badge variant="warning">MFA désactivée</Badge>
              )}
            </div>
            {u && (
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-xs text-seal-gray-500 dark:text-slate-400">
                <span>{u.email}</span>
                <span>Embauché {formatDate(u.createdAt)}</span>
                <span>
                  Dernière connexion :{" "}
                  {u.lastLoginAt ? formatRelativeTime(u.lastLoginAt) : "Jamais"}
                </span>
                {review.campaign && (
                  <span className="flex items-center gap-1">
                    <CalendarDays className="h-3 w-3" />
                    Échéance {formatDate(review.campaign.dueDate)}
                  </span>
                )}
              </div>
            )}
            {review.comments && (
              <p className="mt-2 text-xs italic text-seal-gray-500 dark:text-slate-400">
                &ldquo;{review.comments}&rdquo;
              </p>
            )}
          </div>
        </div>

        {/* Comment + decision buttons */}
        <div className="mt-3 flex flex-col gap-2">
          <textarea
            value={comments}
            onChange={(e) => setComments(e.target.value)}
            placeholder="Commentaire (optionnel)"
            rows={2}
            className="w-full rounded-md border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-seal-navy dark:text-white placeholder:text-seal-gray-500 focus:border-primary focus:outline-none"
          />
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="primary"
              loading={submitting === "KEEP"}
              disabled={!!submitting}
              onClick={() => submit("KEEP")}
            >
              <UserCheck className="h-3 w-3" />
              Maintenir
            </Button>
            <Button
              size="sm"
              variant="danger"
              loading={submitting === "REVOKE"}
              disabled={!!submitting}
              onClick={() => submit("REVOKE")}
            >
              <UserX className="h-3 w-3" />
              {campaignType === "INACTIVE_USERS" ? "Désactiver" : "Révoquer"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              loading={submitting === "CHANGE_ROLE"}
              disabled={!!submitting}
              onClick={() => submit("CHANGE_ROLE")}
            >
              <UserCog className="h-3 w-3" />
              Changer de rôle
            </Button>
            <Button
              size="sm"
              variant="outline"
              loading={submitting === "CHANGE_DEPT"}
              disabled={!!submitting}
              onClick={() => submit("CHANGE_DEPT")}
            >
              <Building2 className="h-3 w-3" />
              Changer de service
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// -----------------------------------------------------------------------------
// Create campaign dialog
// -----------------------------------------------------------------------------

function CreateCampaignDialog({
  open,
  type,
  onClose,
  onCreated,
  departments,
}: {
  open: boolean;
  type: CampaignType;
  onClose: () => void;
  onCreated: () => void;
  departments: Department[];
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [scopeDepartmentId, setScopeDepartmentId] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const title =
    type === "PASSWORDS"
      ? "Nouvelle revue des mots de passe"
      : type === "INACTIVE_USERS"
        ? "Nouvelle revue des comptes inactifs"
        : "Nouvelle campagne de revue";

  const helpText =
    type === "PASSWORDS"
      ? "Cette revue cible les utilisateurs créés depuis plus de 6 mois (fallback en l'absence de passwordChangedAt) ou sans MFA activée."
      : type === "INACTIVE_USERS"
        ? "Cette revue cible les comptes actifs dont la dernière connexion remonte à plus de 90 jours (ou qui ne se sont jamais connectés)."
        : "Une revue sera automatiquement générée pour chaque utilisateur actif dans le périmètre choisi.";

  const submit = async () => {
    if (!name.trim() || !dueDate) {
      toast.error("Nom et date d'échéance requis");
      return;
    }
    // Prevent creating a campaign whose due date is already in the past
    const due = new Date(dueDate);
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    if (due.getTime() < now.getTime()) {
      toast.error("La date d'échéance doit être dans le futur");
      return;
    }
    setSubmitting(true);
    try {
      const payload: Record<string, unknown> = {
        name: name.trim(),
        type,
        dueDate: new Date(dueDate).toISOString(),
      };
      if (description.trim()) payload.description = description.trim();
      if (scopeDepartmentId) payload.scopeDepartmentId = scopeDepartmentId;

      // Endpoint dédié pour les types spéciaux — conserve l'endpoint générique sinon
      const endpoint =
        type === "PASSWORDS"
          ? "/access-reviews/campaigns/password-review"
          : type === "INACTIVE_USERS"
            ? "/access-reviews/campaigns/inactive-review"
            : "/access-reviews/campaigns";

      await api.post(endpoint, payload);
      toast.success("Campagne créée");
      onCreated();
    } catch (err) {
      const e = err as { response?: { data?: { message?: string } } };
      showToast("error", null, e.response?.data?.message || "Erreur lors de la création");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} title={title} description={helpText}>
      <div className="space-y-3">
        <div>
          <label className="text-xs text-seal-gray-500 dark:text-slate-400">
            Nom de la campagne
          </label>
          <input
            className="w-full mt-1 rounded-md border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-seal-navy dark:text-white focus:border-primary focus:outline-none"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={
              type === "PASSWORDS"
                ? "Revue MDP Q2 2026"
                : type === "INACTIVE_USERS"
                  ? "Revue comptes inactifs Q2 2026"
                  : "Revue Q2 2026"
            }
            maxLength={200}
          />
        </div>
        <div>
          <label className="text-xs text-seal-gray-500 dark:text-slate-400">
            Description (optionnel)
          </label>
          <textarea
            className="w-full mt-1 rounded-md border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-seal-navy dark:text-white focus:border-primary focus:outline-none"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            maxLength={2000}
          />
        </div>
        <div>
          <label className="text-xs text-seal-gray-500 dark:text-slate-400">
            Date d&apos;échéance
          </label>
          <input
            type="date"
            className="w-full mt-1 rounded-md border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-seal-navy dark:text-white focus:border-primary focus:outline-none"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
          />
        </div>
        <div>
          <label className="text-xs text-seal-gray-500 dark:text-slate-400">
            Périmètre — Département (optionnel)
          </label>
          <select
            className="w-full mt-1 rounded-md border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-seal-navy dark:text-white focus:border-primary focus:outline-none"
            value={scopeDepartmentId}
            onChange={(e) => setScopeDepartmentId(e.target.value)}
          >
            <option value="">Tous les départements</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            Annuler
          </Button>
          <Button onClick={submit} loading={submitting}>
            Créer la campagne
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

// -----------------------------------------------------------------------------
// Campaign detail drawer
// -----------------------------------------------------------------------------

function CampaignDetailDrawer({
  campaign,
  loading,
  isAdmin,
  onClose,
  onDecision,
  onCloseCampaign,
}: {
  campaign: CampaignDetail | null;
  loading: boolean;
  isAdmin: boolean;
  onClose: () => void;
  onDecision: (id: string, decision: ReviewDecision, comments?: string) => Promise<void>;
  onCloseCampaign: (id: string) => void;
}) {
  const campaignType = getCampaignType(campaign);
  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative ml-auto h-full w-full max-w-3xl bg-white dark:bg-slate-900 shadow-2xl overflow-y-auto">
        <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-slate-700 bg-white dark:bg-slate-900">
          <div>
            <h2 className="text-seal-navy dark:text-white">{campaign?.name || "Campagne"}</h2>
            {campaign && (
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <Badge variant={CAMPAIGN_STATUS_VARIANT[campaign.status]}>
                  {CAMPAIGN_STATUS_LABEL[campaign.status]}
                </Badge>
                <Badge variant="info">{CAMPAIGN_TYPE_LABEL[campaignType]}</Badge>
                <span className="text-xs text-seal-gray-500 dark:text-slate-400">
                  Échéance : {formatDate(campaign.dueDate)}
                </span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            {isAdmin && campaign?.status === "ACTIVE" && (
              <Button
                size="sm"
                variant="ghost"
                className="text-red-500 hover:text-red-600"
                onClick={() => onCloseCampaign(campaign.id)}
              >
                <X className="h-3 w-3" />
                Clôturer
              </Button>
            )}
            <button
              onClick={onClose}
              className="rounded-full p-1 hover:bg-gray-100 dark:hover:bg-slate-700"
              aria-label="Fermer"
            >
              <X className="h-5 w-5 text-seal-gray-500 dark:text-slate-400" />
            </button>
          </div>
        </div>

        <div className="p-6">
          {loading || !campaign ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 text-primary animate-spin" />
            </div>
          ) : campaign.reviews.length === 0 ? (
            <EmptyState
              type="general"
              title="Aucune revue"
              description="Cette campagne ne contient pas encore de revue."
            />
          ) : (
            <div className="space-y-4">
              {campaign.description && (
                <p className="text-sm text-seal-gray-500 dark:text-slate-400">
                  {campaign.description}
                </p>
              )}
              <ReviewsTable
                reviews={campaign.reviews}
                canDecide={campaign.status === "ACTIVE"}
                campaignType={campaignType}
                onDecision={onDecision}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ReviewsTable({
  reviews,
  canDecide,
  campaignType,
  onDecision,
}: {
  reviews: Review[];
  canDecide: boolean;
  campaignType: CampaignType;
  onDecision: (id: string, decision: ReviewDecision, comments?: string) => Promise<void>;
}) {
  return (
    <div className="space-y-2">
      {reviews.map((r) => (
        <InlineReviewRow
          key={r.id}
          review={r}
          canDecide={canDecide && r.status === "PENDING"}
          campaignType={campaignType}
          onDecision={onDecision}
        />
      ))}
    </div>
  );
}

function InlineReviewRow({
  review,
  canDecide,
  campaignType,
  onDecision,
}: {
  review: Review;
  canDecide: boolean;
  campaignType: CampaignType;
  onDecision: (id: string, decision: ReviewDecision, comments?: string) => Promise<void>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [comments, setComments] = useState("");
  const [submitting, setSubmitting] = useState<ReviewDecision | null>(null);

  const submit = async (decision: ReviewDecision) => {
    setSubmitting(decision);
    try {
      await onDecision(review.id, decision, comments.trim() || undefined);
      setExpanded(false);
      setComments("");
    } finally {
      setSubmitting(null);
    }
  };

  const u = review.user;
  const decisionBorder: Record<ReviewStatus, string> = {
    PENDING: "border-l-4 border-l-amber-400",
    APPROVED: "border-l-4 border-l-emerald-500",
    REVOKED: "border-l-4 border-l-red-500",
    MODIFIED: "border-l-4 border-l-primary",
    EXPIRED: "border-l-4 border-l-gray-400",
  };

  // Info utilisateur spécifique au type
  const contextInfo = () => {
    if (!u) return null;
    if (campaignType === "PASSWORDS") {
      return (
        <>
          <span>Créé le {formatDate(u.createdAt)}</span>
          <span>
            MFA :{" "}
            {u.mfaEnabled ? (
              <span className="text-emerald-600 dark:text-emerald-400">activée</span>
            ) : (
              <span className="text-amber-600 dark:text-amber-400">désactivée</span>
            )}
          </span>
        </>
      );
    }
    if (campaignType === "INACTIVE_USERS") {
      return (
        <>
          <span>Embauché {formatDate(u.createdAt)}</span>
          <span>
            Dernière connexion :{" "}
            <span className="text-rose-600 dark:text-rose-400">
              {u.lastLoginAt ? formatRelativeTime(u.lastLoginAt) : "Jamais"}
            </span>
          </span>
        </>
      );
    }
    return (
      <>
        <span>Embauché {formatDate(u.createdAt)}</span>
        <span>
          Dernière connexion : {u.lastLoginAt ? formatRelativeTime(u.lastLoginAt) : "Jamais"}
        </span>
      </>
    );
  };

  return (
    <div
      className={`rounded-md border border-gray-100 dark:border-slate-800 bg-white dark:bg-slate-900 ${decisionBorder[review.status]}`}
    >
      <div
        className="flex items-center justify-between gap-3 px-3 py-2 cursor-pointer hover:bg-gray-50 dark:hover:bg-slate-800/50"
        onClick={() => canDecide && setExpanded((v) => !v)}
        role={canDecide ? "button" : undefined}
        tabIndex={canDecide ? 0 : undefined}
        aria-expanded={canDecide ? expanded : undefined}
        onKeyDown={
          canDecide
            ? (e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setExpanded((v) => !v);
                }
              }
            : undefined
        }
      >
        <div className="flex items-center gap-2 flex-1 min-w-0 flex-wrap">
          <span className="text-sm text-seal-navy dark:text-white truncate">{fullName(u)}</span>
          {u && (
            <span className="text-xs text-seal-gray-500 dark:text-slate-400 truncate">
              {u.email}
            </span>
          )}
          {u?.department && <Badge variant="info">{u.department.name}</Badge>}
          {u && <Badge variant="navy">{u.role}</Badge>}
          {campaignType === "PASSWORDS" && u && u.mfaEnabled === false && (
            <Badge variant="warning">sans MFA</Badge>
          )}
          {campaignType === "INACTIVE_USERS" && u && !u.lastLoginAt && (
            <Badge variant="warning">jamais connecté</Badge>
          )}
        </div>
        <Badge variant={REVIEW_STATUS_VARIANT[review.status]}>
          {REVIEW_STATUS_LABEL[review.status]}
        </Badge>
      </div>
      {review.comments && !expanded && (
        <div className="px-3 pb-2 text-xs text-seal-gray-500 dark:text-slate-400 italic">
          &ldquo;{review.comments}&rdquo;
        </div>
      )}
      {expanded && canDecide && (
        <div className="px-3 py-3 border-t border-gray-100 dark:border-slate-800 space-y-2">
          {u && (
            <div className="text-xs text-seal-gray-500 dark:text-slate-400 flex flex-wrap gap-x-3 gap-y-1">
              {contextInfo()}
            </div>
          )}
          <textarea
            value={comments}
            onChange={(e) => setComments(e.target.value)}
            placeholder="Commentaire (optionnel)"
            rows={2}
            className="w-full rounded-md border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-seal-navy dark:text-white placeholder:text-seal-gray-500 focus:border-primary focus:outline-none"
          />
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="primary"
              loading={submitting === "KEEP"}
              disabled={!!submitting}
              onClick={() => submit("KEEP")}
            >
              <UserCheck className="h-3 w-3" />
              Maintenir
            </Button>
            <Button
              size="sm"
              variant="danger"
              loading={submitting === "REVOKE"}
              disabled={!!submitting}
              onClick={() => submit("REVOKE")}
            >
              <UserX className="h-3 w-3" />
              {campaignType === "INACTIVE_USERS" ? "Désactiver" : "Révoquer"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              loading={submitting === "CHANGE_ROLE"}
              disabled={!!submitting}
              onClick={() => submit("CHANGE_ROLE")}
            >
              <UserCog className="h-3 w-3" />
              Modifier rôle
            </Button>
            <Button
              size="sm"
              variant="outline"
              loading={submitting === "CHANGE_DEPT"}
              disabled={!!submitting}
              onClick={() => submit("CHANGE_DEPT")}
            >
              <Building2 className="h-3 w-3" />
              Modifier service
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
