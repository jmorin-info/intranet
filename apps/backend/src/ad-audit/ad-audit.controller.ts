import { Controller, Get, Post, Body, UseGuards, UseInterceptors, UploadedFile } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { AdAuditService } from './ad-audit.service';
import { UserRole } from '../common/enums';

@Controller('ad-audit')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AdAuditController {
  constructor(private readonly adAuditService: AdAuditService) {}

  @Post('analyze')
  @Roles(UserRole.SUPER_ADMIN)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }))
  async analyzeReport(@UploadedFile() file?: Express.Multer.File, @Body() body?: any) {
    // If a file was uploaded, use file content
    if (file) {
      const content = file.buffer.toString('utf-8');
      const format = (body?.format || 'json') as 'json' | 'text' | 'csv';
      return this.adAuditService.analyzeReport(content, format);
    }

    // If body has PasswordPolicy/Decisions, it's a direct JSON report from the PS1 script
    if (body?.PasswordPolicy || body?.Decisions) {
      return this.adAuditService.analyzeReport(JSON.stringify(body), 'json');
    }

    // Legacy: body.content as string
    const content = body?.content || '{}';
    const format = (body?.format || 'json') as 'json' | 'text' | 'csv';
    return this.adAuditService.analyzeReport(content, format);
  }

  @Get('quick-scan')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  async quickScan() {
    // Run database-only checks without a report file
    return this.adAuditService.analyzeReport('{}', 'json');
  }

  @Get('history')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  getHistory() {
    return this.adAuditService.getAuditHistory();
  }
}
