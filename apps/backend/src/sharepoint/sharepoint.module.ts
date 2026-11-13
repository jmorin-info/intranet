import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { SharePointController } from "./sharepoint.controller";
import { SharePointSyncService } from "./sharepoint-sync.service";
import { SharePointSyncScheduler } from "./sharepoint-sync.scheduler";

/**
 * Module SharePoint — sync App-only depuis SharePoint Online vers
 * la GED intranet (modele Document).
 *
 * Feature-flagged par `GED_SHAREPOINT_SYNC_ENABLED`. Le module est
 * toujours charge (pour exposer le statut), mais les operations Graph
 * sont court-circuitees si le flag est off.
 *
 * Dependances :
 *  - PrismaModule (lookup/update Document)
 *  - AuditModule est `@Global()`, AuditService est donc injectable
 *    directement sans import explicite.
 *  - `@nestjs/schedule` (ScheduleModule.forRoot()) est deja initialise
 *    dans AppModule, donc le `@Cron` de {@link SharePointSyncScheduler}
 *    s'enregistre automatiquement.
 */
@Module({
  imports: [PrismaModule],
  controllers: [SharePointController],
  providers: [SharePointSyncService, SharePointSyncScheduler],
  exports: [SharePointSyncService],
})
export class SharePointModule {}
