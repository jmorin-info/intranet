'use client';

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { api } from '@/lib/api';
import { toast } from 'sonner';
import {
  Card,
  CardContent,
  Button,
  Badge,
  Dialog,
  Skeleton,
  EmptyState,
  Input,
  Select,
  DataTable,
  ConfirmDialog,
  type Column,
} from '@omnitech/ui';
import { PageHeader } from '@/components/layout/page-header';
import { ExportButton } from '@/components/ui/export-button';
import { formatDate } from '@/lib/utils';
import { useTranslation } from '@/lib/i18n';
import { certificateAssetUrl } from '@/lib/private-asset-url';
import {
  Award,
  Plus,
  Pencil,
  Trash2,
  Download,
  Search,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  FileText,
  UserPlus,
  Upload,
  RefreshCw,
  ShieldCheck,
  ExternalLink,
  Info,
  Eye,
  Image as ImageIcon,
} from 'lucide-react';
import dynamic from 'next/dynamic';

const AdminGroupTabs = dynamic(
  () => import('@/components/layout/admin-group-tabs').then((m) => ({ default: m.AdminGroupTabs })),
  { ssr: false, loading: () => <div className="shimmer h-20 rounded-xl" /> },
);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Certificate {
  id: string;
  name: string;
  certType: string;
  obtainedAt: string;
  expiresAt: string | null;
  fileUrl: string | null;
  fileName?: string | null;
  thumbnailUrl: string | null;
  notes: string | null;
  isExternal: boolean;
  user?: { id: string; firstName: string; lastName: string; email: string };
  externalPerson?: { id: string; firstName: string; lastName: string; company: string };
}

interface CertStats {
  total: number;
  valid: number;
  expired: number;
  expiringIn30Days: number;
}

interface DirectoryUser {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
}

interface ExternalPerson {
  id: string;
  firstName: string;
  lastName: string;
  company: string;
  email: string | null;
}

interface KB4Account {
  name: string;
  type: string;
  number_of_seats: number;
  current_risk_score: number;
  subscription_end_date: string;
}

interface KB4Campaign {
  campaign_id: number;
  name: string;
  status: string;
  modules: { name: string }[];
}

type CertStatus = 'valid' | 'expiring' | 'expired';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getCertStatus(expiresAt: string | null): CertStatus {
  if (!expiresAt) return 'valid';
  const now = new Date();
  const exp = new Date(expiresAt);
  if (exp < now) return 'expired';
  const diffMs = exp.getTime() - now.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);
  if (diffDays <= 30) return 'expiring';
  return 'valid';
}

function statusBadge(status: CertStatus) {
  switch (status) {
    case 'valid':
      return <Badge variant="success">Valide</Badge>;
    case 'expiring':
      return <Badge variant="warning">Expire bientot</Badge>;
    case 'expired':
      return <Badge variant="error">Expire</Badge>;
  }
}

const CERTIFICATION_SUGGESTIONS = [
  'ISO 27001 Lead Auditor',
  'ISO 27001 Lead Implementer',
  'CISSP',
  'CEH',
  'CompTIA Security+',
  'OSCP',
  'CISM',
  'CISA',
  'CCSP',
  'CRISC',
  'ISO 22301',
  'PCI DSS',
  'GDPR DPO',
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function AdminCertificatesPage() {
  const { t } = useTranslation();

  // Data
  const [certificates, setCertificates] = useState<Certificate[]>([]);
  const [stats, setStats] = useState<CertStats>({ total: 0, valid: 0, expired: 0, expiringIn30Days: 0 });
  const [users, setUsers] = useState<DirectoryUser[]>([]);
  const [externalPersons, setExternalPersons] = useState<ExternalPerson[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterStatus, setFilterStatus] = useState<'' | 'valid' | 'expired'>('');
  const [filterUserId, setFilterUserId] = useState('');

  // Dialog states
  const [showFormDialog, setShowFormDialog] = useState(false);
  const [editingCert, setEditingCert] = useState<Certificate | null>(null);
  const [deletingCertId, setDeletingCertId] = useState<string | null>(null);

  // Form fields
  const [formIsExternal, setFormIsExternal] = useState(false);
  const [formUserId, setFormUserId] = useState('');
  const [formExternalPersonId, setFormExternalPersonId] = useState('');
  const [formName, setFormTrainingName] = useState('');
  const [formCertType, setFormCertType] = useState('');
  const [formObtainedAt, setFormObtainedAt] = useState('');
  const [formExpiresAt, setFormExpiresAt] = useState('');
  const [formFile, setFormFile] = useState<File | null>(null);
  const [formNotes, setFormNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // External person inline creation
  const [showNewExternalDialog, setShowNewExternalDialog] = useState(false);
  const [newExtFirstName, setNewExtFirstName] = useState('');
  const [newExtLastName, setNewExtLastName] = useState('');
  const [newExtCompany, setNewExtCompany] = useState('');
  const [newExtEmail, setNewExtEmail] = useState('');
  const [creatingExternal, setCreatingExternal] = useState(false);

  // External persons editing
  const [editingExternal, setEditingExternal] = useState<ExternalPerson | null>(null);
  const [deletingExternalId, setDeletingExternalId] = useState<string | null>(null);

  // KnowBe4 state
  const [kb4Account, setKb4Account] = useState<KB4Account | null>(null);
  const [kb4Campaigns, setKb4Campaigns] = useState<KB4Campaign[]>([]);
  const [kb4Loading, setKb4Loading] = useState(false);
  const [kb4NotConfigured, setKb4NotConfigured] = useState(false);
  const [kb4Syncing, setKb4Syncing] = useState(false);

  // -------------------------------------------------------------------------
  // Fetch data
  // -------------------------------------------------------------------------

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const results = await Promise.allSettled([
      api.get('/certificates').catch(() => ({ data: [] })),
      api.get('/certificates/stats').catch(() => ({ data: { total: 0, valid: 0, expired: 0, expiringIn30Days: 0 } })),
      api.get('/users/directory').catch(() => ({ data: [] })),
      api.get('/external-persons').catch(() => ({ data: [] })),
    ]);

    if (results[0].status === 'fulfilled') {
      const d = results[0].value.data;
      setCertificates(Array.isArray(d) ? d : d?.data || []);
    }
    if (results[1].status === 'fulfilled') {
      setStats(results[1].value.data);
    }
    if (results[2].status === 'fulfilled') {
      const d = results[2].value.data;
      setUsers(Array.isArray(d) ? d : d?.data || []);
    }
    if (results[3].status === 'fulfilled') {
      const d = results[3].value.data;
      setExternalPersons(Array.isArray(d) ? d : d?.data || []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  // -------------------------------------------------------------------------
  // KnowBe4 data
  // -------------------------------------------------------------------------

  const fetchKB4 = useCallback(async () => {
    setKb4Loading(true);
    setKb4NotConfigured(false);
    try {
      const [accountRes, campaignsRes] = await Promise.allSettled([
        api.get('/knowbe4/account'),
        api.get('/knowbe4/campaigns'),
      ]);
      if (accountRes.status === 'fulfilled') {
        setKb4Account(accountRes.value.data);
      } else {
        const status = (accountRes.reason as { response?: { status?: number } })?.response?.status;
        if (status === 400 || status === 404 || status === 503) {
          setKb4NotConfigured(true);
        }
      }
      if (campaignsRes.status === 'fulfilled') {
        const d = campaignsRes.value.data;
        setKb4Campaigns(Array.isArray(d) ? d : d?.data || []);
      }
    } catch {
      setKb4NotConfigured(true);
    } finally {
      setKb4Loading(false);
    }
  }, []);

  useEffect(() => {
    fetchKB4();
  }, [fetchKB4]);

  const handleKB4Sync = async () => {
    setKb4Syncing(true);
    try {
      await api.post('/knowbe4/sync-certificates');
      toast.success('Synchronisation KnowBe4 terminée avec succès.');
      fetchAll();
      fetchKB4();
    } catch (err: unknown) {
      const message = (err as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Erreur lors de la synchronisation KnowBe4.';
      toast.error(message);
    } finally {
      setKb4Syncing(false);
    }
  };

  // -------------------------------------------------------------------------
  // Filtered certificates
  // -------------------------------------------------------------------------

  const filtered = useMemo(() => {
    let list = certificates;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.certType.toLowerCase().includes(q) ||
          c.user?.firstName.toLowerCase().includes(q) ||
          c.user?.lastName.toLowerCase().includes(q) ||
          c.externalPerson?.firstName.toLowerCase().includes(q) ||
          c.externalPerson?.lastName.toLowerCase().includes(q),
      );
    }
    if (filterType) {
      list = list.filter((c) => c.certType === filterType);
    }
    if (filterStatus === 'valid') {
      list = list.filter((c) => getCertStatus(c.expiresAt) !== 'expired');
    } else if (filterStatus === 'expired') {
      list = list.filter((c) => getCertStatus(c.expiresAt) === 'expired');
    }
    if (filterUserId) {
      list = list.filter((c) => c.user?.id === filterUserId);
    }
    return list;
  }, [certificates, searchQuery, filterType, filterStatus, filterUserId]);

  const certTypes = useMemo(() => {
    const set = new Set(certificates.map((c) => c.certType));
    return Array.from(set).sort();
  }, [certificates]);

  // -------------------------------------------------------------------------
  // Form helpers
  // -------------------------------------------------------------------------

  const resetForm = () => {
    setFormIsExternal(false);
    setFormUserId('');
    setFormExternalPersonId('');
    setFormTrainingName('');
    setFormCertType('');
    setFormObtainedAt('');
    setFormExpiresAt('');
    setFormFile(null);
    setFormNotes('');
    setEditingCert(null);
  };

  const openCreateDialog = () => {
    resetForm();
    setShowFormDialog(true);
  };

  const openEditDialog = (cert: Certificate) => {
    setEditingCert(cert);
    setFormIsExternal(cert.isExternal);
    setFormUserId(cert.user?.id || '');
    setFormExternalPersonId(cert.externalPerson?.id || '');
    setFormTrainingName(cert.name);
    setFormCertType(cert.certType);
    setFormObtainedAt(cert.obtainedAt ? cert.obtainedAt.slice(0, 10) : '');
    setFormExpiresAt(cert.expiresAt ? cert.expiresAt.slice(0, 10) : '');
    setFormNotes(cert.notes || '');
    setFormFile(null);
    setShowFormDialog(true);
  };

  const handleSubmitForm = async () => {
    if (!formName || !formCertType || !formObtainedAt) {
      toast.error('Veuillez remplir les champs obligatoires.');
      return;
    }
    if (!formIsExternal && !formUserId) {
      toast.error('Veuillez sélectionner un utilisateur.');
      return;
    }
    if (formIsExternal && !formExternalPersonId) {
      toast.error('Veuillez sélectionner une personne externe.');
      return;
    }

    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append('name', formName);
      formData.append('certType', formCertType);
      formData.append('obtainedAt', formObtainedAt);
      if (formExpiresAt) formData.append('expiresAt', formExpiresAt);
      if (formNotes) formData.append('notes', formNotes);
      formData.append('isExternal', String(formIsExternal));
      if (formIsExternal) {
        formData.append('externalPersonId', formExternalPersonId);
      } else {
        formData.append('userId', formUserId);
      }
      if (formFile) {
        formData.append('file', formFile);
      }

      if (editingCert) {
        await api.patch(`/certificates/${editingCert.id}`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        toast.success('Certificat mis à jour.');
      } else {
        await api.post('/certificates', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        toast.success('Certificat ajouté avec succès.');
      }

      setShowFormDialog(false);
      resetForm();
      fetchAll();
    } catch (err: unknown) {
      const message = (err as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Erreur lors de l\'enregistrement.';
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deletingCertId) return;
    try {
      await api.delete(`/certificates/${deletingCertId}`);
      toast.success('Certificat supprimé.');
      setDeletingCertId(null);
      fetchAll();
    } catch {
      toast.error('Erreur lors de la suppression.');
    }
  };

  // -------------------------------------------------------------------------
  // External persons
  // -------------------------------------------------------------------------

  const handleCreateExternalPerson = async () => {
    if (!newExtFirstName || !newExtLastName || !newExtCompany) {
      toast.error('Veuillez remplir les champs obligatoires.');
      return;
    }
    setCreatingExternal(true);
    try {
      const { data } = await api.post('/external-persons', {
        firstName: newExtFirstName,
        lastName: newExtLastName,
        company: newExtCompany,
        email: newExtEmail || undefined,
      });
      toast.success('Personne externe créée.');
      setExternalPersons((prev) => [...prev, data]);
      setFormExternalPersonId(data.id);
      setShowNewExternalDialog(false);
      setNewExtFirstName('');
      setNewExtLastName('');
      setNewExtCompany('');
      setNewExtEmail('');
    } catch {
      toast.error('Erreur lors de la création.');
    } finally {
      setCreatingExternal(false);
    }
  };

  const handleUpdateExternalPerson = async () => {
    if (!editingExternal) return;
    try {
      await api.patch(`/external-persons/${editingExternal.id}`, {
        firstName: editingExternal.firstName,
        lastName: editingExternal.lastName,
        company: editingExternal.company,
        email: editingExternal.email || undefined,
      });
      toast.success('Personne externe mise à jour.');
      setEditingExternal(null);
      fetchAll();
    } catch {
      toast.error('Erreur lors de la mise à jour.');
    }
  };

  const handleDeleteExternalPerson = async () => {
    if (!deletingExternalId) return;
    try {
      await api.delete(`/external-persons/${deletingExternalId}`);
      toast.success('Personne externe supprimée.');
      setDeletingExternalId(null);
      fetchAll();
    } catch {
      toast.error('Erreur lors de la suppression.');
    }
  };

  // -------------------------------------------------------------------------
  // DataTable columns
  // -------------------------------------------------------------------------

  const columns: Column<Certificate>[] = [
    {
      key: 'preview',
      header: 'Aperçu',
      className: 'w-[60px]',
      render: (cert) => {
        if (cert.thumbnailUrl) {
          return (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={certificateAssetUrl(cert.id, 'thumbnail')}
              alt=""
              className="h-10 w-10 rounded-md object-cover border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800"
            />
          );
        }
        const fileName = cert.fileName || cert.fileUrl || '';
        const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
        const isPdf = ext === 'pdf';
        const isImage = ['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(ext);
        const Icon = isPdf ? FileText : isImage ? ImageIcon : ShieldCheck;
        return (
          <div className="h-10 w-10 rounded-md flex items-center justify-center bg-gray-100 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 text-seal-gray-500 dark:text-slate-400">
            <Icon className="h-4 w-4" />
          </div>
        );
      },
    },
    {
      key: 'holder',
      header: 'Titulaire',
      render: (cert) =>
        cert.isExternal
          ? `${cert.externalPerson?.firstName || ''} ${cert.externalPerson?.lastName || ''} (ext.)`
          : `${cert.user?.firstName || ''} ${cert.user?.lastName || ''}`,
    },
    {
      key: 'name',
      header: 'Formation',
      render: (cert) => (
        <span className="font-medium text-seal-navy dark:text-white">{cert.name}</span>
      ),
    },
    {
      key: 'certType',
      header: 'Type',
    },
    {
      key: 'obtainedAt',
      header: 'Obtenu le',
      render: (cert) => formatDate(cert.obtainedAt),
    },
    {
      key: 'expiresAt',
      header: 'Expire le',
      render: (cert) => (cert.expiresAt ? formatDate(cert.expiresAt) : '—'),
    },
    {
      key: 'status',
      header: 'Statut',
      render: (cert) => statusBadge(getCertStatus(cert.expiresAt)),
    },
    {
      key: 'actions',
      header: 'Actions',
      className: 'text-right',
      render: (cert) => (
        <div className="flex items-center justify-end gap-1">
          {(() => {
            const kb4Match = (cert.notes ?? '').match(/enrollment #(\d+)/i);
            const kb4Url = kb4Match?.[1] ? `https://eu.knowbe4.com/enrollments/${kb4Match[1]}/certificate.pdf` : null;
            if (kb4Url) return (
              <a href={kb4Url} target="_blank" rel="noopener noreferrer" title="Voir le certificat KnowBe4 (PDF)" onClick={(e) => e.stopPropagation()}>
                <Button variant="ghost" size="sm" className="text-blue-600 hover:text-blue-700"><Eye className="h-3.5 w-3.5" /></Button>
              </a>
            );
            if (cert.fileUrl) return (
              <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); window.open(certificateAssetUrl(cert.id), '_blank', 'noopener,noreferrer'); }} title="Voir / Télécharger">
                <Eye className="h-3.5 w-3.5" />
              </Button>
            );
            return null;
          })()}
          {cert.fileUrl && (
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                window.open(certificateAssetUrl(cert.id), '_blank', 'noopener,noreferrer');
              }}
              title="Télécharger"
            >
              <Download className="h-3.5 w-3.5" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              openEditDialog(cert);
            }}
            title="Modifier"
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              setDeletingCertId(cert.id);
            }}
            title="Supprimer"
            className="text-red-500 hover:text-red-600"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      ),
    },
  ];

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  if (loading) {
    return (
      <div className="space-y-4 animate-fade-in-up">
        <Skeleton className="h-8 w-64 shimmer" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-24 rounded-xl shimmer" />
          ))}
        </div>
        <Skeleton className="h-64 rounded-xl shimmer" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in-up">
      <AdminGroupTabs group="identity" />
      <PageHeader
        title="Gestion des certifications"
        subtitle="Gérez les certificats de formation et certifications professionnelles."
        icon={Award}
        hub="admin"
        actions={
          <>
            <ExportButton
              filename="certifications"
              reportName="Registre des certifications de formation"
              rows={(filtered || []) as unknown as Array<Record<string, unknown>>}
              columns={[
                { header: 'Titulaire (Nom)', accessor: (r: Record<string, unknown>) => { const c = r as unknown as Certificate; return c.user ? c.user.lastName : c.externalPerson?.lastName ?? ''; } },
                { header: 'Titulaire (Prénom)', accessor: (r: Record<string, unknown>) => { const c = r as unknown as Certificate; return c.user ? c.user.firstName : c.externalPerson?.firstName ?? ''; } },
                { header: 'Email', accessor: (r: Record<string, unknown>) => { const c = r as unknown as Certificate; return c.user?.email ?? ''; } },
                { header: 'Type de personne', accessor: (r: Record<string, unknown>) => (r as unknown as Certificate).isExternal ? 'Externe' : 'Interne' },
                { header: 'Entreprise (si externe)', accessor: (r: Record<string, unknown>) => (r as unknown as Certificate).externalPerson?.company ?? '' },
                { header: 'Nom de la formation', accessor: (r: Record<string, unknown>) => String((r as unknown as Certificate).name || '') },
                { header: 'Type de certification', accessor: (r: Record<string, unknown>) => String((r as unknown as Certificate).certType || '') },
                { header: 'Date d\'obtention', accessor: (r: Record<string, unknown>) => (r as unknown as Certificate).obtainedAt || '' },
                { header: 'Date d\'expiration', accessor: (r: Record<string, unknown>) => (r as unknown as Certificate).expiresAt || '' },
                { header: 'Statut', accessor: (r: Record<string, unknown>) => { const c = r as unknown as Certificate; if (!c.expiresAt) return 'Valide (sans expiration)'; const exp = new Date(c.expiresAt); const now = new Date(); if (exp < now) return 'Expiré'; const diff = exp.getTime() - now.getTime(); return diff < 30 * 86400000 ? 'Expire bientôt' : 'Valide'; } },
                { header: 'Fichier joint', accessor: (r: Record<string, unknown>) => (r as unknown as Certificate).fileUrl ? 'Oui' : 'Non' },
                { header: 'Lien certificat', accessor: (r: Record<string, unknown>) => { const c = r as unknown as Certificate; if (c.fileUrl) return certificateAssetUrl(c.id); const m = (c.notes ?? '').match(/enrollment #(\d+)/i); return m?.[1] ? `https://eu.knowbe4.com/enrollments/${m[1]}/certificate.pdf` : ''; } },
                { header: 'Notes', accessor: (r: Record<string, unknown>) => String((r as unknown as Certificate).notes || '') },
              ]}
            />
            <Button onClick={openCreateDialog}>
              <Plus className="h-4 w-4 mr-1.5" />
              Ajouter un certificat
            </Button>
          </>
        }
      />

      {/* Stats cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {([
          { label: 'Total', value: stats.total, icon: FileText, color: 'text-seal-navy dark:text-white', bg: 'bg-gray-100 dark:bg-slate-800' },
          { label: 'Valides', value: stats.valid, icon: CheckCircle2, color: 'text-emerald-600', bg: 'bg-emerald-50 dark:bg-emerald-900/30' },
          { label: 'Expires', value: stats.expired, icon: XCircle, color: 'text-red-600', bg: 'bg-red-50 dark:bg-red-900/30' },
          { label: 'Expirent dans 30j', value: stats.expiringIn30Days, icon: AlertTriangle, color: 'text-amber-600', bg: 'bg-amber-50 dark:bg-amber-900/30' },
        ] as const).map((stat) => (
          <Card key={stat.label} className="stagger-item shadow-sm rounded-xl">
            <CardContent className="py-4">
              <div className={`h-10 w-10 rounded-xl ${stat.bg} flex items-center justify-center mb-2`}>
                <stat.icon className={`h-5 w-5 ${stat.color}`} />
              </div>
              <p className="text-2xl font-medium text-seal-navy dark:text-white">{stat.value}</p>
              <p className="text-xs text-seal-gray-500 dark:text-slate-400">{stat.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-seal-gray-500" />
          <Input
            placeholder="Rechercher..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
          options={[
            { value: '', label: 'Tous les types' },
            ...certTypes.map((ct) => ({ value: ct, label: ct })),
          ]}
        />
        <Select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value as '' | 'valid' | 'expired')}
          options={[
            { value: '', label: 'Tous les statuts' },
            { value: 'valid', label: 'Valide' },
            { value: 'expired', label: 'Expire' },
          ]}
        />
        <Select
          value={filterUserId}
          onChange={(e) => setFilterUserId(e.target.value)}
          options={[
            { value: '', label: 'Tous les utilisateurs' },
            ...users.map((u) => ({ value: u.id, label: `${u.firstName} ${u.lastName}` })),
          ]}
        />
      </div>

      {/* DataTable */}
      {filtered.length === 0 ? (
        <EmptyState
          type="general"
          title="Aucun certificat"
          description="Aucun certificat ne correspond a vos criteres de recherche."
        />
      ) : (
        <DataTable
          columns={columns}
          data={filtered}
          keyExtractor={(cert) => cert.id}
          emptyMessage="Aucun certificat trouve."
        />
      )}

      {/* Add/Edit Dialog */}
      <Dialog
        open={showFormDialog}
        onClose={() => {
          setShowFormDialog(false);
          resetForm();
        }}
        title={editingCert ? 'Modifier le certificat' : 'Ajouter un certificat'}
        description={editingCert ? 'Modifiez les informations du certificat.' : 'Renseignez les informations du nouveau certificat.'}
      >
        <div className="space-y-4">
          {/* Internal / External toggle */}
          <div>
            <label className="block text-sm font-semibold text-seal-navy dark:text-white mb-1.5">Type de titulaire</label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setFormIsExternal(false)}
                className={`flex-1 px-3 py-2 text-sm font-medium rounded-lg border transition-colors ${
                  !formIsExternal
                    ? 'bg-primary text-white border-primary'
                    : 'bg-white dark:bg-slate-800 text-seal-gray-500 dark:text-slate-400 border-gray-200 dark:border-slate-600 hover:bg-gray-50 dark:hover:bg-slate-700'
                }`}
              >
                Interne
              </button>
              <button
                type="button"
                onClick={() => setFormIsExternal(true)}
                className={`flex-1 px-3 py-2 text-sm font-medium rounded-lg border transition-colors ${
                  formIsExternal
                    ? 'bg-primary text-white border-primary'
                    : 'bg-white dark:bg-slate-800 text-seal-gray-500 dark:text-slate-400 border-gray-200 dark:border-slate-600 hover:bg-gray-50 dark:hover:bg-slate-700'
                }`}
              >
                Externe
              </button>
            </div>
          </div>

          {/* User select (internal) */}
          {!formIsExternal && (
            <div>
              <label className="block text-sm font-semibold text-seal-navy dark:text-white mb-1.5">Utilisateur</label>
              <Select
                value={formUserId}
                onChange={(e) => setFormUserId(e.target.value)}
                options={[
                  { value: '', label: '-- Sélectionner un utilisateur --' },
                  ...users.map((u) => ({ value: u.id, label: `${u.firstName} ${u.lastName} (${u.email})` })),
                ]}
              />
            </div>
          )}

          {/* External person select */}
          {formIsExternal && (
            <div>
              <label className="block text-sm font-semibold text-seal-navy dark:text-white mb-1.5">Personne externe</label>
              <div className="flex gap-2">
                <div className="flex-1">
                  <Select
                    value={formExternalPersonId}
                    onChange={(e) => setFormExternalPersonId(e.target.value)}
                    options={[
                      { value: '', label: '-- Sélectionner --' },
                      ...externalPersons.map((ep) => ({
                        value: ep.id,
                        label: `${ep.firstName} ${ep.lastName} (${ep.company})`,
                      })),
                    ]}
                  />
                </div>
                <Button variant="outline" size="sm" onClick={() => setShowNewExternalDialog(true)}>
                  <UserPlus className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          {/* Training name */}
          <div>
            <label className="block text-sm font-semibold text-seal-navy dark:text-white mb-1.5">Nom de la formation *</label>
            <Input
              value={formName}
              onChange={(e) => setFormTrainingName(e.target.value)}
              placeholder="Ex: Formation ISO 27001"
            />
          </div>

          {/* Certification type with suggestions */}
          <div>
            <label className="block text-sm font-semibold text-seal-navy dark:text-white mb-1.5">Type de certification *</label>
            <Input
              value={formCertType}
              onChange={(e) => setFormCertType(e.target.value)}
              placeholder="Ex: ISO 27001 Lead Auditor"
              list="cert-type-suggestions"
            />
            <datalist id="cert-type-suggestions">
              {CERTIFICATION_SUGGESTIONS.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          </div>

          {/* Dates */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-semibold text-seal-navy dark:text-white mb-1.5">Date d&apos;obtention *</label>
              <Input
                type="date"
                value={formObtainedAt}
                onChange={(e) => setFormObtainedAt(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-seal-navy dark:text-white mb-1.5">Date d&apos;expiration</label>
              <Input
                type="date"
                value={formExpiresAt}
                onChange={(e) => setFormExpiresAt(e.target.value)}
              />
            </div>
          </div>

          {/* File upload */}
          <div>
            <label className="block text-sm font-semibold text-seal-navy dark:text-white mb-1.5">Fichier (PDF/image)</label>
            <div className="flex items-center gap-2">
              <label className="flex-1 flex items-center justify-center gap-2 px-4 py-3 border-2 border-dashed border-gray-300 dark:border-slate-600 rounded-lg cursor-pointer hover:border-primary transition-colors">
                <Upload className="h-4 w-4 text-seal-gray-500" />
                <span className="text-sm text-seal-gray-500 dark:text-slate-400">
                  {formFile ? formFile.name : 'Choisir un fichier'}
                </span>
                <input
                  type="file"
                  accept=".pdf,.png,.jpg,.jpeg"
                  className="hidden"
                  onChange={(e) => setFormFile(e.target.files?.[0] || null)}
                />
              </label>
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-semibold text-seal-navy dark:text-white mb-1.5">Notes</label>
            <textarea
              value={formNotes}
              onChange={(e) => setFormNotes(e.target.value)}
              placeholder="Notes optionnelles..."
              rows={3}
              className="w-full rounded-lg border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-seal-navy dark:text-white focus:outline-none focus:ring-2 focus:ring-primary resize-none"
            />
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outline" onClick={() => { setShowFormDialog(false); resetForm(); }}>
              Annuler
            </Button>
            <Button onClick={handleSubmitForm} disabled={submitting} loading={submitting}>
              {submitting ? 'Enregistrement...' : editingCert ? 'Mettre à jour' : 'Ajouter'}
            </Button>
          </div>
        </div>
      </Dialog>

      {/* New External Person Dialog */}
      <Dialog
        open={showNewExternalDialog}
        onClose={() => setShowNewExternalDialog(false)}
        title="Créer une personne externe"
        description="Ajoutez une nouvelle personne externe pour lui attribuer des certifications."
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-semibold text-seal-navy dark:text-white mb-1.5">Prenom *</label>
              <Input value={newExtFirstName} onChange={(e) => setNewExtFirstName(e.target.value)} />
            </div>
            <div>
              <label className="block text-sm font-semibold text-seal-navy dark:text-white mb-1.5">Nom *</label>
              <Input value={newExtLastName} onChange={(e) => setNewExtLastName(e.target.value)} />
            </div>
          </div>
          <div>
            <label className="block text-sm font-semibold text-seal-navy dark:text-white mb-1.5">Entreprise *</label>
            <Input value={newExtCompany} onChange={(e) => setNewExtCompany(e.target.value)} />
          </div>
          <div>
            <label className="block text-sm font-semibold text-seal-navy dark:text-white mb-1.5">Email</label>
            <Input type="email" value={newExtEmail} onChange={(e) => setNewExtEmail(e.target.value)} />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outline" onClick={() => setShowNewExternalDialog(false)}>Annuler</Button>
            <Button onClick={handleCreateExternalPerson} disabled={creatingExternal} loading={creatingExternal}>
              Créer
            </Button>
          </div>
        </div>
      </Dialog>

      {/* Delete certificate confirm */}
      <ConfirmDialog
        open={!!deletingCertId}
        onClose={() => setDeletingCertId(null)}
        onConfirm={handleDelete}
        title="Supprimer le certificat"
        description="Êtes-vous sûr de vouloir supprimer ce certificat ? Cette action est irréversible."
        confirmLabel="Supprimer"
        variant="danger"
      />

      {/* ----------------------------------------------------------------- */}
      {/* External Persons section                                          */}
      {/* ----------------------------------------------------------------- */}

      <div className="mt-10 space-y-4">
        <h2 className="text-lg font-semibold text-seal-navy dark:text-white">Personnes externes</h2>
        {externalPersons.length === 0 ? (
          <p className="text-sm text-seal-gray-500 dark:text-slate-400">Aucune personne externe enregistree.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-slate-700">
                  <th className="text-left px-4 py-2 text-xs font-semibold text-seal-gray-500 dark:text-slate-400 uppercase tracking-wider">Nom</th>
                  <th className="text-left px-4 py-2 text-xs font-semibold text-seal-gray-500 dark:text-slate-400 uppercase tracking-wider">Entreprise</th>
                  <th className="text-left px-4 py-2 text-xs font-semibold text-seal-gray-500 dark:text-slate-400 uppercase tracking-wider">Email</th>
                  <th className="text-right px-4 py-2 text-xs font-semibold text-seal-gray-500 dark:text-slate-400 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
                {externalPersons.map((ep) => (
                  <tr key={ep.id} className="hover:bg-gray-50 dark:hover:bg-slate-800/50 transition-colors">
                    <td className="px-4 py-3 text-seal-navy dark:text-white">{ep.firstName} {ep.lastName}</td>
                    <td className="px-4 py-3 text-seal-gray-500 dark:text-slate-400">{ep.company}</td>
                    <td className="px-4 py-3 text-seal-gray-500 dark:text-slate-400">{ep.email || '—'}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="sm" onClick={() => setEditingExternal({ ...ep })}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setDeletingExternalId(ep.id)}
                          className="text-red-500 hover:text-red-600"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Edit External Person Dialog */}
      <Dialog
        open={!!editingExternal}
        onClose={() => setEditingExternal(null)}
        title="Modifier la personne externe"
        description="Modifiez les informations de la personne externe."
      >
        {editingExternal && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-semibold text-seal-navy dark:text-white mb-1.5">Prenom</label>
                <Input
                  value={editingExternal.firstName}
                  onChange={(e) => setEditingExternal({ ...editingExternal, firstName: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-seal-navy dark:text-white mb-1.5">Nom</label>
                <Input
                  value={editingExternal.lastName}
                  onChange={(e) => setEditingExternal({ ...editingExternal, lastName: e.target.value })}
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-semibold text-seal-navy dark:text-white mb-1.5">Entreprise</label>
              <Input
                value={editingExternal.company}
                onChange={(e) => setEditingExternal({ ...editingExternal, company: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-seal-navy dark:text-white mb-1.5">Email</label>
              <Input
                type="email"
                value={editingExternal.email || ''}
                onChange={(e) => setEditingExternal({ ...editingExternal, email: e.target.value })}
              />
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <Button variant="outline" onClick={() => setEditingExternal(null)}>Annuler</Button>
              <Button onClick={handleUpdateExternalPerson}>Mettre à jour</Button>
            </div>
          </div>
        )}
      </Dialog>

      {/* Delete External Person confirm */}
      <ConfirmDialog
        open={!!deletingExternalId}
        onClose={() => setDeletingExternalId(null)}
        onConfirm={handleDeleteExternalPerson}
        title="Supprimer la personne externe"
        description="Êtes-vous sûr de vouloir supprimer cette personne externe ?"
        confirmLabel="Supprimer"
        variant="danger"
      />

      {/* ----------------------------------------------------------------- */}
      {/* KnowBe4 Section                                                   */}
      {/* ----------------------------------------------------------------- */}

      <div className="mt-10 space-y-4 animate-fade-in-up">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-blue-500" />
            <h2 className="text-lg font-semibold text-seal-navy dark:text-white">KnowBe4</h2>
          </div>
          {!kb4NotConfigured && (
            <Button onClick={handleKB4Sync} loading={kb4Syncing} disabled={kb4Syncing}>
              <RefreshCw className={`h-4 w-4 mr-1.5${kb4Syncing ? ' animate-spin' : ''}`} />
              Synchroniser KnowBe4
            </Button>
          )}
        </div>

        {kb4Loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[1, 2].map((i) => (
              <div key={i} className="h-32 animate-pulse rounded-xl bg-gray-100 dark:bg-slate-800" />
            ))}
          </div>
        ) : kb4NotConfigured ? (
          <Card className="shadow-sm rounded-xl border-amber-200 dark:border-amber-800">
            <CardContent className="py-6">
              <div className="flex items-start gap-3">
                <Info className="h-5 w-5 text-amber-500 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-seal-navy dark:text-white">
                    KnowBe4 non configure
                  </p>
                  <p className="text-xs text-seal-gray-500 dark:text-slate-400 mt-1">
                    Le token API KnowBe4 n&apos;est pas configure. Rendez-vous dans la configuration pour ajouter vos identifiants.
                  </p>
                  <a
                    href="/admin/config"
                    className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline mt-2"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    Aller à la configuration
                  </a>
                </div>
              </div>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* KB4 Account info */}
            {kb4Account && (
              <Card className="shadow-sm rounded-xl">
                <CardContent className="py-5">
                  <div className="flex items-center gap-2 mb-3">
                    <ShieldCheck className="h-4 w-4 text-blue-500" />
                    <h3 className="text-sm font-semibold text-seal-navy dark:text-white">Compte KnowBe4</h3>
                    <Badge variant="info">Connecté</Badge>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div>
                      <p className="text-[10px] font-semibold text-seal-gray-500 dark:text-slate-400 uppercase">Nom</p>
                      <p className="text-sm font-medium text-seal-navy dark:text-white mt-0.5">{kb4Account.name}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-semibold text-seal-gray-500 dark:text-slate-400 uppercase">Type</p>
                      <p className="text-sm font-medium text-seal-navy dark:text-white mt-0.5">{kb4Account.type}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-semibold text-seal-gray-500 dark:text-slate-400 uppercase">Sieges</p>
                      <p className="text-sm font-medium text-seal-navy dark:text-white mt-0.5">{kb4Account.number_of_seats}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-semibold text-seal-gray-500 dark:text-slate-400 uppercase">Fin abonnement</p>
                      <p className="text-sm font-medium text-seal-navy dark:text-white mt-0.5">
                        {kb4Account.subscription_end_date
                          ? formatDate(kb4Account.subscription_end_date)
                          : 'N/A'}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* KB4 Campaigns table */}
            <Card className="shadow-sm rounded-xl">
              <CardContent className="py-5">
                <h3 className="text-sm font-semibold text-seal-navy dark:text-white mb-3">Campagnes de formation</h3>
                {kb4Campaigns.length === 0 ? (
                  <p className="text-sm text-seal-gray-500 dark:text-slate-400 text-center py-4">Aucune campagne KnowBe4 trouvee.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-200 dark:border-slate-700">
                          <th className="text-left px-4 py-2 text-xs font-semibold text-seal-gray-500 dark:text-slate-400 uppercase tracking-wider">Nom</th>
                          <th className="text-left px-4 py-2 text-xs font-semibold text-seal-gray-500 dark:text-slate-400 uppercase tracking-wider">Statut</th>
                          <th className="text-left px-4 py-2 text-xs font-semibold text-seal-gray-500 dark:text-slate-400 uppercase tracking-wider">Modules</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
                        {kb4Campaigns.map((campaign) => (
                          <tr key={campaign.campaign_id} className="hover:bg-gray-50 dark:hover:bg-slate-800/50 transition-colors">
                            <td className="px-4 py-3 text-seal-navy dark:text-white font-medium">{campaign.name}</td>
                            <td className="px-4 py-3">
                              <Badge variant={campaign.status === 'Closed' ? 'draft' : campaign.status === 'Active' ? 'success' : 'warning'}>
                                {campaign.status}
                              </Badge>
                            </td>
                            <td className="px-4 py-3 text-seal-gray-500 dark:text-slate-400">
                              {campaign.modules?.length ?? 0}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
