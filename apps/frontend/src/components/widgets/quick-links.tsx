'use client';

import React from 'react';
import Link from 'next/link';
import {
  FileText, Plus, Ticket, Rss, Shield, BookOpen, Users, BarChart3,
  GraduationCap, User, Search, Cloud, HardDrive,
} from 'lucide-react';

const links = [
  { href: '/documents/new', icon: Plus, label: 'Nouveau document', color: 'bg-primary/10 text-primary' },
  { href: '/tickets?create=true', icon: Ticket, label: 'Nouveau ticket', color: 'bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400' },
  { href: '/quiz', icon: GraduationCap, label: 'Quiz sécurité', color: 'bg-rose-50 text-rose-600 dark:bg-rose-900/30 dark:text-rose-400' },
  { href: '/profile', icon: User, label: 'Mon profil', color: 'bg-indigo-50 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400' },
  { href: '/search', icon: Search, label: 'Recherche', color: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300' },
  { href: '/veille', icon: Rss, label: 'Veille cyber', color: 'bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400' },
  { href: '/procedures', icon: BookOpen, label: 'Procédures', color: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400' },
  { href: '/admin/compliance', icon: Shield, label: 'Conformité ISO', color: 'bg-navy/10 text-navy dark:bg-slate-700 dark:text-blue-300' },
  { href: '/satisfaction', icon: BarChart3, label: 'Satisfaction', color: 'bg-purple-50 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400' },
  { href: '/files', icon: HardDrive, label: 'Fichiers réseau', color: 'bg-teal-50 text-teal-600 dark:bg-teal-900/30 dark:text-teal-400' },
  { href: 'https://fichiers.omnitech-security.fr', icon: Cloud, label: 'Nextcloud', color: 'bg-sky-50 text-sky-600 dark:bg-sky-900/30 dark:text-sky-400' },
];

export function QuickLinks() {
  return (
    <div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-10 gap-2">
      {links.map(l => (
        <Link
          key={l.href}
          href={l.href}
          {...(l.href.startsWith('http') ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
          className="flex flex-col items-center gap-1.5 rounded-xl p-3 hover:bg-gray-50 dark:hover:bg-slate-800 hover:shadow-md transition-all duration-200 group"
        >
          <div className={`h-10 w-10 rounded-xl ${l.color} flex items-center justify-center group-hover:scale-110 group-hover:shadow-sm transition-all duration-200`}>
            <l.icon className="h-5 w-5" />
          </div>
          <span className="text-[10px] font-semibold text-navy dark:text-white text-center leading-tight group-hover:text-primary dark:group-hover:text-blue-400 transition-colors">{l.label}</span>
        </Link>
      ))}
    </div>
  );
}
