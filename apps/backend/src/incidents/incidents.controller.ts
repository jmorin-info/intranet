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
  UseGuards,
} from '@nestjs/common';
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

@Controller('incidents')
@UseGuards(JwtAuthGuard, RolesGuard)
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
