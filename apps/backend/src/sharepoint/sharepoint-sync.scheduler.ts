import { Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { SharePointSyncService } from "./sharepoint-sync.service";
import { SharePointSyncResult } from "./types";

/**
 * Cron de synchronisation SharePoint — phase 2 du module GED SharePoint.
 *
 * Tourne toutes les 2 heures (expression cron "0 / 2 * * *", voir le decorateur @Cron) et synchronise une liste de
 * couples (siteId, libraryId) configures via la variable d'env
 * `SP_AUTO_SYNC_TARGETS` au format :
 *
 *   "siteId1:libraryId1,siteId2:libraryId2,..."
 *
 * Activation : deux flags d'env doivent etre a "true" simultanement :
 *   - `GED_SHAREPOINT_SYNC_ENABLED` — flag global du module SharePoint
 *     (couvre aussi les endpoints manuels admin).
 *   - `SP_AUTO_SYNC_ENABLED` — flag dedie au cron : permet de garder la
 *     sync manuelle disponible tout en desactivant le cron (utile en
 *     debug ou pendant un incident SharePoint).
 *
 * Pour decouvrir les valeurs siteId / libraryId a configurer, l'admin
 * peut utiliser :
 *   GET /api/v1/admin/sharepoint/libraries/:siteId
 * (cf. {@link SharePointController.listLibraries}).
 *
 * Style aligne sur {@link RagReindexScheduler} : Logger NestJS, try/catch
 * defensif, no-op silencieux si flag off.
 *
 * Note "user systeme" pour AuditLog : `syncLibrary` accepte
 * `triggeredBy?: string` (cf. `SyncLibraryOptions`). On laisse undefined
 * volontairement — l'AuditService stocke alors `userId: null` (cf.
 * audit.service.ts), ce qui est la convention projet pour identifier une
 * action declenchee par le scheduler (pas par un humain). Aucun
 * "SYSTEM_USER" en DB n'est utilise ailleurs dans le backend.
 */
@Injectable()
export class SharePointSyncScheduler {
  private readonly logger = new Logger(SharePointSyncScheduler.name);

  constructor(private readonly sharePointSyncService: SharePointSyncService) {}

  /** Le cron est-il active (les deux flags d'env doivent etre true) ? */
  private isCronEnabled(): boolean {
    return (
      process.env.GED_SHAREPOINT_SYNC_ENABLED === "true" &&
      process.env.SP_AUTO_SYNC_ENABLED === "true"
    );
  }

  /**
   * Parse `SP_AUTO_SYNC_TARGETS` au format "site:lib,site:lib".
   * Renvoie un tableau (eventuellement vide) de couples valides.
   * Les entrees malformees sont loggees et ignorees.
   */
  private parseTargets(raw: string | undefined): Array<{
    siteId: string;
    libraryId: string;
  }> {
    if (!raw) return [];
    const targets: Array<{ siteId: string; libraryId: string }> = [];
    for (const chunk of raw.split(",")) {
      const trimmed = chunk.trim();
      if (!trimmed) continue;
      const idx = trimmed.indexOf(":");
      if (idx <= 0 || idx === trimmed.length - 1) {
        this.logger.warn(
          `sharepoint.sync.cron: target malformee, ignoree: "${trimmed}" (attendu "siteId:libraryId")`,
        );
        continue;
      }
      const siteId = trimmed.slice(0, idx).trim();
      const libraryId = trimmed.slice(idx + 1).trim();
      if (!siteId || !libraryId) {
        this.logger.warn(`sharepoint.sync.cron: target vide, ignoree: "${trimmed}"`);
        continue;
      }
      targets.push({ siteId, libraryId });
    }
    return targets;
  }

  @Cron("0 */2 * * *", {
    name: "sharepoint-sync-every-2h",
    timeZone: "Europe/Paris",
  })
  async runScheduledSync(): Promise<void> {
    if (!this.isCronEnabled()) {
      return; // no-op silencieux : flag(s) off
    }

    const targets = this.parseTargets(process.env.SP_AUTO_SYNC_TARGETS);
    if (targets.length === 0) {
      this.logger.warn(
        "sharepoint.sync.cron: SP_AUTO_SYNC_TARGETS vide ou mal forme — aucune cible a synchroniser",
      );
      return;
    }

    const start = Date.now();
    this.logger.log(`sharepoint.sync.cron.start — ${targets.length} cible(s)`);

    let totalUnmapped = 0;
    let totalUpdated = 0;
    let totalSkipped = 0;
    let totalErrors = 0;
    let okCount = 0;
    let failCount = 0;

    for (const { siteId, libraryId } of targets) {
      // try/catch separe par cible : un site qui plante ne bloque pas les autres.
      try {
        const result: SharePointSyncResult = await this.sharePointSyncService.syncLibrary(
          siteId,
          libraryId,
          {
            // triggeredBy volontairement undefined : action systeme (cf.
            // commentaire en tete de classe).
          },
        );
        totalUnmapped += result.unmapped;
        totalUpdated += result.updated;
        totalSkipped += result.skipped;
        totalErrors += result.errors.length;
        okCount += 1;
      } catch (err) {
        failCount += 1;
        this.logger.warn(
          `sharepoint.sync.cron: cible site=${siteId} drive=${libraryId} en echec: ${(err as Error)?.message}`,
        );
      }
    }

    const durationMs = Date.now() - start;
    this.logger.log(
      `sharepoint.sync.cron.done — ${durationMs}ms, targets=${targets.length} ok=${okCount} failed=${failCount} updated=${totalUpdated} skipped=${totalSkipped} unmapped=${totalUnmapped} errors=${totalErrors}`,
    );
  }
}
