"use client";

import React, { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  Button,
  Badge,
  EmptyState,
  Skeleton,
} from "@omnitech/ui";
import {
  ArrowLeft,
  Star,
  BarChart3,
  Users,
  MessageSquare,
  Download,
  RefreshCw,
  Trash2,
  CheckCircle2,
  XCircle,
  Calendar,
} from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { api } from "@/lib/api";
import { formatRelativeTime, formatDate } from "@/lib/utils";

interface QuestionAggregation {
  total: number;
  average?: number;
  distribution?: Array<{ value: number; count: number }>;
  choices?: Array<{ label: string; count: number }>;
  texts?: string[];
}

interface QuestionResult {
  questionId: string;
  label: string;
  type: string;
  options: string[] | null;
  aggregation: QuestionAggregation;
}

interface SurveyResponse {
  id: string;
  rating: number;
  comment: string | null;
  createdAt: string;
  user: {
    id: string;
    firstName: string;
    lastName: string;
    departmentId: string | null;
  } | null;
  answers: Array<{ questionId: string; value: string }>;
}

interface SurveyResults {
  survey: { id: string; title: string; description: string | null };
  stats: {
    totalResponses: number;
    averageRating: number;
    distribution: Array<{ rating: number; count: number }>;
    byDepartment: Array<{
      departmentId: string;
      responses: number;
      averageRating: number;
    }>;
  };
  questionResults: QuestionResult[];
  responses: SurveyResponse[];
}

interface SurveyMeta {
  id: string;
  title: string;
  description: string | null;
  isAnonymous: boolean;
  isActive: boolean;
  expiresAt: string | null;
  createdAt: string;
  questions: Array<{ id: string; label: string; type: string; order: number }>;
}

function Stars({ value, size = 4 }: { value: number; size?: number }) {
  return (
    <div
      className="inline-flex items-center gap-0.5"
      aria-label={`Note: ${value} sur 5`}
    >
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          className={`h-${size} w-${size} ${n <= Math.round(value) ? "fill-amber-400 text-amber-400" : "text-gray-300"}`}
        />
      ))}
    </div>
  );
}

export default function SurveyDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params?.id;
  const [meta, setMeta] = useState<SurveyMeta | null>(null);
  const [results, setResults] = useState<SurveyResults | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const fetchData = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const [metaRes, resultsRes] = await Promise.all([
        api.get(`/satisfaction/surveys/${id}`),
        api.get(`/satisfaction/surveys/${id}/results`),
      ]);
      setMeta(metaRes.data);
      setResults(resultsRes.data);
      setNotFound(false);
    } catch (err) {
      const status = (err as { response?: { status?: number } })?.response
        ?.status;
      if (status === 404) {
        setNotFound(true);
      } else {
        toast.error("Erreur lors du chargement de l'enquête");
      }
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleExportCsv = () => {
    if (!results) return;
    const headers = [
      "Date",
      "Utilisateur",
      "Note globale",
      "Commentaire",
      ...results.questionResults.map((q) => q.label),
    ];
    const rows = results.responses.map((r) => {
      const answerMap = new Map(r.answers.map((a) => [a.questionId, a.value]));
      return [
        new Date(r.createdAt).toISOString(),
        r.user ? `${r.user.firstName} ${r.user.lastName}` : "Anonyme",
        String(r.rating),
        (r.comment || "").replace(/"/g, '""'),
        ...results.questionResults.map((q) =>
          (answerMap.get(q.questionId) || "").replace(/"/g, '""'),
        ),
      ];
    });
    const csv = [headers, ...rows]
      .map((row) => row.map((cell) => `"${cell}"`).join(","))
      .join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `enquete-${results.survey.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Export CSV généré");
  };

  const handleDelete = async () => {
    if (!meta) return;
    if (!confirm(`Supprimer définitivement l'enquête "${meta.title}" ?`))
      return;
    setDeleting(true);
    try {
      await api.delete(`/satisfaction/surveys/${meta.id}`);
      toast.success("Enquête supprimée");
      router.push("/admin/feedback?tab=surveys");
    } catch {
      toast.error("Erreur lors de la suppression");
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (notFound || !meta || !results) {
    return (
      <div className="space-y-6">
        <Link
          href="/admin/feedback?tab=surveys"
          className="inline-flex items-center gap-1 text-sm text-seal-gray-500 hover:text-primary"
        >
          <ArrowLeft className="h-4 w-4" /> Retour aux enquêtes
        </Link>
        <Card>
          <CardContent className="py-16">
            <EmptyState
              type="general"
              title="Enquête introuvable"
              description="Cette enquête n'existe plus ou l'identifiant est invalide."
            />
          </CardContent>
        </Card>
      </div>
    );
  }

  const { stats } = results;
  const maxDistCount = Math.max(1, ...stats.distribution.map((d) => d.count));

  return (
    <div className="space-y-6">
      <Link
        href="/admin/feedback?tab=surveys"
        className="inline-flex items-center gap-1 text-sm text-seal-gray-500 hover:text-primary"
      >
        <ArrowLeft className="h-4 w-4" /> Retour aux enquêtes
      </Link>

      <PageHeader
        title={meta.title}
        subtitle={meta.description || undefined}
        actions={
          <div className="flex items-center gap-2">
            <Button size="sm" variant="ghost" onClick={fetchData}>
              <RefreshCw className="h-3.5 w-3.5" /> Rafraîchir
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={handleExportCsv}
              disabled={stats.totalResponses === 0}
            >
              <Download className="h-3.5 w-3.5" /> Exporter CSV
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={handleDelete}
              loading={deleting}
              className="text-red-500"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        }
      />

      <div className="flex flex-wrap items-center gap-2 text-sm">
        {meta.isActive ? (
          <Badge variant="success" className="gap-1">
            <CheckCircle2 className="h-3 w-3" />
            Active
          </Badge>
        ) : (
          <Badge variant="info" className="gap-1">
            <XCircle className="h-3 w-3" />
            Fermée
          </Badge>
        )}
        {meta.isAnonymous && <Badge variant="info">Anonyme</Badge>}
        <span className="text-seal-gray-500 inline-flex items-center gap-1">
          <Calendar className="h-3.5 w-3.5" /> Créée{" "}
          {formatRelativeTime(meta.createdAt)}
        </span>
        {meta.expiresAt && (
          <span className="text-seal-gray-500">
            · Expire le {formatDate(meta.expiresAt)}
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-5">
            <div className="flex items-start justify-between mb-2">
              <div>
                <p className="text-xs uppercase tracking-wide text-seal-gray-500 font-semibold">
                  Réponses
                </p>
                <p className="text-3xl font-semibold text-seal-navy dark:text-white mt-1">
                  {stats.totalResponses}
                </p>
              </div>
              <Users className="h-5 w-5 text-seal-gray-400" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="flex items-start justify-between mb-2">
              <div>
                <p className="text-xs uppercase tracking-wide text-seal-gray-500 font-semibold">
                  Note moyenne
                </p>
                <p className="text-3xl font-semibold text-seal-navy dark:text-white mt-1">
                  {stats.totalResponses > 0
                    ? stats.averageRating.toFixed(1)
                    : "—"}
                </p>
                {stats.totalResponses > 0 && (
                  <Stars value={stats.averageRating} />
                )}
              </div>
              <Star className="h-5 w-5 text-amber-400" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="flex items-start justify-between mb-2">
              <div>
                <p className="text-xs uppercase tracking-wide text-seal-gray-500 font-semibold">
                  Questions
                </p>
                <p className="text-3xl font-semibold text-seal-navy dark:text-white mt-1">
                  {results.questionResults.length}
                </p>
              </div>
              <BarChart3 className="h-5 w-5 text-seal-gray-400" />
            </div>
          </CardContent>
        </Card>
      </div>

      {stats.totalResponses === 0 ? (
        <Card>
          <CardContent className="py-12">
            <EmptyState
              type="general"
              title="Aucune réponse pour le moment"
              description="Les résultats apparaîtront ici dès qu'un collaborateur aura répondu."
            />
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardContent className="p-5">
              <h2 className="text-sm font-semibold text-seal-navy dark:text-white mb-4">
                Distribution des notes globales
              </h2>
              <div className="space-y-2">
                {[5, 4, 3, 2, 1].map((n) => {
                  const entry = stats.distribution.find(
                    (d) => d.rating === n,
                  ) || { rating: n, count: 0 };
                  const pct = (entry.count / maxDistCount) * 100;
                  return (
                    <div key={n} className="flex items-center gap-3">
                      <div className="w-12 inline-flex items-center gap-1 text-xs text-seal-gray-500">
                        {n}{" "}
                        <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                      </div>
                      <div className="flex-1 h-2 rounded-full bg-gray-100 dark:bg-slate-800 overflow-hidden">
                        <div
                          className="h-full bg-primary"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <div className="w-12 text-right text-xs text-seal-gray-500 tabular-nums">
                        {entry.count}
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-5 space-y-6">
              <h2 className="text-sm font-semibold text-seal-navy dark:text-white">
                Résultats par question
              </h2>
              {results.questionResults.map((q) => (
                <div
                  key={q.questionId}
                  className="border-t border-gray-100 dark:border-slate-800 pt-4 first:border-t-0 first:pt-0"
                >
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <h3 className="text-sm font-medium text-seal-navy dark:text-white">
                        {q.label}
                      </h3>
                      <p className="text-[11px] uppercase tracking-wide text-seal-gray-500 mt-0.5">
                        {q.type} · {q.aggregation.total} réponse
                        {q.aggregation.total > 1 ? "s" : ""}
                      </p>
                    </div>
                    {typeof q.aggregation.average === "number" &&
                      q.aggregation.average > 0 && (
                        <Badge variant="info">
                          Moyenne {q.aggregation.average.toFixed(1)}
                        </Badge>
                      )}
                  </div>

                  {(q.type === "rating" || q.type === "scale") &&
                    q.aggregation.distribution && (
                      <div className="space-y-1.5 mt-2">
                        {q.aggregation.distribution.map((d) => {
                          const max = Math.max(
                            1,
                            ...q.aggregation.distribution!.map((x) => x.count),
                          );
                          const pct = (d.count / max) * 100;
                          return (
                            <div
                              key={d.value}
                              className="flex items-center gap-3"
                            >
                              <div className="w-8 text-xs text-seal-gray-500 tabular-nums">
                                {d.value}
                              </div>
                              <div className="flex-1 h-1.5 rounded-full bg-gray-100 dark:bg-slate-800 overflow-hidden">
                                <div
                                  className="h-full bg-primary/70"
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                              <div className="w-8 text-right text-xs text-seal-gray-500 tabular-nums">
                                {d.count}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}

                  {(q.type === "choice" || q.type === "yesno") &&
                    q.aggregation.choices && (
                      <div className="space-y-1.5 mt-2">
                        {q.aggregation.choices.map((c) => {
                          const max = Math.max(
                            1,
                            ...q.aggregation.choices!.map((x) => x.count),
                          );
                          const pct = (c.count / max) * 100;
                          return (
                            <div
                              key={c.label}
                              className="flex items-center gap-3"
                            >
                              <div
                                className="w-32 text-xs text-seal-navy dark:text-white truncate"
                                title={c.label}
                              >
                                {c.label}
                              </div>
                              <div className="flex-1 h-1.5 rounded-full bg-gray-100 dark:bg-slate-800 overflow-hidden">
                                <div
                                  className="h-full bg-primary/70"
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                              <div className="w-8 text-right text-xs text-seal-gray-500 tabular-nums">
                                {c.count}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}

                  {q.type === "text" &&
                    q.aggregation.texts &&
                    q.aggregation.texts.length > 0 && (
                      <ul className="mt-2 space-y-1.5 max-h-48 overflow-auto">
                        {q.aggregation.texts.slice(0, 50).map((text, i) => (
                          <li
                            key={i}
                            className="text-xs text-seal-gray-600 dark:text-slate-300 italic border-l-2 border-primary/40 pl-2"
                          >
                            "{text}"
                          </li>
                        ))}
                      </ul>
                    )}
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-5">
              <h2 className="text-sm font-semibold text-seal-navy dark:text-white mb-4">
                Dernières réponses
              </h2>
              <div className="divide-y divide-gray-100 dark:divide-slate-800 max-h-[500px] overflow-auto">
                {results.responses.slice(0, 100).map((r) => (
                  <div key={r.id} className="py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-seal-navy dark:text-white">
                          {meta.isAnonymous || !r.user
                            ? "Anonyme"
                            : `${r.user.firstName} ${r.user.lastName}`}
                        </p>
                        <p className="text-[10px] text-seal-gray-500">
                          {formatRelativeTime(r.createdAt)}
                        </p>
                      </div>
                      <Stars value={r.rating} size={3} />
                    </div>
                    {r.comment && (
                      <p className="text-xs text-seal-gray-600 dark:text-slate-300 italic mt-1.5">
                        {r.comment}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
