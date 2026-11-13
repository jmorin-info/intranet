import { Controller, Get, INestApplication, UseGuards } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { Test } from '@nestjs/testing';
import { hashSync } from 'bcrypt';
import { createHash, randomBytes, randomUUID } from 'crypto';
import cookieParser = require('cookie-parser');
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { UserThrottlerGuard } from './guards/user-throttler.guard';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { LdapService } from '../ldap/ldap.service';
import { AuditService } from '../audit/audit.service';
import { HibpService } from './hibp.service';
import { MfaService } from '../mfa/mfa.service';
import { WebAuthnService } from '../mfa/webauthn.service';
import { CacheService } from '../common/cache/cache.service';
import { UserRole } from '../common/enums';
import { createSessionRefreshToken, sessionRevocationId } from './session-refresh-token';

@Controller('session-probe')
class SessionProbeController {
  @Get()
  @UseGuards(JwtAuthGuard)
  read() { return { ok: true }; }
}

const digest = (token: string) => createHash('sha256').update(token).digest('hex');
const accessSecret = randomBytes(48).toString('hex');
const refreshSecret = randomBytes(48).toString('hex');

// The server uses the real controller, JwtService, AuthService and JwtStrategy.
// Only persistence and unrelated external services are in-memory test doubles.
describe('HTTP logout and rotation preserve revocation of one real issued session', () => {
  const oldEnvironment = { ...process.env };
  const account = { id: 'user-1', email: 'session@example.test', role: UserRole.COLLABORATEUR, firstName: 'Test', lastName: 'Session', passwordHash: hashSync('unit-account-password', 4), mfaEnabled: false, mfaSecret: null, isActive: true, deletedAt: null, departmentId: null };
  let app: INestApplication;
  let baseUrl: string;
  let service: AuthService;
  let strategy: JwtStrategy;
  let prisma: any;
  const rows = new Map<string, any>();
  const configs = new Map<string, any>();

  function matches(row: any, where: any): boolean {
    return (!where.id || row.id === where.id) && (!where.userId || row.userId === where.userId) && (!where.tokenHash || row.tokenHash === where.tokenHash) && (where.revokedAt !== null || row.revokedAt === null) && (!where.expiresAt?.gt || row.expiresAt > where.expiresAt.gt) && (!where.userAgent?.not || row.userAgent !== where.userAgent.not);
  }

  beforeAll(async () => {
    process.env.JWT_ACCESS_SECRET = accessSecret;
    process.env.JWT_REFRESH_SECRET = refreshSecret;
    process.env.NODE_ENV = 'test';
    prisma = {
      user: { findUnique: jest.fn(async () => account), update: jest.fn(async () => account) },
      refreshToken: {
        count: jest.fn(async () => 0),
        create: jest.fn(async ({ data }: any) => { const row = { revokedAt: null, ...data }; rows.set(row.id, row); return row; }),
        findFirst: jest.fn(async ({ where }: any) => { const row = [...rows.values()].find(row => matches(row, where)); return row ? { ...row, user: account } : null; }),
        updateMany: jest.fn(async ({ where, data }: any) => { const selected = [...rows.values()].filter(row => matches(row, where)); for (const row of selected) Object.assign(row, data); return { count: selected.length }; }),
        deleteMany: jest.fn(async () => ({ count: 0 })),
      },
      appConfig: {
        upsert: jest.fn(async ({ where, create, update }: any) => { const row = configs.has(where.key) ? { ...configs.get(where.key), ...update } : { ...create, updatedAt: new Date() }; configs.set(where.key, row); return row; }),
        findUnique: jest.fn(async ({ where }: any) => configs.get(where.key) || null),
        deleteMany: jest.fn(async () => ({ count: 0 })),
      },
      $transaction: jest.fn(async (operation: any) => operation(prisma)),
    };
    const module = await Test.createTestingModule({
      imports: [PassportModule.register({ defaultStrategy: 'jwt' })],
      controllers: [AuthController, SessionProbeController],
      providers: [AuthService, JwtStrategy,
        { provide: JwtService, useValue: new JwtService({ secret: accessSecret, signOptions: { expiresIn: '15m' } }) },
        { provide: PrismaService, useValue: prisma },
        { provide: UsersService, useValue: { findByEmail: async () => account, findById: async () => account } },
        { provide: LdapService, useValue: { authenticate: async () => null } },
        { provide: AuditService, useValue: { log: async () => undefined } },
        { provide: HibpService, useValue: {} },
        { provide: MfaService, useValue: {} },
        { provide: WebAuthnService, useValue: { hasCredentials: async () => false } },
        { provide: CacheService, useValue: { get: async () => null, set: async () => undefined } },
        { provide: APP_GUARD, useClass: JwtAuthGuard },
      ],
    }).overrideGuard(UserThrottlerGuard).useValue({ canActivate: () => true }).compile();
    app = module.createNestApplication(); app.useLogger(false); app.setGlobalPrefix('api/v1'); app.use(cookieParser());
    await app.listen(0, '127.0.0.1'); baseUrl = `${await app.getUrl()}/api/v1`;
    service = module.get(AuthService); strategy = module.get(JwtStrategy);
  });
  beforeEach(() => { rows.clear(); configs.clear(); jest.clearAllMocks(); });
  afterAll(async () => { await app?.close(); process.env = oldEnvironment; });

  async function login() {
    const response = await fetch(`${baseUrl}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: account.email, password: 'unit-account-password' }) });
    expect(response.status).toBe(200);
    const data = await response.json() as any;
    const headers = response.headers.getSetCookie();
    expect(headers.some(cookie => cookie.startsWith('refreshToken=') && cookie.includes('Path=/api/v1/auth;') && cookie.includes('HttpOnly') && cookie.includes('SameSite=Strict'))).toBe(true);
    expect(headers.some(cookie => cookie.startsWith('refreshToken=;') && cookie.includes('Path=/api/v1/auth/refresh;'))).toBe(true);
    return data;
  }
  async function post(path: string, cookie?: string, access?: string) {
    return fetch(`${baseUrl}/auth/${path}`, { method: 'POST', headers: { ...(cookie ? { Cookie: `refreshToken=${cookie}` } : {}), ...(access ? { Authorization: `Bearer ${access}` } : {}) } });
  }
  async function read(access: string) { return fetch(`${baseUrl}/session-probe`, { headers: { Authorization: `Bearer ${access}` } }); }

  it('logout revokes refresh and access immediately while another login stays usable', async () => {
    const first = await login(); const second = await login();
    expect((await read(first.accessToken)).status).toBe(200);
    expect((await post('logout', first.refreshToken)).status).toBe(200);
    expect((await post('refresh', first.refreshToken)).status).toBe(401);
    expect((await read(first.accessToken)).status).toBe(401);
    expect((await read(second.accessToken)).status).toBe(200);
    expect((await post('refresh', second.refreshToken)).status).toBe(200);
  });

  it('an access cookie alone revokes its verified sid, without the refresh-path cookie', async () => {
    const first = await login();
    expect((await post('logout', undefined, first.accessToken)).status).toBe(200);
    expect((await post('refresh', first.refreshToken)).status).toBe(401);
  });

  it('expired or absent access does not prevent logout through the legacy-path alias', async () => {
    const first = await login();
    expect((await post('refresh/logout', first.refreshToken, 'invalid-access-token')).status).toBe(200);
    expect((await post('refresh', first.refreshToken)).status).toBe(401);
    expect((await post('logout')).status).toBe(401);
  });

  it('an old rotated refresh can revoke only its own session but can never refresh again', async () => {
    const first = await login();
    const payload = new JwtService({ secret: accessSecret }).verify(first.accessToken);
    const original = rows.get(payload.sid); original.mfaValidatedAt = new Date('2026-01-01T00:00:00Z');
    const rotatedResponse = await post('refresh', first.refreshToken);
    expect(rotatedResponse.status).toBe(200);
    const rotated = await rotatedResponse.json() as any;
    expect(rotated.refreshToken).not.toBe(first.refreshToken);
    expect(new JwtService({ secret: accessSecret }).verify(rotated.accessToken).sid).toBe(payload.sid);
    expect(rows.get(payload.sid).mfaValidatedAt).toEqual(new Date('2026-01-01T00:00:00Z'));
    expect((await post('refresh', first.refreshToken)).status).toBe(401);
    expect((await post('refresh/logout', first.refreshToken)).status).toBe(200);
    expect((await post('refresh', rotated.refreshToken)).status).toBe(401);
    expect((await read(rotated.accessToken)).status).toBe(401);
  });

  it('a repeated logout remains idempotent after a lost successful response', async () => {
    const first = await login();
    expect((await post('refresh/logout', first.refreshToken)).status).toBe(200);
    expect((await post('refresh/logout', first.refreshToken)).status).toBe(200);
    expect((await read(first.accessToken)).status).toBe(401);
  });

  it('an actually expired access JWT may revoke its own session without refreshing it', async () => {
    const expiredIssuer = new AuthService(prisma, new JwtService({ secret: accessSecret, signOptions: { expiresIn: -1 } }), { findById: async () => account } as any, {} as any, { log: async () => undefined } as any, {} as any);
    const issued = await expiredIssuer.login(account, '127.0.0.1', 'browser');
    expect((await read(issued.accessToken)).status).toBe(401);
    expect((await post('logout', undefined, issued.accessToken)).status).toBe(200);
    expect((await post('refresh', issued.refreshToken)).status).toBe(401);
  });

  it('legacy UUID bridge survives a first rotation and never extends its original expiration', async () => {
    const id = randomUUID(), token = randomUUID(), expiresAt = new Date(Date.now() + 60_000);
    rows.set(id, { id, userId: account.id, tokenHash: digest(token), expiresAt, revokedAt: null, userAgent: 'legacy-browser', mfaValidatedAt: null });
    const rotated = await service.refreshTokens(token, '127.0.0.1', 'legacy-browser');
    const bridge = JSON.parse(configs.get(`auth.legacy-refresh.${digest(token)}`).value);
    expect(bridge).toEqual({ sessionId: id, userId: account.id, expiresAt: expiresAt.getTime() });
    expect((await post('refresh/logout', token)).status).toBe(200);
    expect((await post('refresh', rotated.refreshToken)).status).toBe(401);
  });

  it('an expired legacy migration bridge cannot revoke a later valid session', async () => {
    const id = randomUUID(), token = randomUUID();
    rows.set(id, { id, userId: account.id, tokenHash: digest(token), expiresAt: new Date(Date.now() + 60_000), revokedAt: null, userAgent: 'legacy-browser' });
    const rotated = await service.refreshTokens(token, '127.0.0.1', 'legacy-browser');
    const key = `auth.legacy-refresh.${digest(token)}`;
    const state = JSON.parse(configs.get(key).value); state.expiresAt = Date.now() - 1;
    configs.get(key).value = JSON.stringify(state);
    expect(await service.logoutSession(token, undefined)).toBe(false);
    expect((await post('refresh', rotated.refreshToken)).status).toBe(200);
  });

  it('logout winning the CAS prevents an in-flight rotation from reviving the session', async () => {
    const first = await login();
    const originalFind = prisma.refreshToken.findFirst.getMockImplementation();
    let release!: () => void; let selected!: () => void;
    const reached = new Promise<void>(resolve => { selected = resolve; });
    prisma.refreshToken.findFirst.mockImplementationOnce(async (args: any) => { const row = await originalFind(args); selected(); await new Promise<void>(resolve => { release = resolve; }); return row; });
    const rotating = service.refreshTokens(first.refreshToken, '127.0.0.1', 'browser');
    const rejected = expect(rotating).rejects.toThrow('Session expirée');
    await reached;
    expect(await service.logoutSession(first.refreshToken, undefined)).toBe(true);
    release(); await rejected;
    expect((await read(first.accessToken)).status).toBe(401);
  });

  it('rotation winning first still allows logout with the pre-rotation proof', async () => {
    const first = await login();
    const rotated = await service.refreshTokens(first.refreshToken, '127.0.0.1', 'browser');
    expect(await service.logoutSession(first.refreshToken, undefined)).toBe(true);
    await expect(strategy.validate(new JwtService({ secret: accessSecret }).verify(rotated.accessToken))).rejects.toThrow('Session expirée');
    await expect(service.refreshTokens(rotated.refreshToken, '127.0.0.1', 'browser')).rejects.toThrow('Session expirée');
  });
});

describe('refresh revocation capability is separate from an access JWT', () => {
  it('rejects modifications, another key, expiration and non-scalar input', () => {
    const id = randomUUID(), now = Date.now();
    const token = createSessionRefreshToken(id, refreshSecret, now);
    expect(sessionRevocationId(token, refreshSecret, now)).toBe(id);
    expect(sessionRevocationId(token, accessSecret, now)).toBeNull();
    expect(sessionRevocationId(token, refreshSecret, now + 7 * 24 * 60 * 60 * 1000)).toBeNull();
    for (const input of [null, {}, [token], token.replace(id, randomUUID()), token.slice(0, -1) + (token.endsWith('a') ? 'b' : 'a'), token + '.extra']) expect(sessionRevocationId(input, refreshSecret, now)).toBeNull();
    expect(() => new JwtService({ secret: accessSecret }).verify(token)).toThrow();
  });
});

 describe('production refresh signing material', () => {
  const previous = { ...process.env };
  afterEach(() => { process.env = { ...previous }; });
  it.each([undefined, 'short', 'example-'.repeat(8), 'change-me-'.repeat(8)])('rejects absent or weak refresh material at service initialization', value => {
    process.env.NODE_ENV = 'production';
    if (value === undefined) delete process.env.JWT_REFRESH_SECRET; else process.env.JWT_REFRESH_SECRET = value;
    expect(() => new AuthService({} as any, {} as any, {} as any, {} as any, {} as any, {} as any)).toThrow('JWT_REFRESH_SECRET');
  });
});
