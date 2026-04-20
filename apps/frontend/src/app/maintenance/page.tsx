'use client';

import React, { useState, useEffect } from 'react';
import { useTranslation } from '@/lib/i18n';

function useCountdown(targetTime: string) {
  const [remaining, setRemaining] = useState({ hours: 0, minutes: 0, seconds: 0, expired: false });

  useEffect(() => {
    function computeRemaining() {
      const now = new Date();
      const [h, m] = targetTime.split(':').map(Number);
      const target = new Date(now);
      target.setHours(h || 0, m || 0, 0, 0);
      // If the target time has already passed today, assume it's tomorrow
      if (target.getTime() <= now.getTime()) {
        target.setDate(target.getDate() + 1);
      }
      const diff = target.getTime() - now.getTime();
      if (diff <= 0) return { hours: 0, minutes: 0, seconds: 0, expired: true };
      const totalSec = Math.floor(diff / 1000);
      return {
        hours: Math.floor(totalSec / 3600),
        minutes: Math.floor((totalSec % 3600) / 60),
        seconds: totalSec % 60,
        expired: false,
      };
    }
    setRemaining(computeRemaining());
    const timer = setInterval(() => setRemaining(computeRemaining()), 1000);
    return () => clearInterval(timer);
  }, [targetTime]);

  return remaining;
}

interface MaintenancePageProps {
  searchParams?: { returnTime?: string };
}

export default function MaintenancePage() {
  const { t } = useTranslation();
  // Configurable estimated return time — can be passed via query param or env
  const estimatedReturnTime =
    typeof window !== 'undefined'
      ? new URLSearchParams(window.location.search).get('returnTime') || '18:00'
      : '18:00';

  const countdown = useCountdown(estimatedReturnTime);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-950 px-4">
      <style jsx>{`
        @keyframes pulse-logo {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.05); opacity: 0.85; }
        }
        .animate-pulse-logo {
          animation: pulse-logo 3s ease-in-out infinite;
        }
        @keyframes fade-in-up {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fade-in-up {
          animation: fade-in-up 0.6s ease-out forwards;
        }
        .delay-200 { animation-delay: 0.2s; opacity: 0; }
        .delay-400 { animation-delay: 0.4s; opacity: 0; }
        .delay-600 { animation-delay: 0.6s; opacity: 0; }
      `}</style>

      {/* Pulsing logo */}
      <div className="animate-pulse-logo mb-8">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/logo-icon.png"
          alt="OMNITECH Security"
          width={100}
          height={100}
          className="object-contain drop-shadow-lg"
          style={{ width: 100, height: 100 }}
        />
      </div>

      {/* Title */}
      <h1 className="text-3xl md:text-4xl font-semibold text-navy dark:text-white text-center animate-fade-in-up">
        Maintenance en cours
      </h1>

      {/* Description */}
      <p className="mt-4 text-base md:text-lg text-slate-600 dark:text-slate-400 text-center max-w-md animate-fade-in-up delay-200">
        Nous effectuons une maintenance planifiée pour améliorer nos services.
        Nous serons de retour très bientôt.
      </p>

      {/* Estimated return */}
      <div className="mt-8 px-6 py-4 bg-white dark:bg-slate-800 rounded-2xl shadow-lg border border-slate-200 dark:border-slate-700 animate-fade-in-up delay-400">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/30">
            <svg
              className="h-5 w-5 text-amber-600 dark:text-amber-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div>
            <p className="text-sm font-semibold text-navy dark:text-white">{t('maintenance.estimatedReturn')}</p>
            <p className="text-lg font-semibold text-primary">{estimatedReturnTime}</p>
          </div>
        </div>
      </div>

      {/* Live countdown */}
      <div className="mt-4 animate-fade-in-up delay-400">
        {countdown.expired ? (
          <p className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">
            Le retour est imminent... Actualisez la page.
          </p>
        ) : (
          <div className="flex items-center gap-1 text-sm text-slate-600 dark:text-slate-400">
            <span>{t('maintenance.estimatedIn')}</span>
            <div className="flex items-center gap-1 font-mono">
              <span className="inline-flex items-center justify-center min-w-[2.2rem] bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md px-1.5 py-0.5 text-base font-semibold text-navy dark:text-white shadow-sm">
                {String(countdown.hours).padStart(2, '0')}
              </span>
              <span className="text-slate-400 font-semibold">:</span>
              <span className="inline-flex items-center justify-center min-w-[2.2rem] bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md px-1.5 py-0.5 text-base font-semibold text-navy dark:text-white shadow-sm">
                {String(countdown.minutes).padStart(2, '0')}
              </span>
              <span className="text-slate-400 font-semibold">:</span>
              <span className="inline-flex items-center justify-center min-w-[2.2rem] bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md px-1.5 py-0.5 text-base font-semibold text-primary shadow-sm">
                {String(countdown.seconds).padStart(2, '0')}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Contact info */}
      <div className="mt-8 text-center animate-fade-in-up delay-600">
        <p className="text-sm text-slate-500 dark:text-slate-500 mb-1">
          Pour toute urgence, contactez-nous :
        </p>
        <a
          href="mailto:support@omnitech-security.fr"
          className="text-sm font-semibold text-primary hover:underline"
        >
          support@omnitech-security.fr
        </a>
        <p className="text-sm text-slate-500 dark:text-slate-500 mt-1">
          Tel : +33 1 23 45 67 89
        </p>
      </div>

      {/* Footer */}
      <p className="mt-12 text-xs text-slate-400 dark:text-slate-600">
        OMNITECH Security &mdash; Intranet
      </p>
    </div>
  );
}
