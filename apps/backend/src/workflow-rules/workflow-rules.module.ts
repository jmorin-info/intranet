import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { WorkflowRulesService } from "./workflow-rules.service";
import { WorkflowRulesController } from "./workflow-rules.controller";

/**
 * Module règles d'approbation N+1 dynamique (ISO 27001 A.5.1).
 *
 * Exporté pour pouvoir être injecté dans DocumentsService — branchement
 * effectif dans documents.service.create() : on cherche une règle
 * applicable au moment de la création du document, et si match on
 * instancie le workflow correspondant ; sinon fallback sur reviewerId.
 */
@Module({
  imports: [PrismaModule],
  providers: [WorkflowRulesService],
  controllers: [WorkflowRulesController],
  exports: [WorkflowRulesService],
})
export class WorkflowRulesModule {}
