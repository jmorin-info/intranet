import { MfaController } from './mfa.controller';
import { UserRole } from '../common/enums';
import type { Request, Response } from 'express';

jest.mock('./mfa.service', () => ({ MfaService: class MfaService {} }));

/**
 * Tests du MFA controller :
 *  (a) setup MFA happy path → délégation au service
 *  (b) verify MFA invalid → renvoie { valid: false }
 *  (c) revalidate MFA → re-signe access token + set cookie
 *  (d) status → expose mfaEnabled+lastLoginAt
 */
describe('MfaController', () => {
  let controller: MfaController;
  let mfaService: any;
  let authService: any;
  let prisma: any;

  const mockUser = {
    id: 'user-1',
    email: 'jdoe@omnitech.fr',
    role: UserRole.COLLABORATEUR,
    departmentId: 'dept-1',
  };

  const buildRequest = (): Request => {
    return {
      ip: '127.0.0.1',
      headers: { 'user-agent': 'jest' },
      socket: { remoteAddress: '127.0.0.1' },
    } as unknown as Request;
  };

  const buildResponse = () => {
    const res: Partial<Response> = {
      cookie: jest.fn().mockReturnThis(),
      clearCookie: jest.fn().mockReturnThis(),
    };
    return res as Response;
  };

  beforeEach(async () => {
    mfaService = {
      setupMfa: jest
        .fn()
        .mockResolvedValue({ qrCode: 'data:image/png;base64,...', secret: 'SECRET' }),
      activateMfa: jest.fn().mockResolvedValue({ success: true }),
      verifyMfa: jest.fn().mockResolvedValue(true),
      verifyBackupCode: jest.fn().mockResolvedValue(false),
      disableMfaOwn: jest.fn().mockResolvedValue({ success: true }),
      disableMfa: jest.fn().mockResolvedValue({ success: true }),
      enforceMfa: jest.fn().mockResolvedValue({ updated: 5 }),
      generateBackupCodes: jest
        .fn()
        .mockResolvedValue(['code1', 'code2', 'code3', 'code4', 'code5']),
      setMfaPolicy: jest.fn().mockResolvedValue({ updated: true }),
      revalidateMfa: jest
        .fn()
        .mockResolvedValue({ mfaValidatedAt: Date.now() }),
      isMfaRequired: jest.fn().mockResolvedValue(true),
    };

    authService = {
      generateAccessToken: jest.fn().mockReturnValue('refreshed-token'),
    };

    prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'user-1',
          email: mockUser.email,
          role: UserRole.COLLABORATEUR,
          departmentId: 'dept-1',
          mfaEnabled: true,
          lastLoginAt: new Date('2026-01-15T10:00:00Z'),
          chartesAcceptedAt: new Date('2026-01-10T12:00:00Z'),
        }),
      },
      webAuthnCredential: { count: jest.fn().mockResolvedValue(0) },
    };

    controller = new MfaController(mfaService, authService, prisma);
  });

  describe('setup (happy path)', () => {
    it('returns QR code from MfaService.setupMfa', () => {
      const result = controller.setup(mockUser as any, buildRequest());
      expect(mfaService.setupMfa).toHaveBeenCalledWith(
        'user-1',
        expect.objectContaining({ ip: '127.0.0.1' }),
      );
      expect(result).resolves.toMatchObject({ secret: expect.any(String) });
    });
  });

  describe('verify (invalid code)', () => {
    it('returns valid:false when MFA verify fails', async () => {
      mfaService.verifyMfa.mockResolvedValueOnce(false);
      const result = await controller.verify(mockUser as any, '000000');
      expect(result).toEqual({ valid: false });
    });
  });

  describe('disable/me (input invalide)', () => {
    it('passes both password and code to service when provided', async () => {
      await controller.disableOwn(
        mockUser as any,
        { password: 'CurrentPass!', code: '123456' },
        buildRequest(),
      );
      expect(mfaService.disableMfaOwn).toHaveBeenCalledWith(
        'user-1',
        expect.objectContaining({
          password: 'CurrentPass!',
          code: '123456',
        }),
        expect.any(Object),
      );
    });
  });

  describe('disable/:userId (RBAC : SUPER_ADMIN only)', () => {
    it('calls service when admin invokes target disable (guard checked elsewhere)', () => {
      controller.disable(
        { id: 'admin-1', email: 'admin@omnitech.fr', role: UserRole.SUPER_ADMIN },
        'target-user-id',
        buildRequest(),
      );
      expect(mfaService.disableMfa).toHaveBeenCalledWith(
        'target-user-id',
        expect.objectContaining({
          actorId: 'admin-1',
          method: 'admin',
        }),
      );
    });
  });

  describe('revalidate', () => {
    it('signs a new access token and sets cookie after MFA revalidation', async () => {
      const res = buildResponse();
      const result = await controller.revalidate(
        mockUser as any,
        { code: '123456' },
        res,
      );
      expect(mfaService.revalidateMfa).toHaveBeenCalledWith('user-1', '123456', undefined);
      expect(authService.generateAccessToken).toHaveBeenCalled();
      expect(res.cookie).toHaveBeenCalled();
      expect(result.accessToken).toBe('refreshed-token');
      expect(result.mfaValidatedAt).toBeDefined();
    });

    it('revalidates only the signed session and preserves its id in the new JWT', async () => {
      await controller.revalidate({ ...mockUser, sid: 'session-a' }, { code: '123456' }, buildResponse());
      expect(mfaService.revalidateMfa).toHaveBeenCalledWith('user-1', '123456', 'session-a');
      expect(authService.generateAccessToken).toHaveBeenCalledWith(expect.objectContaining({
        sub: 'user-1', sid: 'session-a', mfaValidatedAt: expect.any(Number),
      }));
    });

    it('throws when DB user vanishes between guard and revalidate', async () => {
      prisma.user.findUnique.mockResolvedValueOnce(null);
      await expect(
        controller.revalidate(mockUser as any, { code: '123456' }, buildResponse()),
      ).rejects.toThrow(/not found/i);
    });
  });

  describe('status', () => {
    it('combines isMfaRequired + DB user fields into a single payload', async () => {
      const result = await controller.status(mockUser as any);
      expect(result).toMatchObject({
        mfaEnabled: true,
        lastLoginAt: expect.any(Date),
        chartesAcceptedAt: expect.any(Date),
      });
    });
  });

  describe('setMfaPolicy (RBAC SUPER_ADMIN)', () => {
    it('updates MFA enforced flag for target user', async () => {
      await controller.setMfaPolicy(
        { id: 'admin-1', email: 'a@b.fr', role: UserRole.SUPER_ADMIN },
        'target-id',
        { enforced: true },
        buildRequest(),
      );
      expect(mfaService.setMfaPolicy).toHaveBeenCalledWith(
        'target-id',
        true,
        'admin-1',
        expect.any(Object),
      );
    });
  });
});
