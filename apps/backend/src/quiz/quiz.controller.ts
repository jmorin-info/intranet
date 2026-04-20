import { Controller, Get, Post, Put, Patch, Delete, Body, Query, Param, UseGuards, ParseUUIDPipe, Res } from '@nestjs/common';
import { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { QuizService } from './quiz.service';
import { RequestUser } from '../common/interfaces';
import { UserRole } from '../common/enums';

@Controller('quiz')
@UseGuards(JwtAuthGuard, RolesGuard)
export class QuizController {
  constructor(private readonly quizService: QuizService) {}

  @Get('questions')
  getQuestions(@Query('count') count?: string) {
    return this.quizService.getRandomQuestions(parseInt(count || '10'));
  }

  @Get('stats')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  getStats() {
    return this.quizService.getParticipationStats();
  }

  @Post('submit')
  submit(@CurrentUser() user: RequestUser, @Body() body: { score: number; total: number; answers: Record<string, number>; campaignTitle?: string }) {
    return this.quizService.submitResult(user.id, body.score, body.total, body.answers, body.campaignTitle);
  }

  @Get('certificate/:auditLogId')
  async getCertificate(@Param('auditLogId', ParseUUIDPipe) auditLogId: string, @Res() res: Response) {
    const data = await this.quizService.getCertificateData(auditLogId);
    const html = this.quizService.generateCertificate(
      data.userId, data.userName, data.campaignTitle, data.score, data.total, data.date, data.auditLogId,
    );
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  }

  @Get('leaderboard')
  leaderboard() {
    return this.quizService.getLeaderboard();
  }

  @Get('my-results')
  myResults(@CurrentUser() user: RequestUser, @Query('limit') limit?: string) {
    return this.quizService.getMyResults(user.id, limit ? parseInt(limit, 10) : 20);
  }

  @Put('questions')
  @Roles(UserRole.SUPER_ADMIN)
  updateQuestions(@Body() body: any[]) {
    return this.quizService.updateQuestions(body);
  }

  // =========================================================================
  // Campaign endpoints
  // =========================================================================

  @Get('campaigns')
  getCampaigns() {
    return this.quizService.getCampaigns();
  }

  @Post('campaigns')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  createCampaign(
    @Body() body: { title: string; description?: string; isActive?: boolean; questions: any[]; passingScore?: number },
  ) {
    return this.quizService.createCampaign(body);
  }

  @Get('campaigns/:id')
  getCampaignById(@Param('id', ParseUUIDPipe) id: string) {
    return this.quizService.getCampaignById(id);
  }

  @Patch('campaigns/:id')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  updateCampaign(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { title?: string; description?: string; isActive?: boolean; questions?: any; passingScore?: number },
  ) {
    return this.quizService.updateCampaign(id, body);
  }

  @Delete('campaigns/:id')
  @Roles(UserRole.SUPER_ADMIN)
  deleteCampaign(@Param('id', ParseUUIDPipe) id: string) {
    return this.quizService.deleteCampaign(id);
  }
}
