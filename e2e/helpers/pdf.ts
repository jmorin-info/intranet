import { createRequire } from 'node:module';
import path from 'node:path';

/** Parse compressed PDF streams with the same PDF.js dependency as the viewer. */
export async function extractPdfText(content: Buffer): Promise<string> {
  const frontend = createRequire(path.resolve(__dirname, '../../apps/frontend/package.json'));
  const viewer = createRequire(frontend.resolve('react-pdf'));
  const { getDocument } = await import(viewer.resolve('pdfjs-dist/legacy/build/pdf.mjs'));
  const document = await getDocument({ data: new Uint8Array(content), useSystemFonts: true }).promise;
  try {
    const pages: string[] = [];
    for (let number = 1; number <= document.numPages; number++) {
      const page = await document.getPage(number);
      const text = await page.getTextContent();
      pages.push(text.items.map((item: { str?: string }) => item.str || '').join(' '));
    }
    return pages.join('\n');
  } finally { await document.destroy(); }
}
