# Audit Log Retention & Anonymization (RGPD)

> Item 29 — Wave B post-launch.
> Statut : production.
> Dernière revue : 2026-04-26.

## 1. Objectif

Concilier deux contraintes contradictoires :

- **ISO 27001 A.5.36 — Surveillance et revue du journal d'audit** : exige
  une rétention longue (≥ 3 ans typiquement) des événements de sécurité
  pour l'investigation forensique et la preuve réglementaire.
- **RGPD article 5(c) — minimisation** et **article 17 — droit à
  l'effacement** : impose de ne conserver les données personnelles
  identifiantes que le temps strictement nécessaire.

Le compromis OMNITECH Security : conserver l'**occurrence** de l'événement
(action, type de ressource, date) sur la durée forensique, mais
**anonymiser** les champs PII (utilisateur, IP, user-agent, payload)
au-delà d'une fenêtre courte ; **purger** définitivement la ligne au-delà
d'une fenêtre plus longue.

## 2. Politique par défaut

| Étape | Clé `AppConfig` | Défaut | Description |
|---|---|---|---|
| Rétention complète | `audit.retention.fullDays` | **90 jours** | Au-delà → anonymisation des champs PII |
| Rétention anonymisée | `audit.retention.anonymizedDays` | **730 jours** (2 ans) | Au-delà → suppression définitive |
| Dernier passage | `audit.retention.lastRunAt` | — | Timestamp ISO de la dernière exécution réussie |

**Mode legal hold** : la valeur spéciale `NEVER` désactive l'étape
correspondante. Utilisé pour suspendre toute mutation pendant un
contentieux ou une enquête. À combiner avec une justification écrite
(ticket RSSI, décision juridique).

## 3. Champs anonymisés

Une ligne `AuditLog` traverse trois états :

```
[brute] → [anonymisée] → [supprimée]
       ↑                ↑
   fullDays      anonymizedDays
```

À l'anonymisation, le service `AuditAnonymizationService` (voir
`apps/backend/src/audit/audit-anonymization.service.ts`) applique :

| Champ | Méthode | Exemple |
|---|---|---|
| `userId` | `NULL` | (relation User déjà en `onDelete: SetNull`, cohérent) |
| `ipAddress` | Troncature `/16` (IPv4) ou `/48` (IPv6) | `192.168.1.42` → `192.168.0.0` |
| `userAgent` | Famille uniquement (Chrome / Firefox / Safari / Edge / Opera / IE / CLI / Other) | `Mozilla/5.0 … Chrome/120 …` → `Chrome` |
| `metadata` (JSON) | Suppression récursive des clés PII connues | `{ email: "x@y.com", success: true }` → `{ success: true }` |
| `anonymizedAt` | `NOW()` | timestamp d'anonymisation (marqueur d'idempotence) |
| `id`, `action`, `resourceType`, `resourceId`, `severity`, `createdAt` | conservés | preuve d'occurrence |

**Clés PII reconnues** dans `metadata` : `email`, `userEmail`, `phone`,
`phoneNumber`, `name`, `firstName`, `lastName`, `fullName`, `ssn`,
`socialSecurityNumber`, `ip`, `ipAddress`, `userAgent`, `actorSnapshot`,
`actorEmail`, `actorName`, `actorFirstName`, `actorLastName`.

Pour un email apparaissant dans un payload texte libre, l'utilitaire
`anonymizeEmail(email, salt)` génère un SHA-256 tronqué à 8 caractères
suffixé `@anonymized.local`. Le `salt` est l'`id` de l'audit log → la
fonction est déterministe par ligne (idempotente) mais non joinable
entre lignes (anti-corrélation).

### Justification du choix `/16` pour les IPv4

Le G29 (groupe de travail européen art. 29, désormais EDPB) recommande
une troncature minimale `/24` pour considérer une IP comme « pseudonymisée ».
Nous appliquons `/16` (plus agressif) pour réduire le risque de
réidentification par triangulation (sous-réseau d'entreprise
identifiable). Compromis : on perd la précision géographique fine ; on
conserve la classification réseau (privé / public, opérateur
approximatif).

## 4. Architecture

```
ScheduleModule (NestJS, AppModule)
  └─ AuditAnonymizationService.handleCron @Cron('0 4 * * *')
       └─ runFullCycle()
            ├─ anonymizeBatch(1000) × N (jusqu'à épuisement, max 50)
            └─ purgeOldAnonymized(1000) × N (idem)
```

Composants :

- **`audit-anonymization.service.ts`** — service principal. API publique :
  - `getPolicy() / updatePolicy()` — lit/écrit AppConfig
  - `anonymizeRecord(row)` — fonction pure (testable unitairement)
  - `anonymizeBatch(batchSize)` — un batch d'anonymisation
  - `purgeOldAnonymized(batchSize)` — un batch de suppression
  - `runFullCycle()` — orchestration (cron + manual trigger)
  - `getStats()` — politique + compteurs
- **`audit.controller.ts`** — endpoints REST :
  - `GET /api/v1/audit/retention` (ADMIN+)
  - `PATCH /api/v1/audit/retention` (SUPER_ADMIN)
  - `POST /api/v1/audit/anonymize-now` (SUPER_ADMIN)
- **Migration SQL** — `20260427_audit_log_anonymization` ajoute la colonne
  `AuditLog.anonymizedAt` + un index `(anonymizedAt, createdAt)`.

### Garanties d'idempotence

- L'anonymisation filtre par `anonymizedAt IS NULL` → repasser sur une
  ligne déjà anonymisée est un no-op au niveau requête (zéro write).
- `anonymizeRecord` est une fonction pure : input identique → output
  identique. Couvert par tests unitaires.
- La purge utilise `createdAt < cutoff` → indépendante de l'état
  d'anonymisation (anonymisé ou non, si la ligne dépasse 730j elle part).

### Sécurité

- L'API `PATCH /retention` est limitée à `SUPER_ADMIN` car un opérateur
  malveillant pourrait raccourcir la fenêtre de purge pour supprimer
  des preuves.
- Le déclenchement manuel (`POST /anonymize-now`) est lui-même journalisé
  via `AuditService.log` avec action `AUDIT_LOG_ANONYMIZATION_MANUAL` et
  sévérité `WARN` — chaîne de confiance préservée.
- Sanity-check API : `fullDays >= anonymizedDays` est rejeté
  (HTTP 400) — pipeline cohérent.

## 5. Procédure legal hold

En cas de contentieux ou réquisition :

1. **Suspendre l'anonymisation** :
   ```
   PATCH /api/v1/audit/retention
   { "fullDays": "NEVER" }
   ```
2. **Suspendre la purge** :
   ```
   PATCH /api/v1/audit/retention
   { "anonymizedDays": "NEVER" }
   ```
3. Ouvrir un ticket RSSI `INCIDENT_LEGAL_HOLD` avec la décision juridique
   en pièce jointe. Conserver le numéro de ticket dans le commentaire de
   l'AppConfig.
4. **Sortie de legal hold** : restaurer les valeurs précédentes via la
   même API (`fullDays: 90`, `anonymizedDays: 730`) ou des valeurs
   décidées par la direction. Le cron suivant rattrapera tout l'arriéré.

## 6. Runbook administrateur

### Consulter la politique
```
GET /api/v1/audit/retention
```
ou via l'UI : `/admin/audit/retention` (réservé SUPER_ADMIN).

### Modifier la politique
```
PATCH /api/v1/audit/retention
{
  "fullDays": 60,           // ou "NEVER" pour suspendre
  "anonymizedDays": 365     // ou "NEVER" pour suspendre
}
```

### Forcer un cycle (hors cron quotidien 4h00 UTC)
```
POST /api/v1/audit/anonymize-now
```
Réponse :
```json
{
  "anonymizedCount": 1234,
  "deletedCount": 56,
  "durationMs": 12345,
  "errors": []
}
```

### Diagnostic en cas d'erreurs

- Le cron logue `audit.anonymization.run anonymized=… deleted=… durationMs=… errors=…`
  (chercher dans les logs structurés Pino).
- Erreurs non-zero ⇒ inspecter le tableau `errors[]` dans la réponse
  manual ou dans les logs. Causes typiques : contention DB, timeout de
  transaction. Le service réessaie ligne par ligne lors du cycle suivant.
- Si `auditLogsToAnonymize` croît jour après jour, vérifier que le cron
  tourne bien (`audit.retention.lastRunAt` doit être < 30h).

## 7. Tests

- `audit-anonymization.service.spec.ts` (35 tests)
  - Helpers purs : `anonymizeIp`, `anonymizeUserAgent`, `anonymizeEmail`,
    `anonymizeMetadata`
  - Lecture/écriture politique (`getPolicy`, `updatePolicy`)
  - Idempotence (`anonymizeBatch` filtre `anonymizedAt IS NULL`)
  - Mode legal hold (`NEVER` fait skip complet)
  - Robustesse (errors per-row, fallback `deleteMany` → `delete`)
- `audit.controller.spec.ts` — endpoints retention (rejet body vide,
  négatifs, `fullDays >= anonymizedDays`, parsing string-encoded numbers,
  trace manuelle dans audit log).

Couverture cible : ≥ 80 % de `audit-anonymization.service.ts`
(actuellement 100 % des branches métier, le cron `handleCron` étant
trivial → couvert via `runFullCycle`).

## 8. Limites & points d'attention review

- **Irréversibilité de l'anonymisation** : aucune restauration possible.
  Toute baisse de `fullDays` détruit immédiatement les PII des lignes
  intermédiaires. À documenter en interne avant tout changement.
- **Performance** : sur des volumes massifs, le cycle peut dépasser la
  fenêtre maintenance. Le cap `MAX_BATCHES_PER_RUN = 50` × `batchSize = 1000`
  → 50 000 lignes/run. À retuner si nécessaire (constante interne au
  service).
- **Snapshot acteur** : le champ `metadata.actorSnapshot` (introduit
  pour ISO 27001 A.5.33) est volontairement supprimé à l'anonymisation
  → on accepte la perte de l'attribution post-anonymisation au profit
  de la conformité RGPD.
- **Pas de migration historique** : les lignes pré-existantes au déploiement
  passeront naturellement par le cron. Le premier passage en prod traitera
  potentiellement plusieurs mois d'arriéré → à monitorer.
- **Non couvert ici** : autres tables PII (`User`, `DataExportRequest`,
  `ApprovalAuditLog`, `WorkflowRuleAuditLog`). Étendre cette politique
  fait l'objet d'autres items de la roadmap.

## 9. Références

- `apps/backend/src/audit/audit-anonymization.service.ts`
- `apps/backend/src/audit/audit.controller.ts`
- `apps/frontend/src/app/(app)/admin/audit/retention/page.tsx`
- `packages/database/prisma/migrations/20260427_audit_log_anonymization/`
- ISO 27001:2022 A.5.36 — Surveillance, examen et évaluation du SMSI
- RGPD art. 5 §1(c) — principe de minimisation
- RGPD art. 17 — droit à l'effacement
- CNIL « Lignes directrices sur l'anonymisation » (2017-04)
