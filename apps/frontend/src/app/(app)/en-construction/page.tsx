'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Construction } from 'lucide-react';
import { useTranslation } from '@/lib/i18n';

export default function UnderConstructionPage() {
  const { t } = useTranslation();
  const router = useRouter();

  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="text-center px-6 max-w-md">
        <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-2xl bg-orange/10 dark:bg-orange/20">
          <Construction className="h-10 w-10 text-orange" />
        </div>

        <h1 className="text-2xl font-semibold text-navy dark:text-white">
          {t('construction.title')}
        </h1>

        <p className="mt-3 text-sm text-taupe dark:text-slate-400 leading-relaxed">
          {t('construction.subtitle')}
        </p>

        <div className="flex items-center justify-center gap-3 mt-8">
          <button
            onClick={() => router.back()}
            className="inline-flex items-center gap-2 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-6 py-3 text-sm font-semibold text-navy dark:text-white hover:bg-gray-50 dark:hover:bg-slate-700 transition-all"
          >
            <ArrowLeft className="h-4 w-4" />
            {t('common.back')}
          </button>
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 rounded-xl bg-navy px-6 py-3 text-sm font-semibold text-white hover:bg-navy/90 transition-all hover:shadow-lg hover:-translate-y-0.5"
          >
            {t('notFound.backToDashboard')}
          </Link>
        </div>
      </div>
    </div>
  );
}
