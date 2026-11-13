import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { createHmac, randomBytes, randomUUID } from 'crypto';
import { WorkflowController } from './workflow.controller';
import { WorkflowService } from './workflow.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';

describe('signed workflow email page HTML boundary', () => {
  const oldEnv = { ...process.env };
  const secret = randomBytes(48).toString('hex');
  let app: INestApplication;
  let baseUrl: string;
  const workflow = { approveReview: jest.fn(), rejectReview: jest.fn() };
  const docId = randomUUID(), userId = randomUUID();
  const sign = (action: string, ts: string, document: string = docId, user: string = userId) => createHmac('sha256', secret).update(`${action}:${document}:${user}:${ts}`).digest('hex');
  beforeAll(async () => {
    process.env.JWT_ACCESS_SECRET = secret; process.env.APP_URL = 'https://intranet.example.test';
    const module = await Test.createTestingModule({ controllers: [WorkflowController], providers: [{ provide: WorkflowService, useValue: workflow }] })
      .overrideGuard(JwtAuthGuard).useValue({ canActivate: () => true }).overrideGuard(RolesGuard).useValue({ canActivate: () => true }).compile();
    app = module.createNestApplication(); app.useLogger(false); await app.listen(0, '127.0.0.1'); baseUrl = await app.getUrl();
  });
  beforeEach(() => { jest.clearAllMocks(); workflow.approveReview.mockResolvedValue({}); workflow.rejectReview.mockResolvedValue({}); process.env.APP_URL = 'https://intranet.example.test'; });
  afterAll(async () => { await app?.close(); process.env = oldEnv; });
  const request = (data: Record<string, string>) => fetch(`${baseUrl}/documents/email-action?${new URLSearchParams(data)}`);
  function params(action = 'approve', ts = Date.now().toString()) { return { action, docId, userId, ts, token: sign(action, ts) }; }

  it('preserves signed actions with a restrictive CSP and a validated escaped destination', async () => {
    const response = await request(params()); const body = await response.text();
    expect(response.status).toBe(200); expect(response.headers.get('content-type')).toContain('text/html');
    expect(response.headers.get('content-security-policy')).toContain("default-src 'none'");
    expect(response.headers.get('content-security-policy')).toContain("form-action 'self'");
    expect(response.headers.get('cache-control')).toBe('no-store'); expect(response.headers.get('referrer-policy')).toBe('no-referrer');
    expect(body).toContain(`href="https://intranet.example.test/documents/${docId}"`);
    expect(workflow.approveReview).toHaveBeenCalledWith(docId, userId, 'Approuvé par email');
  });
  it('does not interpolate exception HTML or internal details', async () => {
    workflow.approveReview.mockRejectedValue(new Error('<img src=x onerror=alert(document.cookie)> internal stack'));
    const response = await request(params()); const html = await response.text();
    expect(response.status).toBe(400); expect(html).not.toContain('<img'); expect(html).not.toContain('document.cookie'); expect(html).not.toContain('internal stack');
  });
  it('rejects a crafted expired document identifier before constructing HTML or deciding', async () => {
    const evil = '<svg onload=alert(1)>', ts = String(Date.now() - 73 * 3600_000);
    const response = await request({ ...params(), docId: evil, ts, token: sign('approve', ts, evil) });
    expect(response.status).toBe(400); expect(await response.text()).not.toContain('<svg'); expect(workflow.approveReview).not.toHaveBeenCalled();
  });
  it('a genuinely signed expired link is rejected with a safe document link', async () => {
    const response = await request(params('approve', String(Date.now() - 73 * 3600_000)));
    expect(response.status).toBe(403); expect(await response.text()).toContain('Lien expiré'); expect(workflow.approveReview).not.toHaveBeenCalled();
  });
  it.each(['javascript:alert(1)', 'data:text/html,test', 'https://user:password@example.test'])('rejects unsafe application origins: %s', async origin => {
    process.env.APP_URL = origin; const response = await request(params());
    expect(response.status).toBe(500); expect(workflow.approveReview).not.toHaveBeenCalled();
  });
  it('rejects duplicate query values, malformed timestamps and tampered signatures', async () => {
    const valid = params();
    const duplicate = await fetch(`${baseUrl}/documents/email-action?${new URLSearchParams(valid)}&docId=${docId}`);
    expect(duplicate.status).toBe(400);
    expect((await request({ ...valid, ts: valid.ts + 'junk' })).status).toBe(400);
    expect((await request({ ...valid, token: '0'.repeat(64) })).status).toBe(403);
    expect(workflow.approveReview).not.toHaveBeenCalled();
  });
});
