import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useNotificationStore, type Notification } from './notification-store';

vi.mock('@/lib/api', () => ({ api: { get: vi.fn() } }));

const item = (id: string, isRead = false): Notification => ({
  id, isRead, type: 'DOC_PUBLISHED', title: id, body: '', createdAt: '2026-11-13T08:00:00Z',
});

describe('Notification inbox and global unread count', () => {
  beforeEach(() => useNotificationStore.setState({ notifications: [], unreadCount: 0 }));

  it('keeps the server total when loading or replacing a partial page', () => {
    const store = useNotificationStore.getState();
    store.setUnreadCount(63);
    store.setNotifications([item('first'), item('second', true)]);
    expect(useNotificationStore.getState().unreadCount).toBe(63);
    store.setNotifications([item('second', true)]);
    expect(useNotificationStore.getState().unreadCount).toBe(63);
  });

  it('marks a known unread item once, without decrementing for missing or already-read IDs', () => {
    const store = useNotificationStore.getState();
    store.setNotifications([item('first'), item('second', true)]);
    store.setUnreadCount(63);
    store.markAsRead('first');
    store.markAsRead('first');
    store.markAsRead('second');
    store.markAsRead('unknown');
    expect(useNotificationStore.getState().unreadCount).toBe(62);
    expect(useNotificationStore.getState().notifications.every((n) => n.isRead)).toBe(true);
  });

  it('ignores duplicate websocket deliveries, including a delivery after a local read', () => {
    const store = useNotificationStore.getState();
    store.addNotification(item('event'));
    store.addNotification(item('event'));
    expect(useNotificationStore.getState().unreadCount).toBe(1);
    store.markAsRead('event');
    store.addNotification(item('event'));
    expect(useNotificationStore.getState().notifications).toEqual([item('event', true)]);
    expect(useNotificationStore.getState().unreadCount).toBe(0);
  });

  it('appends an overlapping page without dropping an event or reverting read state', () => {
    const store = useNotificationStore.getState();
    store.setNotifications([item('first')]);
    store.setUnreadCount(63);
    // An event and a local read arrive while the next page is in flight.
    store.addNotification(item('live'));
    store.markAsRead('first');
    store.appendNotifications([item('first'), item('second'), item('second')]);
    expect(useNotificationStore.getState().notifications).toEqual([item('live'), item('first', true), item('second')]);
    expect(useNotificationStore.getState().unreadCount).toBe(63);
  });
});
