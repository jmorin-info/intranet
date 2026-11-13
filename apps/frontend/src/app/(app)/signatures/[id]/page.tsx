'use client';

/**
 * Wave D item 26 — Signature detail page with eIDAS-AES evidence.
 *
 * Affiche :
 *  - Statut de la signature (pending / signed / rejected)
 *  - Lien DocuSeal pour signer si pending
 *  - Section "Preuve de signature" (evidence) si signed :
 *      • Timeline (demandé / signé / preuve capturée)
 *      • Identité signataire + IP + UA
 *      • Hash SHA-256 du PDF signé
 *      • Présence / absence du certificat QES et du TSA RFC 3161
 *      • Bouton "Télécharger le PDF de preuve" (eIDAS-AES report)
 *
 * Accès limité au signataire, demandeur, ou ADMIN+/DIRECTION
 * (contrôle backend).
 */

import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';
import { downloadFromApi } from '@/lib/download';
import { toast } from 'sonner';
import {
  Card,
  CardContent,
  CardHeader,
  Button,
  Skeleton,
  Badge,
  Tooltip,
} from '@omnitech/ui';
import { PageHeader } from '@/components/layout/page-header';
import { formatDateTime } from '@/lib/utils';
import {
  PenLine,
  CheckCircle2,
  Clock,
  XCircle,
  ShieldCheck,
  Hash,
  Globe2,
  Monitor,
  Award,
  Stamp,
  FileDown,
  ExternalLink,
  AlertTriangle,
  ArrowLeft,
  FileText,
} from 'lucide-react';
import { logger } from '@/lib/logger';

interface SignatureDetail {
  id: string;
  status: 'PENDING' | 'SIGNED' | 'REJECTED';
  createdAt: string;
  signedAt: string | null;
  docusealSubmissionId: string | null;
  // Slug submitter DocuSeal (URL de signature /s/:slug). Le submissionId
  // numérique donne un 404 — repli seulement pour les demandes historiques.
  docusealSlug: string | null;
  signerId: string;
  requestedById: string;
  signer: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
  };
  requestedBy: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
  };
  documentVersion: {
    id: string;
    versionNumber?: string;
    document: { id: string; title: string; reference: string };
  };
}

interface SignatureEvidence {
  id: string;
  signedAt: string;
  signerEmail: string;
  signerIpAddress: string | null;
  signerUserAgent: string | null;
  documentHashSha256: string;
  hasCertificateChain: boolean;
  hasTsa: boolean;
  createdAt: string;
}

export default function SignatureDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params?.id as string;

  const [sig, setSig] = useState<SignatureDetail | null>(null);
  const [evidence, setEvidence] = useState<SignatureEvidence | null>(null);
  const [evidenceUnavailable, setEvidenceUnavailable] = useState(false);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get<SignatureDetail>(`/signatures/${id}`);
      setSig(data);

      // Charge l'evidence en parallèle. 404 = pas encore disponible (signature
      // non terminée ou backend indispo) — on l'affiche comme « non disponible ».
      try {
        const evRes = await api.get<SignatureEvidence>(
          `/signatures/${id}/evidence`,
        );
        setEvidence(evRes.data);
      } catch (err: any) {
        if (err?.response?.status === 404) {
          setEvidenceUnavailable(true);
        } else if (err?.response?.status === 403) {
          // Accès refusé — l'utilisateur n'a pas le droit de voir la preuve
          setEvidenceUnavailable(true);
        } else {
          logger.error(err, {
            page: 'signatures/[id]',
            context: 'evidence-load',
          });
        }
      }
    } catch (err) {
      logger.error(err, { page: 'signatures/[id]', context: 'load' });
      toast.error('Signature introuvable');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (id) loadAll();
  }, [id, loadAll]);

  const handleDownloadReport = async () => {
    setDownloading(true);
    try {
      const ref =
        sig?.documentVersion.document.reference || `signature-${id.slice(0, 8)}`;
      await downloadFromApi(
        `/signatures/${id}/evidence-report`,
        `preuve-signature-${ref}.pdf`,
      );
      toast.success('Rapport téléchargé');
    } catch (err: any) {
      toast.error(
        err?.response?.data?.message || 'Téléchargement impossible',
      );
    } finally {
      setDownloading(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6 animate-fade-in-up">
        <Skeleton className="h-12 w-1/2" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!sig) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Signature introuvable"
          subtitle="Cette signature n'existe pas ou vous n'y avez pas accès"
          icon={PenLine}
        />
        <Button onClick={() => router.push('/signatures')}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Retour
        </Button>
      </div>
    );
  }

  const isSigned = sig.status === 'SIGNED';
  const isPending = sig.status === 'PENDING';
  const isRejected = sig.status === 'REJECTED';

  return (
    <div className="space-y-6 animate-fade-in-up">
      <PageHeader
        title="Signature électronique"
        subtitle={sig.documentVersion.document.title}
        icon={PenLine}
        actions={
          <Button
            variant="outline"
            onClick={() => router.push('/signatures')}
            size="sm"
          >
            <ArrowLeft className="h-4 w-4 mr-1" /> Retour
          </Button>
        }
      />

      {/* Bandeau statut */}
      <Card className="shadow-sm rounded-xl">
        <CardContent className="py-4 flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
          <div className="flex items-center gap-3">
            {isSigned && (
              <div className="rounded-full bg-emerald-100 p-3">
                <CheckCircle2 className="h-6 w-6 text-emerald-600" />
              </div>
            )}
            {isPending && (
              <div className="rounded-full bg-amber-100 p-3">
                <Clock className="h-6 w-6 text-amber-600" />
              </div>
            )}
            {isRejected && (
              <div className="rounded-full bg-rose-100 p-3">
                <XCircle className="h-6 w-6 text-rose-600" />
              </div>
            )}
            <div>
              <p className="font-medium">
                {isSigned && 'Signé'}
                {isPending && 'En attente de signature'}
                {isRejected && 'Refusé'}
              </p>
              <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-2 mt-0.5">
                <Link
                  href={`/documents/${sig.documentVersion.document.id}`}
                  className="hover:underline inline-flex items-center gap-1"
                >
                  <FileText className="h-3 w-3" />
                  {sig.documentVersion.document.reference}
                </Link>
              </div>
            </div>
          </div>
          {isPending && sig.docusealSubmissionId && (
            <a
              href={`${process.env.NEXT_PUBLIC_DOCUSEAL_URL || 'http://localhost:7000'}/s/${sig.docusealSlug || sig.docusealSubmissionId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-white text-sm hover:opacity-90"
            >
              <ExternalLink className="h-4 w-4" /> Signer via DocuSeal
            </a>
          )}
        </CardContent>
      </Card>

      {/* Timeline */}
      <Card className="shadow-sm rounded-xl">
        <CardHeader>
          <h3 className="font-medium text-sm">Historique</h3>
        </CardHeader>
        <CardContent className="space-y-3">
          <TimelineRow
            done
            icon={<PenLine className="h-3.5 w-3.5" />}
            title="Demande créée"
            date={sig.createdAt}
            description={`Par ${sig.requestedBy.firstName} ${sig.requestedBy.lastName} pour ${sig.signer.firstName} ${sig.signer.lastName}`}
          />
          {sig.signedAt && (
            <TimelineRow
              done
              icon={<CheckCircle2 className="h-3.5 w-3.5" />}
              title="Signature complétée"
              date={sig.signedAt}
              description={`Par ${sig.signer.firstName} ${sig.signer.lastName} (${sig.signer.email})`}
              variant="success"
            />
          )}
          {evidence && (
            <TimelineRow
              done
              icon={<ShieldCheck className="h-3.5 w-3.5" />}
              title="Preuve eIDAS-AES capturée"
              date={evidence.createdAt}
              description="Hash + identité + métadonnées scellées"
              variant="success"
            />
          )}
          {isPending && (
            <TimelineRow
              icon={<Clock className="h-3.5 w-3.5" />}
              title="En attente"
              description="Le signataire n'a pas encore validé."
            />
          )}
        </CardContent>
      </Card>

      {/* Section Preuve de signature */}
      {isSigned && (
        <Card className="shadow-sm rounded-xl border-emerald-200">
          <CardHeader>
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-emerald-600" />
                <h3 className="font-medium text-sm">
                  Preuve de signature (eIDAS-AES)
                </h3>
              </div>
              {evidence && (
                <Button
                  size="sm"
                  onClick={handleDownloadReport}
                  disabled={downloading}
                  className="seal-btn-primary"
                >
                  <FileDown className="h-4 w-4 mr-1" />
                  {downloading ? 'Téléchargement…' : 'Télécharger le PDF'}
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {!evidence && evidenceUnavailable && (
              <div className="flex items-start gap-2 text-xs text-amber-700 bg-amber-50 p-3 rounded">
                <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-medium">Preuve non disponible</p>
                  <p className="mt-0.5">
                    La preuve n'a pas encore été capturée ou vous n'avez pas
                    l'autorisation de la consulter. Si la signature vient
                    d'être complétée, réessayez dans quelques secondes — la
                    capture est asynchrone.
                  </p>
                </div>
              </div>
            )}
            {evidence && (
              <>
                <EvidenceRow
                  icon={<Globe2 className="h-3.5 w-3.5" />}
                  label="Email signataire"
                  value={evidence.signerEmail}
                />
                <EvidenceRow
                  icon={<Globe2 className="h-3.5 w-3.5" />}
                  label="Adresse IP"
                  value={evidence.signerIpAddress || 'Non capturée'}
                  mono
                />
                <EvidenceRow
                  icon={<Monitor className="h-3.5 w-3.5" />}
                  label="User-Agent"
                  value={evidence.signerUserAgent || 'Non capturé'}
                  mono
                  truncate
                />
                <EvidenceRow
                  icon={<Clock className="h-3.5 w-3.5" />}
                  label="Signé le (UTC)"
                  value={new Date(evidence.signedAt).toISOString()}
                  mono
                />
                <EvidenceRow
                  icon={<Hash className="h-3.5 w-3.5" />}
                  label="SHA-256 du PDF signé"
                  value={evidence.documentHashSha256}
                  mono
                  truncate
                />
                <div className="flex flex-wrap gap-2 pt-2">
                  {evidence.hasCertificateChain ? (
                    <Tooltip content="Le PDF embarque une chaîne de certificats X.509 — niveau QES">
                      <Badge variant="success" className="gap-1">
                        <Award className="h-3 w-3" /> Certificat QES
                      </Badge>
                    </Tooltip>
                  ) : (
                    <Tooltip content="Pas de certificat qualifié — niveau eIDAS AES">
                      <Badge variant="navy" className="gap-1">
                        <Award className="h-3 w-3" /> Niveau AES
                      </Badge>
                    </Tooltip>
                  )}
                  {evidence.hasTsa ? (
                    <Tooltip content="Horodatage RFC 3161 capturé auprès d'un TSA externe">
                      <Badge variant="success" className="gap-1">
                        <Stamp className="h-3 w-3" /> TSA RFC 3161
                      </Badge>
                    </Tooltip>
                  ) : (
                    <Tooltip content="Pas d'horodatage TSA externe (TSA_URL non configuré)">
                      <Badge variant="navy" className="gap-1">
                        <Stamp className="h-3 w-3" /> Sans TSA
                      </Badge>
                    </Tooltip>
                  )}
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-2 italic">
                  Référence réglementaire : ETSI EN 319 122-1 (CAdES-B-LT) —
                  voir docs/compliance/EIDAS_AES_CONFORMITY.md
                </p>
              </>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function TimelineRow({
  done,
  icon,
  title,
  date,
  description,
  variant,
}: {
  done?: boolean;
  icon: React.ReactNode;
  title: string;
  date?: string;
  description?: string;
  variant?: 'success';
}) {
  const dotColor = !done
    ? 'bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-400'
    : variant === 'success'
      ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400'
      : 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-300';
  return (
    <div className="flex items-start gap-3">
      <div className={`rounded-full p-1.5 ${dotColor} flex-shrink-0`}>
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium">{title}</p>
        {date && (
          <p className="text-[11px] text-slate-500 dark:text-slate-400">{formatDateTime(date)}</p>
        )}
        {description && (
          <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">{description}</p>
        )}
      </div>
    </div>
  );
}

function EvidenceRow({
  icon,
  label,
  value,
  mono,
  truncate,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  mono?: boolean;
  truncate?: boolean;
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-1 sm:gap-3 text-xs">
      <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
        {icon}
        <span className="font-medium">{label}</span>
      </div>
      <div
        className={`sm:col-span-2 ${mono ? 'font-mono' : ''} ${truncate ? 'truncate' : 'break-all'}`}
        title={value}
      >
        {value}
      </div>
    </div>
  );
}
