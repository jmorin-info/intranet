import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequestUser } from '../common/interfaces';
import { TipsService } from './tips.service';

@Controller('tips')
@UseGuards(JwtAuthGuard)
export class TipsController {
  constructor(private readonly tipsService: TipsService) {}

  /**
   * GET /tips/changelog?version=2.0
   * Returns the changelog entries. Optionally filter by version.
   */
  @Get('changelog')
  getChangelog(@Query('version') version?: string) {
    return this.tipsService.getChangelog(version);
  }

  /**
   * GET /tips?context=welcome&role=ADMIN
   * Returns tips filtered by context and the user's role.
   * If `context` is omitted, returns tips for all contexts.
   * The `role` query param is optional — if omitted, the authenticated user's role is used.
   */
  @Get()
  getTips(
    @Query('context') context: string | undefined,
    @CurrentUser() user: RequestUser,
  ) {
    return this.tipsService.getTips(context, user.role);
  }

  /**
   * POST /tips/:id/dismiss
   * Records that the current user has dismissed a specific tip.
   * Returns the updated list of dismissed tip IDs for the user.
   */
  @Post(':id/dismiss')
  @HttpCode(HttpStatus.OK)
  dismissTip(
    @Param('id') tipId: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.tipsService.dismissTip(user.id, tipId);
  }

  /**
   * GET /tips/dismissed
   * Returns the list of tip IDs the current user has dismissed.
   */
  @Get('dismissed')
  getDismissedTips(@CurrentUser() user: RequestUser) {
    return this.tipsService.getDismissedTips(user.id);
  }
}
