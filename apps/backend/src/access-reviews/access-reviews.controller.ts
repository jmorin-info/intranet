import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequestUser } from '../common/interfaces';
import { UserRole } from '../common/enums';
import { AccessReviewsService } from './access-reviews.service';
import { CreateCampaignDto } from './dto/create-campaign.dto';
import { ReviewDecisionDto } from './dto/review-decision.dto';

@Controller('access-reviews')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AccessReviewsController {
  constructor(private readonly service: AccessReviewsService) {}

  @Post('campaigns')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  createCampaign(
    @Body() dto: CreateCampaignDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.createCampaign(dto, user.id);
  }

  @Get('campaigns')
  @Roles(UserRole.REVIEWER, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  findCampaigns() {
    return this.service.findCampaigns();
  }

  @Get('campaigns/:id')
  @Roles(UserRole.REVIEWER, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  findCampaignById(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.findCampaignById(id);
  }

  @Post('campaigns/:id/close')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  closeCampaign(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.closeCampaign(id, user.id);
  }

  @Get('campaigns/:id/report')
  @Roles(UserRole.REVIEWER, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  getCampaignReport(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.getCampaignReport(id);
  }

  @Get('my')
  findMyReviews(@CurrentUser() user: RequestUser) {
    return this.service.findMyReviews(user.id, user.role);
  }

  @Post(':reviewId/decision')
  submitDecision(
    @Param('reviewId', ParseUUIDPipe) reviewId: string,
    @Body() dto: ReviewDecisionDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.submitDecision(
      reviewId,
      dto.decision,
      dto.comments,
      user.id,
      user.role,
    );
  }
}
