'use client';

/**
 * Admin-only "Premiers pas" onboarding card, surfaced the first time an
 * administrator opens a dashboard with an empty document base. Renders four
 * guided entry points (create doc, workflows, wiki, AD import) and remembers
 * dismissal via `localStorage.dashboard_onboarding_dismissed`.
 */

import React from 'react';
import Link from 'next/link';
import { BookOpen, FileText, UserPlus, Workflow, X } from 'lucide-react';

interface DashboardOnboardingCardProps {
  onDismiss: () => void;
}

const STEPS = [
  { icon: FileText, label: 'Créer votre premier document', href: '/documents/new', bg: 'bg-primary/10' },
  { icon: Workflow, label: 'Configurer les workflows', href: '/admin/workflows', bg: 'bg-emerald-500/10' },
  { icon: BookOpen, label: 'Alimenter la base de connaissances', href: '/wiki', bg: 'bg-violet-500/10' },
  { icon: UserPlus, label: 'Importer les utilisateurs AD', href: '/admin/ldap-pending', bg: 'bg-amber-500/10' },
] as const;

export function DashboardOnboardingCard({ onDismiss }: DashboardOnboardingCardProps) {
  return (
    <div className="animate-fade-in-up rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-sm font-semibold text-seal-navy dark:text-white">Premiers pas</h2>
          <p className="text-xs text-seal-gray-500 dark:text-slate-400 mt-0.5">
            Lancez-vous : quelques actions suffisent pour mettre en place votre espace documentaire et sécurité.
          </p>
        </div>
        <button
          onClick={onDismiss}
          className="p-1.5 rounded-lg text-seal-gray-500 hover:bg-gray-100 dark:hover:bg-slate-800 hover:text-seal-navy dark:hover:text-white transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          aria-label="Masquer la section Premiers pas"
          title="Masquer"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {STEPS.map(({ icon: Icon, label, href, bg }) => (
          <Link key={href} href={href}>
            <div className="p-3 rounded-xl border border-gray-100 dark:border-slate-700 hover:border-primary/30 hover:shadow-sm transition-all group cursor-pointer">
              <div className={`h-9 w-9 rounded-lg ${bg} flex items-center justify-center mb-2`}>
                <Icon className="h-4.5 w-4.5 text-seal-navy dark:text-white" />
              </div>
              <p className="text-xs font-medium text-seal-navy dark:text-white group-hover:text-primary transition-colors">{label}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

export default DashboardOnboardingCard;
