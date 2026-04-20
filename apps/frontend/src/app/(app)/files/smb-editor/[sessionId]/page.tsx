'use client';

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { Button, Card, CardContent } from '@omnitech/ui';
import { ArrowLeft, AlertTriangle, Loader2 } from 'lucide-react';
import { useTranslation } from '@/lib/i18n';

interface StoredEditorConfig {
  sessionId: string;
  documentServerUrl: string;
  canEdit: boolean;
  extension: string;
  fileName: string;
  config: any;
}

/**
 * Remplace localhost par le hostname courant du navigateur (utile en dev
 * quand le backend renvoie une URL interne style http://localhost:8082).
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
    return parsed.toString().replace(/\/$/, '');
  } catch {
    return backendUrl;
  }
}

/**
 * Page d'édition d'un fichier SMB via OnlyOffice.
 * La config OnlyOffice est récupérée depuis sessionStorage (déposée par /files
 * juste avant la navigation), pour éviter de devoir refaire un POST authentifié
 * (qui créerait une nouvelle session à chaque montage de la page).
 */
export default function SmbEditorPage() {
  const { t } = useTranslation();
  const params = useParams<{ sessionId: string }>();
  const router = useRouter();

  const [editorData, setEditorData] = useState<StoredEditorConfig | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scriptLoaded, setScriptLoaded] = useState(false);
  const placeholderRef = useRef<HTMLDivElement>(null);
  const editorInstanceRef = useRef<any>(null);

  // Charge la config depuis sessionStorage
  useEffect(() => {
    if (!params.sessionId) return;
    try {
      const raw = sessionStorage.getItem('smb-office-' + params.sessionId);
      if (!raw) {
        setError(
          "Session OnlyOffice introuvable en sessionStorage. " +
            "Retournez sur la page Fichiers et réouvrez le document.",
        );
        return;
      }
      const parsed = JSON.parse(raw) as StoredEditorConfig;
      parsed.documentServerUrl = resolveClientUrl(parsed.documentServerUrl);
      setEditorData(parsed);
    } catch (e: any) {
      setError(e?.message || 'Configuration OnlyOffice corrompue');
    }
  }, [params.sessionId]);

  // Hauteur explicite sur le placeholder
  useEffect(() => {
    const apply = () => {
      const el = placeholderRef.current;
      if (!el) return;
      const h = Math.max(600, window.innerHeight - 140);
      el.style.height = `${h}px`;
      el.style.minHeight = `${h}px`;
      el.style.maxHeight = `${h}px`;
    };
    apply();
    window.addEventListener('resize', apply);
    return () => window.removeEventListener('resize', apply);
  }, [editorData]);

  // Charge le script OnlyOffice
  useEffect(() => {
    if (!editorData) return;
    if ((window as any).DocsAPI?.DocEditor) {
      setScriptLoaded(true);
      return;
    }
    const scriptUrl = `${editorData.documentServerUrl}/web-apps/apps/api/documents/api.js`;
    const existing = document.querySelector(`script[src="${scriptUrl}"]`);
    if (existing) {
      const check = () => {
        if ((window as any).DocsAPI?.DocEditor) setScriptLoaded(true);
      };
      existing.addEventListener('load', check);
      check();
      return;
    }
    const script = document.createElement('script');
    script.src = scriptUrl;
    script.async = true;
    script.onload = () => {
      if ((window as any).DocsAPI?.DocEditor) {
        setScriptLoaded(true);
      } else {
        setError(
          `OnlyOffice a répondu mais DocsAPI n'est pas défini. Vérifiez ${scriptUrl}.`,
        );
      }
    };
    script.onerror = () =>
      setError(`Impossible de charger le script OnlyOffice depuis ${scriptUrl}.`);
    document.body.appendChild(script);
  }, [editorData]);

  // Mount de l'éditeur
  useEffect(() => {
    if (editorInstanceRef.current) return;
    if (!scriptLoaded || !editorData || !placeholderRef.current) return;

    const placeholder = document.getElementById('onlyoffice-placeholder');
    if (!placeholder) return;

    const DocsAPI = (window as any).DocsAPI;
    if (!DocsAPI || typeof DocsAPI.DocEditor !== 'function') {
      setError("DocsAPI indisponible après chargement du script.");
      return;
    }

    const measuredH = Math.max(500, placeholder.offsetHeight || window.innerHeight - 200);
    const measuredW = Math.max(600, placeholder.offsetWidth || window.innerWidth - 80);

    try {
      const configWithEvents = {
        ...editorData.config,
        width: `${measuredW}px`,
        height: `${measuredH}px`,
        events: {
          onError: (event: any) => {
            // eslint-disable-next-line no-console
            console.error('OnlyOffice error:', event);
            setError(event?.data?.errorDescription || 'Erreur OnlyOffice');
          },
          onDocumentReady: () => {
            const forceFill = () => {
              const iframe = placeholder.querySelector('iframe') as HTMLIFrameElement | null;
              if (!iframe) return;
              const targetH = Math.max(500, window.innerHeight - 200);
              iframe.style.cssText = `width: 100% !important; height: ${targetH}px !important; min-height: 500px !important; display: block !important; border: 0 !important;`;
            };
            forceFill();
            setTimeout(forceFill, 200);
            setTimeout(forceFill, 800);
          },
        },
      };
      editorInstanceRef.current = new DocsAPI.DocEditor('onlyoffice-placeholder', configWithEvents);
    } catch (err: any) {
      setError(err?.message || String(err));
    }
  }, [scriptLoaded, editorData]);

  if (error) {
    return (
      <div className="space-y-4">
        <Link href="/files" className="inline-flex items-center gap-2 text-sm text-primary hover:underline">
          <ArrowLeft className="h-4 w-4" /> Retour aux fichiers
        </Link>
        <Card className="border-2 border-red-200 dark:border-red-900/40">
          <CardContent className="py-8 text-center">
            <AlertTriangle className="h-10 w-10 text-red-500 mx-auto mb-3" />
            <h2 className="text-lg font-semibold text-seal-navy dark:text-white mb-2">
              Impossible d'ouvrir l'éditeur
            </h2>
            <p className="text-sm text-seal-gray-500 dark:text-slate-400 max-w-xl mx-auto">{error}</p>
            <Button className="mt-4" onClick={() => router.push('/files')}>
              Retour aux fichiers
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!editorData) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
        <span className="ml-2 text-sm text-seal-gray-500">Chargement de l'éditeur…</span>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Link href="/files" className="inline-flex items-center gap-2 text-sm text-primary hover:underline">
          <ArrowLeft className="h-4 w-4" /> Retour aux fichiers
        </Link>
        <div className="text-sm text-seal-navy dark:text-white font-medium truncate max-w-md">
          {editorData.fileName}
          {!editorData.canEdit && (
            <span className="ml-2 text-xs text-seal-gray-500">(lecture seule)</span>
          )}
        </div>
      </div>

      <div
        id="onlyoffice-placeholder"
        ref={placeholderRef}
        style={{ width: '100%', height: '80vh', minHeight: '600px' }}
        className="rounded-lg border border-gray-200 dark:border-slate-700 overflow-hidden bg-white"
      />
    </div>
  );
}
