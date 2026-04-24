import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service';
import { LdapService } from '../ldap/ldap.service';
import { AuditService } from '../audit/audit.service';
import { HibpService } from './hibp.service';
import { UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { UserRole } from '../common/enums';

describe('AuthService', () => {
  let service: AuthService;
  let prisma: any;
  let jwtService: any;
  let usersService: any;

  const mockUser = {
    id: 'user-1',
    email: 'test@omnitech.fr',
    passwordHash: '',
    firstName: 'Test',
    lastName: 'User',
    role: 'COLLABORATEUR',
    isActive: true,
    deletedAt: null,
    mfaEnabled: false,
    mfaSecret: null,
    departmentId: 'dept-1',
    lastLoginAt: null,
    chartesAcceptedAt: null,
  };

  beforeAll(async () => {
    mockUser.passwordHash = await bcrypt.hash('TestPass123!', 10);
  });

  beforeEach(async () => {
    prisma = {
      user: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn().mockResolvedValue(mockUser),
      },
      refreshToken: {
        create: jest.fn().mockResolvedValue({ id: 'rt-1' }),
        findFirst: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        count: jest.fn().mockResolvedValue(0),
      },
    };

    jwtService = {
      sign: jest.fn().mockReturnValue('mock-jwt-token'),
      verify: jest.fn(),
    };

    usersService = {
      findByEmail: jest.fn().mockResolvedValue(mockUser),
      findById: jest.fn().mockResolvedValue(mockUser),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: JwtService, useValue: jwtService },
        { provide: UsersService, useValue: usersService },
        {
          provide: LdapService,
          useValue: { authenticate: jest.fn().mockResolvedValue(null) },
        },
        {
          provide: AuditService,
          useValue: { log: jest.fn().mockResolvedValue(undefined) },
        },
        {
          provide: HibpService,
          useValue: {
            isPasswordPwned: jest.fn().mockResolvedValue({ pwned: false, count: 0 }),
            assertPasswordNotPwned: jest.fn().mockResolvedValue(undefined),
          },
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  describe('validateUser', () => {
    it('should return user for valid credentials', async () => {
      const result = await service.validateUser(
        'test@omnitech.fr',
        'TestPass123!',
      );
      expect(result).toBeDefined();
      expect(result.email).toBe('test@omnitech.fr');
    });

    it('should throw UnauthorizedException for wrong password', async () => {
      await expect(
        service.validateUser('test@omnitech.fr', 'wrong'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException when user not found', async () => {
      usersService.findByEmail.mockResolvedValue(null);
      await expect(
        service.validateUser('unknown@omnitech.fr', 'TestPass123!'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw for inactive user', async () => {
      usersService.findByEmail.mockResolvedValue({
        ...mockUser,
        isActive: false,
      });
      await expect(
        service.validateUser('test@omnitech.fr', 'TestPass123!'),
      ).rejects.toThrow(/deactivated|désactivé/i);
    });

    it('should throw for deleted user', async () => {
      usersService.findByEmail.mockResolvedValue({
        ...mockUser,
        deletedAt: new Date(),
      });
      await expect(
        service.validateUser('test@omnitech.fr', 'TestPass123!'),
      ).rejects.toThrow(/deleted|supprimé/i);
    });
  });

  describe('login', () => {
    it('should return accessToken, refreshToken, and user', async () => {
      const result = await service.login(mockUser, '127.0.0.1', 'test-agent');
      expect(result.accessToken).toBe('mock-jwt-token');
      expect(result.refreshToken).toBeDefined();
      expect(typeof result.refreshToken).toBe('string');
      expect(result.user).toBeDefined();
    });

    it('should create a refresh token record in the database', async () => {
      await service.login(mockUser, '127.0.0.1', 'test-agent');
      expect(prisma.refreshToken.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'user-1',
          ipAddress: '127.0.0.1',
          userAgent: 'test-agent',
        }),
      });
    });

    it('should update lastLoginAt for the user', async () => {
      await service.login(mockUser, '127.0.0.1', 'test-agent');
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { lastLoginAt: expect.any(Date) },
      });
    });
  });

  describe('generateAccessToken', () => {
    it('should use 30m expiry for PRESTATAIRE role', () => {
      service.generateAccessToken({
        sub: '1',
        email: 'a@b.fr',
        role: UserRole.PRESTATAIRE,
      });
      expect(jwtService.sign).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ expiresIn: '30m' }),
      );
    });

    it('should use default expiry for ADMIN role', () => {
      service.generateAccessToken({
        sub: '1',
        email: 'a@b.fr',
        role: UserRole.ADMIN,
      });
      expect(jwtService.sign).toHaveBeenCalledWith(
        expect.objectContaining({ role: 'ADMIN' }),
      );
      // Should NOT pass custom expiresIn
      expect(jwtService.sign).not.toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ expiresIn: '30m' }),
      );
    });

    it('should use default expiry for COLLABORATEUR role', () => {
      service.generateAccessToken({
        sub: '1',
        email: 'a@b.fr',
        role: UserRole.COLLABORATEUR,
      });
      // Called with just the payload, no options override
      expect(jwtService.sign).toHaveBeenCalledWith(
        expect.objectContaining({ role: 'COLLABORATEUR' }),
      );
    });
  });

  describe('refreshTokens', () => {
    it('should throw for invalid refresh token', async () => {
      prisma.refreshToken.findFirst.mockResolvedValue(null);
      await expect(
        service.refreshTokens('invalid-token', '127.0.0.1', 'agent'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw for deactivated user on refresh', async () => {
      prisma.refreshToken.findFirst.mockResolvedValue({
        id: 'rt-1',
        user: { ...mockUser, isActive: false },
      });
      await expect(
        service.refreshTokens('valid-token', '127.0.0.1', 'agent'),
      ).rejects.toThrow(/deactivated|désactivé/i);
    });
  });

  describe('logout', () => {
    it('should revoke the refresh token', async () => {
      await service.logout('user-1', 'some-token');
      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: expect.objectContaining({
          userId: 'user-1',
          revokedAt: null,
        }),
        data: { revokedAt: expect.any(Date) },
      });
    });
  });

  describe('requestPasswordReset', () => {
    it('should return success message even when user not found (no enumeration)', async () => {
      prisma.user.findFirst.mockResolvedValue(null);
      const result = await service.requestPasswordReset('unknown@omnitech.fr');
      expect(result.message).toContain('adresse');
    });

    it('should create a reset token for existing user', async () => {
      prisma.user.findFirst.mockResolvedValue(mockUser);
      const result = await service.requestPasswordReset('test@omnitech.fr');
      expect(result.message).toBeDefined();
      expect(prisma.refreshToken.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'user-1',
          userAgent: 'PASSWORD_RESET',
        }),
      });
    });
  });

  describe('resetPasswordWithToken', () => {
    it('should throw for invalid reset token', async () => {
      prisma.refreshToken.findFirst.mockResolvedValue(null);
      await expect(
        service.resetPasswordWithToken('bad-token', 'NewPass123!'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should update password and revoke all tokens', async () => {
      prisma.refreshToken.findFirst.mockResolvedValue({
        id: 'rt-1',
        userId: 'user-1',
        user: mockUser,
      });
      prisma.user.update.mockResolvedValue(mockUser);
      prisma.refreshToken.update.mockResolvedValue({});
      prisma.refreshToken.updateMany.mockResolvedValue({});

      const result = await service.resetPasswordWithToken(
        'valid-token',
        'NewSecurePass123!',
      );
      expect(result.message).toContain('succès');
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { passwordHash: expect.any(String) },
      });
      // Should revoke ALL refresh tokens
      expect(prisma.refreshToken.updateMany).toHaveBeenCalled();
    });

    it('should reject weak password (no uppercase)', async () => {
      prisma.refreshToken.findFirst.mockResolvedValue({
        id: 'rt-1',
        userId: 'user-1',
        user: mockUser,
      });
      await expect(
        service.resetPasswordWithToken('valid-token', 'weakpassword1!'),
      ).rejects.toThrow(/majuscule/i);
    });

    it('should reject password shorter than 12 chars', async () => {
      prisma.refreshToken.findFirst.mockResolvedValue({
        id: 'rt-1',
        userId: 'user-1',
        user: mockUser,
      });
      await expect(
        service.resetPasswordWithToken('valid-token', 'Short1!'),
      ).rejects.toThrow(/12 caractères/i);
    });
  });

  describe('MFA flow', () => {
    it('should return user with mfaEnabled flag when MFA is active', async () => {
      const mfaUser = { ...mockUser, mfaEnabled: true, mfaSecret: 'secret123' };
      usersService.findByEmail.mockResolvedValue(mfaUser);
      const result = await service.validateUser('test@omnitech.fr', 'TestPass123!');
      expect(result.mfaEnabled).toBe(true);
      expect(result.mfaSecret).toBe('secret123');
    });

    it('should strip mfaSecret from login response', async () => {
      const mfaUser = { ...mockUser, mfaEnabled: true, mfaSecret: 'secret123' };
      usersService.findById.mockResolvedValue(mfaUser);
      const result = await service.login(mockUser, '127.0.0.1', 'test-agent');
      expect(result.user).not.toHaveProperty('mfaSecret');
      expect(result.user).not.toHaveProperty('passwordHash');
    });

    it('should strip mfaSecret from refreshTokens response', async () => {
      prisma.refreshToken.findFirst.mockResolvedValue({
        id: 'rt-1',
        user: { ...mockUser, mfaEnabled: true, mfaSecret: 'secret123' },
      });
      const result = await service.refreshTokens('valid-token', '127.0.0.1', 'agent');
      expect(result.user).not.toHaveProperty('mfaSecret');
      expect(result.user).not.toHaveProperty('passwordHash');
    });
  });
});
