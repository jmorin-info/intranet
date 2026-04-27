import { Test, TestingModule } from "@nestjs/testing";
import { BadRequestException, NotFoundException } from "@nestjs/common";
import { WebAuthnService } from "./webauthn.service";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { CacheService } from "../common/cache/cache.service";

// Mock simplewebauthn — on ne teste PAS la lib elle-même, juste l'intégration.
jest.mock("@simplewebauthn/server", () => ({
  generateRegistrationOptions: jest
    .fn()
    .mockResolvedValue({ challenge: "test-challenge-reg", rp: { id: "localhost" } }),
  verifyRegistrationResponse: jest.fn().mockResolvedValue({
    verified: true,
    registrationInfo: {
      credential: {
        id: "credential-id-base64",
        publicKey: new Uint8Array([1, 2, 3, 4]),
        counter: 0,
        transports: ["usb"],
      },
      credentialDeviceType: "singleDevice",
      credentialBackedUp: false,
    },
  }),
  generateAuthenticationOptions: jest
    .fn()
    .mockResolvedValue({ challenge: "test-challenge-auth", allowCredentials: [] }),
  verifyAuthenticationResponse: jest.fn().mockResolvedValue({
    verified: true,
    authenticationInfo: { newCounter: 1 },
  }),
}));

describe("WebAuthnService", () => {
  let service: WebAuthnService;
  let prisma: any;
  let cache: any;
  let audit: any;

  beforeEach(async () => {
    prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: "user-1",
          email: "alice@omnitech.fr",
          firstName: "Alice",
          lastName: "Martin",
        }),
      },
      webAuthnCredential: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn().mockResolvedValue({
          id: "cred-db-1",
          userId: "user-1",
          credentialId: "credential-id-base64",
          publicKey: Buffer.from([1, 2, 3, 4]),
          counter: 0,
          transports: ["usb"],
        }),
        create: jest.fn().mockResolvedValue({ id: "cred-db-1", label: "YubiKey" }),
        update: jest.fn().mockResolvedValue({}),
        delete: jest.fn().mockResolvedValue({}),
        count: jest.fn().mockResolvedValue(0),
      },
    };
    cache = {
      get: jest.fn().mockResolvedValue("test-challenge-reg"),
      set: jest.fn().mockResolvedValue(undefined),
      del: jest.fn().mockResolvedValue(undefined),
    };
    audit = { log: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WebAuthnService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: audit },
        { provide: CacheService, useValue: cache },
      ],
    }).compile();

    service = module.get<WebAuthnService>(WebAuthnService);
  });

  it("génère des options d'enrôlement et stocke le challenge en cache", async () => {
    const options = await service.generateRegistrationOptions("user-1");
    expect(options.challenge).toBe("test-challenge-reg");
    expect(cache.set).toHaveBeenCalledWith(
      "webauthn:reg:user-1",
      "test-challenge-reg",
      300,
    );
  });

  it("rejette si aucun user trouvé pour l'enrôlement", async () => {
    prisma.user.findUnique.mockResolvedValueOnce(null);
    await expect(
      service.generateRegistrationOptions("ghost"),
    ).rejects.toThrow(NotFoundException);
  });

  it("vérifie l'enrôlement et persiste la credential", async () => {
    const result = await service.verifyRegistration(
      "user-1",
      { id: "cred-1" } as any,
      "YubiKey",
    );
    expect(result.id).toBe("cred-db-1");
    expect(prisma.webAuthnCredential.create).toHaveBeenCalled();
    // Challenge consommé après usage
    expect(cache.del).toHaveBeenCalledWith("webauthn:reg:user-1");
  });

  it("rejette si le challenge a expiré", async () => {
    cache.get.mockResolvedValueOnce(null);
    await expect(
      service.verifyRegistration("user-1", {} as any),
    ).rejects.toThrow(BadRequestException);
  });

  it("génère des options d'authentification quand au moins 1 credential existe", async () => {
    prisma.webAuthnCredential.findMany.mockResolvedValueOnce([
      { credentialId: "cid-1", transports: ["usb"] },
    ]);
    const options = await service.generateAuthenticationOptions("user-1");
    expect(options.challenge).toBe("test-challenge-auth");
    expect(cache.set).toHaveBeenCalledWith(
      "webauthn:auth:user-1",
      "test-challenge-auth",
      300,
    );
  });

  it("rejette l'authentification si aucune clé enregistrée", async () => {
    prisma.webAuthnCredential.findMany.mockResolvedValueOnce([]);
    await expect(
      service.generateAuthenticationOptions("user-1"),
    ).rejects.toThrow(NotFoundException);
  });

  it("vérifie l'authentification et incrémente le counter", async () => {
    cache.get.mockResolvedValueOnce("test-challenge-auth");
    const result = await service.verifyAuthentication("user-1", {
      id: "credential-id-base64",
    } as any);
    expect(result.verified).toBe(true);
    expect(prisma.webAuthnCredential.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ counter: 1 }),
      }),
    );
  });

  it("liste et supprime les credentials", async () => {
    prisma.webAuthnCredential.findMany.mockResolvedValueOnce([
      { id: "cred-db-1", label: "YubiKey" },
    ]);
    const list = await service.listCredentials("user-1");
    expect(list).toHaveLength(1);

    prisma.webAuthnCredential.findUnique.mockResolvedValueOnce({
      id: "cred-db-1",
      userId: "user-1",
      label: "YubiKey",
    });
    await service.deleteCredential("user-1", "cred-db-1");
    expect(prisma.webAuthnCredential.delete).toHaveBeenCalledWith({
      where: { id: "cred-db-1" },
    });
  });

  it("hasCredentials retourne true quand >=1 credential", async () => {
    prisma.webAuthnCredential.count.mockResolvedValueOnce(2);
    expect(await service.hasCredentials("user-1")).toBe(true);
    prisma.webAuthnCredential.count.mockResolvedValueOnce(0);
    expect(await service.hasCredentials("user-1")).toBe(false);
  });
});
