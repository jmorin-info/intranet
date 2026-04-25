'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { OmnitechLogo } from '@/components/omnitech-logo';

export default function NotFound() {
  const router = useRouter();

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-[#004469]/5 via-white to-[#F68D2E]/5 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
      <div className="text-center px-6">
        <OmnitechLogo size="lg" variant="icon" className="mx-auto mb-6" />
        <h1 className="text-8xl font-semibold text-seal-navy/20 dark:text-white/10">404</h1>
        <h2 className="text-xl font-semibold text-seal-navy dark:text-white -mt-4">Page introuvable</h2>
        <p className="mt-3 text-sm text-seal-gray-500 dark:text-slate-400 max-w-sm mx-auto">
          La page que vous recherchez n&apos;existe pas ou a été déplacée.
          Vérifiez l&apos;URL ou retournez au tableau de bord.
        </p>
        <div className="flex items-center justify-center gap-3 mt-8">
          <button
            onClick={() => router.back()}
            aria-label="Revenir à la page précédente"
            className="inline-flex items-center gap-2 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-6 py-3 text-sm font-semibold text-seal-navy dark:text-white hover:bg-gray-50 dark:hover:bg-slate-700 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Page précédente
          </button>
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 rounded-xl bg-seal-navy px-6 py-3 text-sm font-semibold text-white hover:bg-seal-navy/90 transition-all hover:shadow-lg hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
          >
            Tableau de bord
          </Link>
        </div>
        <p className="mt-6 text-xs text-seal-gray-500 dark:text-slate-500">
          Lien cassé ou page disparue ?{' '}
          <Link
            href="/helpdesk"
            className="font-semibold text-seal-blue hover:underline dark:text-seal-orange focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded"
          >
            Signaler au support
          </Link>
        </p>
      </div>
    </div>
  );
}
