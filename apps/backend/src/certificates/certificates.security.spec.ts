import { NotFoundException } from "@nestjs/common";
import { CertificatesController } from "./certificates.controller";
import { CertificatesService } from "./certificates.service";
import { UserRole } from "../common/enums";
import * as privateUploads from "../common/utils/private-upload";

const owner = { id: "owner", email: "owner@example.test", role: UserRole.COLLABORATEUR };

describe("certificate attachment security", () => {
  afterEach(() => jest.restoreAllMocks());

  it.each(["createMy", "updateMy", "create", "update"])(
    "%s ignores caller-supplied file locations without a multipart upload",
    async (action) => {
      const persist = jest.fn().mockResolvedValue({ id: "certificate" });
      const controller = new CertificatesController({ [action]: persist } as any);
      const dto = {
        name: "Test", certType: "TEST", obtainedAt: "2026-01-01",
        fileUrl: "../../.env", fileName: "forged.pdf", fileSizeBytes: 100,
      };
      if (action === "createMy") await controller.createMy(dto, undefined as any, owner);
      if (action === "updateMy") await controller.updateMy("certificate", dto, undefined as any, owner);
      if (action === "create") await controller.create(dto, undefined as any, owner);
      if (action === "update") await controller.update("certificate", dto, undefined as any, owner);
      const savedDto = persist.mock.calls[0][action.startsWith("update") ? 1 : 0];
      expect(savedDto).not.toHaveProperty("fileUrl");
      expect(savedDto).not.toHaveProperty("fileName");
      expect(savedDto).not.toHaveProperty("fileSizeBytes");
    },
  );

  it("accepts the server-created filename from an actual multipart upload", async () => {
    const createMy = jest.fn().mockResolvedValue({ id: "certificate" });
    const controller = new CertificatesController({
      createMy,
      regenerateThumbnailForCert: jest.fn(),
    } as any);
    await controller.createMy({ fileUrl: "../../.env" } as any, {
      filename: "123-456.pdf", originalname: "certificate.pdf", size: 10, mimetype: "application/pdf",
    } as any, owner);
    expect(createMy.mock.calls[0][0].fileUrl).toBe("/uploads/certificates/123-456.pdf");
  });

  it("does not permit another collaborator to download a certificate", async () => {
    const service = new CertificatesService({ certificate: {
      findUnique: jest.fn().mockResolvedValue({ userId: owner.id, expiresAt: null, fileUrl: "/uploads/certificates/test.pdf" }),
    } } as any, {} as any);
    const resolve = jest.spyOn(privateUploads, "privateUploadPath");
    await expect(service.getFileForUser("certificate", { ...owner, id: "other" })).rejects.toThrow(NotFoundException);
    expect(resolve).not.toHaveBeenCalled();
  });

  it.each(["../../.env", "/uploads/certificates/../../.env", "https://example.test/file.pdf"])(
    "refuses an existing forged database location: %s",
    async (fileUrl) => {
      const service = new CertificatesService({ certificate: {
        findUnique: jest.fn().mockResolvedValue({ userId: owner.id, expiresAt: null, fileUrl }),
      } } as any, {} as any);
      await expect(service.getFileForUser("certificate", owner)).rejects.toThrow(NotFoundException);
    },
  );

  it.each([owner, { ...owner, id: "admin", role: UserRole.ADMIN }])(
    "allows an owner or administrator to download a confined attachment",
    async (user) => {
      const service = new CertificatesService({ certificate: {
        findUnique: jest.fn().mockResolvedValue({ userId: owner.id, expiresAt: null, fileUrl: "/uploads/certificates/test.pdf", fileName: "Certificate.pdf" }),
      } } as any, {} as any);
      jest.spyOn(privateUploads, "privateUploadPath").mockResolvedValue("/safe/test.pdf");
      await expect(service.getFileForUser("certificate", user)).resolves.toEqual({ path: "/safe/test.pdf", name: "Certificate.pdf" });
    },
  );
});
