import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { MediaType } from '@prisma/client';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { createReadStream, statSync } from 'fs';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequestUser } from '../common/interfaces';
import { MediaService } from './media.service';
import { CreateAlbumDto, UpdateAlbumDto, UpdateItemDto } from './dto/media.dto';

const MAX_FILE_SIZE = 10 * 1024 * 1024 * 1024; // 10 Go

@Controller('media')
@UseGuards(JwtAuthGuard)
export class MediaController {
  constructor(private readonly service: MediaService) {}

  // ---- Albums ----
  @Get('albums')
  listAlbums(@CurrentUser() user: RequestUser) {
    return this.service.listAlbums(user);
  }

  @Get('albums/:slug')
  getAlbumBySlug(@Param('slug') slug: string, @CurrentUser() user: RequestUser) {
    return this.service.getAlbumBySlug(slug, user);
  }

  @Post('albums')
  createAlbum(@Body() dto: CreateAlbumDto, @CurrentUser() user: RequestUser) {
    return this.service.createAlbum(user, dto);
  }

  @Patch('albums/:id')
  updateAlbum(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAlbumDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.updateAlbum(user, id, dto);
  }

  @Delete('albums/:id')
  deleteAlbum(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: RequestUser) {
    return this.service.deleteAlbum(user, id);
  }

  // ---- Items ----

  /** Liste flat de tous les médias visibles (vue galerie globale). */
  @Get('items')
  listAllItems(
    @CurrentUser() user: RequestUser,
    @Query('type') type?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    const typeFilter = type === 'IMAGE' || type === 'VIDEO' ? (type as MediaType) : undefined;
    return this.service.listAllItems(user, {
      type: typeFilter,
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
    });
  }

  @Post('albums/:id/items')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MAX_FILE_SIZE },
    }),
  )
  uploadItem(
    @Param('id', ParseUUIDPipe) albumId: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: RequestUser,
  ) {
    if (!file) throw new BadRequestException('Fichier manquant (champ "file").');
    return this.service.uploadItem(user, albumId, file);
  }

  @Patch('items/:id')
  updateItem(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateItemDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.updateItem(user, id, dto);
  }

  @Delete('items/:id')
  deleteItem(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: RequestUser) {
    return this.service.deleteItem(user, id);
  }

  /** Thumbnail (WebP). Servi inline avec cache 1h. */
  @Get('items/:id/thumb')
  async serveThumb(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: RequestUser,
    @Res() res: Response,
  ) {
    const { path: filePath, mime } = await this.service.getItemFilePath(id, user, 'thumb');
    res.setHeader('Content-Type', mime);
    res.setHeader('Cache-Control', 'private, max-age=3600');
    createReadStream(filePath).pipe(res);
  }

  /** Fichier original (image ou vidéo). Servi inline avec support range (vidéos). */
  @Get('items/:id/file')
  async serveFile(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: RequestUser,
    @Res() res: Response,
  ) {
    const { path: filePath, mime } = await this.service.getItemFilePath(id, user, 'file');
    const stat = statSync(filePath);
    const range = res.req.headers.range;

    res.setHeader('Content-Type', mime);
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Cache-Control', 'private, max-age=3600');

    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0] ?? '0', 10);
      const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;
      const chunkSize = end - start + 1;
      res.status(206);
      res.setHeader('Content-Range', `bytes ${start}-${end}/${stat.size}`);
      res.setHeader('Content-Length', chunkSize);
      createReadStream(filePath, { start, end }).pipe(res);
    } else {
      res.setHeader('Content-Length', stat.size);
      createReadStream(filePath).pipe(res);
    }
  }

  /** Téléchargement (force Content-Disposition attachment + log analytics). */
  @Get('items/:id/download')
  async download(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: RequestUser,
    @Res() res: Response,
  ) {
    const { path: filePath, filename, mime } = await this.service.downloadItem(user, id);
    res.setHeader('Content-Type', mime);
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
    createReadStream(filePath).pipe(res);
  }

  // ---- Stats (managers) ----

  @Get('stats')
  stats(@CurrentUser() user: RequestUser) {
    return this.service.getGlobalStats(user);
  }
}
