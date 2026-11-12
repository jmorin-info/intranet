import {
  Controller,
  ExecutionContext,
  Get,
  INestApplication,
  UseGuards,
} from '@nestjs/common';
import { APP_GUARD, Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../../prisma/prisma.service';
import { CacheService } from '../../common/cache/cache.service';
import { UserRole } from '../../common/enums';
import { MfaRequiredGuard } from '../../mfa/mfa-required.guard';
import { FreshMfaGuard } from '../../mfa/fresh-mfa.guard';
import { RequireFreshMfa } from '../../mfa/decorators/require-fresh-mfa.decorator';
import { SkipMfaCheck } from '../../mfa/decorators/skip-mfa-check.decorator';
import { Public } from '../decorators/public.decorator';
import { JwtStrategy } from '../strategies/jwt.strategy';
import { JwtAuthGuard } from './jwt-auth.guard';
import { PreMfaAuthGuard } from './pre-mfa-auth.guard';

@Controller('method-guarded')
class MethodGuardedController {
  @Get('private')
  @UseGuards(JwtAuthGuard)
  privateRoute() { return { ok: true }; }

  @Get('sensitive')
  @UseGuards(JwtAuthGuard)
  @RequireFreshMfa()
  sensitiveRoute() { return { ok: true }; }

  @Get('enrollment')
  @UseGuards(JwtAuthGuard)
  @SkipMfaCheck()
  enrollmentRoute() { return { ok: true }; }

  @Get('public')
  @UseGuards(JwtAuthGuard)
  @Public()
  publicRoute() { return { ok: true }; }

  @Get('independently-authenticated')
  independentRoute() { return { ok: true }; }
}

@Controller('class-guarded')
@UseGuards(JwtAuthGuard)
class ClassGuardedController {
  @Get('private')
  privateRoute() { return { ok: true }; }

  @Get('public')
  @Public()
  publicRoute() { return { ok: true }; }
}

describe('JWT authentication before global MFA policies', () => {
  const secret = 'test-only-secret-for-mfa-order-regression';
  const oldSecret = process.env.JWT_ACCESS_SECRET;
  const jwt = new JwtService({ secret });
  let app: INestApplication;
  let baseUrl: string;
  let account: any;

  function token(extra: Record<string, unknown> = {}) {
    return jwt.sign({
      sub: 'user-1',
      email: 'user@example.test',
      role: UserRole.COLLABORATEUR,
      ...extra,
    }, { expiresIn: '5m' });
  }

  async function get(path: string, accessToken?: string) {
    const response = await fetch(`${baseUrl}/${path}`, {
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
    });
    const body = await response.json() as { code?: string };
    return { status: response.status, body };
  }

  beforeAll(async () => {
    process.env.JWT_ACCESS_SECRET = secret;
    const prisma = {
      user: {
        findUnique: jest.fn(async () => account),
      },
    };
    const module = await Test.createTestingModule({
      imports: [PassportModule.register({ defaultStrategy: 'jwt' })],
      controllers: [MethodGuardedController, ClassGuardedController],
      providers: [
        JwtStrategy,
        { provide: PrismaService, useValue: prisma },
        { provide: CacheService, useValue: {
          get: jest.fn().mockResolvedValue(null),
          set: jest.fn().mockResolvedValue(undefined),
        } },
        { provide: APP_GUARD, useClass: PreMfaAuthGuard },
        { provide: APP_GUARD, useClass: MfaRequiredGuard },
        { provide: APP_GUARD, useClass: FreshMfaGuard },
      ],
    }).compile();
    app = module.createNestApplication();
    app.useLogger(false);
    await app.listen(0, '127.0.0.1');
    baseUrl = await app.getUrl();
  });

  beforeEach(() => {
    account = {
      id: 'user-1', email: 'user@example.test', role: UserRole.COLLABORATEUR,
      isActive: true, deletedAt: null, departmentId: null,
      mfaRequired: true, mfaEnabled: false,
      _count: { webauthnCredentials: 0 },
    };
  });

  afterAll(async () => {
    await app?.close();
    if (oldSecret === undefined) delete process.env.JWT_ACCESS_SECRET;
    else process.env.JWT_ACCESS_SECRET = oldSecret;
  });

  it.each(['method-guarded/private', 'class-guarded/private'])(
    'blocks unenrolled users after JWT resolution on %s', async (path) => {
      const response = await get(path, token());
      expect(response.status).toBe(403);
      expect(response.body.code).toBe('MFA_SETUP_REQUIRED');
    },
  );

  it.each(['method-guarded/public', 'class-guarded/public', 'method-guarded/independently-authenticated'])(
    'preserves public or independently authenticated route %s', async (path) => {
      expect((await get(path)).status).toBe(200);
    },
  );

  it('keeps the enrollment route accessible with a valid JWT', async () => {
    expect((await get('method-guarded/enrollment', token())).status).toBe(200);
  });

  it('still rejects a guarded route without a JWT', async () => {
    expect((await get('method-guarded/private')).status).toBe(401);
  });

  it.each([true, false])('requires a fresh MFA claim for TOTP=%s', async (totp) => {
    account.mfaEnabled = totp;
    account._count.webauthnCredentials = totp ? 0 : 1;
    const response = await get('method-guarded/sensitive', token());
    expect(response.status).toBe(403);
    expect(response.body.code).toBe('MFA_REVALIDATION_REQUIRED');
  });

  it('permits a sensitive request with a fresh MFA validation', async () => {
    account.mfaEnabled = true;
    expect((await get('method-guarded/sensitive', token({ mfaValidatedAt: Date.now() }))).status).toBe(200);
  });

  it('does not run HTTP authentication on a non-HTTP context', () => {
    const guard = new PreMfaAuthGuard(new Reflector());
    expect(guard.canActivate({ getType: () => 'ws' } as ExecutionContext)).toBe(true);
  });
});
