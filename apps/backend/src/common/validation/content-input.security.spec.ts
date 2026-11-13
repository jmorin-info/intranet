import { QuizService } from '../../quiz/quiz.service';
import { HelpdeskService } from '../../helpdesk/helpdesk.service';
import { MentionsService } from '../../mentions/mentions.service';
import { SignaturesService } from '../../signatures/signatures.service';
import { OfficeController } from '../../office/office.controller';

describe('HTTP and JSON shape validation at service boundaries', () => {
  const db = { appConfig: { upsert: jest.fn(), findUnique: jest.fn().mockResolvedValue(null) } };
  beforeEach(() => jest.clearAllMocks());
  it('rejects non-array quiz payloads and invalid option indices before persisting', async () => {
    const service = new QuizService(db as any, {} as any);
    for (const value of ['question', { length: 1 }, null, [{ id: 'q', question: 'Question', options: ['a', 'b'], correctIndex: '0' }]]) await expect(service.updateQuestions(value)).rejects.toMatchObject({ status: 400 });
    expect(db.appConfig.upsert).not.toHaveBeenCalled();
    await expect(service.updateQuestions([{ id: 'q', question: 'Question', options: ['a', 'b'], correctIndex: 0 }])).resolves.toMatchObject({ count: 1 });
  });
  it('rejects fake KB arrays and nested non-string fields before persisting', async () => {
    const service = new HelpdeskService(db as any);
    for (const value of ['article', { length: 1 }, [{ keywords: ['vpn'], question: ['tampered'], answer: 'answer' }], [{ keywords: 'vpn', question: 'Question', answer: 'answer' }]]) await expect(service.updateKnowledgeBase(value)).rejects.toMatchObject({ status: 400 });
    expect(db.appConfig.upsert).not.toHaveBeenCalled();
    await expect(service.searchKnowledgeBase(['vpn'] as any)).rejects.toMatchObject({ status: 400 });
    expect(db.appConfig.findUnique).not.toHaveBeenCalled();
  });
  it('rejects mention text arrays and objects before resolving users or producing notifications', async () => {
    const prisma = { user: { findMany: jest.fn() } }; const notifications = { create: jest.fn() };
    const service = new MentionsService(prisma as any, notifications as any);
    for (const text of [[], ['@user'], { length: 1, slice: () => 'tampered' }, 42]) await expect(service.parseAndNotify({ text } as any)).rejects.toMatchObject({ status: 400 });
    expect(prisma.user.findMany).not.toHaveBeenCalled(); expect(notifications.create).not.toHaveBeenCalled();
  });
  it('refuses non-scalar file tokens before JWT processing', async () => {
    const office = { verifyFileAccessToken: jest.fn() }; const controller = new OfficeController(office as any);
    for (const token of [['signed'], { length: 1 }, '']) await expect(controller.downloadFile(token as any, { headers: {} } as any, {} as any)).rejects.toMatchObject({ status: 400 });
    expect(office.verifyFileAccessToken).not.toHaveBeenCalled();
  });
  it('uses only numeric DocuSeal IDs and disables redirects that could forward API credentials', async () => {
    const service = new SignaturesService({} as any, {} as any, {} as any); const originalFetch = global.fetch;
    const fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ id: 123 }) }); global.fetch = fetch;
    try {
      for (const id of ['../templates', '1?redirect=x', '//other-host', ['123'] as any, '9007199254740992']) await expect(service.getSubmission(id)).rejects.toMatchObject({ status: 400 });
      expect(fetch).not.toHaveBeenCalled(); await expect(service.getSubmission('123')).resolves.toEqual({ id: 123 });
      expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/submissions/123'), expect.objectContaining({ redirect: 'error' }));
    } finally { global.fetch = originalFetch; }
  });
});
