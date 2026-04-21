'use client';

import { useEffect, useRef } from 'react';
import { io, type Socket } from 'socket.io-client';
import { toast } from 'sonner';
import { isRoleAtLeast, UserRole } from '@omnitech/shared';
import { useAuthStore } from '@/stores/auth-store';
import { useNotificationStore, type Notification } from '@/stores/notification-store';

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || 'http://localhost:3000';

/** Notification types that map to a warning-level toast. */
const WARN_TYPES = new Set([
  'REVIEW_OVERDUE',
  'EXTERNAL_ACCESS_REVIEW',
  'ACK_REQUIRED',
]);

/** Notification types that map to an error/critical-level toast. */
const CRITICAL_TYPES = new Set([
  'SECURITY_ALERT',
  'ALERT_CRITICAL',
  'INCIDENT_CREATED',
]);

/**
 * Pick the right toast variant depending on notification type so that
 * security alerts and overdue reviews are visually distinct from normal
 * informational notifications.
 */
function showNotificationToast(notification: Notification): void {
  const opts = { description: notification.body, duration: 5000 } as const;

  if (CRITICAL_TYPES.has(notification.type)) {
    toast.error(notification.title, { ...opts, duration: 10000 });
  } else if (WARN_TYPES.has(notification.type)) {
    toast.warning(notification.title, { ...opts, duration: 8000 });
  } else {
    toast.info(notification.title, opts);
  }
}

export function useSocket(): void {
  const socketRef = useRef<Socket | null>(null);
  const { isAuthenticated, user } = useAuthStore();
  const { addNotification } = useNotificationStore();

  useEffect(() => {
    if (!isAuthenticated) {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
      return;
    }

    const token = localStorage.getItem('accessToken');
    if (!token) return;

    const socket = io(`${WS_URL}/notifications`, {
      auth: { token },
      // Monté sur /api/socket.io côté serveur (cf. apps/backend/src/socket-io-adapter.ts)
      // pour passer à travers le reverse proxy frontal qui ne route que /api/*.
      path: '/api/socket.io',
      transports: ['websocket'],
      reconnectionAttempts: 10,
      reconnectionDelay: 2000,
    });

    socket.on('connect', () => {
      // On (re)connection, refresh unread count so the badge is accurate
      // even if notifications arrived while we were disconnected.
      const { startPolling } = useNotificationStore.getState();
      // startPolling fires an immediate fetch then sets up an interval;
      // we only need the immediate fetch here so we stop polling right away.
      const stop = startPolling();
      stop();
    });

    socket.on('notification', (notification: Notification) => {
      addNotification(notification);
      showNotificationToast(notification);
    });

    // LDAP pending detecté — toast uniquement pour les admins
    socket.on('ldap-pending-new', (payload: { newDetected: number; totalPending: number }) => {
      if (!user || !isRoleAtLeast(user.role, UserRole.ADMIN)) return;
      toast.info('Nouveaux comptes AD à valider', {
        description: `${payload.newDetected} nouveau(x) · ${payload.totalPending} en attente au total`,
        duration: 8000,
        action: {
          label: 'Valider',
          onClick: () => {
            window.location.href = '/admin/ldap-pending';
          },
        },
      });
    });

    socket.on('connect_error', () => {
      // Silently handle - will retry automatically
    });

    socketRef.current = socket;

    return () => {
      socket.disconnect();
    };
  }, [isAuthenticated, addNotification, user]);
}
