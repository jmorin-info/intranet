import { Module } from "@nestjs/common";
import { AdminBackupController } from "./admin-backup.controller";
import { AdminBackupService } from "./admin-backup.service";

/**
 * Wave D — Module admin (cross-cutting endpoints utilitaires).
 *
 * Ne contient que des endpoints "ops" en lecture seule, accessibles aux
 * SUPER_ADMIN uniquement, qui renseignent sur l'état de l'infrastructure
 * sans exposer de mutations.
 *
 * Pour les opérations destructives (restore DB, prune Restic, failover
 * Patroni) : passer par les scripts shell sur les serveurs (scripts/backup/,
 * patronictl, etc.).
 */
@Module({
  controllers: [AdminBackupController],
  providers: [AdminBackupService],
  exports: [AdminBackupService],
})
export class AdminModule {}
