/**
 * Linear markup removal for plain-text fields, preserving encoded entities.
 * Discard an incomplete opening tag rather than returning a partial element.
 * This does not replace context escaping when text is inserted into HTML.
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
