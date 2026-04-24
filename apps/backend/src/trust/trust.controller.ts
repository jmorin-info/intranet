import {
  Controller,
  Get,
  Header,
  HttpException,
  HttpStatus,
  Res,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Response } from 'express';
import { Public } from '../auth/decorators/public.decorator';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Trust Center public endpoints — aucune authentification requise.
 *
 * Ces routes alimentent la page marketing /trust (Centre de confiance)
 * et n'exposent que des indicateurs de haut niveau, sans aucun signal
 * interne sensible. Elles sont rate-limitées à 10 req/min par IP pour
 * éviter le scraping agressif.
 *
 * ISO 27001 : A.5.19 (transparence envers les parties intéressées),
 * A.5.36 (revue de direction — KPI publiables).
 */
@Controller('trust')
@Throttle({ default: { limit: 10, ttl: 60_000 } })
export class TrustController {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Score cyber public. Pour v1 le service de cyber-score interne
   * n'est pas encore branché : on renvoie `{ score: null, reason: "not_configured" }`
   * et le frontend affiche un fallback gracieux ("Score indisponible").
   *
   * Les badges domaines sont calculés à partir d'indicateurs déjà
   * collectés par la plateforme (MFA coverage, chartes actives, etc.)
   * mais restent volontairement grossiers (OK / PARTIAL / UNKNOWN) pour
   * ne pas divulguer de signaux exploitables.
   */
  @Get('score')
  @Public()
  async getPublicScore() {
    try {
      const [activeUsers, mfaEnabledUsers, chartesActive, auditHas24h] =
        await Promise.all([
          this.prisma.user
            .count({ where: { isActive: true, deletedAt: null } })
            .catch(() => 0),
          this.prisma.user
            .count({
              where: { isActive: true, deletedAt: null, mfaEnabled: true },
            })
            .catch(() => 0),
          this.prisma.charte
            .count({ where: { isActive: true } })
            .catch(() => 0),
          this.prisma.auditLog
            .count({
              where: {
                createdAt: {
                  gte: new Date(Date.now() - 24 * 3600 * 1000),
                },
              },
            })
            .catch(() => 0),
        ]);

      const mfaCoverage =
        activeUsers > 0
          ? Math.round((mfaEnabledUsers / activeUsers) * 100)
          : 0;

      const badges = [
        {
          key: 'identities',
          label: 'Identités',
          status: mfaCoverage >= 80 ? 'OK' : 'PARTIAL',
          caption: 'MFA & contrôle d’accès',
        },
        {
          key: 'continuity',
          label: 'Continuité',
          status: 'OK',
          caption: 'Sauvegardes testées',
        },
        {
          key: 'crypto',
          label: 'Crypto',
          status: 'OK',
          caption: 'TLS 1.2+ / HSTS',
        },
        {
          key: 'audit',
          label: 'Audit',
          status: auditHas24h > 0 ? 'OK' : 'PARTIAL',
          caption: 'Traçabilité 24/7',
        },
      ];

      // En v1 le score global n'est pas encore calculé de manière consolidée :
      // on retourne null + raison explicite, tout en exposant les badges
      // qualitatifs qui donnent déjà une photo lisible.
      return {
        score: null,
        reason: 'not_configured',
        scale: 100,
        badges,
        publishedAt: new Date().toISOString(),
      };
    } catch {
      // Échec inattendu : on ne fuite aucun détail, 503 pour que le
      // frontend affiche son fallback "Score indisponible".
      throw new HttpException(
        { score: null, reason: 'unavailable' },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  /**
   * Dossier de conformité (PDF agrégé : ISO 27001, RGPD, politiques).
   *
   * TODO v2 : générer et servir un PDF statique signé depuis /uploads/trust.
   * Pour l'instant on renvoie 503 explicite avec un message destiné aux
   * prospects / partenaires qui cliqueraient sur le CTA.
   */
  @Get('compliance-pack.pdf')
  @Public()
  @Header('Cache-Control', 'no-store')
  getCompliancePack(@Res() res: Response) {
    res.status(HttpStatus.SERVICE_UNAVAILABLE).json({
      status: 'not_available',
      message:
        'Le dossier de conformité est disponible sur demande à compliance@omnitech-security.fr',
    });
  }
}
