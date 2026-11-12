import { NotificationsGateway } from './notifications.gateway';

describe('NotificationsGateway authentication', () => {
  let gateway: NotificationsGateway;
  let jwt: any;
  let prisma: any;
  let client: any;
  let payload: any;
  let user: any;

  beforeEach(() => {
    jest.useFakeTimers();
    payload = { sub: 'user-1', exp: Math.floor(Date.now() / 1000) + 60 };
    user = {
      id: 'user-1', isActive: true, deletedAt: null,
      mfaRequired: false, mfaEnabled: false,
      _count: { webauthnCredentials: 0 },
    };
    jwt = { verify: jest.fn(() => payload) };
    prisma = { user: { findUnique: jest.fn(async () => user) } };
    client = {
      handshake: { auth: { token: 'test-token' }, headers: {} },
      data: {},
      join: jest.fn().mockResolvedValue(undefined),
      disconnect: jest.fn(),
    };
    gateway = new NotificationsGateway(jwt, { setGateway: jest.fn() } as any, prisma);
  });

  afterEach(() => {
    gateway.handleDisconnect(client);
    jest.useRealTimers();
  });

  it('joins only the authenticated current account room', async () => {
    await gateway.handleConnection(client);
    expect(prisma.user.findUnique).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'user-1' },
    }));
    expect(client.join).toHaveBeenCalledWith('user-1');
    expect(client.disconnect).not.toHaveBeenCalled();
  });

  it.each(['missing', 'inactive', 'deleted', 'mfa-unenrolled'])(
    'rejects a %s account even with a correctly signed JWT', async (state) => {
      if (state === 'missing') user = null;
      if (state === 'inactive') user.isActive = false;
      if (state === 'deleted') user.deletedAt = new Date();
      if (state === 'mfa-unenrolled') user.mfaRequired = true;

      await gateway.handleConnection(client);

      expect(client.disconnect).toHaveBeenCalled();
      expect(client.join).not.toHaveBeenCalled();
    },
  );

  it('accepts required MFA satisfied by WebAuthn alone', async () => {
    user.mfaRequired = true;
    user._count.webauthnCredentials = 1;
    await gateway.handleConnection(client);
    expect(client.join).toHaveBeenCalledWith('user-1');
  });

  it('disconnects when the JWT expires', async () => {
    await gateway.handleConnection(client);
    jest.advanceTimersByTime(60_000);
    expect(client.disconnect).toHaveBeenCalledWith(true);
  });

  it('clears the expiry timer on disconnect', async () => {
    await gateway.handleConnection(client);
    gateway.handleDisconnect(client);
    jest.advanceTimersByTime(60_000);
    expect(client.disconnect).not.toHaveBeenCalled();
  });

  it.each([
    { sub: 'user-1' },
    { sub: 'user-1', exp: 0 },
    { sub: undefined, exp: Number.MAX_SAFE_INTEGER },
  ])('rejects incomplete or expired claims', async (claims) => {
    payload = claims;
    await gateway.handleConnection(client);
    expect(client.disconnect).toHaveBeenCalled();
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it.each(['inactive', 'deleted', 'mfa-unenrolled'])(
    'does not send a private notification after the account becomes %s', async (state) => {
      const emit = jest.fn();
      const disconnectSockets = jest.fn();
      gateway.server = {
        to: jest.fn(() => ({ emit })),
        in: jest.fn(() => ({ disconnectSockets })),
      } as any;
      await gateway.handleConnection(client);
      if (state === 'inactive') user.isActive = false;
      if (state === 'deleted') user.deletedAt = new Date();
      if (state === 'mfa-unenrolled') user.mfaRequired = true;
      await gateway.sendToUser('user-1', { body: 'private fixture' });
      expect(emit).not.toHaveBeenCalled();
      expect(disconnectSockets).toHaveBeenCalledWith(true);
    },
  );

  it('delivers notifications to an account whose access is still valid', async () => {
    const emit = jest.fn();
    gateway.server = { to: jest.fn(() => ({ emit })) } as any;
    const notification = { body: 'private fixture' };
    await gateway.sendToUser('user-1', notification);
    expect(gateway.server.to).toHaveBeenCalledWith('user-1');
    expect(emit).toHaveBeenCalledWith('notification', notification);
  });

  it('does not deliver private data when account verification fails', async () => {
    const emit = jest.fn();
    gateway.server = { to: jest.fn(() => ({ emit })) } as any;
    prisma.user.findUnique.mockRejectedValue(new Error('database unavailable'));
    await expect(gateway.sendToUser('user-1', {})).resolves.toBeUndefined();
    expect(emit).not.toHaveBeenCalled();
  });
});
