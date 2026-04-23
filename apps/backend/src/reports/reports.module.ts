import { Module } from "@nestjs/common";
import { NotificationsModule } from "../notifications/notifications.module";
import { ExportsModule } from "../exports/exports.module";
import { IsoAnalyzerModule } from "../iso-analyzer/iso-analyzer.module";
import { ReportsController } from "./reports.controller";
import { ReportsService } from "./reports.service";

@Module({
  imports: [NotificationsModule, ExportsModule, IsoAnalyzerModule],
  controllers: [ReportsController],
  providers: [ReportsService],
})
export class ReportsModule {}
