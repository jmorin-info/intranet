'use client';

import { useEffect, useState, useRef } from 'react';
import { api } from '@/lib/api';

/**
 * Hook unifié qui appelle en parallèle les endpoints de compteurs pertinents
 * pour la sidebar, avec polling discret toutes les N ms.
 *
 * Gère silencieusement les erreurs (si un endpoint 500, le compteur
 * correspondant reste à 0 — on n'affiche pas "erreur" dans une pastille).
 *
 * Les stores existants (useNotificationStore, useAdminCountsStore) restent
 * en place pour leurs use-cases propres. Ce hook est la source de vérité
 * consolidée pour afficher des pastilles sidebar supplémentaires.
 */

const DEFAULT_POLL_MS = 60_000; // 60s

export interface SidebarCounters {
  /** Tickets assignés à l'user en statut OPEN/IN_PROGRESS. */
  myActiveTickets: number;
  /** Documents à approuver pour l'user (DIRECTION / approver). */
  pendingApprovals: number;
  /** Incidents critiques ouverts (pour RSSI/ADMIN). */
  criticalIncidents: number;
  /** Timestamp du dernier refresh (debug). */
  lastRefreshedAt: number;
}

const INITIAL: SidebarCounters = {
  myActiveTickets: 0,
  pendingApprovals: 0,
  criticalIncidents: 0,
  lastRefreshedAt: 0,
};

async function safeCountFromEndpoint(endpoint: string): Promise<number> {
  try {
    const { data } = await api.get<unknown>(endpoint);
    if (typeof data === 'number') return data;
    if (Array.isArray(data)) return data.length;
    if (data && typeof data === 'object') {
      const obj = data as Record<string, unknown>;
      if (typeof obj.count === 'number') return obj.count;
      if (typeof obj.total === 'number') return obj.total;
      if (Array.isArray(obj.data)) return obj.data.length;
      if (Array.isArray(obj.items)) return obj.items.length;
    }
    return 0;
  } catch {
    return 0;
  }
}

export function useSidebarCounters(pollMs: number = DEFAULT_POLL_MS): SidebarCounters {
  const [counters, setCounters] = useState<SidebarCounters>(INITIAL);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function refresh() {
      const [tickets, approvals, incidents] = await Promise.all([
        safeCountFromEndpoint('/tickets?assigneeId=me&status=OPEN,IN_PROGRESS&limit=1'),
        safeCountFromEndpoint('/approval-workflows/pending/me'),
        safeCountFromEndpoint('/incidents?severity=CRITICAL&status=OPEN&limit=1'),
      ]);
      if (cancelled) return;
      setCounters({
        myActiveTickets: tickets,
        pendingApprovals: approvals,
        criticalIncidents: incidents,
        lastRefreshedAt: Date.now(),
      });
    }

    refresh();
    timerRef.current = setInterval(refresh, pollMs);

    return () => {
      cancelled = true;
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [pollMs]);

  return counters;
}
