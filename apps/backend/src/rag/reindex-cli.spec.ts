import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
const { validateConfig } = require('../../scripts/reindex-lexical.cjs');
describe('Lexical maintenance CLI boundary', () => {
  let storage: string;
  const config = () => ({ args: ['--check'], uid: 0, nodeVersion: '24.22.3', env: { DATABASE_URL: 'postgresql://maintainer:synthetic@127.0.0.1:5432/disposable', STORAGE_PATH: storage } as Record<string, string> });
  beforeEach(() => { storage = fs.mkdtempSync(path.join(os.tmpdir(), 'rag-cli-test-')); });
  afterEach(() => fs.rmSync(storage, { recursive: true, force: true }));
  it('accepts an explicit local database/storage and bounds connection resources', () => {
    const checked = validateConfig(config()); expect(checked.mode).toBe('check'); expect(checked.storage).toBe(fs.realpathSync(storage));
    expect(checked.database.searchParams.get('connection_limit')).toBe('2'); expect(checked.database.searchParams.get('connect_timeout')).toBe('5');
  });
  it('requires OS root and the qualified Node24 release', () => {
    expect(() => validateConfig({ ...config(), uid: 1000 })).toThrow('os_root_required');
    for (const nodeVersion of ['20.20.2', '22.22.1', '24.22.2', '26.0.0']) expect(() => validateConfig({ ...config(), nodeVersion })).toThrow('qualified_node24_required');
  });
  it('rejects non-local databases without echoing their credentials', () => {
    const input = config(); input.env.DATABASE_URL = 'postgresql://private:secret@10.33.120.55:5432/business';
    expect(() => validateConfig(input)).toThrow('local_database_required');
  });
  it('requires a real existing storage directory, never creating a replacement', () => {
    const input = config(); input.env.STORAGE_PATH = path.join(storage, 'missing');
    expect(() => validateConfig(input)).toThrow(); expect(fs.existsSync(input.env.STORAGE_PATH)).toBe(false);
    input.env.STORAGE_PATH = './relative'; expect(() => validateConfig(input)).toThrow('absolute_storage_path_required');
  });
  it('honors the maintenance stop and requires an explicit check/apply mode', () => {
    const input = config(); input.env.RAG_MAINTENANCE_MODE = 'true'; expect(() => validateConfig(input)).toThrow('maintenance_mode_active');
    expect(() => validateConfig({ ...config(), args: [] })).toThrow('usage'); expect(() => validateConfig({ ...config(), args: ['--apply', '--semantic'] })).toThrow('usage');
  });
});
