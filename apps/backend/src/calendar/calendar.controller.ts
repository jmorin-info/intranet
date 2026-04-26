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
} from '@nestjs/common';
import { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CalendarService } from './calendar.service';
import { CreateCalendarEventDto, UpdateCalendarEventDto } from './dto/create-event.dto';
import { RequestUser } from '../common/interfaces';
import { UserRole } from '../common/enums';

@Controller('calendar')
export class CalendarController {
  constructor(private readonly calendarService: CalendarService) {}

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
    if (!slug || !/^[a-zA-Z0-9_\-]+$/.test(slug)) {
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
}
