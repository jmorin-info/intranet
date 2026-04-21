import { ExecutionContext, NotFoundException } from '@nestjs/common';
import { ChatbotUnifiedGuard, isChatbotUnifiedEnabled } from './chatbot-unified.guard';

describe('ChatbotUnifiedGuard', () => {
  let guard: ChatbotUnifiedGuard;
  const mockCtx = {} as ExecutionContext;
  const savedEnv = process.env.CHATBOT_UNIFIED_ENABLED;

  beforeEach(() => {
    guard = new ChatbotUnifiedGuard();
  });

  afterEach(() => {
    if (savedEnv === undefined) {
      delete process.env.CHATBOT_UNIFIED_ENABLED;
    } else {
      process.env.CHATBOT_UNIFIED_ENABLED = savedEnv;
    }
  });

  it('blocks with NotFoundException when flag is undefined (default)', () => {
    delete process.env.CHATBOT_UNIFIED_ENABLED;
    expect(() => guard.canActivate(mockCtx)).toThrow(NotFoundException);
  });

  it('blocks with NotFoundException when flag is "false"', () => {
    process.env.CHATBOT_UNIFIED_ENABLED = 'false';
    expect(() => guard.canActivate(mockCtx)).toThrow(NotFoundException);
  });

  it('blocks when flag is empty string', () => {
    process.env.CHATBOT_UNIFIED_ENABLED = '';
    expect(() => guard.canActivate(mockCtx)).toThrow(NotFoundException);
  });

  it('allows when flag is "true"', () => {
    process.env.CHATBOT_UNIFIED_ENABLED = 'true';
    expect(guard.canActivate(mockCtx)).toBe(true);
  });

  it('allows when flag is "1"', () => {
    process.env.CHATBOT_UNIFIED_ENABLED = '1';
    expect(guard.canActivate(mockCtx)).toBe(true);
  });

  it('blocks when flag is an unexpected value (e.g. "yes")', () => {
    process.env.CHATBOT_UNIFIED_ENABLED = 'yes';
    expect(() => guard.canActivate(mockCtx)).toThrow(NotFoundException);
  });

  describe('isChatbotUnifiedEnabled()', () => {
    it('returns true/false consistent with the guard', () => {
      process.env.CHATBOT_UNIFIED_ENABLED = 'true';
      expect(isChatbotUnifiedEnabled()).toBe(true);
      process.env.CHATBOT_UNIFIED_ENABLED = 'false';
      expect(isChatbotUnifiedEnabled()).toBe(false);
      delete process.env.CHATBOT_UNIFIED_ENABLED;
      expect(isChatbotUnifiedEnabled()).toBe(false);
    });
  });
});
