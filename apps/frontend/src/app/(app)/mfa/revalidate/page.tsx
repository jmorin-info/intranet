'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { api } from '@/lib/api';
import { logger } from '@/lib/logger';
import { useTranslation } from '@/lib/i18n';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, Button, Input } from '@omnitech/ui';
import { ShieldCheck, Lock } from 'lucide-react';

/**
 * Page de re-validation MFA.
 *
 * Atterrissage :
 *  - L'intercepteur axios (lib/api.ts) détecte une réponse 403 portant le
 *    code `MFA_REVALIDATION_REQUIRED` et redirige ici, en passant l'URL
 *    d'origine via le query param `?next=/path`.
 *  - L'utilisateur saisit un code TOTP à 6 chiffres (ou un code de secours).
 *  - Le backend vérifie + signe un nouvel access token avec
 *    `mfaValidatedAt = now`. On le stocke dans localStorage et on retourne
 *    à `next` (ou /dashboard à défaut).
 *
 * UX : aligné avec /mfa (charte SEAL, formulaire centré, code 6 chiffres).
 */
function MfaRevalidatePageInner() {
  const { t } = useTranslation();
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get('next') || '/dashboard';

  const [code, setCode] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Auto-submit quand le code atteint 6 chiffres (UX TOTP standard)
  useEffect(() => {
    if (code.length === 6 && /^\d{6}$/.test(code) && !submitting) {
      void handleSubmit();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (submitting) return;
    if (code.length < 6) {
      toast.error(t('mfa.revalidate.codeRequired'));
      return;
    }
    setSubmitting(true);
    try {
      // ANSSI A.5.34 — le backend pose le nouveau accessToken en cookie
      // httpOnly ; on n'a plus rien à persister côté JS.
      await api.post('/mfa/revalidate', { code });
      toast.success(t('mfa.revalidate.success'));
      // On utilise window.location pour forcer une re-évaluation complète des
      // hooks d'authentification (sinon Next garde le store en mémoire avec
      // l'ancien JWT et le prochain appel sensible re-déclenche l'erreur).
      window.location.href = next;
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status === 401) {
        toast.error(t('mfa.revalidate.invalid'));
      } else if (status === 429) {
        toast.error(t('mfa.revalidate.tooManyAttempts'));
      } else {
        logger.error(err, { page: 'mfa/revalidate', context: 'submit' });
        toast.error(t('mfa.revalidate.error'));
      }
      setCode('');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-md mx-auto space-y-6">
      <div className="text-center">
        <div className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 mb-3">
          <Lock className="h-7 w-7 text-primary" />
        </div>
        <h1 className="text-2xl font-medium text-seal-navy dark:text-white">
          {t('mfa.revalidate.title')}
        </h1>
        <p className="text-sm text-seal-gray-500 dark:text-slate-400 mt-1">
          {t('mfa.revalidate.subtitle')}
        </p>
      </div>

      <Card>
        <CardHeader>
          <h2 className="font-semibold text-seal-navy dark:text-white flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-[#F68D2E]" />
            {t('mfa.revalidate.formTitle')}
          </h2>
          <p className="text-xs text-seal-gray-500 dark:text-slate-400 mt-1">
            {t('mfa.revalidate.formHelp')}
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} noValidate className="space-y-4">
            <Input
              autoFocus
              label={t('mfa.revalidate.codeLabel')}
              placeholder="000000"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={code}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                // Accepte chiffres ET hexa (codes de secours sont en hex
                // majuscule, 8 caractères). On normalise en majuscule.
                const cleaned = e.target.value
                  .replace(/[^0-9A-Fa-f]/g, '')
                  .slice(0, 16)
                  .toUpperCase();
                setCode(cleaned);
              }}
              className="text-center text-2xl font-mono tracking-[0.5em]"
              disabled={submitting}
            />
            <Button
              type="submit"
              loading={submitting}
              disabled={submitting || code.length < 6}
              className="w-full"
            >
              {t('mfa.revalidate.submit')}
            </Button>
          </form>
          <p className="text-[11px] text-seal-gray-500 dark:text-slate-500 mt-4 text-center">
            {t('mfa.revalidate.backupHint')}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

export default function MfaRevalidatePage() {
  return (
    <Suspense fallback={null}>
      <MfaRevalidatePageInner />
    </Suspense>
  );
}
