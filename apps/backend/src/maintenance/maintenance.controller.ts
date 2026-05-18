import { Body, Controller, Get, Patch, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../auth/decorators/roles.decorator";
import { Public } from "../auth/decorators/public.decorator";
import { UserRole } from "../common/enums";
import { AuditService } from "../audit/audit.service";
import { MaintenanceService } from "./maintenance.service";

/**
 * - GET   /api/v1/maintenance/status        : public, pollé par le frontend (5s)
 * - GET   /api/v1/admin/maintenance         : admin, équivalent verbose
 * - PATCH /api/v1/admin/maintenance         : SUPER_ADMIN — toggle ON/OFF
 *
 * Le toggle est aussi exécutable depuis scripts/deploy.sh qui passe par
 * psql directement (zéro dépendance à un token admin durant le deploy).
 */
@Controller()
export class MaintenanceController {
  constructor(
    private readonly maintenance: MaintenanceService,
    private readonly audit: AuditService,
  ) {}

  @Get("maintenance/status")
  @Public()
  async publicStatus() {
    return this.maintenance.getStatus();
  }

  @Get("admin/maintenance")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async adminStatus() {
    return this.maintenance.getStatus();
  }

  @Patch("admin/maintenance")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN)
  async toggle(
    @Body()
    body: {
      enabled: boolean;
      message?: string;
      estimatedReturnTime?: string;
    },
  ) {
    const enabled = Boolean(body?.enabled);
    const result = await this.maintenance.setEnabled(enabled, {
      message: typeof body?.message === "string" ? body.message : undefined,
      estimatedReturnTime:
        typeof body?.estimatedReturnTime === "string"
          ? body.estimatedReturnTime
          : undefined,
    });
    void this.audit.log({
      action: enabled ? "MAINTENANCE_ENABLED" : "MAINTENANCE_DISABLED",
      resourceType: "AppConfig",
      resourceId: "maintenance_mode",
      severity: enabled ? "WARN" : "INFO",
      metadata: { message: body?.message },
    });
    return result;
  }
}
