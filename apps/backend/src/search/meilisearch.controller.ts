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
   * GET /search/meili?q=...&type=wiki|document|news|ticket|runbook&limit=20
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
      runbooks: [],
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

  /**
   * Recherche unifiee — endpoint canonique post-merge `search` + `search/v2`.
   *
   * GET /search/unified?q=...&modules=wiki,documents&page=1&limit=20
   *      &categories=ISO,SECURITY&classifications=PUBLIC,INTERNE&statuses=APPROVED
   *      &sort=date:desc
   *
   * Renvoie :
   *   - hits agreges (apres RBAC)
   *   - byIndex : groupes par module (wiki/documents/news/tickets/runbooks)
   *   - facetDistribution : { category: {...}, classification: {...}, status: {...} }
   *   - processingTimeMs : latence Meilisearch totale
   *   - tookMs : latence end-to-end (incl. RBAC + reseau)
   *
   * RBAC : filtre post-query sur classification documentaire (ISO 27001 A.5.12).
   */
  @Get('unified')
  @UseGuards(JwtAuthGuard)
  async unifiedSearch(
    @Query('q') q: string,
    @Query('modules') modules: string,
    @Query('page') page: string,
    @Query('limit') limit: string,
    @Query('categories') categories: string,
    @Query('classifications') classifications: string,
    @Query('statuses') statuses: string,
    @Query('sort') sort: string,
    @CurrentUser() user: RequestUser,
  ) {
    const trimmed = (q ?? '').trim();
    if (!trimmed || trimmed.length < 2) {
      return {
        query: trimmed,
        hits: [],
        byIndex: {},
        facetDistribution: {},
        total: 0,
        page: 1,
        limit: 20,
        processingTimeMs: 0,
        tookMs: 0,
      };
    }

    const started = Date.now();
    const parsedPage = Math.max(1, parseInt(page || '1', 10));
    const parsedLimit = Math.max(1, Math.min(parseInt(limit || '20', 10), 100));
    const offset = (parsedPage - 1) * parsedLimit;

    const moduleList = modules
      ? modules.split(',').map((s) => s.trim()).filter(Boolean)
      : undefined;
    const categoryList = categories
      ? categories.split(',').map((s) => s.trim()).filter(Boolean)
      : undefined;
    const classificationList = classifications
      ? classifications.split(',').map((s) => s.trim()).filter(Boolean)
      : undefined;
    const statusList = statuses
      ? statuses.split(',').map((s) => s.trim()).filter(Boolean)
      : undefined;
    const sortList = sort
      ? sort.split(',').map((s) => s.trim()).filter(Boolean)
      : undefined;

    const resp = await this.meili.search(trimmed, {
      modules: moduleList,
      limit: parsedLimit,
      offset,
      categories: categoryList,
      classifications: classificationList,
      statuses: statusList,
      sort: sortList,
      facets: ['category', 'classification', 'status', 'type'],
      highlight: true,
      crop: true,
    });

    // RBAC post-query sur classification documentaire (ISO 27001 A.5.12)
    const safeUser = { id: user.id, role: user.role as UserRole };
    const filteredByIndex: Record<string, {
      hits: unknown[];
      total: number;
      facetDistribution?: Record<string, Record<string, number>>;
      processingTimeMs?: number;
    }> = {};
    let allHits: unknown[] = [];
    let total = 0;
    for (const [uid, group] of Object.entries(resp.byIndex ?? {})) {
      const filtered = group.hits.filter((h) => canViewHit(h, safeUser));
      filteredByIndex[uid] = {
        hits: filtered,
        total: filtered.length, // total apres RBAC; estimatedTotalHits brut = group.total
        facetDistribution: group.facetDistribution,
        processingTimeMs: group.processingTimeMs,
      };
      allHits = allHits.concat(filtered);
      total += filtered.length;
    }

    return {
      query: trimmed,
      hits: allHits,
      byIndex: filteredByIndex,
      facetDistribution: resp.facetDistribution ?? {},
      total,
      page: parsedPage,
      limit: parsedLimit,
      processingTimeMs: resp.processingTimeMs ?? 0,
      tookMs: Date.now() - started,
    };
  }

  /**
   * Recherche rapide pour la palette Cmd+K — top 8 cross-modules en un appel.
   * Alias pratique de `globalSearch` mais avec un format flat (hits[]).
   *
   * GET /search/quick?q=...&limit=8
   */
  @Get('quick')
  @UseGuards(JwtAuthGuard)
  async quickSearch(
    @Query('q') q: string,
    @Query('limit') limit: string,
    @CurrentUser() user: RequestUser,
  ) {
    const trimmed = (q ?? '').trim();
    if (!trimmed || trimmed.length < 2) {
      return { query: trimmed, hits: [], total: 0, tookMs: 0 };
    }
    const started = Date.now();
    const total = Math.max(1, Math.min(parseInt(limit || '8', 10), 30));
    // Recupere `total` hits *par index* puis on tronque cote merge.
    // C'est moins propre que le cap global mais Meili n'expose pas un "global limit".
    const perIndex = Math.max(2, Math.ceil(total / 4));
    const resp = await this.meili.search(trimmed, {
      limit: perIndex,
      facets: [],
      highlight: false,
      crop: false,
    });
    const safeUser = { id: user.id, role: user.role as UserRole };
    const hits: unknown[] = [];
    for (const group of Object.values(resp.byIndex ?? {})) {
      for (const h of group.hits) {
        if (canViewHit(h, safeUser)) hits.push(h);
        if (hits.length >= total) break;
      }
      if (hits.length >= total) break;
    }
    return {
      query: trimmed,
      hits,
      total: hits.length,
      tookMs: Date.now() - started,
    };
  }
}
