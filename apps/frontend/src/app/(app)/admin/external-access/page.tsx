'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { api } from '@/lib/api';
import { toast } from 'sonner';
import {
  Card, CardContent, CardHeader, Button, Badge, EmptyState, ConfirmDialog,
} from '@omnitech/ui';
import { formatDate } from '@/lib/utils';
import { ExportButton } from '@/components/ui/export-button';
import { AdminGroupTabs } from '@/components/layout/admin-group-tabs';
import { PageHeader } from '@/components/layout/page-header';
import {
  Shield, UserCheck, UserX, Clock, AlertTriangle, Plus, RefreshCw, Building2, Eye,
} from 'lucide-react';
import { useTranslation } from '@/lib/i18n';

interface ExternalAccess {
  id: string;
  userId: string;
  companyName: string;
  contractRef: string | null;
  accessGrantedAt: string;
  accessExpiresAt: string | null;
  lastReviewedAt: string | null;
  lastReviewedBy: string | null;
  isActive: boolean;
  sessionTimeout: number;
  user: { id: string; firstName: string; lastName: string; email: string };
}

export default function AdminExternalAccessPage() {
  const { t } = useTranslation();
  const [accesses, setAccesses] = useState<ExternalAccess[]>([]);
  const [dueReview, setDueReview] = useState<ExternalAccess[]>([]);
  const [loading, setLoading] = useState(true);
  const [showGrant, setShowGrant] = useState(false);

  // Grant form
  const [grantUserId, setGrantUserId] = useState('');
  const [grantCompany, setGrantCompany] = useState('');
  const [grantContract, setGrantContract] = useState('');
  const [grantExpiry, setGrantExpiry] = useState('');
  const [grantTimeout, setGrantTimeout] = useState('1800');
  const [granting, setGranting] = useState(false);

  // Create account mode
  const [createMode, setCreateMode] = useState<'new' | 'existing'>('new');
  const [newEmail, setNewEmail] = useState('');
  const [newFirstName, setNewFirstName] = useState('');
  const [newLastName, setNewLastName] = useState('');
  const [createdCredentials, setCreatedCredentials] = useState<{email: string; password: string} | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [accessRes, dueRes] = await Promise.allSettled([
        api.get('/external-access', { params: { limit: '100' } }),
        api.get('/external-access/due-review'),
      ]);
      if (accessRes.status === 'fulfilled') setAccesses(accessRes.value.data?.data || []);
      else console.error('Failed to load external accesses:', accessRes.reason);
      if (dueRes.status === 'fulfilled') setDueReview(dueRes.value.data || []);
      else console.error('Failed to load due reviews:', dueRes.reason);
    } catch { /**/ } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleGrant = async () => {
    if (!grantUserId || !grantCompany) return;
    setGranting(true);
    try {
      await api.post('/external-access', {
        userId: grantUserId,
        companyName: grantCompany,
        contractRef: grantContract || null,
        accessExpiresAt: grantExpiry || null,
        sessionTimeout: parseInt(grantTimeout) || 1800,
      });
      toast.success('Accès accordé');
      setShowGrant(false);
      setGrantUserId(''); setGrantCompany(''); setGrantContract(''); setGrantExpiry('');
      fetchData();
    } catch { toast.error('Erreur lors de l\'attribution de l\'accès'); } finally { setGranting(false); }
  };

  const [revokeAccess, setRevokeAccess] = useState<ExternalAccess | null>(null);

  const handleRevoke = async (id: string) => {
    try {
      await api.delete(`/external-access/${id}`);
      toast.success('Accès révoqué');
      setRevokeAccess(null);
      fetchData();
    } catch { toast.error('Erreur lors de la révocation de l\'accès'); }
  };

  const handleReview = async (id: string) => {
    try {
      await api.patch(`/external-access/${id}/review`);
      toast.success('Accès révisé');
      fetchData();
    } catch { toast.error('Erreur lors de la révision de l\'accès'); }
  };

  const isOverdue = (access: ExternalAccess) => {
    if (!access.lastReviewedAt) return true;
    const days = (Date.now() - new Date(access.lastReviewedAt).getTime()) / (1000 * 60 * 60 * 24);
    return days > 30;
  };

  const isExpired = (access: ExternalAccess) => {
    return access.accessExpiresAt && new Date(access.accessExpiresAt) < new Date();
  };

  const getExpiryInfo = (access: ExternalAccess): { label: string; colorClass: string; badgeVariant: 'success' | 'warning' | 'error' } | null => {
    if (!access.accessExpiresAt) return null;
    const now = new Date();
    const expiry = new Date(access.accessExpiresAt);
    const diffMs = expiry.getTime() - now.getTime();
    if (diffMs <= 0) return { label: 'Expire', colorClass: 'text-red-600 dark:text-red-400', badgeVariant: 'error' };
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays < 7) return { label: `Expire dans ${diffDays}j`, colorClass: 'text-red-600 dark:text-red-400', badgeVariant: 'error' };
    if (diffDays <= 30) return { label: `Expire dans ${diffDays}j`, colorClass: 'text-amber-600 dark:text-amber-400', badgeVariant: 'warning' };
    return { label: `Expire dans ${diffDays}j`, colorClass: 'text-emerald-600 dark:text-emerald-400', badgeVariant: 'success' };
  };

  const activeAccesses = accesses.filter(a => a.isActive);
  const revokedAccesses = accesses.filter(a => !a.isActive);
  const expiringSoonCount = activeAccesses.filter(a => {
    if (!a.accessExpiresAt) return false;
    const diffDays = (new Date(a.accessExpiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
    return diffDays > 0 && diffDays <= 30;
  }).length;

  return (
    <div className="space-y-6 animate-fade-in-up">
      <AdminGroupTabs group="identity" />
      <PageHeader
        title="Accès prestataires"
        subtitle="Portail isolé, MFA obligatoire, revue mensuelle RSSI"
        icon={Shield}
        hub="admin"
        actions={
          <>
            <ExportButton
              filename="acces-prestataires"
              rows={(accesses || []) as unknown as Array<Record<string, unknown>>}
              columns={[
                { header: 'ID', accessor: 'id' },
                { header: 'Prestataire', accessor: (r: any) => r?.companyName || r?.fullName || '' },
                { header: 'Email', accessor: 'email' },
                { header: 'Actif', accessor: (r: any) => (r?.isActive ? 'Oui' : 'Non') },
                { header: 'Créé le', accessor: (r: any) => r?.createdAt || '' },
                { header: 'Expire le', accessor: (r: any) => r?.expiresAt || '' },
                { header: 'Dernière revue', accessor: (r: any) => r?.lastReviewedAt || '' },
              ]}
            />
            <Button onClick={() => setShowGrant(true)}>
              <Plus className="h-4 w-4" /> Accorder un accès
            </Button>
          </>
        }
      />

      {/* Summary card */}
      {!loading && (
        <Card className="border-l-4 border-l-primary">
          <CardContent className="py-3 flex items-center gap-4">
            <Shield className="h-5 w-5 text-primary flex-shrink-0" />
            <p className="text-sm text-navy dark:text-white">
              <span className="font-semibold">{activeAccesses.length}</span> accès actifs, <span className="font-semibold">{dueReview.length}</span> en attente de revue
            </p>
          </CardContent>
        </Card>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card><CardContent className="py-3 px-4 flex items-center gap-3">
          <UserCheck className="h-5 w-5 text-emerald-500" />
          <div><p className="text-xs text-taupe dark:text-slate-400">Actifs</p><p className="text-xl font-medium text-emerald-600">{activeAccesses.length}</p></div>
        </CardContent></Card>
        <Card><CardContent className="py-3 px-4 flex items-center gap-3">
          <Clock className="h-5 w-5 text-orange-500" />
          <div><p className="text-xs text-taupe dark:text-slate-400">Expirent &lt; 30j</p><p className="text-xl font-medium text-orange-600">{expiringSoonCount}</p></div>
        </CardContent></Card>
        <Card><CardContent className="py-3 px-4 flex items-center gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-500" />
          <div><p className="text-xs text-taupe dark:text-slate-400">Revue requise</p><p className="text-xl font-medium text-amber-600">{dueReview.length}</p></div>
        </CardContent></Card>
        <Card><CardContent className="py-3 px-4 flex items-center gap-3">
          <UserX className="h-5 w-5 text-red-500" />
          <div><p className="text-xs text-taupe dark:text-slate-400">Révoqués</p><p className="text-xl font-medium text-red-600">{revokedAccesses.length}</p></div>
        </CardContent></Card>
      </div>

      {/* Grant form */}
      {showGrant && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-4">
              <h3 className="font-semibold text-navy dark:text-white">Nouveau prestataire</h3>
              <div className="flex gap-1 border rounded-lg p-0.5 dark:border-slate-700">
                <button onClick={() => setCreateMode('new')}
                  className={`px-3 py-1 text-xs rounded font-semibold transition ${createMode === 'new' ? 'bg-primary text-white' : 'text-taupe'}`}>
                  Créer un compte
                </button>
                <button onClick={() => setCreateMode('existing')}
                  className={`px-3 py-1 text-xs rounded font-semibold transition ${createMode === 'existing' ? 'bg-primary text-white' : 'text-taupe'}`}>
                  Compte existant
                </button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {createMode === 'new' ? (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold text-taupe dark:text-slate-400">Email</label>
                  <input className="w-full mt-1 rounded border px-3 py-2 text-sm dark:bg-slate-800 dark:border-slate-600 dark:text-white"
                    type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)} placeholder="prenom.nom@entreprise.fr" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-taupe dark:text-slate-400">Prénom</label>
                  <input className="w-full mt-1 rounded border px-3 py-2 text-sm dark:bg-slate-800 dark:border-slate-600 dark:text-white"
                    value={newFirstName} onChange={e => setNewFirstName(e.target.value)} placeholder="Jean" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-taupe dark:text-slate-400">Nom</label>
                  <input className="w-full mt-1 rounded border px-3 py-2 text-sm dark:bg-slate-800 dark:border-slate-600 dark:text-white"
                    value={newLastName} onChange={e => setNewLastName(e.target.value)} placeholder="DUPONT" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-taupe dark:text-slate-400">Société</label>
                  <input className="w-full mt-1 rounded border px-3 py-2 text-sm dark:bg-slate-800 dark:border-slate-600 dark:text-white"
                    value={grantCompany} onChange={e => setGrantCompany(e.target.value)} placeholder="CHEOPS Technology" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-taupe dark:text-slate-400">Réf. contrat</label>
                  <input className="w-full mt-1 rounded border px-3 py-2 text-sm dark:bg-slate-800 dark:border-slate-600 dark:text-white"
                    value={grantContract} onChange={e => setGrantContract(e.target.value)} placeholder="CTR-2026-001" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-taupe dark:text-slate-400">Expiration</label>
                  <input type="date" className="w-full mt-1 rounded border px-3 py-2 text-sm dark:bg-slate-800 dark:border-slate-600 dark:text-white"
                    value={grantExpiry} onChange={e => setGrantExpiry(e.target.value)} />
                </div>
              </div>
            ) : (
              /* Existing form for linking existing account */
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold text-taupe dark:text-slate-400">User ID du prestataire</label>
                  <input className="w-full mt-1 rounded border px-3 py-2 text-sm dark:bg-slate-800 dark:border-slate-600 dark:text-white"
                    value={grantUserId} onChange={e => setGrantUserId(e.target.value)} placeholder="UUID du compte" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-taupe dark:text-slate-400">Société</label>
                  <input className="w-full mt-1 rounded border px-3 py-2 text-sm dark:bg-slate-800 dark:border-slate-600 dark:text-white"
                    value={grantCompany} onChange={e => setGrantCompany(e.target.value)} />
                </div>
              </div>
            )}
            <div className="flex gap-2 mt-4">
              <Button loading={granting} disabled={createMode === 'new' ? !newEmail || !newFirstName || !grantCompany : !grantUserId || !grantCompany}
                onClick={async () => {
                  setGranting(true);
                  try {
                    if (createMode === 'new') {
                      const { data } = await api.post('/external-access/create-account', {
                        email: newEmail, firstName: newFirstName, lastName: newLastName,
                        companyName: grantCompany, contractRef: grantContract || null,
                        accessExpiresAt: grantExpiry || null,
                      });
                      if (data.credentials) {
                        setCreatedCredentials(data.credentials);
                      }
                      toast.success('Compte prestataire créé');
                    } else {
                      await api.post('/external-access', {
                        userId: grantUserId, companyName: grantCompany,
                        contractRef: grantContract || null, accessExpiresAt: grantExpiry || null,
                      });
                      toast.success('Accès accordé');
                    }
                    fetchData();
                  } catch (err: any) {
                    toast.error(err.response?.data?.message || 'Erreur');
                  } finally { setGranting(false); }
                }}>
                {createMode === 'new' ? 'Créer le compte' : 'Accorder'}
              </Button>
              <Button variant="outline" onClick={() => { setShowGrant(false); setCreatedCredentials(null); }}>Annuler</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Credentials display — shown ONCE after account creation */}
      {createdCredentials && (
        <Card className="border-2 border-amber-400">
          <CardContent className="py-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-6 w-6 text-amber-500 flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="font-semibold text-navy dark:text-white">Identifiants du prestataire</h3>
                <p className="text-xs text-amber-600 dark:text-amber-400 mb-3">
                  Ce mot de passe ne sera plus affiché. Notez-le et transmettez-le de manière sécurisée.
                </p>
                <div className="bg-gray-50 dark:bg-slate-800 rounded-lg p-3 font-mono text-sm space-y-1">
                  <div><span className="text-taupe dark:text-slate-400">Email :</span> <span className="text-navy dark:text-white font-semibold">{createdCredentials.email}</span></div>
                  <div><span className="text-taupe dark:text-slate-400">Mot de passe :</span> <span className="text-navy dark:text-white font-semibold">{createdCredentials.password}</span></div>
                </div>
                <div className="flex gap-2 mt-3">
                  <Button size="sm" variant="outline" onClick={() => {
                    const text = `Email: ${createdCredentials.email}\nMot de passe: ${createdCredentials.password}`;
                    if (navigator.clipboard?.writeText) {
                      navigator.clipboard.writeText(text).then(() => toast.success('Copié'));
                    } else {
                      const ta = document.createElement('textarea'); ta.value = text;
                      ta.style.position = 'fixed'; ta.style.opacity = '0';
                      document.body.appendChild(ta); ta.select();
                      try { document.execCommand('copy'); toast.success('Copié'); } catch {}
                      document.body.removeChild(ta);
                    }
                  }}>Copier</Button>
                  <Button size="sm" variant="ghost" onClick={() => setCreatedCredentials(null)}>Fermer</Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Due review alert */}
      {dueReview.length > 0 && (
        <Card className="border-l-4 border-l-amber-400">
          <CardContent className="py-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-500 mt-0.5" />
              <div>
                <h3 className="font-semibold text-navy dark:text-white text-sm">Revue mensuelle requise</h3>
                <p className="text-xs text-taupe dark:text-slate-400 mt-1">
                  {dueReview.length} accès n&apos;ont pas été révisés depuis plus de 30 jours (obligation RSSI — revue mensuelle)
                </p>
                <div className="flex gap-2 mt-2 flex-wrap">
                  {dueReview.map(a => (
                    <div key={a.id} className="flex items-center gap-2 text-xs bg-amber-50 dark:bg-amber-900/20 px-2 py-1 rounded">
                      <Building2 className="h-3 w-3" />
                      <span className="font-medium">{a.companyName}</span> — {a.user.firstName} {a.user.lastName}
                      <Button size="sm" variant="outline" className="h-6 text-[10px]" onClick={() => handleReview(a.id)}>
                        <Eye className="h-3 w-3" /> Réviser
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Active accesses */}
      {loading ? (
        <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-20 animate-pulse rounded-card bg-gray-100 dark:bg-slate-800" />)}</div>
      ) : activeAccesses.length === 0 ? (
        <EmptyState type="general" title="Aucun accès actif" description="Aucun prestataire externe n'a d'accès actif." />
      ) : (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-navy dark:text-white">Accès actifs ({activeAccesses.length})</h2>
          {activeAccesses.map((access, idx) => {
            const expiryInfo = getExpiryInfo(access);
            return (
            <Card key={access.id} className={`stagger-item ${isOverdue(access) ? 'border-l-4 border-l-amber-400' : ''} ${isExpired(access) ? 'border-l-4 border-l-red-500' : ''}`} style={{ animationDelay: `${idx * 60}ms` }}>
              <CardContent className="py-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Building2 className="h-5 w-5 text-primary" />
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-navy dark:text-white text-sm">{access.companyName}</span>
                        <Badge variant="navy">{access.user.firstName} {access.user.lastName}</Badge>
                        {access.contractRef && <Badge variant="primary">{access.contractRef}</Badge>}
                        {expiryInfo && (
                          <Badge variant={expiryInfo.badgeVariant}>
                            <Clock className="h-3 w-3" /> {expiryInfo.label}
                          </Badge>
                        )}
                        {isOverdue(access) && !isExpired(access) && <Badge variant="warning">Revue requise</Badge>}
                      </div>
                      <div className="flex items-center gap-4 mt-1 text-[10px] text-taupe dark:text-slate-400">
                        <span>Accorde : {formatDate(access.accessGrantedAt)}</span>
                        {access.accessExpiresAt && (
                          <span className={expiryInfo?.colorClass || ''}>
                            Expire : {formatDate(access.accessExpiresAt)}
                          </span>
                        )}
                        <span>Timeout : {access.sessionTimeout}s</span>
                        <span>Derniere revue : {access.lastReviewedAt ? formatDate(access.lastReviewedAt) : 'Jamais'}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => handleReview(access.id)}>
                      <Eye className="h-3 w-3" /> Reviser
                    </Button>
                    <Button size="sm" variant="ghost" className="text-red-500" onClick={() => setRevokeAccess(access)}>
                      <UserX className="h-3 w-3" /> Revoquer
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
            );
          })}
        </div>
      )}

      {/* Revoked accesses */}
      {revokedAccesses.length > 0 && (
        <div className="space-y-3 opacity-60">
          <h2 className="text-sm font-semibold text-navy dark:text-white">Accès révoqués ({revokedAccesses.length})</h2>
          {revokedAccesses.map(access => (
            <Card key={access.id}>
              <CardContent className="py-2">
                <div className="flex items-center gap-3 text-sm">
                  <UserX className="h-4 w-4 text-red-400" />
                  <span className="text-taupe">{access.companyName} — {access.user.firstName} {access.user.lastName}</span>
                  {access.contractRef && <Badge variant="navy">{access.contractRef}</Badge>}
                  <Badge variant="error">Révoqué</Badge>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      {/* Revoke confirm */}
      <ConfirmDialog
        open={!!revokeAccess}
        onClose={() => setRevokeAccess(null)}
        onConfirm={() => revokeAccess && handleRevoke(revokeAccess.id)}
        title="Révoquer l'accès"
        description={`Révoquer l'accès de ${revokeAccess?.user.firstName} ${revokeAccess?.user.lastName} (${revokeAccess?.companyName}) ? L'utilisateur ne pourra plus accéder à la plateforme.`}
        confirmLabel="Révoquer"
        variant="danger"
      />
    </div>
  );
}
