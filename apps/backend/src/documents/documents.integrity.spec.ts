import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { DocumentsService } from './documents.service';
import { RequestUser } from '../common/interfaces';

describe('GED version integrity and access', () => {
  const user = { id: 'owner', role: 'COLLABORATEUR', email: 'owner@example.test' } as RequestUser;
  let service: DocumentsService;
  let prisma: any;
  let repository: any;
  let storage: any;
  let scanner: any;
  let audit: any;
  let document: any;
  const file = { buffer: Buffer.from('%PDF-1.4 test'), size: 13, mimetype: 'application/pdf', originalname: 'test.pdf' } as Express.Multer.File;

  beforeEach(() => {
    document = { id: 'doc', title: 'Titre <test>', reference: 'DOC-1', ownerId: 'owner', status: 'DRAFT', classification: 'SECRET', currentVersionId: 'v1', updatedAt: new Date('2026-11-12T10:00:00Z'), deletedAt: null, scanStatus: 'CLEAN', versions: [{ id: 'v1', versionNumber: '1.0', checksum: 'old', fileUrl: '/storage/old.pdf' }] };
    prisma = {
      document: { findMany: jest.fn().mockResolvedValue([]), update: jest.fn().mockImplementation(async () => document), findUnique: jest.fn().mockImplementation(async () => document), findUniqueOrThrow: jest.fn().mockImplementation(async () => document), updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      user: { findUnique: jest.fn().mockResolvedValue({ id: 'owner', role: 'COLLABORATEUR', isActive: true }) },
      userDepartment: { findMany: jest.fn().mockResolvedValue([]) },
      documentPermission: { findFirst: jest.fn().mockResolvedValue(null) },
      documentVersion: { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({ id: 'v2', versionNumber: '1.1' }), findMany: jest.fn().mockResolvedValue([]) },
      auditLog: { findMany: jest.fn().mockResolvedValue([]) },
      approvalStepInstance: { findMany: jest.fn().mockResolvedValue([]), updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      approvalInstance: { findMany: jest.fn().mockResolvedValue([]), updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      approvalAuditLog: { createMany: jest.fn().mockResolvedValue({ count: 1 }) },
      validationRequest: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
    };
    prisma.$transaction = jest.fn(async (callback) => callback(prisma));
    repository = { findManyWithCount: jest.fn().mockResolvedValue([[], 0]), findById: jest.fn().mockImplementation(async () => document) };
    storage = { upload: jest.fn().mockResolvedValue({ fileUrl: '/storage/new.pdf' }), storeBuffer: jest.fn().mockResolvedValue({ fileUrl: '/storage/native.html' }), deleteFile: jest.fn().mockResolvedValue(undefined), generateChecksum: jest.fn().mockResolvedValue('new'), getFilePath: jest.fn((url) => `/disk${url}`), generateSignedUrl: jest.fn().mockResolvedValue('/signed') };
    scanner = { scanDocumentVersion: jest.fn().mockResolvedValue(undefined), scanFile: jest.fn().mockResolvedValue({ clean: true, status: 'CLEAN' }) };
    audit = { log: jest.fn().mockResolvedValue(undefined) };
    service = new DocumentsService(prisma, repository, storage, audit, scanner, { create: jest.fn() } as any, { del: jest.fn() } as any);
  });

  it('never lets an unrelated editor replace another owner’s file', async () => {
    await expect(service.uploadVersion('doc', file, undefined, 'stranger')).rejects.toBeInstanceOf(ForbiddenException);
    expect(storage.upload).not.toHaveBeenCalled();
  });

  it.each(['IN_REVIEW', 'REVIEW_APPROVED', 'PENDING_APPROVAL'])('freezes version uploads during %s', async (status) => {
    document.status = status;
    await expect(service.uploadVersion('doc', file, undefined, 'owner')).rejects.toBeInstanceOf(ConflictException);
    expect(storage.upload).not.toHaveBeenCalled();
  });

  it('keeps old evidence and sends a new published revision back to draft and pending scan', async () => {
    document.status = 'APPROVED';
    await service.uploadVersion('doc', file, undefined, 'owner');
    expect(prisma.documentVersion.create).toHaveBeenCalledWith({ data: expect.objectContaining({ versionNumber: '2.0', checksum: 'new', uploadedById: 'owner' }) });
    expect(prisma.document.updateMany).toHaveBeenCalledWith({ where: expect.objectContaining({ currentVersionId: 'v1', status: 'APPROVED', updatedAt: document.updatedAt }), data: { currentVersionId: 'v2', status: 'DRAFT', scanStatus: 'PENDING' } });
    expect(storage.deleteFile).not.toHaveBeenCalled();
    expect(scanner.scanDocumentVersion).toHaveBeenCalledWith('doc', 'v2', '/disk/storage/new.pdf');
  });

  it('cleans up only the new upload after a concurrent modification', async () => {
    prisma.document.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.uploadVersion('doc', file, undefined, 'owner')).rejects.toBeInstanceOf(ConflictException);
    expect(storage.deleteFile).toHaveBeenCalledWith('/storage/new.pdf');
    expect(scanner.scanDocumentVersion).not.toHaveBeenCalled();
  });

  it('refuses identical bytes before storing a duplicate', async () => {
    prisma.documentVersion.findFirst.mockResolvedValue({ id: 'old' });
    await expect(service.uploadVersion('doc', file, undefined, 'owner')).rejects.toBeInstanceOf(BadRequestException);
    expect(storage.upload).not.toHaveBeenCalled();
  });

  it('reimports obsolete bytes atomically without inheriting CLEAN', async () => {
    document.status = 'OBSOLETE';
    await service.reimportObsolete('doc', file, undefined, 'owner');
    expect(prisma.document.updateMany).toHaveBeenCalledWith({ where: expect.objectContaining({ currentVersionId: 'v1', status: 'OBSOLETE' }), data: { currentVersionId: 'v2', status: 'DRAFT', scanStatus: 'PENDING' } });
  });

  it.each(['ERROR', 'PENDING', 'INFECTED'])('blocks download while scan status is %s', async (scanStatus) => {
    document.scanStatus = scanStatus;
    await expect(service.getDownloadUrl('doc', 'v1', user)).rejects.toBeInstanceOf(ForbiddenException);
    expect(storage.generateSignedUrl).not.toHaveBeenCalled();
  });

  it('requires a fresh successful scan for historical bytes', async () => {
    prisma.documentVersion.findFirst.mockResolvedValue({ id: 'old', fileUrl: '/storage/old.pdf' });
    scanner.scanFile.mockResolvedValue({ clean: false, status: 'ERROR' });
    await expect(service.getDownloadUrl('doc', 'old', user)).rejects.toBeInstanceOf(ForbiddenException);
    expect(storage.generateSignedUrl).not.toHaveBeenCalled();
  });

  it('applies explicit read grants consistently to files, history and versions', async () => {
    const guest = { id: 'guest', role: 'COLLABORATEUR' } as RequestUser;
    prisma.documentPermission.findFirst.mockResolvedValue({ level: 'READ' });
    prisma.documentVersion.findFirst.mockResolvedValue({ id: 'v1', fileUrl: '/storage/old.pdf' });
    await expect(service.findById('doc', guest)).resolves.toMatchObject({ id: 'doc' });
    await expect(service.getVersions('doc', guest)).resolves.toEqual([]);
    await expect(service.getHistory('doc', guest)).resolves.toHaveProperty('timeline');
    await expect(service.getDownloadUrl('doc', 'v1', guest)).resolves.toMatchObject({ url: '/signed' });
  });

  it('grants workflow actors only their active step and exact current version', async () => {
    const guest = { id: 'guest', role: 'COLLABORATEUR' } as RequestUser;
    prisma.approvalStepInstance.findMany.mockResolvedValue([{ step: { order: 2 }, instance: { documentId: 'doc', documentVersionId: 'v1', currentStepOrder: 2 } }]);
    await expect(service.findById('doc', guest)).resolves.toMatchObject({ id: 'doc' });
    document.currentVersionId = 'v2';
    await expect(service.findById('doc', guest)).rejects.toBeInstanceOf(ForbiddenException);
    document.currentVersionId = 'v1';
    prisma.approvalStepInstance.findMany.mockResolvedValue([{ step: { order: 3 }, instance: { documentId: 'doc', documentVersionId: 'v1', currentStepOrder: 2 } }]);
    await expect(service.findById('doc', guest)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('freezes real sanitized native bytes and preserves matching snapshots idempotently', async () => {
    document.isNative = true; document.content = '<p>Contenu</p><script>alert(1)</script>';
    await service.ensureNativeVersion('doc', 'owner');
    const buffer = storage.storeBuffer.mock.calls[0][0] as Buffer;
    expect(buffer.toString()).toContain('<title>Titre </title>');
    expect(buffer.toString()).toContain('<p>Contenu</p>');
    expect(buffer.toString()).not.toContain('<script>');
    const data = prisma.documentVersion.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ fileType: 'text/html', fileSizeBytes: buffer.length, versionNumber: '1.1' });
    document.versions[0].checksum = data.checksum;
    storage.storeBuffer.mockClear();
    await service.ensureNativeVersion('doc', 'owner');
    expect(storage.storeBuffer).not.toHaveBeenCalled();
  });

  it('refuses late native edits when submission has already won the race', async () => {
    document.isNative = true;
    prisma.document.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.updateInlineContent('doc', '<p>Edit</p>', user)).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.document.findUniqueOrThrow).not.toHaveBeenCalled();
  });

  it('filters the full review family on the server and treats the end date inclusively', async () => {
    const result = await service.findAll({ statusGroup: 'review', page: -4, limit: 400, dateTo: '2026-11-12' } as any, { id: 'admin', role: 'ADMIN' } as RequestUser);
    expect(repository.findManyWithCount).toHaveBeenCalledWith(expect.objectContaining({ AND: expect.arrayContaining([{ status: { in: ['IN_REVIEW', 'REVIEW_APPROVED', 'PENDING_APPROVAL'] } }]), createdAt: { lt: new Date('2026-11-13T00:00:00Z') } }), [{ updatedAt: 'desc' }, { id: 'asc' }], 0, 100);
    expect(result.meta.page).toBe(1);
  });

  it.each(['PENDING', 'ERROR', 'INFECTED'])('refuses administrative publication when antivirus status is %s', async (status) => {
    document.scanStatus = status;
    await expect(service.forceApprove('doc', { ...user, role: 'ADMIN' } as RequestUser, false)).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.document.updateMany).not.toHaveBeenCalled();
  });

  it('requires a real current version even for administrative publication', async () => {
    document.currentVersionId = null;
    await expect(service.forceApprove('doc', { ...user, role: 'ADMIN' } as RequestUser, false)).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('atomically publishes the checked version and closes pending quality requests', async () => {
    await service.forceApprove('doc', { ...user, role: 'ADMIN' } as RequestUser, true);
    expect(prisma.document.updateMany).toHaveBeenCalledWith({ where: expect.objectContaining({ currentVersionId: 'v1', scanStatus: 'CLEAN', updatedAt: document.updatedAt }), data: { status: 'APPROVED', nextReviewDate: null } });
    expect(prisma.validationRequest.updateMany).toHaveBeenCalledWith({ where: { documentId: 'doc', status: 'PENDING' }, data: { status: 'CANCELLED' } });
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'DOCUMENT_FORCE_APPROVED', severity: 'WARN' }));
  });

  it('refuses a concurrent upload during administrative publication', async () => {
    prisma.document.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.forceApprove('doc', { ...user, role: 'ADMIN' } as RequestUser, false)).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.approvalInstance.findMany).not.toHaveBeenCalled();
  });

  it('never directly publishes a metadata-only document', async () => {
    const create = jest.spyOn(service, 'createInline');
    await expect(service.directPublish({ title: 'Sans fichier' } as any, { ...user, role: 'ADMIN' } as RequestUser)).rejects.toBeInstanceOf(BadRequestException);
    expect(create).not.toHaveBeenCalled();
  });

  it('directly publishes only after producing a real native snapshot', async () => {
    jest.spyOn(service, 'createInline').mockResolvedValue(document);
    const snapshot = jest.spyOn(service, 'ensureNativeVersion').mockResolvedValue(document);
    await service.directPublish({ title: 'Note', content: '<p>Texte</p>' } as any, { ...user, role: 'ADMIN' } as RequestUser);
    expect(snapshot).toHaveBeenCalledWith('doc', 'owner');
    expect(prisma.document.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ currentVersionId: 'v1', scanStatus: 'CLEAN' }), data: { status: 'APPROVED' } }));
  });
  it.each([
    ['IN_REVIEW', 'REVIEW_APPROVED'],
    ['PENDING_APPROVAL', 'APPROVED'],
    ['APPROVED', 'IN_REVIEW'],
    ['OBSOLETE', 'IN_REVIEW'],
  ])('never permits a direct PATCH from %s to %s to bypass quality checks', async (from, to) => {
    document.status = from; document.scanStatus = 'ERROR';
    document.validationRequests = [];
    prisma.document.update = jest.fn();
    await expect(service.update('doc', { status: to } as any, { ...user, role: 'ADMIN' } as RequestUser)).rejects.toThrow('actions du circuit documentaire');
    expect(prisma.document.update).not.toHaveBeenCalled();
    expect(prisma.document.updateMany).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it.each([
    ['IN_REVIEW', 'DRAFT'], ['REVIEW_APPROVED', 'DRAFT'],
    ['APPROVED', 'ARCHIVED'], ['APPROVED', 'OBSOLETE'],
  ])('atomically closes pending circuits when a document goes from %s to %s', async (from, to) => {
    document.status = from; document.validationRequests = [];
    prisma.approvalInstance.findMany.mockResolvedValue([{ id: 'pending-instance' }]);
    await service.update('doc', { status: to } as any, { ...user, role: 'ADMIN' } as RequestUser);
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: 'Serializable' });
    expect(prisma.document.update).toHaveBeenCalledWith(expect.objectContaining({ data: { status: to } }));
    expect(prisma.approvalInstance.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: { in: ['pending-instance'] }, status: 'PENDING' }, data: { status: 'CANCELLED', completedAt: expect.any(Date) } }));
    expect(prisma.validationRequest.updateMany).toHaveBeenCalledWith({ where: { documentId: { in: ['doc'] }, status: 'PENDING' }, data: { status: 'CANCELLED' } });
    expect(prisma.approvalAuditLog.createMany).toHaveBeenCalled();
  });

  it('closes pending circuits within the grouped archive transaction', async () => {
    prisma.document.findMany.mockResolvedValue([document]);
    prisma.approvalInstance.findMany.mockResolvedValue([{ id: 'pending-instance' }]);
    await expect(service.bulkArchive(['doc'], { ...user, role: 'ADMIN' } as RequestUser)).resolves.toEqual({ updated: 1 });
    expect(prisma.document.updateMany).toHaveBeenCalledWith({ where: { id: { in: ['doc'] }, deletedAt: null }, data: { status: 'ARCHIVED' } });
    expect(prisma.approvalStepInstance.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { instanceId: { in: ['pending-instance'] }, decision: 'PENDING' }, data: expect.objectContaining({ decision: 'SKIPPED' }) }));
    expect(prisma.validationRequest.updateMany).toHaveBeenCalled();
  });

  it('closes former circuits when reopening an archived document', async () => {
    document.status = 'ARCHIVED';
    prisma.approvalInstance.findMany.mockResolvedValue([{ id: 'pending-instance' }]);
    await service.reopenDocument('doc', { ...user, role: 'ADMIN' } as RequestUser);
    expect(prisma.document.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ status: 'ARCHIVED', currentVersionId: 'v1' }), data: { status: 'DRAFT' } }));
    expect(prisma.approvalAuditLog.createMany).toHaveBeenCalled();
  });

  it('aborts the status transaction when pending-circuit cancellation fails', async () => {
    document.status = 'IN_REVIEW'; document.validationRequests = [];
    prisma.approvalInstance.findMany.mockRejectedValue(new Error('Cancellation failed'));
    await expect(service.update('doc', { status: 'DRAFT' } as any, { ...user, role: 'ADMIN' } as RequestUser)).rejects.toThrow('Cancellation failed');
    expect(audit.log).not.toHaveBeenCalled();
  });

});
