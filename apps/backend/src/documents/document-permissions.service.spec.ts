import { DocumentPermissionsService } from './document-permissions.service';
import { BadRequestException } from '@nestjs/common';

describe('Document granular permissions', () => {
  let service: DocumentPermissionsService;
  let prisma: any;
  beforeEach(() => {
    prisma = {
      document: { findUnique: jest.fn().mockResolvedValue({ id: 'doc', ownerId: 'other', status: 'DRAFT', classification: 'SECRET', deletedAt: null }) },
      user: { findUnique: jest.fn().mockResolvedValue({ id: 'me', role: 'COLLABORATEUR', isActive: true, departmentId: 'primary' }) },
      userDepartment: { findMany: jest.fn().mockResolvedValue([{ departmentId: 'secondary' }]) },
      documentPermission: { findMany: jest.fn().mockResolvedValue([]), create: jest.fn() },
    };
    service = new DocumentPermissionsService(prisma, { log: jest.fn() } as any);
  });

  it('uses the highest cumulative grant within the most specific applicable tier', async () => {
    prisma.documentPermission.findMany.mockResolvedValue([
      { userId: null, departmentId: null, role: 'COLLABORATEUR', level: 'ADMIN' },
      { userId: null, departmentId: 'primary', role: null, level: 'ADMIN' },
      { userId: 'me', departmentId: null, role: null, level: 'READ' },
      { userId: 'me', departmentId: null, role: null, level: 'EDIT' },
    ]);
    await expect(service.resolveLevel('me', 'doc')).resolves.toBe('EDIT');
    expect(prisma.documentPermission.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ AND: [{ OR: [{ expiresAt: null }, { expiresAt: { gt: expect.any(Date) } }] }] }) }));
  });

  it('ignores invalid permission levels and avoids classification fallthrough', async () => {
    prisma.documentPermission.findMany.mockResolvedValue([{ userId: 'me', departmentId: null, role: null, level: 'OWNER' }]);
    await expect(service.canRead('me', 'doc')).resolves.toBe(false);
    prisma.user.findUnique.mockResolvedValue({ id: 'me', role: 'MANAGER', isActive: true });
    await expect(service.canRead('me', 'doc')).resolves.toBe(false);
  });

  it('refuses disabled accounts even when they own the document', async () => {
    prisma.document.findUnique.mockResolvedValue({ id: 'doc', ownerId: 'me', status: 'DRAFT' });
    prisma.user.findUnique.mockResolvedValue({ id: 'me', role: 'ADMIN', isActive: false });
    await expect(service.resolveLevel('me', 'doc')).resolves.toBeNull();
  });

  it('uses the same published-document policy for auditors as the document library', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'me', role: 'AUDITEUR', isActive: true });
    prisma.document.findUnique.mockResolvedValue({ id: 'doc', ownerId: 'other', classification: 'CONFIDENTIEL', status: 'APPROVED' });
    await expect(service.canRead('me', 'doc')).resolves.toBe(true);
    await expect(service.canEdit('me', 'doc')).resolves.toBe(false);
  });

  it('rejects permissions that are already expired', async () => {
    jest.spyOn(service, 'canAdmin').mockResolvedValue(true);
    await expect(service.grantPermission('doc', { userId: 'recipient', level: 'READ', expiresAt: '2001-01-01' }, { id: 'me' } as any)).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.documentPermission.create).not.toHaveBeenCalled();
  });
});
