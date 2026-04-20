'use client';

import Link from 'next/link';

interface EntityBreadcrumbProps {
  /** Module name displayed as the parent link (e.g. "Tickets", "Documents") */
  module: string;
  /** URL path for the module list (e.g. "/tickets", "/documents") */
  href: string;
  /** Entity identifier displayed after the separator (e.g. "TK-00283", "DOC-PROC-001") */
  current: string;
}

/**
 * Unified breadcrumb for all entity detail pages.
 * Pattern: Module / Reference
 *
 * Uses Link (not button+router.push) for consistent behavior and prefetching.
 */
export function EntityBreadcrumb({ module, href, current }: EntityBreadcrumbProps) {
  return (
    <nav className="flex items-center gap-1.5 text-xs text-taupe dark:text-slate-400">
      <Link href={href} className="hover:text-navy dark:hover:text-white transition-colors">
        {module}
      </Link>
      <span>/</span>
      <span className="text-navy dark:text-white font-medium">{current}</span>
    </nav>
  );
}
