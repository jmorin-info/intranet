import { Controller, Get, Post, Patch, Delete, Param, Query, Body, UseGuards, ParseUUIDPipe, Res, BadRequestException, HttpCode } from '@nestjs/common';
import { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { TicketsService } from './tickets.service';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { TICKET_TEMPLATES } from './ticket-templates.constants';
import { BulkAssignDto, BulkStatusDto } from '../common/dto/bulk-ids.dto';
import { rowsToCsv, csvFilename, CsvColumn } from '../common/utils/csv-export';
import { RequestUser } from '../common/interfaces';
import { UserRole } from '../common/enums';
import { safeParseInt } from '../common/validation-helpers';

@Controller('tickets')
@UseGuards(JwtAuthGuard, RolesGuard)
export class TicketsController {
  constructor(private readonly ticketsService: TicketsService) {}

  @Get('templates')
  getTemplates() {
    return TICKET_TEMPLATES;
  }

  // ── Ticket Spaces ─────────────────────────────────────────────────

  /**
   * List all active ticket spaces accessible to the current user.
   */
  @Get('spaces')
  listSpaces(@CurrentUser() user: RequestUser) {
    return this.ticketsService.findAllSpaces(user);
  }

  /**
   * Get a single space by slug or id.
   */
  @Get('spaces/:slugOrId')
  getSpace(@Param('slugOrId') slugOrId: string) {
    return this.ticketsService.findSpaceBySlugOrId(slugOrId);
  }

  /**
   * Deployment labels, checklist items, and custom field definitions.
   * Reads from AppConfig (key `ticket_labels`) with sensible defaults.
   */
  @Get('labels')
  getLabels() {
    return this.ticketsService.getLabels();
  }

  @Get()
  findAll(
    @Query('status') status: string,
    @Query('priority') priority: string,
    @Query('assigneeId') assigneeId: string,
    @Query('departmentId') departmentId: string,
    @Query('search') search: string,
    @Query('userId') userId: string,
    @Query('spaceId') spaceId: string,
    @Query('spaceSlug') spaceSlug: string,
    @Query('page') page: string,
    @Query('limit') limit: string,
    @CurrentUser() user: RequestUser,
  ) {
    const parsedPage = safeParseInt(page, 1);
    const parsedLimit = safeParseInt(limit, 20);
    if (parsedPage < 1) {
      throw new BadRequestException('page must be >= 1');
    }
    if (parsedLimit < 1 || parsedLimit > 100) {
      throw new BadRequestException('limit must be between 1 and 100');
    }

    return this.ticketsService.findAll(
      {
        status,
        priority,
        assigneeId: assigneeId === 'me' ? user.id : assigneeId,
        departmentId,
        search,
        creatorId: userId === 'me' ? user.id : userId,
        spaceId,
        spaceSlug,
        page: parsedPage,
        limit: parsedLimit,
      },
      user,
    );
  }

  /**
   * Lightweight per-status counts for filter pills — available to all authenticated users.
   * Replaces 5 separate /tickets?status=X&limit=1 calls with a single groupBy query.
   */
  @Get('status-counts')
  async getStatusCounts(@Query('userId') userId?: string) {
    return this.ticketsService.getStatusCounts(userId);
  }

  @Get('stats')
  @Roles(UserRole.ADMIN)
  getStats() {
    return this.ticketsService.getStats();
  }

  /**
   * Grouped view — all departments with their open tickets. ADMIN+ only.
   */
  @Get('by-department')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.REVIEWER)
  byDepartment() {
    return this.ticketsService.byDepartment();
  }

  /**
   * Returns tickets that belong to the current user's primary department.
   */
  @Get('my-department')
  myDepartment(@CurrentUser() user: RequestUser) {
    return this.ticketsService.myDepartment(user);
  }

  @Get('analytics')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  getAnalytics() {
    return this.ticketsService.getAnalytics();
  }

  /**
   * CSV export of the filtered tickets list (max 1000 rows).
   * ISO 27001 A.5.10 — export contrôlé (traçabilité + anti-injection).
   */
  @Get('export/csv')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.REVIEWER)
  async exportCsv(
    @Query('status') status: string,
    @Query('priority') priority: string,
    @Query('assigneeId') assigneeId: string,
    @Query('departmentId') departmentId: string,
    @Query('search') search: string,
    @Query('userId') userId: string,
    @CurrentUser() user: RequestUser,
    @Res() res: Response,
  ) {
    const result = await this.ticketsService.findAll(
      {
        status,
        priority,
        assigneeId,
        departmentId,
        search,
        creatorId: userId,
        page: 1,
        limit: 1000,
      },
      user,
    );
    const rows = (result as any)?.data ?? [];

    type TicketRow = {
      reference: string;
      title: string;
      status: string;
      priority: string;
      category: string | null;
      creator?: { firstName: string; lastName: string } | null;
      assignee?: { firstName: string; lastName: string } | null;
      createdAt: Date | string;
      updatedAt: Date | string;
    };

    const columns: CsvColumn<TicketRow>[] = [
      { header: 'Référence', accessor: (t) => t.reference },
      { header: 'Titre', accessor: (t) => t.title },
      { header: 'Statut', accessor: (t) => t.status },
      { header: 'Priorité', accessor: (t) => t.priority },
      { header: 'Catégorie', accessor: (t) => t.category ?? '' },
      {
        header: 'Créé par',
        accessor: (t) =>
          t.creator ? `${t.creator.firstName} ${t.creator.lastName}` : '',
      },
      {
        header: 'Assigné à',
        accessor: (t) =>
          t.assignee ? `${t.assignee.firstName} ${t.assignee.lastName}` : '',
      },
      {
        header: 'Créé le',
        accessor: (t) =>
          t.createdAt ? new Date(t.createdAt).toISOString().split('T')[0] : '',
      },
      {
        header: 'Mis à jour le',
        accessor: (t) =>
          t.updatedAt ? new Date(t.updatedAt).toISOString().split('T')[0] : '',
      },
    ];

    const csv = rowsToCsv<TicketRow>(rows as TicketRow[], columns);

    res.set({
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${csvFilename('tickets')}"`,
      'Cache-Control': 'private, no-store',
    });
    res.send(csv);
  }

  /**
   * Bulk update ticket status (max 100).
   * ISO 27001 A.5.10 — controlled bulk modification with audit trail.
   */
  @Post('bulk/status')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.REVIEWER)
  bulkUpdateStatus(
    @Body() dto: BulkStatusDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.ticketsService.bulkUpdateStatus(dto.ids, dto.status, user);
  }

  /**
   * Bulk reassign tickets (max 100). `assigneeId = null` unassigns.
   * ISO 27001 A.5.10 — controlled bulk modification with audit trail.
   */
  @Post('bulk/assign')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.REVIEWER)
  bulkAssign(
    @Body() dto: BulkAssignDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.ticketsService.bulkAssign(dto.ids, dto.assigneeId ?? null, user);
  }

  @Get(':id')
  findById(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: RequestUser) {
    return this.ticketsService.findById(id, user);
  }

  @Post()
  create(@Body() body: CreateTicketDto, @CurrentUser() user: RequestUser) {
    return this.ticketsService.create(body, user.id);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN)
  update(@Param('id', ParseUUIDPipe) id: string, @Body() body: { status?: string; priority?: string; assigneeId?: string; tags?: string[] }, @CurrentUser() user: RequestUser) {
    return this.ticketsService.update(id, body, user.id);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @HttpCode(204)
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: RequestUser) {
    return this.ticketsService.remove(id, user.id);
  }

  @Post(':id/comments')
  addComment(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { content: string; isInternal?: boolean },
    @CurrentUser() user: RequestUser,
  ) {
    return this.ticketsService.addComment(id, body.content, user.id, body.isInternal, user.role);
  }

  /**
   * Generate a KB article draft from a resolved ticket.
   * Returns structured content for review before wiki creation.
   */
  @Post(':id/generate-kb')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  generateKbDraft(
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.ticketsService.generateKbDraft(id);
  }
}
