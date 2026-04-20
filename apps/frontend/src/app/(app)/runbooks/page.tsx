'use client';

import React from 'react';
import { PageHeader } from '@/components/layout/page-header';
import { useTranslation } from '@/lib/i18n';
import { FileText } from 'lucide-react';
import { RunbooksContent } from '../wiki/RunbooksContent';

export default function RunbooksPage() {
  const { t } = useTranslation();
  return (
    <div className="space-y-6">
      <PageHeader
        title={t('runbooks.title')}
        subtitle={t('runbooks.subtitle')}
        icon={FileText}
        hub="work"
      />
      <RunbooksContent />
    </div>
  );
}
