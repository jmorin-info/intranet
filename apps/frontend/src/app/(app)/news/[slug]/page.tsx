"use client";

import React, { useEffect, useState, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import { toast } from "sonner";
import DOMPurify from "dompurify";
import {
  Card,
  CardContent,
  Badge,
  Skeleton,
  Dialog,
  Button,
  Input,
} from "@omnitech/ui";
import { formatDateTime, formatDate } from "@/lib/utils";
import Image from "next/image";
import {
  ArrowLeft,
  User,
  Calendar,
  Eye,
  Link2,
  Printer,
  Clock,
  Edit,
  CheckCircle2,
  Mail,
  Megaphone,
} from "lucide-react";
import { useAuthStore } from "@/stores/auth-store";
import { isRoleAtLeast, UserRole } from "@omnitech/shared";
import { BookmarkButton } from "@/components/bookmark-button";
import { useTranslation } from "@/lib/i18n";

interface NewsDetail {
  id: string;
  title: string;
  slug: string;
  content: string;
  excerpt: string | null;
  coverImageUrl: string | null;
  category: string | null;
  isPinned: boolean;
  publishedAt: string;
  author: { firstName: string; lastName: string } | null;
  _count?: { views: number };
}

export default function NewsArticlePage() {
  const { t } = useTranslation();
  const { slug } = useParams<{ slug: string }>();
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const canEdit = user && isRoleAtLeast(user.role, UserRole.ADMIN);
  const [post, setPost] = useState<NewsDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [related, setRelated] = useState<
    Array<{
      id: string;
      slug: string;
      title: string;
      excerpt?: string | null;
      category?: string | null;
      coverImageUrl?: string | null;
      publishedAt: string;
    }>
  >([]);
  const [readProgress, setReadProgress] = useState(0);
  const [audience, setAudience] = useState<{
    viewers: Array<{
      userId: string;
      firstName: string;
      lastName: string;
      email: string;
      role: string;
      department?: { name: string } | null;
      viewedAt: string;
    }>;
    summary: {
      totalViewers: number;
      totalActiveUsers: number;
      readRate: number;
    };
  } | null>(null);
  const [showAudience, setShowAudience] = useState(false);
  const [markedRead, setMarkedRead] = useState(false);

  // Promote-as-banner dialog
  const [promoteOpen, setPromoteOpen] = useState(false);
  const [promoteLevel, setPromoteLevel] = useState<"P1" | "P2" | "P3">("P3");
  const [promoteMessage, setPromoteMessage] = useState("");
  const [promoteExpiresAt, setPromoteExpiresAt] = useState("");
  const [promoteTitle, setPromoteTitle] = useState("");
  const [promoteSubmitting, setPromoteSubmitting] = useState(false);

  const openPromoteDialog = () => {
    if (!post) return;
    setPromoteTitle(post.title);
    setPromoteMessage(post.excerpt || `Nouvel article : ${post.title}`);
    // Default expiration: 7 days from now
    const d = new Date();
    d.setDate(d.getDate() + 7);
    setPromoteExpiresAt(d.toISOString().slice(0, 16));
    setPromoteLevel("P3");
    setPromoteOpen(true);
  };

  const handlePromote = async () => {
    if (!post) return;
    if (!promoteTitle.trim() || !promoteMessage.trim()) {
      toast.error("Titre et message requis");
      return;
    }
    setPromoteSubmitting(true);
    try {
      await api.post("/banners", {
        title: promoteTitle.trim(),
        message: promoteMessage.trim(),
        level: promoteLevel,
        linkUrl: `/news/${post.slug}`,
        expiresAt: promoteExpiresAt
          ? new Date(promoteExpiresAt).toISOString()
          : undefined,
      });
      toast.success(
        "Bannière créée — visible sur toutes les pages de l'intranet",
      );
      setPromoteOpen(false);
    } catch (err: unknown) {
      const msg = (
        err as { response?: { data?: { message?: string | string[] } } }
      )?.response?.data?.message;
      toast.error(
        Array.isArray(msg)
          ? msg.join(", ")
          : msg || "Erreur lors de la création de la bannière",
      );
    } finally {
      setPromoteSubmitting(false);
    }
  };

  useEffect(() => {
    async function fetch() {
      try {
        const { data } = await api.get(`/news/${slug}`);
        setPost(data);
        // Enregistre la vue de l'utilisateur connecté (ISO 27001 A.5.13 — traçabilité des communications)
        // Non-blocking : si l'enregistrement échoue, on ne perturbe pas la lecture
        api.post(`/news/${slug}/view`).catch(() => {});
      } catch {
        toast.error("Article introuvable");
        router.push("/news");
      } finally {
        setLoading(false);
      }
    }
    if (slug) fetch();
  }, [slug, router]);

  // Fetch related articles from the same category (silencieux : la section disparaît si échec)
  useEffect(() => {
    if (post?.category) {
      api
        .get(`/news?limit=4&category=${post.category}`)
        .then((r) => {
          setRelated(
            (r.data?.data || [])
              .filter((n: { slug: string }) => n.slug !== slug)
              .slice(0, 3),
          );
        })
        .catch(() => setRelated([]));
    }
  }, [post, slug]);

  // Load audience (ADMIN+) when user clicks to expand
  const loadAudience = async () => {
    if (!post || audience) {
      setShowAudience(!showAudience);
      return;
    }
    try {
      const { data } = await api.get(`/news/${post.id}/viewers`);
      setAudience(data);
      setShowAudience(true);
    } catch {
      toast.error("Impossible de charger l'audience");
    }
  };

  // Reading progress bar
  useEffect(() => {
    const handleScroll = () => {
      const scrolled = window.scrollY;
      const total = document.documentElement.scrollHeight - window.innerHeight;
      setReadProgress(total > 0 ? Math.min(100, (scrolled / total) * 100) : 0);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const headings = useMemo(() => {
    if (!post?.content) return [];
    const matches = post.content.match(/<h[23][^>]*>(.*?)<\/h[23]>/gi) || [];
    return matches.map((m, i) => ({
      text: m.replace(/<[^>]+>/g, ""),
      level: m.startsWith("<h2") ? 2 : 3,
      id: `heading-${i}`,
    }));
  }, [post]);

  /** Inject heading IDs so ToC anchor links work */
  const contentWithIds = useMemo(() => {
    if (!post?.content) return "";
    let idx = 0;
    return post.content.replace(
      /<(h[23])([^>]*)>/gi,
      (_match, tag: string, attrs: string) => {
        const id = `heading-${idx++}`;
        // Avoid duplicating an existing id attribute
        if (/\bid=/.test(attrs)) return `<${tag}${attrs}>`;
        return `<${tag} id="${id}"${attrs}>`;
      },
    );
  }, [post]);

  const estimatedReadTime = useMemo(() => {
    if (!post?.content) return 0;
    const text = post.content.replace(/<[^>]+>/g, "");
    const words = text.trim().split(/\s+/).length;
    return Math.max(1, Math.ceil(words / 200));
  }, [post]);

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto space-y-6">
        <Skeleton className="h-8 w-96" />
        <Skeleton className="h-64 w-full rounded-card" />
      </div>
    );
  }

  if (!post) return null;

  return (
    <>
      {/* Reading progress bar */}
      <div className="fixed top-0 left-0 right-0 h-1 z-50 bg-gray-200 dark:bg-slate-800">
        <div
          className="h-full bg-primary transition-all"
          style={{ width: `${readProgress}%` }}
        />
      </div>

      <div className="max-w-4xl mx-auto flex gap-6 animate-fade-in-up">
        <div className="flex-1 min-w-0 space-y-6">
          <div className="flex items-center justify-between">
            <button
              onClick={() => router.back()}
              className="flex items-center gap-2 text-sm text-seal-gray-500 dark:text-slate-400 hover:text-seal-navy dark:hover:text-white"
            >
              <ArrowLeft className="h-4 w-4" />
              {t("news.backToList")}
            </button>
            {canEdit && (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => openPromoteDialog()}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-primary/30 bg-primary/5 hover:bg-primary/10 text-primary transition"
                  title="Créer une bannière pointant vers cet article"
                >
                  <Megaphone className="h-3.5 w-3.5" /> Promouvoir en bannière
                </button>
                <button
                  onClick={() => router.push(`/news/${slug}/edit`)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-gray-200 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-800 text-seal-navy dark:text-white transition"
                >
                  <Edit className="h-3.5 w-3.5" /> Modifier
                </button>
              </div>
            )}
          </div>

          {post.coverImageUrl && (
            <div className="relative h-64 overflow-hidden rounded-card">
              <Image
                src={post.coverImageUrl}
                alt={post.title}
                fill
                className="object-cover"
                unoptimized
              />
            </div>
          )}

          <Card>
            <CardContent>
              <div className="space-y-4">
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    {post.category && (
                      <Badge variant="primary">{post.category}</Badge>
                    )}
                    <span className="inline-flex items-center gap-1 text-xs text-seal-gray-500 dark:text-slate-400 bg-gray-100 dark:bg-slate-800 px-2 py-0.5 rounded-full">
                      <Clock className="h-3 w-3" />
                      {estimatedReadTime} min de lecture
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <h1 className="text-2xl font-medium text-seal-navy dark:text-white">
                      {post.title}
                    </h1>
                    <BookmarkButton
                      type="news"
                      id={post.id}
                      title={post.title}
                      href={`/news/${post.slug}`}
                    />
                  </div>
                  <div className="flex items-center gap-4 mt-3 text-sm text-seal-gray-500 dark:text-slate-400">
                    <span className="flex items-center gap-2">
                      <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-primary text-[11px] font-semibold flex-shrink-0">
                        {(post.author?.firstName?.[0] || "A").toUpperCase()}
                        {(post.author?.lastName?.[0] || "").toUpperCase()}
                      </span>
                      {post.author
                        ? `${post.author.firstName} ${post.author.lastName}`
                        : "Auteur inconnu"}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <Calendar className="h-4 w-4" />
                      {formatDateTime(post.publishedAt)}
                    </span>
                    {post._count?.views !== undefined && (
                      <span className="flex items-center gap-1.5 font-medium">
                        <Eye className="h-4 w-4" />
                        {post._count.views} vues
                      </span>
                    )}
                  </div>
                </div>

                <hr className="border-gray-100 dark:border-slate-700" />

                <div
                  className="prose-reading wiki-content max-w-none"
                  dangerouslySetInnerHTML={{
                    __html: DOMPurify.sanitize(contentWithIds, {
                      ADD_ATTR: ["id"],
                      ADD_TAGS: ["pre", "code"],
                    }),
                  }}
                />

                {/* Actions en fin d'article */}
                <div className="flex gap-2 mt-6 pt-4 border-t border-gray-200 dark:border-slate-700 flex-wrap no-print">
                  <button
                    onClick={() => {
                      if (!post) return;
                      api.post(`/news/${post.slug}/view`).catch(() => {});
                      setMarkedRead(true);
                      toast.success("Article marqué comme lu");
                    }}
                    disabled={markedRead}
                    className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                      markedRead
                        ? "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 cursor-default"
                        : "bg-primary/10 text-primary hover:bg-primary/20"
                    }`}
                  >
                    <CheckCircle2 className="h-3 w-3" />{" "}
                    {markedRead ? "Lu" : "Marquer comme lu"}
                  </button>
                  <button
                    onClick={() =>
                      navigator.clipboard
                        ?.writeText(window.location.href)
                        .then(() =>
                          toast.success("Lien copié dans le presse-papiers"),
                        )
                    }
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-slate-800 text-xs font-medium text-seal-gray-500 hover:bg-gray-200 dark:hover:bg-slate-700 transition"
                  >
                    <Link2 className="h-3 w-3" /> Copier le lien
                  </button>
                  <a
                    href={`mailto:?subject=${encodeURIComponent(post.title)}&body=${encodeURIComponent(`${post.excerpt || post.title}\n\nLire l'article : ${typeof window !== "undefined" ? window.location.href : ""}`)}`}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-slate-800 text-xs font-medium text-seal-gray-500 hover:bg-gray-200 dark:hover:bg-slate-700 transition"
                  >
                    <Mail className="h-3 w-3" /> Partager par email
                  </a>
                  <button
                    onClick={() => window.print()}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-slate-800 text-xs font-medium text-seal-gray-500 hover:bg-gray-200 dark:hover:bg-slate-700 transition"
                  >
                    <Printer className="h-3 w-3" /> Imprimer
                  </button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Audience tracking (ADMIN+ uniquement) */}
          {canEdit && (
            <Card>
              <CardContent>
                <button
                  type="button"
                  onClick={loadAudience}
                  className="w-full flex items-center justify-between text-left"
                >
                  <div>
                    <h3 className="text-sm font-semibold text-seal-navy dark:text-white flex items-center gap-2">
                      <Eye className="h-4 w-4 text-primary" />
                      Audience et lecteurs
                    </h3>
                    <p className="text-xs text-seal-gray-500 dark:text-slate-400 mt-0.5">
                      Qui a consulté cette actualité (ISO 27001 A.5.13)
                    </p>
                  </div>
                  <span className="text-xs text-primary font-semibold">
                    {showAudience ? "Masquer" : "Afficher"}
                  </span>
                </button>

                {showAudience && audience && (
                  <div className="mt-4 pt-4 border-t border-gray-100 dark:border-slate-700 space-y-3">
                    <div className="grid grid-cols-3 gap-3">
                      <div className="rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50/60 dark:bg-emerald-900/15 p-3">
                        <p className="text-[10px] uppercase tracking-wider text-seal-gray-500">
                          Lecteurs
                        </p>
                        <p className="text-xl font-medium text-emerald-700 dark:text-emerald-400 mt-1">
                          {audience.summary.totalViewers}
                        </p>
                      </div>
                      <div className="rounded-lg border border-gray-200 dark:border-slate-700 p-3">
                        <p className="text-[10px] uppercase tracking-wider text-seal-gray-500">
                          Total actifs
                        </p>
                        <p className="text-xl font-medium text-seal-navy dark:text-white mt-1">
                          {audience.summary.totalActiveUsers}
                        </p>
                      </div>
                      <div
                        className={`rounded-lg border p-3 ${
                          audience.summary.readRate >= 70
                            ? "border-emerald-200 dark:border-emerald-800 bg-emerald-50/60 dark:bg-emerald-900/15"
                            : audience.summary.readRate >= 40
                              ? "border-amber-200 dark:border-amber-800 bg-amber-50/60 dark:bg-amber-900/15"
                              : "border-red-200 dark:border-red-800 bg-red-50/60 dark:bg-red-900/15"
                        }`}
                      >
                        <p className="text-[10px] uppercase tracking-wider text-seal-gray-500">
                          Taux de lecture
                        </p>
                        <p
                          className={`text-xl font-medium mt-1 ${
                            audience.summary.readRate >= 70
                              ? "text-emerald-700 dark:text-emerald-400"
                              : audience.summary.readRate >= 40
                                ? "text-amber-700 dark:text-amber-400"
                                : "text-red-700 dark:text-red-400"
                          }`}
                        >
                          {audience.summary.readRate}%
                        </p>
                      </div>
                    </div>

                    {audience.viewers.length > 0 && (
                      <div className="max-h-64 overflow-y-auto border border-gray-200 dark:border-slate-700 rounded-lg">
                        <table className="w-full text-xs">
                          <thead className="bg-gray-50 dark:bg-slate-900 sticky top-0">
                            <tr>
                              <th className="text-left px-3 py-2 font-semibold text-seal-gray-500 dark:text-slate-400">
                                Utilisateur
                              </th>
                              <th className="text-left px-3 py-2 font-semibold text-seal-gray-500 dark:text-slate-400">
                                Département
                              </th>
                              <th className="text-right px-3 py-2 font-semibold text-seal-gray-500 dark:text-slate-400">
                                Lu le
                              </th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100 dark:divide-slate-800">
                            {audience.viewers.map((v) => (
                              <tr
                                key={v.userId}
                                className="hover:bg-gray-50/60 dark:hover:bg-slate-800/40"
                              >
                                <td className="px-3 py-2">
                                  <p className="text-seal-navy dark:text-white font-medium">
                                    {v.firstName} {v.lastName}
                                  </p>
                                  <p className="text-[10px] text-seal-gray-500 dark:text-slate-400">
                                    {v.email}
                                  </p>
                                </td>
                                <td className="px-3 py-2 text-seal-gray-500 dark:text-slate-400">
                                  {v.department?.name || "—"}
                                </td>
                                <td className="px-3 py-2 text-right text-seal-gray-500 dark:text-slate-400 whitespace-nowrap">
                                  {formatDate(v.viewedAt)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Prev / Next navigation */}
          {related.length > 0 && (
            <div className="flex items-center justify-between gap-4">
              {related[0] ? (
                <Link
                  href={`/news/${related[0].slug}`}
                  className="group flex-1 rounded-xl border border-gray-200 dark:border-slate-700 p-4 hover:border-primary/40 transition"
                >
                  <p className="text-[10px] uppercase tracking-wider text-seal-gray-500 dark:text-slate-500 mb-1">
                    Article precedent
                  </p>
                  <p className="text-sm font-medium text-seal-navy dark:text-white group-hover:text-primary transition line-clamp-1">
                    {related[0].title}
                  </p>
                </Link>
              ) : (
                <div className="flex-1" />
              )}
              {related[1] ? (
                <Link
                  href={`/news/${related[1].slug}`}
                  className="group flex-1 text-right rounded-xl border border-gray-200 dark:border-slate-700 p-4 hover:border-primary/40 transition"
                >
                  <p className="text-[10px] uppercase tracking-wider text-seal-gray-500 dark:text-slate-500 mb-1">
                    Article suivant
                  </p>
                  <p className="text-sm font-medium text-seal-navy dark:text-white group-hover:text-primary transition line-clamp-1">
                    {related[1].title}
                  </p>
                </Link>
              ) : (
                <div className="flex-1" />
              )}
            </div>
          )}

          {/* Related articles */}
          {related.length > 0 && (
            <div className="space-y-4">
              <h2 className="text-lg font-medium text-seal-navy dark:text-white">
                Articles similaires
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {related.map((article) => (
                  <Link key={article.id} href={`/news/${article.slug}`}>
                    <Card hoverable className="h-full">
                      <CardContent>
                        {article.category && (
                          <Badge variant="primary" className="mb-2 text-[10px]">
                            {article.category}
                          </Badge>
                        )}
                        <h3 className="text-sm font-semibold text-seal-navy dark:text-white line-clamp-2">
                          {article.title}
                        </h3>
                        {article.excerpt && (
                          <p className="text-xs text-seal-gray-500 dark:text-slate-400 line-clamp-2 mt-1">
                            {article.excerpt}
                          </p>
                        )}
                        <p className="text-[10px] text-seal-gray-500 dark:text-slate-500 mt-2">
                          {formatDate(article.publishedAt)}
                        </p>
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Table of contents sidebar */}
        {headings.length > 2 && (
          <div className="hidden xl:block w-48 flex-shrink-0">
            <div className="sticky top-20 space-y-1">
              <p className="text-xs font-semibold text-seal-gray-500 dark:text-slate-400 mb-2">
                Sommaire
              </p>
              {headings.map((h) => (
                <a
                  key={h.id}
                  href={`#${h.id}`}
                  className={`block text-xs ${h.level === 3 ? "pl-3" : ""} text-seal-gray-500 dark:text-slate-400 hover:text-primary transition truncate`}
                >
                  {h.text}
                </a>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Dialog : Promouvoir l'article en bannière */}
      <Dialog
        open={promoteOpen}
        onClose={() => {
          if (!promoteSubmitting) setPromoteOpen(false);
        }}
        title="Promouvoir cet article en bannière"
        description="Affiche une bannière cliquable sur toutes les pages de l'intranet, renvoyant vers cet article."
      >
        <div className="space-y-3">
          <Input
            label="Titre de la bannière"
            value={promoteTitle}
            onChange={(e) => setPromoteTitle(e.target.value)}
            placeholder="Ex: Nouveau quiz de sensibilisation"
            disabled={promoteSubmitting}
          />
          <Input
            label="Message"
            value={promoteMessage}
            onChange={(e) => setPromoteMessage(e.target.value)}
            placeholder="Court texte affiché après le titre"
            disabled={promoteSubmitting}
          />
          <div>
            <label className="block text-xs font-semibold text-seal-gray-500 dark:text-slate-400 mb-1.5">
              Priorité
            </label>
            <div className="flex gap-2">
              {(["P1", "P2", "P3"] as const).map((level) => {
                const labels = {
                  P1: "Critique",
                  P2: "Avertissement",
                  P3: "Information",
                };
                const colors = {
                  P1:
                    promoteLevel === "P1"
                      ? "bg-red-600 text-white border-red-700"
                      : "border-red-200 text-red-700 hover:bg-red-50",
                  P2:
                    promoteLevel === "P2"
                      ? "bg-amber-400 text-amber-950 border-amber-500"
                      : "border-amber-200 text-amber-700 hover:bg-amber-50",
                  P3:
                    promoteLevel === "P3"
                      ? "bg-blue-600 text-white border-blue-700"
                      : "border-blue-200 text-blue-700 hover:bg-blue-50",
                } as const;
                return (
                  <button
                    key={level}
                    type="button"
                    onClick={() => setPromoteLevel(level)}
                    disabled={promoteSubmitting}
                    className={`flex-1 px-3 py-2 rounded-lg border text-xs font-semibold transition ${colors[level]}`}
                  >
                    {level} — {labels[level]}
                  </button>
                );
              })}
            </div>
          </div>
          <Input
            label="Expiration"
            type="datetime-local"
            value={promoteExpiresAt}
            onChange={(e) => setPromoteExpiresAt(e.target.value)}
            disabled={promoteSubmitting}
          />
          <p className="text-[11px] text-seal-gray-500 dark:text-slate-500">
            Le lien de redirection sera{" "}
            <span className="font-mono bg-gray-100 dark:bg-slate-800 px-1 rounded">
              /news/{slug}
            </span>
          </p>
          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="outline"
              onClick={() => setPromoteOpen(false)}
              disabled={promoteSubmitting}
            >
              Annuler
            </Button>
            <Button
              variant="primary"
              onClick={handlePromote}
              loading={promoteSubmitting}
            >
              <Megaphone className="h-4 w-4" /> Créer la bannière
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  );
}
