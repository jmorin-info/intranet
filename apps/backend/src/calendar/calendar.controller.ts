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
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CalendarService } from './calendar.service';
import { CreateCalendarEventDto, UpdateCalendarEventDto } from './dto/create-event.dto';
import { RequestUser } from '../common/interfaces';
import { UserRole } from '../common/enums';

@Controller('calendar')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CalendarController {
  constructor(private readonly calendarService: CalendarService) {}

  @Get('events')
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
  getUpcoming(@Query('days') days: string) {
    return this.calendarService.getUpcoming(parseInt(days || '7'));
  }

  @Post('events')
  @Roles(UserRole.REVIEWER)
  create(
    @Body() dto: CreateCalendarEventDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.calendarService.create(dto, user.id);
  }

  @Patch('events/:id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCalendarEventDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.calendarService.update(id, dto, user.id, user.role);
  }

  @Delete('events/:id')
  delete(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.calendarService.delete(id, user.id, user.role);
  }
}
