import { Controller, Get, Logger } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../auth/decorators/public.decorator';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Kiosk mode — endpoints PUBLICS (sans auth) pour l'affichage mural.
 * Données **sanitisées** : aucun contenu confidentiel, aucune identité,
 * aucun détail technique sur les incidents.
 *
 * Rate limit strict : 30 req/min par IP.
 * ISO 27001 A.5.13 (communication publique).
 */
@Controller('kiosk')
export class KioskController {
  private readonly logger = new Logger(KioskController.name);
  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Get('news')
  async getPublicNews() {
    try {
      const news = await this.prisma.newsPost.findMany({
        where: {
          isPublished: true,
          publishedAt: { not: null, lte: new Date() },
        },
        orderBy: { publishedAt: 'desc' },
        take: 10,
        select: {
          id: true,
          title: true,
          excerpt: true,
          publishedAt: true,
          coverImageUrl: true,
        },
      });
      return { data: news };
    } catch (err) {
      this.logger.warn(`kiosk/news: ${err instanceof Error ? err.message : err}`);
      return { data: [] };
    }
  }

  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Get('veille')
  async getPublicVeille() {
    try {
      const items = await this.prisma.veilleItem.findMany({
        orderBy: { publishedAt: 'desc' },
        take: 10,
        select: {
          id: true,
          title: true,
          severity: true,
          sourceName: true,
          publishedAt: true,
        },
      });
      return {
        data: items.map((i) => ({
          id: i.id,
          title: i.title,
          severity: (i.severity || '').toLowerCase(),
          source: i.sourceName,
          publishedAt: i.publishedAt,
        })),
      };
    } catch (err) {
      this.logger.warn(`kiosk/veille: ${err instanceof Error ? err.message : err}`);
      return { data: [] };
    }
  }

  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Get('stats')
  async getPublicStats() {
    // Agrégats sans détails — safe to expose sur écran mural.
    const [openIncidents, openTickets, recentAlerts, docsInReview] = await Promise.all([
      this.prisma.incident
        .count({
          where: {
            status: {
              in: ['DETECTED', 'UNDER_INVESTIGATION', 'CONTAINED', 'ERADICATED'],
            },
          },
        })
        .catch(() => 0),
      this.prisma.ticket
        .count({ where: { status: { in: ['OPEN', 'IN_PROGRESS'] } } })
        .catch(() => 0),
      this.prisma.veilleItem
        .count({
          where: {
            publishedAt: { gte: new Date(Date.now() - 30 * 24 * 3600 * 1000) },
          },
        })
        .catch(() => 0),
      this.prisma.document
        .count({ where: { status: 'IN_REVIEW' } })
        .catch(() => 0),
    ]);
    return { openIncidents, openTickets, recentAlerts, docsInReview };
  }
}
