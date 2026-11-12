import type { NextFunction, Request, Response } from 'express';
import { blockPrivateUploads } from './private-uploads.middleware';
import { ExpressAdapter } from '@nestjs/platform-express';
import { mkdtemp, mkdir, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { createServer, get, Server } from 'http';
import type { AddressInfo } from 'net';

describe('private attachment static access', () => {
  function request(path: string) {
    const end = jest.fn();
    const status = jest.fn().mockReturnValue({ end });
    const next = jest.fn();
    blockPrivateUploads({ path } as Request, { status } as unknown as Response, next as NextFunction);
    return { status, end, next };
  }

  it.each([
    '/uploads/wiki/attachment.pdf',
    '/uploads/certificates/certificate.pdf',
    '/uploads/certificates/thumbs/certificate.webp',
    '/uploads/%77iki/attachment.pdf',
    '/uploads/%63ertificates/certificate.pdf',
    '/uploads/public/../wiki/attachment.pdf',
    '/uploads/public/%2e%2e/certificates/certificate.pdf',
    '/uploads/wiki%2fattachment.pdf',
    '/uploads\\wiki\\attachment.pdf',
    '//uploads/wiki/attachment.pdf',
    '/UPLOADS/wiki/attachment.pdf',
    '/uPlOaDs/certificates/certificate.pdf',
  ])('does not allow a static download from %s', (path) => {
    const result = request(path);
    expect(result.status).toHaveBeenCalledWith(404);
    expect(result.end).toHaveBeenCalled();
    expect(result.next).not.toHaveBeenCalled();
  });

  it.each(['/uploads/avatars/avatar.png', '/uploads/news/image.jpg', '/api/v1/wiki/attachments/file.pdf'])('preserves the route %s', (path) => {
    const result = request(path);
    expect(result.status).not.toHaveBeenCalled();
    expect(result.next).toHaveBeenCalledTimes(1);
  });

  it('rejects malformed URI encoding', () => {
    const result = request('/uploads/%E0%A4');
    expect(result.status).toHaveBeenCalledWith(400);
    expect(result.next).not.toHaveBeenCalled();
  });
});

describe('private uploads with the real static server', () => {
  let directory: string;
  let server: Server;
  let port: number;

  beforeAll(async () => {
    directory = await mkdtemp(join(tmpdir(), 'private-uploads-'));
    for (const name of ['wiki', 'certificates', 'avatars']) {
      await mkdir(join(directory, name));
      await writeFile(join(directory, name, 'file.txt'), 'fixture-content');
    }
    const adapter = new ExpressAdapter();
    adapter.use(blockPrivateUploads);
    adapter.useStaticAssets(directory, { prefix: '/uploads/' });
    server = createServer(adapter.getInstance());
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    port = (server.address() as AddressInfo).port;
  });

  afterAll(async () => {
    if (server) await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    if (directory) await rm(directory, { recursive: true, force: true });
  });

  async function read(path: string): Promise<{ status: number; body: string }> {
    return new Promise((resolve, reject) => {
      get({ hostname: '127.0.0.1', port, path }, (response) => {
        let body = '';
        response.on('data', (chunk) => { body += chunk; });
        response.on('end', () => resolve({ status: response.statusCode || 0, body }));
        response.on('error', reject);
      }).on('error', reject);
    });
  }

  it.each([
    '/uploads/wiki/file.txt',
    '/UPLOADS/wiki/file.txt',
    '/uPlOaDs/certificates/file.txt',
    '/uploads/%77iki/file.txt',
    '/uploads/public/%2e%2e/certificates/file.txt',
    '/uploads/wiki%2ffile.txt',
  ])('never serves private content for %s', async (path) => {
    const response = await read(path);
    expect(response.status).toBe(404);
    expect(response.body).not.toContain('fixture-content');
  });

  it('keeps public avatars accessible', async () => {
    await expect(read('/uploads/avatars/file.txt')).resolves.toEqual({ status: 200, body: 'fixture-content' });
  });
});
