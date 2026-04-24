'use client';

import React, { Suspense, useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { api } from '@/lib/api';
import { useTranslation } from '@/lib/i18n';
import { toast } from 'sonner';
import { OmnitechLogo } from '@/components/omnitech-logo';
import { Card, CardContent, Button, Input } from '@omnitech/ui';
import { Lock, CheckCircle2, ArrowLeft } from 'lucide-react';
import { resetPasswordSchema, type ResetPasswordFormData } from '@/lib/validation/schemas';

function getPasswordStrength(pw: string): { score: number; label: string; color: string; bgColor: string } {
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[A-Z]/.test(pw)) score++;
  if (/[a-z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(pw)) score++;

  if (score <= 2) return { score, label: 'Faible', color: 'text-red-500', bgColor: 'bg-red-500' };
  if (score <= 4) return { score, label: 'Moyen', color: 'text-orange-500', bgColor: 'bg-orange-500' };
  return { score, label: 'Fort', color: 'text-emerald-500', bgColor: 'bg-emerald-500' };
}

function ResetPasswordContent() {
  const { t } = useTranslation();
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token') || '';

  const [success, setSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [countdown, setCountdown] = useState(5);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting, isValid },
  } = useForm<ResetPasswordFormData>({
    resolver: zodResolver(resetPasswordSchema),
    mode: 'onChange',
    defaultValues: { password: '', confirmPassword: '' },
  });

  const password = watch('password');
  const confirmPassword = watch('confirmPassword');

  const strength = password ? getPasswordStrength(password) : null;
  const strengthPercent = strength ? Math.round((strength.score / 6) * 100) : 0;

  useEffect(() => {
    if (!success) return;
    if (countdown <= 0) {
      router.push('/login');
      return;
    }
    const timer = setTimeout(() => setCountdown(c => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [success, countdown, router]);

  const onSubmit = async (data: ResetPasswordFormData) => {
    if (!token) return;
    setErrorMessage('');
    try {
      await api.post('/auth/reset-password', { token, password: data.password });
      setSuccess(true);
      toast.success(t('resetPassword.successToast'));
    } catch (error: unknown) {
      const err = error as { response?: { status?: number; data?: { message?: string } } };
      const status = err.response?.status;
      const msg = err.response?.data?.message;
      if (status === 400 || status === 401 || msg?.toLowerCase().includes('expir')) {
        setErrorMessage('Le lien de réinitialisation a expiré ou est invalide. Veuillez en demander un nouveau.');
        toast.error(t('resetPassword.errorExpired'));
      } else {
        setErrorMessage('Une erreur est survenue. Veuillez réessayer.');
        toast.error(t('resetPassword.errorExpired'));
      }
    }
  };

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#004469] via-[#00587a] to-[#003852] p-4">
        <Card className="max-w-md w-full shadow-2xl border-0">
          <CardContent className="py-8 text-center">
            <p className="text-sm text-red-500 mb-4">{t('resetPassword.invalidLink')}</p>
            <Link href="/forgot-password"><Button variant="outline">{t('resetPassword.requestNewLink')}</Button></Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#004469] via-[#00587a] to-[#003852] p-4">
      {/* Background decoration */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 rounded-full bg-white/5 blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 rounded-full bg-white/5 blur-3xl" />
      </div>

      <div className="w-full max-w-md relative z-10">
        <div className="text-center mb-8">
          <OmnitechLogo size="lg" variant="icon" className="mx-auto mb-4" />
          <h1 className="text-2xl font-semibold text-white">{t('resetPassword.title')}</h1>
          <p className="text-sm text-white/60 mt-1">OMNITECH Security - Intranet</p>
        </div>

        <Card className="shadow-2xl border-0">
          <CardContent className="py-8 px-6">
            {success ? (
              <div className="text-center py-4 animate-in fade-in zoom-in-95 duration-500">
                <div className="relative mx-auto w-20 h-20 mb-6">
                  <div className="absolute inset-0 rounded-full bg-emerald-100 dark:bg-emerald-900/30 animate-ping opacity-20" />
                  <div className="absolute inset-2 rounded-full bg-emerald-100 dark:bg-emerald-900/20 animate-pulse" />
                  <div className="relative flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/30">
                    <CheckCircle2 className="h-10 w-10 text-emerald-600" />
                  </div>
                </div>
                <h2 className="text-lg font-semibold text-seal-navy dark:text-white mb-2">{t('resetPassword.successTitle')}</h2>
                <p className="text-sm text-seal-gray-500 mb-4">{t('resetPassword.successMessage')}</p>
                {/* Countdown progress bar */}
                <div className="w-48 mx-auto mb-4">
                  <div className="h-1.5 bg-gray-200 dark:bg-slate-700 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-emerald-500 rounded-full transition-all duration-1000 ease-linear"
                      style={{ width: `${((5 - countdown) / 5) * 100}%` }}
                    />
                  </div>
                  <p className="text-xs text-seal-gray-500 dark:text-slate-400 mt-2">
                    Redirection vers la connexion dans {countdown}s...
                  </p>
                </div>
                <Link href="/login">
                  <Button variant="outline" className="w-full">
                    <ArrowLeft className="h-4 w-4" /> Aller à la connexion
                  </Button>
                </Link>
              </div>
            ) : (
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
                <div>
                  <label htmlFor="password" className="text-xs font-semibold text-seal-gray-500 dark:text-slate-400 block mb-1">{t('resetPassword.label.password')}</label>
                  <Input
                    id="password"
                    type="password"
                    {...register('password')}
                    placeholder={t('resetPassword.passwordPlaceholder')}
                    autoFocus
                    aria-invalid={!!errors.password}
                  />
                  {errors.password && (
                    <p className="text-red-500 text-xs mt-1">{errors.password.message}</p>
                  )}

                  {/* Password strength meter */}
                  {password && strength && (
                    <div className="mt-2">
                      <div className="flex items-center justify-between mb-1">
                        <span className={`text-xs font-medium ${strength.color}`}>Force : {strength.label}</span>
                        <span className="text-xs text-seal-gray-500 dark:text-slate-400">{strengthPercent}%</span>
                      </div>
                      <div className="w-full h-2 bg-gray-200 dark:bg-slate-700 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-300 ${strength.bgColor}`}
                          style={{ width: `${strengthPercent}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {password && (
                    <div className="mt-2 space-y-1">
                      {[
                        { test: password.length >= 12, label: t('resetPassword.rule.length') },
                        { test: /[A-Z]/.test(password), label: t('resetPassword.rule.uppercase') },
                        { test: /[a-z]/.test(password), label: t('resetPassword.rule.lowercase') },
                        { test: /[0-9]/.test(password), label: t('resetPassword.rule.digit') },
                        { test: /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password), label: t('resetPassword.rule.special') },
                      ].map(({ test, label }) => (
                        <div key={label} className={`flex items-center gap-1.5 text-xs ${test ? 'text-emerald-600' : 'text-seal-gray-500 dark:text-slate-400'}`}>
                          {test ? <CheckCircle2 className="h-3 w-3" /> : <div className="h-3 w-3 rounded-full border border-gray-300 dark:border-slate-600" />}
                          {label}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div>
                  <label htmlFor="confirmPassword" className="text-xs font-semibold text-seal-gray-500 dark:text-slate-400 block mb-1">{t('resetPassword.label.confirm')}</label>
                  <Input
                    id="confirmPassword"
                    type="password"
                    {...register('confirmPassword')}
                    placeholder={t('resetPassword.confirmPlaceholder')}
                    aria-invalid={!!errors.confirmPassword}
                  />
                  {errors.confirmPassword && (
                    <p className="text-red-500 text-xs mt-1">{errors.confirmPassword.message || t('resetPassword.mismatch')}</p>
                  )}
                  {!errors.confirmPassword && confirmPassword && password === confirmPassword && (
                    <p className="text-xs text-emerald-600 mt-1 flex items-center gap-1">
                      <CheckCircle2 className="h-3 w-3" /> Les mots de passe correspondent
                    </p>
                  )}
                </div>
                {errorMessage && (
                  <div className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-3">
                    <p className="text-xs text-red-700 dark:text-red-400 font-medium">{errorMessage}</p>
                    <Link href="/forgot-password" className="text-xs text-primary hover:underline mt-1 inline-block">
                      Demander un nouveau lien
                    </Link>
                  </div>
                )}
                <Button type="submit" className="w-full" loading={isSubmitting} disabled={!isValid || isSubmitting}>
                  <Lock className="h-4 w-4" /> {t('resetPassword.submit')}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#004469] via-[#00587a] to-[#003852]">
        <div className="animate-pulse text-white">{/* Loading handled by Suspense */}</div>
      </div>
    }>
      <ResetPasswordContent />
    </Suspense>
  );
}
