import { Controller, Get, Post, Patch, Delete, Param, Query, Body, Res, UseGuards, ParseUUIDPipe } from '@nestjs/common';
import { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { VeilleService } from './veille.service';
import { RequestUser } from '../common/interfaces';
import { UserRole } from '../common/enums';
import { safeParseInt } from '../common/validation-helpers';
import { rowsToCsv, csvFilename, CsvColumn } from '../common/utils/csv-export';

@Controller('veille')
@UseGuards(JwtAuthGuard, RolesGuard)
export class VeilleController {
  constructor(private readonly veilleService: VeilleService) {}

  @Get()
  findAll(
    @Query('isProcessed') isProcessed: string,
    @Query('search') search: string,
    @Query('page') page: string,
    @Query('limit') limit: string,
    @Query('dateFrom') dateFrom: string,
  ) {
    return this.veilleService.findAll({
      isProcessed: isProcessed === 'true' ? true : isProcessed === 'false' ? false : undefined,
      search,
      page: safeParseInt(page, 1),
      limit: safeParseInt(limit, 30),
      dateFrom,
    });
  }

  @Get('stats')
  @Roles(UserRole.ADMIN)
  getStats() {
    return this.veilleService.getStats();
  }

  /**
   * CSV export of the filtered veille list (max 10 000 rows).
   * ISO 27001 A.5.10 — export contrôlé (traçabilité + anti-injection).
   */
  @Get('export/csv')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.REVIEWER)
  async exportCsv(
    @Query('isProcessed') isProcessed: string,
    @Query('search') search: string,
    @Query('dateFrom') dateFrom: string,
    @Res() res: Response,
  ) {
    const result = await this.veilleService.findAll({
      isProcessed: isProcessed === 'true' ? true : isProcessed === 'false' ? false : undefined,
      search,
      page: 1,
      limit: 10000,
      dateFrom,
    });
    const rows = result.data;

    type VeilleRow = {
      title: string;
      sourceName: string;
      cveId: string | null;
      severity: string | null;
      publishedAt: Date | string;
      isProcessed: boolean;
      sourceUrl: string;
    };

    const columns: CsvColumn<VeilleRow>[] = [
      { header: 'Titre', accessor: (r) => r.title },
      { header: 'Source', accessor: (r) => r.sourceName },
      { header: 'CVE', accessor: (r) => r.cveId ?? '' },
      { header: 'Sévérité', accessor: (r) => r.severity ?? '' },
      { header: 'Publié le', accessor: (r) => r.publishedAt },
      { header: 'Traité', accessor: (r) => r.isProcessed },
      { header: 'URL', accessor: (r) => r.sourceUrl },
    ];

    const csv = rowsToCsv<VeilleRow>(
      rows as VeilleRow[],
      columns,
      'Veille cybersécurité',
    );

    res.set({
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${csvFilename('veille')}"`,
      'Cache-Control': 'private, no-store',
    });
    res.send(csv);
  }

  @Get('weekly-summary')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.REVIEWER)
  getWeeklySummary() {
    return this.veilleService.getWeeklySummary();
  }

  @Get('bulletins')
  getBulletins(@Query('page') page: string, @Query('limit') limit: string) {
    return this.veilleService.getBulletins(safeParseInt(page, 1), safeParseInt(limit, 12));
  }

  @Post('bulletins/generate')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async generateBulletin() {
    const bulletin = await this.veilleService.generateWeeklyBulletin();
    return { message: 'Bulletin generated', bulletin };
  }

  @Get('bulletins/:id')
  getBulletinById(@Param('id', ParseUUIDPipe) id: string) {
    return this.veilleService.getBulletinById(id);
  }

  @Post(':id/acknowledge')
  @Roles(UserRole.ADMIN, UserRole.REVIEWER, UserRole.SUPER_ADMIN)
  acknowledge(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { action: string; comment?: string },
    @CurrentUser() user: RequestUser,
  ) {
    return this.veilleService.acknowledge(id, user.id, body.action, body.comment);
  }

  @Get('relevant')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.REVIEWER)
  getRelevant(@Query('limit') limit: string) {
    return this.veilleService.getRelevantItems(safeParseInt(limit, 20));
  }

  @Post('fetch')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async triggerFetch() {
    await this.veilleService.fetchRSSFeeds();
    return { message: 'RSS feeds fetched' };
  }

  @Post('fetch-now')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async fetchNow() {
    await this.veilleService.fetchRSSFeeds();
    return { message: 'Manual RSS fetch completed', timestamp: new Date().toISOString() };
  }

  @Post('bulk-process')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async bulkProcess(@CurrentUser() user: RequestUser) {
    return this.veilleService.bulkProcessAll(user.id);
  }

  // ---------------------------------------------------------------------------
  // Sources RSS — CRUD (ADMIN only)
  // ---------------------------------------------------------------------------

  @Get('sources')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  getSources() {
    return this.veilleService.getSources();
  }

  @Post('sources')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  createSource(@Body() body: { name: string; url: string }) {
    return this.veilleService.createSource(body);
  }

  @Post('sources/seed')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  seedSources() {
    return this.veilleService.seedDefaultSources();
  }

  @Patch('sources/:id')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  updateSource(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { name?: string; url?: string; isActive?: boolean },
  ) {
    return this.veilleService.updateSource(id, body);
  }

  @Delete('sources/:id')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  deleteSource(@Param('id', ParseUUIDPipe) id: string) {
    return this.veilleService.deleteSource(id);
  }
}
