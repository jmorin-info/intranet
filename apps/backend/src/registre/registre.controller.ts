import {
  Controller,
  Get,
  Header,
  Query,
  Res,
  UseGuards,
} from "@nestjs/common";
import { Response } from "express";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../auth/decorators/roles.decorator";
import { UserRole } from "../common/enums";
import { csvFilename } from "../common/utils/csv-export";
import { RegistreService } from "./registre.service";
import { RegistreFilter } from "./types";

/**
 * Controller du module Registre Documentaire (vue admin REG_016 du SMSI).
 *
 * Endpoints en LECTURE SEULE :
 *   GET /admin/registre          -> liste enrichie REG_016
 *   GET /admin/registre/export   -> CSV (BOM UTF-8, `;`)
 *   GET /admin/registre/stats    -> counts pour dashboard
 *
 * Les mutations sur les documents passent par /documents/*.
 *
 * Securite : ADMIN + SUPER_ADMIN uniquement — la vue Registre expose
 * potentiellement des metadonnees sensibles (classification SECRET).
 */
@Controller("admin/registre")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
export class RegistreController {
  constructor(private readonly registreService: RegistreService) {}

  /**
   * Convertit les query strings (toutes string) en RegistreFilter type.
   * Pour `blocking`, accepte "true"/"false"/"1"/"0". Tout autre flag est
   * ignore (= filtre absent).
   */
  private parseFilter(
    level?: string,
    category?: string,
    priority?: string,
    blocking?: string,
    classification?: string,
  ): RegistreFilter {
    const filter: RegistreFilter = {};
    if (level) filter.level = level;
    if (category) filter.category = category;
    if (priority) filter.priority = priority;
    if (classification) filter.classification = classification;
    if (blocking === "true" || blocking === "1") filter.blocking = true;
    else if (blocking === "false" || blocking === "0") filter.blocking = false;
    return filter;
  }

  /**
   * Liste paginee (ici : sans pagination — REG_016 reste petit) des documents
   * formattes pour la vue Registre.
   */
  @Get()
  async list(
    @Query("level") level?: string,
    @Query("category") category?: string,
    @Query("priority") priority?: string,
    @Query("blocking") blocking?: string,
    @Query("classification") classification?: string,
  ) {
    const filter = this.parseFilter(
      level,
      category,
      priority,
      blocking,
      classification,
    );
    const rows = await this.registreService.listForRegistre(filter);
    return { items: rows, total: rows.length };
  }

  /**
   * Export CSV du registre (RFC 4180 + BOM UTF-8 pour Excel FR).
   *
   * Implementation : on ecrit la reponse manuellement pour controller le
   * Content-Type et le Content-Disposition (les decorateurs Nest seuls ne
   * suffisent pas a forcer un nom de fichier dynamique).
   */
  @Get("export")
  @Header("Content-Type", "text/csv; charset=utf-8")
  async export(
    @Res() res: Response,
    @Query("level") level?: string,
    @Query("category") category?: string,
    @Query("priority") priority?: string,
    @Query("blocking") blocking?: string,
    @Query("classification") classification?: string,
  ) {
    const filter = this.parseFilter(
      level,
      category,
      priority,
      blocking,
      classification,
    );
    const csv = await this.registreService.exportCsv(filter);
    const filename = csvFilename("registre_documentaire");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${filename}"`,
    );
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.send(csv);
  }

  /**
   * Counts par dimension pour alimenter le tableau de bord admin.
   * Pas de filtre : c'est toujours la vue globale du SMSI.
   */
  @Get("stats")
  async stats() {
    return this.registreService.stats();
  }
}
