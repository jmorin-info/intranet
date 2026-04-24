'use client';

import React, { useEffect, useState } from 'react';
import { ExternalLink, Calendar, Briefcase, Users } from 'lucide-react';
import { api } from '@/lib/api';
import { logger } from '@/lib/logger';

const LUCCA_URL = 'https://omnitech-security.ilucca.net/';

export function LuccaWidget() {
  const [deptInfo, setDeptInfo] = useState<{ name: string; userCount: number } | null>(null);

  useEffect(() => {
    api.get('/departments').then(r => {
      const depts = r.data?.data || r.data || [];
      if (depts.length > 0) setDeptInfo({ name: depts[0].name, userCount: depts[0]._count?.users || 0 });
    }).catch((err) => logger.error(err, { component: 'LuccaWidget' }));
  }, []);

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <Briefcase className="h-5 w-5 text-primary" />
        <h3 className="font-semibold text-seal-navy dark:text-white text-sm">Espace RH — Lucca</h3>
      </div>

      {deptInfo && (
        <div className="flex items-center gap-3 rounded-lg bg-primary/5 dark:bg-primary/10 p-3 mb-3">
          <Users className="h-5 w-5 text-primary" />
          <div>
            <p className="text-xs font-semibold text-seal-navy dark:text-white">Mon équipe — {deptInfo.name}</p>
            <p className="text-[10px] text-seal-gray-500 dark:text-slate-400">{deptInfo.userCount} collaborateur{deptInfo.userCount > 1 ? 's' : ''}</p>
          </div>
        </div>
      )}

      <div className="space-y-2">
        <a
          href={LUCCA_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-3 rounded-lg border border-gray-200 dark:border-slate-700 p-3 hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors group"
        >
          <Calendar className="h-5 w-5 text-blue-500" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-seal-navy dark:text-white group-hover:text-primary transition-colors">Congés & Absences</p>
            <p className="text-[10px] text-seal-gray-500 dark:text-slate-400">Consulter le solde, poser un congé</p>
          </div>
          <ExternalLink className="h-4 w-4 text-seal-gray-500 opacity-0 group-hover:opacity-100 transition-opacity" />
        </a>
        <a
          href={`${LUCCA_URL}#/timmi-timesheet`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-3 rounded-lg border border-gray-200 dark:border-slate-700 p-3 hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors group"
        >
          <Briefcase className="h-5 w-5 text-emerald-500" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-seal-navy dark:text-white group-hover:text-primary transition-colors">Feuille de temps</p>
            <p className="text-[10px] text-seal-gray-500 dark:text-slate-400">Saisir les heures travaillées</p>
          </div>
          <ExternalLink className="h-4 w-4 text-seal-gray-500 opacity-0 group-hover:opacity-100 transition-opacity" />
        </a>
      </div>
    </div>
  );
}
