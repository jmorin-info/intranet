import { Controller, Get, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../auth/decorators/roles.decorator";
import { UserRole } from "../common/enums";
import {
  AdminBackupService,
  BackupStatusResponse,
} from "./admin-backup.service";

/**
 * Wave D item 20 — Endpoint admin pour visualiser l'état du backup offsite.
 *
 * Routes :
 *   GET /api/v1/admin/backup/status  → statut snapshot Restic (SUPER_ADMIN)
 *
 * Lecture seule. Aucune action destructive ; pour restore/prune passer
 * par les scripts shell (scripts/backup/restore-database.sh, etc.).
 */
@Controller("admin/backup")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SUPER_ADMIN)
export class AdminBackupController {
  constructor(private readonly adminBackupService: AdminBackupService) {}

  @Get("status")
  async getStatus(): Promise<BackupStatusResponse> {
    return this.adminBackupService.getStatus();
  }
}
