import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { NotificationsModule } from "../notifications/notifications.module";
// AuditModule is @Global so AuditService is auto-provided.
import {
  BehaviorAlertController,
  BehaviorRuleController,
} from "./behavior-alert.controller";
import { BehaviorDetectionService } from "./behavior-detection.service";

/**
 * Wave D — Item 28 — module UEBA.
 *
 * - BehaviorDetectionService : cron 5 min, évaluation des règles R001..R008.
 * - BehaviorAlertController : endpoints liste / triage des alertes.
 * - BehaviorRuleController : toggle / ajustement des règles (SUPER_ADMIN).
 *
 * Notifications RSSI : injectées si NotificationsModule est dispo (le service
 * est `@Optional()` côté detection-service pour tolérer les contextes de test).
 */
@Module({
  imports: [PrismaModule, NotificationsModule],
  controllers: [BehaviorAlertController, BehaviorRuleController],
  providers: [BehaviorDetectionService],
  exports: [BehaviorDetectionService],
})
export class BehaviorDetectionModule {}
