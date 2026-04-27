import { Test, TestingModule } from "@nestjs/testing";
import { BacklinkService } from "./backlink.service";
import { PrismaService } from "../prisma/prisma.service";

describe("BacklinkService", () => {
  describe("extractLinks (static)", () => {
    it("returns empty for null/empty content", () => {
      expect(BacklinkService.extractLinks(null)).toEqual([]);
      expect(BacklinkService.extractLinks(undefined)).toEqual([]);
      expect(BacklinkService.extractLinks("")).toEqual([]);
    });

    it("detects [[slug]]", () => {
      const result = BacklinkService.extractLinks(
        "Voir [[onboarding]] pour plus.",
      );
      expect(result).toEqual(["onboarding"]);
    });

    it("detects [[Title|slug]]", () => {
      const result = BacklinkService.extractLinks(
        "Voir [[Mon onboarding|onboarding-it]].",
      );
      expect(result).toEqual(["onboarding-it"]);
    });

    it("deduplicates slugs", () => {
      const result = BacklinkService.extractLinks(
        "[[onboarding]] et plus tard [[onboarding]] et [[Title|onboarding]]",
      );
      expect(result).toEqual(["onboarding"]);
    });

    it("returns lowercased slugs", () => {
      const result = BacklinkService.extractLinks("[[ONBOARDING-IT]]");
      expect(result).toEqual(["onboarding-it"]);
    });

    it("handles multiple distinct slugs", () => {
      const result = BacklinkService.extractLinks(
        "Voir [[procedure-vpn]] ou [[runbook-incident]] ou [[wiki-home]]",
      );
      expect(result.sort()).toEqual([
        "procedure-vpn",
        "runbook-incident",
        "wiki-home",
      ]);
    });

    it("ignores invalid characters in slug (spaces, special chars)", () => {
      // `[[my page]]` n'est pas valide (espace) — la regex requiert [A-Za-z0-9_-]+.
      const result = BacklinkService.extractLinks("[[my page]] [[valid-one]]");
      expect(result).toEqual(["valid-one"]);
    });

    it("ignores empty brackets", () => {
      expect(BacklinkService.extractLinks("[[]] et [[ ]]")).toEqual([]);
    });
  });

  describe("countLinks (static)", () => {
    it("counts occurrences per slug", () => {
      const counts = BacklinkService.countLinks(
        "[[a]] [[b]] [[a]] [[Title|a]] [[c]]",
      );
      expect(counts.get("a")).toBe(3);
      expect(counts.get("b")).toBe(1);
      expect(counts.get("c")).toBe(1);
    });

    it("returns empty map for no links", () => {
      const counts = BacklinkService.countLinks("Nothing to see here.");
      expect(counts.size).toBe(0);
    });
  });

  describe("rebuildBacklinks", () => {
    let service: BacklinkService;
    let prisma: any;

    beforeEach(async () => {
      prisma = {
        wikiPage: {
          findUnique: jest.fn(),
        },
        wikiPageBacklink: {
          deleteMany: jest.fn().mockReturnValue("DELETE"),
          createMany: jest.fn().mockReturnValue("CREATE"),
        },
        $transaction: jest.fn().mockResolvedValue([]),
      };
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          BacklinkService,
          { provide: PrismaService, useValue: prisma },
        ],
      }).compile();
      service = module.get(BacklinkService);
    });

    it("returns 0 when page does not exist", async () => {
      prisma.wikiPage.findUnique.mockResolvedValue(null);
      const n = await service.rebuildBacklinks("missing");
      expect(n).toBe(0);
    });

    it("deletes existing backlinks and inserts new ones", async () => {
      prisma.wikiPage.findUnique.mockResolvedValue({
        id: "page-1",
        content: "See [[onboarding]] and [[runbook]] and [[onboarding]] again.",
      });

      const n = await service.rebuildBacklinks("page-1");
      expect(n).toBe(2); // onboarding + runbook
      expect(prisma.wikiPageBacklink.deleteMany).toHaveBeenCalledWith({
        where: { fromPageId: "page-1" },
      });
      expect(prisma.wikiPageBacklink.createMany).toHaveBeenCalledWith({
        data: expect.arrayContaining([
          expect.objectContaining({
            fromPageId: "page-1",
            toPageSlug: "onboarding",
            occurrenceCount: 2,
          }),
          expect.objectContaining({
            fromPageId: "page-1",
            toPageSlug: "runbook",
            occurrenceCount: 1,
          }),
        ]),
        skipDuplicates: true,
      });
    });

    it("only deletes when no links exist", async () => {
      prisma.wikiPage.findUnique.mockResolvedValue({
        id: "page-2",
        content: "No links here at all.",
      });

      const n = await service.rebuildBacklinks("page-2");
      expect(n).toBe(0);
      expect(prisma.wikiPageBacklink.deleteMany).toHaveBeenCalled();
      expect(prisma.wikiPageBacklink.createMany).not.toHaveBeenCalled();
    });
  });

  describe("findBacklinksForSlug", () => {
    let service: BacklinkService;
    let prisma: any;

    beforeEach(async () => {
      prisma = {
        wikiPageBacklink: {
          findMany: jest.fn(),
        },
      };
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          BacklinkService,
          { provide: PrismaService, useValue: prisma },
        ],
      }).compile();
      service = module.get(BacklinkService);
    });

    it("returns empty for empty slug", async () => {
      const result = await service.findBacklinksForSlug("");
      expect(result).toEqual([]);
    });

    it("lowercases the slug for the lookup", async () => {
      prisma.wikiPageBacklink.findMany.mockResolvedValue([]);
      await service.findBacklinksForSlug("ONBOARDING-IT");
      expect(prisma.wikiPageBacklink.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { toPageSlug: "onboarding-it" },
        }),
      );
    });

    it("returns mapped rows excluding unpublished pages", async () => {
      prisma.wikiPageBacklink.findMany.mockResolvedValue([
        {
          occurrenceCount: 3,
          fromPage: {
            id: "p1",
            title: "Page 1",
            slug: "page-1",
            category: "IT",
            updatedAt: new Date("2026-04-01"),
            authorId: "u1",
            visibility: "PUBLIC",
            ownerDepartmentId: null,
            allowedRoles: [],
            collaborators: [],
            isPublished: true,
          },
        },
        {
          occurrenceCount: 1,
          fromPage: {
            id: "p2",
            title: "Draft",
            slug: "draft",
            isPublished: false,
            // ... other fields not relevant
            authorId: "u1",
            visibility: "PRIVATE",
            ownerDepartmentId: null,
            allowedRoles: [],
            collaborators: [],
            updatedAt: new Date(),
            category: null,
          },
        },
      ]);
      const result = await service.findBacklinksForSlug("onboarding");
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("p1");
      expect(result[0].occurrenceCount).toBe(3);
    });
  });
});
