import {
  Controller,
  Get,
  Param,
  Res,
  NotFoundException,
  BadRequestException,
  Query,
} from '@nestjs/common';
import { Response } from 'express';
import { StorageService } from './storage.service';
import { Public } from '../auth/decorators/public.decorator';
import * as path from 'path';

@Controller('storage')
export class StorageController {
  constructor(private readonly storageService: StorageService) {}

  @Public()
  @Get('news/:filename')
  async serveNewsImage(
    @Param('filename') filename: string,
    @Res() res: Response,
  ) {
    // Sanitize filename — only allow alphanumeric, dash, dot
    if (!/^[\w-]+\.(jpg|jpeg|png|webp|gif)$/i.test(filename)) {
      throw new BadRequestException('Invalid filename');
    }
    const filePath = path.resolve(process.cwd(), '..', '..', 'storage', 'news', filename);
    const fs = await import('fs');
    if (!fs.existsSync(filePath)) throw new NotFoundException('Image not found');
    const ext = path.extname(filename).toLowerCase();
    const mimeTypes: Record<string, string> = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif' };
    res.set({ 'Content-Type': mimeTypes[ext] || 'image/jpeg', 'Cache-Control': 'public, max-age=86400' });
    fs.createReadStream(filePath).pipe(res);
  }

  @Public()
  @Get('avatars/:filename')
  async serveAvatar(
    @Param('filename') filename: string,
    @Res() res: Response,
  ) {
    if (!/^[\w-]+\.(jpg|jpeg|png|webp)$/i.test(filename)) {
      throw new BadRequestException('Invalid filename');
    }
    const filePath = path.resolve(process.cwd(), '..', '..', 'storage', 'avatars', filename);
    const fs = await import('fs');
    if (!fs.existsSync(filePath)) throw new NotFoundException('Avatar not found');
    const ext = path.extname(filename).toLowerCase();
    const mimeTypes: Record<string, string> = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };
    res.set({ 'Content-Type': mimeTypes[ext] || 'image/jpeg', 'Cache-Control': 'public, max-age=86400' });
    fs.createReadStream(filePath).pipe(res);
  }

  @Public()
  @Get('download/:token')
  async download(
    @Param('token') token: string,
    @Query('expires') expires: string,
    @Query('signature') signature: string,
    @Res() res: Response,
  ) {
    if (!expires || !signature) {
      throw new BadRequestException('Missing signed URL parameters');
    }

    const signedUrl = `/storage/download/${token}?expires=${expires}&signature=${signature}`;
    const result = this.storageService.validateSignedUrl(signedUrl);

    if (!result.valid) {
      throw new BadRequestException('Invalid or expired download link');
    }

    try {
      const filePath = this.storageService.getFilePath(result.fileUrl);
      const fileName = path.basename(filePath);
      const stream = this.storageService.getFileStream(result.fileUrl);

      res.set({
        'Content-Disposition': `attachment; filename="${fileName}"`,
        'Content-Type': 'application/octet-stream',
        'Cache-Control': 'no-cache',
      });

      stream.pipe(res);
    } catch (error) {
      throw new NotFoundException('File not found');
    }
  }
}
