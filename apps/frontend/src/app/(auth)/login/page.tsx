'use client';

import React, { Suspense, useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { useAuthStore } from '@/stores/auth-store';
import { Button } from '@omnitech/ui';
import { Shield, Lock, Mail, Key, UserCheck } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { loginSchema, type LoginFormData } from '@/lib/validation/schemas';

type LoginForm = LoginFormData;

function LoginPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawSessionExpired = searchParams?.get('reason') === 'session_expired';
  const login = useAuthStore(s => s.login);
  const t = useTranslations('auth.login');
  const tMfa = useTranslations('auth.mfa');
  const tTrust = useTranslations('auth.trust');
  const [loading, setLoading] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);
  // Only show "session expired" if the user actually had a previous session
  const [hadSession, setHadSession] = useState(false);
  const sessionExpired = rawSessionExpired && hadSession;

  // Check auth state on mount — synchronous, no API call
  useEffect(() => {
    if (localStorage.getItem('had_session')) setHadSession(true);
    // Always show the login form immediately.
    // If a valid token exists, the auth-provider in the (app) layout
    // will handle the redirect after navigation to /dashboard.
    setAuthChecked(true);
  }, []);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    mode: 'onTouched',
  });

  const [isPrestataire, setIsPrestataire] = useState(false);
  const [mfaRequired, setMfaRequired] = useState(false);
  const [mfaCode, setMfaCode] = useState('');
  const [pendingCredentials, setPendingCredentials] = useState<{ email: string; password: string } | null>(null);

  const onSubmit = async (data: LoginForm) => {
    setLoading(true);
    try {
      await login(data.email, data.password, data.mfaCode || undefined);
      localStorage.setItem('had_session', '1');
      toast.success(t('loginSuccess'));
      // Hard navigation to ensure SW cache is bypassed after login
      const redirect = searchParams?.get('redirect') || '/dashboard';
      window.location.href = redirect;
    } catch (error: unknown) {
      const err = error as { mfaRequired?: boolean; requireMfaSetup?: boolean; response?: { data?: { message?: string } } };
      if (err.mfaRequired) {
        setPendingCredentials(data);
        setMfaRequired(true);
        setLoading(false);
        return;
      }
      // requireMfaSetup is now handled by auth-provider redirect to /mfa
      const message = err.response?.data?.message || t('invalidCredentials');
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  const onMfaSubmit = async () => {
    if (mfaCode.length !== 6 || !pendingCredentials) { toast.error(tMfa('required')); return; }
    setLoading(true);
    try {
      await login(pendingCredentials.email, pendingCredentials.password, mfaCode);
      localStorage.setItem('had_session', '1');
      toast.success(t('loginSuccess'));
      // Hard navigation to ensure SW cache is bypassed after login
      const redirect = searchParams?.get('redirect') || '/dashboard';
      window.location.href = redirect;
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } }; message?: string };
      const msg = err.response?.data?.message || err.message || tMfa('invalid');
      if (msg === 'MFA_REQUIRED') {
        // Edge case: backend still wants MFA — don't show error, just stay on MFA screen
        toast.error(tMfa('retry'));
      } else {
        toast.error(msg === tMfa('invalid') ? tMfa('invalid') : msg);
      }
      setMfaCode('');
    } finally {
      setLoading(false);
    }
  };

  if (!authChecked) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#004469]">
        <Image src="/logo-icon-white.png" alt="OMNITECH" width={56} height={56} className="animate-pulse" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen">
      {/* Left panel - branding */}
      <div className="hidden lg:flex lg:w-[55%] bg-[#004469] flex-col justify-between p-0 relative overflow-hidden">
        {/* Background pattern */}
        <div className="absolute inset-0">
          {/* Diagonal orange accent — top right */}
          <div className="absolute -top-20 -right-20 w-80 h-80 bg-[#F68D2E] rotate-45 opacity-[0.07]" />
          <div className="absolute -bottom-32 -left-32 w-96 h-96 bg-[#F68D2E] rotate-12 opacity-[0.04]" />
          {/* Subtle grid pattern */}
          <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.3) 1px, transparent 1px)', backgroundSize: '32px 32px' }} />
        </div>

        {/* Top: logo */}
        <div className="relative z-10 p-10">
          <Image src="/logo-full-white.png" alt="OMNITECH Security" width={192} height={48} className="h-12 object-contain" />
        </div>

        {/* Center: main branding */}
        <div className="relative z-10 flex-1 flex flex-col items-center justify-center px-12">
          <Image src="/logo-icon-white.png" alt="" width={140} height={140} className="mb-8 drop-shadow-2xl transition-transform duration-300 hover:scale-105" />
          <h1 className="text-5xl xl:text-6xl font-light text-white tracking-tight">
            OMNITECH
          </h1>
          <p className="text-[#F68D2E] text-base font-medium tracking-[0.4em] uppercase mt-3">Security</p>
          <div className="w-16 h-0.5 bg-[#F68D2E] rounded-full mt-6 mb-6" />
          <p className="text-white/50 text-sm text-center max-w-xs leading-relaxed">
            Contrôle d&apos;accès &bull; Hypervision SEAL System &bull; Vidéosurveillance avancée
          </p>
        </div>

        {/* Bottom: badges + group */}
        <div className="relative z-10 p-10 animate-[fadeInUp_0.8s_ease-out_0.3s_both]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 rounded-lg bg-white/[0.08] backdrop-blur-sm border border-white/[0.06] px-3 py-2">
                <Shield className="h-4 w-4 text-[#F68D2E]" />
                <span className="text-xs text-white/70 font-medium">ISO 27001</span>
              </div>
              <div className="flex items-center gap-2 rounded-lg bg-white/[0.08] backdrop-blur-sm border border-white/[0.06] px-3 py-2">
                <Lock className="h-4 w-4 text-[#F68D2E]" />
                <span className="text-xs text-white/70 font-medium">SEAL System</span>
              </div>
            </div>
            <div className="text-right">
              <p className="text-[10px] text-white/30 uppercase tracking-wider">Groupe</p>
              <p className="text-sm text-white/60 font-semibold">SFPI</p>
            </div>
          </div>
        </div>
      </div>

      {/* Right panel - login form */}
      <div className="relative flex flex-1 items-center justify-center bg-surface dark:bg-slate-950 p-4 sm:p-8 before:absolute before:top-0 before:left-0 before:right-0 before:h-1 before:bg-gradient-to-r before:from-[#296DC1] before:via-[#F9964A] before:to-[#892034]">
        <div className="w-full max-w-md animate-[fadeIn_0.6s_ease-out]">
          {/* Mobile logo */}
          <div className="lg:hidden flex flex-col items-center mb-8">
            <Image src="/logo-icon.png" alt="OMNITECH" width={72} height={72} className="mb-4" />
            <p className="text-2xl font-light text-seal-navy dark:text-white tracking-tight">OMNITECH</p>
            <p className="text-[#F68D2E] text-xs font-medium tracking-[0.35em] uppercase mt-1">Security</p>
          </div>

          <div className="rounded-card bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 border-t-[3px] border-t-[#F9964A] shadow-[0_8px_32px_rgba(0,68,105,0.15)] dark:shadow-[0_4px_24px_rgba(0,0,0,0.4)] p-8 relative overflow-hidden">
            {/* Coin orange SEAL signature */}
            <div className="absolute -top-px -left-px w-12 h-1 bg-gradient-to-r from-[#F9964A] to-transparent" />
            <div className="absolute -top-px -left-px w-1 h-12 bg-gradient-to-b from-[#F9964A] to-transparent" />
            {mfaRequired ? (
              /* MFA verification screen */
              <div>
                <div className="mb-6 text-center">
                  <Key className="h-12 w-12 text-primary mx-auto mb-3" />
                  <h2 className="text-2xl font-semibold text-seal-navy dark:text-white">{tMfa('title')}</h2>
                  <p className="text-sm text-seal-gray-500 dark:text-slate-400 mt-1">
                    {tMfa('subtitle')}
                  </p>
                </div>
                <div className="space-y-4">
                  <input
                    type="text"
                    value={mfaCode}
                    onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="000000"
                    className="w-full rounded-btn border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-seal-navy dark:text-white py-3 text-center text-2xl font-mono tracking-[0.5em] focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
                    autoFocus
                    onKeyDown={(e) => { if (e.key === 'Enter') onMfaSubmit(); }}
                  />
                  <Button onClick={onMfaSubmit} loading={loading} className="w-full" disabled={mfaCode.length !== 6}>
                    {tMfa('verify')}
                  </Button>
                  <button onClick={() => { setMfaRequired(false); setMfaCode(''); }} className="w-full text-xs text-seal-gray-500 dark:text-slate-400 hover:text-seal-navy dark:hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded">
                    {tMfa('back')}
                  </button>
                </div>
              </div>
            ) : (
              /* Normal login form */
              <div>
            {sessionExpired && (
              <div className="mb-4 flex items-center gap-2 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 px-3 py-2.5 text-xs font-medium text-amber-800 dark:text-amber-300">
                <Lock className="h-4 w-4 flex-shrink-0" />
                {t('sessionExpired')}
              </div>
            )}
            <div className="mb-6">
              <h2 className="text-2xl font-semibold text-seal-navy dark:text-white">{t('title')}</h2>
              <p className="text-sm text-seal-gray-500 dark:text-slate-400 mt-1">
                {t('subtitle')}
              </p>
            </div>

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div className="space-y-1">
                <label className="block text-[13px] font-semibold text-seal-navy dark:text-white">
                  {t('email')}
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-seal-gray-500 dark:text-slate-400" />
                  <input
                    {...register('email')}
                    type="email"
                    placeholder={t('emailPlaceholder')}
                    className="w-full rounded-btn border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-seal-navy dark:text-white py-2.5 pl-10 pr-4 text-sm placeholder:text-seal-gray-500 dark:placeholder:text-slate-500 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
                    autoComplete="email"
                    autoFocus
                  />
                </div>
                {errors.email && (
                  <p className="text-red-500 text-xs mt-1">{errors.email.message || t('emailInvalid')}</p>
                )}
              </div>

              <div className="space-y-1">
                <label className="block text-[13px] font-semibold text-seal-navy dark:text-white">
                  {t('password')}
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-seal-gray-500 dark:text-slate-400" />
                  <input
                    {...register('password')}
                    type="password"
                    placeholder={t('passwordPlaceholder')}
                    className="w-full rounded-btn border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-seal-navy dark:text-white py-2.5 pl-10 pr-4 text-sm placeholder:text-seal-gray-500 dark:placeholder:text-slate-500 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
                    autoComplete="current-password"
                  />
                </div>
                {errors.password && (
                  <p className="text-red-500 text-xs mt-1">{errors.password.message || t('passwordRequired')}</p>
                )}
              </div>

              <Button
                type="submit"
                loading={loading || isSubmitting}
                disabled={loading || isSubmitting}
                className="w-full mt-2 bg-gradient-to-r from-[#F68D2E] to-[#e67d1e] border-0 hover:from-[#e67d1e] hover:to-[#d06a10]"
              >
                {t('submit')}
              </Button>

              <div className="text-right mt-2">
                <Link href="/forgot-password" className="text-sm text-primary hover:underline">
                  {t('forgotPassword')}
                </Link>
              </div>
            </form>

            {/* Prestataire hint */}
            {isPrestataire && (
              <div className="mt-4 rounded-lg border border-seal-blue/20 dark:border-slate-600 bg-[#296DC1]/5 dark:bg-slate-800/50 px-4 py-3 animate-[fadeIn_0.3s_ease-out]">
                <div className="flex items-center gap-2 mb-1">
                  <UserCheck className="h-4 w-4 text-[#296DC1] dark:text-blue-400" />
                  <span className="text-xs font-semibold text-[#296DC1] dark:text-blue-400">{t('contractorAccess')}</span>
                </div>
                <p className="text-xs text-seal-gray-500 dark:text-slate-400 leading-relaxed">
                  {t('contractorHint')}
                </p>
              </div>
            )}

            <p className="mt-6 text-center text-xs text-seal-gray-500 dark:text-slate-400">
              {t('consent')}
            </p>

            <div className="mt-3 text-center">
              <button
                type="button"
                onClick={() => setIsPrestataire((v) => !v)}
                className="text-xs text-seal-gray-500/60 dark:text-slate-500 hover:text-[#296DC1] dark:hover:text-blue-400 transition-colors"
              >
                {isPrestataire ? t('contractorBack') : t('contractorQuestion')}
              </button>
            </div>
              </div>
            )}
          </div>

          {/* Trust bullets — présents en plus du panneau gauche pour rester visibles en mobile */}
          <div className="mt-5 grid grid-cols-3 gap-2 text-center" aria-label={tTrust('hostingFr')}>
            <div className="flex flex-col items-center gap-1 rounded-lg border border-gray-200 dark:border-slate-700 bg-white/60 dark:bg-slate-900/40 px-2 py-2">
              <span className="text-base" aria-hidden>🇫🇷</span>
              <span className="text-[10px] font-semibold text-seal-navy dark:text-white leading-tight">{tTrust('hostingFr')}</span>
            </div>
            <div className="flex flex-col items-center gap-1 rounded-lg border border-gray-200 dark:border-slate-700 bg-white/60 dark:bg-slate-900/40 px-2 py-2">
              <Shield className="h-4 w-4 text-[#006233]" aria-hidden />
              <span className="text-[10px] font-semibold text-seal-navy dark:text-white leading-tight">{tTrust('iso27001')}</span>
            </div>
            <div className="flex flex-col items-center gap-1 rounded-lg border border-gray-200 dark:border-slate-700 bg-white/60 dark:bg-slate-900/40 px-2 py-2">
              <Lock className="h-4 w-4 text-[#296DC1]" aria-hidden />
              <span className="text-[10px] font-semibold text-seal-navy dark:text-white leading-tight">{tTrust('sovereign')}</span>
            </div>
          </div>

          <div className="mt-5 text-center">
            <Link
              href="/welcome"
              className="inline-block text-sm px-4 py-2 rounded-btn border border-gray-300 dark:border-slate-600 text-seal-gray-500 dark:text-slate-300 hover:border-[#F68D2E] hover:text-[#F68D2E] dark:hover:border-[#F68D2E] dark:hover:text-[#F68D2E] hover:shadow-[0_0_12px_rgba(246,141,46,0.2)] transition-all duration-200"
            >
              {t('discoverIntranet')}
            </Link>
          </div>

          <p className="mt-4 text-center text-[11px] text-seal-gray-500/70 dark:text-slate-500">
            OMNITECH Security &copy; {new Date().getFullYear()} — {t('rightsReserved')}
          </p>
          <p className="mt-1 text-center text-[10px] text-seal-gray-500/40 dark:text-slate-600 flex items-center justify-center gap-2">
            <Link href="/trust" className="hover:text-[#F68D2E] transition-colors">{t('trustCenter')}</Link>
            <span aria-hidden>·</span>
            <span>Powered by OMNITECH Intranet v2.4</span>
          </p>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginPageInner />
    </Suspense>
  );
}
