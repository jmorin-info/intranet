'use client';

import React, { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { toast } from 'sonner';
import { useTranslation } from '@/lib/i18n';
import { useAuthStore } from '@/stores/auth-store';
import { isRoleAtLeast, UserRole } from '@omnitech/shared';
import { useDebounce } from '@/hooks/use-debounce';
import {
  Card,
  CardContent,
  CardHeader,
  Button,
  SearchInput,
  EmptyState,
} from '@omnitech/ui';
import { PageHeader } from '@/components/layout/page-header';
import { formatDate } from '@/lib/utils';
import Image from 'next/image';
import { Plus, Pin, Newspaper, User, Calendar, Star, Clock, Eye } from 'lucide-react';

interface NewsPost {
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  content: string;
  coverImageUrl: string | null;
  category: string | null;
  isPinned: boolean;
  isPublished: boolean;
  publishedAt: string;
  author: { firstName: string; lastName: string };
  viewCount?: number;
  _count?: { views: number };
}

interface ApiError {
  message?: string;
  response?: { data?: { message?: string } };
}

const CATEGORY_COLORS: Record<string, string> = {
  'Sécurité': 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  'SMSI': 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400',
  'RH': 'bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400',
  'IT': 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400',
  'Technique': 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400',
  'Événement': 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  'Intranet': 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  'Formation': 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  'Général': 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
  'Vie d\'entreprise': 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
};

function getCategoryColor(category: string): string {
  return CATEGORY_COLORS[category] || 'bg-gray-100 text-gray-700 dark:bg-slate-700 dark:text-gray-300';
}

export default function NewsPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const user = useAuthStore(s => s.user);
  const [news, setNews] = useState<NewsPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [visibleCount, setVisibleCount] = useState(10);
  const [popular, setPopular] = useState<NewsPost[]>([]);
  const [categories, setCategories] = useState<string[]>([]);

  const FALLBACK_CATEGORIES = ['Intranet', 'SMSI', 'Sécurité', 'RH', 'Événement', 'Technique'];

  useEffect(() => {
    api.get('/news/popular?limit=5').then(r => setPopular(r.data || [])).catch(console.error);
    api.get('/news/categories').then(({ data }) => {
      const dynamic = (Array.isArray(data) ? data : []).map((c: { category?: string }) => c.category).filter((v): v is string => Boolean(v));
      if (dynamic.length > 0) setCategories(dynamic);
    }).catch(console.error);
  }, []);

  const debouncedSearch = useDebounce(search, 300);

  const canCompose = user && isRoleAtLeast(user.role, UserRole.ADMIN);

  const handlePin = async (newsId: string, pinned: boolean) => {
    try {
      await api.patch(`/news/${newsId}`, { isPinned: pinned });
      toast.success(pinned ? 'Article épinglé' : 'Article désépinglé');
      fetchNews();
    } catch (err) { toast.error((err as ApiError)?.response?.data?.message || (err as ApiError)?.message || 'Opération échouée'); }
  };

  const fetchNews = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string | number> = { limit: 50 };
      if (debouncedSearch) params.search = debouncedSearch;
      const { data } = await api.get('/news', { params });
      setNews(data?.data || []);
    } catch {
      setNews([]);
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch]);

  useEffect(() => {
    fetchNews();
  }, [fetchNews]);

  const filteredNews = categoryFilter
    ? news.filter((n) => n.category === categoryFilter)
    : news;
  const pinned = filteredNews.filter((n) => n.isPinned);
  const allRegular = filteredNews.filter((n) => !n.isPinned);
  const regular = allRegular.slice(0, visibleCount);
  const hasMore = allRegular.length > visibleCount;

  const latestDate = !loading && news.length > 0
    ? formatDate(news.reduce((latest, n) => n.publishedAt > latest ? n.publishedAt : latest, news[0]!.publishedAt))
    : null;

  return (
    <div className="space-y-6 animate-fade-in-up">
      <PageHeader
        title={t('news.title')}
        subtitle={
          latestDate
            ? `${t('news.subtitle')} — ${news.length} article${news.length > 1 ? 's' : ''} — dernier : ${latestDate}`
            : t('news.subtitle')
        }
        icon={Newspaper}
        hub="work"
        actions={canCompose ? (
          <Button onClick={() => router.push('/news/compose')}>
            <Plus className="h-4 w-4" />
            {t('news.new')}
          </Button>
        ) : undefined}
      />

      <SearchInput
        value={search}
        onChange={setSearch}
        placeholder={t('news.searchPlaceholder')}
      />

      <div className="flex gap-1.5 flex-wrap">
        <button onClick={() => { setCategoryFilter(''); setVisibleCount(10); }}
          className={`rounded-full px-3 py-1 text-xs font-semibold transition ${!categoryFilter ? 'bg-primary text-white' : 'bg-gray-100 dark:bg-slate-700 text-seal-gray-500'}`}>
          Toutes
        </button>
        {(categories.length > 0 ? categories : FALLBACK_CATEGORIES).map(cat => (
          <button key={cat} onClick={() => { setCategoryFilter(categoryFilter === cat ? '' : cat); setVisibleCount(10); }}
            className={`rounded-full px-3 py-1 text-xs font-semibold transition ${categoryFilter === cat ? 'bg-primary text-white ring-2 ring-primary/30' : getCategoryColor(cat)}`}>
            {cat}
          </button>
        ))}
      </div>

      {/* Article le plus lu — featured highlight */}
      {!loading && popular.length > 0 && (() => {
        const topArticle = popular[0]!;
        return (
          <div className="relative rounded-xl border-2 border-amber-300 dark:border-amber-600 bg-gradient-to-r from-amber-50 via-white to-amber-50 dark:from-amber-900/20 dark:via-slate-900 dark:to-amber-900/20 p-5 overflow-hidden">
            <div className="absolute top-3 right-3 flex items-center gap-1.5 bg-amber-400 text-white text-[11px] font-semibold px-2.5 py-1 rounded-full shadow-sm">
              <Star className="h-3.5 w-3.5 fill-white" />
              Article populaire
            </div>
            <Link href={`/news/${topArticle.slug}`} className="block group">
              <div className="flex items-start gap-4">
                {topArticle.coverImageUrl && (
                  <div className="relative w-28 h-20 rounded-lg overflow-hidden flex-shrink-0">
                    <Image src={topArticle.coverImageUrl} alt={topArticle.title} fill sizes="112px" className="object-cover" unoptimized />
                  </div>
                )}
                <div className="flex-1 min-w-0 pr-0 sm:pr-24">
                  <h3 className="text-lg font-medium text-seal-navy dark:text-white group-hover:text-primary transition line-clamp-2">{topArticle.title}</h3>
                  {topArticle.excerpt && (
                    <p className="text-sm text-gray-600 dark:text-slate-400 line-clamp-2 mt-1">{topArticle.excerpt}</p>
                  )}
                  <div className="flex items-center gap-3 mt-2 text-xs text-seal-gray-500 dark:text-slate-400">
                    <span className="flex items-center gap-1">
                      <User className="h-3 w-3" />
                      {topArticle.author?.firstName} {topArticle.author?.lastName}
                    </span>
                    <span className="flex items-center gap-1 font-semibold text-amber-600 dark:text-amber-400">
                      <Star className="h-3 w-3 fill-amber-500 text-amber-500" />
                      {topArticle._count?.views || 0} vues
                    </span>
                  </div>
                </div>
              </div>
            </Link>
          </div>
        );
      })()}

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Main content */}
        <div className="lg:col-span-3 space-y-6">
          {loading ? (
            <div className="space-y-6">
              {/* Featured skeleton — matches h-72/h-80 hero */}
              <div className="rounded-xl overflow-hidden shimmer h-72 md:h-80" />
              {/* Grid skeleton — matches NewsCard (cover h-36 + body) */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div
                    key={i}
                    className="rounded-xl border border-gray-100 dark:border-slate-700 bg-white dark:bg-slate-900 overflow-hidden"
                  >
                    <div className="h-36 shimmer" />
                    <div className="p-3 space-y-2">
                      <div className="h-3 w-16 rounded-full shimmer" />
                      <div className="h-4 w-11/12 rounded shimmer" />
                      <div className="h-3 w-4/5 rounded shimmer" />
                      <div className="h-3 w-full rounded shimmer mt-2" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : news.length === 0 ? (
            <EmptyState
              type="news"
              title="Aucune actualité publiée"
              description="Cet espace diffuse les communications officielles OMNITECH SECURITY : annonces RSSI, formations, alertes critiques et événements internes. Revenez prochainement pour découvrir les dernières nouvelles."
              action={isRoleAtLeast(user?.role ?? UserRole.COLLABORATEUR, UserRole.ADMIN) ? (
                <Link href="/news/compose"><Button size="sm"><Plus className="h-4 w-4" /> Publier une actualité</Button></Link>
              ) : undefined}
            />
          ) : (
            <div className="space-y-6 animate-fade-in-up">
              {/* Featured — first pinned or most recent */}
              {(() => {
                const featuredPost = pinned[0] || filteredNews[0];
                if (!featuredPost) return null;
                return (
                  <Link href={`/news/${featuredPost.slug}`} className="block group">
                    <div className="relative rounded-xl overflow-hidden shadow-sm h-72 md:h-80">
                      {featuredPost.coverImageUrl ? (
                        <Image
                          src={featuredPost.coverImageUrl}
                          alt={featuredPost.title}
                          fill
                          sizes="(max-width: 768px) 100vw, 75vw"
                          className="object-cover transition duration-200 group-hover:scale-[1.02]"
                          unoptimized
                        />
                      ) : (
                        <div className="absolute inset-0 bg-gradient-to-br from-seal-navy to-primary/80" />
                      )}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
                      <div className="absolute bottom-0 left-0 right-0 p-5 md:p-6">
                        <div className="flex items-center gap-2 mb-2">
                          {featuredPost.isPinned && (
                            <span className="inline-flex items-center gap-1 bg-primary/90 text-white text-[11px] font-medium px-2 py-0.5 rounded-full">
                              <Pin className="h-3 w-3" /> {t('news.pinnedTag')}
                            </span>
                          )}
                          {featuredPost.category && (
                            <span className="inline-flex items-center bg-white/20 backdrop-blur-sm text-white text-[11px] font-medium px-2 py-0.5 rounded-full">
                              {featuredPost.category}
                            </span>
                          )}
                        </div>
                        <h2 className="text-xl md:text-2xl font-medium text-white line-clamp-2 transition duration-200 group-hover:text-primary-light">
                          {featuredPost.title}
                        </h2>
                        {featuredPost.excerpt && (
                          <p className="text-sm text-white/80 line-clamp-2 mt-1.5">{featuredPost.excerpt}</p>
                        )}
                        <div className="flex items-center gap-3 mt-3 text-[11px] text-white/70">
                          <span className="flex items-center gap-1.5">
                            <span className="inline-flex items-center justify-center h-5 w-5 rounded-full bg-white/20 text-white text-[9px] font-medium">
                              {`${featuredPost.author.firstName[0] || ''}${featuredPost.author.lastName[0] || ''}`.toUpperCase()}
                            </span>
                            {featuredPost.author.firstName} {featuredPost.author.lastName}
                          </span>
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {formatDate(featuredPost.publishedAt)}
                          </span>
                          {(featuredPost.viewCount ?? featuredPost._count?.views) !== undefined && (
                            <span className="flex items-center gap-1">
                              <Eye className="h-3 w-3" />
                              {featuredPost.viewCount ?? featuredPost._count?.views} vues
                            </span>
                          )}
                        </div>
                      </div>
                      {canCompose && (
                        <button
                          onClick={(e) => { e.preventDefault(); e.stopPropagation(); handlePin(featuredPost.id, !featuredPost.isPinned); }}
                          className="absolute top-3 right-3 p-1.5 rounded-full bg-white/20 backdrop-blur-sm text-white hover:bg-white/40 transition duration-200"
                          title={featuredPost.isPinned ? 'Désépingler' : 'Épingler'}
                          aria-label={featuredPost.isPinned ? 'Désépingler cet article' : 'Épingler cet article'}
                        >
                          <Pin className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </Link>
                );
              })()}

              {/* Pinned (remaining) */}
              {pinned.length > 1 && (
                <div className="space-y-3">
                  <h2 className="text-sm font-medium text-seal-navy dark:text-white flex items-center gap-1.5">
                    <Pin className="h-4 w-4 text-primary" />
                    {t('news.pinned')}
                  </h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {pinned.slice(1).map((post) => (
                      <div key={post.id} className="stagger-item">
                        <NewsCard post={post} t={t} onPin={canCompose ? handlePin : undefined} />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Regular — magazine grid */}
              {regular.length > 0 && (
                <div className="space-y-3">
                  {(pinned.length > 0) && (
                    <h2 className="text-sm font-medium text-seal-navy dark:text-white">{t('news.recent')}</h2>
                  )}
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {regular.map((post) => (
                      <div key={post.id} className="stagger-item">
                        <NewsCard post={post} t={t} onPin={canCompose ? handlePin : undefined} />
                      </div>
                    ))}
                  </div>
                  {hasMore && (
                    <div className="flex justify-center pt-2">
                      <Button variant="outline" onClick={() => setVisibleCount((prev) => prev + 10)}>
                        Charger plus ({allRegular.length - visibleCount} restant{allRegular.length - visibleCount > 1 ? 's' : ''})
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="lg:col-span-1 space-y-6">
          {popular.length > 0 && (
            <Card>
              <CardHeader><h3 className="text-sm font-semibold text-seal-navy dark:text-white">Articles populaires</h3></CardHeader>
              <CardContent className="space-y-2">
                {popular.map((article) => (
                  <Link key={article.id} href={`/news/${article.slug}`} className="block text-xs text-seal-navy dark:text-white hover:text-primary transition line-clamp-2 font-medium">
                    {article.title}
                    <span className="text-[10px] text-seal-gray-500 dark:text-slate-500 block mt-0.5">{article._count?.views || 0} vues</span>
                  </Link>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function estimateReadingTime(content: string): number {
  const wordCount = content.replace(/<[^>]*>/g, '').split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(wordCount / 200));
}

function NewsCard({ post, t, onPin }: { post: NewsPost; t: (key: string) => string; featured?: boolean; onPin?: (id: string, pinned: boolean) => void }) {
  const initials = `${post.author.firstName[0] || ''}${post.author.lastName[0] || ''}`.toUpperCase();
  const readingTime = estimateReadingTime(post.content || '');

  return (
    <Link href={`/news/${post.slug}`} className="group block h-full">
      <div className="h-full rounded-xl shadow-sm border border-gray-100 dark:border-slate-700 bg-white dark:bg-slate-900 overflow-hidden cursor-pointer transition-colors hover:border-primary/30">
        {post.coverImageUrl && (
          <div className="relative overflow-hidden h-36">
            <Image
              src={post.coverImageUrl}
              alt={post.title}
              fill
              sizes="(max-width: 768px) 100vw, 33vw"
              className="object-cover transition duration-200 group-hover:scale-[1.03]"
              unoptimized
            />
          </div>
        )}
        <div className="p-3">
          <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
            {post.isPinned && (
              <span className="flex items-center gap-1 text-[10px] font-semibold text-primary bg-primary/10 px-1.5 py-0.5 rounded-full">
                <Pin className="h-2.5 w-2.5 flex-shrink-0" />
                Epingle
              </span>
            )}
            {post.category && (
              <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${getCategoryColor(post.category)}`}>
                {post.category}
              </span>
            )}
            <span className="flex items-center gap-0.5 text-[10px] text-seal-gray-500/70 dark:text-slate-500">
              <Clock className="h-2.5 w-2.5" />
              {readingTime} min
            </span>
            {(post.viewCount ?? post._count?.views) !== undefined && (
              <span className="flex items-center gap-0.5 text-[10px] text-seal-gray-500/70 dark:text-slate-500">
                <Eye className="h-2.5 w-2.5" />
                {post.viewCount ?? post._count?.views}
              </span>
            )}
            {onPin && (
              <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); onPin(post.id, !post.isPinned); }}
                className={`ml-auto p-0.5 rounded transition duration-200 ${post.isPinned ? 'text-primary hover:text-primary/70' : 'text-seal-gray-500/30 hover:text-primary'}`}
                title={post.isPinned ? 'Désépingler' : 'Épingler'}
                aria-label={post.isPinned ? `Désépingler "${post.title}"` : `Épingler "${post.title}"`}
                aria-pressed={!!post.isPinned}>
                <Pin className="h-3 w-3" />
              </button>
            )}
          </div>
          <h3 className="text-sm font-medium text-seal-navy dark:text-white line-clamp-2 transition duration-200 group-hover:text-primary">{post.title}</h3>
          {post.excerpt && (
            <p className="text-xs text-gray-500 dark:text-slate-400 line-clamp-2 mt-1">{post.excerpt}</p>
          )}
          <div className="flex items-center gap-2 mt-2.5 pt-2.5 border-t border-gray-50 dark:border-slate-800 text-[11px] text-seal-gray-500 dark:text-slate-400">
            <span className="flex items-center gap-1">
              <span className="inline-flex items-center justify-center h-4 w-4 rounded-full bg-primary/10 text-primary text-[8px] font-medium flex-shrink-0">
                {initials}
              </span>
              {post.author.firstName} {post.author.lastName}
            </span>
            <span className="flex items-center gap-1 ml-auto">
              <Calendar className="h-2.5 w-2.5" />
              {formatDate(post.publishedAt)}
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}
