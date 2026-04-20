import {
  Body,
  Controller,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequestUser } from '../common/interfaces';
import { UserRole } from '../common/enums';
import { IncidentsService } from './incidents.service';
import {
  CompleteRemediationDto,
  UpdateRemediationDto,
} from './dto/update-remediation.dto';

/**
 * Separate controller for remediation-level operations so routes stay flat:
 *   PATCH /remediations/:id
 *   POST  /remediations/:id/complete
 */
@Controller('remediations')
@UseGuards(JwtAuthGuard, RolesGuard)
export class RemediationsController {
  constructor(private readonly service: IncidentsService) {}

  @Patch(':id')
  @Roles(
    UserRole.COLLABORATEUR,
    UserRole.REVIEWER,
    UserRole.DIRECTION,
    UserRole.ADMIN,
    UserRole.SUPER_ADMIN,
  )
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateRemediationDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.updateRemediation(id, dto, {
      id: user.id,
      role: user.role,
    });
  }

  @Post(':id/complete')
  @Roles(
    UserRole.COLLABORATEUR,
    UserRole.REVIEWER,
    UserRole.DIRECTION,
    UserRole.ADMIN,
    UserRole.SUPER_ADMIN,
  )
  complete(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CompleteRemediationDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.completeRemediation(id, dto.evidence, {
      id: user.id,
      role: user.role,
    });
  }
}
