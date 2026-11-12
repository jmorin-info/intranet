import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AxiosError, CanceledError } from 'axios';
import { api } from '../api';
import { showToast } from '../toast-utils';

vi.mock('../toast-utils', () => ({ showToast: vi.fn() }));

describe('API request cancellation', () => {
  beforeEach(() => vi.clearAllMocks());
  it('preserves an intentional cancellation without reporting a network outage', async () => {
    await expect(api.get('/approval-workflows/pending/me', { adapter: async () => {
      throw new CanceledError('Replaced request');
    } })).rejects.toMatchObject({ code: 'ERR_CANCELED' });
    expect(showToast).not.toHaveBeenCalled();
  });
  it.each(['ERR_NETWORK', 'ECONNABORTED'])('still reports a genuine failure (%s)', async (code) => {
    await expect(api.get('/approval-workflows/pending/me', { adapter: async (config) => {
      throw new AxiosError('Transport unavailable', code, config);
    } })).rejects.toMatchObject({ code });
    expect(showToast).toHaveBeenCalledWith('error', 'api.networkError', expect.any(String));
  });
});
