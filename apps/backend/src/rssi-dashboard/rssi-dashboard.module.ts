import { Module } from '@nestjs/common';
import { RssiDashboardController } from './rssi-dashboard.controller';
import { RssiDashboardService } from './rssi-dashboard.service';

@Module({
  controllers: [RssiDashboardController],
  providers: [RssiDashboardService],
  exports: [RssiDashboardService],
})
export class RssiDashboardModule {}
