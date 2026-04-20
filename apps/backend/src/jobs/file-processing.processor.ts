import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import sharp from 'sharp';
import * as fs from 'fs';
import * as path from 'path';
import { StorageService } from '../storage/storage.service';

interface FileProcessingJobData {
  fileUrl: string;
  documentId: string;
  versionId: string;
}

@Processor('file-processing')
export class FileProcessingProcessor extends WorkerHost {
  private readonly logger = new Logger(FileProcessingProcessor.name);

  constructor(private readonly storageService: StorageService) {
    super();
  }

  async process(job: Job<FileProcessingJobData>): Promise<any> {
    const { fileUrl, documentId, versionId } = job.data;
    this.logger.log(
      `Generating thumbnail for version ${versionId} of document ${documentId}`,
    );

    try {
      const filePath = this.storageService.getFilePath(fileUrl);

      if (!fs.existsSync(filePath)) {
        this.logger.warn(`File not found: ${filePath}`);
        return null;
      }

      const ext = path.extname(filePath).toLowerCase();
      const thumbnailDir = path.join(
        path.dirname(filePath),
        'thumbnails',
      );

      if (!fs.existsSync(thumbnailDir)) {
        fs.mkdirSync(thumbnailDir, { recursive: true });
      }

      const thumbnailPath = path.join(
        thumbnailDir,
        `${path.basename(filePath, ext)}-thumb.png`,
      );

      // For image files, generate a thumbnail directly
      if (['.png', '.jpg', '.jpeg', '.gif', '.webp', '.tiff'].includes(ext)) {
        await sharp(filePath)
          .resize(300, 400, { fit: 'inside', withoutEnlargement: true })
          .png()
          .toFile(thumbnailPath);

        this.logger.log(`Thumbnail generated: ${thumbnailPath}`);
        return thumbnailPath;
      }

      // For PDF files, generate a placeholder thumbnail
      if (ext === '.pdf') {
        // Create a simple placeholder image for PDF
        const svgBuffer = Buffer.from(
          `<svg width="300" height="400" xmlns="http://www.w3.org/2000/svg">
            <rect width="300" height="400" fill="#f0f0f0" rx="8"/>
            <text x="150" y="180" text-anchor="middle" font-family="Arial" font-size="40" fill="#cc0000">PDF</text>
            <text x="150" y="230" text-anchor="middle" font-family="Arial" font-size="14" fill="#666">${path.basename(filePath)}</text>
          </svg>`,
        );

        await sharp(svgBuffer).png().toFile(thumbnailPath);

        this.logger.log(`PDF placeholder thumbnail generated: ${thumbnailPath}`);
        return thumbnailPath;
      }

      this.logger.log(
        `No thumbnail generation supported for file type: ${ext}`,
      );
      return null;
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error(
        `Failed to generate thumbnail: ${err.message}`,
        err.stack,
      );
      throw error;
    }
  }
}
