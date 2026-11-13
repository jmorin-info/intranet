import { Test, TestingModule } from "@nestjs/testing";
import { RegistreService } from "./registre.service";
import { PrismaService } from "../prisma/prisma.service";
import { REGISTRE_DEFAULT_PAGE_SIZE, REGISTRE_MAX_PAGE_SIZE } from "./types";

/**
 * Tests RegistreService — focalises sur le contrat REG_016 admin :
 *   - pagination (skip/take/total separes)
 *   - whitelist du tri (rejet silencieux des valeurs non listees)
 *   - recherche OR case-insensitive sur reference/parentReference/title
 *
 * Le PrismaService est mocke avec `jest.fn()` (pattern wiki-tag.service.spec).
 * On ne teste pas le mapping `mapDocumentToRow` ici — il est couvert
 * implicitement par le smoke test `paginates correctly`.
 */
describe("RegistreService", () => {
  let service: RegistreService;
  let prisma: {
    document: {
      findMany: jest.Mock;
      count: jest.Mock;
    };
  };

  beforeEach(async () => {
    prisma = {
      document: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [RegistreService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get(RegistreService);
  });

  describe("listForRegistre — pagination", () => {
    it("uses defaults when paging params are absent", async () => {
      await service.listForRegistre({});
      expect(prisma.document.findMany).toHaveBeenCalledTimes(1);
      const args = prisma.document.findMany.mock.calls[0][0];
      expect(args.skip).toBe(0);
      expect(args.take).toBe(REGISTRE_DEFAULT_PAGE_SIZE);
    });

    it("computes skip = (page - 1) * pageSize", async () => {
      await service.listForRegistre({ page: 3, pageSize: 20 });
      const args = prisma.document.findMany.mock.calls[0][0];
      expect(args.skip).toBe(40);
      expect(args.take).toBe(20);
    });

    it("caps pageSize at REGISTRE_MAX_PAGE_SIZE", async () => {
      await service.listForRegistre({ page: 1, pageSize: 1000 });
      const args = prisma.document.findMany.mock.calls[0][0];
      expect(args.take).toBe(REGISTRE_MAX_PAGE_SIZE);
    });

    it("falls back to page=1 when page < 1", async () => {
      await service.listForRegistre({ page: 0, pageSize: 50 });
      const args = prisma.document.findMany.mock.calls[0][0];
      expect(args.skip).toBe(0);
    });

    it("returns total from count, separately from items", async () => {
      prisma.document.count.mockResolvedValue(123);
      prisma.document.findMany.mockResolvedValue([]);
      const res = await service.listForRegistre({ page: 1, pageSize: 10 });
      expect(res.total).toBe(123);
      expect(res.items).toEqual([]);
      expect(res.page).toBe(1);
      expect(res.pageSize).toBe(10);
      // count + findMany doivent etre 2 requetes distinctes
      expect(prisma.document.count).toHaveBeenCalledTimes(1);
      expect(prisma.document.findMany).toHaveBeenCalledTimes(1);
    });

    it("paginates correctly — items reflect findMany result", async () => {
      prisma.document.count.mockResolvedValue(2);
      prisma.document.findMany.mockResolvedValue([
        {
          id: "d1",
          reference: "POL_001",
          parentReference: null,
          category: "POLICY",
          documentLevel: "GOVERNANCE",
          title: "Politique securite",
          status: "APPROVED",
          classification: "INTERNE",
          priority: "HIGH",
          blocking: false,
          owner: null,
          approver: null,
          isoControls: [],
          versions: [],
          reviewPeriodicity: null,
          nextReviewDate: null,
          externalStorageProvider: null,
          externalStoragePath: null,
        },
      ]);
      const res = await service.listForRegistre({});
      expect(res.items).toHaveLength(1);
      expect(res.items[0]?.reference).toBe("POL_001");
      expect(res.total).toBe(2);
    });
  });

  describe("listForRegistre — sort whitelist", () => {
    it("defaults to reference asc when sortBy is absent", async () => {
      await service.listForRegistre({});
      const args = prisma.document.findMany.mock.calls[0][0];
      expect(args.orderBy).toEqual([{ reference: "asc" }, { reference: "asc" }]);
    });

    it("rejects sortBy values outside whitelist (fallback reference)", async () => {
      await service.listForRegistre({
        // @ts-expect-error — verification du fallback runtime sur valeur hors whitelist
        sortBy: "DROP TABLE",
      });
      const args = prisma.document.findMany.mock.calls[0][0];
      expect(args.orderBy[0]).toEqual({ reference: "asc" });
    });

    it("accepts sortBy 'updatedAt' desc", async () => {
      await service.listForRegistre({ sortBy: "updatedAt", sortDir: "desc" });
      const args = prisma.document.findMany.mock.calls[0][0];
      expect(args.orderBy[0]).toEqual({ updatedAt: "desc" });
      // tri secondaire stable
      expect(args.orderBy[1]).toEqual({ reference: "asc" });
    });

    it("maps sortBy 'name' to Prisma column 'title'", async () => {
      await service.listForRegistre({ sortBy: "name", sortDir: "asc" });
      const args = prisma.document.findMany.mock.calls[0][0];
      expect(args.orderBy[0]).toEqual({ title: "asc" });
    });

    it("falls back sortDir to 'asc' when not 'desc'", async () => {
      await service.listForRegistre({
        sortBy: "priority",
        // @ts-expect-error — sortDir invalide doit retomber sur 'asc'
        sortDir: "RANDOM",
      });
      const args = prisma.document.findMany.mock.calls[0][0];
      expect(args.orderBy[0]).toEqual({ priority: "asc" });
    });
  });

  describe("listForRegistre — search", () => {
    it("does not add OR clause when search is absent", async () => {
      await service.listForRegistre({});
      const args = prisma.document.findMany.mock.calls[0][0];
      expect(args.where.OR).toBeUndefined();
      // count utilise le meme where
      expect(prisma.document.count).toHaveBeenCalledWith({ where: args.where });
    });

    it("does not add OR clause when search is only whitespace", async () => {
      await service.listForRegistre({ search: "   " });
      const args = prisma.document.findMany.mock.calls[0][0];
      expect(args.where.OR).toBeUndefined();
    });

    it("builds OR clause across reference, parentReference, title (case-insensitive)", async () => {
      await service.listForRegistre({ search: "Pol_015" });
      const args = prisma.document.findMany.mock.calls[0][0];
      expect(args.where.OR).toEqual([
        { reference: { contains: "Pol_015", mode: "insensitive" } },
        { parentReference: { contains: "Pol_015", mode: "insensitive" } },
        { title: { contains: "Pol_015", mode: "insensitive" } },
      ]);
    });

    it("trims search before applying it", async () => {
      await service.listForRegistre({ search: "  charte  " });
      const args = prisma.document.findMany.mock.calls[0][0];
      expect(args.where.OR[0]).toEqual({
        reference: { contains: "charte", mode: "insensitive" },
      });
    });

    it("propagates where to both count and findMany", async () => {
      await service.listForRegistre({
        search: "iso",
        category: "POLICY",
      });
      const countArgs = prisma.document.count.mock.calls[0][0];
      const listArgs = prisma.document.findMany.mock.calls[0][0];
      expect(countArgs.where).toEqual(listArgs.where);
      expect(countArgs.where.category).toBe("POLICY");
      expect(countArgs.where.OR).toHaveLength(3);
    });
  });

  describe("listForExport", () => {
    it("does not call count and does not paginate", async () => {
      await service.listForExport({});
      expect(prisma.document.count).not.toHaveBeenCalled();
      const args = prisma.document.findMany.mock.calls[0][0];
      expect(args.skip).toBeUndefined();
      expect(args.take).toBeUndefined();
    });

    it("still applies filter clauses (category, search)", async () => {
      await service.listForExport({ category: "POLICY", search: "iso" });
      const args = prisma.document.findMany.mock.calls[0][0];
      expect(args.where.category).toBe("POLICY");
      expect(args.where.OR).toHaveLength(3);
    });
  });
});
