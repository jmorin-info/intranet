import { Injectable, Logger } from '@nestjs/common';
import * as mammoth from 'mammoth';
import { convert } from 'html-to-text';
import { throwIfAborted } from './reindex-safety';
import { StorageService } from '../storage/storage.service';

@Injectable()
export class TextExtractorService {
  private readonly logger = new Logger(TextExtractorService.name);

  constructor(private readonly storageService: StorageService) {}

  /**
   * Extract text content from a file given its storage URL and MIME type.
   * Returns null if extraction is not supported or fails.
   */
  async extractText(fileUrl: string, mimeType: string, signal?: AbortSignal): Promise<string | null> {
    throwIfAborted(signal);
    try {
      if (
        mimeType ===
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      ) {
        return await this.extractDocx(fileUrl, signal);
      }

      if (mimeType === 'text/html') {
        const html = await this.extractPlainText(fileUrl, signal);
        return html ? convert(html, { wordwrap: false, selectors: [{ selector: 'head', format: 'skip' }, { selector: 'script', format: 'skip' }, { selector: 'style', format: 'skip' }] }).trim() || null : null;
      }

      if (mimeType === 'text/plain' || mimeType === 'text/csv') {
        return await this.extractPlainText(fileUrl, signal);
      }

      if (mimeType === 'application/pdf') {
        this.logger.warn(
          `PDF text extraction not yet implemented — skipping ${fileUrl}`,
        );
        return null;
      }

      return null;
    } catch (err) {
      throwIfAborted(signal);
      this.logger.error(
        `Failed to extract text from ${fileUrl} (${mimeType}): ${(err as Error).message}`,
      );
      return null;
    }
  }

  /** Collect a ReadStream into a Buffer. */
  private async streamToBuffer(fileUrl: string, signal?: AbortSignal): Promise<Buffer> {
    const stream = this.storageService.getFileStream(fileUrl);
    const chunks: Buffer[] = [];
    let size = 0;
    const abort = () => stream.destroy(new Error("Text extraction cancelled"));
    signal?.addEventListener("abort", abort, { once: true });
    try {
      throwIfAborted(signal);
      for await (const chunk of stream) {
        throwIfAborted(signal);
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        size += buffer.length;
        if (size > 16 * 1024 * 1024) throw new Error("RAG extraction exceeds 16 MiB");
        chunks.push(buffer);
      }
      return Buffer.concat(chunks);
    } finally { signal?.removeEventListener("abort", abort); stream.destroy(); }
  }

  /** Extract raw text from a DOCX file using mammoth. */
  private async extractDocx(fileUrl: string, signal?: AbortSignal): Promise<string | null> {
    const buffer = await this.streamToBuffer(fileUrl, signal);
    const result = await mammoth.extractRawText({ buffer });
    throwIfAborted(signal);
    const text = result.value?.trim();
    return text || null;
  }

  /** Read a plain text / CSV file as UTF-8. */
  private async extractPlainText(fileUrl: string, signal?: AbortSignal): Promise<string | null> {
    const buffer = await this.streamToBuffer(fileUrl, signal);
    const text = buffer.toString('utf-8').trim();
    return text || null;
  }
}
