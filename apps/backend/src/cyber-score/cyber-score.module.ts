import { Module } from '@nestjs/common';
import { CyberScoreController } from './cyber-score.controller';
import { CyberScoreService } from './cyber-score.service';

/**
 * Module Cyber Score /100 (ISO 27001:2022).
 *
 * Expose :
 *  - GET  /cyber-score              — score global + 10 sous-scores + tendances
 *  - POST /cyber-score/recompute    — recalcul à la demande (SUPER_ADMIN)
 *  - GET  /cyber-score/history      — historique 90 derniers jours pour sparkline
 *
 * Cron hebdomadaire (dimanche 3h) : historise un snapshot pour suivre la trend.
 */
@Module({
  controllers: [CyberScoreController],
  providers: [CyberScoreService],
  exports: [CyberScoreService],
})
export class CyberScoreModule {}
