import { Test, TestingModule } from "@nestjs/testing";
import { WikiTagService } from "./wiki-tag.service";
import { PrismaService } from "../prisma/prisma.service";
import { UserRole } from "../common/enums";
import { RequestUser } from "../common/interfaces";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";

describe("WikiTagService", () => {
  let service: WikiTagService;
  let prisma: any;

  const adminUser: RequestUser = {
    id: "admin-1",
    email: "admin@omnitech.fr",
    role: UserRole.ADMIN,
    departmentId: "d1",
  };

  const collabUser: RequestUser = {
    id: "user-1",
    email: "user@omnitech.fr",
    role: UserRole.COLLABORATEUR,
    departmentId: "d1",
  };

  beforeEach(async () => {
    prisma = {
      wikiTag: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn(),
        create: jest.fn(),
        delete: jest.fn(),
      },
      wikiPage: {
        findUnique: jest.fn(),
      },
      wikiPageTag: {
        deleteMany: jest.fn().mockReturnValue("DEL"),
        createMany: jest.fn().mockReturnValue("CREATE"),
        findMany: jest.fn().mockResolvedValue([]),
      },
      $transaction: jest.fn().mockResolvedValue([]),
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [WikiTagService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get(WikiTagService);
  });

  describe("create", () => {
    it("forbids non-admin", async () => {
      await expect(
        service.create({ name: "Security" }, collabUser),
      ).rejects.toThrow(ForbiddenException);
    });

    it("rejects empty name", async () => {
      await expect(service.create({ name: "   " }, adminUser)).rejects.toThrow(
        BadRequestException,
      );
    });

    it("rejects invalid hex color", async () => {
      await expect(
        service.create({ name: "Tag", colorHex: "red" }, adminUser),
      ).rejects.toThrow(BadRequestException);
    });

    it("accepts valid 6-digit hex color", async () => {
      prisma.wikiTag.create.mockResolvedValue({
        id: "t1",
        slug: "tag",
        name: "Tag",
        colorHex: "#FF0033",
      });
      await service.create({ name: "Tag", colorHex: "#FF0033" }, adminUser);
      expect(prisma.wikiTag.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ colorHex: "#FF0033" }),
        }),
      );
    });

    it("auto-generates slug from name", async () => {
      prisma.wikiTag.create.mockResolvedValue({
        id: "t1",
        slug: "security-iso",
        name: "Security ISO",
        colorHex: null,
      });
      await service.create({ name: "Security ISO" }, adminUser);
      expect(prisma.wikiTag.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          name: "Security ISO",
          slug: "security-iso",
        }),
      });
    });

    it("throws ConflictException on duplicate slug", async () => {
      prisma.wikiTag.create.mockRejectedValue({ code: "P2002" });
      await expect(service.create({ name: "Dupe" }, adminUser)).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe("remove", () => {
    it("forbids non-admin", async () => {
      await expect(service.remove("t1", collabUser)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it("throws NotFound if tag missing", async () => {
      prisma.wikiTag.findUnique.mockResolvedValue(null);
      await expect(service.remove("t1", adminUser)).rejects.toThrow(
        NotFoundException,
      );
    });

    it("deletes the tag", async () => {
      prisma.wikiTag.findUnique.mockResolvedValue({ id: "t1" });
      prisma.wikiTag.delete.mockResolvedValue({ id: "t1" });
      const r = await service.remove("t1", adminUser);
      expect(r).toEqual({ success: true });
      expect(prisma.wikiTag.delete).toHaveBeenCalledWith({
        where: { id: "t1" },
      });
    });
  });

  describe("setPageTags", () => {
    beforeEach(() => {
      prisma.wikiPage.findUnique.mockResolvedValue({
        id: "p1",
        authorId: "user-1",
        collaborators: [],
      });
    });

    it("throws NotFound if page missing", async () => {
      prisma.wikiPage.findUnique.mockResolvedValue(null);
      await expect(
        service.setPageTags("p1", ["t1"], collabUser),
      ).rejects.toThrow(NotFoundException);
    });

    it("forbids non-author non-admin non-collaborator", async () => {
      prisma.wikiPage.findUnique.mockResolvedValue({
        id: "p1",
        authorId: "someone-else",
        collaborators: [],
      });
      await expect(
        service.setPageTags("p1", ["t1"], collabUser),
      ).rejects.toThrow(ForbiddenException);
    });

    it("rejects unknown tag IDs", async () => {
      prisma.wikiTag.findMany.mockResolvedValue([{ id: "t1" }]); // only 1 of 2 found
      await expect(
        service.setPageTags("p1", ["t1", "t2"], collabUser),
      ).rejects.toThrow(BadRequestException);
    });

    it("replaces tags atomically", async () => {
      prisma.wikiTag.findMany.mockResolvedValue([{ id: "t1" }, { id: "t2" }]);
      const r = await service.setPageTags("p1", ["t1", "t2"], collabUser);
      expect(r.success).toBe(true);
      expect(prisma.$transaction).toHaveBeenCalled();
    });

    it("allows clearing all tags with empty array", async () => {
      const r = await service.setPageTags("p1", [], collabUser);
      expect(r.success).toBe(true);
      expect(r.tags).toEqual([]);
    });

    it("admin can edit any page tags", async () => {
      prisma.wikiPage.findUnique.mockResolvedValue({
        id: "p1",
        authorId: "someone-else",
        collaborators: [],
      });
      const r = await service.setPageTags("p1", [], adminUser);
      expect(r.success).toBe(true);
    });
  });

  describe("findPagesByTagSlug", () => {
    it("returns empty for missing tag", async () => {
      prisma.wikiTag.findUnique.mockResolvedValue(null);
      const r = await service.findPagesByTagSlug("missing");
      expect(r).toEqual([]);
    });

    it("lowercases the slug", async () => {
      prisma.wikiTag.findUnique.mockResolvedValue({ id: "t1" });
      prisma.wikiPageTag.findMany.mockResolvedValue([
        { pageId: "p1" },
        { pageId: "p2" },
      ]);
      const r = await service.findPagesByTagSlug("SECURITY");
      expect(prisma.wikiTag.findUnique).toHaveBeenCalledWith({
        where: { slug: "security" },
        select: { id: true },
      });
      expect(r).toEqual(["p1", "p2"]);
    });
  });
});
