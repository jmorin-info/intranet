import { Test, TestingModule } from '@nestjs/testing';
import { WikiService } from './wiki.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { UserRole } from '../common/enums';
import { RequestUser } from '../common/interfaces';

jest.mock('../rag/rag.service', () => ({ RagService: class RagService {} }));

describe('WikiService', () => {
  let service: WikiService;
  let prisma: any;

  const adminUser: RequestUser = {
    id: 'admin-1',
    email: 'admin@omnitech.fr',
    role: UserRole.ADMIN,
    departmentId: 'dept-1',
  };

  const collabUser: RequestUser = {
    id: 'user-1',
    email: 'user@omnitech.fr',
    role: UserRole.COLLABORATEUR,
    departmentId: 'dept-1',
  };

  const otherUser: RequestUser = {
    id: 'user-2',
    email: 'other@omnitech.fr',
    role: UserRole.COLLABORATEUR,
    departmentId: 'dept-2',
  };

  const mockPage = {
    id: 'page-1',
    title: 'Test Wiki Page',
    slug: 'test-wiki-page',
    content: '<p>Hello world</p>',
    category: 'IT',
    isPublished: true,
    visibility: 'PUBLIC',
    authorId: 'user-1',
    ownerDepartmentId: null,
    allowedRoles: [],
    collaborators: [],
    attachments: null,
    editLockUserId: null,
    editLockExpiresAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    author: { id: 'user-1', firstName: 'Test', lastName: 'User' },
  };

  beforeEach(async () => {
    prisma = {
      wikiPage: {
        findMany: jest.fn().mockResolvedValue([mockPage]),
        findUnique: jest.fn().mockResolvedValue(mockPage),
        create: jest.fn().mockResolvedValue(mockPage),
        update: jest.fn().mockResolvedValue(mockPage),
        delete: jest.fn().mockResolvedValue(mockPage),
      },
      wikiPageVersion: {
        create: jest.fn().mockResolvedValue({}),
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn().mockResolvedValue(null),
        count: jest.fn().mockResolvedValue(0),
      },
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'user-1',
          firstName: 'Test',
          lastName: 'User',
          email: 'user@omnitech.fr',
        }),
        findMany: jest.fn().mockResolvedValue([]),
      },
      auditLog: {
        create: jest.fn().mockResolvedValue({}),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WikiService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<WikiService>(WikiService);
  });

  describe('findAll', () => {
    it('should return all published pages for admin (no visibility filter)', async () => {
      await service.findAll(adminUser);
      expect(prisma.wikiPage.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ isPublished: true }),
        }),
      );
      // Admin should NOT have OR visibility clauses
      const callArgs = prisma.wikiPage.findMany.mock.calls[0][0];
      expect(callArgs.where.OR).toBeUndefined();
    });

    it('should apply visibility filter for COLLABORATEUR', async () => {
      await service.findAll(collabUser);
      const callArgs = prisma.wikiPage.findMany.mock.calls[0][0];
      expect(callArgs.where.OR).toBeDefined();
      expect(callArgs.where.OR).toEqual(
        expect.arrayContaining([
          { authorId: 'user-1' },
          { visibility: 'PUBLIC' },
          { collaborators: { has: 'user-1' } },
        ]),
      );
    });

    it('should include DEPARTMENT visibility for user with departmentId', async () => {
      await service.findAll(collabUser);
      const callArgs = prisma.wikiPage.findMany.mock.calls[0][0];
      expect(callArgs.where.OR).toEqual(
        expect.arrayContaining([
          { visibility: 'DEPARTMENT', ownerDepartmentId: 'dept-1' },
        ]),
      );
    });

    it('should filter by category', async () => {
      await service.findAll(adminUser, { category: 'IT' });
      const callArgs = prisma.wikiPage.findMany.mock.calls[0][0];
      expect(callArgs.where.category).toBe('IT');
    });

    it('should filter mine only', async () => {
      await service.findAll(collabUser, { mine: true });
      const callArgs = prisma.wikiPage.findMany.mock.calls[0][0];
      expect(callArgs.where.authorId).toBe('user-1');
    });
  });

  describe('create', () => {
    it('should create a wiki page with sanitized content', async () => {
      const dto = {
        title: 'New Page',
        slug: 'new-page',
        content: '<p>Content</p>',
        category: 'Security',
      };

      const result = await service.create(dto as any, 'user-1');
      expect(result).toBeDefined();
      expect(prisma.wikiPage.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            title: expect.any(String),
            slug: 'new-page',
            content: expect.any(String),
            authorId: 'user-1',
            visibility: 'PUBLIC',
          }),
        }),
      );
    });

    it('should accept custom visibility', async () => {
      const dto = {
        title: 'Private Page',
        slug: 'private-page',
        content: 'Secret',
        visibility: 'PRIVATE',
      };

      await service.create(dto as any, 'user-1');
      expect(prisma.wikiPage.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            visibility: 'PRIVATE',
          }),
        }),
      );
    });

    it('should accept collaborators list', async () => {
      const dto = {
        title: 'Shared Page',
        slug: 'shared-page',
        content: 'Shared content',
        collaborators: ['user-2', 'user-3'],
      };

      await service.create(dto as any, 'user-1');
      expect(prisma.wikiPage.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            collaborators: ['user-2', 'user-3'],
          }),
        }),
      );
    });
  });

  describe('update', () => {
    it('should update page content and create version snapshot', async () => {
      const updated = { ...mockPage, content: '<p>Updated</p>' };
      prisma.wikiPage.update.mockResolvedValue(updated);

      await service.update('page-1', { content: '<p>Updated</p>' }, collabUser);

      expect(prisma.wikiPageVersion.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          pageId: 'page-1',
          content: mockPage.content,
        }),
      });
      expect(prisma.wikiPage.update).toHaveBeenCalled();
    });

    it('should throw NotFoundException for missing page', async () => {
      prisma.wikiPage.findUnique.mockResolvedValue(null);
      await expect(
        service.update('bad-id', { title: 'x' }, collabUser),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException if user cannot edit', async () => {
      const privatePage = {
        ...mockPage,
        authorId: 'someone-else',
        collaborators: [],
      };
      prisma.wikiPage.findUnique.mockResolvedValue(privatePage);

      await expect(
        service.update('page-1', { title: 'x' }, otherUser),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should allow admin to edit any page', async () => {
      const otherPage = { ...mockPage, authorId: 'someone-else' };
      prisma.wikiPage.findUnique.mockResolvedValue(otherPage);
      prisma.wikiPage.update.mockResolvedValue(otherPage);

      await expect(
        service.update('page-1', { title: 'Admin Edit' }, adminUser),
      ).resolves.toBeDefined();
    });
  });

  describe('edit lock mechanism', () => {
    it('should acquire lock when page is not locked', async () => {
      prisma.wikiPage.findUnique.mockResolvedValue({
        ...mockPage,
        editLockUserId: null,
        editLockExpiresAt: null,
      });

      const result = await service.acquireEditLock('page-1', collabUser);
      expect(result.success).toBe(true);
      expect(result.expiresAt).toBeDefined();
      expect(prisma.wikiPage.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            editLockUserId: 'user-1',
            editLockExpiresAt: expect.any(Date),
          }),
        }),
      );
    });

    it('should return lock info when another user holds the lock', async () => {
      const lockedPage = {
        ...mockPage,
        editLockUserId: 'user-2',
        editLockExpiresAt: new Date(Date.now() + 300000), // 5 min in future
      };
      prisma.wikiPage.findUnique.mockResolvedValue(lockedPage);
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-2',
        firstName: 'Other',
        lastName: 'User',
        email: 'other@omnitech.fr',
      });

      const result = await service.acquireEditLock('page-1', collabUser);
      expect(result.locked).toBe(true);
      expect((result as any).by.id).toBe('user-2');
    });

    it('should allow same user to re-acquire their own lock', async () => {
      const selfLockedPage = {
        ...mockPage,
        editLockUserId: 'user-1',
        editLockExpiresAt: new Date(Date.now() + 300000),
      };
      prisma.wikiPage.findUnique.mockResolvedValue(selfLockedPage);

      const result = await service.acquireEditLock('page-1', collabUser);
      expect(result.success).toBe(true);
    });

    it('should allow acquiring lock when previous lock has expired', async () => {
      const expiredLockPage = {
        ...mockPage,
        editLockUserId: 'user-2',
        editLockExpiresAt: new Date(Date.now() - 60000), // 1 min ago (expired)
      };
      prisma.wikiPage.findUnique.mockResolvedValue(expiredLockPage);

      const result = await service.acquireEditLock('page-1', collabUser);
      expect(result.success).toBe(true);
    });

    it('should release lock for the lock holder', async () => {
      prisma.wikiPage.findUnique.mockResolvedValue({
        ...mockPage,
        editLockUserId: 'user-1',
        editLockExpiresAt: new Date(Date.now() + 300000),
      });

      const result = await service.releaseEditLock('page-1', collabUser);
      expect(result.success).toBe(true);
      expect(prisma.wikiPage.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { editLockUserId: null, editLockExpiresAt: null },
        }),
      );
    });

    it('should throw ForbiddenException when non-holder tries to release', async () => {
      prisma.wikiPage.findUnique.mockResolvedValue({
        ...mockPage,
        editLockUserId: 'user-2',
        editLockExpiresAt: new Date(Date.now() + 300000),
      });

      await expect(
        service.releaseEditLock('page-1', collabUser),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should block save when another user holds lock', async () => {
      const lockedPage = {
        ...mockPage,
        authorId: 'user-1',
        editLockUserId: 'user-2',
        editLockExpiresAt: new Date(Date.now() + 300000),
      };
      prisma.wikiPage.findUnique.mockResolvedValue(lockedPage);

      await expect(
        service.update('page-1', { content: 'new' }, collabUser),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('attachments', () => {
    it('should return empty array when no attachments', async () => {
      prisma.wikiPage.findUnique.mockResolvedValue({
        ...mockPage,
        attachments: null,
      });

      const result = await service.getAttachments('page-1', collabUser);
      expect(result).toEqual([]);
    });

    it('should parse JSON attachments', async () => {
      const attachments = [
        {
          name: 'doc.pdf',
          url: '/uploads/wiki/doc.pdf',
          size: 1024,
          mimeType: 'application/pdf',
          uploadedAt: '2025-01-01T00:00:00.000Z',
        },
      ];
      prisma.wikiPage.findUnique.mockResolvedValue({
        ...mockPage,
        attachments: JSON.stringify(attachments),
      });

      const result = await service.getAttachments('page-1', collabUser);
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('doc.pdf');
    });

    it('should add attachment to page', async () => {
      prisma.wikiPage.findUnique.mockResolvedValue({
        ...mockPage,
        attachments: null,
      });

      const mockFile = {
        originalname: 'test.pdf',
        filename: 'abc123.pdf',
        size: 2048,
        mimetype: 'application/pdf',
      } as Express.Multer.File;

      const result = await service.addAttachment('page-1', collabUser, mockFile);
      expect(result.name).toBe('test.pdf');
      expect(result.url).toContain('abc123.pdf');
      expect(prisma.wikiPage.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { attachments: expect.any(String) },
        }),
      );
    });

    it('should throw NotFoundException when removing non-existent attachment', async () => {
      prisma.wikiPage.findUnique.mockResolvedValue({
        ...mockPage,
        attachments: JSON.stringify([]),
      });

      await expect(
        service.removeAttachment('page-1', collabUser, 'nonexistent.pdf'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException when user cannot edit page', async () => {
      prisma.wikiPage.findUnique.mockResolvedValue({
        ...mockPage,
        authorId: 'someone-else',
        collaborators: [],
      });

      const mockFile = {
        originalname: 'test.pdf',
        filename: 'abc123.pdf',
        size: 2048,
        mimetype: 'application/pdf',
      } as Express.Multer.File;

      await expect(
        service.addAttachment('page-1', otherUser, mockFile),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('findBySlug', () => {
    it('should return page by slug', async () => {
      const result = await service.findBySlug('test-wiki-page', collabUser);
      expect(result.slug).toBe('test-wiki-page');
    });

    it('should throw NotFoundException for unknown slug', async () => {
      prisma.wikiPage.findUnique.mockResolvedValue(null);
      await expect(
        service.findBySlug('unknown', collabUser),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException for unauthorized page access', async () => {
      const privatePage = {
        ...mockPage,
        visibility: 'PRIVATE',
        authorId: 'someone-else',
        collaborators: [],
        allowedRoles: [],
        ownerDepartmentId: null,
      };
      prisma.wikiPage.findUnique.mockResolvedValue(privatePage);

      await expect(
        service.findBySlug('private-page', otherUser),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('delete', () => {
    it('should allow author to delete own page', async () => {
      await service.delete('page-1', collabUser);
      expect(prisma.wikiPage.delete).toHaveBeenCalledWith({
        where: { id: 'page-1' },
      });
    });

    it('should allow admin to delete any page', async () => {
      const otherPage = { ...mockPage, authorId: 'someone-else' };
      prisma.wikiPage.findUnique.mockResolvedValue(otherPage);

      await service.delete('page-1', adminUser);
      expect(prisma.wikiPage.delete).toHaveBeenCalled();
    });

    it('should throw ForbiddenException for non-author non-admin', async () => {
      const otherPage = { ...mockPage, authorId: 'someone-else' };
      prisma.wikiPage.findUnique.mockResolvedValue(otherPage);

      await expect(
        service.delete('page-1', otherUser),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
