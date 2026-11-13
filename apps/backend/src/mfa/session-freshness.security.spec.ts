import { MfaService } from "./mfa.service";
import { WebAuthnController } from "./webauthn.controller";
import { UserRole } from "../common/enums";

jest.mock("./webauthn.service", () => ({ WebAuthnService: class WebAuthnService {} }));
jest.mock("otplib", () => ({ generateSecret: jest.fn(), generateURI: jest.fn(), verifySync: jest.fn() }));

interface Session {
  id: string;
  userId: string;
  revokedAt: Date | null;
  expiresAt: Date;
  userAgent: string;
  mfaValidatedAt: Date | null;
}

describe.each(["totp", "webauthn"])("%s session-bound MFA freshness", (kind) => {
  let sessions: Session[];
  let prisma: any;
  let auth: any;
  let mfa: MfaService;
  let webauthn: WebAuthnController;
  const user = { id: "user-1", email: "user@example.test", role: UserRole.COLLABORATEUR };

  beforeEach(() => {
    jest.useFakeTimers({ now: new Date("2026-11-12T20:00:00Z") });
    sessions = ["session-a", "session-b"].map((id) => ({
      id, userId: user.id, revokedAt: null, expiresAt: new Date(Date.now() + 3600_000),
      userAgent: "test-browser", mfaValidatedAt: null,
    }));
    prisma = {
      user: { findUnique: jest.fn().mockResolvedValue({ ...user, mfaEnabled: true, mfaSecret: "test-only" }) },
      refreshToken: { updateMany: jest.fn(async ({ where, data }: any) => {
        const matching = sessions.filter((row) =>
          (where.id === undefined || row.id === where.id) &&
          (where.userId === undefined || row.userId === where.userId) &&
          (where.revokedAt === undefined || row.revokedAt === where.revokedAt) &&
          (!where.expiresAt || row.expiresAt > where.expiresAt.gt) &&
          (!where.userAgent || row.userAgent !== where.userAgent.not),
        );
        matching.forEach((row) => Object.assign(row, data));
        return { count: matching.length };
      }) },
    };
    mfa = new MfaService(prisma, { log: jest.fn().mockResolvedValue(undefined) } as any, {} as any);
    jest.spyOn(mfa, "verifyMfa").mockResolvedValue(true);
    auth = { generateAccessToken: jest.fn().mockReturnValue("fresh-access-token") };
    webauthn = new WebAuthnController({
      verifyAuthentication: jest.fn().mockResolvedValue({ verified: true }),
    } as any, auth, prisma);
  });

  afterEach(() => jest.useRealTimers());

  async function revalidate(sid?: string) {
    if (kind === "totp") return mfa.revalidateMfa(user.id, "123456", sid);
    return webauthn.authenticateVerify({ ...user, sid }, { response: {} } as any, {
      ip: "127.0.0.1", headers: {}, socket: {},
    } as any, { cookie: jest.fn() } as any);
  }

  it("validating session A leaves another active session B unvalidated", async () => {
    await revalidate("session-a");
    expect(sessions[0].mfaValidatedAt?.getTime()).toBe(Date.now());
    expect(sessions[1].mfaValidatedAt).toBeNull();
    if (kind === "webauthn") {
      expect(auth.generateAccessToken).toHaveBeenCalledWith(expect.objectContaining({ sid: "session-a" }));
    }
  });

  it.each(["revoked", "expired", "password-reset", "different-user"])(
    "does not persist freshness on a %s session or fall back to session B",
    async (state) => {
      if (state === "revoked") sessions[0].revokedAt = new Date();
      if (state === "expired") sessions[0].expiresAt = new Date(Date.now() - 1);
      if (state === "password-reset") sessions[0].userAgent = "PASSWORD_RESET";
      if (state === "different-user") sessions[0].userId = "other-user";
      await revalidate("session-a");
      expect(sessions.every((row) => row.mfaValidatedAt === null)).toBe(true);
    },
  );

  it("keeps legacy JWTs without sid local to the current access token", async () => {
    const result = await revalidate();
    expect(result.mfaValidatedAt).toBe(Date.now());
    expect(prisma.refreshToken.updateMany).not.toHaveBeenCalled();
    expect(sessions.every((row) => row.mfaValidatedAt === null)).toBe(true);
  });
});
