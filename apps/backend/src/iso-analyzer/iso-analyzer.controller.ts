import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  ParseUUIDPipe,
} from "@nestjs/common";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../auth/decorators/roles.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { IsoAnalyzerService } from "./iso-analyzer.service";
import { AuditService } from "../audit/audit.service";
import { RequestUser } from "../common/interfaces";
import { UserRole } from "../common/enums";

@Controller("iso-analyzer")
@UseGuards(JwtAuthGuard, RolesGuard)
export class IsoAnalyzerController {
  constructor(
    private readonly isoAnalyzerService: IsoAnalyzerService,
    private readonly auditService: AuditService,
  ) {}

  /**
   * Analyze a document and return suggested ISO 27001 control mappings
   * with relevance scores and conformity justifications.
   *
   * Sécurité (fix 2026-07) : ouvert à TOUS les rôles authentifiés — le
   * contrôle d'accès par classification (ISO 27001 A.5.15) est appliqué
   * dans le service : un utilisateur n'analyse que ce qu'il peut lire.
   */
  @Get("analyze/:documentId")
  async analyzeDocument(
    @Param("documentId", ParseUUIDPipe) documentId: string,
    @CurrentUser() user: RequestUser,
  ) {
    const results = await this.isoAnalyzerService.analyzeDocument(documentId, {
      id: user.id,
      role: user.role,
    });

    await this.auditService.log({
      userId: user.id,
      action: "ISO_ANALYSIS_RUN",
      resourceType: "Document",
      resourceId: documentId,
      metadata: { matchCount: results.length },
    });

    return { documentId, results, analyzedAt: new Date().toISOString() };
  }

  /**
   * Auto-assign ISO controls to a document based on content analysis.
   * Only assigns controls with relevance score >= threshold.
   */
  @Post("auto-assign/:documentId")
  @Roles(UserRole.ADMIN, UserRole.REVIEWER, UserRole.SUPER_ADMIN)
  async autoAssignControls(
    @Param("documentId", ParseUUIDPipe) documentId: string,
    @Query("threshold") threshold: string,
    @CurrentUser() user: RequestUser,
  ) {
    const thresholdNum = Math.max(0, Math.min(100, parseInt(threshold, 10) || 50));
    const result = await this.isoAnalyzerService.autoAssignControls(documentId, thresholdNum);

    await this.auditService.log({
      userId: user.id,
      action: "ISO_AUTO_ASSIGN",
      resourceType: "Document",
      resourceId: documentId,
      metadata: { assigned: result.assigned, controls: result.controls },
    });

    return result;
  }

  /**
   * Full ISO 27001 compliance gap analysis across all controls.
   * Shows which controls are covered by approved documents.
   */
  @Get("gap-analysis")
  @Roles(
    UserRole.ADMIN,
    UserRole.SUPER_ADMIN,
    UserRole.DIRECTION,
    UserRole.AUDITEUR,
    UserRole.REVIEWER,
  )
  async getGapAnalysis() {
    return this.isoAnalyzerService.generateComplianceGapAnalysis();
  }

  /**
   * Summary compliance statistics with coverage percentages per domain.
   */
  @Get("compliance-summary")
  @Roles(
    UserRole.ADMIN,
    UserRole.SUPER_ADMIN,
    UserRole.DIRECTION,
    UserRole.AUDITEUR,
    UserRole.REVIEWER,
  )
  async getComplianceSummary() {
    return this.isoAnalyzerService.getComplianceSummary();
  }

  /**
   * Scan ALL documents and auto-assign ISO controls based on content analysis.
   * Recalculates full compliance coverage from scratch.
   */
  @Post("scan-all")
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  async scanAllDocuments(@Query("threshold") threshold: string, @CurrentUser() user: RequestUser) {
    const thresholdNum = Math.max(0, Math.min(100, parseInt(threshold, 10) || 35));
    const result = await this.isoAnalyzerService.scanAllDocuments(thresholdNum);

    await this.auditService.log({
      userId: user.id,
      action: "ISO_FULL_SCAN",
      resourceType: "IsoControl",
      metadata: result,
    });

    return result;
  }

  /**
   * Auto-suggest classification, category and tags for a document.
   * Restreint aux rédacteurs/admins : appelle le LLM (coûteux, risque DoS si exposé à tout user authentifié).
   */
  @Post("classify")
  @Roles(UserRole.ADMIN, UserRole.REVIEWER, UserRole.SUPER_ADMIN, UserRole.AUDITEUR)
  async suggestClassification(@Body() body: { title: string; description: string }) {
    return this.isoAnalyzerService.suggestClassification(body.title, body.description || "");
  }
}
