import { Injectable, Logger } from '@nestjs/common';
import * as mammoth from 'mammoth';
import { StorageService } from '../storage/storage.service';

@Injectable()
export class TextExtractorService {
  private readonly logger = new Logger(TextExtractorService.name);

  constructor(private readonly storageService: StorageService) {}

  /**
   * Extract text content from a file given its storage URL and MIME type.
   * Returns null if extraction is not supported or fails.
   */
  async extractText(fileUrl: string, mimeType: string): Promise<string | null> {
    try {
      if (
        mimeType ===
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      ) {
        return await this.extractDocx(fileUrl);
      }

      if (mimeType === 'text/plain' || mimeType === 'text/csv') {
        return await this.extractPlainText(fileUrl);
      }

      if (mimeType === 'application/pdf') {
        this.logger.warn(
          `PDF text extraction not yet implemented — skipping ${fileUrl}`,
        );
        return null;
      }

      return null;
    } catch (err) {
      this.logger.error(
        `Failed to extract text from ${fileUrl} (${mimeType}): ${(err as Error).message}`,
      );
      return null;
    }
  }

  /** Collect a ReadStream into a Buffer. */
  private async streamToBuffer(fileUrl: string): Promise<Buffer> {
    const stream = this.storageService.getFileStream(fileUrl);
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }

  /** Extract raw text from a DOCX file using mammoth. */
  private async extractDocx(fileUrl: string): Promise<string | null> {
    const buffer = await this.streamToBuffer(fileUrl);
    const result = await mammoth.extractRawText({ buffer });
    const text = result.value?.trim();
    return text || null;
  }

  /** Read a plain text / CSV file as UTF-8. */
  private async extractPlainText(fileUrl: string): Promise<string | null> {
    const buffer = await this.streamToBuffer(fileUrl);
    const text = buffer.toString('utf-8').trim();
    return text || null;
  }
}
