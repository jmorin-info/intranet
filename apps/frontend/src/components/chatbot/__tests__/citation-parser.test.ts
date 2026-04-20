import { describe, it, expect } from 'vitest';
import {
  SOURCE_LABEL,
  SOURCE_ROUTE,
  buildCopyMarkdown,
  citationTitle,
  scoreToConfidence,
  truncateSnippet,
} from '../citation-parser';
import type { RagCitation } from '../types';

describe('citation-parser', () => {
  describe('truncateSnippet()', () => {
    it('returns short text unchanged', () => {
      expect(truncateSnippet('hello')).toBe('hello');
    });

    it('keeps a snippet within the window untouched', () => {
      const s = 'a'.repeat(120);
      expect(truncateSnippet(s)).toBe(s);
    });

    it('truncates at the last space before max and appends ellipsis', () => {
      const long = 'word '.repeat(50); // 250 chars
      const out = truncateSnippet(long, 100, 150);
      expect(out.length).toBeLessThanOrEqual(151);
      expect(out.endsWith('…')).toBe(true);
      // Must not contain partial words mid-cut like "wor" → check last full word
      // Between the last space and the ellipsis, we expect either nothing or a complete word
      const beforeEllipsis = out.slice(0, -1);
      // The cut happened at a space, so the stripped text shouldn't end with partial tokens
      expect(beforeEllipsis).toMatch(/word$|^$/);
    });

    it('truncates on a hard boundary when no space is near max', () => {
      const nospace = 'a'.repeat(200);
      const out = truncateSnippet(nospace, 100, 150);
      // No space to cut on → fall back to hard cut at max (150) + ellipsis
      expect(out.length).toBeLessThanOrEqual(151);
      expect(out.endsWith('…')).toBe(true);
    });

    it('collapses whitespace', () => {
      expect(truncateSnippet('a\n\nb\t c')).toBe('a b c');
    });

    it('handles missing input', () => {
      expect(truncateSnippet('')).toBe('');
      // @ts-expect-error intentional: runtime safety
      expect(truncateSnippet(null)).toBe('');
    });
  });

  describe('scoreToConfidence()', () => {
    it('clamps to [0, 100]', () => {
      expect(scoreToConfidence(1.5).percent).toBe(100);
      expect(scoreToConfidence(-0.1).percent).toBe(0);
    });

    it('labels by threshold', () => {
      expect(scoreToConfidence(0.8).tone).toBe('high');
      expect(scoreToConfidence(0.5).tone).toBe('medium');
      expect(scoreToConfidence(0.2).tone).toBe('low');
    });
  });

  describe('citationTitle()', () => {
    const base: RagCitation = {
      sourceType: 'DOCUMENT',
      sourceId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      chunkIndex: 0,
      snippet: '...',
      score: 0.7,
    };

    it('uses explicit title when present', () => {
      expect(citationTitle({ ...base, title: 'My Doc' })).toBe('My Doc');
    });

    it('falls back to type + short id', () => {
      expect(citationTitle(base)).toBe('Document aaaaaaaa');
    });

    it('trims whitespace titles', () => {
      expect(citationTitle({ ...base, title: '   ' })).toBe('Document aaaaaaaa');
    });
  });

  describe('SOURCE_LABEL / SOURCE_ROUTE', () => {
    it('covers all 5 source types', () => {
      const types = ['DOCUMENT', 'WIKI', 'PROCEDURE', 'RUNBOOK', 'FAQ'] as const;
      for (const t of types) {
        expect(SOURCE_LABEL[t]).toBeTruthy();
        expect(SOURCE_ROUTE[t]('x')).toMatch(/^\//);
      }
    });

    it('FAQ routes to helpdesk', () => {
      expect(SOURCE_ROUTE.FAQ('q-1')).toBe('/helpdesk/faq/q-1');
    });
  });

  describe('buildCopyMarkdown()', () => {
    const sources: RagCitation[] = [
      {
        sourceType: 'WIKI',
        sourceId: 'wiki-1',
        chunkIndex: 0,
        snippet: '...',
        score: 0.9,
        title: 'Guide onboarding',
      },
      {
        sourceType: 'PROCEDURE',
        sourceId: 'proc-1',
        chunkIndex: 2,
        snippet: '...',
        score: 0.7,
      },
    ];

    it('includes the question as blockquote', () => {
      const md = buildCopyMarkdown({
        question: 'Comment faire X ?',
        answer: 'Voici la réponse.',
        sources: [],
      });
      expect(md).toMatch(/^> Comment faire X \?/);
    });

    it('includes answer body', () => {
      const md = buildCopyMarkdown({
        question: 'Q',
        answer: 'Réponse détaillée.',
        sources: [],
      });
      expect(md).toContain('Réponse détaillée.');
    });

    it('appends a sources section with links', () => {
      const md = buildCopyMarkdown({
        question: 'Q',
        answer: 'A',
        sources,
      });
      expect(md).toContain('**Sources**');
      expect(md).toContain('1. [Wiki — Guide onboarding](/wiki/wiki-1)');
      // The 2nd source has no title → fallback title
      expect(md).toMatch(/2\. \[Procédure — Procédure proc-1\]\(\/procedures\/proc-1\)/);
    });

    it('omits the sources section when empty', () => {
      const md = buildCopyMarkdown({ question: 'Q', answer: 'A', sources: [] });
      expect(md).not.toContain('**Sources**');
    });

    it('appends confidence metadata when provided', () => {
      const md = buildCopyMarkdown({
        question: 'Q',
        answer: 'A',
        sources,
        confidencePercent: 82,
      });
      expect(md).toContain('Confiance retrieval : 82%');
    });
  });
});
