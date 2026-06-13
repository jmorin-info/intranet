import {
  Body,
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from "@nestjs/common";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../auth/decorators/roles.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { UserRole } from "../common/enums";
import { SharePointSyncService } from "./sharepoint-sync.service";
import { SharePointStatus, SharePointSyncResult } from "./types";

/**
 * Endpoints admin pour piloter la sync SharePoint.
 *
 * Toutes les routes exigent ADMIN ou SUPER_ADMIN. Si le feature flag
 * `GED_SHAREPOINT_SYNC_ENABLED` est off, les endpoints de declenchement
 * retournent 503 SERVICE_UNAVAILABLE pour eviter tout appel Graph.
 */
@Controller("admin/sharepoint")
@UseGuards(JwtAuthGuard, RolesGuard)
export class SharePointController {
  constructor(private readonly sync: SharePointSyncService) {}

  /**
   * GET /admin/sharepoint/status
   * Retourne `{ enabled, configured, lastSyncAt }`. Toujours 200, meme
   * si la sync est desactivee (la UI a besoin de ce diagnostic).
   */
  @Get("status")
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async getStatus(): Promise<SharePointStatus> {
    return this.sync.getStatus();
  }

  /**
   * GET /admin/sharepoint/libraries/:siteId
   * Liste les bibliotheques (drives) d'un site SharePoint. Pratique pour
   * que l'admin choisisse le libraryId a synchroniser dans la UI.
   */
  @Get("libraries/:siteId")
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async listLibraries(@Param("siteId") siteId: string) {
    if (!this.sync.isEnabled()) {
      throw new HttpException(
        { enabled: false, message: "SharePoint sync feature flag is disabled" },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
    if (!this.sync.isConfigured()) {
      throw new HttpException(
        {
          enabled: true,
          configured: false,
          message: "SharePoint sync not configured (env vars missing)",
        },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
    const drives = await this.sync.listSiteDrives(siteId);
    return { siteId, drives };
  }

  /**
   * POST /admin/sharepoint/sync
   * Body : `{ siteId, libraryId, maxItems? }`. Declenche un pull
   * synchrone de la bibliotheque. Pour les grosses libs, prevoir un job
   * async en phase 2 (TODO).
   */
  @Post("sync")
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async triggerSync(
    @Body() body: { siteId?: string; libraryId?: string; maxItems?: number },
    @CurrentUser("id") userId: string,
  ): Promise<SharePointSyncResult> {
    if (!this.sync.isEnabled()) {
      throw new HttpException(
        { enabled: false, message: "SharePoint sync feature flag is disabled" },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
    if (!this.sync.isConfigured()) {
      throw new HttpException(
        {
          enabled: true,
          configured: false,
          message: "SharePoint sync not configured (env vars missing)",
        },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    const siteId = (body?.siteId ?? "").trim();
    const libraryId = (body?.libraryId ?? "").trim();
    if (!siteId || !libraryId) {
      throw new HttpException(
        { message: "siteId and libraryId are required" },
        HttpStatus.BAD_REQUEST,
      );
    }

    return this.sync.syncLibrary(siteId, libraryId, {
      maxItems: body?.maxItems,
      triggeredBy: userId,
    });
  }
}
