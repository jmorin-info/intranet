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
import { UserRole } from '../common/enums';
import { MeilisearchService } from './meilisearch.service';

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
}
