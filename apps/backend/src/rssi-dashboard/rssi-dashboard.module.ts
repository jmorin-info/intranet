import { Module } from '@nestjs/common';
import { RssiDashboardController } from './rssi-dashboard.controller';
import { RssiDashboardService } from './rssi-dashboard.service';
import { RssiSmsiPdfGenerator } from './pdf-generator';
import { ExportsModule } from '../exports/exports.module';
import { CyberScoreModule } from '../cyber-score/cyber-score.module';

@Module({
  imports: [ExportsModule, CyberScoreModule],
  controllers: [RssiDashboardController],
  providers: [RssiDashboardService, RssiSmsiPdfGenerator],
  exports: [RssiDashboardService],
})
export class RssiDashboardModule {}
