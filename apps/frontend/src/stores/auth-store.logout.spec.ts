import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { api } from '@/lib/api';
import { toast } from 'sonner';
import { useAuthStore } from './auth-store';

vi.mock('@/lib/api', () => ({ api: { post: vi.fn() } }));
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }));

describe('logout preserves an unconfirmed live session on transport failure', () => {
  const removeItem = vi.fn();
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('localStorage', { removeItem });
    useAuthStore.setState({ user: { id: 'user-1' } as any, isAuthenticated: true, isLoading: false });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('uses the legacy-compatible cookie path and clears state only after confirmation', async () => {
    vi.mocked(api.post).mockResolvedValue({ status: 200 } as any);
    await useAuthStore.getState().logout();
    expect(api.post).toHaveBeenCalledWith('/auth/refresh/logout', {});
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(removeItem).toHaveBeenCalledWith('accessToken');
  });

  it('401 means the browser has no verifiable session left', async () => {
    vi.mocked(api.post).mockRejectedValue({ response: { status: 401 } });
    await useAuthStore.getState().logout();
    expect(useAuthStore.getState().user).toBeNull();
    expect(toast.error).not.toHaveBeenCalled();
  });

  it.each([new Error('offline'), { response: { status: 503 } }])('does not announce logout or erase the proof when the server cannot confirm: %o', async error => {
    vi.mocked(api.post).mockRejectedValue(error);
    await expect(useAuthStore.getState().logout()).rejects.toBe(error);
    expect(useAuthStore.getState().isAuthenticated).toBe(true);
    expect(useAuthStore.getState().user?.id).toBe('user-1');
    expect(removeItem).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledTimes(1);
  });
});
