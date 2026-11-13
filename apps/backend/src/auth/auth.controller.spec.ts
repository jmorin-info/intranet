import { Test, TestingModule } from '@nestjs/testing';
import { UserThrottlerGuard } from './guards/user-throttler.guard';
import { WebAuthnService } from '../mfa/webauthn.service';
import { UnauthorizedException } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { MfaService } from '../mfa/mfa.service';
import { Reflector } from '@nestjs/core';
import { UserRole } from '../common/enums';
import type { Request, Response } from 'express';

/**
 * Couvre les cas critiques du controller auth :
 *  (a) login happy path → renvoie tokens et set cookies
 *  (b) login MFA requis → ne renvoie pas de JWT, retourne flag mfaRequired
 *  (c) refresh token absent (input invalide) → 401
 *  (d) reset/forgot password → délégation correcte au service
 */
describe('AuthController', () => {
  let controller: AuthController;
  let authService: any;
  let usersService: any;
  let mfaService: any;

  const mockUser = {
    id: 'user-1',
    email: 'jdoe@omnitech.fr',
    firstName: 'John',
    lastName: 'Doe',
    role: UserRole.COLLABORATEUR,
    isActive: true,
    deletedAt: null,
    mfaEnabled: false,
    mfaSecret: null,
    mfaRequired: false,
    departmentId: 'dept-1',
  };

  const buildResponse = () => {
    const res: Partial<Response> = {
      cookie: jest.fn().mockReturnThis(),
      clearCookie: jest.fn().mockReturnThis(),
      status: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      redirect: jest.fn().mockReturnThis(),
    };
    return res as Response;
  };

  const buildRequest = (overrides: Partial<Request> = {}): Request => {
    return {
      ip: '127.0.0.1',
      headers: { 'user-agent': 'jest' },
      socket: { remoteAddress: '127.0.0.1' } as Request['socket'],
      cookies: {},
      path: '/api/v1/auth/logout',
      ...overrides,
    } as Request;
  };

  beforeEach(async () => {
    authService = {
      validateUser: jest.fn().mockResolvedValue(mockUser),
      login: jest.fn().mockResolvedValue({
        accessToken: 'access',
        refreshToken: 'refresh',
        user: { id: 'user-1', email: mockUser.email, role: mockUser.role },
      }),
      refreshTokens: jest.fn().mockResolvedValue({
        accessToken: 'access2',
        refreshToken: 'refresh2',
        user: { id: 'user-1' },
      }),
      logoutSession: jest.fn().mockResolvedValue(true),
      requestPasswordReset: jest
        .fn()
        .mockResolvedValue({ message: 'Si un compte est associé à cette adresse, un email a été envoyé.' }),
      resetPasswordWithToken: jest
        .fn()
        .mockResolvedValue({ message: 'Mot de passe modifié avec succès.' }),
      generateAccessToken: jest.fn().mockReturnValue('access-token'),
    };

    usersService = {
      findById: jest.fn().mockResolvedValue(mockUser),
    };

    mfaService = {
      verifyMfa: jest.fn().mockResolvedValue(true),
      verifyBackupCode: jest.fn().mockResolvedValue(false),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: authService },
        { provide: UsersService, useValue: usersService },
        { provide: MfaService, useValue: mfaService },
        { provide: WebAuthnService, useValue: { hasCredentials: jest.fn().mockResolvedValue(false) } },
        Reflector,
      ],
    }).overrideGuard(UserThrottlerGuard).useValue({ canActivate: () => true }).compile();

    controller = module.get<AuthController>(AuthController);
  });

  describe('login (happy path)', () => {
    it('returns access/refresh tokens for valid credentials and no MFA', async () => {
      const req = buildRequest();
      const res = buildResponse();
      const result = await controller.login(
        { email: mockUser.email, password: 'TestPass123!' },
        req,
        res,
      );
      expect(authService.validateUser).toHaveBeenCalledWith(
        mockUser.email,
        'TestPass123!',
      );
      expect(authService.login).toHaveBeenCalled();
      expect(result).toMatchObject({
        accessToken: 'access',
        refreshToken: 'refresh',
      });
      // Cookies set on response
      expect(res.cookie).toHaveBeenCalled();
    });
  });

  describe('login (auth refused / MFA required)', () => {
    it('returns mfaRequired flag when user has MFA enabled and no code provided', async () => {
      authService.validateUser.mockResolvedValueOnce({
        ...mockUser,
        mfaEnabled: true,
        mfaSecret: 'secret',
      });
      const result = await controller.login(
        { email: mockUser.email, password: 'TestPass123!' },
        buildRequest(),
        buildResponse(),
      );
      expect(result).toMatchObject({
        mfaRequired: true,
        email: mockUser.email,
      });
      // login() must NOT have been issued (no JWT)
      expect(authService.login).not.toHaveBeenCalled();
    });

    it('throws UnauthorizedException when MFA code is invalid (TOTP + backup both fail)', async () => {
      authService.validateUser.mockResolvedValueOnce({
        ...mockUser,
        mfaEnabled: true,
        mfaSecret: 'secret',
      });
      mfaService.verifyMfa.mockResolvedValueOnce(false);
      mfaService.verifyBackupCode.mockResolvedValueOnce(false);
      await expect(
        controller.login(
          { email: mockUser.email, password: 'TestPass123!', mfaCode: '000000' },
          buildRequest(),
          buildResponse(),
        ),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('refresh (invalid input)', () => {
    it('throws UnauthorizedException when no refresh token cookie present', async () => {
      const req = buildRequest({ cookies: {} });
      const res = buildResponse();
      await expect(controller.refresh(req, res)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('issues new tokens when refresh cookie is valid', async () => {
      const req = buildRequest({ cookies: { refreshToken: 'valid' } });
      const res = buildResponse();
      const result = await controller.refresh(req, res);
      expect(authService.refreshTokens).toHaveBeenCalledWith(
        'valid',
        expect.any(String),
        expect.any(String),
      );
      expect(result).toMatchObject({ accessToken: 'access2' });
    });
  });

  describe('logout', () => {
    it('revokes the actual refresh cookie and clears both scoped cookie paths', async () => {
      const req = buildRequest({ cookies: { refreshToken: 'actual-cookie' } });
      const res = buildResponse();
      const result = await controller.logout(req, res);
      expect(authService.logoutSession).toHaveBeenCalledWith('actual-cookie', undefined);
      expect(result).toEqual({ message: 'Logged out successfully' });
      expect(res.clearCookie).toHaveBeenCalledWith('refreshToken', { path: '/api/v1/auth/refresh' });
      expect(res.clearCookie).toHaveBeenCalledWith('refreshToken', { path: '/api/v1/auth' });
    });
    it('no verifiable identity returns401 rather than claiming revocation', async () => {
      authService.logoutSession.mockResolvedValue(false);
      const res = buildResponse();
      await expect(controller.logout(buildRequest(), res)).rejects.toThrow(UnauthorizedException);
      expect(res.clearCookie).not.toHaveBeenCalled();
    });
    it('the alias accepts the real legacy refresh cookie without an access cookie', async () => {
      const res = buildResponse();
      const result = await controller.logout(buildRequest({ path: '/api/v1/auth/refresh/logout', cookies: { refreshToken: 'actual-legacy-cookie' } }), res);
      expect(result).toEqual({ message: 'Logged out successfully' });
      expect(authService.logoutSession).toHaveBeenCalledWith('actual-legacy-cookie', undefined);
    });
    it('the alias with no verifiable identity clears invalid cookies and returns401', async () => {
      authService.logoutSession.mockResolvedValue(false);
      const res = buildResponse();
      await expect(controller.logout(buildRequest({ path: '/api/v1/auth/refresh/logout' }), res)).rejects.toThrow(UnauthorizedException);
      expect(res.clearCookie).toHaveBeenCalledWith('accessToken', { path: '/api' });
    });
    it('a database error never returns a successful logout or clears its revocation proof', async () => {
      authService.logoutSession.mockRejectedValue(new Error('database unavailable'));
      const res = buildResponse();
      await expect(controller.logout(buildRequest({ cookies: { refreshToken: 'actual-cookie' } }), res)).rejects.toThrow('database unavailable');
      expect(res.clearCookie).not.toHaveBeenCalled();
    });
  });

  describe('forgot/reset password (input pass-through)', () => {
    it('forgot-password delegates email to authService', async () => {
      const result = await controller.forgotPassword({ email: 'foo@bar.fr' });
      expect(authService.requestPasswordReset).toHaveBeenCalledWith('foo@bar.fr');
      expect(result.message).toBeDefined();
    });

    it('reset-password delegates token+password to authService', async () => {
      const result = await controller.resetPassword({
        token: 'tok',
        password: 'StrongPass123!',
      });
      expect(authService.resetPasswordWithToken).toHaveBeenCalledWith(
        'tok',
        'StrongPass123!',
      );
      expect(result.message).toBeDefined();
    });
  });

  describe('me', () => {
    it('returns the current user via UsersService.findById', async () => {
      const result = await controller.me({
        id: 'user-1',
        email: mockUser.email,
        role: UserRole.COLLABORATEUR,
      });
      expect(usersService.findById).toHaveBeenCalledWith('user-1');
      expect(result).toMatchObject({ id: 'user-1' });
    });
  });
});
