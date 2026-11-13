import { NotFoundException } from "@nestjs/common";
import { WikiService } from "./wiki.service";
import { UserRole } from "../common/enums";
import * as privateUploads from "../common/utils/private-upload";

jest.mock("../rag/rag.service", () => ({ RagService: class RagService {} }));

describe("private wiki attachment downloads", () => {
  const owner = { id: "owner", email: "owner@example.test", role: UserRole.COLLABORATEUR };
  const attachment = { name: "Private.pdf", url: "/uploads/wiki/123.pdf", size: 10, mimeType: "application/pdf", uploadedAt: "2026-01-01" };
  let prisma: any;
  let service: WikiService;

  beforeEach(() => {
    prisma = { wikiPage: { findMany: jest.fn().mockResolvedValue([{
      authorId: owner.id, visibility: "PRIVATE", collaborators: [], allowedRoles: [],
      attachments: JSON.stringify([attachment]),
    }]) } };
    service = new WikiService(prisma);
  });

  afterEach(() => jest.restoreAllMocks());

  it("denies an unrelated collaborator even when they know the filename", async () => {
    const resolve = jest.spyOn(privateUploads, "privateUploadPath");
    await expect(service.getAttachmentFile("123.pdf", { ...owner, id: "other" })).rejects.toThrow(NotFoundException);
    expect(resolve).not.toHaveBeenCalled();
  });

  it("serves a real attachment to a user allowed to see the page", async () => {
    jest.spyOn(privateUploads, "privateUploadPath").mockResolvedValue("/safe/123.pdf");
    await expect(service.getAttachmentFile("123.pdf", owner)).resolves.toEqual({ path: "/safe/123.pdf", name: "Private.pdf" });
  });

  it("does not treat a partial database search match as an authorized filename", async () => {
    await expect(service.getAttachmentFile("123.p", owner)).rejects.toThrow(NotFoundException);
  });

  it.each(["../private.env", "..\\private.env", "bad\0.pdf"])("rejects path input %s before any query", async (filename) => {
    await expect(service.getAttachmentFile(filename, owner)).rejects.toThrow(NotFoundException);
    expect(prisma.wikiPage.findMany).not.toHaveBeenCalled();
  });
});
