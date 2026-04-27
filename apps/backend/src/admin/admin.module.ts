import { Module } from "@nestjs/common";
import { AdminBackupController } from "./admin-backup.controller";
import { AdminBackupService } from "./admin-backup.service";
import { AdminWebdavController } from "./admin-webdav.controller";
import { PrismaModule } from "../prisma/prisma.module";
import { AuditModule } from "../audit/audit.module";

/**
 * Wave D — Module admin (cross-cutting endpoints utilitaires).
 *
 * Endpoints ops + administration features cross-modules (toggles globaux,
 * permissions per-user). Réservé ADMIN+ ou SUPER_ADMIN selon l'endpoint.
 */
@Module({
  imports: [PrismaModule, AuditModule],
  controllers: [AdminBackupController, AdminWebdavController],
  providers: [AdminBackupService],
  exports: [AdminBackupService],
})
export class AdminModule {}
