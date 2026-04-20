'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { FileText, ArrowRight, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { api } from '@/lib/api';

interface DocDue {
  id: string;
  title: string;
  reference: string;
  nextReviewDate: string | null;
  owner?: { firstName: string; lastName: string } | null;
}

/**
 * Widget dashboard : liste des documents dont la date de prochaine revue
 * approche ou est dépassée. ISO 27001 A.5.1 — revue périodique des
 * politiques et procédures.
 *
 * Polling : toutes les 5 minutes (données peu volatiles).
 */
export function DocsDueReviewWidget() {
  const [docs, setDocs] = useState<DocDue[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const { data } = await api.get('/documents', {
          params: {
            status: 'APPROVED',
            needsReview: 'true',
            limit: 5,
          },
        });
        if (cancelled) return;
        const list: DocDue[] = data?.data || data || [];
        // Filtre supplémentaire côté client : docs avec nextReviewDate dans les 30j ou dépassé
        const now = Date.now();
        const in30 = now + 30 * 24 * 3600 * 1000;
        const filtered = list.filter((d) => {
          if (!d.nextReviewDate) return false;
          const t = new Date(d.nextReviewDate).getTime();
          return t <= in30;
        });
        setDocs(filtered.slice(0, 5));
      } catch {
        setDocs([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    const id = setInterval(load, 300000); // 5 min
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const daysUntil = (iso: string): number => {
    const diff = new Date(iso).getTime() - Date.now();
    return Math.floor(diff / (24 * 3600 * 1000));
  };

  return (
    <div className="rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold text-navy dark:text-white">À revoir</h3>
          <span className="text-[10px] uppercase text-seal-gray-500 dark:text-slate-500">A.5.1</span>
        </div>
        <Link
          href="/documents?tab=review"
          className="text-[11px] text-seal-gray-500 dark:text-slate-400 hover:text-primary flex items-center gap-1"
        >
          Tous <ArrowRight className="h-3 w-3" />
        </Link>
      </div>

      {loading ? (
        <div className="h-20 animate-pulse rounded bg-gray-100 dark:bg-slate-800" />
      ) : docs.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-4 text-center">
          <CheckCircle2 className="h-8 w-8 text-emerald-400" />
          <p className="text-xs text-seal-gray-500 dark:text-slate-500">
            Aucune revue prévue dans les 30 jours.
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {docs.map((d) => {
            const days = d.nextReviewDate ? daysUntil(d.nextReviewDate) : 0;
            const overdue = days < 0;
            return (
              <li key={d.id}>
                <Link
                  href={`/documents/${d.id}`}
                  className="group flex items-center justify-between gap-2 px-2 py-1.5 rounded-md hover:bg-gray-50 dark:hover:bg-slate-800/60"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-navy dark:text-white group-hover:text-primary truncate">
                      {d.title}
                    </p>
                    <p className="text-[10px] text-seal-gray-500 dark:text-slate-500 truncate">
                      {d.reference}
                      {d.owner && ` • ${d.owner.firstName} ${d.owner.lastName}`}
                    </p>
                  </div>
                  <span
                    className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-medium whitespace-nowrap ${
                      overdue
                        ? 'bg-red-500/20 text-red-700 dark:text-red-300'
                        : days <= 7
                          ? 'bg-amber-500/20 text-amber-700 dark:text-amber-300'
                          : 'bg-gray-200/60 dark:bg-slate-700 text-seal-gray-500 dark:text-slate-400'
                    }`}
                  >
                    {overdue && <AlertTriangle className="h-2.5 w-2.5" />}
                    {overdue ? `En retard ${Math.abs(days)}j` : `${days}j`}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
