import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PassThrough } from 'stream';
import { PublicController } from './public.controller';

describe('Public document and news boundaries', () => {
  let controller: PublicController;
  let prisma: any;
  let storage: any;
  const eligible = {
    id: 'doc', status: 'APPROVED', isPublic: true, classification: 'PUBLIC',
    scanStatus: 'CLEAN', deletedAt: null, currentVersionId: 'approved-version',
  };

  beforeEach(() => {
    prisma = {
      document: { findFirst: jest.fn(), findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) },
      documentVersion: { findFirst: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
      newsPost: { findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn(), count: jest.fn().mockResolvedValue(0) },
      veilleItem: { findMany: jest.fn().mockResolvedValue([]) },
    };
    storage = { getFileStream: jest.fn() };
    controller = new PublicController(prisma, storage);
  });

  it.each([
    null, { ...eligible, isPublic: false }, { ...eligible, classification: 'INTERNE' },
    { ...eligible, status: 'DRAFT' }, { ...eligible, scanStatus: 'PENDING' },
    { ...eligible, scanStatus: 'ERROR' }, { ...eligible, scanStatus: 'INFECTED' },
    { ...eligible, deletedAt: new Date() }, { ...eligible, currentVersionId: null },
  ])('opens no file for an ineligible document (%j)', async (document) => {
    prisma.document.findFirst.mockResolvedValue(document);
    await expect(controller.downloadPublicDocument('doc', {} as any)).rejects.toThrow(NotFoundException);
    expect(storage.getFileStream).not.toHaveBeenCalled();
    expect(prisma.documentVersion.findFirst).not.toHaveBeenCalled();
  });

  it('downloads only the approved current version belonging to that document', async () => {
    prisma.document.findFirst.mockResolvedValue(eligible);
    prisma.documentVersion.findFirst.mockResolvedValue({ id: 'approved-version', fileUrl: 'files/approved.html', fileType: 'text/html' });
    const stream = new PassThrough();
    const pipe = jest.spyOn(stream, 'pipe').mockReturnValue(undefined as any);
    storage.getFileStream.mockReturnValue(stream);
    const response = { set: jest.fn() };
    await controller.downloadPublicDocument('doc', response as any);
    expect(prisma.documentVersion.findFirst).toHaveBeenCalledWith({ where: { id: 'approved-version', documentId: 'doc' } });
    expect(storage.getFileStream).toHaveBeenCalledWith('files/approved.html');
    expect(response.set).toHaveBeenCalledWith(expect.objectContaining({
      'Content-Type': 'application/octet-stream', 'Content-Disposition': 'attachment; filename="approved.html"',
      'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "sandbox; default-src 'none'",
    }));
    expect(pipe).toHaveBeenCalledWith(response);
    stream.destroy();
  });

  it('refuses an orphan current pointer rather than serving the latest version', async () => {
    prisma.document.findFirst.mockResolvedValue(eligible);
    prisma.documentVersion.findFirst.mockResolvedValue(null);
    await expect(controller.downloadPublicDocument('doc', {} as any)).rejects.toThrow(NotFoundException);
    expect(storage.getFileStream).not.toHaveBeenCalled();
  });

  it('filters public listings and exposes only current version metadata', async () => {
    prisma.document.findMany.mockResolvedValue([{
      id: 'doc', title: 'Public document', currentVersionId: 'approved-version',
    }]);
    prisma.documentVersion.findMany.mockResolvedValue([{ id: 'approved-version', documentId: 'doc', fileType: 'application/pdf' }]);
    const result = await controller.getPublicDocuments('1', '100');
    expect(prisma.document.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ classification: 'PUBLIC', isPublic: true, scanStatus: 'CLEAN', status: 'APPROVED', deletedAt: null }),
      take: 20,
    }));
    expect(result.data).toEqual([{ id: 'doc', title: 'Public document', versions: [{ id: 'approved-version', fileType: 'application/pdf' }] }]);
    expect(prisma.documentVersion.findMany).toHaveBeenCalledWith({
      where: { OR: [{ id: 'approved-version', documentId: 'doc' }] },
      select: { id: true, documentId: true, fileType: true },
    });
    expect(prisma.document.findMany.mock.calls[0][0].select).not.toHaveProperty('versions');
  });

  it('uses the same untargeted-news policy for public list, count and article', async () => {
    await controller.getPublicNews('1', '10');
    await controller.getPublicNewsArticle('slug');
    const where = { deletedAt: null, isPublished: true, targetRoles: { isEmpty: true } };
    expect(prisma.newsPost.findMany).toHaveBeenCalledWith(expect.objectContaining({ where }));
    expect(prisma.newsPost.count).toHaveBeenCalledWith({ where });
    expect(prisma.newsPost.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { ...where, slug: 'slug' } }));
  });

  it.each(['0', '-1', 'NaN', '1.5', '12garbage', '9007199254740992'])('rejects invalid pagination %s before querying', async (value) => {
    await expect(controller.getPublicDocuments(value, '10')).rejects.toThrow(BadRequestException);
    await expect(controller.getPublicNews('1', value)).rejects.toThrow(BadRequestException);
    await expect(controller.getPublicVeille(value)).rejects.toThrow(BadRequestException);
    expect(prisma.document.findMany).not.toHaveBeenCalled();
    expect(prisma.newsPost.findMany).not.toHaveBeenCalled();
    expect(prisma.veilleItem.findMany).not.toHaveBeenCalled();
  });
});
