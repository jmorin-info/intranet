'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { api } from '@/lib/api';
import { useTranslation } from '@/lib/i18n';
import { toast } from 'sonner';
import { OmnitechLogo } from '@/components/omnitech-logo';
import { Card, CardContent, Button, Input } from '@omnitech/ui';
import { Mail, ArrowLeft, Send, Shield, Lock } from 'lucide-react';
import { forgotPasswordSchema, type ForgotPasswordFormData } from '@/lib/validation/schemas';

export default function ForgotPasswordPage() {
  const { t } = useTranslation();
  const [sent, setSent] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [resendLoading, setResendLoading] = useState(false);

  const {
    register,
    handleSubmit,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordFormData>({
    resolver: zodResolver(forgotPasswordSchema),
    mode: 'onTouched',
    defaultValues: { email: '' },
  });

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown(c => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  const onSubmit = async (data: ForgotPasswordFormData) => {
    if (cooldown > 0) return;
    try {
      await api.post('/auth/forgot-password', { email: data.email });
      setSent(true);
      setCooldown(60);
    } catch {
      toast.error(t('forgotPassword.sendError'));
    }
  };

  const handleResend = async () => {
    if (cooldown > 0) return;
    const email = getValues('email');
    if (!email) return;
    setResendLoading(true);
    try {
      await api.post('/auth/forgot-password', { email });
      toast.success('Lien renvoyé avec succès');
      setCooldown(60);
    } catch {
      toast.error(t('forgotPassword.sendError'));
    } finally {
      setResendLoading(false);
    }
  };

  const email = getValues('email');

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
          <h1 className="text-2xl font-semibold text-white">{t('forgotPassword.title')}</h1>
          <p className="text-sm text-white/60 mt-1">OMNITECH Security - Intranet</p>
        </div>

        {/* Security badges matching login page */}
        <div className="flex items-center justify-center gap-3 mb-6">
          <div className="flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5">
            <Shield className="h-3.5 w-3.5 text-[#F68D2E]" />
            <span className="text-[11px] text-white/70">Connexion sécurisée</span>
          </div>
          <div className="flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5">
            <Lock className="h-3.5 w-3.5 text-[#F68D2E]" />
            <span className="text-[11px] text-white/70">Chiffrement TLS</span>
          </div>
        </div>

        <Card className="shadow-2xl border-0">
          <CardContent className="py-8 px-6">
            {sent ? (
              <div className="text-center py-4">
                <div className="relative mx-auto w-16 h-16 mb-6">
                  <div className="absolute inset-0 rounded-full bg-emerald-100 dark:bg-emerald-900/30 animate-ping opacity-30" />
                  <div className="relative flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/30">
                    <Mail className="h-8 w-8 text-emerald-600" />
                  </div>
                </div>
                <h2 className="text-lg font-semibold text-seal-navy dark:text-white mb-2">{t('forgotPassword.sentTitle')}</h2>
                <p className="text-sm text-seal-gray-500 dark:text-slate-400 mb-4">
                  {t('forgotPassword.sentMessage')} <strong>{email}</strong>{t('forgotPassword.sentMessage2')}
                </p>
                <p className="text-xs text-seal-gray-500 dark:text-slate-400 mb-6">
                  {t('forgotPassword.checkSpam')}
                </p>
                <div className="space-y-3">
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={handleResend}
                    disabled={cooldown > 0 || resendLoading}
                    loading={resendLoading}
                  >
                    <Send className="h-4 w-4" />
                    {cooldown > 0
                      ? `Renvoyer le lien (${cooldown}s)`
                      : 'Renvoyer le lien'
                    }
                  </Button>
                  <Link href="/login" className="block">
                    <Button variant="outline" className="w-full">
                      <ArrowLeft className="h-4 w-4" /> {t('forgotPassword.backToLogin')}
                    </Button>
                  </Link>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
                <p className="text-sm text-seal-gray-500 dark:text-slate-400 mb-4">
                  {t('forgotPassword.instruction')}
                </p>
                <div>
                  <label htmlFor="email" className="text-xs font-semibold text-seal-gray-500 dark:text-slate-400 block mb-1">{t('forgotPassword.label.email')}</label>
                  <Input
                    id="email"
                    type="email"
                    {...register('email')}
                    placeholder="votre.nom@omnitech-security.fr"
                    autoFocus
                    aria-invalid={!!errors.email}
                  />
                  {errors.email && (
                    <p className="text-red-500 text-xs mt-1">{errors.email.message}</p>
                  )}
                </div>
                <Button type="submit" className="w-full" loading={isSubmitting} disabled={isSubmitting || cooldown > 0}>
                  <Mail className="h-4 w-4" /> {t('forgotPassword.submit')}
                </Button>
                <Link href="/login" className="block text-center text-sm text-primary hover:underline mt-2">
                  <ArrowLeft className="h-3 w-3 inline" /> {t('forgotPassword.backToLogin')}
                </Link>
              </form>
            )}
          </CardContent>
        </Card>

        {/* Corporate footer */}
        <p className="text-center text-[10px] text-white/40 mt-6">
          Affiliée au groupe SFPI — Systèmes de sûreté pour sites à risques
        </p>
      </div>
    </div>
  );
}
