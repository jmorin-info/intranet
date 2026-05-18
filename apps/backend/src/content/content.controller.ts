import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
  BadRequestException,
} from "@nestjs/common";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { ContentService } from "./content.service";
import { SUPPORTED_LOCALES } from "./dto/create-content-page.dto";

/**
 * Lecture publique (auth utilisateur requise — intranet interne).
 * Cache HTTP : `Cache-Control: private, max-age=300, stale-while-revalidate=3600`
 * posé par un interceptor à venir (Phase 6) ou côté reverse proxy.
 */
@Controller("content")
@UseGuards(JwtAuthGuard)
export class ContentController {
  constructor(private readonly content: ContentService) {}

  @Get("pages/:slug")
  getPage(@Param("slug") slug: string, @Query("locale") locale: string) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
      throw new BadRequestException("Invalid slug");
    }
    const resolvedLocale = this.resolveLocale(locale);
    return this.content.getPublishedPage(slug, resolvedLocale);
  }

  @Get("blocks")
  async getBlocks(
    @Query("keys") keys: string,
    @Query("locale") locale: string,
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
    return this.content.getPublishedBlocksByKeys(list, resolvedLocale);
  }

  private resolveLocale(input: string | undefined): string {
    if (!input) return "fr";
    const supported = SUPPORTED_LOCALES as unknown as string[];
    return supported.includes(input) ? input : "fr";
  }
}
