import { execFile } from 'child_process';
import { promises as fs } from 'fs';
import { ScannerService } from './scanner.service';

jest.mock('child_process', () => ({ ...jest.requireActual('child_process'), execFile: jest.fn() }));
jest.mock('fs', () => {
  const real = jest.requireActual('fs');
  return { ...real, promises: { ...real.promises, mkdir: jest.fn().mockResolvedValue(undefined), rename: jest.fn().mockResolvedValue(undefined) } };
});

describe('ScannerService fail-closed scanning', () => {
  let service: ScannerService;
  let prisma: any;
  let notifications: any;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = {
      document: { updateMany: jest.fn().mockResolvedValue({ count: 1 }), findUnique: jest.fn().mockResolvedValue({ reference: 'TEST' }) },
      user: { findMany: jest.fn().mockResolvedValue([{ id: 'admin' }]) },
    };
    notifications = { create: jest.fn().mockResolvedValue({}) };
    service = new ScannerService(prisma, notifications);
  });

  function response(code: number | string | null, killed = false) {
    (execFile as unknown as jest.Mock).mockImplementation((_name, _args, _options, callback) => {
      callback(code === null ? null : { code, killed }, code === 1 ? 'test: Eicar FOUND' : 'test: OK');
    });
  }

  it('executes the daemon client with a literal path and no shell', async () => {
    response(null);
    const file = '/tmp/file";touch marker;".pdf';
    await expect(service.scanFile(file)).resolves.toMatchObject({ clean: true, status: 'CLEAN' });
    expect(execFile).toHaveBeenCalledWith('clamdscan', ['--no-summary', '--', file], expect.objectContaining({ timeout: 120_000 }), expect.any(Function));
  });

  it.each([2, 'ENOENT', 'ETIMEDOUT'])('does not report CLEAN when ClamAV fails with %s', async (code) => {
    response(code);
    await expect(service.scanDocumentVersion('doc', 'v1', '/tmp/file.pdf')).resolves.toMatchObject({ clean: false, status: 'ERROR' });
    expect(prisma.document.updateMany).toHaveBeenCalledWith({ where: { id: 'doc', currentVersionId: 'v1', deletedAt: null }, data: { scanStatus: 'ERROR' } });
    expect(fs.rename).not.toHaveBeenCalled();
    expect(execFile).toHaveBeenCalledTimes(1);
  });

  it('treats an interrupted antivirus process as an incomplete scan', async () => {
    response(1, true);
    await expect(service.scanFile('/tmp/file.pdf')).resolves.toMatchObject({ status: 'ERROR', clean: false });
  });

  it('quarantines infection using filesystem operations and alerts administrators', async () => {
    response(1);
    await service.scanDocumentVersion('doc', 'v1', '/tmp/file.pdf');
    expect(prisma.document.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { scanStatus: 'INFECTED' } }));
    expect(fs.rename).toHaveBeenCalledWith('/tmp/file.pdf', expect.stringMatching(/quarantine\/v1-file.pdf$/));
    expect(notifications.create).toHaveBeenCalledWith(expect.objectContaining({ type: 'SECURITY_ALERT' }));
  });

  it('only updates scan state if the scanned version is still current', async () => {
    response(null);
    prisma.document.updateMany.mockResolvedValue({ count: 0 });
    await service.scanDocumentVersion('doc', 'old-version', '/tmp/old.pdf');
    expect(prisma.document.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'doc', currentVersionId: 'old-version', deletedAt: null } }));
  });
});
