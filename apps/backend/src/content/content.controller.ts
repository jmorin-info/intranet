import {
  Controller,
  Get,
  Param,
  Query,
  Res,
  UseGuards,
  BadRequestException,
} from "@nestjs/common";
import type { Response } from "express";
import { Public } from "../auth/decorators/public.decorator";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { ContentService } from "./content.service";
import { SUPPORTED_LOCALES } from "./dto/create-content-page.dto";

/**
 * Lecture publique. Le cache HTTP est posé directement par chaque route :
 * `Cache-Control: private, max-age=300, stale-while-revalidate=3600`
 * (5 min cache + 1 h stale-while-revalidate). Aligné sur la stratégie
 * documentée dans `docs/cms/architecture.md` § 8.
 *
 * `private` car les routes peuvent être auth-gated (cookie httpOnly) — on
 * évite que les caches partagés (proxies CDN) stockent une réponse spécifique
 * à un utilisateur. Sur les routes `@Public()` (blocs Welcome), `private`
 * reste sûr et compatible avec les caches partagés stricts.
 */
@Controller("content")
@UseGuards(JwtAuthGuard)
export class ContentController {
  constructor(private readonly content: ContentService) {}

  @Get("pages/:slug")
  async getPage(
    @Param("slug") slug: string,
    @Query("locale") locale: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
      throw new BadRequestException("Invalid slug");
    }
    const resolvedLocale = this.resolveLocale(locale);
    const page = await this.content.getPublishedPage(slug, resolvedLocale);
    res.setHeader(
      "Cache-Control",
      "private, max-age=300, stale-while-revalidate=3600",
    );
    return page;
  }

  // Lecture publique (sans auth) : nécessaire pour la page Welcome qui se
  // rend avant login. Le service masque déjà les blocs DRAFT / soft-deleted ;
  // aucune donnée sensible ne fuit. cf. `docs/cms/architecture.md` § 3.2.
  @Public()
  @Get("blocks")
  async getBlocks(
    @Query("keys") keys: string,
    @Query("locale") locale: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    if (!keys) {
      throw new BadRequestException("keys query parameter is required");
    }
    const list = keys
      .split(",")
      .map((k) => k.trim())
      .filter(Boolean);
    if (list.length === 0) {
      throw new BadRequestException("keys must contain at least one entry");
    }
    const resolvedLocale = this.resolveLocale(locale);
    const blocks = await this.content.getPublishedBlocksByKeys(
      list,
      resolvedLocale,
    );
    res.setHeader(
      "Cache-Control",
      "private, max-age=300, stale-while-revalidate=3600",
    );
    return blocks;
  }

  private resolveLocale(input: string | undefined): string {
    if (!input) return "fr";
    const supported = SUPPORTED_LOCALES as unknown as string[];
    return supported.includes(input) ? input : "fr";
  }
}
