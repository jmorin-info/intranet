'use client';

import { create } from 'zustand';
import { api } from '@/lib/api';

export interface Notification {
  id: string;
  type: string;
  title: string;
  body: string;
  resourceType?: string;
  resourceId?: string;
  isRead: boolean;
  createdAt: string;
}

interface NotificationState {
  notifications: Notification[];
  unreadCount: number;
  setNotifications: (notifications: Notification[]) => void;
  addNotification: (notification: Notification) => void;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  setUnreadCount: (count: number) => void;
  startPolling: () => () => void;
}

export const useNotificationStore = create<NotificationState>((set) => ({
  notifications: [],
  unreadCount: 0,

  setNotifications: (notifications) =>
    set({
      notifications,
      unreadCount: notifications.filter((n) => !n.isRead).length,
    }),

  addNotification: (notification) =>
    set((state) => ({
      notifications: [notification, ...state.notifications],
      unreadCount: state.unreadCount + (notification.isRead ? 0 : 1),
    })),

  markAsRead: (id) =>
    set((state) => ({
      notifications: state.notifications.map((n) =>
        n.id === id ? { ...n, isRead: true } : n,
      ),
      unreadCount: Math.max(0, state.unreadCount - 1),
    })),

  markAllAsRead: () =>
    set((state) => ({
      notifications: state.notifications.map((n) => ({ ...n, isRead: true })),
      unreadCount: 0,
    })),

  setUnreadCount: (count) => set({ unreadCount: count }),

  // Poll the unread count every 60 seconds. Returns a cleanup function.
  startPolling: () => {
    const fetchCount = () => {
      api.get('/notifications/unread-count')
        .then(({ data }) => {
          const count = typeof data?.count === 'number' ? data.count : (typeof data === 'number' ? data : undefined);
          if (count !== undefined) set({ unreadCount: count });
        })
        .catch(() => {/* silently ignore polling errors */});
    };

    fetchCount(); // immediate first fetch
    const interval = setInterval(fetchCount, 60000);
    return () => clearInterval(interval);
  },
}));
