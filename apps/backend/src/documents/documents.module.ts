import { Module } from "@nestjs/common";
import { MulterModule } from "@nestjs/platform-express";
import { DocumentsController } from "./documents.controller";
import { DocumentsService } from "./documents.service";
import { DocumentPermissionsController } from "./document-permissions.controller";
import { DocumentPermissionsService } from "./document-permissions.service";
import { DocumentSharesService } from "./document-shares.service";
import { WorkflowController } from "./workflow/workflow.controller";
import { WorkflowService } from "./workflow/workflow.service";
import { AcknowledgmentsController } from "./acknowledgments/acknowledgments.controller";
import { AcknowledgmentsService } from "./acknowledgments/acknowledgments.service";
import { GedDashboardController } from "./ged-dashboard.controller";
import { GedDashboardService } from "./ged-dashboard.service";
import { NotificationsModule } from "../notifications/notifications.module";
import { ScannerModule } from "../scanner/scanner.module";
import { IsoAnalyzerModule } from "../iso-analyzer/iso-analyzer.module";
import { MentionsModule } from "../mentions/mentions.module";
import { MeilisearchModule } from "../search/meilisearch.module";
import { WorkflowRulesModule } from "../workflow-rules/workflow-rules.module";

@Module({
  imports: [
    MulterModule.register({ storage: undefined }),
    NotificationsModule,
    ScannerModule,
    IsoAnalyzerModule,
    MentionsModule,
    MeilisearchModule,
    WorkflowRulesModule,
  ],
  controllers: [
    // IMPORTANT: WorkflowController et GedDashboardController déclarent des routes
    // statiques sous /documents (`pending`, `rejection-suggestions`, `email-action`,
    // `ged/my-summary`). Ils DOIVENT être enregistrés avant DocumentsController
    // qui expose @Get(':id') avec ParseUUIDPipe — sinon les routes statiques sont
    // capturées par `:id` et renvoient 400.
    WorkflowController,
    GedDashboardController,
    AcknowledgmentsController,
    // DocumentPermissionsController déclare des routes statiques :id/permissions
    // et :id/shares. Il doit également être enregistré AVANT DocumentsController
    // (pour la cohérence d'ordre, même si les segments diffèrent).
    DocumentPermissionsController,
    DocumentsController,
  ],
  providers: [
    DocumentsService,
    DocumentPermissionsService,
    DocumentSharesService,
    WorkflowService,
    AcknowledgmentsService,
    GedDashboardService,
  ],
  exports: [
    DocumentsService,
    AcknowledgmentsService,
    DocumentPermissionsService,
    DocumentSharesService,
  ],
})
export class DocumentsModule {}
