import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UserRole } from '../common/enums';
import { RequestUser } from '../common/interfaces';
import { ItExportsService } from './it-exports.service';
import { UploadItExportDto } from './dto/upload-it-export.dto';

const MAX_UPLOAD_BYTES = 200 * 1024 * 1024; // 200 MB

@Controller('it-exports')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ItExportsController {
  constructor(private readonly itExports: ItExportsService) {}

  /**
   * Public (authenticated) endpoint — any logged-in user can see the
   * list of categories so the frontend can render the grid consistently.
   */
  @Get('categories')
  getCategories() {
    return this.itExports.getCategories();
  }

  @Get('stats')
  @Roles(UserRole.ADMIN)
  getStats() {
    return this.itExports.getStats();
  }

  /**
   * Return the parsed KPIs of the latest Veeam JSON report uploaded.
   * Used by the dashboard widget on the IT exports page.
   */
  @Get('veeam/latest')
  @Roles(UserRole.REVIEWER)
  getVeeamLatest() {
    return this.itExports.getVeeamLatestReport();
  }

  @Get()
  @Roles(UserRole.REVIEWER)
  findAll(
    @Query('category') category?: string,
    @Query('period') period?: string,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.itExports.findAll({
      category,
      period,
      search,
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  @Get(':id')
  @Roles(UserRole.REVIEWER)
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.itExports.findById(id);
  }

  @Get(':id/download')
  @Roles(UserRole.REVIEWER)
  async download(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: RequestUser,
    @Res() res: Response,
  ) {
    const { stream, record } = await this.itExports.download(id, user);

    if (!this.itExports.physicalFileExists(record.filePath)) {
      throw new NotFoundException('Physical file missing on storage');
    }

    const safeName = record.originalName.replace(/[^\w.-]+/g, '_');
    res.set({
      'Content-Type': record.mimeType || 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${safeName}"`,
      'Content-Length': String(record.fileSize),
      'Cache-Control': 'private, no-store',
    });
    stream.pipe(res);
  }

  @Post('upload')
  @Roles(UserRole.ADMIN)
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MAX_UPLOAD_BYTES },
    }),
  )
  async upload(
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: UploadItExportDto,
    @CurrentUser() user: RequestUser,
  ) {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }
    return this.itExports.upload(file, dto, user.id);
  }

  @Delete(':id')
  @Roles(UserRole.SUPER_ADMIN)
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.itExports.softDelete(id, user);
  }
}
