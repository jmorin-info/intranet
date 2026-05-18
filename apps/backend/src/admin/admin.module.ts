import { Module } from "@nestjs/common";
import { AdminBackupController } from "./admin-backup.controller";
import { AdminBackupService } from "./admin-backup.service";
import { AdminWebdavController } from "./admin-webdav.controller";
import { AdminChatFeedbackController } from "./admin-chat-feedback.controller";
import { AdminIntegrationsController } from "./admin-integrations.controller";
import { PrismaModule } from "../prisma/prisma.module";
import { AuditModule } from "../audit/audit.module";
import { CalendarModule } from "../calendar/calendar.module";

/**
 * Wave D — Module admin (cross-cutting endpoints utilitaires).
 *
 * Endpoints ops + administration features cross-modules (toggles globaux,
 * permissions per-user). Réservé ADMIN+ ou SUPER_ADMIN selon l'endpoint.
 */
@Module({
  imports: [PrismaModule, AuditModule, CalendarModule],
  controllers: [
    AdminBackupController,
    AdminWebdavController,
    AdminChatFeedbackController,
    AdminIntegrationsController,
  ],
  providers: [AdminBackupService],
  exports: [AdminBackupService],
})
export class AdminModule {}
