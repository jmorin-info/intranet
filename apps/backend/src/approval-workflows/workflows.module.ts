import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { WorkflowsController } from "./workflows.controller";
import { WorkflowsService } from "./workflows.service";
import { WorkflowEngineService } from "./workflow-engine.service";
import { DelegationService } from "./delegation.service";
import { DelegationCronService } from "./delegation-cron.service";
import { DelegationsController } from "./delegations.controller";

/**
 * ApprovalWorkflowsModule — Workflows d'approbation configurables (ISO 27001
 * A.5.1) + délégation manuelle/automatique (item #27) + éditeur visuel DAG
 * (item #24).
 *
 * Composants :
 *  - WorkflowsService : CRUD templates + démarrage / décision d'instances.
 *  - WorkflowEngineService : sérialisation / validation DAG + évaluation
 *    runtime des transitions BRANCH (conditions JSON).
 *  - DelegationService : création manuelle, résolution runtime, auto-délégation
 *    + audit log.
 *  - DelegationCronService : cron quotidien d'auto-délégation et expiration.
 */
@Module({
  imports: [PrismaModule],
  controllers: [WorkflowsController, DelegationsController],
  providers: [
    WorkflowsService,
    WorkflowEngineService,
    DelegationService,
    DelegationCronService,
  ],
  exports: [WorkflowsService, WorkflowEngineService, DelegationService],
})
export class ApprovalWorkflowsModule {}
