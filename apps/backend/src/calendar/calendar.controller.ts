import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Query,
  Body,
  UseGuards,
  ParseUUIDPipe,
  Res,
  BadRequestException,
  UseInterceptors,
  UploadedFile,
  UnauthorizedException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { Response } from 'express';
import { randomBytes } from 'crypto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { CalendarService } from './calendar.service';
import { CreateCalendarEventDto, UpdateCalendarEventDto } from './dto/create-event.dto';
import { GoogleCalendarSyncService } from './google-calendar-sync.service';
import { OutlookSyncService } from './outlook-sync.service';
import { RequestUser } from '../common/interfaces';
import { UserRole } from '../common/enums';

const ICAL_MAX_SIZE = 10 * 1024 * 1024; // 10 MB
// Mémo des states OAuth en cours (en mémoire — single-instance MVP).
// TTL court (10 min). Pour multi-instance, utiliser Redis avec la même clé.
const oauthStateStore = new Map<
  string,
  { userId: string; provider: 'GOOGLE' | 'OUTLOOK'; expiresAt: number }
>();
const OAUTH_STATE_TTL = 10 * 60 * 1000;

@Controller('calendar')
export class CalendarController {
  constructor(
    private readonly calendarService: CalendarService,
    private readonly googleSync: GoogleCalendarSyncService,
    private readonly outlookSync: OutlookSyncService,
  ) {}

  @Get('events')
  @UseGuards(JwtAuthGuard, RolesGuard)
  findAll(
    @Query('dateFrom') dateFrom: string,
    @Query('dateTo') dateTo: string,
    @Query('category') category: string,
    @Query('departmentId') departmentId: string,
    // Filtre multi-équipes : "?departmentIds=a,b,c" ou répété "?departmentIds=a&departmentIds=b"
    @Query('departmentIds') departmentIdsRaw: string | string[],
    @Query('visibility') visibility: string,
    @Query('scope') scope: string, // "all" (default) | "mine"
    @Query('page') page: string,
    @Query('limit') limit: string,
    @CurrentUser() user: RequestUser,
  ) {
    const departmentIds = Array.isArray(departmentIdsRaw)
      ? departmentIdsRaw
      : departmentIdsRaw
        ? departmentIdsRaw.split(',').map((s) => s.trim()).filter(Boolean)
        : undefined;

    if (scope === 'mine') {
      // Filtre côté serveur visibility-aware (PRIVATE/TEAM/INTERNAL/PUBLIC)
      return this.calendarService
        .getEventsForUser(user.id, {
          dateFrom: dateFrom ? new Date(dateFrom) : undefined,
          dateTo: dateTo ? new Date(dateTo) : undefined,
          departmentIds,
          take: parseInt(limit || '200'),
        })
        .then((data) => ({ data, meta: { total: data.length } }));
    }

    return this.calendarService.findAll({
      dateFrom,
      dateTo,
      category,
      departmentId,
      departmentIds,
      visibility,
      page: parseInt(page || '1'),
      limit: parseInt(limit || '50'),
    });
  }

  @Get('events/upcoming')
  @UseGuards(JwtAuthGuard, RolesGuard)
  getUpcoming(@Query('days') days: string) {
    return this.calendarService.getUpcoming(parseInt(days || '7'));
  }

  @Post('events')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.REVIEWER)
  create(
    @Body() dto: CreateCalendarEventDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.calendarService.create(dto, user.id);
  }

  @Patch('events/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCalendarEventDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.calendarService.update(id, dto, user.id, user.role);
  }

  @Delete('events/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  delete(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.calendarService.delete(id, user.id, user.role);
  }

  /**
   * Mint (ou retourne) un token d'abonnement iCal pour l'utilisateur courant.
   * Le token est valable 30 jours, revocable (sera regenere si expire).
   * L'URL retournee peut etre collee dans Outlook / Google / Apple Calendar.
   */
  @Get('subscription-token')
  @UseGuards(JwtAuthGuard, RolesGuard)
  async getSubscriptionToken(@CurrentUser() user: RequestUser) {
    const result = await this.calendarService.getOrCreateSubscriptionToken(user.id);
    return result;
  }

  /**
   * Régénère le token d'abonnement iCal de l'utilisateur (révoque l'ancien
   * et en crée un nouveau). Toute URL d'abonnement précédemment partagée
   * cesse alors de fonctionner. POST par convention REST (action mutative).
   */
  @Post('subscription-token')
  @UseGuards(JwtAuthGuard, RolesGuard)
  async regenerateSubscriptionToken(@CurrentUser() user: RequestUser) {
    return this.calendarService.regenerateSubscriptionToken(user.id);
  }

  /**
   * Révoque tous les tokens d'abonnement iCal de l'utilisateur courant.
   * Les URLs déjà distribuées cessent immédiatement de fonctionner (404).
   */
  @Delete('subscription-token')
  @UseGuards(JwtAuthGuard, RolesGuard)
  async revokeSubscriptionToken(@CurrentUser() user: RequestUser) {
    return this.calendarService.revokeSubscriptionTokens(user.id);
  }

  /**
   * Endpoint public d'export iCal — auth via le token d'abonnement.
   * Compatible "Ajouter calendrier > A partir d'Internet" dans Outlook.
   * NB : aucun @UseGuards = pas de JWT, l'unique secret est le token URL.
   */
  @Get('export.ics')
  async exportIcs(
    @Query('token') token: string,
    @Query('scope') scope: string,
    @Res() res: Response,
  ) {
    if (!token || typeof token !== 'string' || token.length < 16) {
      throw new BadRequestException('Token requis');
    }

    const { ics, filename } = await this.calendarService.exportIcsByToken(token, {
      scope: scope || 'all',
    });

    res.set({
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'private, max-age=300, no-store',
    });
    res.send(ics);
  }

  /**
   * Endpoint d'export iCal team-slug — `GET /api/v1/calendar/{teamSlug}.ics`.
   * teamSlug peut être :
   *   - "all"          → tous les events visibles par l'user du token
   *   - "mine"         → events où user = createdBy ou userId (synchronisés tickets)
   *   - "<dept-code>"  → events du département (intersection avec visibilité)
   *   - "<dept-uuid>"  → idem, par UUID
   *
   * Match sur le pattern `:slug.ics` ; routé après les autres @Get pour
   * éviter de capturer "events.ics" / "export.ics" / "subscription-token".
   * Outlook ne sait pas faire JWT — l'unique secret est le token URL.
   */
  @Get(':slug.ics')
  async exportIcsByTeamSlug(
    @Param('slug') slug: string,
    @Query('token') token: string,
    @Res() res: Response,
  ) {
    if (!token || typeof token !== 'string' || token.length < 16) {
      throw new BadRequestException('Token requis');
    }
    if (!slug || !/^[a-zA-Z0-9_-]+$/.test(slug)) {
      throw new BadRequestException('Slug invalide');
    }
    // Empêche le clash avec "export.ics" et autres routes (NestJS matchera
    // le @Get('export.ics') en premier, mais on rejette par sécurité si
    // quelqu'un atteint cette route avec slug="export").
    if (slug === 'export') {
      throw new BadRequestException('Utiliser /calendar/export.ics?token=...');
    }

    const { ics, filename } = await this.calendarService.exportIcsByToken(token, {
      scope: slug,
    });

    res.set({
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'private, max-age=300, no-store',
    });
    res.send(ics);
  }

  // ==========================================================================
  // iCal import — Wave B item 33
  // ==========================================================================

  /**
   * Upload un fichier .ics multipart pour import idempotent. Le `defaultUserId`
   * est l'utilisateur authentifié (les events sans ORGANIZER sont attachés à
   * lui). Les events avec ORGANIZER mailto: sont matchés à un user existant
   * de l'intranet quand possible. Idempotent via VEVENT.UID → externalUid.
   */
  @Post('import')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: ICAL_MAX_SIZE },
      fileFilter: (_req, file, cb) => {
        const ok =
          file.mimetype === 'text/calendar' ||
          file.mimetype === 'application/octet-stream' ||
          /\.ics$/i.test(file.originalname);
        if (!ok) {
          return cb(
            new BadRequestException('Type de fichier non supporté (.ics requis)'),
            false,
          );
        }
        cb(null, true);
      },
    }),
  )
  async importIcsFile(
    @UploadedFile() file: Express.Multer.File,
    @Body('visibility') visibility: string | undefined,
    @CurrentUser() user: RequestUser,
  ) {
    if (!file) {
      throw new BadRequestException('Aucun fichier .ics fourni');
    }
    const text = file.buffer.toString('utf8');
    return this.calendarService.importIcs(text, {
      defaultUserId: user.id,
      visibility,
    });
  }

  /**
   * Import direct d'un body iCal text/calendar (pas multipart). Utile pour
   * les intégrations qui produisent du iCal côté serveur (SaaS externes).
   */
  @Post('events/import-ical')
  @UseGuards(JwtAuthGuard, RolesGuard)
  async importIcsBody(
    @Body() body: { ics: string; visibility?: string },
    @CurrentUser() user: RequestUser,
  ) {
    if (!body?.ics || typeof body.ics !== 'string') {
      throw new BadRequestException('Champ "ics" requis (text/calendar)');
    }
    return this.calendarService.importIcs(body.ics, {
      defaultUserId: user.id,
      visibility: body.visibility,
    });
  }

  // ==========================================================================
  // Google Calendar sync (OAuth2) — Wave B item 33
  // ==========================================================================

  @Get('connect/google')
  @UseGuards(JwtAuthGuard, RolesGuard)
  async connectGoogle(
    @CurrentUser() user: RequestUser,
    @Res() res: Response,
  ) {
    if (!this.googleSync.isConfigured()) {
      throw new BadRequestException('Google OAuth non configuré côté serveur');
    }
    const state = randomBytes(24).toString('hex');
    oauthStateStore.set(state, {
      userId: user.id,
      provider: 'GOOGLE',
      expiresAt: Date.now() + OAUTH_STATE_TTL,
    });
    purgeOauthStates();
    const url = this.googleSync.buildAuthorizeUrl(state);
    res.redirect(302, url);
  }

  @Get('callback/google')
  @Public()
  async callbackGoogle(
    @Query('code') code: string,
    @Query('state') state: string,
    @Query('error') error: string,
    @Res() res: Response,
  ) {
    if (error) {
      res.status(400).send(`Google OAuth refusé : ${error}`);
      return;
    }
    const stateRow = oauthStateStore.get(state);
    if (!stateRow || stateRow.provider !== 'GOOGLE' || stateRow.expiresAt < Date.now()) {
      throw new UnauthorizedException('Invalid or expired OAuth state');
    }
    oauthStateStore.delete(state);
    await this.googleSync.handleCallback(stateRow.userId, code);
    // Redirige vers la page UI calendar (frontend) après succès
    const target = process.env.APP_URL
      ? `${process.env.APP_URL.replace(/\/$/, '')}/calendar?integration=google&status=ok`
      : '/calendar?integration=google&status=ok';
    res.redirect(302, target);
  }

  @Delete('connect/google')
  @UseGuards(JwtAuthGuard, RolesGuard)
  async disconnectGoogle(@CurrentUser() user: RequestUser) {
    await this.googleSync.disconnect(user.id);
    return { success: true };
  }

  @Post('sync/google')
  @UseGuards(JwtAuthGuard, RolesGuard)
  async manualSyncGoogle(@CurrentUser() user: RequestUser) {
    return this.googleSync.pullChanges(user.id);
  }

  // ==========================================================================
  // Outlook (M365 Graph) sync — Wave B item 33
  // ==========================================================================

  @Get('connect/outlook')
  @UseGuards(JwtAuthGuard, RolesGuard)
  async connectOutlook(
    @CurrentUser() user: RequestUser,
    @Res() res: Response,
  ) {
    if (!this.outlookSync.isConfigured()) {
      throw new BadRequestException('Microsoft OAuth non configuré côté serveur');
    }
    const state = randomBytes(24).toString('hex');
    oauthStateStore.set(state, {
      userId: user.id,
      provider: 'OUTLOOK',
      expiresAt: Date.now() + OAUTH_STATE_TTL,
    });
    purgeOauthStates();
    const url = this.outlookSync.buildAuthorizeUrl(state);
    res.redirect(302, url);
  }

  @Get('callback/outlook')
  @Public()
  async callbackOutlook(
    @Query('code') code: string,
    @Query('state') state: string,
    @Query('error') error: string,
    @Res() res: Response,
  ) {
    if (error) {
      res.status(400).send(`Microsoft OAuth refusé : ${error}`);
      return;
    }
    const stateRow = oauthStateStore.get(state);
    if (!stateRow || stateRow.provider !== 'OUTLOOK' || stateRow.expiresAt < Date.now()) {
      throw new UnauthorizedException('Invalid or expired OAuth state');
    }
    oauthStateStore.delete(state);
    await this.outlookSync.handleCallback(stateRow.userId, code);
    const target = process.env.APP_URL
      ? `${process.env.APP_URL.replace(/\/$/, '')}/calendar?integration=outlook&status=ok`
      : '/calendar?integration=outlook&status=ok';
    res.redirect(302, target);
  }

  @Delete('connect/outlook')
  @UseGuards(JwtAuthGuard, RolesGuard)
  async disconnectOutlook(@CurrentUser() user: RequestUser) {
    await this.outlookSync.disconnect(user.id);
    return { success: true };
  }

  @Post('sync/outlook')
  @UseGuards(JwtAuthGuard, RolesGuard)
  async manualSyncOutlook(@CurrentUser() user: RequestUser) {
    return this.outlookSync.pullChanges(user.id);
  }

  // ==========================================================================
  // Status — quels providers sont connectés pour le user courant ?
  // ==========================================================================

  @Get('integrations/status')
  @UseGuards(JwtAuthGuard, RolesGuard)
  async integrationsStatus(@CurrentUser() user: RequestUser) {
    const connections = await this.calendarService.listIntegrationConnections(
      user.id,
    );
    return {
      google: {
        configured: this.googleSync.isConfigured(),
        connection:
          connections.find((c) => c.provider === 'GOOGLE') ?? null,
      },
      outlook: {
        configured: this.outlookSync.isConfigured(),
        connection:
          connections.find((c) => c.provider === 'OUTLOOK') ?? null,
      },
    };
  }
}

function purgeOauthStates(): void {
  const now = Date.now();
  for (const [k, v] of oauthStateStore) {
    if (v.expiresAt < now) oauthStateStore.delete(k);
  }
}
