'use client';

/**
 * Outil admin : audit visuel du dark mode.
 *
 * Principe : on navigue dans toutes les pages listées, puis pour chaque page
 * on inspecte le DOM rendu et on repère les éléments qui ont un fond/texte
 * clair "en dur" (couleurs fixes) sans variante `dark:`. Les éléments
 * suspects sont remontés dans un tableau exportable en CSV.
 *
 * Exécution côté client uniquement (pas de charge serveur).
 */

import { useState } from 'react';
import { Moon, Play, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { downloadCsv } from '@/lib/export-csv';
import { toast } from 'sonner';
import { AdminGroupTabs } from '@/components/layout/admin-group-tabs';
import { useTranslation } from '@/lib/i18n';
import { PageHeader } from '@/components/layout/page-header';
import { logger } from '@/lib/logger';

// Pages à auditer (routes authenticated uniquement).
// On scanne dans l'ordre, chaque page est chargée brièvement dans un <iframe>
// caché avec mode `dark` forcé, puis on lit le DOM.
const PAGES_TO_AUDIT = [
  '/dashboard',
  '/documents',
  '/tickets',
  '/news',
  '/wiki',
  '/notifications',
  '/profile',
  '/search',
  '/calendar',
  '/directory',
  '/helpdesk',
  '/admin/compliance',
  '/admin/audit',
  '/admin/departments',
  '/admin/users/import',
  '/admin/access-reviews',
  '/admin/external-access',
  '/admin/onboarding',
  '/admin/reports',
  '/admin/chartes',
  '/admin/signatures',
  '/admin/ad-audit',
  '/admin/config',
  '/veille',
  '/incidents',
  '/procedures',
  '/quiz',
  '/satisfaction',
  '/runbooks',
];

// Couleurs "claires" (heuristique) : luminance > 0.8.
// Un élément avec `background: rgb(255,255,255)` sans variante `.dark` est suspect.
function isLightColor(rgb: string): boolean {
  const m = rgb.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (!m) return false;
  const [r, g, b] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.9;
}

interface AuditFinding {
  page: string;
  tag: string;
  classes: string;
  bg: string;
  color: string;
  snippet: string;
}

export default function DarkModeAuditPage() {
  const { t } = useTranslation();
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [findings, setFindings] = useState<AuditFinding[]>([]);
  const [scannedPages, setScannedPages] = useState<string[]>([]);

  const runAudit = async () => {
    setRunning(true);
    setFindings([]);
    setScannedPages([]);
    setProgress(0);
    toast.info('Audit démarré — navigation dans les pages en arrière-plan');

    // Force le mode dark pour l'audit (ne persiste pas après refresh)
    const wasDark = document.documentElement.classList.contains('dark');
    document.documentElement.classList.add('dark');

    const allFindings: AuditFinding[] = [];
    const scanned: string[] = [];

    for (let i = 0; i < PAGES_TO_AUDIT.length; i++) {
      const page = PAGES_TO_AUDIT[i]!;
      setProgress(Math.round(((i + 1) / PAGES_TO_AUDIT.length) * 100));

      // On utilise un iframe dédié (isolé, rechargé à chaque page)
      const iframe = document.createElement('iframe');
      iframe.style.cssText = 'position:fixed;left:-9999px;top:0;width:1280px;height:720px;border:0;';
      iframe.src = page;
      document.body.appendChild(iframe);

      try {
        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error('timeout')), 8000);
          iframe.addEventListener(
            'load',
            () => {
              clearTimeout(timeout);
              // Petit délai pour laisser React hydrater + fetch initial
              setTimeout(resolve, 1500);
            },
            { once: true },
          );
        });

        const doc = iframe.contentDocument;
        if (!doc) continue;
        // Force le dark mode dans l'iframe aussi
        doc.documentElement.classList.add('dark');

        // Scan des éléments visibles
        const elements = doc.querySelectorAll<HTMLElement>(
          'div, section, article, header, footer, nav, main, aside, span, p, h1, h2, h3, h4, h5, h6, button, a, input, textarea, li, td, th, label, figure',
        );

        elements.forEach((el) => {
          const rect = el.getBoundingClientRect();
          if (rect.width < 10 || rect.height < 10) return; // ignore invisibles
          const style = doc.defaultView?.getComputedStyle(el);
          if (!style) return;
          const bg = style.backgroundColor;
          const color = style.color;
          // Suspect : fond clair en mode dark
          if (bg && bg !== 'rgba(0, 0, 0, 0)' && isLightColor(bg)) {
            // Vérifie si l'élément ou un ancêtre a une classe dark:
            const classes = el.className?.toString?.() || '';
            if (!/\bdark:/.test(classes)) {
              allFindings.push({
                page,
                tag: el.tagName.toLowerCase(),
                classes: classes.slice(0, 120),
                bg,
                color,
                snippet: (el.textContent || '').trim().slice(0, 80),
              });
            }
          }
        });

        scanned.push(page);
      } catch (err) {
        logger.warn(`audit failed for ${page}`, { page, error: err instanceof Error ? err.message : String(err) });
      } finally {
        iframe.remove();
      }
    }

    if (!wasDark) document.documentElement.classList.remove('dark');
    setFindings(allFindings);
    setScannedPages(scanned);
    setRunning(false);
    toast.success(`Audit terminé — ${allFindings.length} élément(s) suspect(s) sur ${scanned.length} page(s)`);
  };

  const exportCsv = () => {
    downloadCsv(
      'dark-mode-audit',
      findings as unknown as Array<Record<string, unknown>>,
      [
        { header: 'Page', accessor: 'page' },
        { header: 'Tag', accessor: 'tag' },
        { header: 'Classes', accessor: 'classes' },
        { header: 'Background', accessor: 'bg' },
        { header: 'Color', accessor: 'color' },
        { header: 'Texte (extrait)', accessor: 'snippet' },
      ],
    );
  };

  return (
    <div className="space-y-6">
      <AdminGroupTabs group="config" />
      <PageHeader
        title="Audit dark mode"
        subtitle="Détecte les éléments avec fond clair sans variante dark: (heuristique luminance > 0.9)."
        icon={Moon}
        hub="admin"
        actions={
          <>
            <button
              onClick={runAudit}
              disabled={running}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-white text-sm font-semibold hover:bg-primary/90 disabled:opacity-50"
            >
              <Play className="h-4 w-4" />
              {running ? `Audit en cours… ${progress}%` : 'Démarrer l\'audit'}
            </button>
            {findings.length > 0 && (
              <button
                onClick={exportCsv}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-200 dark:border-slate-700 text-sm font-medium text-seal-navy dark:text-white hover:bg-gray-50 dark:hover:bg-slate-800"
              >
                Export CSV ({findings.length})
              </button>
            )}
          </>
        }
      />

      {running && (
        <div className="rounded-lg border border-blue-200 dark:border-blue-900/40 bg-blue-50 dark:bg-blue-900/20 p-4">
          <p className="text-sm text-blue-700 dark:text-blue-300">
            Scanning {PAGES_TO_AUDIT.length} pages… Ne quittez pas cette page.
          </p>
          <div className="mt-2 h-1 w-full bg-blue-200 dark:bg-blue-900/40 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-600 transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      {!running && findings.length === 0 && scannedPages.length > 0 && (
        <div className="rounded-lg border border-emerald-200 dark:border-emerald-900/40 bg-emerald-50 dark:bg-emerald-900/20 p-4 flex items-start gap-2">
          <CheckCircle2 className="h-5 w-5 text-emerald-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">
              Aucun problème détecté
            </p>
            <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-1">
              {scannedPages.length} page(s) auditée(s). Aucun élément suspect.
            </p>
          </div>
        </div>
      )}

      {findings.length > 0 && (
        <div className="rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-200 dark:border-slate-700 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            <p className="text-sm font-semibold text-seal-navy dark:text-white">
              {findings.length} élément(s) suspect(s)
            </p>
          </div>
          <div className="overflow-x-auto max-h-[600px]">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 dark:bg-slate-800 sticky top-0">
                <tr>
                  <th className="px-3 py-2 text-left">Page</th>
                  <th className="px-3 py-2 text-left">Tag</th>
                  <th className="px-3 py-2 text-left">Classes</th>
                  <th className="px-3 py-2 text-left">Background</th>
                  <th className="px-3 py-2 text-left">Texte</th>
                </tr>
              </thead>
              <tbody>
                {findings.map((f, i) => (
                  <tr key={i} className="border-t border-gray-100 dark:border-slate-800 hover:bg-gray-50 dark:hover:bg-slate-800/50">
                    <td className="px-3 py-2 font-mono text-[10px]">{f.page}</td>
                    <td className="px-3 py-2">{f.tag}</td>
                    <td className="px-3 py-2 font-mono text-[10px] max-w-xs truncate" title={f.classes}>
                      {f.classes || '—'}
                    </td>
                    <td className="px-3 py-2 font-mono text-[10px]">{f.bg}</td>
                    <td className="px-3 py-2 max-w-xs truncate" title={f.snippet}>
                      {f.snippet || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
