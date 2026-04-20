'use client';

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useDebounce } from '@/hooks/use-debounce';
import { useTranslation } from '@/lib/i18n';
import { DOCUMENT_CATEGORY_LABELS, DocumentCategory } from '@omnitech/shared';
import {
  Card,
  CardContent,
  StatusBadge,
  IsoControlBadge,
  Badge,
  Button,
  SearchInput,
  Select,
  EmptyState,
} from '@omnitech/ui';
import { formatDate } from '@/lib/utils';
import { FileText, BookOpen, Download, LayoutGrid, List, Plus, BarChart3, ClipboardList } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';

interface Procedure {
  id: string;
  title: string;
  reference: string;
  description: string | null;
  category: string;
  classification?: string | null;
  status: string;
  updatedAt: string;
  owner: { firstName: string; lastName: string };
  isoControls: Array<{ isoControl: { code: string; title: string; titleFr?: string } }>;
  currentVersion?: { fileType: string; fileSizeBytes: number };
}

const CLASSIFICATION_COLORS: Record<string, { bg: string; text: string }> = {
  CONFIDENTIEL: { bg: 'bg-amber-100 dark:bg-amber-900/30', text: 'text-amber-700 dark:text-amber-400' },
  INTERNE: { bg: 'bg-blue-100 dark:bg-blue-900/30', text: 'text-blue-700 dark:text-blue-400' },
  PUBLIC: { bg: 'bg-green-100 dark:bg-green-900/30', text: 'text-green-700 dark:text-green-400' },
  RESTREINT: { bg: 'bg-red-100 dark:bg-red-900/30', text: 'text-red-700 dark:text-red-400' },
};

export default function ProceduresPage() {
  const { t } = useTranslation();
  const [procedures, setProcedures] = useState<Procedure[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<string>('PROCEDURE');
  const [sortBy, setSortBy] = useState('updatedAt');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const debouncedSearch = useDebounce(search, 300);

  const fetchProcedures = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string | number> = {
        status: 'APPROVED',
        limit: 50,
        sortBy: 'title',
        sortOrder: 'asc',
      };
      if (debouncedSearch) params.search = debouncedSearch;
      if (category) params.category = category;

      const { data } = await api.get('/documents', { params });
      setProcedures(data?.data || []);
    } catch {
      setProcedures([]);
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, category]);

  useEffect(() => {
    fetchProcedures();
  }, [fetchProcedures]);

  const categoryOptions = Object.entries(DOCUMENT_CATEGORY_LABELS).map(([value, label]) => ({
    value,
    label,
  }));

  const getCategoryBadgeVariant = (cat: string): 'navy' | 'info' | 'approved' | 'draft' => {
    switch (cat) {
      case 'POLICY': return 'navy';
      case 'PROCEDURE': return 'info';
      case 'FORM': return 'approved';
      default: return 'draft';
    }
  };

  const sorted = [...procedures].sort((a, b) => {
    if (sortBy === 'title') return a.title.localeCompare(b.title);
    if (sortBy === 'category') return (a.category || '').localeCompare(b.category || '');
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  });

  const domainStats = useMemo(() => {
    const domainMap: Record<string, number> = {};
    procedures.forEach((proc) => {
      const label = DOCUMENT_CATEGORY_LABELS[proc.category as keyof typeof DOCUMENT_CATEGORY_LABELS] || proc.category;
      domainMap[label] = (domainMap[label] || 0) + 1;
    });
    return Object.entries(domainMap).sort((a, b) => b[1] - a[1]);
  }, [procedures]);

  const getFileIcon = (fileType?: string) => {
    if (!fileType) return 'DOC';
    if (fileType.includes('pdf')) return 'PDF';
    if (fileType.includes('word') || fileType.includes('docx')) return 'DOCX';
    if (fileType.includes('sheet') || fileType.includes('xlsx')) return 'XLSX';
    return 'DOC';
  };

  const getClassificationBadge = (classification?: string | null) => {
    if (!classification) return null;
    const colors = CLASSIFICATION_COLORS[classification] ?? CLASSIFICATION_COLORS.INTERNE ?? { bg: 'bg-gray-100', text: 'text-gray-600' };
    return (
      <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase tracking-wider ${colors.bg} ${colors.text}`}>
        {classification}
      </span>
    );
  };

  return (
    <div className="space-y-6 animate-fade-in-up">
      <PageHeader
        title={t('procedures.title')}
        subtitle={`${t('procedures.subtitle')}${!loading && procedures.length > 0 ? ` — ${procedures.length} procedure${procedures.length > 1 ? 's' : ''} disponible${procedures.length > 1 ? 's' : ''}` : ''}`}
        icon={ClipboardList}
        hub="work"
        actions={
          <div className="flex items-center gap-3">
            <Link href={`/documents/new?category=${category || 'PROCEDURE'}`}>
              <Button>
                <Plus className="h-4 w-4" />
                {category === 'PROCEDURE' || !category ? 'Nouvelle procédure' : `Nouveau ${DOCUMENT_CATEGORY_LABELS[category as DocumentCategory]?.toLowerCase() || 'document'}`}
              </Button>
            </Link>
            <div className="flex items-center gap-1 bg-gray-100 dark:bg-slate-800 rounded-lg p-1">
              <button
                onClick={() => setViewMode('grid')}
                className={`p-1.5 rounded-md transition ${viewMode === 'grid' ? 'bg-white dark:bg-slate-700 shadow-sm text-navy dark:text-white' : 'text-seal-gray-500 dark:text-slate-400 hover:text-navy dark:hover:text-white'}`}
                title="Vue grille"
            aria-label="Afficher en vue grille"
          >
            <LayoutGrid className="h-4 w-4" />
          </button>
          <button
            onClick={() => setViewMode('list')}
            className={`p-1.5 rounded-md transition ${viewMode === 'list' ? 'bg-white dark:bg-slate-700 shadow-sm text-navy dark:text-white' : 'text-seal-gray-500 dark:text-slate-400 hover:text-navy dark:hover:text-white'}`}
            title="Vue liste"
            aria-label="Afficher en vue liste"
          >
            <List className="h-4 w-4" />
          </button>
            </div>
          </div>
        }
      />

      {/* Filters */}
      <Card>
        <CardContent>
          <div className="flex gap-3">
            <SearchInput
              value={search}
              onChange={setSearch}
              placeholder={t('procedures.searchPlaceholder')}
              className="flex-1"
            />
            <Select
              options={categoryOptions}
              placeholder={t('procedures.allCategories')}
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-48"
            />
            <Select
              options={[
                { value: 'updatedAt', label: t('procedures.sort.recent') },
                { value: 'title', label: t('procedures.sort.titleAz') },
                { value: 'category', label: t('procedures.sort.category') },
              ]}
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="w-40"
            />
          </div>
        </CardContent>
      </Card>

      {/* Domain stats bar */}
      {!loading && domainStats.length > 0 && (
        <div className="flex items-center gap-3 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-lg px-4 py-2.5 overflow-x-auto">
          <BarChart3 className="h-4 w-4 text-seal-gray-500 dark:text-slate-400 flex-shrink-0" />
          <span className="text-xs font-semibold text-seal-gray-500 dark:text-slate-400 flex-shrink-0">Par type :</span>
          {domainStats.map(([label, count]) => (
            <span
              key={label}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-gray-100 dark:bg-slate-800 text-xs font-medium text-navy dark:text-white flex-shrink-0"
            >
              {label}
              <span className="bg-primary/10 text-primary px-1.5 py-0.5 rounded-full text-[10px] font-semibold">{count}</span>
            </span>
          ))}
        </div>
      )}

      {/* Content */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="rounded-xl border border-gray-100 dark:border-slate-700 bg-white dark:bg-slate-900 p-5 space-y-3"
            >
              <div className="flex items-start gap-3">
                <div className="h-10 w-10 rounded-lg shimmer flex-shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-4/5 rounded shimmer" />
                  <div className="h-3 w-1/3 rounded shimmer" />
                </div>
              </div>
              <div className="h-3 w-full rounded shimmer" />
              <div className="h-3 w-5/6 rounded shimmer" />
              <div className="flex gap-2 pt-1">
                <div className="h-5 w-16 rounded-full shimmer" />
                <div className="h-5 w-20 rounded-full shimmer" />
              </div>
              <div className="pt-3 border-t border-gray-100 dark:border-slate-700 flex items-center justify-between">
                <div className="h-5 w-20 rounded-full shimmer" />
                <div className="h-3 w-16 rounded shimmer" />
              </div>
            </div>
          ))}
        </div>
      ) : procedures.length === 0 ? (
        <EmptyState
          type="documents"
          title={t('procedures.empty.title')}
          description={t('procedures.empty.description')}
        />
      ) : viewMode === 'grid' ? (
        /* Grid View */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {sorted.map((proc) => (
            <Link key={proc.id} href={`/procedures/${proc.id}`} className="stagger-item block">
              <div
                className="relative"
                onMouseEnter={() => setHoveredId(proc.id)}
                onMouseLeave={() => setHoveredId(null)}
              >
                <Card hoverable accent className="h-full">
                  <CardContent className="flex flex-col h-full">
                    <div className="flex items-start gap-3 mb-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-light text-xs font-semibold text-primary flex-shrink-0">
                        {getFileIcon(proc.currentVersion?.fileType)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-navy dark:text-white line-clamp-2">
                          {proc.title}
                        </p>
                        <p className="text-xs font-mono text-seal-gray-500 dark:text-slate-400 mt-0.5">
                          {proc.reference}
                        </p>
                      </div>
                    </div>

                    {proc.description && (
                      <p className="text-xs text-gray-600 dark:text-slate-300 line-clamp-2 mb-3">
                        {proc.description}
                      </p>
                    )}

                    <div className="flex flex-wrap gap-1 mb-3">
                      {getClassificationBadge(proc.classification)}
                      {proc.isoControls.slice(0, 3).map(({ isoControl }) => (
                        <IsoControlBadge
                          key={isoControl.code}
                          code={isoControl.code}
                          title={isoControl.titleFr || isoControl.title}
                        />
                      ))}
                    </div>

                    <div className="mt-auto pt-3 border-t border-gray-100 dark:border-slate-700 space-y-2">
                      <div className="flex items-center justify-between">
                        <Badge variant={getCategoryBadgeVariant(proc.category)}>
                          {DOCUMENT_CATEGORY_LABELS[proc.category as DocumentCategory]}
                        </Badge>
                        <span className="text-[10px] text-seal-gray-500 dark:text-slate-400" title={t('procedures.updated')}>
                          {t('procedures.updated')} {formatDate(proc.updatedAt)}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="inline-flex items-center justify-center h-5 w-5 rounded-full bg-primary/10 text-primary text-[8px] font-semibold flex-shrink-0">
                          {`${proc.owner.firstName[0] || ''}${proc.owner.lastName[0] || ''}`.toUpperCase()}
                        </span>
                        <span className="text-[10px] text-seal-gray-500 dark:text-slate-500 truncate">
                          {proc.owner.firstName} {proc.owner.lastName}
                        </span>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Hover preview tooltip */}
                {hoveredId === proc.id && proc.description && (
                  <div className="absolute z-20 left-1/2 -translate-x-1/2 bottom-full mb-2 w-72 bg-white dark:bg-slate-800 rounded-lg shadow-xl border border-gray-200 dark:border-slate-600 p-3 pointer-events-none">
                    <p className="text-xs font-semibold text-navy dark:text-white mb-1">{proc.title}</p>
                    <p className="text-[11px] text-gray-600 dark:text-slate-300 leading-relaxed">{proc.description}</p>
                    <p className="text-[10px] text-seal-gray-500 dark:text-slate-500 mt-2">
                      Dernière mise à jour : {formatDate(proc.updatedAt)}
                    </p>
                    <div className="absolute left-1/2 -translate-x-1/2 top-full w-2 h-2 bg-white dark:bg-slate-800 border-b border-r border-gray-200 dark:border-slate-600 rotate-45 -mt-1" />
                  </div>
                )}
              </div>
            </Link>
          ))}
        </div>
      ) : (
        /* List View */
        <Card>
          <div className="divide-y divide-gray-100 dark:divide-slate-700">
            {sorted.map((proc) => (
              <Link key={proc.id} href={`/procedures/${proc.id}`}>
                <div className="flex items-center gap-4 px-5 py-3.5 hover:bg-gray-50 dark:hover:bg-slate-800/50 transition-colors">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-light text-xs font-semibold text-primary flex-shrink-0">
                    {getFileIcon(proc.currentVersion?.fileType)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-navy dark:text-white truncate">{proc.title}</p>
                    <p className="text-xs text-seal-gray-500 dark:text-slate-400 font-mono">{proc.reference}</p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {getClassificationBadge(proc.classification)}
                    <Badge variant={getCategoryBadgeVariant(proc.category)}>
                      {DOCUMENT_CATEGORY_LABELS[proc.category as DocumentCategory]}
                    </Badge>
                    {proc.isoControls.slice(0, 2).map(({ isoControl }) => (
                      <IsoControlBadge
                        key={isoControl.code}
                        code={isoControl.code}
                        title={isoControl.titleFr || isoControl.title}
                      />
                    ))}
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <span className="inline-flex items-center justify-center h-5 w-5 rounded-full bg-primary/10 text-primary text-[8px] font-semibold flex-shrink-0">
                      {`${proc.owner.firstName[0] || ''}${proc.owner.lastName[0] || ''}`.toUpperCase()}
                    </span>
                  </div>
                  <span className="text-[10px] text-seal-gray-500 dark:text-slate-400 flex-shrink-0 w-20 text-right">
                    {formatDate(proc.updatedAt)}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
