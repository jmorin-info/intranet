import { UnauthorizedException } from '@nestjs/common';
import { UserRole } from '../../common/enums';
import { JwtStrategy } from './jwt.strategy';

describe('JwtStrategy current account state', () => {
  const secretBefore = process.env.JWT_ACCESS_SECRET;
  let strategy: JwtStrategy;
  let prisma: any;
  let cache: any;

  beforeAll(() => {
    process.env.JWT_ACCESS_SECRET = 'test-only-jwt-secret-for-strategy-regressions';
  });

  afterAll(() => {
    if (secretBefore === undefined) delete process.env.JWT_ACCESS_SECRET;
    else process.env.JWT_ACCESS_SECRET = secretBefore;
  });

  beforeEach(() => {
    prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'user-1',
          email: 'user@example.test',
          role: UserRole.COLLABORATEUR,
          departmentId: 'current-department',
          isActive: true,
          deletedAt: null,
        }),
      },
    };
    cache = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue(undefined),
    };
    strategy = new JwtStrategy(prisma, cache);
  });

  it('applies a role downgrade immediately to an existing administrator JWT', async () => {
    const user = await strategy.validate({
      sub: 'user-1',
      email: 'old@example.test',
      role: UserRole.ADMIN,
      departmentId: 'old-department',
    });

    expect(user).toMatchObject({
      id: 'user-1',
      email: 'user@example.test',
      role: UserRole.COLLABORATEUR,
      departmentId: 'current-department',
    });
  });

  it('propagates the signed session id for session-scoped MFA revalidation', async () => {
    const user = await strategy.validate({
      sub: 'user-1', email: 'user@example.test', role: UserRole.COLLABORATEUR,
      sid: 'session-a',
    });
    expect(user.sid).toBe('session-a');
  });

  it('accepts an existing JWT without a session id without inventing one', async () => {
    const user = await strategy.validate({
      sub: 'user-1', email: 'user@example.test', role: UserRole.COLLABORATEUR,
    });
    expect(user.sid).toBeUndefined();
  });

  it.each([
    null,
    { id: 'user-1', isActive: false, deletedAt: null },
    { id: 'user-1', isActive: true, deletedAt: new Date() },
  ])('rejects an absent, disabled, or deleted account', async (user) => {
    prisma.user.findUnique.mockResolvedValue(user);

    await expect(
      strategy.validate({ sub: 'user-1', email: 'user@example.test', role: UserRole.ADMIN }),
    ).rejects.toThrow(UnauthorizedException);
  });
});
