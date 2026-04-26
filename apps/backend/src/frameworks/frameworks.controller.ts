import { Controller, Get, Post, Param, Body, UseGuards, ParseUUIDPipe } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { FrameworksService } from './frameworks.service';
import { UserRole } from '../common/enums';

@Controller('frameworks')
@UseGuards(JwtAuthGuard, RolesGuard)
export class FrameworksController {
  constructor(private readonly frameworksService: FrameworksService) {}

  @Get()
  findAll() {
    return this.frameworksService.findAll();
  }

  // Détail framework + résumé conformité = données sensibles (taux de
  // couverture interne ISO/NIST). On restreint à REVIEWER+ pour aligner
  // avec /rssi-dashboard et /access-reviews.
  @Get(':id')
  @Roles(UserRole.REVIEWER, UserRole.AUDITEUR, UserRole.DIRECTION, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  findById(@Param('id', ParseUUIDPipe) id: string) {
    return this.frameworksService.findById(id);
  }

  @Get(':id/summary')
  @Roles(UserRole.REVIEWER, UserRole.AUDITEUR, UserRole.DIRECTION, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  getSummary(@Param('id', ParseUUIDPipe) id: string) {
    return this.frameworksService.getComplianceSummary(id);
  }

  @Post()
  @Roles(UserRole.SUPER_ADMIN)
  create(@Body() body: { name: string; version?: string; description?: string }) {
    return this.frameworksService.create(body);
  }

  @Post(':id/controls')
  @Roles(UserRole.SUPER_ADMIN)
  addControls(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { controls: Array<{ code: string; title: string; titleFr?: string; domain?: string; description?: string; mappedIsoCode?: string }> },
  ) {
    return this.frameworksService.addControls(id, body.controls);
  }

  @Post(':id/link-document')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  linkDocument(
    @Param('id') _id: string,
    @Body() body: { controlId: string; documentId: string; status?: string },
  ) {
    return this.frameworksService.linkDocument(body.controlId, body.documentId, body.status);
  }

  @Post('seed')
  @Roles(UserRole.SUPER_ADMIN)
  seed() {
    return this.frameworksService.seedDefaultFrameworks();
  }
}
