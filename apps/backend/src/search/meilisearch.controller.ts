import {
  BadRequestException,
  Controller,
  Get,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UserRole } from '../common/enums';
import { RequestUser } from '../common/interfaces';
import { MeilisearchService } from './meilisearch.service';
import { canViewHit } from './rbac-filter';

/**
 * Controller de recherche federee Meilisearch.
 * Prefixe : `search/meili`
 */
@Controller('search')
export class MeilisearchController {
  constructor(private readonly meili: MeilisearchService) {}

  /**
   * Recherche federee multi-index.
   * GET /search/meili?q=...&type=wiki|document|news|ticket&limit=20
   */
  @Get('meili')
  @UseGuards(JwtAuthGuard)
  async search(
    @Query('q') q: string,
    @Query('type') type?: string,
    @Query('limit') limit?: string,
  ) {
    if (!q || q.trim().length === 0) {
      throw new BadRequestException('Le parametre `q` est requis');
    }

    return this.meili.search(q.trim(), {
      type,
      limit: limit ? parseInt(limit, 10) : 20,
    });
  }

  /**
   * Reindexation complete depuis la base Prisma.
   * Reserve aux admins.
   * POST /search/reindex
   */
  @Post('reindex')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  async reindex() {
    const result = await this.meili.reindexAll();
    return {
      success: true,
      message: 'Reindexation terminee',
      indexed: result,
    };
  }

  /**
   * Stats des index Meilisearch.
   * GET /search/stats
   */
  @Get('stats')
  @UseGuards(JwtAuthGuard)
  async stats() {
    return this.meili.stats();
  }

  /**
   * Healthcheck Meilisearch — utilise par /admin/system-health et la bannière
   * portail pour afficher le statut "Recherche fédérée" en live.
   * Path historique conserve : /search/v2/health.
   * GET /search/v2/health
   */
  @Get('v2/health')
  @UseGuards(JwtAuthGuard)
  async healthV2() {
    return this.meili.isHealthy();
  }

  /**
   * Recherche globale cross-modules avec filtrage RBAC post-query.
   * GET /search/global?q=...&limit=5
   *
   * Réponse groupée par type : { results: { documents, tickets, wiki, news } }
   * Intègre le filtre classification (ISO 27001 A.5.12) : les documents dont
   * la classification excède le rôle du user sont retirés des résultats.
   */
  @Get('global')
  @UseGuards(JwtAuthGuard)
  async globalSearch(
    @Query('q') q: string,
    @Query('limit') limit: string,
    @CurrentUser() user: RequestUser,
  ) {
    if (!q || q.trim().length < 2) {
      return {
        query: q ?? '',
        results: { documents: [], tickets: [], wiki: [], news: [] },
        total: 0,
        tookMs: 0,
      };
    }
    const perIndex = Math.max(1, Math.min(parseInt(limit || '5', 10), 20));
    const started = Date.now();
    const resp = await this.meili.search(q.trim(), { limit: perIndex });

    const safeUser = { id: user.id, role: user.role as UserRole };
    const groups: Record<string, unknown[]> = {
      documents: [],
      tickets: [],
      wiki: [],
      news: [],
    };
    let total = 0;

    for (const [uid, group] of Object.entries(resp.byIndex ?? {})) {
      const key = uid in groups ? uid : null;
      if (!key) continue;
      const filtered = group.hits.filter((h) => canViewHit(h, safeUser));
      groups[key] = filtered;
      total += filtered.length;
    }

    return {
      query: q.trim(),
      results: groups,
      total,
      tookMs: Date.now() - started,
    };
  }
}
