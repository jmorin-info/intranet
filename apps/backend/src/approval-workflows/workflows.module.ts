import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { WorkflowsController } from "./workflows.controller";
import { WorkflowsService } from "./workflows.service";
import { WorkflowEngineService } from "./workflow-engine.service";

/**
 * ApprovalWorkflowsModule — Workflows d'approbation configurables (ISO 27001
 * A.5.1) + éditeur visuel DAG (item #24).
 *
 * Composants :
 *  - WorkflowsService : CRUD templates + démarrage / décision d'instances.
 *  - WorkflowEngineService : sérialisation / validation DAG + évaluation
 *    runtime des transitions BRANCH (conditions JSON).
 */
@Module({
  imports: [PrismaModule],
  controllers: [WorkflowsController],
  providers: [WorkflowsService, WorkflowEngineService],
  exports: [WorkflowsService, WorkflowEngineService],
})
export class ApprovalWorkflowsModule {}
