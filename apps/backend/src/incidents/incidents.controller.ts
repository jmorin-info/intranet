import {
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
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { rowsToCsv, csvFilename, CsvColumn } from '../common/utils/csv-export';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequestUser } from '../common/interfaces';
import { UserRole } from '../common/enums';
import { IncidentsService } from './incidents.service';
import { CreateIncidentDto } from './dto/create-incident.dto';
import {
  ChangeStatusDto,
  TimelineEntryDto,
  UpdateIncidentDto,
} from './dto/update-incident.dto';
import { CreateRemediationDto } from './dto/create-remediation.dto';
import { RequireFreshMfa } from '../mfa/decorators/require-fresh-mfa.decorator';

@Controller('incidents')
@UseGuards(JwtAuthGuard, RolesGuard)
// Toute action sur un incident (création, changement de statut, timeline) exige
// une re-validation MFA récente (ISO 27001 A.5.24/.25/.26).
@RequireFreshMfa()
export class IncidentsController {
  constructor(private readonly service: IncidentsService) {}

  @Get()
  @Roles(
    UserRole.COLLABORATEUR,
    UserRole.REVIEWER,
    UserRole.AUDITEUR,
    UserRole.DIRECTION,
    UserRole.ADMIN,
    UserRole.SUPER_ADMIN,
  )
  findAll(
    @Query('status') status: string | undefined,
    @Query('severity') severity: string | undefined,
    @Query('category') category: string | undefined,
    @Query('assignedToId') assignedToId: string | undefined,
    @Query('search') search: string | undefined,
    @Query('dateFrom') dateFrom: string | undefined,
    @Query('dateTo') dateTo: string | undefined,
    @Query('page') page: string | undefined,
    @Query('limit') limit: string | undefined,
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.findAll(
      {
        status,
        severity,
        category,
        assignedToId,
        search,
        dateFrom,
        dateTo,
        page: page ? parseInt(page, 10) : undefined,
        limit: limit ? parseInt(limit, 10) : undefined,
      },
      { id: user.id, role: user.role },
    );
  }

  /**
   * CSV export of filtered incidents (max 1000 rows).
   * ISO 27001 A.5.10 — export contrôlé.
   */
  @Get('export/csv')
  @Roles(
    UserRole.AUDITEUR,
    UserRole.REVIEWER,
    UserRole.DIRECTION,
    UserRole.ADMIN,
    UserRole.SUPER_ADMIN,
  )
  async exportCsv(
    @Query('status') status: string | undefined,
    @Query('severity') severity: string | undefined,
    @Query('category') category: string | undefined,
    @Query('assignedToId') assignedToId: string | undefined,
    @Query('search') search: string | undefined,
    @Query('dateFrom') dateFrom: string | undefined,
    @Query('dateTo') dateTo: string | undefined,
    @CurrentUser() user: RequestUser,
    @Res() res: Response,
  ) {
    const result = await this.service.findAll(
      {
        status,
        severity,
        category,
        assignedToId,
        search,
        dateFrom,
        dateTo,
        page: 1,
        limit: 1000,
      },
      { id: user.id, role: user.role },
    );
    const rows = (result as { data?: unknown[] })?.data ?? [];

    type Row = {
      reference: string;
      title: string;
      status: string;
      severity: string;
      category: string | null;
      reportedBy?: { firstName: string; lastName: string } | null;
      assignedTo?: { firstName: string; lastName: string } | null;
      detectedAt: Date | string | null;
      closedAt: Date | string | null;
      createdAt: Date | string;
    };

    const columns: CsvColumn<Row>[] = [
      { header: 'Référence', accessor: (r) => r.reference },
      { header: 'Titre', accessor: (r) => r.title },
      { header: 'Statut', accessor: (r) => r.status },
      { header: 'Sévérité', accessor: (r) => r.severity },
      { header: 'Catégorie', accessor: (r) => r.category ?? '' },
      {
        header: 'Déclaré par',
        accessor: (r) =>
          r.reportedBy
            ? `${r.reportedBy.firstName} ${r.reportedBy.lastName}`
            : '',
      },
      {
        header: 'Assigné à',
        accessor: (r) =>
          r.assignedTo
            ? `${r.assignedTo.firstName} ${r.assignedTo.lastName}`
            : '',
      },
      {
        header: 'Détecté le',
        accessor: (r) =>
          r.detectedAt ? new Date(r.detectedAt).toISOString() : '',
      },
      {
        header: 'Clôturé le',
        accessor: (r) =>
          r.closedAt ? new Date(r.closedAt).toISOString() : '',
      },
      {
        header: 'Créé le',
        accessor: (r) =>
          r.createdAt ? new Date(r.createdAt).toISOString() : '',
      },
    ];

    const csv = rowsToCsv<Row>(rows as Row[], columns);

    res.set({
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${csvFilename('incidents')}"`,
      'Cache-Control': 'private, no-store',
    });
    res.send(csv);
  }

  @Get('dashboard')
  @Roles(
    UserRole.COLLABORATEUR,
    UserRole.REVIEWER,
    UserRole.AUDITEUR,
    UserRole.DIRECTION,
    UserRole.ADMIN,
    UserRole.SUPER_ADMIN,
  )
  getDashboard(@CurrentUser() user: RequestUser) {
    return this.service.getDashboard({ id: user.id, role: user.role });
  }

  @Get(':id')
  @Roles(
    UserRole.COLLABORATEUR,
    UserRole.REVIEWER,
    UserRole.AUDITEUR,
    UserRole.DIRECTION,
    UserRole.ADMIN,
    UserRole.SUPER_ADMIN,
  )
  findById(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.findById(id, { id: user.id, role: user.role });
  }

  @Post()
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Roles(
    UserRole.COLLABORATEUR,
    UserRole.REVIEWER,
    UserRole.DIRECTION,
    UserRole.ADMIN,
    UserRole.SUPER_ADMIN,
  )
  create(@Body() dto: CreateIncidentDto, @CurrentUser() user: RequestUser) {
    return this.service.create(dto, user.id);
  }

  @Patch(':id')
  @Roles(UserRole.REVIEWER, UserRole.DIRECTION, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateIncidentDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.update(id, dto, { id: user.id, role: user.role });
  }

  @Post(':id/status')
  @Roles(UserRole.REVIEWER, UserRole.DIRECTION, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  changeStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ChangeStatusDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.changeStatus(id, dto, { id: user.id, role: user.role });
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.softDelete(id, user.id);
  }

  @Post(':id/remediations')
  @Roles(UserRole.REVIEWER, UserRole.DIRECTION, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  addRemediation(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateRemediationDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.addRemediation(id, dto, user.id);
  }

  @Post(':id/timeline')
  @Roles(
    UserRole.COLLABORATEUR,
    UserRole.REVIEWER,
    UserRole.AUDITEUR,
    UserRole.DIRECTION,
    UserRole.ADMIN,
    UserRole.SUPER_ADMIN,
  )
  addTimelineEntry(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: TimelineEntryDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.addTimelineEntry(id, dto, {
      id: user.id,
      role: user.role,
    });
  }
}
