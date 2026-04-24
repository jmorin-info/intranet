/**
 * Catalogue statique des scénarios PCA (Plan de Continuité d'Activité).
 *
 * ISO 27001:2022 :
 *  - A.5.30  ICT readiness for business continuity
 *  - A.8.13  Sauvegarde des informations
 *  - A.8.14  Redondance des moyens de traitement
 *
 * Chaque scénario décrit un test de continuité non destructif par défaut.
 * Les scénarios avec `script != null` sont exécutés via child_process.spawn
 * (cf. PcaService.runScript). Les autres sont implémentés en TypeScript pur.
 *
 * Un scénario `destructive: true` nécessitera le header
 *   X-Confirm: I-understand-this-is-destructive
 * pour être déclenché (v1 : aucun scénario destructeur, mais la structure
 * est prête pour les futures évolutions — failover DB, bascule site chaud…).
 */
export interface PcaScenario {
  /** Identifiant stable, utilisé dans les URLs et la base. */
  id: string;
  /** Nom humain affiché dans l'UI. */
  name: string;
  /** Description courte (1-2 phrases) affichée sur la carte. */
  description: string;
  /** Contrôles ISO 27001 couverts (affichés en badge). */
  iso: string;
  /** Durée estimée d'exécution (texte libre, ex: "~2 min"). */
  duration: string;
  /**
   * Un scénario destructeur modifie l'état réel du système (bascule, wipe…).
   * Requiert un header de confirmation explicite. Aucun en v1.
   */
  destructive: boolean;
  /**
   * Chemin relatif au projet vers le script à exécuter (ou null si la
   * logique est implémentée directement dans PcaService).
   */
  script: string | null;
  /** Timeout d'exécution en ms (default 10 min). */
  timeoutMs?: number;
}

export const PCA_SCENARIOS: readonly PcaScenario[] = [
  {
    id: 'backup-drill',
    name: 'Drill de sauvegarde',
    description:
      "Vérifie l'intégrité de la dernière sauvegarde (checksum + listing).",
    iso: 'A.8.13, A.8.14',
    duration: '~2 min',
    destructive: false,
    script: 'scripts/backup-drill.sh',
    timeoutMs: 5 * 60_000,
  },
  {
    id: 'restore-dry-run',
    name: 'Restauration (dry-run)',
    description:
      "Simule une restauration sans écrire — vérifie que le backup est utilisable.",
    iso: 'A.5.30',
    duration: '~10 min',
    destructive: false,
    script: 'scripts/backup-restore.sh --dry-run',
    timeoutMs: 15 * 60_000,
  },
  {
    id: 'service-failover-sim',
    name: 'Simulation panne service',
    description:
      "Désactive temporairement un service (meilisearch / redis) et vérifie la dégradation gracieuse.",
    iso: 'A.5.30',
    duration: '~5 min',
    destructive: false,
    script: null,
    timeoutMs: 5 * 60_000,
  },
  {
    id: 'db-snapshot-check',
    name: 'Vérification snapshot DB',
    description:
      "Compare le count des tables critiques entre DB live et dernier backup.",
    iso: 'A.8.13',
    duration: '~1 min',
    destructive: false,
    script: null,
    timeoutMs: 2 * 60_000,
  },
] as const;

export function findScenario(id: string): PcaScenario | undefined {
  return PCA_SCENARIOS.find((s) => s.id === id);
}

/**
 * Statuts possibles pour un run.
 * Alignés sur le champ `status` du modèle Prisma `PcaRun`.
 */
export type PcaRunStatus =
  | 'PENDING'
  | 'RUNNING'
  | 'SUCCESS'
  | 'FAILED'
  | 'CANCELLED';

/**
 * Rappel ISO 27001 A.5.30 : la documentation de reprise (RESTORE.md)
 * est complétée par l'exécution régulière de ces scénarios. L'objectif
 * minimum recommandé est au moins un drill/mois pour chaque scénario
 * non destructeur.
 */
export const PCA_SCHEDULED_JOBS: ReadonlyArray<{
  scenarioId: string;
  cronExpression: string;
  humanSchedule: string;
}> = [
  {
    scenarioId: 'backup-drill',
    cronExpression: '0 3 * * 0',
    humanSchedule: 'Chaque dimanche à 3h00',
  },
  {
    scenarioId: 'db-snapshot-check',
    cronExpression: '0 4 1 * *',
    humanSchedule: 'Le 1er de chaque mois à 4h00',
  },
];
