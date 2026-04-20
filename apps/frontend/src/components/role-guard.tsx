'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/auth-store';
import { isRoleAtLeast, UserRole } from '@omnitech/shared';
import { ShieldAlert } from 'lucide-react';
import { Card, CardContent, Button } from '@omnitech/ui';

interface RoleGuardProps {
  minRole: UserRole;
  children: React.ReactNode;
}

/**
 * Protects a page from being accessed by users without sufficient role.
 * Shows an access denied message instead of the content.
 */
export function RoleGuard({ minRole, children }: RoleGuardProps) {
  const router = useRouter();
  const user = useAuthStore(s => s.user);

  if (!user) return null;

  if (!isRoleAtLeast(user.role, minRole)) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Card className="max-w-md w-full">
          <CardContent className="py-10 text-center">
            <ShieldAlert className="h-12 w-12 text-red-400 mx-auto mb-4" />
            <h2 className="text-lg font-semibold text-seal-navy dark:text-white mb-2">
              Accès restreint
            </h2>
            <p className="text-sm text-seal-gray-500 dark:text-slate-400 mb-4">
              Vous n&apos;avez pas les permissions nécessaires pour accéder à cette page.
            </p>
            <Button variant="outline" onClick={() => router.push('/dashboard')}>
              Retour au tableau de bord
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return <>{children}</>;
}
