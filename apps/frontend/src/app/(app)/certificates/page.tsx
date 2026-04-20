'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { api } from '@/lib/api';
import { toast } from 'sonner';
import {
  Card,
  CardContent,
  Badge,
  Skeleton,
  EmptyState,
  Button,
  Dialog,
  Input,
  Select,
  Textarea,
} from '@omnitech/ui';
import { PageHeader } from '@/components/layout/page-header';
import { formatDate } from '@/lib/utils';
import { useTranslation } from '@/lib/i18n';
import { Award, Download, Calendar, Clock, ExternalLink, Plus, Upload } from 'lucide-react';

interface Certificate {
  id: string;
  name: string;
  certType: string;
  obtainedAt: string;
  expiresAt: string | null;
  fileUrl: string | null;
  notes: string | null;
}

function getKB4CertUrl(cert: Certificate): string | null {
  if ((cert.certType ?? '').toLowerCase() !== 'knowbe4') return null;
  const match = (cert.notes ?? '').match(/enrollment #(\d+)/i);
  if (match?.[1]) return `https://eu.knowbe4.com/enrollments/${match[1]}/certificate.pdf`;
  return null;
}

type CertStatus = 'valid' | 'expiring' | 'expired';

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

function isPendingValidation(cert: Certificate): boolean {
  return (cert.notes ?? '').includes('En attente de validation');
}

const CERT_TYPE_OPTIONS = [
  { value: 'ISO 27001', label: 'ISO 27001' },
  { value: 'ISO 27005', label: 'ISO 27005' },
  { value: 'CISSP', label: 'CISSP' },
  { value: 'CEH', label: 'CEH' },
  { value: 'CompTIA Security+', label: 'CompTIA Security+' },
  { value: 'OSCP', label: 'OSCP' },
  { value: 'PSM', label: 'PSM' },
  { value: 'PMP', label: 'PMP' },
  { value: 'CISM', label: 'CISM' },
  { value: 'CISA', label: 'CISA' },
  { value: 'KnowBe4', label: 'KnowBe4' },
  { value: 'Autre', label: 'Autre' },
];

export default function MyCertificatesPage() {
  const { t } = useTranslation();
  const [certificates, setCertificates] = useState<Certificate[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Form state
  const [formName, setFormName] = useState('');
  const [formCertType, setFormCertType] = useState('');
  const [formObtainedAt, setFormObtainedAt] = useState('');
  const [formExpiresAt, setFormExpiresAt] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [formFile, setFormFile] = useState<File | null>(null);

  const resetForm = () => {
    setFormName('');
    setFormCertType('');
    setFormObtainedAt('');
    setFormExpiresAt('');
    setFormNotes('');
    setFormFile(null);
  };

  const fetchCertificates = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/certificates/my');
      setCertificates(Array.isArray(data) ? data : data?.data || []);
    } catch (err) {
      console.error('Failed to load certificates:', err);
      toast.error('Impossible de charger vos certificats.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCertificates();
  }, [fetchCertificates]);

  const handleDownload = async (cert: Certificate) => {
    if (!cert.fileUrl) return;
    try {
      window.open(cert.fileUrl, '_blank');
    } catch {
      toast.error('Impossible de télécharger le fichier.');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName || !formCertType || !formObtainedAt) {
      toast.error('Veuillez remplir les champs obligatoires.');
      return;
    }

    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.append('name', formName);
      fd.append('certType', formCertType);
      fd.append('obtainedAt', new Date(formObtainedAt).toISOString());
      if (formExpiresAt) {
        fd.append('expiresAt', new Date(formExpiresAt).toISOString());
      }
      if (formNotes) {
        fd.append('notes', formNotes);
      }
      if (formFile) {
        fd.append('file', formFile);
      }

      await api.post('/certificates/my', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      toast.success('Certificat ajouté avec succès. Il sera validé par un administrateur.');
      setDialogOpen(false);
      resetForm();
      await fetchCertificates();
    } catch (err) {
      console.error('Failed to create certificate:', err);
      toast.error('Impossible de créer le certificat.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in-up">
      <PageHeader
        title="Mes certifications"
        subtitle="Consultez vos certificats de formation et certifications professionnelles."
        icon={Award}
        hub="monEspace"
        actions={
          <Button variant="primary" onClick={() => setDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-1.5" />
            Ajouter un certificat
          </Button>
        }
      />

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-52 rounded-xl dark:bg-slate-800 shimmer" />
          ))}
        </div>
      ) : certificates.length === 0 ? (
        <EmptyState
          type="general"
          title="Aucun certificat"
          description="Vous n'avez aucun certificat. Cliquez sur le bouton ci-dessus pour ajouter votre première certification."
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {certificates.map((cert) => {
            const status = getCertStatus(cert.expiresAt);
            const pending = isPendingValidation(cert);
            return (
              <Card
                key={cert.id}
                className="stagger-item shadow-sm rounded-xl cursor-default"
              >
                <CardContent className="py-5 px-5 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <h3 className="text-sm font-semibold text-navy dark:text-white line-clamp-2">
                        {cert.name}
                      </h3>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <p className="text-xs text-seal-gray-500 dark:text-slate-400">
                          {cert.certType}
                        </p>
                        {(cert.certType ?? '').toLowerCase().includes('knowbe4') && (
                          <Badge variant="info">KnowBe4</Badge>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      {statusBadge(status)}
                      {pending && (
                        <Badge variant="warning">En attente de validation</Badge>
                      )}
                    </div>
                  </div>

                  <div className="space-y-1.5 text-xs text-seal-gray-500 dark:text-slate-400">
                    <div className="flex items-center gap-1.5">
                      <Calendar className="h-3.5 w-3.5 flex-shrink-0" />
                      <span>Obtenu le {formatDate(cert.obtainedAt)}</span>
                    </div>
                    {cert.expiresAt && (
                      <div className="flex items-center gap-1.5">
                        <Clock className="h-3.5 w-3.5 flex-shrink-0" />
                        <span>
                          {status === 'expired' ? 'Expire le' : 'Expire le'}{' '}
                          {formatDate(cert.expiresAt)}
                        </span>
                      </div>
                    )}
                    {!cert.expiresAt && (
                      <div className="flex items-center gap-1.5">
                        <Clock className="h-3.5 w-3.5 flex-shrink-0" />
                        <span>Pas de date d&apos;expiration</span>
                      </div>
                    )}
                  </div>

                  <div className="flex gap-2 mt-2">
                    {cert.fileUrl && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1"
                        onClick={() => handleDownload(cert)}
                      >
                        <Download className="h-3.5 w-3.5 mr-1.5" />
                        Télécharger
                      </Button>
                    )}
                    {(() => {
                      const kb4Url = getKB4CertUrl(cert);
                      if (!kb4Url) return null;
                      return (
                        <a
                          href={kb4Url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20 px-3 py-1.5 text-xs font-semibold text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/30 transition flex-1"
                        >
                          <Download className="h-3.5 w-3.5" />
                          Certificat PDF
                        </a>
                      );
                    })()}
                  </div>
                  {!cert.fileUrl && (cert.certType ?? '').toLowerCase() !== 'knowbe4' && (
                    <p className="text-[10px] text-seal-gray-500 dark:text-slate-500 mt-2 italic">
                      Aucun fichier attache — contactez votre administrateur.
                    </p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog
        open={dialogOpen}
        onClose={() => { setDialogOpen(false); resetForm(); }}
        title="Ajouter un certificat"
        description="Renseignez les informations de votre certification. Elle sera soumise a validation par un administrateur."
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="Nom de la formation *"
            placeholder="Ex: Formation ISO 27001 Lead Auditor"
            value={formName}
            onChange={(e) => setFormName(e.target.value)}
            required
          />

          <Select
            label="Type de certification *"
            placeholder="Sélectionnez un type"
            options={CERT_TYPE_OPTIONS}
            value={formCertType}
            onChange={(e) => setFormCertType(e.target.value)}
            required
          />

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Date d'obtention *"
              type="date"
              value={formObtainedAt}
              onChange={(e) => setFormObtainedAt(e.target.value)}
              required
            />
            <Input
              label="Date d'expiration"
              type="date"
              value={formExpiresAt}
              onChange={(e) => setFormExpiresAt(e.target.value)}
            />
          </div>

          <div className="space-y-1">
            <label className="block text-[13px] font-semibold text-navy dark:text-white">
              Fichier justificatif (PDF, image)
            </label>
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-1.5 cursor-pointer rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-seal-gray-500 dark:text-slate-400 hover:border-primary transition-colors">
                <Upload className="h-4 w-4" />
                {formFile ? formFile.name : 'Choisir un fichier'}
                <input
                  type="file"
                  className="hidden"
                  accept=".pdf,.jpg,.jpeg,.png,.webp"
                  onChange={(e) => setFormFile(e.target.files?.[0] ?? null)}
                />
              </label>
              {formFile && (
                <button
                  type="button"
                  className="text-xs text-red-500 hover:text-red-700"
                  onClick={() => setFormFile(null)}
                >
                  Supprimer
                </button>
              )}
            </div>
          </div>

          <Textarea
            label="Notes (optionnel)"
            placeholder="Informations complementaires..."
            value={formNotes}
            onChange={(e) => setFormNotes(e.target.value)}
            rows={3}
          />

          <div className="flex justify-end gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => { setDialogOpen(false); resetForm(); }}
              disabled={submitting}
            >
              Annuler
            </Button>
            <Button type="submit" variant="primary" loading={submitting}>
              Ajouter
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
