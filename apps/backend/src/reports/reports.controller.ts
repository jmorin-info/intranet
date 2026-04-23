import {
  Controller,
  Get,
  Query,
  UseGuards,
  Res,
  StreamableFile,
} from "@nestjs/common";
import { Response } from "express";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../auth/decorators/roles.decorator";
import { ReportsService } from "./reports.service";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { RequestUser } from "../common/interfaces";
import { UserRole } from "../common/enums";

@Controller("reports")
@UseGuards(JwtAuthGuard, RolesGuard)
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get("document-registry")
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async getDocumentRegistry(@Res() res: Response) {
    const buffer = await this.reportsService.generateDocumentRegistry();

    res.set({
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="document-registry-${new Date().toISOString().split("T")[0]}.xlsx"`,
      "Content-Length": buffer.length.toString(),
    });

    res.send(buffer);
  }

  @Get("acknowledgment-stats")
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async getAcknowledgmentStats(@Res() res: Response) {
    const buffer = await this.reportsService.generateAcknowledgmentReport();

    res.set({
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="acknowledgment-stats-${new Date().toISOString().split("T")[0]}.xlsx"`,
      "Content-Length": buffer.length.toString(),
    });

    res.send(buffer);
  }

  @Get("audit-trail")
  @Roles(UserRole.SUPER_ADMIN)
  async getAuditTrail(
    @Query("dateFrom") dateFrom: string,
    @Query("dateTo") dateTo: string,
    @Query("action") action: string,
    @Query("userId") userId: string,
    @Res() res: Response,
  ) {
    const buffer = await this.reportsService.generateAuditTrailReport({
      dateFrom,
      dateTo,
      action,
      userId,
    });

    res.set({
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="audit-trail-${new Date().toISOString().split("T")[0]}.xlsx"`,
      "Content-Length": buffer.length.toString(),
    });

    res.send(buffer);
  }

  @Get("dashboard-stats")
  getDashboardStats() {
    return this.reportsService.getDashboardStats();
  }

  @Get("smsi-indicators")
  getSmsiIndicators(@CurrentUser() user: RequestUser) {
    return this.reportsService.getSmsiIndicators(user);
  }

  @Get("monthly-smsi")
  @Roles(UserRole.SUPER_ADMIN)
  async getMonthlyReport(@Res() res: Response) {
    const buffer = await this.reportsService.generateMonthlyReport();
    const date = new Date().toISOString().split("T")[0];
    res.set({
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="rapport-smsi-${date}.xlsx"`,
      "Content-Length": buffer.length.toString(),
    });
    res.send(buffer);
  }

  /**
   * Export PDF structuré du tableau de bord RSSI avec signature SHA-256,
   * horodatage ISO 8601 et UUID d'export (ISO 27001 A.5.35 / A.5.36).
   * Remplace l'export `window.print()` côté frontend.
   */
  @Get("rssi-pdf")
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.DIRECTION)
  async getRssiPdf(@CurrentUser() user: RequestUser, @Res() res: Response) {
    const result = await this.reportsService.generateRssiPdf(user);
    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${result.fileName}"`,
      "Content-Length": String(result.buffer.length),
      "X-Export-Id": result.exportId,
      "X-Export-Hash": result.hash,
      "X-Export-GeneratedAt": result.generatedAt,
      "Cache-Control": "private, no-store",
    });
    res.send(result.buffer);
  }

  @Get("external-access")
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async getExternalAccessReport(@Res() res: Response) {
    const buffer = await this.reportsService.generateExternalAccessReport();
    const date = new Date().toISOString().split("T")[0];
    res.set({
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="registre-acces-prestataires-${date}.xlsx"`,
      "Content-Length": buffer.length.toString(),
    });
    res.send(buffer);
  }

  @Get("quiz-stats")
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async getQuizStats(@Res() res: Response) {
    const buffer = await this.reportsService.generateQuizStatsReport();
    const date = new Date().toISOString().split("T")[0];
    res.set({
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="bilan-quiz-securite-${date}.xlsx"`,
      "Content-Length": buffer.length.toString(),
    });
    res.send(buffer);
  }
}
