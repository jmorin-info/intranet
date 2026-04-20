import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { WorkflowsController } from './workflows.controller';
import { WorkflowsService } from './workflows.service';

/**
 * ApprovalWorkflowsModule — Module scaffold pour les workflows d'approbation
 * configurables (ISO 27001 A.5.1).
 *
 * Non enregistré dans app.module.ts pour l'instant : à brancher manuellement
 * après la migration Prisma.
 */
@Module({
  imports: [PrismaModule],
  controllers: [WorkflowsController],
  providers: [WorkflowsService],
  exports: [WorkflowsService],
})
export class ApprovalWorkflowsModule {}
