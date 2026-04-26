import { Module } from "@nestjs/common";
import { BullModule } from "@nestjs/bullmq";
import { PrismaModule } from "../prisma/prisma.module";
import { AuditModule } from "../audit/audit.module";
import { DataExportController } from "./data-export.controller";
import { DataExportService } from "./data-export.service";

/**
 * Module RGPD : pousse les jobs d'export asynchrone sur la queue BullMQ
 * `data-export` (le processor lui-meme reste dans `JobsModule` car il
 * peut etre desactive/relocalise selon la topologie de deploiement).
 *
 * Pre-requis : la queue `data-export` est aussi enregistree dans
 * `JobsModule`. Les enregistrements multiples sur le meme nom sont
 * idempotents cote BullMQ (singleton par nom de queue).
 */
@Module({
  imports: [
    PrismaModule,
    AuditModule,
    BullModule.registerQueue({ name: "data-export" }),
  ],
  controllers: [DataExportController],
  providers: [DataExportService],
  exports: [DataExportService],
})
export class DataExportModule {}
