import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { KnowBe4Service } from './knowbe4.service';
import { UserRole } from '../common/enums';
import { RequestUser } from '../common/interfaces';

@Controller('knowbe4')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
export class KnowBe4Controller {
  constructor(private readonly knowbe4: KnowBe4Service) {}

  @Get('account')
  async getAccount() {
    const data = await this.knowbe4.getAccount();
    return { data };
  }

  @Get('users')
  async getUsers(@Query('per_page') perPage?: string) {
    const data = await this.knowbe4.getUsers(
      perPage ? parseInt(perPage, 10) : undefined,
    );
    return { data };
  }

  @Get('campaigns')
  async getCampaigns() {
    const data = await this.knowbe4.getCampaigns();
    return { data };
  }

  @Get('enrollments')
  async getEnrollments(@Query('per_page') perPage?: string) {
    const data = await this.knowbe4.getEnrollments(
      perPage ? parseInt(perPage, 10) : undefined,
    );
    return { data };
  }

  @Get('user-status/:email')
  async getUserStatus(@Param('email') email: string) {
    const data = await this.knowbe4.getUserTrainingStatus(email);
    return { data };
  }

  @Post('sync-certificates')
  async syncCertificates(@CurrentUser() user: RequestUser) {
    const result = await this.knowbe4.syncCertificates(user.id);
    return { data: result };
  }
}
