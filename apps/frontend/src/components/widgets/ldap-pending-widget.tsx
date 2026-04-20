'use client';

import Link from 'next/link';
import { UserPlus, ArrowRight } from 'lucide-react';
import { isRoleAtLeast, UserRole } from '@omnitech/shared';
import { useAuthStore } from '@/stores/auth-store';
import { useAdminCountsStore } from '@/stores/admin-counts-store';

/**
 * Widget compact : comptes LDAP/AD en attente de validation admin.
 * Reads from centralized admin-counts store (polled every 60s by auth-provider).
 */
export function LdapPendingWidget() {
  const user = useAuthStore(s => s.user);
  const count = useAdminCountsStore(s => s.ldapPendingCount);

  const isAdmin = user && isRoleAtLeast(user.role, UserRole.ADMIN);
  if (!isAdmin) return null;

  const badgeClass =
    count > 0
      ? 'bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300'
      : 'bg-gray-100 text-gray-600 dark:bg-slate-800 dark:text-slate-400';

  const contextText =
    count === 0
      ? 'Aucun compte AD en attente'
      : count === 1
        ? '1 compte à valider'
        : `${count} comptes à valider`;

  const contextColor =
    count === 0
      ? 'text-emerald-600 dark:text-emerald-400'
      : 'text-taupe dark:text-slate-400';

  return (
    <div className="rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <UserPlus className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold text-navy dark:text-white">Validation LDAP</h3>
        </div>
        {count > 0 && (
          <Link
            href="/admin/ldap-pending"
            className="text-[11px] text-primary hover:underline flex items-center gap-1"
          >
            Valider <ArrowRight className="h-3 w-3" />
          </Link>
        )}
      </div>

      <div className="flex items-center gap-3">
        <span
          className={`inline-flex items-center justify-center min-w-[32px] h-8 px-2 text-sm font-bold rounded-full ${badgeClass} tabular-nums`}
        >
          {count}
        </span>
        <p className={`text-xs ${contextColor}`}>
          {contextText}
        </p>
      </div>
    </div>
  );
}
