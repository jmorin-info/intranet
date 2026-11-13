import { Readable, PassThrough } from 'node:stream';
import { TextExtractorService } from './text-extractor.service';
describe('Bounded version text extraction', () => {
  it('extracts a native HTML snapshot without document headers or executable markup', async () => {
    const storage = { getFileStream: () => Readable.from(['<!doctype html><html><head><title>Private header</title></head><body><h1>Current snapshot</h1><script>secretScript()</script><style>secretStyle</style><p>Actual policy</p></body></html>']) };
    const result = await new TextExtractorService(storage as any).extractText('/storage/version.html', 'text/html');
    expect(result).toMatch(/Current snapshot/i); expect(result).toContain('Actual policy');
    expect(result).not.toMatch(/Private header|secretScript|secretStyle/);
  });
  it('rejects a file beyond 16 MiB and destroys the source stream', async () => {
    const stream = Readable.from([Buffer.alloc(16 * 1024 * 1024), Buffer.from('overflow')]);
    const storage = { getFileStream: () => stream };
    await expect(new TextExtractorService(storage as any).extractText('/storage/large.txt', 'text/plain')).resolves.toBeNull();
    expect(stream.destroyed).toBe(true);
  });
  it('cancels a pending read and closes the file stream', async () => {
    const stream = new PassThrough(); const controller = new AbortController();
    const promise = new TextExtractorService({ getFileStream: () => stream } as any).extractText('/storage/pending.txt', 'text/plain', controller.signal);
    controller.abort(new Error('operator cancelled'));
    await expect(promise).rejects.toThrow('operator cancelled'); expect(stream.destroyed).toBe(true);
  });
  it('does not open a file for a pre-cancelled job', async () => {
    const storage = { getFileStream: jest.fn() }; const controller = new AbortController(); controller.abort(new Error('stopped'));
    await expect(new TextExtractorService(storage as any).extractText('/storage/file.txt', 'text/plain', controller.signal)).rejects.toThrow('stopped');
    expect(storage.getFileStream).not.toHaveBeenCalled();
  });
});
