import { Controller, Get, Post, Body, Param, UseGuards, ParseUUIDPipe } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { MfaService } from './mfa.service';
import { PrismaService } from '../prisma/prisma.service';
import { RequestUser } from '../common/interfaces';
import { UserRole } from '../common/enums';

@Controller('mfa')
@UseGuards(JwtAuthGuard, RolesGuard)
export class MfaController {
  constructor(
    private readonly mfaService: MfaService,
    private readonly prisma: PrismaService,
  ) {}

  @Post('setup')
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  setup(@CurrentUser() user: RequestUser) {
    return this.mfaService.setupMfa(user.id);
  }

  @Post('activate')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  activate(@CurrentUser() user: RequestUser, @Body('code') code: string) {
    return this.mfaService.activateMfa(user.id, code);
  }

  @Post('verify')
  async verify(@CurrentUser() user: RequestUser, @Body('code') code: string) {
    const valid = await this.mfaService.verifyMfa(user.id, code);
    return { valid };
  }

  @Post('disable/me')
  disableOwn(@CurrentUser() user: RequestUser) {
    return this.mfaService.disableMfa(user.id);
  }

  @Post('disable/:userId')
  @Roles(UserRole.SUPER_ADMIN)
  disable(@Param('userId', ParseUUIDPipe) userId: string) {
    return this.mfaService.disableMfa(userId);
  }

  @Post('enforce')
  @Roles(UserRole.SUPER_ADMIN)
  enforce(@Body('roles') roles?: string[]) {
    return this.mfaService.enforceMfa(roles);
  }

  @Post('backup-codes')
  async generateBackupCodes(@CurrentUser() user: RequestUser) {
    const codes = await this.mfaService.generateBackupCodes(user.id);
    return { codes };
  }

  @Get('status')
  async status(@CurrentUser() user: RequestUser) {
    const [mfaEnabled, fullUser] = await Promise.all([
      this.mfaService.isMfaRequired(user.id),
      this.prisma.user.findUnique({
        where: { id: user.id },
        select: { mfaEnabled: true, lastLoginAt: true, chartesAcceptedAt: true },
      }),
    ]);
    return {
      mfaEnabled,
      lastLoginAt: fullUser?.lastLoginAt,
      chartesAcceptedAt: fullUser?.chartesAcceptedAt,
    };
  }
}
