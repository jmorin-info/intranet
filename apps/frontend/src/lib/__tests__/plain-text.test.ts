import { describe, expect, it } from 'vitest';
import { stripHtmlTags } from '../plain-text';
import { slugify } from '@omnitech/shared';

describe('Plain-text extraction for previews', () => {
  it('preserves ordinary text, Unicode and existing entities', () => {
    expect(stripHtmlTags('Équipe R&D &lt;exemple&gt;')).toBe('Équipe R&D &lt;exemple&gt;');
    expect(stripHtmlTags('<p>Bonjour <strong>équipe</strong></p>')).toBe('Bonjour équipe');
  });
  it('does not reconstruct markup from nested or incomplete opening tags', () => {
    for (const input of ['<<script>script>alert(1)<</script>/script>', '<img src=x onerror=alert(1)', '<svg><g/onload=alert(1)>']) {
      expect(stripHtmlTags(input)).not.toContain('<');
    }
    expect(stripHtmlTags('Avant<img src=x onerror=alert(1)')).toBe('Avant');
  });
  it('can separate words around markup without decoding entities into markup', () => {
    expect(stripHtmlTags('Avant<br>Après', true)).toBe('Avant Après');
    expect(stripHtmlTags('&lt;img src=x onerror=alert(1)&gt;')).toBe('&lt;img src=x onerror=alert(1)&gt;');
  });
  it('handles a long malformed sequence without repeated regular-expression scans', () => {
    expect(stripHtmlTags('<'.repeat(200_000))).toBe('');
  });
  it('fails safely for absent content', () => {
    expect(stripHtmlTags(undefined)).toBe('');
    expect(stripHtmlTags(null)).toBe('');
  });
  it('retains slug behaviour after separator compression', () => {
    expect(slugify('--- Café ___ sécurité ---')).toBe('cafe-securite');
    expect(slugify('-'.repeat(200_000))).toBe('');
  });
});
