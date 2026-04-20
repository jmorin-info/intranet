import { describe, it, expect } from 'vitest';
import {
  COMMENT_MAX_LENGTH,
  FEEDBACK_REASONS,
  serializeFeedback,
  validateFeedback,
} from '../feedback-validation';

describe('feedback-validation', () => {
  describe('validateFeedback()', () => {
    it('rejects missing reason', () => {
      const r = validateFeedback({ reason: null });
      expect(r.valid).toBe(false);
      expect(r.errorCode).toBe('REASON_REQUIRED');
    });

    it('rejects empty string reason', () => {
      const r = validateFeedback({ reason: '' });
      expect(r.valid).toBe(false);
      expect(r.errorCode).toBe('REASON_REQUIRED');
    });

    it('rejects unknown reason', () => {
      const r = validateFeedback({ reason: 'not_in_list' });
      expect(r.valid).toBe(false);
      expect(r.errorCode).toBe('REASON_INVALID');
    });

    it('accepts a valid reason without comment', () => {
      const r = validateFeedback({ reason: 'incorrecte' });
      expect(r.valid).toBe(true);
      expect(r.payload).toEqual({ reason: 'incorrecte', comment: undefined });
    });

    it('accepts a valid reason with comment (trimmed)', () => {
      const r = validateFeedback({ reason: 'manquante', comment: '  hello world  ' });
      expect(r.valid).toBe(true);
      expect(r.payload).toEqual({ reason: 'manquante', comment: 'hello world' });
    });

    it('rejects overly long comment (> 500 chars)', () => {
      const long = 'x'.repeat(COMMENT_MAX_LENGTH + 1);
      const r = validateFeedback({ reason: 'manquante', comment: long });
      expect(r.valid).toBe(false);
      expect(r.errorCode).toBe('COMMENT_TOO_LONG');
    });

    it('requires a comment when reason === "autre"', () => {
      const r = validateFeedback({ reason: 'autre', comment: '' });
      expect(r.valid).toBe(false);
      expect(r.errorCode).toBe('COMMENT_REQUIRED_FOR_OTHER');
    });

    it('requires comment >= 3 chars when reason === "autre"', () => {
      const r = validateFeedback({ reason: 'autre', comment: 'ok' });
      expect(r.valid).toBe(false);
      expect(r.errorCode).toBe('COMMENT_REQUIRED_FOR_OTHER');
    });

    it('accepts "autre" with a 3+ chars comment', () => {
      const r = validateFeedback({ reason: 'autre', comment: 'pas clair' });
      expect(r.valid).toBe(true);
      expect(r.payload?.comment).toBe('pas clair');
    });

    it('exposes exactly 7 standardized reasons (Feature 4 spec)', () => {
      expect(FEEDBACK_REASONS.length).toBe(7);
      expect(FEEDBACK_REASONS.map((r) => r.value).sort()).toEqual(
        [
          'autre',
          'erreurs_factuelles',
          'hors_sujet',
          'incorrecte',
          'manquante',
          'trop_court',
          'trop_long',
        ].sort(),
      );
    });
  });

  describe('serializeFeedback()', () => {
    it('serializes to JSON with reason + comment + version', () => {
      const str = serializeFeedback({ reason: 'hors_sujet', comment: 'off topic' });
      const parsed = JSON.parse(str);
      expect(parsed).toEqual({ reason: 'hors_sujet', comment: 'off topic', v: 1 });
    });

    it('handles absent comment', () => {
      const str = serializeFeedback({ reason: 'trop_long' });
      const parsed = JSON.parse(str);
      expect(parsed).toEqual({ reason: 'trop_long', comment: '', v: 1 });
    });
  });
});
