import { Controller, Get, Header, Query, Res, UseGuards } from "@nestjs/common";
import { Response } from "express";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../auth/decorators/roles.decorator";
import { UserRole } from "../common/enums";
import { csvFilename } from "../common/utils/csv-export";
import { RegistreService } from "./registre.service";
import {
  RegistreFilter,
  RegistreSortBy,
  REGISTRE_DEFAULT_PAGE_SIZE,
  REGISTRE_MAX_PAGE_SIZE,
  REGISTRE_SORT_BY_VALUES,
} from "./types";

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
   *
   * Regles de parsing :
   *   - `blocking` : "true"/"false"/"1"/"0", sinon ignore
   *   - `sortBy`   : valide contre REGISTRE_SORT_BY_VALUES (whitelist),
   *                  toute valeur inconnue retombe en silence sur "reference"
   *                  (cote service via normalizePaging)
   *   - `sortDir`  : "asc"/"desc", defaut "asc"
   *   - `page`     : entier >= 1, defaut 1
   *   - `pageSize` : entier dans [1, REGISTRE_MAX_PAGE_SIZE], defaut
   *                  REGISTRE_DEFAULT_PAGE_SIZE
   *   - `search`   : trim, ignore si vide
   */
  private parseFilter(
    level?: string,
    category?: string,
    priority?: string,
    blocking?: string,
    classification?: string,
    search?: string,
    sortBy?: string,
    sortDir?: string,
    page?: string,
    pageSize?: string,
  ): RegistreFilter {
    const filter: RegistreFilter = {};
    if (level) filter.level = level;
    if (category) filter.category = category;
    if (priority) filter.priority = priority;
    if (classification) filter.classification = classification;
    if (blocking === "true" || blocking === "1") filter.blocking = true;
    else if (blocking === "false" || blocking === "0") filter.blocking = false;

    const trimmedSearch = search?.trim();
    if (trimmedSearch) filter.search = trimmedSearch;

    // Whitelist stricte du tri — toute valeur hors liste est ignoree ici, et
    // le service appliquera le defaut 'reference' (defense en profondeur).
    if (sortBy && REGISTRE_SORT_BY_VALUES.includes(sortBy as RegistreSortBy)) {
      filter.sortBy = sortBy as RegistreSortBy;
    }
    if (sortDir === "asc" || sortDir === "desc") {
      filter.sortDir = sortDir;
    }

    const pageNum = page ? Number.parseInt(page, 10) : NaN;
    if (Number.isFinite(pageNum) && pageNum >= 1) {
      filter.page = pageNum;
    }

    const sizeNum = pageSize ? Number.parseInt(pageSize, 10) : NaN;
    if (Number.isFinite(sizeNum) && sizeNum >= 1) {
      filter.pageSize = Math.min(sizeNum, REGISTRE_MAX_PAGE_SIZE);
    } else if (pageSize !== undefined) {
      filter.pageSize = REGISTRE_DEFAULT_PAGE_SIZE;
    }

    return filter;
  }

  /**
   * Liste paginee des documents formattes pour la vue Registre.
   *
   * BREAKING CHANGE (2026-06-13) : la reponse est maintenant
   * `{ items, total, page, pageSize }`. Auparavant l'endpoint renvoyait
   * `{ items, total }` sans pagination. Le frontend admin doit lire
   * `data.items` (et non `data` directement).
   */
  @Get()
  async list(
    @Query("level") level?: string,
    @Query("category") category?: string,
    @Query("priority") priority?: string,
    @Query("blocking") blocking?: string,
    @Query("classification") classification?: string,
    @Query("search") search?: string,
    @Query("sortBy") sortBy?: string,
    @Query("sortDir") sortDir?: string,
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
  ) {
    const filter = this.parseFilter(
      level,
      category,
      priority,
      blocking,
      classification,
      search,
      sortBy,
      sortDir,
      page,
      pageSize,
    );
    return this.registreService.listForRegistre(filter);
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
    const filter = this.parseFilter(level, category, priority, blocking, classification);
    const csv = await this.registreService.exportCsv(filter);
    const filename = csvFilename("registre_documentaire");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
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
