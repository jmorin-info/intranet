import * as fs from 'node:fs';
import { assertBackgroundCapacity, availableMemoryBytes } from './reindex-safety';
jest.mock('node:fs');
describe('RAG resident memory guard', () => {
  afterEach(() => { jest.resetAllMocks(); delete process.env.RAG_MAINTENANCE_MODE; delete process.env.RAG_REINDEX_MIN_AVAILABLE_MB; });
  function memory(availableMiB: number, limit = 'max', used = '0') {
    jest.mocked(fs.readFileSync).mockImplementation(((file: string) => file === '/proc/meminfo' ? `MemAvailable: ${availableMiB * 1024} kB\nSwapFree: 99999999 kB\n` : file.endsWith('memory.max') ? limit : used) as any);
  }
  it('ignores swap and refuses semantic indexing on a tight six GiB machine', () => {
    memory(1024); expect(() => assertBackgroundCapacity(true)).toThrow('2048 MiB'); expect(() => assertBackgroundCapacity(false)).not.toThrow();
  });
  it('honors the lower remaining cgroup memory even if the host has ample RAM', () => {
    memory(32000, String(512 * 1024 * 1024), String(400 * 1024 * 1024));
    expect(availableMemoryBytes()).toBe(112 * 1024 * 1024); expect(() => assertBackgroundCapacity(false)).toThrow();
  });
  it('fails closed when memory cannot be read, and does not lower floors from configuration', () => {
    jest.mocked(fs.readFileSync).mockImplementation(() => { throw new Error('unavailable'); });
    expect(() => assertBackgroundCapacity(false)).toThrow();
    memory(1024); process.env.RAG_REINDEX_MIN_AVAILABLE_MB = '1'; expect(() => assertBackgroundCapacity(true)).toThrow('2048 MiB');
  });
  it('honors maintenance mode regardless of capacity', () => { memory(64000); process.env.RAG_MAINTENANCE_MODE = 'true'; expect(() => assertBackgroundCapacity(false)).toThrow('maintenance'); });
});
