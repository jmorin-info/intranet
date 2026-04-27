'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { api } from '@/lib/api';
import { toast } from 'sonner';
import { Card, CardContent, Button } from '@omnitech/ui';
import {
  ArrowLeft, FileText, AlertTriangle, Loader2, CheckCircle2, XCircle, ExternalLink, Eye, Edit,
  LogOut, Save, Circle,
} from 'lucide-react';
import { useTranslation } from '@/lib/i18n';
import { logger } from '@/lib/logger';

interface EditorConfig {
  documentServerUrl: string;
  config: any;
  canEdit: boolean;
  canEditReason?: {
    code:
      | 'OK'
      | 'VIEW_MODE'
      | 'FORMAT_READONLY'
      | 'NOT_AUTHORIZED'
      | 'STATUS_OBSOLETE'
      | 'STATUS_ARCHIVED'
      | 'STATUS_APPROVED_NOT_OWNER';
    message: string;
    actionHint?: string;
  };
  extension: string;
  document: {
    id: string;
    title: string;
    reference: string;
    status: string;
    classification: string;
  };
  diagnostic?: {
    internalBackendUrl: string;
    fileUrl: string;
    jwtConfigured: boolean;
  };
}

interface OfficeDiagnose {
  runtime: {
    enabled: boolean;
    documentServerUrl: string;
    internalBackendUrl: string;
    jwtSigningConfig: boolean;
    allowUnsigned?: boolean;
  };
  docsServerHealth: { ok: boolean; message: string };
  backendReachability: {
    ok: boolean;
    internalBackendUrl: string;
    status?: number;
    message: string;
  };
  jwtMatch?: boolean | 'unknown';
  jwtMessage?: string;
  jwtHttpStatus?: number;
}

/**
 * Remplace `localhost` par le hostname courant du navigateur.
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

/** Icône format selon l'extension */
function getFormatInfo(ext: string): { label: string; color: string } {
  const e = ext.toLowerCase();
  if (/^docx?$/.test(e) || e === 'odt' || e === 'rtf') return { label: 'Word', color: 'text-blue-600' };
  if (/^xlsx?$/.test(e) || e === 'ods' || e === 'csv') return { label: 'Excel', color: 'text-emerald-600' };
  if (/^pptx?$/.test(e) || e === 'odp') return { label: 'PowerPoint', color: 'text-orange-600' };
  if (e === 'txt') return { label: 'Texte', color: 'text-gray-600 dark:text-slate-400' };
  return { label: ext.toUpperCase(), color: 'text-primary' };
}

// useEditorContainer hook removed — placeholder creation is now inline in the
// component via a callback ref (wrapperRef) that fires when React attaches the
// wrapper div to the DOM, solving the timing issue where the placeholder was
// never created because the wrapper was behind a loading early-return.

/**
 * Page d'édition d'un document via OnlyOffice Docs Server.
 */
export default function DocumentEditorPage() {
  const { t } = useTranslation();
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();
  const mode = (searchParams.get('mode') as 'edit' | 'view') || 'edit';

  const [editorConfig, setEditorConfig] = useState<EditorConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [scriptLoaded, setScriptLoaded] = useState(false);
  const [editorMounted, setEditorMounted] = useState(false);
  const [editorError, setEditorError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'unsaved' | 'idle'>('idle');
  const [diagnose, setDiagnose] = useState<OfficeDiagnose | null>(null);
  const [diagnoseLoading, setDiagnoseLoading] = useState(false);
  const [watchdogFired, setWatchdogFired] = useState(false);
  const [overlapping, setOverlapping] = useState<string[]>([]);
  const [placeholderReady, setPlaceholderReady] = useState(false);

  // useEditorContainer with a callback that signals placeholder is ready
  const placeholderRef = useRef<HTMLDivElement | null>(null);
  const wrapperRef = useCallback((node: HTMLDivElement | null) => {
    if (!node) {
      // Cleanup on unmount
      if (placeholderRef.current) {
        placeholderRef.current.remove();
        placeholderRef.current = null;
      }
      setPlaceholderReady(false);
      return;
    }
    // Create the placeholder div outside React's vDOM
    const div = document.createElement('div');
    div.id = 'onlyoffice-placeholder';
    Object.assign(div.style, {
      position: 'relative',
      display: 'block',
      width: '100%',
      height: 'calc(100vh - 280px)',
      minHeight: '500px',
      background: 'transparent',
      isolation: 'isolate',
      overflow: 'visible',
    });
    node.appendChild(div);
    placeholderRef.current = div;
    setPlaceholderReady(true);
  }, []);
  const editorInstanceRef = useRef<any>(null);

  // Watchdog: si onDocumentReady ne se déclenche pas dans les 20s après le
  // chargement de la config, on considère que le Docs Server a silencieusement
  // échoué à télécharger le fichier (cas typique: URL interne inaccessible depuis
  // le conteneur). On lance alors le diagnostic backend pour guider l'utilisateur.
  useEffect(() => {
    if (!editorConfig || editorMounted || error || editorError) return;
    const timer = setTimeout(async () => {
      setWatchdogFired(true);
      setDiagnoseLoading(true);
      try {
        const { data } = await api.get<OfficeDiagnose>('/office/diagnose');
        setDiagnose(data);
      } catch {
        // swallow — on affichera juste le panneau générique
      } finally {
        setDiagnoseLoading(false);
      }
    }, 20000);
    return () => clearTimeout(timer);
  }, [editorConfig, editorMounted, error, editorError]);

  // NOTE : le focus-mode CSS causait la disparition de l'éditeur car les sélecteurs
  // `div:has(> header) { display:none }` cachaient le wrapper contenant <main>.
  // On ne l'utilise PLUS ici. L'éditeur s'affiche dans le layout normal avec sidebar.

  // Neutralise les animations parent (main { animation: fadeIn }) qui peuvent
  // faire qu'OnlyOffice initialise son canvas à 0px pendant un composite.
  useEffect(() => {
    document.body.classList.add('editor-no-anim');
    return () => {
      document.body.classList.remove('editor-no-anim');
    };
  }, []);

  // Mesure la hauteur dispo en pixels ABSOLUS et l'applique sur le placeholder.
  // OnlyOffice se base sur getBoundingClientRect du conteneur au moment du mount
  // et ne re-dimensionne jamais tout seul. Un `height: 100vh` peut résoudre à 0px
  // si la chaîne d'ancêtres a un flex/overflow cassé. On force donc une valeur
  // numérique absolue et on ré-applique sur resize + ResizeObserver.
  useEffect(() => {
    const applyHeight = () => {
      const el = placeholderRef.current;
      if (!el) return;
      const h = Math.max(600, window.innerHeight - 140);
      el.style.height = `${h}px`;
      el.style.maxHeight = `${h}px`;
      el.style.minHeight = `${h}px`;
    };
    applyHeight();
    window.addEventListener('resize', applyHeight);
    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined' && placeholderRef.current?.parentElement) {
      ro = new ResizeObserver(() => applyHeight());
      ro.observe(placeholderRef.current.parentElement);
    }
    return () => {
      window.removeEventListener('resize', applyHeight);
      ro?.disconnect();
    };
  }, [editorConfig]);

  // Ctrl+S handler
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        // Try to trigger force save via OnlyOffice API if available
        try {
          if (editorInstanceRef.current?.triggerForceSave) {
            editorInstanceRef.current.triggerForceSave();
            toast.success('Sauvegarde forcée déclenchée');
          } else {
            toast.info('Auto-save activé — vos modifications sont sauvegardées automatiquement');
          }
        } catch {
          toast.info('Auto-save activé — vos modifications sont sauvegardées automatiquement');
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Fetch editor config from backend
  useEffect(() => {
    async function fetchConfig() {
      try {
        const res = await api.get<EditorConfig>(`/office/editor/${params.id}?mode=${mode}`);
        // L'intercepteur axios renvoie { data: null, status } pour 403/429 sur GET
        // (cf. api.ts) — ne PAS déréférencer data dans ce cas, sinon TypeError.
        if (!res.data || !res.data.documentServerUrl) {
          const status = (res as { status?: number }).status;
          if (status === 403) {
            setError(
              "Accès refusé à ce document — vous n'avez pas les permissions pour l'ouvrir. " +
                'Vérifiez votre session ou contactez un administrateur.',
            );
          } else if (status === 429) {
            setError('Trop de requêtes — patientez quelques secondes puis réessayez.');
          } else {
            setError(
              "Le serveur n'a pas renvoyé de configuration d'éditeur. " +
                'Vérifiez que OnlyOffice est bien activé côté backend (ONLYOFFICE_ENABLED=true) ' +
                'et que ONLYOFFICE_DOCUMENT_SERVER_URL est accessible.',
            );
          }
          return;
        }
        setEditorConfig({
          ...res.data,
          documentServerUrl: resolveClientUrl(res.data.documentServerUrl),
        });
      } catch (err: any) {
        const msg =
          err?.response?.data?.message ||
          err?.message ||
          "Impossible de charger l'éditeur";
        setError(msg);
      } finally {
        setLoading(false);
      }
    }
    if (params.id) fetchConfig();
  }, [params.id, mode]);

  // Load OnlyOffice api.js script — avec vérification que DocsAPI est bien défini
  // après le onload (certains 404 HTML servent un 200 avec HTML parsé comme JS,
  // ce qui déclenche onload sans définir DocsAPI → DocEditor échoue avec "t is null").
  useEffect(() => {
    if (!editorConfig) return;
    if (!editorConfig.documentServerUrl) {
      setError("URL du serveur OnlyOffice non définie — vérifiez ONLYOFFICE_DOCUMENT_SERVER_URL côté backend.");
      return;
    }

    // Refuse le mixed content : si la page est en HTTPS mais l'URL OnlyOffice en HTTP,
    // le navigateur va bloquer silencieusement. Mieux vaut un message clair.
    if (typeof window !== 'undefined' && window.location.protocol === 'https:' && editorConfig.documentServerUrl.startsWith('http:')) {
      setError(
        `Mixed content : la page est en HTTPS mais OnlyOffice est en HTTP (${editorConfig.documentServerUrl}). ` +
          "Servez OnlyOffice via un reverse proxy HTTPS (sous-domaine ou /onlyoffice/).",
      );
      return;
    }

    const scriptUrl = `${editorConfig.documentServerUrl}/web-apps/apps/api/documents/api.js`;

    // Déjà disponible (script chargé au préalable ou HMR)
    if ((window as any).DocsAPI?.DocEditor) {
      setScriptLoaded(true);
      return;
    }

    // Si le script est déjà présent (autre instance), on attend son load
    const existing = document.querySelector(`script[src="${scriptUrl}"]`);
    if (existing) {
      const checkReady = () => {
        if ((window as any).DocsAPI?.DocEditor) {
          setScriptLoaded(true);
        } else {
          setError("Le script OnlyOffice a chargé mais DocsAPI n'est pas défini — réponse non-JS (404 ?).");
        }
      };
      existing.addEventListener('load', checkReady);
      // Cas où le script est déjà terminé : vérifie immédiatement
      if ((window as any).DocsAPI?.DocEditor) checkReady();
      return;
    }

    const script = document.createElement('script');
    script.src = scriptUrl;
    script.async = true;
    script.onload = () => {
      // Certains serveurs renvoient un 200 avec du HTML (page d'erreur), le parseur JS
      // l'accepte silencieusement et déclenche onload sans définir DocsAPI.
      if ((window as any).DocsAPI?.DocEditor) {
        setScriptLoaded(true);
      } else {
        setError(
          `OnlyOffice a répondu mais DocsAPI n'est pas défini. Vérifiez que ${scriptUrl} renvoie bien le fichier api.js et pas une page HTML.`,
        );
      }
    };
    script.onerror = () =>
      setError(
        `Impossible de charger le script OnlyOffice Docs depuis ${scriptUrl}. ` +
          "Vérifiez la connectivité, le DNS du sous-domaine et les règles CORS de BunkerWeb.",
      );
    document.body.appendChild(script);
  }, [editorConfig]);

  // Mount the OnlyOffice editor ONCE when config + script are ready.
  // IMPORTANT : pas de `router` ni `editorConfig` dans les deps pour éviter
  // les re-renders qui détruisent et recréent l'éditeur (cause du flash).
  // On utilise des refs pour accéder aux valeurs sans dépendance.
  const editorConfigRef = useRef(editorConfig);
  editorConfigRef.current = editorConfig;
  // Hard init guard — survives React Strict Mode double-mount.
  // Unlike editorInstanceRef (reset on cleanup), this persists across the
  // mount/unmount/remount cycle to prevent double initialization.
  const initGuardRef = useRef(false);

  useEffect(() => {
    // HARD GUARD: prevent double init
    if (initGuardRef.current) { return; }
    if (editorInstanceRef.current) { return; }
    if (!scriptLoaded) { return; }
    if (!editorConfigRef.current) { return; }
    if (!placeholderReady || !placeholderRef.current) { return; }

    const placeholder = placeholderRef.current;

    const DocsAPI = (window as any).DocsAPI;
    if (!DocsAPI || typeof DocsAPI.DocEditor !== 'function') {
      setError(
        "DocsAPI indisponible après chargement du script — le serveur OnlyOffice a renvoyé " +
          "une réponse invalide (souvent un 404 HTML parsé comme JS). Vérifiez que " +
          `${editorConfigRef.current.documentServerUrl}/web-apps/apps/api/documents/api.js ` +
          "est bien accessible.",
      );
      return;
    }

    const cfg = editorConfigRef.current;

    // Validation stricte de la config avant de passer à OnlyOffice.
    // Évite l'erreur minifiée "t is null" côté DocsAPI quand un champ manque.
    if (!cfg.config || typeof cfg.config !== 'object') {
      setError("Configuration OnlyOffice invalide : objet 'config' manquant.");
      return;
    }
    if (!cfg.config.document?.url || !cfg.config.document?.key || !cfg.config.document?.fileType) {
      setError(
        "Configuration OnlyOffice incomplète : document.url / document.key / document.fileType manquants. " +
          "Vérifiez que le backend a bien résolu une version pour ce document.",
      );
      return;
    }
    if (!cfg.config.documentType) {
      setError("Configuration OnlyOffice incomplète : 'documentType' manquant (word/cell/slide).");
      return;
    }

    // === DIMENSIONS EXPLICITES POUR DocsAPI ===
    // OnlyOffice v9 résout souvent mal les `height: 100%` si la chaîne
    // d'ancêtres flex/grid n'a pas de hauteur calculable dès le mount.
    // On passe donc des pixels absolus, mesurés sur le placeholder réel au
    // moment du mount. Si la mesure revient à 0 (cas pathologique), on
    // tombe sur un fallback raisonnable (viewport - 160 px).
    // Hauteur cible : viewport - header/breadcrumb/status bar + marges
    const measuredH = Math.max(500, placeholder.offsetHeight || window.innerHeight - 280);
    const measuredW = Math.max(600, placeholder.offsetWidth || window.innerWidth - 80);

    try {
      const configWithEvents = {
        ...cfg.config,
        // IMPORTANT : width/height explicites au niveau top de la config DocsAPI.
        // La plupart des problèmes "toolbar visible mais canvas vide" sur
        // OnlyOffice v9 sont résolus en passant ces deux propriétés.
        width: `${measuredW}px`,
        height: `${measuredH}px`,
        events: {
          onDocumentStateChange: (event: any) => {
            if (event.data) {
              setSaveStatus('unsaved');
            } else {
              setSaveStatus('saved');
            }
          },
          onError: (event: any) => {
            const desc = event.data?.errorDescription || event.data?.message || 'Erreur inconnue';
            // Forward to Sentry — payload contient seulement le code/desc OnlyOffice, pas de données sensibles
            logger.error(new Error(`[OnlyOffice] editor error: ${desc}`), { tool: 'OnlyOffice', desc });
            setEditorError(desc);
          },
          onWarning: (event: any) => {
            logger.warn('[OnlyOffice] warning', { description: event?.data?.warningDescription });
          },
          onDocumentReady: () => {
            setEditorMounted(true);
            setSaveStatus('saved');

            // === FORCE-RESIZE DE L'IFRAME POST-MOUNT ===
            // OnlyOffice crée son iframe avec `height: 100%`. Si le parent
            // a une hauteur calculée à 0 au moment du mount, on force une
            // override inline hyper-spécifique pour écraser la règle.
            const forceIframeFill = () => {
              const el = document.getElementById('onlyoffice-placeholder');
              if (!el) return;
              const iframe = el.querySelector('iframe') as HTMLIFrameElement | null;
              if (!iframe) return;
              const targetH = Math.max(500, window.innerHeight - 280);
              iframe.style.cssText = `width: 100% !important; height: ${targetH}px !important; min-height: 500px !important; display: block !important; border: 0 !important; margin: 0 !important; padding: 0 !important; position: relative !important;`;
            };
            forceIframeFill();

            // Burst de resize events pour qu'OnlyOffice recalcule tout
            const burst = () => {
              window.dispatchEvent(new Event('resize'));
              forceIframeFill();
            };
            requestAnimationFrame(() => {
              burst();
              setTimeout(burst, 100);
              setTimeout(burst, 300);
              setTimeout(burst, 800);
              setTimeout(burst, 2000);
            });

            // ResizeObserver permanent sur l'iframe : si elle collapse à 0
            // pour une raison quelconque, on la re-force instantanément.
            if (typeof ResizeObserver !== 'undefined') {
              const el = document.getElementById('onlyoffice-placeholder');
              const iframe = el?.querySelector('iframe');
              if (iframe) {
                const observer = new ResizeObserver((entries) => {
                  for (const entry of entries) {
                    if (entry.contentRect.height < 100) {
                      // Iframe collapsed — silently re-apply forced dimensions
                      forceIframeFill();
                    }
                  }
                });
                observer.observe(iframe);
              }
            }
          },
        },
      };

      // Mark as initialized BEFORE calling DocsAPI (synchronous guard)
      initGuardRef.current = true;
      editorInstanceRef.current = new DocsAPI.DocEditor('onlyoffice-placeholder', configWithEvents);
    } catch (err) {
      // Forward to Sentry — message ne contient pas de données sensibles (juste le throw OnlyOffice)
      logger.error(err, { tool: 'OnlyOffice', context: 'mount' });
      initGuardRef.current = false;
      setError(err instanceof Error ? err.message : String(err));
    }

    // Cleanup on unmount: destroy the editor and clear DOM.
    // initGuardRef stays TRUE to block the Strict Mode remount attempt.
    // It resets only when the component fully unmounts (dependency change).
    return () => {
      try {
        editorInstanceRef.current?.destroyEditor?.();
      } catch { /* editor may already be gone */ }
      editorInstanceRef.current = null;
      // Clear placeholder DOM to prevent orphaned nodes
      if (placeholderRef.current) placeholderRef.current.innerHTML = '';
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scriptLoaded, placeholderReady]);

  const handleQuitEditor = useCallback(() => {
    router.push(`/documents/${params.id}`);
  }, [router, params.id]);

  /**
   * Diagnostic "filtre blanc" : recense tous les éléments du DOM qui
   * occupent la même région que le placeholder OnlyOffice. Un élément non
   * attendu (overlay, skeleton, backdrop…) trahit immédiatement la cause.
   */
  const runOverlapDiagnostic = useCallback(() => {
    const el = placeholderRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const all = Array.from(document.querySelectorAll<HTMLElement>('body *'));
    const found = all
      .filter((node) => {
        if (node === el || el.contains(node) || node.contains(el)) return false;
        if (node.tagName === 'SCRIPT' || node.tagName === 'STYLE' || node.tagName === 'LINK') return false;
        const er = node.getBoundingClientRect();
        if (er.width === 0 || er.height === 0) return false;
        const cs = window.getComputedStyle(node);
        if (cs.visibility === 'hidden' || cs.display === 'none' || cs.opacity === '0') return false;
        // intersection
        return er.top < r.bottom && er.bottom > r.top && er.left < r.right && er.right > r.left;
      })
      .map((node) => {
        const cs = window.getComputedStyle(node);
        const cls = typeof node.className === 'string' ? node.className : '';
        return `${node.tagName.toLowerCase()}${node.id ? '#' + node.id : ''}.${cls.split(/\s+/).slice(0, 4).join('.')} [pos=${cs.position} z=${cs.zIndex} bg=${cs.backgroundColor}]`;
      });
    setOverlapping(found);
    toast.info(`Diagnostic overlap : ${found.length} éléments chevauchent la zone`);
  }, []);

  // Auto-run overlap diagnostic quand le watchdog se déclenche
  useEffect(() => {
    if (watchdogFired) runOverlapDiagnostic();
  }, [watchdogFired, runOverlapDiagnostic]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="text-center">
          <Loader2 className="h-10 w-10 text-primary mx-auto animate-spin mb-3" />
          <p className="text-sm text-seal-gray-500 dark:text-slate-400">Chargement de l&apos;éditeur...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-2xl mx-auto space-y-4">
        <Link
          href={`/documents/${params.id}`}
          className="inline-flex items-center gap-1.5 text-sm text-seal-gray-500 hover:text-primary transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Retour au document
        </Link>

        <Card className="border-l-4 border-l-red-500">
          <CardContent className="py-6">
            <div className="flex items-start gap-4">
              <div className="h-12 w-12 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center flex-shrink-0">
                <XCircle className="h-6 w-6 text-red-600 dark:text-red-400" />
              </div>
              <div className="flex-1">
                <h3 className="text-base font-semibold text-seal-navy dark:text-white mb-2">
                  Impossible d&apos;ouvrir l&apos;éditeur
                </h3>
                <p className="text-sm text-seal-gray-500 dark:text-slate-400 mb-4 whitespace-pre-line">{error}</p>
                {error.includes('ONLYOFFICE_JWT_SECRET') && (
                  <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4 text-xs font-mono text-amber-900 dark:text-amber-200 mb-3">
                    <p className="font-semibold not-italic mb-2">
                      Problème détecté : mismatch JWT Docs Server
                    </p>
                    <p className="not-italic mb-2">Deux solutions possibles :</p>
                    <p className="mt-1"># Solution 1 : activer le secret (prod)</p>
                    <p className="text-emerald-700 dark:text-emerald-400">
                      # .env backend<br />
                      ONLYOFFICE_JWT_SECRET=une-valeur-aleatoire<br />
                      # docker-compose : JWT_SECRET identique<br />
                      JWT_ENABLED: &quot;true&quot;
                    </p>
                    <p className="mt-2"># Solution 2 : désactiver JWT (dev uniquement)</p>
                    <p className="text-emerald-700 dark:text-emerald-400">
                      docker run -d -p 8082:80 \<br />
                      {'  '}-e JWT_ENABLED=false \<br />
                      {'  '}onlyoffice/documentserver:latest<br />
                      <br />
                      # .env backend<br />
                      ONLYOFFICE_ALLOW_UNSIGNED=true
                    </p>
                    <p className="mt-2 not-italic">
                      <a
                        href="https://api.onlyoffice.com/editors/signature/"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline"
                      >
                        Doc OnlyOffice - Signature JWT
                      </a>
                    </p>
                  </div>
                )}
                {error.includes('désactivé') && !error.includes('ONLYOFFICE_JWT_SECRET') && (
                  <div className="bg-gray-50 dark:bg-slate-800 rounded-lg p-4 text-xs font-mono text-seal-gray-500 dark:text-slate-400">
                    <p className="font-semibold text-seal-navy dark:text-white not-italic mb-2">
                      Configuration requise côté serveur :
                    </p>
                    <p># 1. Démarrer OnlyOffice Docs Server</p>
                    <p className="text-emerald-600 dark:text-emerald-400">
                      docker run -d --name onlyoffice -p 8082:80 \<br />
                      {'  '}-e JWT_SECRET=votresecret \<br />
                      {'  '}--restart unless-stopped onlyoffice/documentserver:latest
                    </p>
                    <p className="mt-3"># 2. Dans le .env du backend :</p>
                    <p className="text-emerald-600 dark:text-emerald-400">
                      ONLYOFFICE_ENABLED=true<br />
                      ONLYOFFICE_DOCUMENT_SERVER_URL=http://localhost:8082<br />
                      ONLYOFFICE_JWT_SECRET=votresecret
                    </p>
                  </div>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => window.location.reload()}
                  className="mt-4"
                >
                  Réessayer
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!editorConfig) return null;

  const formatInfo = getFormatInfo(editorConfig.extension);

  return (
    <div className="space-y-2">
      {/* Header compact avec infos doc + actions */}
      <div className="flex items-center justify-between bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-lg px-4 py-2">
        <div className="flex items-center gap-3 min-w-0">
          <Link
            href={`/documents/${params.id}`}
            className="flex-shrink-0 p-1.5 rounded hover:bg-gray-100 dark:hover:bg-slate-800 text-seal-gray-500 hover:text-primary transition-colors"
            title="Retour au document"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <FileText className="h-4 w-4 text-primary flex-shrink-0" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-seal-navy dark:text-white truncate">
              {editorConfig.document.title}
            </p>
            <p className="text-[10px] text-seal-gray-500 dark:text-slate-400 truncate">
              {editorConfig.document.reference} · <span className={formatInfo.color}>{formatInfo.label}</span> · {editorConfig.document.classification}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {/* Save status indicator */}
          {editorConfig.canEdit && saveStatus !== 'idle' && (
            <span className={`inline-flex items-center gap-1 text-[10px] font-medium px-2 py-1 rounded-full ${
              saveStatus === 'saved'
                ? 'text-emerald-600 dark:text-emerald-400'
                : 'text-orange-600 dark:text-orange-400'
            }`}>
              {saveStatus === 'saved' ? (
                <>
                  <CheckCircle2 className="h-3 w-3" />
                  Enregistré
                </>
              ) : (
                <>
                  <Circle className="h-3 w-3 fill-current" />
                  Non sauvegardé
                </>
              )}
            </span>
          )}
          <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-1 rounded-full ${
            editorConfig.canEdit
              ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400'
              : 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400'
          }`}>
            {editorConfig.canEdit ? (
              <>
                <Edit className="h-3 w-3" />
                Édition
              </>
            ) : (
              <>
                <Eye className="h-3 w-3" />
                Lecture seule
              </>
            )}
          </span>
          {/* OnlyOffice format badge */}
          <span className={`inline-flex items-center gap-1 text-[10px] font-medium px-2 py-1 rounded-full bg-gray-100 dark:bg-slate-800 ${formatInfo.color}`}>
            <FileText className="h-3 w-3" />
            OnlyOffice · {formatInfo.label}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={handleQuitEditor}
            className="h-7 text-[10px] px-2"
          >
            <LogOut className="h-3 w-3" />
            Quitter l&apos;éditeur
          </Button>
        </div>
      </div>

      {/* Indication si on n'a pas l'édit — message précis + action concrète */}
      {mode === 'edit' && !editorConfig.canEdit && (
        <div className="flex items-start gap-2 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
          <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-semibold">
              {editorConfig.canEditReason?.message ||
                `Édition non autorisée (statut ${editorConfig.document.status}). Affichage en lecture seule.`}
            </p>
            {editorConfig.canEditReason?.actionHint && (
              <p className="mt-1">{editorConfig.canEditReason.actionHint}</p>
            )}
            <p className="mt-1 text-[11px] text-amber-600 dark:text-amber-500">
              OnlyOffice n&apos;affichera donc que l&apos;option « Télécharger » — c&apos;est
              volontaire tant que l&apos;édition directe n&apos;est pas autorisée.
            </p>
            <Link
              href={`/documents/${editorConfig.document.id}`}
              className="inline-flex items-center gap-1 mt-2 text-amber-900 dark:text-amber-200 font-medium hover:underline"
            >
              <ArrowLeft className="h-3 w-3" /> Retour à la page du document
            </Link>
          </div>
        </div>
      )}

      {/* OnlyOffice error overlay */}
      {editorError && (
        <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-3 text-xs text-red-700 dark:text-red-400 flex items-start gap-2">
          <XCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-semibold">Erreur OnlyOffice</p>
            <p className="mt-0.5">{editorError}</p>
          </div>
          <button
            type="button"
            onClick={() => setEditorError(null)}
            className="p-1 rounded text-red-400 hover:text-red-600 transition-colors"
          >
            <XCircle className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/*
        OnlyOffice placeholder.
        Symptôme observé : la barre d'outils et le compteur "page X/Y" s'affichent
        mais le canvas reste vide. Cause : OnlyOffice crée un iframe en `height: 100%`
        qui résout à 0px si aucun ancêtre n'a de hauteur calculable (flex-chain cassée),
        et ne re-dimensionne pas tout seul après mount.

        Fix : on force explicitement position+height sur le placeholder lui-même, on
        retire overflow-hidden (qui peut clipper les canvas internes), et on dispatche
        un window.resize dans onDocumentReady pour forcer OnlyOffice à recalculer.
      */}
      {/*
        Wrapper TRANSPARENT : aucune couleur de fond ni border qui puisse
        se poser « par-dessus » l'iframe OnlyOffice et donner l'impression
        d'un filtre blanc quand le canvas n'occupe pas toute la zone.
        Seul le placeholder (lui aussi transparent) est rendu ici ; rien ne
        doit venir recouvrir l'iframe d'OnlyOffice.
      */}
      {/*
        Wrapper simplifié : hauteur calculée en pixels dès le SSR via une
        variable CSS inline, pour qu'OnlyOffice n'ait jamais à résoudre un
        `height: 100%` contre un parent potentiellement à 0.
        Le wrapper fait 80vh min (600px au minimum), le placeholder hérite.
      */}
      {/* OnlyOffice zone — wrapper + debug are siblings INSIDE a stable container.
           React never touches the wrapperRef div's children (created via raw DOM).
           The debug block is a SEPARATE div that can mount/unmount without affecting
           the wrapper div's position in the sibling list. */}
      <div ref={wrapperRef} style={{ position: 'relative', width: '100%' }} />
      <div>
      {/* Debug info visible quand l'éditeur ne monte pas */}
      {!editorMounted && !loading && editorConfig && scriptLoaded && (
        <div className="mt-2 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg text-xs text-amber-700 dark:text-amber-300 space-y-2">
          <p className="font-semibold">
            {watchdogFired
              ? 'Le document ne se charge pas — diagnostic en cours'
              : 'OnlyOffice chargé, attente du document…'}
          </p>
          <ul className="list-disc pl-4 space-y-0.5 font-mono text-[11px]">
            <li>Format : {editorConfig.extension} ({editorConfig.canEdit ? 'édition' : 'lecture seule'})</li>
            <li>
              Docs Server (navigateur) :{' '}
              <a href={editorConfig.documentServerUrl} target="_blank" rel="noopener noreferrer" className="underline break-all">
                {editorConfig.documentServerUrl}
              </a>
            </li>
            {editorConfig.diagnostic && (
              <>
                <li className="break-all">
                  URL interne backend (vue OnlyOffice) :{' '}
                  <span className="font-semibold">{editorConfig.diagnostic.internalBackendUrl}</span>
                </li>
                <li className="break-all">
                  <a
                    href={editorConfig.diagnostic.fileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline"
                  >
                    Tester le téléchargement du fichier (nouvel onglet)
                  </a>
                </li>
                <li>JWT config signée : {editorConfig.diagnostic.jwtConfigured ? 'oui' : 'non'}</li>
              </>
            )}
            {editorError && <li className="text-red-600 font-medium">Erreur : {editorError}</li>}
          </ul>

          {diagnoseLoading && <p className="italic">Vérification de la connectivité backend…</p>}

          {diagnose && !diagnose.runtime.jwtSigningConfig && !diagnose.runtime.allowUnsigned && (
            <div className="mt-2 p-2 rounded border-2 border-red-500 bg-red-50 dark:bg-red-900/30 text-red-800 dark:text-red-200 font-semibold text-[12px]">
              ⚠ JWT signing désactivé côté backend — si votre Docs Server a JWT_ENABLED=true (défaut),
              le canvas restera vide. Configurer <code>ONLYOFFICE_JWT_SECRET</code> ou désactiver JWT sur le conteneur.
            </div>
          )}
          {diagnose && (
            <div className="mt-2 p-2 rounded bg-white/70 dark:bg-black/20 border border-amber-300 dark:border-amber-700 space-y-1 font-mono text-[11px]">
              <p className="font-semibold not-italic">Résultat /office/diagnose</p>
              <p className={diagnose.docsServerHealth.ok ? 'text-emerald-700' : 'text-red-700'}>
                {diagnose.docsServerHealth.ok ? '✅' : '❌'} Docs Server : {diagnose.docsServerHealth.message}
              </p>
              <p className={diagnose.backendReachability.ok ? 'text-emerald-700' : 'text-red-700'}>
                {diagnose.backendReachability.ok ? '✅' : '❌'} Backend joignable depuis l&apos;URL interne :{' '}
                {diagnose.backendReachability.message}
              </p>
              {diagnose.jwtMatch !== undefined && (
                <p
                  className={
                    diagnose.jwtMatch === true
                      ? 'text-emerald-700'
                      : diagnose.jwtMatch === false
                      ? 'text-red-700 font-bold'
                      : 'text-amber-700'
                  }
                >
                  {diagnose.jwtMatch === true ? '✅' : diagnose.jwtMatch === false ? '❌' : '⚠'} JWT CommandService :{' '}
                  {diagnose.jwtMessage}
                </p>
              )}
              {!diagnose.backendReachability.ok && (
                <p className="mt-1 text-amber-900 dark:text-amber-200 not-italic">
                  Cause probable : <code>ONLYOFFICE_INTERNAL_URL</code> dans <code>.env</code> n&apos;est pas
                  résolvable depuis le conteneur Docs Server. En Docker Compose, utilisez le <strong>nom du
                  service</strong> (ex: <code>http://backend:3000</code>). Sur Linux avec docker run,
                  démarrez le conteneur avec <code>--add-host host.docker.internal:host-gateway</code>.
                </p>
              )}
            </div>
          )}

          {!diagnose && !diagnoseLoading && !watchdogFired && (
            <p className="italic">Si le document ne s&apos;affiche pas dans 20s, un diagnostic sera lancé automatiquement.</p>
          )}

          <div className="flex items-center gap-2 pt-1 flex-wrap">
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-[11px]"
              onClick={() => {
                // Ré-applique la hauteur + dispatche resize manuellement
                const el = placeholderRef.current;
                if (el) {
                  const h = Math.max(600, window.innerHeight - 140);
                  el.style.height = `${h}px`;
                }
                window.dispatchEvent(new Event('resize'));
                toast.info('Redimensionnement forcé');
              }}
            >
              Forcer le redimensionnement
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-[11px]"
              onClick={runOverlapDiagnostic}
            >
              Diagnostiquer le filtre blanc
            </Button>
          </div>

          {overlapping.length > 0 && (
            <div className="mt-2 p-2 rounded border border-amber-300 dark:border-amber-700 bg-white/80 dark:bg-black/30 font-mono text-[10px] max-h-48 overflow-auto">
              <p className="font-semibold not-italic mb-1">
                Elements chevauchant la zone OnlyOffice ({overlapping.length}) :
              </p>
              <ul className="space-y-0.5">
                {overlapping.map((line, i) => (
                  <li key={i} className="break-all">{line}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
      </div>
    </div>
  );
}
