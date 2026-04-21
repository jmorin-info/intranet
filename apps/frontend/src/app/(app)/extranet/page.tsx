'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth-store';
import { useTranslation } from '@/lib/i18n';
import { UserRole, isRoleAtLeast } from '@omnitech/shared';
import {
  Card, CardContent, CardHeader, Badge, SearchInput, Button, EmptyState,
} from '@omnitech/ui';
import { PageHeader } from '@/components/layout/page-header';
import { ExternalLink, Search, Shield, Clock, UserX, Users, AlertTriangle } from 'lucide-react';
import { formatRelativeTime } from '@/lib/utils';

interface ExtranetAccess {
  id: string;
  name: string;
  company: string;
  email: string;
  accessGrantedAt: string;
  accessExpiresAt: string | null;
  isActive: boolean;
  scope: string | null;
}

function getExpiryStatus(expiresAt: string | null, isActive: boolean): { label: string; className: string } {
  if (!isActive) {
    return { label: 'R\u00e9voqu\u00e9', className: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400' };
  }
  if (!expiresAt) {
    return { label: 'Acc\u00e8s actif', className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' };
  }
  const now = new Date();
  const expiry = new Date(expiresAt);
  if (expiry < now) {
    return { label: 'Expir\u00e9', className: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' };
  }
  const daysLeft = Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  if (daysLeft <= 7) {
    return { label: `Expire dans ${daysLeft}j`, className: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' };
  }
  return { label: 'Acc\u00e8s actif', className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' };
}

export default function ExtranetPage() {
  const user = useAuthStore(s => s.user);
  const { t } = useTranslation();
  const isAdmin = user && isRoleAtLeast(user.role, UserRole.ADMIN);
  const [accesses, setAccesses] = useState<ExtranetAccess[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [revoking, setRevoking] = useState<string | null>(null);

  useEffect(() => {
    async function fetchAccesses() {
      try {
        const res = await api.get('/extranet/accesses', { params: { limit: 200 } });
        const data = res.data?.data || res.data || [];
        setAccesses(Array.isArray(data) ? data : []);
      } catch (err) {
        console.error('Extranet: failed to load accesses', err);
      } finally {
        setLoading(false);
      }
    }
    fetchAccesses();
  }, []);

  const filteredAccesses = useMemo(() => {
    const q = search.toLowerCase();
    if (!q) return accesses;
    return accesses.filter((a) => {
      return a.name.toLowerCase().includes(q)
        || a.company.toLowerCase().includes(q)
        || a.email.toLowerCase().includes(q);
    });
  }, [accesses, search]);

  const now = new Date();
  const activeCount = accesses.filter(a => a.isActive && (!a.accessExpiresAt || new Date(a.accessExpiresAt) > now)).length;
  const expiredCount = accesses.filter(a => !a.isActive || (a.accessExpiresAt && new Date(a.accessExpiresAt) <= now)).length;
  const expiringSoonCount = accesses.filter(a => {
    if (!a.isActive || !a.accessExpiresAt) return false;
    const expiry = new Date(a.accessExpiresAt);
    const daysLeft = (expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
    return daysLeft > 0 && daysLeft <= 30;
  }).length;

  const handleRevoke = async (accessId: string) => {
    if (!confirm('Voulez-vous vraiment r\u00e9voquer cet acc\u00e8s ?')) return;
    setRevoking(accessId);
    try {
      await api.post(`/extranet/accesses/${accessId}/revoke`);
      setAccesses(prev => prev.map(a => a.id === accessId ? { ...a, isActive: false } : a));
    } catch (err) {
      console.error('Failed to revoke access', err);
    } finally {
      setRevoking(null);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in-up">
      {/* Header */}
      <PageHeader
        title="Portail prestataires"
        subtitle="Gestion des accès extranet pour les prestataires externes"
        icon={ExternalLink}
        hub="security"
      />

      {/* Stats bar */}
      {!loading && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Card><CardContent className="py-3 px-4 flex items-center gap-3">
            <Users className="h-5 w-5 text-primary" />
            <div><p className="text-xs text-seal-gray-500 dark:text-slate-400">Total</p><p className="text-xl font-medium text-seal-navy dark:text-white">{accesses.length}</p></div>
          </CardContent></Card>
          <Card><CardContent className="py-3 px-4 flex items-center gap-3">
            <Shield className="h-5 w-5 text-emerald-500" />
            <div><p className="text-xs text-seal-gray-500 dark:text-slate-400">Actifs</p><p className="text-xl font-medium text-emerald-600">{activeCount}</p></div>
          </CardContent></Card>
          <Card><CardContent className="py-3 px-4 flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            <div><p className="text-xs text-seal-gray-500 dark:text-slate-400">Expirent bientôt</p><p className="text-xl font-medium text-amber-600">{expiringSoonCount}</p></div>
          </CardContent></Card>
          <Card><CardContent className="py-3 px-4 flex items-center gap-3">
            <UserX className="h-5 w-5 text-red-500" />
            <div><p className="text-xs text-seal-gray-500 dark:text-slate-400">Expirés / Révoqués</p><p className="text-xl font-medium text-red-600">{expiredCount}</p></div>
          </CardContent></Card>
        </div>
      )}

      {/* Search */}
      <Card className="shadow-sm rounded-xl">
        <CardContent className="p-4">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Rechercher un prestataire par nom, entreprise ou email..."
          />
        </CardContent>
      </Card>

      {/* Loading state */}
      {loading && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i} className="shadow-sm rounded-xl">
              <CardContent className="p-5 animate-pulse">
                <div className="space-y-3">
                  <div className="w-32 h-4 rounded bg-gray-200 dark:bg-slate-700" />
                  <div className="w-48 h-3 rounded bg-gray-200 dark:bg-slate-700" />
                  <div className="w-20 h-5 rounded bg-gray-200 dark:bg-slate-700" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && filteredAccesses.length === 0 && (
        <EmptyState
          type={search ? 'search' : 'users'}
          title="Aucun accès prestataire"
          description={search ? 'Aucun résultat pour cette recherche.' : 'Aucun accès extranet configuré pour le moment.'}
        />
      )}

      {/* Access cards */}
      {!loading && filteredAccesses.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredAccesses.map((access, idx) => {
            const status = getExpiryStatus(access.accessExpiresAt, access.isActive);
            const isExpiredOrRevoked = !access.isActive || (access.accessExpiresAt && new Date(access.accessExpiresAt) <= new Date());
            return (
              <Card key={access.id} className={`stagger-item shadow-sm rounded-xl transition-all duration-200 ${isExpiredOrRevoked ? 'opacity-75' : 'hover:shadow-md'}`} style={{ animationDelay: `${idx * 50}ms` }}>
                <CardContent className="p-5">
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex items-center gap-3">
                      <div className={`h-10 w-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                        isExpiredOrRevoked
                          ? 'bg-gray-100 dark:bg-gray-800'
                          : 'bg-primary/10'
                      }`}>
                        <Users className={`h-5 w-5 ${isExpiredOrRevoked ? 'text-gray-400 dark:text-slate-500' : 'text-primary'}`} />
                      </div>
                      <div className="min-w-0">
                        <h3 className="font-medium text-seal-navy dark:text-white text-sm truncate">{access.name}</h3>
                        <p className="text-xs text-seal-gray-500 dark:text-slate-400 truncate">{access.company}</p>
                      </div>
                    </div>
                    <Badge className={`text-[10px] font-medium flex-shrink-0 ${status.className}`}>
                      {status.label}
                    </Badge>
                  </div>

                  <p className="text-xs text-seal-gray-500 dark:text-slate-400 truncate mb-2">{access.email}</p>

                  {access.scope && (
                    <p className="text-[11px] text-seal-gray-500 dark:text-slate-500 mb-2">
                      <Shield className="h-3 w-3 inline mr-1" />
                      {access.scope}
                    </p>
                  )}

                  <div className="flex items-center justify-between pt-3 border-t border-gray-100 dark:border-slate-700">
                    <div className="text-[11px] text-seal-gray-500 dark:text-slate-400 flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {access.accessExpiresAt
                        ? `Expire ${formatRelativeTime(access.accessExpiresAt)}`
                        : 'Sans expiration'}
                    </div>
                    {isAdmin && access.isActive && !(access.accessExpiresAt && new Date(access.accessExpiresAt) <= new Date()) && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleRevoke(access.id)}
                        loading={revoking === access.id}
                        className="text-red-600 border-red-200 hover:bg-red-50 hover:border-red-300 dark:text-red-400 dark:border-red-800 dark:hover:bg-red-900/20 text-xs px-2 py-1"
                      >
                        <UserX className="h-3.5 w-3.5" />
                        Révoquer
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
