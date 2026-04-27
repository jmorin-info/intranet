import { Injectable, Logger } from "@nestjs/common";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

/**
 * Wave D item 20 — Endpoint utilitaire de status backup offsite (Restic).
 *
 * Lit l'état des derniers snapshots via `restic snapshots --json --last 5`.
 * Aucune mutation : les opérations destructives (forget, prune, restore)
 * restent côté shell (cf. scripts/backup/).
 *
 * IMPORTANT : ce service nécessite que le binaire `restic` soit présent
 * dans le PATH du backend ET que les variables d'env Restic soient
 * disponibles dans process.env (RESTIC_REPOSITORY, RESTIC_PASSWORD,
 * AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY).
 */
export interface ResticSnapshot {
  id: string;
  short_id: string;
  time: string;
  hostname: string;
  paths?: string[];
  tags?: string[];
}

export interface BackupStatusResponse {
  available: boolean;
  reason?: string;
  repository?: string;
  lastSnapshot?: {
    shortId: string;
    time: string;
    hostname: string;
    tags: string[];
    ageSeconds: number;
    sizeBytes?: number;
  };
  recentSnapshots: Array<{
    shortId: string;
    time: string;
    hostname: string;
    tags: string[];
  }>;
  alerts: string[];
}

/**
 * Seuils par défaut pour les alertes de fraîcheur du dernier snapshot.
 * (Quotidien attendu donc > 30h = anormal, > 48h = critique.)
 */
const STALE_WARN_SECONDS = 30 * 3600; // 30h
const STALE_CRITICAL_SECONDS = 48 * 3600; // 48h

@Injectable()
export class AdminBackupService {
  private readonly logger = new Logger(AdminBackupService.name);

  /**
   * Retourne le statut courant du backup offsite Restic.
   * Best-effort : ne lève pas si Restic indisponible — retourne available=false.
   */
  async getStatus(): Promise<BackupStatusResponse> {
    const repository = process.env.RESTIC_REPOSITORY;

    if (!repository) {
      return {
        available: false,
        reason: "RESTIC_REPOSITORY non configuré",
        recentSnapshots: [],
        alerts: ["Restic non configuré (offsite backup désactivé)"],
      };
    }

    let snapshots: ResticSnapshot[];
    try {
      // --last 5 : limite côté Restic (économe en bande passante)
      // --json   : parsing structuré
      const { stdout } = await execAsync("restic snapshots --json --last 5", {
        timeout: 30_000,
        env: {
          ...process.env,
          // Restic affichera des erreurs verbose en français si LANG set,
          // on force POSIX pour parsing déterministe
          LANG: "C",
          LC_ALL: "C",
        },
      });
      snapshots = JSON.parse(stdout) as ResticSnapshot[];
    } catch (error) {
      this.logger.warn(`restic snapshots failed: ${(error as Error).message}`);
      return {
        available: false,
        repository,
        reason: `restic snapshots a échoué : ${(error as Error).message.split("\n")[0]}`,
        recentSnapshots: [],
        alerts: [
          "Impossible de lire les snapshots Restic (CLI absent, repo unreachable, ou credentials invalides)",
        ],
      };
    }

    if (!Array.isArray(snapshots) || snapshots.length === 0) {
      return {
        available: true,
        repository,
        recentSnapshots: [],
        alerts: [
          "Aucun snapshot dans le repo (premier backup pas encore exécuté ?)",
        ],
      };
    }

    // Tri décroissant par date (Restic peut ne pas retourner trié)
    snapshots.sort(
      (a, b) => new Date(b.time).getTime() - new Date(a.time).getTime(),
    );

    const last = snapshots[0];
    const lastDate = new Date(last.time);
    const ageSeconds = Math.floor((Date.now() - lastDate.getTime()) / 1000);

    const alerts: string[] = [];
    if (ageSeconds > STALE_CRITICAL_SECONDS) {
      alerts.push(
        `CRITIQUE : dernier snapshot vieux de ${Math.round(ageSeconds / 3600)}h (>48h)`,
      );
    } else if (ageSeconds > STALE_WARN_SECONDS) {
      alerts.push(
        `WARN : dernier snapshot vieux de ${Math.round(ageSeconds / 3600)}h (>30h)`,
      );
    }

    return {
      available: true,
      repository,
      lastSnapshot: {
        shortId: last.short_id,
        time: last.time,
        hostname: last.hostname,
        tags: last.tags ?? [],
        ageSeconds,
      },
      recentSnapshots: snapshots.map((s) => ({
        shortId: s.short_id,
        time: s.time,
        hostname: s.hostname,
        tags: s.tags ?? [],
      })),
      alerts,
    };
  }
}
