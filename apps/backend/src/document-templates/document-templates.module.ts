import { Module } from "@nestjs/common";
import { DocumentTemplateController } from "./document-template.controller";
import { DocumentTemplateService } from "./document-template.service";

/**
 * Wave D — DocumentTemplatesModule.
 *
 * Module séparé du DocumentsModule pour éviter une dépendance circulaire :
 * un template instancie un Document via Prisma direct (pas via DocumentsService).
 * AuditService est @Global donc importable sans déclaration explicite.
 */
@Module({
  controllers: [DocumentTemplateController],
  providers: [DocumentTemplateService],
  exports: [DocumentTemplateService],
})
export class DocumentTemplatesModule {}
