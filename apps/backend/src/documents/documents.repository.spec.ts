import { Test, TestingModule } from '@nestjs/testing';
import { DocumentsRepository } from './documents.repository';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Tests DocumentsRepository :
 *  (a) findById utilise l'include detail (versions + signatures + ACK)
 *  (b) findManyWithCount renvoie un tuple [data, total] avec include liste
 *  (c) groupBy* delegue au Prisma groupBy
 *  (d) findManyForBulk filtre deletedAt=null
 */
describe('DocumentsRepository', () => {
  let repo: DocumentsRepository;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      document: {
        findUnique: jest.fn().mockResolvedValue({ id: 'doc-1', title: 'Test' }),
        findMany: jest.fn().mockResolvedValue([{ id: 'doc-1' }]),
        count: jest.fn().mockResolvedValue(42),
        groupBy: jest
          .fn()
          .mockResolvedValue([{ category: 'POLICY', _count: 10 }]),
        updateMany: jest.fn().mockResolvedValue({ count: 5 }),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DocumentsRepository,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    repo = module.get<DocumentsRepository>(DocumentsRepository);
  });

  describe('findById', () => {
    it('queries with detail include (owner+versions+isoControls+acks)', async () => {
      await repo.findById('doc-1');
      expect(prisma.document.findUnique).toHaveBeenCalledWith({
        where: { id: 'doc-1' },
        include: expect.objectContaining({
          owner: expect.any(Object),
          versions: expect.any(Object),
          isoControls: expect.any(Object),
          acknowledgments: expect.any(Object),
        }),
      });
    });
  });

  describe('findByIdRaw', () => {
    it('queries without include (raw doc only)', async () => {
      await repo.findByIdRaw('doc-1');
      expect(prisma.document.findUnique).toHaveBeenCalledWith({
        where: { id: 'doc-1' },
      });
    });
  });

  describe('findManyWithCount', () => {
    it('returns a tuple [data, total]', async () => {
      const [data, total] = await repo.findManyWithCount(
        { deletedAt: null },
        { updatedAt: 'desc' } as any,
        0,
        20,
      );
      expect(prisma.document.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { deletedAt: null },
          skip: 0,
          take: 20,
          include: expect.objectContaining({ owner: expect.any(Object) }),
        }),
      );
      expect(data).toEqual([{ id: 'doc-1' }]);
      expect(total).toBe(42);
    });
  });

  describe('count / groupBy', () => {
    it('count delegates to prisma.document.count', async () => {
      const result = await repo.count({ status: 'APPROVED' } as any);
      expect(result).toBe(42);
      expect(prisma.document.count).toHaveBeenCalledWith({
        where: { status: 'APPROVED' },
      });
    });

    it('groupByCategory uses by:[category]', async () => {
      await repo.groupByCategory();
      expect(prisma.document.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({
          by: ['category'],
          _count: true,
        }),
      );
    });

    it('groupByStatus uses by:[status]', async () => {
      await repo.groupByStatus();
      expect(prisma.document.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({
          by: ['status'],
        }),
      );
    });
  });

  describe('findManyForBulk', () => {
    it('filters deletedAt:null and returns minimal projection', async () => {
      await repo.findManyForBulk(['1', '2', '3']);
      expect(prisma.document.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: { in: ['1', '2', '3'] }, deletedAt: null },
          select: expect.objectContaining({
            id: true,
            title: true,
            ownerId: true,
            classification: true,
          }),
        }),
      );
    });
  });

  describe('updateMany', () => {
    it('forwards where + data to prisma', async () => {
      await repo.updateMany(
        { id: { in: ['1', '2'] } } as any,
        { status: 'ARCHIVED' } as any,
      );
      expect(prisma.document.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['1', '2'] } },
        data: { status: 'ARCHIVED' },
      });
    });
  });
});
