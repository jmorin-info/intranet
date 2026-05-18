import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { AdminContentController } from "./admin-content.controller";
import { ContentController } from "./content.controller";
import { ContentRepository } from "./content.repository";
import { ContentService } from "./content.service";

// AuditService est exposé par AuditModule (@Global), pas besoin de l'importer.
@Module({
  imports: [PrismaModule],
  controllers: [AdminContentController, ContentController],
  providers: [ContentRepository, ContentService],
  exports: [ContentService],
})
export class ContentModule {}
