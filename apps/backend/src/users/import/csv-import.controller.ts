import {
  Controller,
  Post,
  Get,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  Res,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { UserRole } from '../../common/enums';
import { RequestUser } from '../../common/interfaces';
import { CsvImportService } from './csv-import.service';

@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CsvImportController {
  constructor(private readonly csvImportService: CsvImportService) {}

  @Post('import/validate')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 5 * 1024 * 1024 },
      storage: undefined,
    }),
  )
  async validateCsv(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('Aucun fichier fourni');
    }

    if (!file.originalname.toLowerCase().endsWith('.csv')) {
      throw new BadRequestException('Seuls les fichiers CSV sont acceptes');
    }

    return this.csvImportService.parseAndValidate(file);
  }

  @Post('import/execute')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 5 * 1024 * 1024 },
      storage: undefined,
    }),
  )
  async executeCsvImport(
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: RequestUser,
  ) {
    if (!file) {
      throw new BadRequestException('Aucun fichier fourni');
    }

    const { valid, errors } = await this.csvImportService.parseAndValidate(file);

    if (valid.length === 0) {
      throw new BadRequestException({
        message: 'Aucune ligne valide a importer',
        errors,
      });
    }

    const result = await this.csvImportService.importUsers(valid, user.id);
    return { ...result, validationErrors: errors };
  }

  @Get('import/template')
  getImportTemplate(@Res() res: Response) {
    const csv =
      'email;firstName;lastName;role;department;jobTitle;phone\njohn.doe@omnitech.security;John;Doe;COLLABORATEUR;Direction IT;Technicien;0556123456\n';
    res.set({
      'Content-Type': 'text/csv',
      'Content-Disposition': 'attachment; filename="import-users-template.csv"',
    });
    res.send(csv);
  }
}
