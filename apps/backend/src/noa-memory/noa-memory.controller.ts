import {
  Controller,
  Delete,
  Get,
  Param,
  Query,
  Res,
  UseGuards,
} from "@nestjs/common";
import type { Response } from "express";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { RequestUser } from "../common/interfaces";
import { AuditService } from "../audit/audit.service";
import { NoaMemoryService } from "./noa-memory.service";

/**
 * Wave D — Item 31 — Endpoints mémoire Noa.
 *
 * Tous les endpoints sont scopés au user courant (jamais d'accès cross-user
 * même pour les admins — la mémoire personnelle est privée).
 *
 * Conformité RGPD :
 *   - GET /me/export : right of access (article 15) — JSON téléchargeable.
 *   - DELETE /:id    : right to erasure ciblé (article 17).
 *   - DELETE /all    : right to erasure global.
 */
@Controller("noa/memory")
@UseGuards(JwtAuthGuard)
export class NoaMemoryController {
  constructor(
    private readonly memory: NoaMemoryService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  async list(
    @CurrentUser() user: RequestUser,
    @Query("page") page?: string,
    @Query("limit") limit?: string,
  ) {
    return this.memory.list(user.id, {
      page: page ? Number.parseInt(page, 10) : undefined,
      limit: limit ? Number.parseInt(limit, 10) : undefined,
    });
  }

  @Get("export")
  async export(
    @CurrentUser() user: RequestUser,
    @Res() res: Response,
  ): Promise<void> {
    const payload = await this.memory.exportForUser(user.id);
    await this.audit.log({
      userId: user.id,
      action: "NOA_MEMORY_EXPORTED",
      resourceType: "NoaMemory",
      metadata: { itemCount: payload.items.length },
      severity: "INFO",
    });
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=\"noa-memory-${user.id}.json\"`,
    );
    res.send(JSON.stringify(payload, null, 2));
  }

  @Delete("all")
  async forgetAll(@CurrentUser() user: RequestUser) {
    const count = await this.memory.forgetAll(user.id);
    await this.audit.log({
      userId: user.id,
      action: "NOA_MEMORY_FORGOTTEN_ALL",
      resourceType: "NoaMemory",
      metadata: { deletedCount: count },
      severity: "WARN",
    });
    return { deleted: count };
  }

  @Delete(":id")
  async forget(
    @CurrentUser() user: RequestUser,
    @Param("id") id: string,
  ) {
    const ok = await this.memory.forget(user.id, id);
    if (ok) {
      await this.audit.log({
        userId: user.id,
        action: "NOA_MEMORY_FORGOTTEN",
        resourceType: "NoaMemory",
        resourceId: id,
        severity: "INFO",
      });
    }
    return { deleted: ok };
  }
}
