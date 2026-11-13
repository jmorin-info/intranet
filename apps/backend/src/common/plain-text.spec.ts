import { stripHtmlTags } from './plain-text';
import { sanitizePlainText } from './sanitize';

describe('Plain-text security boundaries', () => {
  it('preserves text and encoded entities without an additional decoding pass', () => {
    expect(stripHtmlTags('<p>Équipe R&D</p>')).toBe('Équipe R&D');
    expect(stripHtmlTags('&lt;script&gt;')).toBe('&lt;script&gt;');
    expect(stripHtmlTags('un<br>deux', true)).toBe('un deux');
  });
  it.each([
    '<<script>script>alert(1)<</script>/script>',
    '<img src=x onerror=alert(1)',
    '<svg><g/onload=alert(1)>',
    '<script><script>alert(1)</script></script>',
  ])('removes opening delimiters from malformed markup: %s', (input) => {
    expect(stripHtmlTags(input)).not.toContain('<');
    expect(sanitizePlainText(input)).not.toContain('<');
  });
  it('does not retain an unfinished element that a surrounding HTML template could complete', () => {
    expect(sanitizePlainText('Titre<img src=x onerror=alert(1)')).toBe('Titre');
  });
  it('does not perform quadratic scans over unclosed opening delimiters', () => {
    expect(sanitizePlainText('<'.repeat(200_000))).toBe('');
  });
});
