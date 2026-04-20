'use client';

import React, { useEffect, useLayoutEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { Card, CardContent, Button } from '@omnitech/ui';
import { useTranslation } from '@/lib/i18n';
import {
  FileText, ExternalLink, RefreshCw, AlertTriangle, CheckCircle2,
  Maximize2, Minimize2, Loader2, XCircle, Download, Copy,
  Merge, Scissors, ScanText, FileDown, Droplets, ArrowRightLeft,
} from 'lucide-react';

interface StirlingStatus {
  enabled: boolean;
  url: string;
  ok: boolean;
  version?: string;
  message: string;
}

/**
 * Stirling PDF — intégration iframe native.
 *
 * Cette page embarque directement l'UI officielle Stirling PDF via iframe,
 * sans réimplémenter les outils en React. L'utilisateur bénéficie ainsi de
 * toutes les fonctionnalités Stirling (merge, split, OCR, compression,
 * filigranage, signature, etc.) avec leur UI native.
 *
 * Pré-requis : un service Stirling PDF doit tourner et être accessible
 * depuis le navigateur (pas seulement depuis le backend).
 * Configuration : STIRLING_PDF_ENABLED=true + STIRLING_PDF_URL=http://... dans .env
 */
/**
 * Résout l'URL Stirling depuis le point de vue du NAVIGATEUR.
 */
function resolveClientUrl(backendUrl: string): string {
  if (typeof window === 'undefined') return backendUrl;
  try {
    const parsed = new URL(backendUrl);
    if (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1' || parsed.hostname === '0.0.0.0') {
      const currentHost = window.location.hostname;
      if (currentHost !== 'localhost' && currentHost !== '127.0.0.1') {
        parsed.hostname = currentHost;
      }
    }
    return parsed.toString();
  } catch {
    return backendUrl;
  }
}

interface PreloadedDocument {
  id: string;
  versionId: string;
  title: string;
  fileName: string;
  fileSize: number;
  objectUrl: string;
  blob: Blob;
}

/** Raccourcis outils Stirling */
const STIRLING_TOOLS = [
  { label: 'Fusionner', path: '/merge-pdfs', icon: Merge },
  { label: 'Diviser', path: '/split-pdf-by-pages', icon: Scissors },
  { label: 'OCR', path: '/ocr-pdf', icon: ScanText },
  { label: 'Compresser', path: '/compress-pdf', icon: FileDown },
  { label: 'Filigraner', path: '/add-watermark', icon: Droplets },
  { label: 'Convertir', path: '/pdf-to-word', icon: ArrowRightLeft },
] as const;

export default function StirlingPdfPage() {
  const { t } = useTranslation();
  const searchParams = useSearchParams();
  const docId = searchParams.get('doc');
  const versionId = searchParams.get('version');

  const [status, setStatus] = useState<StirlingStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);
  const [iframeLoaded, setIframeLoaded] = useState(false);
  const [preloaded, setPreloaded] = useState<PreloadedDocument | null>(null);
  const [preloadError, setPreloadError] = useState<string | null>(null);
  const [iframeSrc, setIframeSrc] = useState<string | null>(null);
  const [showPreloadBanner, setShowPreloadBanner] = useState(true);
  const [countdownActive, setCountdownActive] = useState(false);

  // Focus mode désactivé pour les éditeurs — les sélecteurs CSS focus-mode-active
  // cachaient le wrapper contenant <main>, empêchant l'iframe de s'afficher.

  const fetchStatus = async () => {
    setLoading(true);
    try {
      const res = await api.get<StirlingStatus>('/stirling/status');
      // L'intercepteur axios peut renvoyer { data: null } sur 403/429 (cf. api.ts)
      if (!res.data) {
        const status = (res as { status?: number }).status;
        setStatus({
          enabled: false,
          url: '',
          ok: false,
          message:
            status === 403
              ? "Accès refusé à Stirling — contactez un administrateur."
              : status === 429
                ? 'Trop de requêtes — patientez quelques secondes.'
                : 'Le backend a renvoyé une réponse vide pour /stirling/status.',
        });
        return;
      }
      if (!res.data.url) {
        setStatus({
          ...res.data,
          url: '',
          ok: false,
          message: "URL Stirling non configurée côté backend (STIRLING_PDF_PUBLIC_URL manquant).",
        });
        return;
      }
      // Refuse le mixed content (page HTTPS + Stirling HTTP → iframe bloquée)
      if (typeof window !== 'undefined' && window.location.protocol === 'https:' && res.data.url.startsWith('http:')) {
        setStatus({
          ...res.data,
          ok: false,
          message: `Mixed content : la page est en HTTPS mais Stirling est en HTTP (${res.data.url}). Configurez STIRLING_PDF_PUBLIC_URL avec une URL HTTPS (sous-domaine derrière BunkerWeb).`,
        });
        return;
      }
      const resolved = { ...res.data, url: resolveClientUrl(res.data.url) };
      setStatus(resolved);
      if (!iframeSrc) setIframeSrc(resolved.url);
    } catch (err) {
      setStatus({
        enabled: false,
        url: '',
        ok: false,
        message:
          err instanceof Error
            ? err.message
            : 'Impossible de contacter le service Stirling',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Préchargement du PDF si on arrive avec ?doc=X&version=Y
  useEffect(() => {
    if (!docId || !versionId) return;
    let cancelled = false;

    async function preloadPdf() {
      try {
        const { data: docData } = await api.get(`/documents/${docId}`);
        if (cancelled) return;

        const response = await api.get(
          `/documents/${docId}/versions/${versionId}/download`,
          { responseType: 'blob' },
        );
        if (cancelled) return;

        const blob = response.data instanceof Blob ? response.data : new Blob([response.data]);
        const objectUrl = window.URL.createObjectURL(blob);
        const fileName = `${docData.reference || docData.title || 'document'}.pdf`;

        setPreloaded({
          id: docId as string,
          versionId: versionId as string,
          title: docData.title || 'Document',
          fileName,
          fileSize: blob.size,
          objectUrl,
          blob,
        });

        const link = document.createElement('a');
        link.href = objectUrl;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        toast.success(`PDF "${fileName}" téléchargé — glissez-le dans Stirling ci-dessous`);

        // Auto-dismiss banner after 10s
        setShowPreloadBanner(true);
        setCountdownActive(true);
      } catch (err: any) {
        if (cancelled) return;
        const msg =
          err?.response?.data?.message ||
          err?.message ||
          'Impossible de charger le document';
        setPreloadError(msg);
        toast.error(msg);
      }
    }

    void preloadPdf();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docId, versionId]);

  // Auto-close preload banner after 10s
  useEffect(() => {
    if (!countdownActive) return;
    const timer = setTimeout(() => {
      setShowPreloadBanner(false);
      setCountdownActive(false);
    }, 10000);
    return () => clearTimeout(timer);
  }, [countdownActive]);

  // Libère l'objectUrl au démontage
  useEffect(() => {
    return () => {
      if (preloaded?.objectUrl) {
        window.URL.revokeObjectURL(preloaded.objectUrl);
      }
    };
  }, [preloaded?.objectUrl]);

  const copyPdfInfo = async () => {
    if (!preloaded) return;
    try {
      if (navigator.clipboard && window.ClipboardItem) {
        const item = new window.ClipboardItem({ 'application/pdf': preloaded.blob });
        await navigator.clipboard.write([item]);
        toast.success('PDF copié dans le presse-papiers');
      } else {
        toast.info('Votre navigateur ne supporte pas la copie de fichiers');
      }
    } catch {
      toast.error('Copie non supportée par le navigateur');
    }
  };

  const redownload = () => {
    if (!preloaded) return;
    const link = document.createElement('a');
    link.href = preloaded.objectUrl;
    link.download = preloaded.fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('PDF téléchargé à nouveau');
  };

  const navigateToTool = useCallback((toolPath: string) => {
    if (!status?.url) return;
    const newSrc = status.url.replace(/\/$/, '') + toolPath;
    setIframeSrc(newSrc);
    setIframeLoaded(false);
  }, [status?.url]);

  // Exit fullscreen on Escape
  useEffect(() => {
    if (!fullscreen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setFullscreen(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [fullscreen]);

  const renderHeader = () => (
    <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-medium text-navy dark:text-white flex items-center gap-2">
            <FileText className="h-6 w-6 text-primary" />
            Outils PDF
          </h1>
          {status && (
            <StatusPill status={status} loading={loading} onRefresh={fetchStatus} />
          )}
        </div>
        <p className="text-sm text-taupe dark:text-slate-400 mt-1">
          Suite complète d&apos;outils PDF : fusionner, diviser, OCR, compresser, filigraner,
          signer, convertir, nettoyer — le tout sans quitter l&apos;intranet.
        </p>
      </div>
      {status?.ok && (
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setFullscreen((f) => !f)}
            title={fullscreen ? 'Quitter le plein écran (Esc)' : 'Plein écran'}
          >
            {fullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            {fullscreen ? 'Réduire' : 'Plein écran'}
          </Button>
          <a
            href={status.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline px-3 py-2"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Ouvrir dans un nouvel onglet
          </a>
        </div>
      )}
    </div>
  );

  const renderToolbar = () => {
    if (!status?.ok) return null;
    return (
      <div className="flex items-center gap-1.5 overflow-x-auto py-1">
        <span className="text-[10px] text-taupe dark:text-slate-500 flex-shrink-0 mr-1">Accès rapide :</span>
        {STIRLING_TOOLS.map((tool) => {
          const Icon = tool.icon;
          const isActive = iframeSrc?.includes(tool.path);
          return (
            <button
              key={tool.path}
              type="button"
              onClick={() => navigateToTool(tool.path)}
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors flex-shrink-0 ${
                isActive
                  ? 'bg-primary/10 text-primary border border-primary/20'
                  : 'bg-gray-100 dark:bg-slate-800 text-taupe dark:text-slate-400 hover:bg-gray-200 dark:hover:bg-slate-700 hover:text-navy dark:hover:text-white border border-transparent'
              }`}
            >
              <Icon className="h-3 w-3" />
              {tool.label}
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => { setIframeSrc(status.url); setIframeLoaded(false); }}
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium bg-gray-100 dark:bg-slate-800 text-taupe dark:text-slate-400 hover:bg-gray-200 dark:hover:bg-slate-700 hover:text-navy dark:hover:text-white border border-transparent transition-colors flex-shrink-0"
        >
          Accueil Stirling
        </button>
      </div>
    );
  };

  const renderContent = () => {
    if (loading) {
      return (
        <Card>
          <CardContent className="py-16 text-center">
            <Loader2 className="h-10 w-10 text-primary mx-auto animate-spin mb-4" />
            <p className="text-sm text-taupe dark:text-slate-400">
              Vérification du service Stirling PDF...
            </p>
          </CardContent>
        </Card>
      );
    }

    if (!status) return null;

    if (!status.enabled) {
      return (
        <Card className="border-l-4 border-l-amber-400">
          <CardContent className="py-8">
            <div className="flex items-start gap-4">
              <div className="h-12 w-12 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center flex-shrink-0">
                <AlertTriangle className="h-6 w-6 text-amber-600 dark:text-amber-400" />
              </div>
              <div className="flex-1">
                <h3 className="text-base font-semibold text-navy dark:text-white mb-2">
                  Stirling PDF n&apos;est pas activé
                </h3>
                <p className="text-sm text-taupe dark:text-slate-400 mb-4">
                  Le module d&apos;outils PDF est désactivé. Contactez votre administrateur
                  pour l&apos;activer.
                </p>
                <div className="bg-gray-50 dark:bg-slate-800 rounded-lg p-4 text-xs font-mono text-taupe dark:text-slate-400">
                  <p className="mb-2 font-semibold text-navy dark:text-white not-italic">
                    Pour activer (côté serveur) :
                  </p>
                  <p># 1. Démarrer Stirling PDF en Docker</p>
                  <p className="text-emerald-600 dark:text-emerald-400">
                    docker run -d --name stirling-pdf -p 8080:8080 \<br />
                    {'  '}-e SECURITY_ENABLE_LOGIN=false \<br />
                    {'  '}-e SYSTEM_DEFAULTLOCALE=fr_FR \<br />
                    {'  '}--restart unless-stopped frooodle/s-pdf:latest
                  </p>
                  <p className="mt-3"># 2. Dans le fichier .env du backend</p>
                  <p className="text-emerald-600 dark:text-emerald-400">
                    STIRLING_PDF_ENABLED=true<br />
                    STIRLING_PDF_URL=http://localhost:8080
                  </p>
                  <p className="mt-3"># 3. Redémarrer le backend</p>
                  <p className="text-emerald-600 dark:text-emerald-400">
                    systemctl restart omnitech-backend
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      );
    }

    if (!status.ok) {
      return (
        <Card className="border-l-4 border-l-red-500">
          <CardContent className="py-8">
            <div className="flex items-start gap-4">
              <div className="h-12 w-12 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center flex-shrink-0">
                <XCircle className="h-6 w-6 text-red-600 dark:text-red-400" />
              </div>
              <div className="flex-1">
                <h3 className="text-base font-semibold text-navy dark:text-white mb-2">
                  Service Stirling PDF injoignable
                </h3>
                <p className="text-sm text-taupe dark:text-slate-400 mb-2">
                  {status.message}
                </p>
                <p className="text-xs text-taupe dark:text-slate-500">
                  URL configurée : <code className="font-mono">{status.url}</code>
                </p>
                <Button variant="outline" size="sm" onClick={fetchStatus} className="mt-4">
                  <RefreshCw className="h-3.5 w-3.5" />
                  Réessayer
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      );
    }

    // Stirling est opérationnel — iframe native
    return (
      <div className="space-y-2">
        {/* Bandeau PDF préchargé — compact avec countdown */}
        {preloaded && showPreloadBanner && (
          <div className="relative rounded-lg border border-[#F9964A]/30 bg-gradient-to-r from-[#F9964A]/10 to-transparent p-2 overflow-hidden">
            <div className="flex items-center gap-3">
              <Download className="h-4 w-4 text-[#F9964A] flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-navy dark:text-white truncate">
                  PDF téléchargé : {preloaded.fileName}
                  <span className="font-normal text-taupe dark:text-slate-400 ml-2">
                    ({(preloaded.fileSize / 1024).toFixed(1)} Ko) — Glissez-le dans Stirling ci-dessous
                  </span>
                </p>
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <Button size="sm" variant="outline" onClick={redownload} className="h-7 text-[10px] px-2">
                  <Download className="h-3 w-3" />
                  Re-télécharger
                </Button>
                <Button size="sm" variant="outline" onClick={copyPdfInfo} className="h-7 text-[10px] px-2">
                  <Copy className="h-3 w-3" />
                  Copier
                </Button>
                <button
                  type="button"
                  onClick={() => { setShowPreloadBanner(false); setCountdownActive(false); }}
                  className="p-1 rounded text-taupe hover:text-navy dark:hover:text-white transition-colors"
                >
                  <XCircle className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
            {/* Countdown progress bar */}
            {countdownActive && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#F9964A]/20">
                <div
                  className="h-full bg-[#F9964A]/60"
                  style={{ animation: 'focus-countdown 10s linear forwards' }}
                />
              </div>
            )}
          </div>
        )}
        {preloadError && (
          <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-3 text-xs text-red-700 dark:text-red-400 flex items-start gap-2">
            <XCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">Impossible de précharger le document</p>
              <p className="mt-0.5">{preloadError}</p>
            </div>
          </div>
        )}

        {/* Barre d'outils rapides */}
        {renderToolbar()}

        <Card className="overflow-hidden">
          <div className="relative bg-gray-50 dark:bg-slate-900">
            {!iframeLoaded && (
              <div className="absolute inset-0 flex items-center justify-center bg-white/80 dark:bg-slate-950/80 z-10">
                <div className="text-center">
                  <Loader2 className="h-8 w-8 text-primary mx-auto animate-spin mb-2" />
                  <p className="text-xs text-taupe dark:text-slate-400">
                    Chargement de Stirling PDF...
                  </p>
                </div>
              </div>
            )}
            <iframe
              src={iframeSrc || status.url}
              title="Stirling PDF"
              className="w-full border-0"
              style={{ height: docId ? 'calc(100vh - 180px)' : 'calc(100vh - 120px)', minHeight: 600 }}
              onLoad={() => setIframeLoaded(true)}
              sandbox="allow-same-origin allow-scripts allow-forms allow-downloads allow-popups allow-popups-to-escape-sandbox allow-modals"
              referrerPolicy="no-referrer"
              allow="clipboard-read; clipboard-write"
            />
          </div>
        </Card>
      </div>
    );
  };

  // Mode plein écran : iframe occupe tout l'écran
  if (fullscreen && status?.ok) {
    return (
      <div className="fixed inset-0 z-[100] bg-white dark:bg-slate-950 flex flex-col">
        <div className="flex items-center justify-between px-4 py-2 border-b border-gray-200 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-primary" />
            <span className="text-sm font-semibold text-navy dark:text-white">
              Stirling PDF {status.version ? `· ${status.version}` : ''}
            </span>
          </div>
          <Button variant="outline" size="sm" onClick={() => setFullscreen(false)}>
            <Minimize2 className="h-4 w-4" />
            Quitter (Esc)
          </Button>
        </div>
        <iframe
          src={iframeSrc || status.url}
          title="Stirling PDF — Plein écran"
          className="flex-1 w-full border-0"
          sandbox="allow-same-origin allow-scripts allow-forms allow-downloads allow-popups allow-popups-to-escape-sandbox allow-modals"
          referrerPolicy="no-referrer"
          allow="clipboard-read; clipboard-write"
        />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {renderHeader()}
      {renderContent()}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Status pill (coin droit du header)
// ---------------------------------------------------------------------------
function StatusPill({
  status,
  loading,
  onRefresh,
}: {
  status: StirlingStatus;
  loading: boolean;
  onRefresh: () => void;
}) {
  if (loading) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 px-2.5 py-1 text-[10px] font-semibold text-taupe">
        <Loader2 className="h-3 w-3 animate-spin" />
        Vérification
      </span>
    );
  }
  if (!status.enabled) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 px-2.5 py-1 text-[10px] font-semibold text-taupe">
        <XCircle className="h-3 w-3" />
        Désactivé
      </span>
    );
  }
  if (status.ok) {
    return (
      <div className="flex items-center gap-1.5">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/20 px-2.5 py-1 text-[10px] font-semibold text-emerald-700 dark:text-emerald-400">
          <CheckCircle2 className="h-3 w-3" />
          En ligne{status.version ? ` · ${status.version}` : ''}
        </span>
        <button
          type="button"
          onClick={onRefresh}
          className="p-1 rounded text-taupe hover:text-primary hover:bg-primary/10 transition-colors"
          title="Actualiser"
          aria-label="Actualiser"
        >
          <RefreshCw className="h-3 w-3" />
        </button>
      </div>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 px-2.5 py-1 text-[10px] font-semibold text-red-700 dark:text-red-400">
      <XCircle className="h-3 w-3" />
      Hors ligne
    </span>
  );
}
