import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { api } from '../api';

vi.mock('../toast-utils', () => ({ showToast: vi.fn() }));

function unauthorized(config: InternalAxiosRequestConfig) {
  return new AxiosError('Identifiants incorrects', 'ERR_BAD_REQUEST', config, undefined,
    { data: { message: 'Identifiants incorrects' }, status: 401, statusText: 'Unauthorized', headers: {}, config });
}

describe('Authentication error handling', () => {
  let storage: Record<string, string>;
  let location: { href: string; pathname: string; search: string };
  beforeEach(() => {
    storage = {};
    location = { href: '/login', pathname: '/login', search: '' };
    vi.stubGlobal('window', { location });
    vi.stubGlobal('localStorage', {
      getItem: vi.fn((key: string) => storage[key] || null),
      removeItem: vi.fn((key: string) => { delete storage[key]; }),
      setItem: vi.fn((key: string, value: string) => { storage[key] = value; }),
    });
  });
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  it.each(['/auth/login', '/auth/login/?from=expired', '/auth/refresh', '/auth/refresh/logout',
    '/auth/logout', '/auth/forgot-password', '/auth/reset-password',
    'http://localhost:3000/api/v1/auth/login'])(
    'preserves a rejected public authentication request: %s', async (url) => {
      const refresh = vi.spyOn(axios, 'post').mockRejectedValue(new Error('Unexpected refresh'));
      let expected: AxiosError | undefined;
      await expect(api.post(url, {}, { adapter: async (config) => {
        expected = unauthorized(config); throw expected;
      } })).rejects.toMatchObject({ response: { status: 401, data: { message: 'Identifiants incorrects' } } });
      expect(expected).toBeDefined();
      expect(refresh).not.toHaveBeenCalled();
      expect(location.href).toBe('/login');
      expect(localStorage.removeItem).not.toHaveBeenCalled();
    },
  );

  it('still refreshes a protected request and removes its obsolete injected bearer', async () => {
    storage.accessToken = 'legacy-test-bearer';
    const refresh = vi.spyOn(axios, 'post').mockResolvedValue({ data: { accessToken: 'rotated-test-token' } });
    const seen: Array<string | undefined> = [];
    const response = await api.get('/auth/me', { adapter: async (config) => {
      seen.push(config.headers.get('Authorization')?.toString());
      if (seen.length === 1) throw unauthorized(config);
      return { data: { id: 'synthetic-user' }, status: 200, statusText: 'OK', headers: {}, config };
    } });
    expect(response.status).toBe(200);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(seen).toEqual(['Bearer legacy-test-bearer', undefined]);
    expect(location.href).toBe('/login');
  });

  it('bounds queued requests to one retry when their refreshed credentials are still rejected', async () => {
    let release!: (value: unknown) => void;
    const refresh = vi.spyOn(axios, 'post').mockImplementation(() => new Promise((resolve) => { release = resolve; }));
    const adapter = async (config: InternalAxiosRequestConfig) => { throw unauthorized(config); };
    const first = api.get('/auth/me', { adapter });
    const second = api.get('/auth/me', { adapter });
    const settled = Promise.allSettled([first, second]);
    await vi.waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    release({ data: { accessToken: 'rotated-test-token' } });
    expect((await settled).map((result) => result.status)).toEqual(['rejected', 'rejected']);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it.each([403, 429])('keeps request metadata for an optional GET rejected with %s', async (status) => {
    const response = await api.get('/auth/me', { adapter: async (config) => {
      const error = unauthorized(config);
      error.response!.status = status;
      throw error;
    } });
    expect(response.status).toBe(status);
    expect(response.data).toBeNull();
    expect(response.config.url).toBe('/auth/me');
  });
});
