import { ConflictException } from '@nestjs/common';
import { acquireReindexLease } from './reindex-lease';
import Redis from 'ioredis';
jest.mock('ioredis');
describe('Distributed reindex lease', () => {
  let client: any;
  beforeEach(() => {
    client = { on: jest.fn(), connect: jest.fn().mockResolvedValue(undefined), set: jest.fn().mockResolvedValue('OK'), eval: jest.fn().mockResolvedValue(1), disconnect: jest.fn() };
    jest.mocked(Redis).mockImplementation(() => client);
  });
  afterEach(() => jest.clearAllMocks());
  it('uses a unique owner, an NX expiry beyond the hard deadline and conditional release', async () => {
    const release = await acquireReindexLease(60_000);
    expect(client.set).toHaveBeenCalledWith('omnitech:rag:reindex:v1', expect.any(String), 'PX', 120_000, 'NX');
    await release();
    expect(client.eval).toHaveBeenCalledWith(expect.stringContaining("== ARGV[1]"), 1, 'omnitech:rag:reindex:v1', client.set.mock.calls[0][1]);
    expect(client.disconnect).toHaveBeenCalled();
  });
  it('rejects a run owned by another process and never deletes its lock', async () => {
    client.set.mockResolvedValue(null);
    await expect(acquireReindexLease(1000)).rejects.toBeInstanceOf(ConflictException);
    expect(client.eval).not.toHaveBeenCalled(); expect(client.disconnect).toHaveBeenCalled();
  });
  it('fails closed and redacts transport errors instead of starting unlocked work', async () => {
    client.connect.mockRejectedValue(new Error('redis://secret:password@host'));
    await expect(acquireReindexLease(1000)).rejects.toThrow('lock unavailable');
    expect(client.set).not.toHaveBeenCalled(); expect(client.disconnect).toHaveBeenCalled();
  });
});
