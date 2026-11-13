import { LlmWarmupService } from './llm-warmup.service';
import * as safety from '../reindex-safety';
describe('LLM startup resource guard', () => {
  let llm: any, embedding: any, service: LlmWarmupService;
  beforeEach(() => {
    llm = { warmup: jest.fn().mockResolvedValue({ model: 'synthetic', latencyMs: 1 }) };
    embedding = { isEnabled: () => true, embed: jest.fn().mockResolvedValue([]), getModelId: () => 'synthetic' };
    service = new LlmWarmupService(llm, embedding);
    jest.spyOn(safety, 'assertBackgroundCapacity').mockImplementation(() => {});
    jest.spyOn(safety, 'availableMemoryBytes').mockReturnValue(8192 * 1024 * 1024);
    process.env.OLLAMA_ENABLED = 'true';
  });
  afterEach(() => { jest.restoreAllMocks(); delete process.env.OLLAMA_ENABLED; delete process.env.OLLAMA_WARMUP_ENABLED; delete process.env.RAG_MAINTENANCE_MODE; });
  it('loads no model at boot without explicit warmup opt-in', async () => {
    service.onModuleInit(); await Promise.resolve(); expect(llm.warmup).not.toHaveBeenCalled(); expect(embedding.embed).not.toHaveBeenCalled();
  });
  it('loads no model during maintenance, even when warmup is explicitly enabled', async () => {
    process.env.OLLAMA_WARMUP_ENABLED = 'true'; process.env.RAG_MAINTENANCE_MODE = 'true';
    service.onModuleInit(); await Promise.resolve(); expect(llm.warmup).not.toHaveBeenCalled(); expect(embedding.embed).not.toHaveBeenCalled();
  });
  it('rejects warmup below four GiB of resident headroom', async () => {
    jest.mocked(safety.availableMemoryBytes).mockReturnValue(3 * 1024 * 1024 * 1024);
    await service.warmupAll(); expect(llm.warmup).not.toHaveBeenCalled(); expect(embedding.embed).not.toHaveBeenCalled();
  });
  it('passes the background guard to embedding warmup after the LLM call', async () => {
    await service.warmupAll(); expect(llm.warmup).toHaveBeenCalledTimes(1);
    expect(embedding.embed).toHaveBeenCalledWith('warmup omnitech intranet', { background: true });
  });
});
