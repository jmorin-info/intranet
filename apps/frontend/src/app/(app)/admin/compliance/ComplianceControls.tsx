'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { api } from '@/lib/api';
import { useTranslation } from '@/lib/i18n';
import { toast } from 'sonner';
import { useDebounce } from '@/hooks/use-debounce';
import { useAuthStore } from '@/stores/auth-store';
import {
  Card,
  CardContent,
  DataTable,
  SearchInput,
  Select,
  Badge,
  Button,
  Input,
  ConfirmDialog,
} from '@omnitech/ui';
import type { Column } from '@omnitech/ui';
import Link from 'next/link';
import { Shield, Plus, Pencil, Trash2, X, FileText, ChevronDown, ChevronRight, CheckCircle2, AlertTriangle, XCircle } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';

interface IsoControl {
  id: string;
  code: string;
  title: string;
  titleFr: string;
  domain: string;
  _count?: { documents: number };
}

export function ComplianceControls() {
  const { t } = useTranslation();
  const user = useAuthStore(s => s.user);
  const isSuperAdmin = user?.role === 'SUPER_ADMIN';
  const [controls, setControls] = useState<IsoControl[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [domain, setDomain] = useState('');
  const debouncedSearch = useDebounce(search, 300);
  const [showCreate, setShowCreate] = useState(false);
  const [createCode, setCreateCode] = useState('');
  const [createTitle, setCreateTitle] = useState('');
  const [createDomain, setCreateDomain] = useState('');
  const [creating, setCreating] = useState(false);
  const [deleteControl, setDeleteControl] = useState<{ id: string; code: string } | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editCode, setEditCode] = useState('');
  const [editTitle, setEditTitle] = useState('');
  const [editDomain, setEditDomain] = useState('');
  const [collapsedDomains, setCollapsedDomains] = useState<Set<string>>(new Set());
  const [viewGrouped, setViewGrouped] = useState(false);
  const [coverageFilter, setCoverageFilter] = useState<'' | 'covered' | 'partial' | 'uncovered'>('');

  const domainOptions = [
    { value: 'A.5', label: t('isoControls.domain.a5') },
    { value: 'A.6', label: t('isoControls.domain.a6') },
    { value: 'A.7', label: t('isoControls.domain.a7') },
    { value: 'A.8', label: t('isoControls.domain.a8') },
  ];

  /** Coverage classification based on document count */
  const getCoverage = (c: IsoControl): 'covered' | 'partial' | 'uncovered' => {
    const count = c._count?.documents ?? 0;
    if (count === 0) return 'uncovered';
    if (count === 1) return 'partial';
    return 'covered';
  };

  const coverageIcon = (c: IsoControl) => {
    const cov = getCoverage(c);
    switch (cov) {
      case 'covered': return <CheckCircle2 className="h-4 w-4 text-emerald-600" />;
      case 'partial': return <AlertTriangle className="h-4 w-4 text-amber-600" />;
      case 'uncovered': return <XCircle className="h-4 w-4 text-red-500" />;
    }
  };

  const filteredControls = controls.filter((c) => {
    if (!coverageFilter) return true;
    return getCoverage(c) === coverageFilter;
  });

  const fetchControls = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string | number> = { limit: 100 };
      if (debouncedSearch) params.search = debouncedSearch;
      if (domain) params.domain = domain;
      const { data } = await api.get('/iso-controls', { params });
      setControls(Array.isArray(data) ? data : data?.data || []);
    } catch {
      setControls([]);
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, domain]);

  useEffect(() => {
    fetchControls();
  }, [fetchControls]);

  const handleCreate = async () => {
    if (!createCode || !createTitle || !createDomain) {
      toast.error(t('isoControls.allFieldsRequired'));
      return;
    }
    setCreating(true);
    try {
      await api.post('/iso-controls', { code: createCode, title: createTitle, domain: createDomain });
      toast.success(t('isoControls.created'));
      setShowCreate(false);
      setCreateCode('');
      setCreateTitle('');
      setCreateDomain('');
      fetchControls();
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } };
      toast.error(err.response?.data?.message || t('isoControls.createError'));
    } finally {
      setCreating(false);
    }
  };

  const handleEdit = async (id: string) => {
    try {
      await api.patch(`/iso-controls/${id}`, { code: editCode, title: editTitle, domain: editDomain });
      toast.success(t('isoControls.updated'));
      setEditingId(null);
      fetchControls();
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } };
      toast.error(err.response?.data?.message || t('isoControls.updateError'));
    }
  };

  const handleDelete = async () => {
    if (!deleteControl) return;
    try {
      await api.delete(`/iso-controls/${deleteControl.id}`);
      toast.success(t('isoControls.deleted'));
      setDeleteControl(null);
      fetchControls();
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } };
      toast.error(err.response?.data?.message || t('isoControls.deleteError'));
    }
  };

  const startEdit = (c: IsoControl) => {
    setEditingId(c.id);
    setEditCode(c.code);
    setEditTitle(c.title);
    setEditDomain(c.domain);
  };

  const domainColor = (d: string) => {
    if (d.startsWith('A.5')) return 'primary';
    if (d.startsWith('A.6')) return 'info';
    if (d.startsWith('A.7')) return 'warning';
    if (d.startsWith('A.8')) return 'navy';
    return 'info';
  };

  const columns: Column<IsoControl>[] = [
    {
      key: 'id' as keyof IsoControl,
      header: '',
      className: 'w-10',
      render: (c) => coverageIcon(c),
    },
    {
      key: 'code',
      header: t('isoControls.header.code'),
      sortable: true,
      className: 'w-24',
      render: (c) => (
        <span className="font-mono text-sm font-semibold text-seal-navy dark:text-white">{c.code}</span>
      ),
    },
    {
      key: 'title',
      header: t('isoControls.header.title'),
      render: (c) => (
        <div>
          <span className="text-sm text-seal-navy dark:text-white">{c.titleFr || c.title}</span>
          {c.titleFr && (
            <span className="block text-xs text-seal-gray-500 dark:text-slate-400">{c.title}</span>
          )}
        </div>
      ),
    },
    {
      key: 'domain',
      header: t('isoControls.header.domain'),
      render: (c) => (
        <Badge variant={domainColor(c.domain) as 'primary' | 'info' | 'warning' | 'navy'}>
          {c.domain}
        </Badge>
      ),
    },
    {
      key: 'documents',
      header: t('isoControls.header.documents'),
      className: 'w-32 text-center',
      render: (c) => {
        const count = c._count?.documents ?? 0;
        return (
          <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${
            count > 0
              ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
              : 'bg-gray-100 text-gray-500 dark:bg-slate-700 dark:text-slate-400'
          }`}>
            <FileText className="h-3 w-3" />
            {count}
          </span>
        );
      },
    },
    ...(isSuperAdmin
      ? [
          {
            key: 'actions' as keyof IsoControl,
            header: t('isoControls.header.actions'),
            className: 'w-24',
            render: (c: IsoControl) =>
              editingId === c.id ? (
                <div className="flex items-center gap-1">
                  <Button size="sm" onClick={() => handleEdit(c.id)}>OK</Button>
                  <Button size="sm" variant="outline" onClick={() => setEditingId(null)}><X className="h-3 w-3" /></Button>
                </div>
              ) : (
                <div className="flex items-center gap-1">
                  <Button size="sm" variant="outline" onClick={() => startEdit(c)}>
                    <Pencil className="h-3 w-3" />
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setDeleteControl({ id: c.id, code: c.code })}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              ),
          },
        ]
      : []),
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('isoControls.title')}
        subtitle={t('isoControls.subtitle')}
        icon={Shield}
        hub="admin"
        actions={isSuperAdmin ? (
          <Button onClick={() => setShowCreate(!showCreate)}>
            <Plus className="h-4 w-4" /> {t('isoControls.add')}
          </Button>
        ) : undefined}
      />

      {showCreate && (
        <Card>
          <CardContent>
            <div className="flex gap-3 items-end">
              <Input
                label={t('isoControls.label.code')}
                value={createCode}
                onChange={(e) => setCreateCode(e.target.value)}
                placeholder="A.5.1"
                className="w-32"
              />
              <Input
                label={t('isoControls.label.title')}
                value={createTitle}
                onChange={(e) => setCreateTitle(e.target.value)}
                placeholder={t('isoControls.titlePlaceholder')}
                className="flex-1"
              />
              <Select
                options={domainOptions}
                value={createDomain}
                onChange={(e) => setCreateDomain(e.target.value)}
                placeholder={t('isoControls.label.domain')}
                className="w-64"
              />
              <Button onClick={handleCreate} loading={creating}>{t('common.create')}</Button>
              <Button variant="outline" onClick={() => setShowCreate(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent>
          <div className="flex gap-3">
            <SearchInput
              value={search}
              onChange={setSearch}
              placeholder={t('isoControls.searchPlaceholder')}
              className="flex-1"
            />
            <Select
              options={domainOptions}
              placeholder={t('isoControls.allDomains')}
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              className="w-64"
            />
            <Select
              options={[
                { value: 'covered', label: 'Couvert' },
                { value: 'partial', label: 'Partiel' },
                { value: 'uncovered', label: 'Non couvert' },
              ]}
              placeholder="Couverture"
              value={coverageFilter}
              onChange={(e) => setCoverageFilter(e.target.value as '' | 'covered' | 'partial' | 'uncovered')}
              className="w-48"
            />
          </div>
        </CardContent>
      </Card>

      {/* View toggle */}
      <div className="flex justify-end">
        <div className="inline-flex rounded-lg border border-gray-200 dark:border-slate-700 overflow-hidden">
          <button
            onClick={() => setViewGrouped(false)}
            className={`px-3 py-1.5 text-xs font-medium transition-colors duration-200 ${!viewGrouped ? 'bg-primary text-white' : 'text-seal-gray-500 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-800'}`}
          >
            Table
          </button>
          <button
            onClick={() => setViewGrouped(true)}
            className={`px-3 py-1.5 text-xs font-medium transition-colors duration-200 ${viewGrouped ? 'bg-primary text-white' : 'text-seal-gray-500 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-800'}`}
          >
            Par domaine
          </button>
        </div>
      </div>

      {viewGrouped ? (
        <div className="space-y-3">
          {(() => {
            const grouped: Record<string, IsoControl[]> = {};
            filteredControls.forEach(c => {
              const d = c.domain || 'Autre';
              if (!grouped[d]) grouped[d] = [];
              grouped[d].push(c);
            });
            return Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b)).map(([domainKey, items]) => {
              const isCollapsed = collapsedDomains.has(domainKey);
              const coveredCount = items.filter(c => (c._count?.documents ?? 0) > 0).length;
              return (
                <Card key={domainKey} className="shadow-sm rounded-xl overflow-hidden">
                  <button
                    onClick={() => setCollapsedDomains(prev => {
                      const next = new Set(prev);
                      if (next.has(domainKey)) next.delete(domainKey);
                      else next.add(domainKey);
                      return next;
                    })}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors duration-200"
                  >
                    {isCollapsed ? <ChevronRight className="h-4 w-4 text-seal-gray-500" /> : <ChevronDown className="h-4 w-4 text-seal-gray-500" />}
                    <Badge variant={domainColor(domainKey) as 'primary' | 'info' | 'warning' | 'navy'}>{domainKey}</Badge>
                    <span className="text-sm font-medium text-seal-navy dark:text-white">
                      {domainOptions.find(d => d.value === domainKey)?.label || domainKey}
                    </span>
                    <span className="ml-auto text-xs text-seal-gray-500 dark:text-slate-400">{coveredCount}/{items.length} couverts</span>
                    <div className="w-16 h-1.5 rounded-full bg-gray-200 dark:bg-slate-700 overflow-hidden">
                      <div className="h-full rounded-full bg-emerald-500 transition-all duration-500" style={{ width: `${items.length > 0 ? (coveredCount / items.length) * 100 : 0}%` }} />
                    </div>
                  </button>
                  {!isCollapsed && (
                    <CardContent className="pt-0 pb-2">
                      <div className="divide-y divide-gray-100 dark:divide-slate-700">
                        {items.map(c => {
                          const docCount = c._count?.documents ?? 0;
                          return (
                            <div key={c.id} className="flex items-center gap-3 py-2 px-1">
                              {coverageIcon(c)}
                              <span className="font-mono text-sm font-medium text-seal-navy dark:text-white w-16">{c.code}</span>
                              <span className="text-sm text-gray-700 dark:text-slate-300 flex-1">{c.titleFr || c.title}</span>
                              {docCount > 0 ? (
                                <Link
                                  href={`/admin/compliance?tab=overview&search=${encodeURIComponent(c.code)}`}
                                  className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 transition-colors"
                                >
                                  <FileText className="h-3 w-3" />
                                  {docCount} doc{docCount !== 1 ? 's' : ''}
                                </Link>
                              ) : (
                                <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium bg-gray-100 text-gray-500 dark:bg-slate-700 dark:text-slate-400">
                                  <FileText className="h-3 w-3" />
                                  0
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </CardContent>
                  )}
                </Card>
              );
            });
          })()}
        </div>
      ) : (
      <DataTable
        columns={columns}
        data={filteredControls}
        keyExtractor={(c) => c.id}
        loading={loading}
        emptyMessage={t('isoControls.empty')}
        emptyIcon={<Shield className="h-12 w-12 text-seal-gray-500 dark:text-slate-500" />}
      />
      )}

      <ConfirmDialog
        open={!!deleteControl}
        onClose={() => setDeleteControl(null)}
        onConfirm={handleDelete}
        title="Supprimer le contrôle"
        description={`Supprimer le contrôle ${deleteControl?.code} ? Les liens avec les documents seront également supprimés.`}
        confirmLabel="Supprimer"
        variant="danger"
      />
    </div>
  );
}
