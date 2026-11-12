import { StorageService } from './storage.service';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as crypto from 'crypto';

describe('StorageService confinement and signed downloads', () => {
  let service: StorageService;
  let directory: string;
  let outside: string;
  const originalPath = process.env.STORAGE_PATH;
  const originalSecret = process.env.STORAGE_SECRET;

  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ged-storage-'));
    outside = fs.mkdtempSync(path.join(os.tmpdir(), 'ged-outside-'));
    process.env.STORAGE_PATH = directory;
    process.env.STORAGE_SECRET = 'test-storage-secret';
    service = new StorageService();
  });

  afterEach(() => {
    fs.rmSync(directory, { recursive: true, force: true });
    fs.rmSync(outside, { recursive: true, force: true });
    if (originalPath === undefined) delete process.env.STORAGE_PATH; else process.env.STORAGE_PATH = originalPath;
    if (originalSecret === undefined) delete process.env.STORAGE_SECRET; else process.env.STORAGE_SECRET = originalSecret;
  });

  it('roundtrips a generated token through the actual download route', async () => {
    const signed = await service.generateSignedUrl('/storage/documents/a/file.pdf');
    expect(signed).toMatch(/^\/storage\/download\/[A-Za-z0-9_-]+\?/);
    expect(service.validateSignedUrl(signed)).toEqual({ valid: true, fileUrl: '/storage/documents/a/file.pdf' });
    expect(service.validateSignedUrl(signed.replace('signature=', 'signature=f'))).toEqual({ valid: false, fileUrl: '' });
  });

  it.each(['NaN', 'Infinity', '9007199254740992', '1'])('rejects malformed or expired deadline %s even with a valid HMAC', (expires) => {
    const fileUrl = '/storage/documents/test.pdf';
    const signature = crypto.createHmac('sha256', 'test-storage-secret').update(`${fileUrl}:${expires}`).digest('hex');
    expect(service.validateSignedUrl(`${fileUrl}?expires=${expires}&signature=${signature}`).valid).toBe(false);
  });

  it('rejects signed traversal and malformed tokens', async () => {
    const signed = await service.generateSignedUrl('/storage/../../etc/passwd');
    expect(service.validateSignedUrl(signed).valid).toBe(false);
    expect(service.validateSignedUrl('/storage/download/%%%?expires=99&signature=aa').valid).toBe(false);
    expect(() => service.getFilePath('/storage/../../etc/passwd')).toThrow();
  });

  it('writes immutable private files with safe extensions', async () => {
    const first = await service.storeBuffer(Buffer.from('hello'), '../../report.PDF', 'documents/doc');
    const second = await service.storeBuffer(Buffer.from('world'), '../../report.PDF', 'documents/doc');
    expect(first.filePath).not.toBe(second.filePath);
    expect(first.fileUrl).toMatch(/^\/storage\/documents\/doc\/[\w-]+\.pdf$/);
    expect(fs.readFileSync(first.filePath, 'utf8')).toBe('hello');
    expect(fs.statSync(first.filePath).mode & 0o777).toBe(0o600);
  });

  it('rejects a storage directory symlink that escapes the storage root', async () => {
    fs.symlinkSync(outside, path.join(directory, 'escape'), 'dir');
    expect(() => service.getFilePath('/storage/escape/private.txt')).toThrow();
    await expect(service.storeBuffer(Buffer.from('secret'), 'report.txt', 'escape')).rejects.toThrow();
    expect(fs.readdirSync(outside)).toEqual([]);
  });
});
