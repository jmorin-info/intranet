import { createHash, randomUUID } from 'crypto';
import { BadRequestException } from '@nestjs/common';
import { HibpService } from './hibp.service';

describe('HIBP k-anonymity protocol uses SHA1 only for prefix lookup', () => {
  const envBefore = { ...process.env };
  const fetchBefore = global.fetch;
  afterEach(() => { process.env = { ...envBefore }; global.fetch = fetchBefore; jest.restoreAllMocks(); });
  function fixture(count = 101) {
    const password = randomUUID() + randomUUID();
    const fullHash = createHash('sha1').update(password).digest('hex').toUpperCase();
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, text: async () => `${'F'.repeat(35)}:0\r\n${fullHash.slice(5)}:${count}\r\n` });
    global.fetch = fetchMock;
    process.env.HIBP_ENABLED = 'true'; process.env.HIBP_THRESHOLD = '100';
    return { password, fullHash, fetchMock, service: new HibpService() };
  }
  it('sends only a five-character prefix over HTTPS with padding, never password/fullhash/suffix', async () => {
    const { password, fullHash, fetchMock, service } = fixture();
    expect(await service.isPasswordPwned(password)).toEqual({ pwned: true, count: 101 });
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe(`https://api.pwnedpasswords.com/range/${fullHash.slice(0, 5)}`);
    expect(options.headers['Add-Padding']).toBe('true');
    const request = JSON.stringify([url, options]);
    for (const privatePart of [password, fullHash, fullHash.slice(5)]) expect(request).not.toContain(privatePart);
    expect(options.body).toBeUndefined();
  });
  it('keeps the existing configured rejection threshold', async () => {
    const over = fixture(101); await expect(over.service.assertPasswordNotPwned(over.password)).rejects.toThrow(BadRequestException);
    const equal = fixture(100); await expect(equal.service.assertPasswordNotPwned(equal.password)).resolves.toBeUndefined();
  });
  it('does not send any request when disabled', async () => {
    const { password, fetchMock } = fixture(); process.env.HIBP_ENABLED = 'false';
    expect(await new HibpService().isPasswordPwned(password)).toEqual({ pwned: false, count: 0 });
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('preserves the explicitly documented external-outage policy without logging the password', async () => {
    const { password, fetchMock, service } = fixture(); fetchMock.mockRejectedValue(new Error('offline'));
    const warning = jest.spyOn((service as any).logger, 'warn').mockImplementation(() => undefined);
    expect(await service.isPasswordPwned(password)).toEqual({ pwned: false, count: 0 });
    expect(JSON.stringify(warning.mock.calls)).not.toContain(password);
  });
});
