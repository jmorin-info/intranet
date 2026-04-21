'use client';

/**
 * Hub de sélection d'espace de ticketing — affiché AVANT la liste des
 * tickets, sur /tickets (sans query param `?space=slug`).
 *
 * L'utilisateur voit des cards pour chaque espace accessible (via
 * /tickets/spaces, filtré ACL-aware côté backend), avec nombre de tickets
 * et statuts d'activité. Un clic navigue vers /tickets?space=<slug>
 * (la vraie liste filtrée).
 *
 * Pattern demandé par l'user 2026-04-20 : "le choix de l'espace à afficher
 * doit apparaître en amont de l'espace de ticketing, pas dans l'espace".
 */

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Inbox, Monitor, Briefcase, Shield, Plus, Users, Settings, ChevronRight,
} from 'lucide-react';
import { Card, CardContent, Button, Badge, Skeleton, EmptyState } from '@omnitech/ui';
import { api } from '@/lib/api';
import { isRoleAtLeast, UserRole } from '@omnitech/shared';
import { useAuthStore } from '@/stores/auth-store';

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  Inbox, Monitor, Briefcase, Shield,
};

interface SpaceWithStats {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  icon: string | null;
  color: string | null;
  isDefault: boolean;
  isActive: boolean;
  _count?: { tickets: number };
}

export function TicketSpacesHub() {
  const user = useAuthStore((s) => s.user);
  const [spaces, setSpaces] = useState<SpaceWithStats[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get('/tickets/spaces')
      .then((r) => {
        const data = Array.isArray(r.data) ? r.data : [];
        setSpaces(data);
      })
      .catch(() => setSpaces([]))
      .finally(() => setLoading(false));
  }, []);

  const isAdmin = user && isRoleAtLeast(user.role, UserRole.ADMIN);

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-semibold text-seal-navy dark:text-white">
            Espaces de ticketing
          </h1>
          <p className="text-sm text-seal-gray-500 dark:text-slate-400 mt-1">
            Choisissez un espace pour afficher ses tickets. Vous ne voyez que les
            espaces auxquels vous êtes membre (via votre rôle, département ou
            affectation directe).
          </p>
        </div>
        {isAdmin && (
          <Link
            href="/admin/ticket-spaces"
            className="flex-shrink-0 inline-flex items-center gap-1.5 text-sm px-3 py-2 rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-gray-50 dark:hover:bg-slate-800 text-seal-navy dark:text-white"
          >
            <Settings className="h-4 w-4" />
            Gérer les espaces
          </Link>
        )}
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-32 w-full rounded-xl" />
          ))}
        </div>
      ) : spaces.length === 0 ? (
        <EmptyState
          title="Aucun espace accessible"
          description={
            isAdmin
              ? "Aucun espace de ticketing n'est configuré. Créez-en un pour commencer."
              : "Vous n'êtes membre d'aucun espace de ticketing. Contactez votre administrateur pour obtenir l'accès."
          }
          action={
            isAdmin ? (
              <Link href="/admin/ticket-spaces">
                <Button>
                  <Plus className="h-4 w-4" /> Créer un espace
                </Button>
              </Link>
            ) : undefined
          }
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {spaces.map((space) => {
            const Icon = (space.icon && ICONS[space.icon]) || Inbox;
            const color = space.color ?? '#676d7f';
            return (
              <Link
                key={space.id}
                href={`/tickets?space=${encodeURIComponent(space.slug)}`}
                className="group block"
              >
                <Card
                  hoverable
                  className="h-full transition-all duration-150 group-hover:-translate-y-0.5 group-hover:shadow-card-hover"
                >
                  <CardContent className="p-5 space-y-3">
                    <div className="flex items-start justify-between">
                      <span
                        className="flex h-11 w-11 items-center justify-center rounded-xl flex-shrink-0"
                        style={{ backgroundColor: `${color}1a`, color }}
                      >
                        <Icon className="h-5 w-5" />
                      </span>
                      <div className="flex items-center gap-1.5">
                        {space.isDefault && (
                          <Badge variant="seal-blue" className="text-[10px]">
                            défaut
                          </Badge>
                        )}
                        <ChevronRight className="h-4 w-4 text-seal-gray-400 group-hover:text-seal-orange transition-colors" />
                      </div>
                    </div>
                    <div>
                      <h3 className="text-base font-semibold text-seal-navy dark:text-white truncate">
                        {space.name}
                      </h3>
                      {space.description && (
                        <p className="text-xs text-seal-gray-500 dark:text-slate-400 mt-1 line-clamp-2">
                          {space.description}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-[11px] text-seal-gray-500 pt-2 border-t border-gray-100 dark:border-slate-800">
                      <span className="inline-flex items-center gap-1">
                        <Inbox className="h-3.5 w-3.5" />
                        <strong className="text-seal-navy dark:text-white">
                          {space._count?.tickets ?? 0}
                        </strong>
                        &nbsp;ticket{(space._count?.tickets ?? 0) !== 1 ? 's' : ''}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
