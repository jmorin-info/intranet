import {
  Controller,
  Post,
  Get,
  Param,
  UseGuards,
  Req,
  ParseUUIDPipe,
} from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { AcknowledgmentsService } from './acknowledgments.service';
import { RequestUser } from '../../common/interfaces';
import { UserRole } from '../../common/enums';

@Controller('documents/:id')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AcknowledgmentsController {
  constructor(
    private readonly acknowledgmentsService: AcknowledgmentsService,
  ) {}

  @Post('acknowledge')
  acknowledge(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ) {
    const ipAddress = req.ip || req.socket.remoteAddress || '';
    const userAgent = req.headers['user-agent'] || '';
    return this.acknowledgmentsService.acknowledge(
      id,
      user.id,
      ipAddress,
      userAgent,
    );
  }

  @Get('acknowledgments')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.DIRECTION)
  getAcknowledgments(@Param('id', ParseUUIDPipe) id: string) {
    return this.acknowledgmentsService.getAcknowledgments(id);
  }

  @Get('acknowledgment-status')
  getAcknowledgmentStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.acknowledgmentsService.hasAcknowledged(id, user.id);
  }
}
