import { Controller, Get, Post, UseGuards, Query } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../common/enums';
import { CyberScoreService } from './cyber-score.service';

/**
 * Endpoints Cyber Score /100 — réservés SUPER_ADMIN (ISO 27001:2022).
 *
 * GET  /cyber-score              — score courant + sous-scores + tendances
 * POST /cyber-score/recompute    — recalcul à la demande + snapshot
 * GET  /cyber-score/history      — historique 90 jours pour sparkline
 */
@Controller('cyber-score')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SUPER_ADMIN)
export class CyberScoreController {
  constructor(private readonly service: CyberScoreService) {}

  @Get()
  async getScore() {
    return this.service.computeAndSnapshot({ persist: false });
  }

  @Post('recompute')
  async recompute() {
    return this.service.computeAndSnapshot({ persist: true });
  }

  @Get('history')
  async history(@Query('days') days?: string) {
    const d = Math.max(1, Math.min(365, parseInt(days || '90', 10) || 90));
    return this.service.getHistory(d);
  }
}
