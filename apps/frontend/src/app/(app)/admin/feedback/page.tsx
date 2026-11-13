"use client";

import React, { useCallback, useEffect, useState, Suspense } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { Card, CardContent, Button, Badge, EmptyState, Textarea, Skeleton } from "@omnitech/ui";
import {
  MessageCircle,
  Star,
  Check,
  X,
  Clock,
  Trash2,
  User as UserIcon,
  BarChart3,
  Plus,
  ArrowRight,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { api } from "@/lib/api";
import { formatRelativeTime, formatDate } from "@/lib/utils";

type Tab = "testimonials" | "surveys";

// ------ Testimonials ------
interface Testimonial {
  id: string;
  quote: string;
  department: string | null;
  role: string | null;
  isApproved: boolean;
  submittedAt: string;
  approvedAt: string | null;
  rejectedAt: string | null;
  rejectionReason: string | null;
  submittedBy: { id: string; firstName: string; lastName: string; email: string } | null;
  approvedBy: { id: string; firstName: string; lastName: string } | null;
}
type TestimonialFilter = "pending" | "approved" | "rejected" | "all";

// ------ Surveys ------
interface Survey {
  id: string;
  title: string;
  description: string | null;
  isAnonymous: boolean;
  isActive: boolean;
  expiresAt: string | null;
  createdAt: string;
  _count?: { responses: number; questions: number };
}

interface SurveyStats {
  totalSurveys: number;
  totalResponses: number;
  averageRating: number | null;
  responseRate: number | null;
}

const TESTIMONIAL_TAB_IDS: TestimonialFilter[] = ["pending", "approved", "rejected", "all"];

function FeedbackPageInner() {
  const t = useTranslations("admin.feedbackPage");
  const searchParams = useSearchParams();
  const router = useRouter();
  const initialTab = (searchParams?.get("tab") as Tab) || "testimonials";
  const [tab, setTab] = useState<Tab>(initialTab);

  // Sync URL query when tab changes
  const changeTab = useCallback(
    (newTab: Tab) => {
      setTab(newTab);
      const params = new URLSearchParams(searchParams?.toString() ?? "");
      params.set("tab", newTab);
      router.replace(`/admin/feedback?${params.toString()}`);
    },
    [router, searchParams],
  );

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title={t("title")} subtitle={t("subtitle")} icon={MessageCircle} hub="admin" />

      {/* Top tabs */}
      <div className="flex items-center gap-0.5 border-b-2 border-gray-200 dark:border-slate-700 mb-4">
        <button
          onClick={() => changeTab("testimonials")}
          className={`flex items-center gap-2 px-5 py-2.5 text-sm transition-all -mb-[2px] rounded-t-lg ${
            tab === "testimonials"
              ? "border-b-2 border-primary text-primary font-medium bg-primary/5"
              : "text-seal-gray-500 hover:text-seal-navy dark:hover:text-white hover:bg-gray-50 dark:hover:bg-slate-800"
          }`}
        >
          <MessageCircle className="h-4 w-4" /> {t("tabs.testimonials")}
        </button>
        <button
          onClick={() => changeTab("surveys")}
          className={`flex items-center gap-2 px-5 py-2.5 text-sm transition-all -mb-[2px] rounded-t-lg ${
            tab === "surveys"
              ? "border-b-2 border-primary text-primary font-medium bg-primary/5"
              : "text-seal-gray-500 hover:text-seal-navy dark:hover:text-white hover:bg-gray-50 dark:hover:bg-slate-800"
          }`}
        >
          <Star className="h-4 w-4" /> {t("tabs.surveys")}
        </button>
      </div>

      {tab === "testimonials" ? <TestimonialsPanel /> : <SurveysPanel />}
    </div>
  );
}

// ============================================================================
// Testimonials panel — logique identique à l'ancienne /admin/testimonials
// ============================================================================
function TestimonialsPanel() {
  const t = useTranslations("admin.feedbackPage");
  const [testimonials, setTestimonials] = useState<Testimonial[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<TestimonialFilter>("pending");
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get<Testimonial[]>("/testimonials");
      setTestimonials(data);
    } catch (err: unknown) {
      const msg =
        err && typeof err === "object" && "response" in err
          ? (err as { response?: { data?: { message?: string } } }).response?.data?.message
          : null;
      toast.error(msg || t("errors.loadTestimonials"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = testimonials.filter((item) => {
    if (filter === "pending") return !item.isApproved && !item.rejectedAt;
    if (filter === "approved") return item.isApproved;
    if (filter === "rejected") return !!item.rejectedAt;
    return true;
  });

  const counts = {
    pending: testimonials.filter((item) => !item.isApproved && !item.rejectedAt).length,
    approved: testimonials.filter((item) => item.isApproved).length,
    rejected: testimonials.filter((item) => !!item.rejectedAt).length,
    all: testimonials.length,
  };

  const handleApprove = async (item: Testimonial) => {
    try {
      await api.patch(`/testimonials/${item.id}/approve`);
      toast.success(t("testimonials.toasts.approved"));
      load();
    } catch (err: unknown) {
      const msg =
        err && typeof err === "object" && "response" in err
          ? (err as { response?: { data?: { message?: string } } }).response?.data?.message
          : null;
      toast.error(msg || t("errors.generic"));
    }
  };

  const handleReject = async (item: Testimonial) => {
    try {
      await api.patch(`/testimonials/${item.id}/reject`, {
        reason: rejectReason.trim() || undefined,
      });
      toast.success(t("testimonials.toasts.rejected"));
      setRejectingId(null);
      setRejectReason("");
      load();
    } catch (err: unknown) {
      const msg =
        err && typeof err === "object" && "response" in err
          ? (err as { response?: { data?: { message?: string } } }).response?.data?.message
          : null;
      toast.error(msg || t("errors.generic"));
    }
  };

  const handleDelete = async (item: Testimonial) => {
    if (!confirm(t("testimonials.confirmDelete"))) return;
    try {
      await api.delete(`/testimonials/${item.id}`);
      toast.success(t("testimonials.toasts.deleted"));
      load();
    } catch (err: unknown) {
      const msg =
        err && typeof err === "object" && "response" in err
          ? (err as { response?: { data?: { message?: string } } }).response?.data?.message
          : null;
      toast.error(msg || t("errors.generic"));
    }
  };

  return (
    <div className="space-y-4">
      {/* Sub-tabs */}
      <div className="flex items-center gap-2 flex-wrap">
        {TESTIMONIAL_TAB_IDS.map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => setFilter(id)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
              filter === id
                ? "bg-seal-orange text-white"
                : "bg-white dark:bg-slate-800 text-seal-gray-500 hover:bg-gray-100 dark:hover:bg-slate-700 border border-gray-200 dark:border-slate-700"
            }`}
          >
            {t(`testimonials.filters.${id}`)}
            <span
              className={`ml-2 text-[10px] ${filter === id ? "text-white/80" : "text-seal-gray-500"}`}
            >
              {counts[id]}
            </span>
          </button>
        ))}
      </div>

      <Card>
        <CardContent className="p-4 space-y-3">
          {loading ? (
            <Skeleton className="h-20 w-full" />
          ) : filtered.length === 0 ? (
            <EmptyState
              title={t("testimonials.empty.title")}
              description={t(`testimonials.empty.${filter}`)}
            />
          ) : (
            filtered.map((item) => (
              <div
                key={item.id}
                className="rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4"
              >
                <blockquote className="text-sm italic text-seal-navy dark:text-white leading-relaxed">
                  «&nbsp;{item.quote}&nbsp;»
                </blockquote>
                <div className="mt-2 flex items-center gap-2 flex-wrap text-xs text-seal-gray-500 dark:text-slate-400">
                  {item.department && <span className="font-semibold">— {item.department}</span>}
                  {item.role && (
                    <Badge variant="info" className="text-[9px]">
                      {item.role}
                    </Badge>
                  )}
                  {item.isApproved && (
                    <Badge variant="success" className="text-[9px]">
                      {t("testimonials.badges.approved")}
                    </Badge>
                  )}
                  {item.rejectedAt && (
                    <Badge variant="error" className="text-[9px]">
                      {t("testimonials.badges.rejected")}
                    </Badge>
                  )}
                  {!item.isApproved && !item.rejectedAt && (
                    <Badge variant="warning" className="text-[9px]">
                      {t("testimonials.badges.pending")}
                    </Badge>
                  )}
                </div>
                <div className="mt-3 flex items-center gap-3 text-[11px] text-seal-gray-500 dark:text-slate-400">
                  {item.submittedBy ? (
                    <span className="flex items-center gap-1">
                      <UserIcon className="h-3 w-3" />
                      {item.submittedBy.firstName} {item.submittedBy.lastName}
                      <span className="text-[10px] opacity-70">({item.submittedBy.email})</span>
                    </span>
                  ) : (
                    <span className="italic">{t("testimonials.deletedAuthor")}</span>
                  )}
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {formatRelativeTime(item.submittedAt)}
                  </span>
                </div>
                {item.rejectionReason && (
                  <div className="mt-2 p-2 rounded bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-[11px] text-red-700 dark:text-red-300">
                    {t("testimonials.reasonLabel")} {item.rejectionReason}
                  </div>
                )}
                {rejectingId === item.id ? (
                  <div className="mt-3 space-y-2">
                    <Textarea
                      value={rejectReason}
                      onChange={(e) => setRejectReason(e.target.value)}
                      rows={2}
                      placeholder={t("testimonials.reasonPlaceholder")}
                    />
                    <div className="flex gap-2 justify-end">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setRejectingId(null);
                          setRejectReason("");
                        }}
                      >
                        {t("testimonials.cancel")}
                      </Button>
                      <Button variant="danger" size="sm" onClick={() => handleReject(item)}>
                        {t("testimonials.confirmReject")}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-3 flex items-center gap-2 flex-wrap">
                    {!item.isApproved && (
                      <Button
                        size="sm"
                        variant="primary"
                        onClick={() => handleApprove(item)}
                        className="gap-1"
                      >
                        <Check className="h-3.5 w-3.5" />
                        {t("testimonials.approve")}
                      </Button>
                    )}
                    {!item.rejectedAt && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setRejectingId(item.id)}
                        className="gap-1 text-red-600 border-red-200 hover:bg-red-50"
                      >
                        <X className="h-3.5 w-3.5" />
                        {t("testimonials.reject")}
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleDelete(item)}
                      className="gap-1 text-red-500 ml-auto"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      {t("testimonials.delete")}
                    </Button>
                  </div>
                )}
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ============================================================================
// Surveys panel — liste enquêtes + stats + lien vers création
// ============================================================================
function SurveysPanel() {
  const t = useTranslations("admin.feedbackPage");
  const [surveys, setSurveys] = useState<Survey[]>([]);
  const [stats, setStats] = useState<SurveyStats | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [surveysRes, statsRes] = await Promise.all([
        api.get<Survey[]>("/satisfaction/surveys"),
        api
          .get<SurveyStats>("/satisfaction/stats")
          .catch(() => ({ data: null as SurveyStats | null })),
      ]);
      setSurveys(Array.isArray(surveysRes.data) ? surveysRes.data : []);
      setStats(statsRes.data);
    } catch (err: unknown) {
      const msg =
        err && typeof err === "object" && "response" in err
          ? (err as { response?: { data?: { message?: string } } }).response?.data?.message
          : null;
      toast.error(msg || t("errors.loadSurveys"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    load();
  }, [load]);

  const handleDelete = async (s: Survey) => {
    if (!confirm(t("surveys.confirmDelete", { title: s.title }))) return;
    try {
      await api.delete(`/satisfaction/surveys/${s.id}`);
      toast.success(t("surveys.toasts.deleted"));
      load();
    } catch (err: unknown) {
      const msg =
        err && typeof err === "object" && "response" in err
          ? (err as { response?: { data?: { message?: string } } }).response?.data?.message
          : null;
      toast.error(msg || t("errors.generic"));
    }
  };

  return (
    <div className="space-y-4">
      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
            <p className="text-[10px] uppercase font-semibold text-seal-gray-500">
              {t("surveys.stats.surveys")}
            </p>
            <p className="text-2xl font-bold text-seal-navy dark:text-white mt-1">
              {stats.totalSurveys ?? 0}
            </p>
          </div>
          <div className="rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
            <p className="text-[10px] uppercase font-semibold text-seal-gray-500">
              {t("surveys.stats.totalResponses")}
            </p>
            <p className="text-2xl font-bold text-seal-navy dark:text-white mt-1">
              {stats.totalResponses ?? 0}
            </p>
          </div>
          <div className="rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
            <p className="text-[10px] uppercase font-semibold text-seal-gray-500">
              {t("surveys.stats.averageRating")}
            </p>
            <p className="text-2xl font-bold text-seal-navy dark:text-white mt-1">
              {stats.averageRating != null ? `${stats.averageRating.toFixed(1)} / 5` : "—"}
            </p>
          </div>
          <div className="rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
            <p className="text-[10px] uppercase font-semibold text-seal-gray-500">
              {t("surveys.stats.responseRate")}
            </p>
            <p className="text-2xl font-bold text-seal-navy dark:text-white mt-1">
              {stats.responseRate != null ? `${Math.round(stats.responseRate * 100)}%` : "—"}
            </p>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-seal-navy dark:text-white">
          {t("surveys.heading", { count: surveys.length })}
        </h2>
        {/* TODO: aucune UI de création d'enquête n'existe encore (ni page
            /admin/feedback/new-survey, ni modale) — le backend expose déjà
            POST /satisfaction/surveys. Bouton neutralisé en attendant
            l'implémentation, pour ne pas pointer vers un lien mort. */}
        <Button size="sm" disabled title="Création d'enquête — bientôt disponible">
          <Plus className="h-3.5 w-3.5 mr-1" /> {t("surveys.newSurvey")}
        </Button>
      </div>

      <Card>
        <CardContent className="p-4 space-y-2">
          {loading ? (
            <Skeleton className="h-20 w-full" />
          ) : surveys.length === 0 ? (
            <EmptyState
              title={t("surveys.empty.title")}
              description={t("surveys.empty.description")}
              action={
                // TODO: idem — pas de route/modale de création d'enquête pour l'instant.
                <Button size="sm" disabled title="Création d'enquête — bientôt disponible">
                  <Plus className="h-3.5 w-3.5 mr-1" /> {t("surveys.empty.action")}
                </Button>
              }
            />
          ) : (
            surveys.map((s) => (
              <div
                key={s.id}
                className="rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-sm font-semibold text-seal-navy dark:text-white truncate">
                        {s.title}
                      </h3>
                      {s.isActive ? (
                        <Badge variant="success" className="text-[9px] gap-1">
                          <CheckCircle2 className="h-3 w-3" />
                          {t("surveys.badges.active")}
                        </Badge>
                      ) : (
                        <Badge variant="info" className="text-[9px] gap-1">
                          <XCircle className="h-3 w-3" />
                          {t("surveys.badges.closed")}
                        </Badge>
                      )}
                      {s.isAnonymous && (
                        <Badge variant="info" className="text-[9px]">
                          {t("surveys.badges.anonymous")}
                        </Badge>
                      )}
                    </div>
                    {s.description && (
                      <p className="text-xs text-seal-gray-500 dark:text-slate-400 mt-1 line-clamp-2">
                        {s.description}
                      </p>
                    )}
                    <div className="flex items-center gap-3 mt-2 text-[11px] text-seal-gray-500 dark:text-slate-400">
                      <span className="flex items-center gap-1">
                        <BarChart3 className="h-3 w-3" />
                        {t("surveys.responseCount", { count: s._count?.responses ?? 0 })}
                      </span>
                      <span>·</span>
                      <span>{t("surveys.questionCount", { count: s._count?.questions ?? 0 })}</span>
                      <span>·</span>
                      <span>
                        {t("surveys.createdRelative", { time: formatRelativeTime(s.createdAt) })}
                      </span>
                      {s.expiresAt && (
                        <span>
                          · {t("surveys.expiresRelative", { date: formatDate(s.expiresAt) })}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Link href={`/admin/feedback/surveys/${s.id}`}>
                      <Button size="sm" variant="outline" className="gap-1">
                        {t("surveys.viewResults")} <ArrowRight className="h-3 w-3" />
                      </Button>
                    </Link>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleDelete(s)}
                      className="text-red-500"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function FeedbackPage() {
  return (
    <Suspense fallback={<Skeleton className="h-32 w-full" />}>
      <FeedbackPageInner />
    </Suspense>
  );
}
