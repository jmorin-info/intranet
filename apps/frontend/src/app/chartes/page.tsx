'use client';

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth-store';
import { toast } from 'sonner';
import { OmnitechLogo } from '@/components/omnitech-logo';
import { Card, Button, Badge } from '@omnitech/ui';
import { Shield, CheckCircle2, FileText, AlertTriangle, PartyPopper } from 'lucide-react';
import nextDynamic from 'next/dynamic';
import { useTranslation } from '@/lib/i18n';

// Load react-pdf client-only (uses Promise.withResolvers unavailable in Node 20 SSR)
const PdfDocument = nextDynamic(
  () => import('react-pdf').then((mod) => {
    mod.pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
    return mod.Document;
  }),
  { ssr: false },
);
const PdfPage = nextDynamic(
  () => import('react-pdf').then((mod) => mod.Page),
  { ssr: false },
);

interface CharteVersion {
  id: string;
  versionNumber: string;
  fileUrl: string;
  fileType: string;
  fileSizeBytes: number;
  changeLog: string | null;
}

interface CharteWithVersion {
  id: string;
  title: string;
  slug: string;
  isMandatory: boolean;
  signedByDirection: boolean;
  classification: string;
  activeVersion: CharteVersion;
}

export default function ChartesWallPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const isAuthenticated = useAuthStore(s => s.isAuthenticated);
  const [chartes, setChartes] = useState<CharteWithVersion[]>([]);
  const [current, setCurrent] = useState(0);
  const [loading, setLoading] = useState(true);
  const [signing, setSigning] = useState(false);
  const [signingAll, setSigningAll] = useState(false);
  const [allDone, setAllDone] = useState(false);

  // PDF tracking
  const [numPages, setNumPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [maxPageSeen, setMaxPageSeen] = useState(1);
  const pdfScale = 1.0;

  const hasSeenAllPages = maxPageSeen >= numPages && numPages > 0;

  useEffect(() => {
    if (!isAuthenticated) { router.push('/login'); return; }
    api.get('/chartes/unsigned')
      .then(({ data }) => {
        if (data.length === 0) { router.push('/dashboard'); return; }
        setChartes(data);
      })
      .catch(() => router.push('/dashboard'))
      .finally(() => setLoading(false));
  }, [isAuthenticated, router]);

  // Reset PDF state when moving to next charte
  const resetPdfState = useCallback(() => {
    setNumPages(0);
    setCurrentPage(1);
    setMaxPageSeen(1);
  }, []);

  const goToPage = (page: number) => {
    setCurrentPage(page);
    if (page > maxPageSeen) setMaxPageSeen(page);
  };

  const [justSigned, setJustSigned] = useState<string | null>(null);
  const [signedDates, setSignedDates] = useState<Record<string, string>>({});

  const handleSign = async () => {
    const charte = chartes[current];
    if (!charte) return;
    setSigning(true);
    try {
      await api.post(`/chartes/${charte.id}/sign`);
      const now = new Date().toISOString();
      setSignedDates(prev => ({ ...prev, [charte.id]: now }));
      setJustSigned(charte.id);
      // Show inline confirmation for 2s then advance
      setTimeout(() => {
        setJustSigned(null);
        if (current < chartes.length - 1) {
          setCurrent(current + 1);
          resetPdfState();
        } else {
          setAllDone(true);
          setTimeout(() => {
            const redirectTo = sessionStorage.getItem('postChartesRedirect') || '/dashboard';
            sessionStorage.removeItem('postChartesRedirect');
            router.push(redirectTo);
          }, 3500);
        }
      }, 2000);
    } catch {
      toast.error('Erreur de signature');
    } finally {
      setSigning(false);
    }
  };

  const handleSignAll = async () => {
    setSigningAll(true);
    try {
      for (let i = current; i < chartes.length; i++) {
        const c = chartes[i];
        if (!c) continue;
        await api.post(`/chartes/${c.id}/sign`);
        // Advance the progress bar as each signature succeeds so the user
        // sees real feedback and we keep consistent state on partial failure
        setCurrent(i + 1);
      }
      setAllDone(true);
      setTimeout(() => {
        const redirectTo = sessionStorage.getItem('postChartesRedirect') || '/dashboard';
        sessionStorage.removeItem('postChartesRedirect');
        router.push(redirectTo);
      }, 3500);
    } catch {
      toast.error('Erreur de signature — progression conservée');
      // Reset PDF state so the user can read the next unsigned charte
      resetPdfState();
    } finally {
      setSigningAll(false);
    }
  };

  // Memoize file prop to prevent react-pdf re-renders (MUST be before any early return)
  const currentCharte = chartes[current];
  const pdfFile = useMemo(() => {
    if (!currentCharte) return null;
    return {
      url: `${process.env.NEXT_PUBLIC_API_URL || ''}/chartes/${currentCharte.id}/pdf`,
      httpHeaders: {
        Authorization: `Bearer ${typeof window !== 'undefined' ? localStorage.getItem('accessToken') || '' : ''}`,
      },
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentCharte?.id]);

  if (loading || !currentCharte) {
    return (
      <div className="flex h-screen items-center justify-center bg-surface">
        <div className="flex items-center gap-2 text-seal-gray-500 dark:text-slate-400">
          <div className="h-4 w-4 border-2 border-seal-gray-500/30 border-t-taupe rounded-full animate-spin" />
          Chargement...
        </div>
      </div>
    );
  }

  const charte = currentCharte;
  const version = charte.activeVersion;
  const signedCount = current;
  const totalCount = chartes.length;

  if (allDone) {
    return (
      <div className="min-h-screen bg-[#004469] flex items-center justify-center p-4">
        <div className="text-center animate-in fade-in zoom-in-95 duration-500">
          <div className="relative mx-auto w-24 h-24 mb-6">
            <div className="absolute inset-0 rounded-full bg-emerald-400/20 animate-ping" />
            <div className="relative flex h-24 w-24 items-center justify-center rounded-full bg-emerald-400/20">
              <PartyPopper className="h-12 w-12 text-emerald-400" />
            </div>
          </div>
          <h2 className="text-3xl font-semibold text-white mb-3">Toutes les chartes sont signées !</h2>
          <p className="text-white/60 text-sm mb-2">{totalCount} / {totalCount} chartes approuvées</p>
          <div className="w-64 mx-auto h-2 bg-white/10 rounded-full overflow-hidden mb-4">
            <div className="h-full bg-emerald-400 rounded-full w-full transition-all duration-1000" />
          </div>
          <p className="text-white/40 text-xs">Redirection vers le tableau de bord...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#004469] flex items-center justify-center p-4">
      <div className="w-full max-w-4xl">
        {/* Header */}
        <div className="text-center mb-6">
          <OmnitechLogo size="lg" variant="icon" className="mx-auto mb-4" />
          <h1 className="text-2xl font-semibold text-white">Chartes obligatoires</h1>
          <p className="text-white/50 text-sm mt-1">
            Vous devez lire et approuver les documents suivants avant d&apos;accéder à l&apos;intranet
          </p>

          {/* Progress bar */}
          <div className="mt-4 max-w-xs mx-auto">
            <div className="flex items-center justify-between text-xs text-white/60 mb-1.5">
              <span>{signedCount} / {totalCount} chartes signees</span>
              <span>{Math.round((signedCount / totalCount) * 100)}%</span>
            </div>
            <div className="h-2.5 bg-white/10 rounded-full overflow-hidden">
              <div
                className="h-full bg-emerald-400 rounded-full transition-all duration-500"
                style={{ width: `${totalCount > 0 ? (signedCount / totalCount) * 100 : 0}%` }}
              />
            </div>
          </div>

          <div className="flex justify-center gap-2 mt-4">
            {chartes.map((_, i) => (
              <div
                key={i}
                className={`h-2 w-8 rounded-full ${
                  i < current ? 'bg-emerald-400' : i === current ? 'bg-primary' : 'bg-white/20'
                }`}
              />
            ))}
          </div>
          <p className="text-white/40 text-xs mt-2">{current + 1} / {chartes.length}</p>
        </div>

        {/* Charte card */}
        <Card className="overflow-hidden relative">
          {/* Title bar */}
          <div className="bg-[#F68D2E]/10 px-6 py-4 border-b border-gray-200 dark:border-slate-700 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Shield className="h-5 w-5 text-[#F68D2E]" />
              <div>
                <h2 className="font-semibold text-[#004469] dark:text-white text-sm">{charte.title}</h2>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-[10px] text-[#837274] dark:text-slate-400">
                    Version {version.versionNumber}
                  </span>
                  <Badge variant="navy" className="text-[9px]">{charte.classification}</Badge>
                  <Badge variant="approved" className="text-[9px]">
                    <CheckCircle2 className="h-3 w-3" /> Validée Direction
                  </Badge>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 text-xs text-[#837274] dark:text-slate-400">
              <FileText className="h-4 w-4" />
              <span>PDF — {(version.fileSizeBytes / 1024).toFixed(0)} Ko</span>
            </div>
          </div>

          {/* PDF viewer */}
          <div className="bg-gray-100 dark:bg-slate-900">
            {/* Page controls */}
            <div className="flex items-center justify-between px-6 py-2 bg-gray-50 dark:bg-slate-800 border-b border-gray-200 dark:border-slate-700">
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost" size="sm"
                  onClick={() => goToPage(Math.max(1, currentPage - 1))}
                  disabled={currentPage <= 1}
                >
                  ← Précédent
                </Button>
                <span className="text-sm text-navy dark:text-white font-medium">
                  Page {currentPage} / {numPages || '...'}
                </span>
                <Button
                  variant="ghost" size="sm"
                  onClick={() => goToPage(Math.min(numPages, currentPage + 1))}
                  disabled={currentPage >= numPages}
                >
                  Suivant →
                </Button>
              </div>
              <div className="flex items-center gap-3">
                {numPages > 1 && (
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 w-24 rounded-full bg-gray-200 dark:bg-slate-600 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-300 ${hasSeenAllPages ? 'bg-emerald-500' : 'bg-[#F68D2E]'}`}
                        style={{ width: `${numPages > 0 ? Math.round(maxPageSeen / numPages * 100) : 0}%` }}
                      />
                    </div>
                    <span className="text-[10px] text-seal-gray-500 dark:text-slate-400">
                      {hasSeenAllPages
                        ? '✓ Document lu en entier'
                        : `Pages lues : ${maxPageSeen}/${numPages}`}
                    </span>
                  </div>
                )}
                {numPages <= 1 && numPages > 0 && (
                  <span className="text-[10px] text-emerald-500">✓ Document lu</span>
                )}
              </div>
            </div>

            {/* PDF render */}
            <div className="flex justify-center p-4 overflow-auto max-h-[500px]">
              <PdfDocument
                file={pdfFile}
                onLoadSuccess={({ numPages: n }) => setNumPages(n)}
                onLoadError={() => toast.error('Impossible de charger le PDF')}
                loading={
                  <div className="flex items-center justify-center py-20">
                    <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                  </div>
                }
              >
                <PdfPage
                  pageNumber={currentPage}
                  scale={pdfScale}
                  renderTextLayer={false}
                  renderAnnotationLayer={false}
                  className="shadow-lg"
                />
              </PdfDocument>
            </div>
          </div>

          {/* Animated confirmation overlay */}
          {justSigned === charte.id && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/90 dark:bg-slate-900/90 animate-fade-in-up">
              <div className="text-center">
                <div className="relative mx-auto w-16 h-16 mb-3">
                  <div className="absolute inset-0 rounded-full bg-emerald-400/20 animate-ping" />
                  <div className="relative flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/30">
                    <CheckCircle2 className="h-8 w-8 text-emerald-500" />
                  </div>
                </div>
                <h3 className="text-lg font-semibold text-navy dark:text-white">Charte signee</h3>
                <p className="text-sm text-seal-gray-500 dark:text-slate-400 mt-1">{charte.title}</p>
                <p className="text-xs text-emerald-600 mt-2">
                  Signe le {new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
            </div>
          )}

          {/* Action bar */}
          <div className="px-6 py-4 border-t border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800">
            {/* Signed date badge */}
            {signedDates[charte.id] && (
              <div className="flex items-center gap-2 mb-3 animate-fade-in-up">
                <Badge variant="approved" className="text-xs">
                  <CheckCircle2 className="h-3 w-3" />
                  Signe le {new Date(signedDates[charte.id] as string).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
                </Badge>
              </div>
            )}
            {!hasSeenAllPages && !signedDates[charte.id] && (
              <div className="flex items-center gap-2 text-xs text-amber-600 mb-3">
                <AlertTriangle className="h-4 w-4" />
                Veuillez consulter toutes les pages du document avant de valider
                (page {maxPageSeen}/{numPages || '...'})
              </div>
            )}
            <Button
              className="w-full"
              onClick={handleSign}
              loading={signing}
              disabled={!hasSeenAllPages || signingAll || !!signedDates[charte.id]}
            >
              <CheckCircle2 className="h-4 w-4" />
              {signedDates[charte.id] ? 'Charte signee' : `J'ai lu et j'approuve cette charte — ${charte.title} (v${version.versionNumber})`}
            </Button>
            {hasSeenAllPages && chartes.length > 1 && current < chartes.length - 1 && (
              <Button
                variant="ghost"
                className="w-full mt-2 text-primary"
                onClick={handleSignAll}
                loading={signingAll}
                disabled={signing}
              >
                <CheckCircle2 className="h-4 w-4" />
                Tout signer ({chartes.length - current} restantes)
              </Button>
            )}
            {version.changeLog && (
              <p className="text-[10px] text-center text-seal-gray-500 dark:text-slate-400 mt-2">
                Modifications : {version.changeLog}
              </p>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
