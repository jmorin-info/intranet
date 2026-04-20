import { Controller, Get, Post, Patch, Delete, Param, Body, UseGuards, ParseUUIDPipe } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { SatisfactionService } from './satisfaction.service';
import { RequestUser } from '../common/interfaces';
import { UserRole } from '../common/enums';

@Controller('satisfaction')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SatisfactionController {
  constructor(private readonly satisfactionService: SatisfactionService) {}

  @Get('surveys')
  getSurveys() {
    return this.satisfactionService.getSurveys();
  }

  @Get('surveys/:id')
  getSurveyWithQuestions(@Param('id', ParseUUIDPipe) id: string) {
    return this.satisfactionService.getSurveyWithQuestions(id);
  }

  @Post('surveys')
  @Roles(UserRole.ADMIN, UserRole.DIRECTION, UserRole.SUPER_ADMIN)
  createSurvey(@Body() body: {
    title: string;
    description?: string;
    expiresAt?: string;
    isAnonymous?: boolean;
    questions?: Array<{ label: string; type: string; options?: string[]; isRequired?: boolean; description?: string }>;
  }) {
    return this.satisfactionService.createSurvey(body);
  }

  @Post('surveys/:id/respond')
  respond(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { rating: number; comment?: string; answers?: Array<{ questionId: string; value: string }> },
    @CurrentUser() user: RequestUser,
  ) {
    return this.satisfactionService.respond(id, user.id, body.rating, body.comment, body.answers);
  }

  @Get('surveys/:id/results')
  @Roles(UserRole.ADMIN, UserRole.DIRECTION, UserRole.SUPER_ADMIN)
  getResults(@Param('id', ParseUUIDPipe) id: string) {
    return this.satisfactionService.getResults(id);
  }

  @Get('stats')
  @Roles(UserRole.ADMIN, UserRole.DIRECTION, UserRole.SUPER_ADMIN)
  getGlobalStats() {
    return this.satisfactionService.getGlobalStats();
  }

  @Get('response-rate')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  getResponseRate() {
    return this.satisfactionService.getResponseRate();
  }

  @Patch('surveys/:id')
  @Roles(UserRole.ADMIN, UserRole.DIRECTION, UserRole.SUPER_ADMIN)
  updateSurvey(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: {
      title?: string;
      description?: string;
      expiresAt?: string;
      isAnonymous?: boolean;
      questions?: Array<{ id?: string; label: string; type: string; options?: string[]; isRequired?: boolean; description?: string }>;
    },
  ) {
    return this.satisfactionService.updateSurvey(id, body);
  }

  @Delete('surveys/:id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  deleteSurvey(@Param('id', ParseUUIDPipe) id: string) {
    return this.satisfactionService.deleteSurvey(id);
  }
}
