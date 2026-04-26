'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { toast } from 'sonner';
import { Card, CardContent, Button, EmptyState, Badge } from '@omnitech/ui';
import { MessageCircle, Sparkles, Clock, CheckCircle2, XCircle } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { api } from '@/lib/api';
import { formatRelativeTime } from '@/lib/utils';
import { SubmitTestimonialDialog } from '@/components/testimonials/submit-dialog';

interface ApprovedTestimonial {
  id: string;
  quote: string;
  department: string | null;
  role: string | null;
  approvedAt: string | null;
}

interface MyTestimonial {
  id: string;
  quote: string;
  department: string | null;
  isApproved: boolean;
  submittedAt: string;
  approvedAt: string | null;
  rejectedAt: string | null;
  rejectionReason: string | null;
}

export default function TestimonialsPage() {
  const [approved, setApproved] = useState<ApprovedTestimonial[]>([]);
  const [mine, setMine] = useState<MyTestimonial[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [approvedRes, mineRes] = await Promise.all([
        api.get<{ visible: boolean; count: number; items: ApprovedTestimonial[] }>('/testimonials/approved'),
        api.get<MyTestimonial[]>('/testimonials/mine').catch(() => ({ data: [] })),
      ]);
      setApproved(approvedRes.data.items || []);
      setMine(mineRes.data || []);
    } catch {
      toast.error('Erreur de chargement des témoignages');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const hasPendingMine = mine.some((m) => !m.isApproved && !m.rejectedAt);

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Témoignages"
        subtitle="L'intranet évolue grâce aux retours des collaborateurs — partagez votre expérience pour nourrir les prochaines améliorations."
        icon={MessageCircle}
        hub="monEspace"
      />

      {/* CTA principal */}
      <Card className="mb-6 border-dashed border-[#F9964A]/40 bg-gradient-to-br from-[#F9964A]/5 to-transparent">
        <CardContent className="py-6 flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#F9964A]/15 flex-shrink-0">
            <Sparkles className="h-7 w-7 text-[#F9964A]" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-semibold text-seal-navy dark:text-white">
              Partagez votre avis sur l&apos;intranet
            </h2>
            <p className="text-sm text-seal-gray-500 dark:text-slate-400 mt-1">
              Une phrase sur ce que l&apos;intranet vous apporte au quotidien — votre témoignage sera relu
              puis publié sur le portail public pour motiver vos collègues. Maximum 1 témoignage tous les 3 mois.
            </p>
          </div>
          <Button
            onClick={() => setDialogOpen(true)}
            disabled={hasPendingMine}
            title={hasPendingMine ? 'Vous avez déjà un témoignage en attente de modération' : ''}
            aria-label={hasPendingMine ? 'Témoignage en attente de modération' : 'Partager mon avis sur l\'intranet'}
            className="w-full sm:w-auto min-h-[44px] flex-shrink-0"
          >
            {hasPendingMine ? 'Témoignage en attente' : 'Partager mon avis'}
          </Button>
        </CardContent>
      </Card>

      {/* Mes témoignages */}
      {mine.length > 0 && (
        <div className="mb-8">
          <h2 className="text-sm font-semibold text-seal-navy dark:text-white mb-3 flex items-center gap-2">
            <Clock className="h-4 w-4 text-seal-gray-500" />
            Mes témoignages ({mine.length})
          </h2>
          <div className="space-y-2">
            {mine.map((m) => (
              <div
                key={m.id}
                className="rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4"
              >
                <blockquote className="text-sm italic text-seal-navy dark:text-white leading-relaxed">
                  «&nbsp;{m.quote}&nbsp;»
                </blockquote>
                <div className="flex items-center gap-2 mt-2 flex-wrap">
                  {m.department && (
                    <span className="text-xs text-seal-gray-500 dark:text-slate-400 font-semibold">
                      — {m.department}
                    </span>
                  )}
                  {m.isApproved && (
                    <Badge variant="success" className="text-[9px] gap-1">
                      <CheckCircle2 className="h-3 w-3" />
                      Publié {m.approvedAt ? formatRelativeTime(m.approvedAt) : ''}
                    </Badge>
                  )}
                  {m.rejectedAt && (
                    <Badge variant="error" className="text-[9px] gap-1">
                      <XCircle className="h-3 w-3" />
                      Rejeté
                    </Badge>
                  )}
                  {!m.isApproved && !m.rejectedAt && (
                    <Badge variant="warning" className="text-[9px] gap-1">
                      <Clock className="h-3 w-3" />
                      En attente de modération
                    </Badge>
                  )}
                </div>
                {m.rejectionReason && (
                  <p className="text-[11px] text-red-600 dark:text-red-400 mt-2 italic">
                    Motif : {m.rejectionReason}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Témoignages publiés */}
      <h2 className="text-sm font-semibold text-seal-navy dark:text-white mb-3 flex items-center gap-2">
        <MessageCircle className="h-4 w-4 text-seal-gray-500" />
        Témoignages publiés ({approved.length})
      </h2>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3" aria-busy="true" aria-label="Chargement des témoignages">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5 space-y-3">
              <div className="h-3 w-full rounded shimmer" />
              <div className="h-3 w-5/6 rounded shimmer" />
              <div className="h-3 w-2/3 rounded shimmer" />
              <div className="h-2.5 w-1/3 rounded shimmer mt-4" />
            </div>
          ))}
        </div>
      ) : approved.length === 0 ? (
        <EmptyState
          title="Aucun témoignage publié pour l'instant"
          description="Soyez le premier à partager votre expérience ! Après modération, votre témoignage apparaîtra ici et sur le portail public /welcome (à partir de 3 témoignages approuvés)."
          action={
            <Button
              size="sm"
              onClick={() => setDialogOpen(true)}
              disabled={hasPendingMine}
              aria-label="Partager mon premier témoignage"
            >
              <Sparkles className="h-4 w-4" /> Partager mon témoignage
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {approved.map((t) => (
            <article
              key={t.id}
              className="rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5 shadow-sm hover:shadow-md transition-shadow"
            >
              <blockquote className="text-sm text-seal-navy dark:text-white italic leading-relaxed">
                «&nbsp;{t.quote}&nbsp;»
              </blockquote>
              {t.department && (
                <p className="text-xs text-seal-gray-500 dark:text-slate-400 mt-3 font-semibold">
                  — {t.department}
                </p>
              )}
            </article>
          ))}
        </div>
      )}

      <SubmitTestimonialDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onSubmitted={() => load()}
      />
    </div>
  );
}
