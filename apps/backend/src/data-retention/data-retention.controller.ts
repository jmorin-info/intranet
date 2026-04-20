import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../common/enums';
import { DataRetentionService } from './data-retention.service';

interface ApplyBody {
  apply?: boolean;
}

/**
 * DataRetentionController — admin-only endpoints for the ISO 27001 A.5.33
 * automated retention / archival policy.
 *
 * Destructive routes are gated to SUPER_ADMIN and default to dry-run. The
 * caller must pass `{ apply: true }` in the body to actually mutate data.
 */
@Controller('data-retention')
@UseGuards(JwtAuthGuard, RolesGuard)
export class DataRetentionController {
  constructor(private readonly service: DataRetentionService) {}

  @Get('stats')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  getStats() {
    return this.service.getStats();
  }

  @Get('archivable-documents')
  @Roles(UserRole.SUPER_ADMIN)
  getArchivable(@Query('limit') limit?: string) {
    const parsed = limit ? parseInt(limit, 10) : 50;
    const safe = Number.isFinite(parsed) && parsed > 0 ? parsed : 50;
    return this.service.getArchivableDocuments(safe);
  }

  @Get('deletable-documents')
  @Roles(UserRole.SUPER_ADMIN)
  getDeletable(@Query('limit') limit?: string) {
    const parsed = limit ? parseInt(limit, 10) : 50;
    const safe = Number.isFinite(parsed) && parsed > 0 ? parsed : 50;
    return this.service.getDeletableSoftDeleted(safe);
  }

  @Post('archive')
  @Roles(UserRole.SUPER_ADMIN)
  runArchive(@Body() body: ApplyBody) {
    return this.service.runArchivePolicy(body?.apply === true);
  }

  @Post('hard-delete')
  @Roles(UserRole.SUPER_ADMIN)
  runHardDelete(@Body() body: ApplyBody) {
    return this.service.runHardDeletePolicy(body?.apply === true);
  }

  @Post('cleanup-audit')
  @Roles(UserRole.SUPER_ADMIN)
  cleanupAudit(@Body() body: ApplyBody) {
    return this.service.runAuditLogCleanup(body?.apply === true);
  }
}
