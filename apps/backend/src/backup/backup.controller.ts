import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Req,
  Res,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  StreamableFile,
  Header,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response, Request } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UserRole } from '../common/enums';
import { RequestUser } from '../common/interfaces';
import { BackupService } from './backup.service';

@Controller('backup')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SUPER_ADMIN)
export class BackupController {
  constructor(private readonly backupService: BackupService) {}

  @Get('list')
  async list() {
    return this.backupService.listBackups();
  }

  @Post('export')
  async exportBackup(
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ) {
    return this.backupService.exportBackup(user.id, req.ip);
  }

  @Get('download/:filename')
  @Header('Content-Type', 'application/octet-stream')
  async download(
    @Param('filename') filename: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const filePath = this.backupService.getBackupFilePath(filename);
    const basename = path.basename(filePath);

    res.set({
      'Content-Disposition': `attachment; filename="${basename}"`,
    });

    const fileStream = fs.createReadStream(filePath);
    return new StreamableFile(fileStream);
  }

  @Post('restore')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 5 * 1024 * 1024 * 1024 }, // 5 GB max
      fileFilter: (_req: Request, file: Express.Multer.File, cb: (error: Error | null, acceptFile: boolean) => void) => {
        const allowed = ['.sql.gz', '.tar.gz', '.tgz'];
        const isValid = allowed.some((ext) => file.originalname.endsWith(ext));
        cb(isValid ? null : new Error('Only .sql.gz and .tar.gz files are accepted'), isValid);
      },
    }),
  )
  async restore(
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ) {
    return this.backupService.restoreBackup(
      file,
      user.id,
      req.ip,
      req.headers['user-agent'],
    );
  }

  @Post('export-full-network')
  async exportFullToNetwork(
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ) {
    return this.backupService.exportFullToNetwork(user.id, req.ip);
  }

  @Get('download-project')
  @Header('Content-Type', 'application/gzip')
  async downloadProject(
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const archivePath = await this.backupService.createDownloadableArchive(user.id, req.ip);
    const basename = path.basename(archivePath);

    res.set({
      'Content-Disposition': `attachment; filename="${basename}"`,
    });

    const fileStream = fs.createReadStream(archivePath);
    // Cleanup temp file after streaming
    fileStream.on('end', () => {
      fs.unlink(archivePath, () => {});
    });

    return new StreamableFile(fileStream);
  }

  @Delete(':filename')
  async deleteBackup(
    @Param('filename') filename: string,
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ) {
    await this.backupService.deleteBackup(filename, user.id, req.ip);
    return { success: true, message: `Deleted: ${filename}` };
  }
}
