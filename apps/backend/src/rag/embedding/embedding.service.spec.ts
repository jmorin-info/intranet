import { EmbeddingService } from './embedding.service';
import * as safety from '../reindex-safety';

describe('Embedding resource and cancellation contract', () => {
  let service: EmbeddingService;
  let fetchMock: jest.Mock;
  const response = (value: unknown = Array(1024).fill(0.1)) => ({ ok: true, json: async () => ({ embedding: value }) });
  const savedFetch = global.fetch;
  beforeEach(() => {
    process.env.RAG_SEMANTIC_ENABLED = 'true';
    service = new EmbeddingService(); fetchMock = jest.fn().mockResolvedValue(response()); global.fetch = fetchMock;
    jest.spyOn(safety, 'assertBackgroundCapacity').mockImplementation(() => {});
  });
  afterEach(() => {
    jest.useRealTimers(); jest.restoreAllMocks(); global.fetch = savedFetch;
    for (const key of ['RAG_SEMANTIC_ENABLED', 'RAG_EMBEDDING_CACHE_MAX', 'RAG_EMBEDDING_CACHE_TTL_MS', 'OLLAMA_EMBEDDING_KEEP_ALIVE_SECONDS']) delete process.env[key];
  });
  it('sets a bounded model lifetime and caches finite vectors without sharing mutable arrays', async () => {
    process.env.OLLAMA_EMBEDDING_KEEP_ALIVE_SECONDS = '10000';
    const first = await service.embed('valid'); first[0] = 999;
    expect((await service.embed('valid'))[0]).toBe(0.1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({ keep_alive: '300s' });
  });
  it('expires cached text and bounds the number of retained vectors', async () => {
    jest.useFakeTimers(); process.env.RAG_EMBEDDING_CACHE_MAX = '1'; process.env.RAG_EMBEDDING_CACHE_TTL_MS = '100';
    await service.embed('first'); await service.embed('second'); await service.embed('first');
    expect(fetchMock).toHaveBeenCalledTimes(3);
    jest.advanceTimersByTime(101); await service.embed('first'); expect(fetchMock).toHaveBeenCalledTimes(4);
    expect((service as any).cache.size).toBe(1);
  });
  it('does not start background inference below the capacity threshold', async () => {
    jest.mocked(safety.assertBackgroundCapacity).mockImplementation(() => { throw new Error('capacity'); });
    await expect(service.embed('valid', { background: true })).rejects.toThrow('capacity');
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('rejects empty or oversized input before allocating an inference request', async () => {
    await expect(service.embed(' ')).rejects.toThrow('1–16000');
    await expect(service.embed('x'.repeat(16001))).rejects.toThrow('1–16000');
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('does not retry caller cancellation', async () => {
    const controller = new AbortController();
    fetchMock.mockImplementation(async (_url, options) => new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true })));
    const operation = service.embed('valid', { signal: controller.signal });
    await new Promise((resolve) => setImmediate(resolve));
    controller.abort(new Error('operator stopped'));
    await expect(operation).rejects.toThrow('operator stopped'); expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it('serializes inference and cancels a queued request without advancing later requests early', async () => {
    let finish!: (value: unknown) => void;
    fetchMock.mockImplementationOnce(async () => new Promise((resolve) => { finish = resolve; }));
    const first = service.embed('first'); await Promise.resolve(); await Promise.resolve();
    const controller = new AbortController();
    const cancelled = service.embed('cancelled', { signal: controller.signal });
    const third = service.embed('third'); controller.abort(new Error('cancelled'));
    await expect(cancelled).rejects.toThrow('cancelled'); expect(fetchMock).toHaveBeenCalledTimes(1);
    finish(response()); await first; await third;
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).prompt).toBe('third');
  });
  it('validates each vector component and clears all timeout handles after a failed response', async () => {
    jest.useFakeTimers(); fetchMock.mockResolvedValue(response(Array(1024).fill(NaN)));
    const operation = service.embed('invalid'); const failure = expect(operation).rejects.toThrow('Invalid embedding vector');
    await jest.runAllTimersAsync(); await failure;
    expect(fetchMock).toHaveBeenCalledTimes(3); expect(jest.getTimerCount()).toBe(0);
  });
  it('keeps the timeout active until JSON body consumption finishes', async () => {
    jest.useFakeTimers();
    fetchMock.mockImplementation(async (_url, options) => ({ ok: true, json: () => new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => reject(new Error('body timeout')), { once: true })) }));
    const operation = service.embed('slow'); const failure = expect(operation).rejects.toThrow('body timeout');
    await jest.runAllTimersAsync(); await failure;
    expect(fetchMock).toHaveBeenCalledTimes(3); expect(jest.getTimerCount()).toBe(0);
  });
});
