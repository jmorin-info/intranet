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
    @Query('page') page: string,
    @Query('limit') limit: string,
  ) {
    return this.calendarService.findAll({
      dateFrom,
      dateTo,
      category,
      departmentId,
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
   * Endpoint public d'export iCal — auth via le token d'abonnement.
   * Compatible "Ajouter calendrier > A partir d'Internet" dans Outlook.
   * NB : aucun @UseGuards = pas de JWT, l'unique secret est le token URL.
   */
  @Get('export.ics')
  async exportIcs(
    @Query('token') token: string,
    @Res() res: Response,
  ) {
    if (!token || typeof token !== 'string' || token.length < 16) {
      throw new BadRequestException('Token requis');
    }

    const { ics, filename } = await this.calendarService.exportIcsByToken(token);

    res.set({
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'private, max-age=300, no-store',
    });
    res.send(ics);
  }
}
