'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { ArrowLeft, FileQuestion } from 'lucide-react';

export default function AppNotFound() {
  const router = useRouter();
  const t = useTranslations('errors.notFound');

  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="text-center px-6 max-w-md">
        <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-2xl bg-seal-navy/10 dark:bg-seal-navy/20">
          <FileQuestion className="h-10 w-10 text-seal-navy dark:text-white/70" />
        </div>

        <h1 className="text-8xl font-semibold text-seal-navy/20 dark:text-white/10">
          404
        </h1>
        <h2 className="text-2xl font-semibold text-seal-navy dark:text-white -mt-2">
          {t('title')}
        </h2>

        <p className="mt-3 text-sm text-seal-gray-500 dark:text-slate-400 leading-relaxed">
          {t('description')}
        </p>

        <div className="flex items-center justify-center gap-3 mt-8">
          <button
            onClick={() => router.back()}
            className="inline-flex items-center gap-2 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-6 py-3 text-sm font-semibold text-seal-navy dark:text-white hover:bg-gray-50 dark:hover:bg-slate-700 transition-all"
          >
            <ArrowLeft className="h-4 w-4" />
            {t('back')}
          </button>
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 rounded-xl bg-seal-navy px-6 py-3 text-sm font-semibold text-white hover:bg-seal-navy/90 transition-all hover:shadow-lg hover:-translate-y-0.5"
          >
            {t('home')}
          </Link>
        </div>
      </div>
    </div>
  );
}
