import {
  Controller,
  Get,
  Param,
  Query,
  Res,
  UseGuards,
  ParseUUIDPipe,
} from "@nestjs/common";
import { Response } from "express";
import { AuditService } from "./audit.service";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../auth/decorators/roles.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { RequestUser } from "../common/interfaces";
import { UserRole } from "../common/enums";
import { rowsToCsv, csvFilename, CsvColumn } from "../common/utils/csv-export";

@Controller("audit")
@UseGuards(JwtAuthGuard, RolesGuard)
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  /** Own activity — accessible to all authenticated users. Limit capped pour éviter data exfiltration. */
  @Get("my-activity")
  async getMyActivity(
    @CurrentUser() user: RequestUser,
    @Query("limit") limit?: string,
  ) {
    const raw = limit ? parseInt(limit, 10) : 10;
    const cappedLimit = Number.isFinite(raw)
      ? Math.min(Math.max(raw, 1), 100)
      : 10;
    return this.auditService.findAll({
      userId: user.id,
      page: 1,
      limit: cappedLimit,
    });
  }

  @Get()
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async findAll(
    @Query("userId") userId?: string,
    @Query("action") action?: string,
    @Query("resourceType") resourceType?: string,
    @Query("severity") severity?: string,
    @Query("bulk") bulk?: string,
    @Query("dateFrom") dateFrom?: string,
    @Query("dateTo") dateTo?: string,
    @Query("page") page?: string,
    @Query("limit") limit?: string,
  ) {
    return this.auditService.findAll({
      userId,
      action,
      resourceType,
      severity,
      bulk: bulk === "true" ? true : undefined,
      dateFrom: dateFrom ? new Date(dateFrom) : undefined,
      dateTo: dateTo ? new Date(dateTo) : undefined,
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 50,
    });
  }

  /**
   * CSV export of the audit log (max 1000 rows).
   * ISO 27001 A.5.10 / A.8.15 — export contrôlé des journaux d'audit.
   * SUPER_ADMIN only: contains PII and security events.
   */
  @Get("export/csv")
  @Roles(UserRole.SUPER_ADMIN)
  async exportCsv(
    @Query("userId") userId: string | undefined,
    @Query("action") action: string | undefined,
    @Query("resourceType") resourceType: string | undefined,
    @Query("severity") severity: string | undefined,
    @Query("bulk") bulk: string | undefined,
    @Query("dateFrom") dateFrom: string | undefined,
    @Query("dateTo") dateTo: string | undefined,
    @Res() res: Response,
  ) {
    const result = await this.auditService.findAll({
      userId,
      action,
      resourceType,
      severity,
      bulk: bulk === "true" ? true : undefined,
      dateFrom: dateFrom ? new Date(dateFrom) : undefined,
      dateTo: dateTo ? new Date(dateTo) : undefined,
      page: 1,
      limit: 1000,
    });
    const rows = result.data;

    type AuditRow = {
      createdAt: Date | string;
      action: string;
      resourceType: string;
      resourceId: string | null;
      userId: string | null;
      user?: { email: string } | null;
      ipAddress: string | null;
      userAgent: string | null;
      severity?: string;
    };

    const columns: CsvColumn<AuditRow>[] = [
      {
        header: "Date",
        accessor: (a) =>
          a.createdAt ? new Date(a.createdAt).toISOString() : "",
      },
      { header: "Action", accessor: (a) => a.action },
      { header: "Type ressource", accessor: (a) => a.resourceType },
      { header: "ID ressource", accessor: (a) => a.resourceId ?? "" },
      {
        header: "Utilisateur",
        accessor: (a) => a.user?.email ?? a.userId ?? "",
      },
      { header: "IP", accessor: (a) => a.ipAddress ?? "" },
      { header: "User-Agent", accessor: (a) => a.userAgent ?? "" },
    ];

    const csv = rowsToCsv<AuditRow>(rows as AuditRow[], columns);

    res.set({
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${csvFilename("audit")}"`,
      "Cache-Control": "private, no-store",
    });
    res.send(csv);
  }

  /**
   * Statistiques d'audit pour la frise et le rapport trimestriel.
   * ISO 27001 A.5.36 — Revue du journal d'audit.
   * Accessible ADMIN et SUPER_ADMIN.
   */
  @Get("stats")
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async getStats(@Query("from") from?: string, @Query("to") to?: string) {
    // Par défaut : 30 derniers jours
    const now = new Date();
    const defaultFrom = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const fromDate = from ? new Date(from) : defaultFrom;
    const toDate = to ? new Date(to) : now;
    return this.auditService.getStats(fromDate, toDate);
  }

  @Get("resource/:type/:id")
  @Roles(UserRole.ADMIN)
  async findByResource(
    @Param("type") type: string,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.auditService.findByResource(type, id);
  }
}
