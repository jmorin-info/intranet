import { Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { PrismaService } from "../prisma/prisma.service";
import { DelegationService } from "./delegation.service";

/**
 * DelegationCronService — cron quotidien pour l'auto-délégation et la
 * désactivation des délégations expirées.
 *
 * Deux jobs :
 *  1. `runAutoDelegation` (default 03h00 chaque jour) : réassigne les
 *     step-instances PENDING dépassant le seuil configurable.
 *  2. `expireOldDelegations` (default 03h05) : marque `isActive=false` toutes
 *     les délégations dont `endDate < now`. Maintient la table propre et
 *     évite que `resolveDelegate` ait à filtrer par date à chaque appel
 *     (gain en perf vu que l'index touche déjà endDate).
 *
 * Le seuil d'auto-délégation est lu dans `AppConfig.delegation.autoThresholdHours`
 * (default 48). Si la clé n'existe pas, on tombe sur la valeur par défaut.
 */
@Injectable()
export class DelegationCronService {
  private readonly logger = new Logger(DelegationCronService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly delegationService: DelegationService,
  ) {}

  /**
   * Tous les jours à 03h00 — fenêtre de basse activité, après les exports
   * de nuit et avant les notifications matinales.
   */
  @Cron("0 3 * * *")
  async runAutoDelegation(): Promise<void> {
    const threshold = await this.getThresholdHours();
    this.logger.log(
      `Démarrage auto-délégation (seuil=${threshold}h sans réponse)`,
    );
    try {
      const summary = await this.delegationService.runAutoDelegation(threshold);
      this.logger.log(
        `Auto-délégation terminée : ${summary.delegated} déléguées, ${summary.escalated} escaladées, ${summary.skipped} skip`,
      );
    } catch (err) {
      this.logger.error(
        `Erreur auto-délégation : ${(err as Error).message}`,
        (err as Error).stack,
      );
    }
  }

  /** À 03h05, après la job principale. */
  @Cron("5 3 * * *")
  async expireOldDelegations(): Promise<void> {
    try {
      const result = await this.prisma.approvalDelegation.updateMany({
        where: {
          isActive: true,
          revokedAt: null,
          endDate: { lt: new Date() },
        },
        data: { isActive: false },
      });
      if (result.count > 0) {
        this.logger.log(
          `${result.count} délégation(s) expirée(s) → isActive=false`,
        );
      }
    } catch (err) {
      this.logger.error(
        `Erreur expiration délégations : ${(err as Error).message}`,
      );
    }
  }

  /**
   * Récupère le seuil en heures depuis `AppConfig.delegation.autoThresholdHours`.
   * Default : 48 heures.
   */
  private async getThresholdHours(): Promise<number> {
    try {
      const cfg = await this.prisma.appConfig.findUnique({
        where: { key: "delegation.autoThresholdHours" },
      });
      if (!cfg) return 48;
      const parsed = parseInt(cfg.value, 10);
      if (Number.isNaN(parsed) || parsed < 1) return 48;
      return parsed;
    } catch {
      return 48;
    }
  }
}
