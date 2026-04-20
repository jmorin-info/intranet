import { Controller, Get, Post, Delete, Patch, Param, Query, Body, UseGuards, ParseUUIDPipe } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { PrestataireSessionGuard } from './prestataire-session.guard';
import { ExternalAccessService } from './external-access.service';
import { GrantAccessDto, CreatePrestaAccountDto } from './dto/grant-access.dto';
import { RequestUser } from '../common/interfaces';
import { UserRole } from '../common/enums';

@Controller('external-access')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ExternalAccessController {
  constructor(private readonly externalAccessService: ExternalAccessService) {}

  @Get()
  @Roles(UserRole.ADMIN)
  findAll(
    @Query('isActive') isActive: string,
    @Query('companyName') companyName: string,
    @Query('page') page: string,
    @Query('limit') limit: string,
  ) {
    return this.externalAccessService.listExternalAccess({
      isActive: isActive !== undefined ? isActive === 'true' : undefined,
      companyName,
      page: parseInt(page || '1'),
      limit: parseInt(limit || '20'),
    });
  }

  @Post()
  @Roles(UserRole.ADMIN)
  grantAccess(
    @Body() body: GrantAccessDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.externalAccessService.grantAccess(
      {
        ...body,
        accessExpiresAt: body.accessExpiresAt ? new Date(body.accessExpiresAt) : undefined,
      },
      user.id,
    );
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN)
  revokeAccess(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.externalAccessService.revokeAccess(id, user.id);
  }

  @Patch(':id/review')
  @Roles(UserRole.ADMIN)
  reviewAccess(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.externalAccessService.reviewAccess(id, user.id);
  }

  @Get('due-review')
  @Roles(UserRole.ADMIN)
  getDueForReview() {
    return this.externalAccessService.getAccessDueForReview();
  }

  @Get('dashboard')
  @Roles(UserRole.PRESTATAIRE)
  @UseGuards(PrestataireSessionGuard)
  getDashboard(@CurrentUser() user: RequestUser) {
    return this.externalAccessService.getPrestataireDashboard(user.id);
  }

  @Post('create-account')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async createPrestaAccount(
    @Body() body: CreatePrestaAccountDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.externalAccessService.createPrestaAccount(body, user.id);
  }
}
