import { Test, TestingModule } from '@nestjs/testing';
import { MeilisearchController } from './meilisearch.controller';
import { MeilisearchService } from './meilisearch.service';
import { UserRole } from '../common/enums';
import type { RequestUser } from '../common/interfaces';

/**
 * Tests unitaires de `MeilisearchController` — verifie principalement
 * l'endpoint `/search/unified` (canonique post-merge v1+v2) et `/search/quick`
 * (utilise par la palette Cmd+K).
 *
 * Le service Meilisearch est mocke ; on verifie le contrat du controller :
 *   - parametres parses correctement (modules, categories, page, limit, sort)
 *   - filtrage RBAC applique sur classification documentaire
 *   - format de reponse stable (byIndex, facetDistribution, processingTimeMs)
 */
describe('MeilisearchController', () => {
  let controller: MeilisearchController;
  let meiliMock: {
    search: jest.Mock;
    reindexAll: jest.Mock;
    isHealthy: jest.Mock;
    stats: jest.Mock;
  };

  const adminUser: RequestUser = {
    id: 'admin-1',
    email: 'admin@omnitech.fr',
    role: UserRole.ADMIN,
  } as unknown as RequestUser;

  const collabUser: RequestUser = {
    id: 'user-1',
    email: 'user@omnitech.fr',
    role: UserRole.COLLABORATEUR,
  } as unknown as RequestUser;

  beforeEach(async () => {
    meiliMock = {
      search: jest.fn(),
      reindexAll: jest.fn(),
      isHealthy: jest.fn(),
      stats: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [MeilisearchController],
      providers: [{ provide: MeilisearchService, useValue: meiliMock }],
    }).compile();

    controller = module.get<MeilisearchController>(MeilisearchController);
  });

  describe('GET /search/unified', () => {
    it('retourne reponse vide pour query trop courte (< 2 chars)', async () => {
      const res = await controller.unifiedSearch(
        'a',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        adminUser,
      );
      expect(res.total).toBe(0);
      expect(res.hits).toEqual([]);
      expect(res.byIndex).toEqual({});
      expect(meiliMock.search).not.toHaveBeenCalled();
    });

    it('passe modules, categories, statuses, sort au service', async () => {
      meiliMock.search.mockResolvedValue({
        hits: [],
        total: 0,
        byIndex: {},
        facetDistribution: {},
        processingTimeMs: 12,
      });
      await controller.unifiedSearch(
        'iso 27001',
        'wiki,documents',
        '2',
        '10',
        'ISO,SECURITY',
        'PUBLIC,INTERNE',
        'APPROVED',
        'date:desc',
        adminUser,
      );
      expect(meiliMock.search).toHaveBeenCalledWith('iso 27001', {
        modules: ['wiki', 'documents'],
        limit: 10,
        offset: 10, // page 2 * 10
        categories: ['ISO', 'SECURITY'],
        classifications: ['PUBLIC', 'INTERNE'],
        statuses: ['APPROVED'],
        sort: ['date:desc'],
        facets: ['category', 'classification', 'status', 'type'],
        highlight: true,
        crop: true,
      });
    });

    it('filtre les documents SECRET pour un COLLABORATEUR (RBAC ISO 27001 A.5.12)', async () => {
      meiliMock.search.mockResolvedValue({
        total: 3,
        byIndex: {
          documents: {
            hits: [
              { id: 'doc-1', type: 'document', classification: 'PUBLIC', title: 'Public' },
              { id: 'doc-2', type: 'document', classification: 'SECRET', title: 'Top secret', authorId: 'other' },
              { id: 'doc-3', type: 'document', classification: 'INTERNE', title: 'Interne' },
            ],
            total: 3,
            facetDistribution: { classification: { PUBLIC: 1, SECRET: 1, INTERNE: 1 } },
            processingTimeMs: 5,
          },
        },
        facetDistribution: { classification: { PUBLIC: 1, SECRET: 1, INTERNE: 1 } },
        processingTimeMs: 5,
      });

      const res = await controller.unifiedSearch(
        'test',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        collabUser,
      );

      const docs = res.byIndex.documents?.hits ?? [];
      const ids = docs.map((d: any) => d.id);
      expect(ids).toEqual(['doc-1', 'doc-3']);
      expect(ids).not.toContain('doc-2'); // SECRET masque
      expect(res.total).toBe(2);
    });

    it("autorise un document SECRET pour son auteur (owner bypass)", async () => {
      meiliMock.search.mockResolvedValue({
        total: 1,
        byIndex: {
          documents: {
            hits: [
              {
                id: 'doc-secret-mine',
                type: 'document',
                classification: 'SECRET',
                authorId: 'user-1',
                title: 'Mon doc secret',
              },
            ],
            total: 1,
          },
        },
        facetDistribution: {},
        processingTimeMs: 0,
      });

      const res = await controller.unifiedSearch(
        'mon doc',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        collabUser,
      );

      expect(res.total).toBe(1);
      expect((res.byIndex.documents?.hits as any[])[0].id).toBe('doc-secret-mine');
    });

    it('expose facetDistribution et processingTimeMs', async () => {
      meiliMock.search.mockResolvedValue({
        total: 1,
        byIndex: {
          wiki: {
            hits: [{ id: 'w-1', type: 'wiki', title: 'Page wiki' }],
            total: 1,
            processingTimeMs: 8,
          },
        },
        facetDistribution: { category: { ISO: 1 } },
        processingTimeMs: 8,
      });
      const res = await controller.unifiedSearch(
        'wiki',
        'wiki',
        '1',
        '20',
        '',
        '',
        '',
        '',
        adminUser,
      );
      expect(res.facetDistribution).toEqual({ category: { ISO: 1 } });
      expect(res.processingTimeMs).toBe(8);
      expect(res.tookMs).toBeGreaterThanOrEqual(0);
    });

    it('cap limit a 100 et page a >= 1', async () => {
      meiliMock.search.mockResolvedValue({ total: 0, byIndex: {}, facetDistribution: {}, processingTimeMs: 0 });
      await controller.unifiedSearch('iso', '', '0', '500', '', '', '', '', adminUser);
      expect(meiliMock.search).toHaveBeenCalledWith(
        'iso',
        expect.objectContaining({ limit: 100, offset: 0 }),
      );
    });
  });

  describe('GET /search/quick (palette Cmd+K)', () => {
    it('renvoie reponse vide pour query < 2 chars', async () => {
      const res = await controller.quickSearch('', '8', collabUser);
      expect(res.hits).toEqual([]);
      expect(res.total).toBe(0);
      expect(meiliMock.search).not.toHaveBeenCalled();
    });

    it('limite le nombre de hits a la valeur demandee', async () => {
      meiliMock.search.mockResolvedValue({
        total: 30,
        byIndex: {
          documents: { hits: Array.from({ length: 10 }, (_, i) => ({ id: `d-${i}`, type: 'document', classification: 'PUBLIC' })), total: 10 },
          wiki: { hits: Array.from({ length: 10 }, (_, i) => ({ id: `w-${i}`, type: 'wiki' })), total: 10 },
          tickets: { hits: Array.from({ length: 10 }, (_, i) => ({ id: `t-${i}`, type: 'ticket' })), total: 10 },
        },
        facetDistribution: {},
        processingTimeMs: 0,
      });
      const res = await controller.quickSearch('test', '8', collabUser);
      expect(res.hits.length).toBeLessThanOrEqual(8);
    });
  });

  describe('GET /search/global (compat existante palette)', () => {
    it('groupe les hits par type avec RBAC', async () => {
      meiliMock.search.mockResolvedValue({
        byIndex: {
          documents: {
            hits: [
              { id: 'd1', type: 'document', classification: 'PUBLIC', title: 'D1' },
              { id: 'd2', type: 'document', classification: 'SECRET', title: 'D2', authorId: 'other' },
            ],
            total: 2,
          },
          wiki: { hits: [{ id: 'w1', type: 'wiki', title: 'W1' }], total: 1 },
        },
      });
      const res = await controller.globalSearch('test', '5', collabUser);
      expect(res.results.documents).toHaveLength(1); // SECRET filtre
      expect(res.results.wiki).toHaveLength(1);
      expect(res.tookMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe('POST /search/reindex', () => {
    it('appelle meili.reindexAll et renvoie le decompte', async () => {
      meiliMock.reindexAll.mockResolvedValue({
        documents: 16,
        tickets: 368,
        wiki: 65,
        news: 8,
        runbooks: 2,
      });
      const res = await controller.reindex();
      expect(res.success).toBe(true);
      expect(res.indexed.documents).toBe(16);
      expect(res.indexed.runbooks).toBe(2);
    });
  });
});
