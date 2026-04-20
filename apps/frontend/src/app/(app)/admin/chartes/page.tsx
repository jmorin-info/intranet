'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth-store';
import { toast } from 'sonner';
import { isRoleAtLeast, UserRole } from '@omnitech/shared';
import {
  Card, CardContent, CardHeader, Button, Badge, DataTable, EmptyState, ConfirmDialog, Skeleton,
} from '@omnitech/ui';
import { formatDate } from '@/lib/utils';
import { ExportButton } from '@/components/ui/export-button';
import {
  Shield, Upload, CheckCircle2, XCircle, FileText, Users, Eye, Plus, Bell, Trash2, Clock, History,
} from 'lucide-react';
import { AdminGroupTabs } from '@/components/layout/admin-group-tabs';
import { PageHeader } from '@/components/layout/page-header';
import { useTranslation } from '@/lib/i18n';

interface CharteVersion {
  id: string;
  versionNumber: string;
  fileUrl: string;
  fileSizeBytes: number;
  changeLog: string | null;
  publishedAt: string | null;
  isActive: boolean;
}

interface Charte {
  id: string;
  title: string;
  slug: string;
  isMandatory: boolean;
  isActive: boolean;
  signedByDirection: boolean;
  classification: string;
  versions: CharteVersion[];
  _count: { signatures: number };
}

interface ComplianceReport {
  signed: Array<{ id: string; firstName: string; lastName: string; email: string; signedAt: string }>;
  unsigned: Array<{ id: string; firstName: string; lastName: string; email: string }>;
  charte: Charte;
  activeVersion: CharteVersion;
}

export default function AdminChartesPage() {
  const { t } = useTranslation();
  const user = useAuthStore(s => s.user);
  const [chartes, setChartes] = useState<Charte[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCharte, setSelectedCharte] = useState<string | null>(null);
  const [compliance, setCompliance] = useState<ComplianceReport | null>(null);
  const [complianceLoading, setComplianceLoading] = useState(false);

  // Upload state
  const [uploadCharteId, setUploadCharteId] = useState<string | null>(null);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadVersion, setUploadVersion] = useState('');
  const [uploadChangeLog, setUploadChangeLog] = useState('');
  const [uploading, setUploading] = useState(false);

  // Create state
  const [showCreate, setShowCreate] = useState(false);
  const [createTitle, setCreateTitle] = useState('');
  const [createSlug, setCreateSlug] = useState('');
  const [creating, setCreating] = useState(false);
  const [deleteCharteId, setDeleteCharteId] = useState<string | null>(null);
  const [deleteCharteTitle, setDeleteCharteTitle] = useState('');
  const [expandedTimeline, setExpandedTimeline] = useState<string | null>(null);
  const [reminding, setReminding] = useState<string | null>(null);

  // Import from document state
  const [showImport, setShowImport] = useState(false);
  const [importDocs, setImportDocs] = useState<any[]>([]);
  const [selectedDocId, setSelectedDocId] = useState('');
  const [importSlug, setImportSlug] = useState('');

  const [totalUsers, setTotalUsers] = useState<number>(0);

  const isDirection = user && isRoleAtLeast(user.role, UserRole.DIRECTION);

  const fetchChartes = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/chartes');
      setChartes(data);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || err?.message || 'Impossible de charger les chartes');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchChartes(); }, [fetchChartes]);

  useEffect(() => {
    api.get('/users', { params: { limit: 1 } }).then(({ data }) => {
      setTotalUsers(data?.meta?.total ?? data?.total ?? 0);
    }).catch(() => {
      // Fallback: try reports endpoint
      api.get('/reports/dashboard-stats').then(({ data }) => {
        setTotalUsers(data?.totalUsers ?? 0);
      }).catch(() => {});
    });
  }, []);

  const handleCreate = async () => {
    if (!createTitle || !createSlug) return;
    setCreating(true);
    try {
      await api.post('/chartes', { title: createTitle, slug: createSlug });
      toast.success('Charte créée');
      setShowCreate(false);
      setCreateTitle('');
      setCreateSlug('');
      fetchChartes();
    } catch { toast.error('Erreur lors de la création de la charte'); } finally { setCreating(false); }
  };

  const handleUpload = async () => {
    if (!uploadCharteId || !uploadFile || !uploadVersion) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', uploadFile);
      formData.append('versionNumber', uploadVersion);
      if (uploadChangeLog) formData.append('changeLog', uploadChangeLog);
      await api.post(`/chartes/${uploadCharteId}/versions`, formData);
      toast.success('Version PDF uploadée — les utilisateurs devront re-signer');
      setUploadCharteId(null);
      setUploadFile(null);
      setUploadVersion('');
      setUploadChangeLog('');
      fetchChartes();
    } catch { toast.error('Erreur upload'); } finally { setUploading(false); }
  };

  const handleDirectionSign = async (charteId: string) => {
    try {
      await api.patch(`/chartes/${charteId}/direction-sign`);
      toast.success('Charte validée par la Direction');
      fetchChartes();
    } catch { toast.error('Erreur lors de la validation de la charte'); }
  };

  const loadCompliance = async (charteId: string) => {
    setSelectedCharte(charteId);
    setComplianceLoading(true);
    try {
      const { data } = await api.get(`/chartes/${charteId}/compliance`);
      setCompliance(data);
    } catch { toast.error('Erreur lors du chargement de la conformité'); } finally { setComplianceLoading(false); }
  };

  return (
    <div className="space-y-6 animate-fade-in-up">
      <AdminGroupTabs group="compliance" />
      <PageHeader
        title={t('nav.chartes')}
        subtitle="Politiques et chartes à signer. Consultez les documents obligatoires et signez-les électroniquement."
        icon={Shield}
        hub="admin"
        actions={
          <div className="flex gap-2">
            <ExportButton
              filename="chartes"
              rows={(chartes || []) as unknown as Array<Record<string, unknown>>}
              columns={[
                { header: 'ID', accessor: 'id' },
                { header: 'Titre', accessor: 'title' },
                { header: 'Version', accessor: 'version' },
                { header: 'Active', accessor: (r: any) => (r?.isActive ? 'Oui' : 'Non') },
                { header: 'Publication', accessor: (r: any) => r?.publishedAt || '' },
                { header: 'Type', accessor: 'type' },
              ]}
            />
            <Button onClick={() => setShowCreate(true)}>
              <Plus className="h-4 w-4" /> Nouvelle charte
            </Button>
            <Button variant="secondary" onClick={async () => {
              const { data } = await api.get('/documents?limit=100&status=APPROVED');
              setImportDocs(data?.data || []);
              setShowImport(true);
            }}>
              <FileText className="h-4 w-4" /> Importer depuis un document
            </Button>
          </div>
        }
      />

      {/* Create form */}
      {showCreate && (
        <Card>
          <CardHeader><h3 className="font-medium text-navy dark:text-white">Créer une charte</h3></CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-medium text-seal-gray-500">Titre</label>
                <input className="w-full mt-1 rounded border px-3 py-2 text-sm dark:bg-slate-800 dark:border-slate-700 dark:text-white" value={createTitle}
                  onChange={e => setCreateTitle(e.target.value)} placeholder="Ex : PSSI, Charte informatique, Politique de sécurité..." />
              </div>
              <div>
                <label className="text-xs font-medium text-seal-gray-500">Slug</label>
                <input className="w-full mt-1 rounded border px-3 py-2 text-sm dark:bg-slate-800 dark:border-slate-700 dark:text-white" value={createSlug}
                  onChange={e => setCreateSlug(e.target.value)} placeholder="charte-utilisation-si" />
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <Button onClick={handleCreate} loading={creating}>Créer</Button>
              <Button variant="outline" onClick={() => setShowCreate(false)}>Annuler</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Import from document */}
      {showImport && (
        <Card>
          <CardHeader><h3 className="font-medium text-navy dark:text-white">Importer une charte depuis un document existant</h3></CardHeader>
          <CardContent>
            <p className="text-xs text-seal-gray-500 dark:text-slate-400 mb-3">
              Sélectionnez un document approuvé (politique, procédure...) pour le transformer en charte obligatoire.
            </p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-medium text-seal-gray-500 dark:text-slate-400">Document source</label>
                <select className="w-full mt-1 rounded border px-3 py-2 text-sm dark:bg-slate-800 dark:border-slate-600 dark:text-white"
                  value={selectedDocId} onChange={e => {
                    setSelectedDocId(e.target.value);
                    const doc = importDocs.find((d: any) => d.id === e.target.value);
                    if (doc) setImportSlug(doc.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''));
                  }}>
                  <option value="">Sélectionner un document...</option>
                  {importDocs.map((d: any) => (
                    <option key={d.id} value={d.id}>{d.reference} — {d.title}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-seal-gray-500 dark:text-slate-400">Slug (identifiant URL)</label>
                <input className="w-full mt-1 rounded border px-3 py-2 text-sm dark:bg-slate-800 dark:border-slate-600 dark:text-white"
                  value={importSlug} onChange={e => setImportSlug(e.target.value)} placeholder="politique-securite" />
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <Button disabled={!selectedDocId || !importSlug} onClick={async () => {
                try {
                  await api.post('/chartes/from-document', { documentId: selectedDocId, slug: importSlug });
                  toast.success('Charte importée depuis le document');
                  setShowImport(false);
                  fetchChartes();
                } catch { toast.error('Erreur lors de l\'import'); }
              }}>Importer</Button>
              <Button variant="outline" onClick={() => setShowImport(false)}>Annuler</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Chartes list */}
      {loading ? (
        <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-card shimmer" />)}</div>
      ) : chartes.length === 0 ? (
        <EmptyState
          type="documents"
          title="Aucune charte ou politique configurée"
          description="Les chartes (PSSI, charte informatique, politique de sécurité...) sont des documents obligatoires que chaque collaborateur doit signer électroniquement. Créez votre première charte ou importez-la depuis un document approuvé pour lancer le processus de signature."
          action={isDirection ? (
            <Button onClick={() => setShowCreate(true)} className="animate-fade-in-up">
              <Plus className="h-4 w-4" /> Créer une charte
            </Button>
          ) : undefined}
        />
      ) : (
        <div className="space-y-4">
          {chartes.map(charte => {
            const activeVersion = charte.versions?.[0];
            return (
              <Card key={charte.id} className="stagger-item">
                <CardContent className="py-4">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3">
                      <Shield className="h-5 w-5 text-primary mt-0.5" />
                      <div>
                        <h3 className="font-medium text-navy dark:text-white">{charte.title}</h3>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          <Badge variant="navy">{charte.classification}</Badge>
                          {charte.isMandatory && <Badge variant="warning">Obligatoire</Badge>}
                          {charte.signedByDirection ? (
                            <Badge variant="approved"><CheckCircle2 className="h-3 w-3" /> Direction</Badge>
                          ) : (
                            <Badge variant="error"><XCircle className="h-3 w-3" /> Non signée Direction</Badge>
                          )}
                          {activeVersion && (
                            <Badge variant="primary">v{activeVersion.versionNumber}</Badge>
                          )}
                          <span className="text-[10px] text-seal-gray-500">{charte._count.signatures} signature(s)</span>
                        </div>
                        {activeVersion?.changeLog && (
                          <p className="text-xs text-seal-gray-500 mt-1">Changements : {activeVersion.changeLog}</p>
                        )}
                        {/* Signature progress bar */}
                        {totalUsers > 0 && (
                          <div className="mt-2">
                            {(() => {
                              const signed = charte._count.signatures;
                              const total = totalUsers;
                              const pct = total > 0 ? Math.round((signed / total) * 100) : 0;
                              const allSigned = pct >= 100;
                              return (
                                <div>
                                  <div className="flex items-center gap-2 mb-1">
                                    <p className="text-xs text-seal-gray-500 dark:text-slate-400">
                                      {signed} / {total} collaborateurs ont signe ({pct}%)
                                    </p>
                                    {allSigned && (
                                      <Badge variant="approved" className="text-[9px] animate-fade-in-up">
                                        <CheckCircle2 className="h-3 w-3" /> Tous signes
                                      </Badge>
                                    )}
                                  </div>
                                  <div className="h-2.5 w-full max-w-xs rounded-full bg-gray-200 dark:bg-slate-700 overflow-hidden">
                                    <div
                                      className={`h-full rounded-full transition-all duration-500 ${allSigned ? 'bg-emerald-500' : pct >= 80 ? 'bg-emerald-500' : pct >= 50 ? 'bg-amber-400' : 'bg-red-400'}`}
                                      style={{ width: `${Math.min(pct, 100)}%` }}
                                    />
                                  </div>
                                  {/* Remind non-signatories button */}
                                  {!allSigned && (
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      className="mt-1.5 text-[10px] text-amber-600 hover:text-amber-700 hover:bg-amber-50 dark:hover:bg-amber-900/20 px-2 py-1 h-auto"
                                      loading={reminding === charte.id}
                                      onClick={async () => {
                                        setReminding(charte.id);
                                        try {
                                          await api.post(`/chartes/${charte.id}/remind`);
                                          toast.success('Rappel envoyé aux non-signataires');
                                        } catch {
                                          toast.info('Fonctionnalité de rappel non disponible sur ce serveur — utilisez le rapport de conformité pour notifier manuellement');
                                        } finally { setReminding(null); }
                                      }}
                                    >
                                      <Bell className="h-3 w-3" /> Rappeler les non-signataires ({total - signed})
                                    </Button>
                                  )}
                                </div>
                              );
                            })()}
                          </div>
                        )}
                        {/* Version timeline */}
                        {charte.versions && charte.versions.length > 1 && (
                          <div className="mt-2">
                            <button
                              onClick={() => setExpandedTimeline(expandedTimeline === charte.id ? null : charte.id)}
                              className="flex items-center gap-1 text-[10px] text-primary hover:underline"
                            >
                              <History className="h-3 w-3" />
                              {expandedTimeline === charte.id ? 'Masquer' : 'Historique'} des versions ({charte.versions.length})
                            </button>
                            {expandedTimeline === charte.id && (
                              <div className="mt-2 ml-1 border-l-2 border-primary/30 pl-3 space-y-2 animate-fade-in-up">
                                {charte.versions.map((v, vi) => (
                                  <div key={v.id} className="relative">
                                    <div className="absolute -left-[17px] top-1 h-2.5 w-2.5 rounded-full border-2 border-primary bg-white dark:bg-slate-900" />
                                    <div className="flex items-center gap-2">
                                      <span className={`text-xs font-medium ${vi === 0 ? 'text-navy dark:text-white' : 'text-seal-gray-500 dark:text-slate-400'}`}>
                                        v{v.versionNumber}
                                      </span>
                                      {v.isActive && <Badge variant="approved" className="text-[8px]">Active</Badge>}
                                      {v.publishedAt && (
                                        <span className="text-[10px] text-seal-gray-500 dark:text-slate-500 flex items-center gap-1">
                                          <Clock className="h-2.5 w-2.5" />
                                          {formatDate(v.publishedAt)}
                                        </span>
                                      )}
                                    </div>
                                    {v.changeLog && (
                                      <p className="text-[10px] text-seal-gray-500 dark:text-slate-500 mt-0.5">{v.changeLog}</p>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-2 flex-shrink-0">
                      {!charte.signedByDirection && isDirection && (
                        <Button size="sm" onClick={() => handleDirectionSign(charte.id)}>
                          <CheckCircle2 className="h-3 w-3" /> Valider Direction
                        </Button>
                      )}
                      <Button size="sm" variant="outline" onClick={() => setUploadCharteId(charte.id)}>
                        <Upload className="h-3 w-3" /> Upload PDF
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => loadCompliance(charte.id)}>
                        <Users className="h-3 w-3" /> Conformité
                      </Button>
                      {user && isRoleAtLeast(user.role, UserRole.SUPER_ADMIN) && (
                        <Button size="sm" variant="ghost" className="text-red-500 hover:text-red-700"
                          onClick={() => { setDeleteCharteId(charte.id); setDeleteCharteTitle(charte.title); }}>
                          <Trash2 className="h-3 w-3" /> Supprimer
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* Upload form inline */}
                  {uploadCharteId === charte.id && (
                    <div className="mt-4 p-4 bg-gray-50 dark:bg-slate-800 rounded-lg">
                      <h4 className="text-sm font-medium text-navy dark:text-white mb-3">Uploader une nouvelle version PDF</h4>
                      <div className="grid grid-cols-3 gap-3">
                        <div>
                          <label className="text-xs font-medium text-seal-gray-500">Fichier PDF</label>
                          <input type="file" accept=".pdf" className="w-full mt-1 text-sm"
                            onChange={e => setUploadFile(e.target.files?.[0] || null)} />
                        </div>
                        <div>
                          <label className="text-xs font-medium text-seal-gray-500">N° version</label>
                          <input className="w-full mt-1 rounded border px-3 py-2 text-sm dark:bg-slate-800 dark:border-slate-700 dark:text-white"
                            value={uploadVersion} onChange={e => setUploadVersion(e.target.value)}
                            placeholder="2.0" />
                        </div>
                        <div>
                          <label className="text-xs font-medium text-seal-gray-500">Changelog</label>
                          <input className="w-full mt-1 rounded border px-3 py-2 text-sm dark:bg-slate-800 dark:border-slate-700 dark:text-white"
                            value={uploadChangeLog} onChange={e => setUploadChangeLog(e.target.value)}
                            placeholder="Mise à jour politique..." />
                        </div>
                      </div>
                      <div className="flex gap-2 mt-3">
                        <Button onClick={handleUpload} loading={uploading} disabled={!uploadFile || !uploadVersion}>
                          <Upload className="h-3 w-3" /> Uploader
                        </Button>
                        <Button variant="outline" onClick={() => setUploadCharteId(null)}>Annuler</Button>
                      </div>
                      <p className="text-[10px] text-amber-600 mt-2">
                        L&apos;upload d&apos;une nouvelle version invalidera toutes les signatures existantes — tous les utilisateurs devront re-signer.
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Compliance report modal */}
      {selectedCharte && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-10 pb-10 overflow-y-auto bg-black/50"
          onClick={() => { setSelectedCharte(null); setCompliance(null); }}>
          <div className="w-full max-w-3xl mx-4" onClick={e => e.stopPropagation()}>
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-medium text-navy dark:text-white">
                    Rapport de conformité
                    {compliance?.activeVersion && ` — v${compliance.activeVersion.versionNumber}`}
                  </h2>
                  <Button variant="ghost" size="sm" onClick={() => { setSelectedCharte(null); setCompliance(null); }}>X</Button>
                </div>
              </CardHeader>
              <CardContent>
                {complianceLoading ? (
                  <div className="animate-pulse h-40 bg-gray-100 dark:bg-slate-800 rounded" />
                ) : compliance ? (
                  <div className="space-y-6">
                    <div className="grid grid-cols-2 gap-4">
                      <Card><CardContent className="py-3">
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                          <div>
                            <p className="text-xs text-seal-gray-500">Ont signé</p>
                            <p className="text-2xl font-medium text-emerald-600">{compliance.signed.length}</p>
                          </div>
                        </div>
                      </CardContent></Card>
                      <Card><CardContent className="py-3">
                        <div className="flex items-center gap-2">
                          <XCircle className="h-5 w-5 text-red-500" />
                          <div>
                            <p className="text-xs text-seal-gray-500">N&apos;ont PAS signé</p>
                            <p className="text-2xl font-medium text-red-600">{compliance.unsigned.length}</p>
                          </div>
                        </div>
                      </CardContent></Card>
                    </div>

                    {compliance.unsigned.length > 0 && (
                      <div>
                        <h3 className="text-sm font-medium text-red-600 mb-2">Utilisateurs non conformes</h3>
                        <div className="space-y-1">
                          {compliance.unsigned.map(u => (
                            <div key={u.id} className="flex items-center gap-2 text-sm py-1 px-2 bg-red-50 dark:bg-red-900/20 rounded">
                              <XCircle className="h-3 w-3 text-red-500" />
                              <span className="font-medium">{u.firstName} {u.lastName}</span>
                              <span className="text-seal-gray-500 text-xs">{u.email}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {compliance.signed.length > 0 && (
                      <div>
                        <h3 className="text-sm font-medium text-emerald-600 mb-2">Utilisateurs conformes</h3>
                        <div className="space-y-1">
                          {compliance.signed.map(u => (
                            <div key={u.id} className="flex items-center justify-between text-sm py-1 px-2 bg-emerald-50 dark:bg-emerald-900/20 rounded">
                              <div className="flex items-center gap-2">
                                <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                                <span className="font-medium">{u.firstName} {u.lastName}</span>
                                <span className="text-seal-gray-500 text-xs">{u.email}</span>
                              </div>
                              <span className="text-[10px] text-seal-gray-500">{formatDate(u.signedAt)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {compliance && compliance.unsigned.length > 0 && (
                      <div className="mt-4 pt-4 border-t border-gray-200 dark:border-slate-700">
                        <Button
                          variant="secondary"
                          onClick={async () => {
                            try {
                              // Send reminder notification to all unsigned users
                              for (const u of compliance.unsigned) {
                                await api.post('/notifications', {
                                  userId: u.id,
                                  type: 'ACK_REQUIRED',
                                  title: `Charte à signer : ${compliance.charte.title}`,
                                  body: `Vous n'avez pas encore signé la charte "${compliance.charte.title}" (v${compliance.activeVersion?.versionNumber}). Cette signature est obligatoire.`,
                                  resourceType: 'Charte',
                                  resourceId: compliance.charte.id,
                                });
                              }
                              toast.success(`${compliance.unsigned.length} notification(s) envoyée(s)`);
                            } catch { toast.error('Erreur d\'envoi des notifications'); }
                          }}
                        >
                          <Bell className="h-4 w-4" /> Notifier les {compliance.unsigned.length} non-conformes
                        </Button>
                      </div>
                    )}
                  </div>
                ) : null}
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!deleteCharteId}
        onClose={() => setDeleteCharteId(null)}
        onConfirm={async () => {
          const id = deleteCharteId;
          setDeleteCharteId(null);
          try {
            await api.delete(`/chartes/${id}`);
            toast.success('Charte supprimée');
            fetchChartes();
          } catch { toast.error('Erreur lors de la suppression'); }
        }}
        title="Supprimer la charte"
        description={`Supprimer la charte "${deleteCharteTitle}" ? Cette action est irréversible.`}
        confirmLabel="Supprimer"
        variant="danger"
      />
    </div>
  );
}
