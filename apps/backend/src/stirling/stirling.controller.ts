import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequestUser } from '../common/interfaces';
import { StirlingService } from './stirling.service';

// 100 MB — aligned with Stirling's default upload cap. Bigger files should
// be uploaded directly on the Stirling UI (iframe fallback).
const STIRLING_MAX_UPLOAD = 100 * 1024 * 1024;

/**
 * HTTP surface exposed to the Next.js frontend for the Stirling PDF
 * integration. Lives behind JWT + Roles guards like every other module.
 *
 * Routes:
 *   GET  /stirling/status        -> health + config snapshot
 *   GET  /stirling/tools         -> curated tool catalogue
 *   POST /stirling/proxy/:toolId -> multipart proxy that forwards the
 *                                   uploaded file to Stirling and streams
 *                                   the result back to the browser.
 */
@Controller('stirling')
@UseGuards(JwtAuthGuard, RolesGuard)
export class StirlingController {
  constructor(private readonly stirlingService: StirlingService) {}

  @Get('status')
  async getStatus() {
    const health = await this.stirlingService.healthCheck();
    return {
      enabled: this.stirlingService.isEnabled(),
      // URL vue par le navigateur (sous-domaine public) ; le backend garde getBaseUrl() pour ses propres appels
      url: this.stirlingService.getPublicUrl(),
      ...health,
    };
  }

  @Get('tools')
  getTools() {
    return this.stirlingService.getAvailableTools();
  }

  /**
   * Generic proxy: accepts a single `file` multipart upload plus any
   * number of string fields (passed through as Stirling parameters),
   * forwards them to Stirling's REST API and streams the response back.
   */
  @Post('proxy/:toolId')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: STIRLING_MAX_UPLOAD },
    }),
  )
  async proxyTool(
    @Param('toolId') toolId: string,
    @UploadedFile() file: Express.Multer.File,
    @Body() body: Record<string, unknown>,
    @Res() res: Response,
    @CurrentUser() _user: RequestUser,
  ) {
    if (!this.stirlingService.isEnabled()) {
      throw new BadRequestException('Stirling PDF desactive');
    }

    const tool = this.stirlingService.findToolById(toolId);
    if (!tool) {
      throw new NotFoundException(`Outil Stirling inconnu: ${toolId}`);
    }
    if (!file) {
      throw new BadRequestException('Fichier requis');
    }

    // Build FormData for fetch. Stirling expects the uploaded file under
    // the `fileInput` field name for almost every endpoint.
    const formData = new FormData();
    // `Uint8Array` is a valid BlobPart and avoids copying the buffer.
    const blob = new Blob([new Uint8Array(file.buffer)], { type: file.mimetype });
    formData.append('fileInput', blob, file.originalname);

    // Pass-through additional string params (e.g. password, angle, ...)
    for (const [key, value] of Object.entries(body || {})) {
      if (typeof value === 'string') {
        formData.append(key, value);
      }
    }

    try {
      const result = await this.stirlingService.proxyToolCall(
        tool.endpoint,
        formData,
      );
      res.set({
        'Content-Type': result.contentType,
        'Content-Disposition': `attachment; filename="${result.filename}"`,
      });
      res.send(result.buffer);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new BadRequestException(`Stirling PDF error: ${message}`);
    }
  }
}
