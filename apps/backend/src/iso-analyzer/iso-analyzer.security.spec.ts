import { ForbiddenException } from '@nestjs/common';
import { IsoAnalyzerService } from './iso-analyzer.service';
import { execFile } from 'child_process';
import * as fs from 'fs';

jest.mock('child_process', () => ({ ...jest.requireActual('child_process'), execFile: jest.fn() }));
jest.mock('fs', () => ({ ...jest.requireActual('fs'), existsSync: jest.fn(), promises: { ...jest.requireActual('fs').promises, stat: jest.fn() } }));

describe('ISO analysis document authorization and extraction', () => {
  let service: IsoAnalyzerService;
  let db: any;
  let storage: any;
  let document: any;
  const user = { id: 'reader', role: 'COLLABORATEUR', departmentId: 'primary' };
  beforeEach(() => {
    document = { id: 'doc', ownerId: 'reader', title: 'Note', category: 'NOTE', reference: 'DOC', classification: 'SECRET', status: 'DRAFT', scanStatus: 'CLEAN', currentVersionId: null, versions: [] };
    db = { document: { findFirst: jest.fn().mockImplementation(async () => document) }, isoControl: { findMany: jest.fn().mockResolvedValue([]) }, user: { findUnique: jest.fn().mockResolvedValue({ departmentId: 'primary' }) }, userDepartment: { findMany: jest.fn().mockResolvedValue([]) }, documentPermission: { findFirst: jest.fn().mockResolvedValue(null) }, approvalStepInstance: { findMany: jest.fn().mockResolvedValue([]) } };
    storage = { getFilePath: jest.fn().mockReturnValue('/safe/file.pdf') };
    service = new IsoAnalyzerService(db, storage);
    (fs.existsSync as jest.Mock).mockReturnValue(true);
    (fs.promises.stat as jest.Mock).mockResolvedValue({ isFile: () => true, size: 100 });
    (execFile as unknown as jest.Mock).mockImplementation((_binary, _args, _options, callback) => callback(null, 'Texte du document', ''));
  });
  it('requires the real actor for analysis, automatic assignment and bulk scans', async () => {
    await expect(service.analyzeDocument('doc')).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.autoAssignControls('doc')).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.scanAllDocuments()).rejects.toBeInstanceOf(ForbiddenException);
    expect(db.document.findFirst).not.toHaveBeenCalled();
  });
  it.each(['PENDING', 'ERROR', 'INFECTED'])('never extracts a file with antivirus status %s', async (scanStatus) => {
    document.scanStatus = scanStatus;
    await expect(service.analyzeDocument('doc', user)).rejects.toBeInstanceOf(ForbiddenException);
    expect(storage.getFilePath).not.toHaveBeenCalled();
  });
  it('applies explicit READ permissions before returning ISO analysis', async () => {
    document.ownerId = 'other'; db.documentPermission.findFirst.mockResolvedValue({ level: 'READ' });
    await expect(service.analyzeDocument('doc', user)).resolves.toEqual([]);
    db.documentPermission.findFirst.mockResolvedValue(null);
    await expect(service.analyzeDocument('doc', user)).rejects.toBeInstanceOf(ForbiddenException);
  });
  it('passes literal file paths to pdftotext without a shell', async () => {
    const literal = '/safe/file"; touch /tmp/unwanted; #.pdf';
    storage.getFilePath.mockReturnValue(literal);
    document.currentVersionId = 'v1'; document.versions = [{ id: 'v1', fileUrl: '/storage/file.pdf' }];
    await service.analyzeDocument('doc', user);
    expect(execFile).toHaveBeenCalledWith('pdftotext', ['-enc', 'UTF-8', literal, '-'], expect.objectContaining({ timeout: 30000 }), expect.any(Function));
    expect(storage.getFilePath).toHaveBeenCalledWith('/storage/file.pdf');
  });
});
