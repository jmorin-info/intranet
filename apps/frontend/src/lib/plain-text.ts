/**
 * Remove markup in one pass for text previews and counters. This is not an
 * HTML sanitizer: rendered rich text must still pass through DOMPurify.
 * Entities stay encoded, and an incomplete opening tag is discarded.
 */
export function stripHtmlTags(input: string | null | undefined, separateWords = false): string {
  if (typeof input !== 'string' || !input) return '';
  const parts: string[] = [];
  let textStart = 0;
  let inTag = false;
  for (let index = 0; index < input.length; index++) {
    if (!inTag && input[index] === '<') {
      parts.push(input.slice(textStart, index));
      if (separateWords) parts.push(' ');
      inTag = true;
    } else if (inTag && input[index] === '>') {
      inTag = false;
      textStart = index + 1;
    }
  }
  if (!inTag) parts.push(input.slice(textStart));
  return parts.join('');
}
