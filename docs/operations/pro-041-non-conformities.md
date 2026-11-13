# PRO_041 — Procédure de gestion des non-conformités

> **Référence ISO 27001:2022** : §10.2 (non-conformité et action corrective),
> A.5.27 (tirer les enseignements des incidents), A.5.36 (conformité aux
> politiques, règles et normes), A.5.35 (revue indépendante de la sécurité).
> **Documents liés** : POL_015 (classification), PRO_040 (informations
> documentées), REG_016 (registre documentaire SMSI).
> **Statut** : 1.0 — Création initiale, alignée sur l'intranet OMNITECH
> branche `feature/sharepoint-v2-polish-and-tests`.

## 1. Objet et périmètre

Toute déviation par rapport à une exigence du SMSI OMNITECH (politique,
procédure, contrôle ISO 27001 Annexe A, exigence réglementaire CNIL/ANSSI/NIS2
ou engagement contractuel) constitue une **non-conformité (NC)**. La présente
procédure définit le processus de détection, qualification, traitement,
suivi et clôture des NC, dans le respect d'ISO 27001 §10.2.

**Périmètre** :

- L'ensemble du SMSI OMNITECH : sièges, télétravail, prestataires intégrés au
  périmètre de certification.
- Les processus techniques (exploitation IT, développement, hébergement) et
  organisationnels (RH, formation, gestion documentaire).
- Les NC issues d'audits internes, d'audits externes (certificateur, client),
  d'incidents de sécurité, de revues de direction, de remontées
  collaborateurs ou d'alertes automatisées.

**Hors périmètre** :

- Les anomalies fonctionnelles de l'intranet sans impact SMSI (gérées via
  `tickets` catégorie `SOFTWARE`/`OTHER`).
- Les incidents de sécurité confirmés qui restent traités via PRO de gestion
  des incidents (cf. `apps/backend/src/incidents/`), sauf lorsqu'ils révèlent
  une défaillance systémique du SMSI — auquel cas une NC est ouverte en
  complément.

## 2. Définitions

| Terme                         | Définition                                                                                               |
| ----------------------------- | -------------------------------------------------------------------------------------------------------- |
| **Non-conformité (NC)**       | Non-satisfaction d'une exigence du SMSI (ISO 27001, politique interne, contractuelle ou légale).         |
| **Action corrective (AC)**    | Action destinée à éliminer la _cause_ de la NC pour éviter sa récurrence (ISO 27001 §10.2.d).            |
| **Action curative**           | Action destinée à éliminer l'_effet_ immédiat de la NC. Ne dispense pas de l'action corrective.          |
| **NC majeure**                | Compromet l'efficacité du SMSI, ou exigence ISO non couverte, ou pattern récurrent (≥ 3 occurrences/an). |
| **NC mineure**                | Déviation ponctuelle sans impact systémique, traitable par une action corrective simple.                 |
| **Cause racine**              | Origine première de la NC, identifiée par méthode d'analyse (5 Why, Ishikawa, arbre des causes).         |
| **Vérification d'efficacité** | Contrôle a posteriori (≥ 30 jours après mise en œuvre de l'AC) confirmant l'absence de récurrence.       |

## 3. Sources de détection et porte d'entrée intranet

| Source                                             | Outil intranet                                                     | Module backend                                                                     | Workflow déclenché                                                                                                                           |
| -------------------------------------------------- | ------------------------------------------------------------------ | ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Audit interne (revue ISO)                          | Page `/admin/compliance` (sous-onglet Controls)                    | `apps/backend/src/iso-controls/`, `apps/backend/src/iso-analyzer/`                 | Constat consigné dans le commentaire du contrôle ; création manuelle d'un ticket Securite (cf. §5).                                          |
| Audit externe (certificateur, client)              | Saisie manuelle                                                    | —                                                                                  | Création d'un ticket dans l'espace `Securite` avec tag `nc-majeure` ou `nc-mineure`.                                                         |
| Incident de sécurité révélant une défaillance SMSI | Module Incidents                                                   | `apps/backend/src/incidents/` (`Incident`, `Remediation`, `IncidentTimelineEntry`) | NC ouverte en complément si `rootCause` indique une défaillance de contrôle ; lien manuel Incident ↔ Ticket via tag commun (`INC-2026-001`). |
| Revue de direction                                 | Compte-rendu archivé dans `Document` (catégorie `MEETING_MINUTES`) | `apps/backend/src/documents/`, `apps/backend/src/registre/`                        | Décisions ouvrant des NC consignées en tickets `Securite`.                                                                                   |
| Alerte comportementale automatisée                 | Page `/admin/security` (Behavior Alerts)                           | `apps/backend/src/behavior-detection/` (`BehaviorAlert*`)                          | Évaluation manuelle par le RSSI : si la cause est un manquement à une politique, ouverture de NC.                                            |
| Revue d'accès périodique                           | `/admin/access-reviews`                                            | `apps/backend/src/access-reviews/` (`AccessReview*`)                               | Décisions `REVOKE` non appliquées dans les délais → NC.                                                                                      |
| Remontée collaborateur                             | Module Tickets, espace `Securite`                                  | `apps/backend/src/tickets/` (`Ticket`, `TicketComment`, `TicketSpace`)             | Ticket dans le `TicketSpace` slug `securite`, catégorie `SECURITY`.                                                                          |
| Non-respect plan de tâches conformité              | `/admin/compliance` (sous-onglet Planning)                         | `apps/backend/src/compliance-tasks/` (`ComplianceTask`)                            | Tâche `OVERDUE` → NC mineure si récurrente.                                                                                                  |
| Échec de sauvegarde / contrôle PCA                 | `/admin/backups`, `/admin/pca`                                     | `apps/backend/src/backup/`, `apps/backend/src/pca/`                                | NC ouverte par RSSI si le dispositif est durablement dégradé.                                                                                |

> **Note** : aucun modèle Prisma `NonConformity` dédié n'existe à date.
> Le support opérationnel d'une NC est un **`Ticket` dans le `TicketSpace`
> `Securite`** (cf. `packages/database/prisma/schema.prisma` lignes
> 1023-1073, enum `TicketCategory.SECURITY` ligne 959). Les éventuelles
> actions correctives associées à un incident utilisent en parallèle le
> modèle `Remediation` (schema lignes 1685-1705).

## 4. Qualification (NC majeure vs mineure)

La qualification est prononcée par le **RSSI** (ou son délégué nommé dans
POL_015) dans les **5 jours ouvrés** suivant la détection.

| Critère                            | NC mineure                        | NC majeure                                 |
| ---------------------------------- | --------------------------------- | ------------------------------------------ |
| Impact sur l'efficacité du SMSI    | Faible / localisé                 | Significatif / systémique                  |
| Couverture ISO 27001               | Contrôle partiellement défaillant | Exigence ISO non couverte                  |
| Récurrence sur 12 mois glissants   | < 3 occurrences                   | ≥ 3 occurrences                            |
| Conséquence client / réglementaire | Aucune                            | Risque CNIL, NIS2, contractuel             |
| Délai max de clôture cible         | 90 jours                          | 180 jours (plan d'action validé sous 30 j) |

La qualification est tracée dans le ticket via un **tag** (`nc-mineure` ou
`nc-majeure`) et une mention explicite dans le premier `TicketComment` du
RSSI.

## 5. Workflow intranet

```
                ┌──────────────────────────┐
                │ 1. Détection             │
                │   (source §3)            │
                └───────────┬──────────────┘
                            │
                            ▼
   ┌──────────────────────────────────────────────────────┐
   │ 2. Création ticket espace Securite                   │
   │    POST /tickets   (TicketCategory=SECURITY)         │
   │    titre = "NC – <objet>"                            │
   │    tags  = ["nc-candidat", "<source>"]               │
   │    AuditLog: action="TICKET_CREATED"                 │
   └───────────────────────────┬──────────────────────────┘
                               │
                               ▼
   ┌──────────────────────────────────────────────────────┐
   │ 3. Triage RSSI (≤ 5 j ouvrés)                        │
   │    - Qualification majeure / mineure                 │
   │    - Tag remplacé : nc-majeure | nc-mineure          │
   │    - Priorité TicketPriority alignée                 │
   │      (HIGH/CRITICAL pour majeure)                    │
   └───────────────────────────┬──────────────────────────┘
                               │
                               ▼
   ┌──────────────────────────────────────────────────────┐
   │ 4. Analyse de cause racine                           │
   │    Méthodes : 5 Why / Ishikawa / Arbre des causes    │
   │    Consignée dans un TicketComment (markdown)        │
   │    Si NC liée à un Incident : rootCause aussi mis    │
   │    à jour sur le modèle Incident                     │
   └───────────────────────────┬──────────────────────────┘
                               │
                               ▼
   ┌──────────────────────────────────────────────────────┐
   │ 5. Plan d'action correctif                           │
   │    - 1..n ComplianceTask créées via                  │
   │      POST /compliance-tasks (status TODO)            │
   │    - ou 1..n Remediation si lien Incident            │
   │      POST /incidents/:id/remediations                │
   │    - Champ isoControl renseigné (ex: "A.5.36")       │
   │    - Owner + nextDueDate obligatoires                │
   └───────────────────────────┬──────────────────────────┘
                               │
                               ▼
   ┌──────────────────────────────────────────────────────┐
   │ 6. Mise en œuvre                                     │
   │    - L'owner exécute, met à jour status              │
   │      (IN_PROGRESS → COMPLETED)                       │
   │    - Pièces probantes déposées :                     │
   │       • Documents → module documents                 │
   │       • Configurations → module it-exports           │
   └───────────────────────────┬──────────────────────────┘
                               │
                               ▼
   ┌──────────────────────────────────────────────────────┐
   │ 7. Vérification d'efficacité (≥ 30 j après MEP)      │
   │    - RSSI contrôle absence de récurrence             │
   │    - Commentaire dédié sur le ticket                 │
   └───────────────────────────┬──────────────────────────┘
                               │
                               ▼
   ┌──────────────────────────────────────────────────────┐
   │ 8. Clôture                                           │
   │    - Ticket : status=RESOLVED puis CLOSED            │
   │    - Tag `nc-cloturee` ajouté                        │
   │    - AuditLog: action="TICKET_STATUS_UPDATED"        │
   └──────────────────────────────────────────────────────┘
```

## 6. Modules intranet utilisés

| Module                | URL frontend                          | Code backend                                                       | Rôle vis-à-vis des NC                                                                            |
| --------------------- | ------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| Tickets               | `/tickets`                            | `apps/backend/src/tickets/`                                        | Support principal de la NC (espace `Securite`).                                                  |
| Incidents             | `/incidents`                          | `apps/backend/src/incidents/`                                      | Source de détection + plan d'action via `Remediation` lorsqu'un incident révèle une défaillance. |
| Compliance Tasks      | `/admin/compliance` (onglet Planning) | `apps/backend/src/compliance-tasks/`                               | Plan d'action correctif récurrent ; champ `isoControl` permet le rattachement Annexe A.          |
| ISO Controls          | `/admin/compliance` (onglet Controls) | `apps/backend/src/iso-controls/`, `apps/backend/src/iso-analyzer/` | Référentiel Annexe A ; mise à jour du statut de couverture après clôture d'AC.                   |
| Audit Trail           | `/admin/audit`                        | `apps/backend/src/audit/`                                          | Traçabilité immuable de chaque action sur la NC (cf. §8).                                        |
| Registre Documentaire | `/admin/registre`                     | `apps/backend/src/registre/`                                       | Référence le présent PRO_041 et POL_015 / PRO_040 associés (REG_016).                            |
| RSSI Dashboard        | `/admin/rssi-dashboard`               | `apps/backend/src/rssi-dashboard/`                                 | Vue agrégée KPIs (cf. §7).                                                                       |
| Behavior Detection    | `/admin/security`                     | `apps/backend/src/behavior-detection/`                             | Source d'alertes pouvant initier une NC.                                                         |
| Access Reviews        | `/admin/access-reviews`               | `apps/backend/src/access-reviews/`                                 | Décisions non appliquées → NC mineure.                                                           |
| IT Exports            | `/admin/it-exports`                   | `apps/backend/src/it-exports/` (modèle `ItExport`)                 | Dépôt de preuves (configurations FortiGate, AD, etc.) à joindre à l'AC.                          |
| Data Retention        | `/admin/system-monitoring`            | `apps/backend/src/data-retention/`                                 | Archivage automatique selon politique (cf. §9).                                                  |

## 7. Indicateurs et reporting

Les KPIs ci-dessous sont calculés à partir des tickets `TicketSpace=securite`
porteurs d'un tag `nc-*`, et exposés sur `/admin/rssi-dashboard`
(`apps/backend/src/rssi-dashboard/rssi-dashboard.service.ts`).

| Indicateur             | Définition                                                          | Cible                               |
| ---------------------- | ------------------------------------------------------------------- | ----------------------------------- |
| `nc.open.total`        | Nombre de NC ouvertes (`status` ∈ {`OPEN`,`IN_PROGRESS`,`WAITING`}) | À surveiller                        |
| `nc.open.major`        | NC majeures ouvertes                                                | 0 cible                             |
| `nc.mttr.days`         | Délai moyen de clôture (`closedAt - createdAt`)                     | < 90 j (mineure), < 180 j (majeure) |
| `nc.recurrence.rate`   | Part de NC rouvertes ou NC dont le motif récurrent existe déjà      | < 10 %                              |
| `nc.closure.ratio.12m` | Ratio (closes / créées) sur 12 mois glissants                       | > 90 %                              |
| `nc.action.overdue`    | Nombre de `ComplianceTask` au statut `OVERDUE` rattachées à une NC  | 0 cible                             |

Une revue mensuelle est animée par le RSSI ; une consolidation est présentée
en **revue de direction** trimestrielle (input ISO 27001 §9.3).

## 8. Audit trail (ISO 27001 A.5.27, A.8.15)

Chaque action sur une NC génère un enregistrement `AuditLog`
(`apps/backend/src/audit/audit.service.ts`, schéma Prisma lignes 853-885).

| Évènement                         | `action`                                                                           | `resourceType`                   | `resourceId` |
| --------------------------------- | ---------------------------------------------------------------------------------- | -------------------------------- | ------------ |
| Création NC                       | `TICKET_CREATED`                                                                   | `Ticket`                         | `ticket.id`  |
| Qualification (changement de tag) | `TICKET_UPDATED` (commentaire RSSI horodaté)                                       | `Ticket`                         | `ticket.id`  |
| Plan d'action — AC créée          | `REMEDIATION_CREATED` (si Incident) ou journalisation applicative `ComplianceTask` | `Remediation` / `ComplianceTask` | `id`         |
| AC complétée                      | `REMEDIATION_COMPLETED`                                                            | `Remediation`                    | `id`         |
| Changement de statut ticket       | `TICKET_STATUS_UPDATED`                                                            | `Ticket`                         | `ticket.id`  |
| Clôture                           | `TICKET_STATUS_UPDATED` (`CLOSED`)                                                 | `Ticket`                         | `ticket.id`  |

Les champs `userId`, `ipAddress`, `userAgent` et `metadata` sont remplis par
l'intercepteur `apps/backend/src/audit/audit.interceptor.ts`. Anonymisation
PII gérée par `AuditAnonymizationService` (cron quotidien 4h, cf.
`docs/compliance/AUDIT_LOG_RETENTION.md`).

## 9. Conservation et archivage

| Objet                                       | Durée minimale                           | Mécanisme                                                                                                                 |
| ------------------------------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Ticket NC (création, statuts, commentaires) | 5 ans après clôture                      | Conservé en base ; suppression logique (`Ticket` n'a pas de `deletedAt` natif — conservation indéfinie sauf purge admin). |
| `AuditLog` lié à la NC                      | 5 ans (bruts) puis anonymisé             | `apps/backend/src/audit/audit-anonymization.service.ts`.                                                                  |
| `Remediation`                               | Solidaire de l'`Incident` parent         | Cascade `onDelete: Cascade` — purge contrôlée par PRO de gestion des incidents.                                           |
| `ComplianceTask`                            | 5 ans                                    | Pas de purge automatique : conservation à long terme.                                                                     |
| Pièces probantes (`Document`, `ItExport`)   | Selon POL_015 (Confidentiel = 5 ans min) | `data-retention.scheduler.ts` (cron nocturne) applique la politique A.5.33.                                               |

Document de référence dans le registre : **REG_016**, ligne dédiée à
`PRO_041` (à provisionner par PRO_040 §7.3 lors de la première mise en
application).

## 10. Voir aussi

- `POL_015` — Politique de classification, marquage et transfert (échelle 4
  niveaux, cf. `apps/backend/src/registre/registre.service.ts:71` et §5).
- `PRO_040` — Gestion des informations documentées (pyramide documentaire
  §7.1, mapping `DocumentCategory`).
- `REG_016` — Registre documentaire SMSI
  (`/admin/registre`, `apps/backend/src/registre/`).
- `docs/operations/ged-sharepoint.md` — Synchronisation REG_016 ↔ SharePoint.
- `docs/compliance/AUDIT_LOG_RETENTION.md` — Politique de rétention des logs
  d'audit (ISO 27001 A.8.15).
- `apps/backend/src/incidents/` — Module incidents (`Incident`,
  `Remediation`, `IncidentTimelineEntry`).
- `apps/backend/src/compliance-tasks/` — Module tâches de mise en
  conformité.
- `apps/backend/src/iso-controls/` — Référentiel Annexe A ISO 27001.
- `apps/backend/src/rssi-dashboard/` — KPIs RSSI agrégés.

## 11. Limitations actuelles et axes V2

Le code base actuel ne dispose **pas d'objet métier NC dédié**. Les
limitations identifiées et axes d'amélioration sont les suivants.

| Limitation                                                                                                           | Impact                                                                                                                                           | Évolution proposée (V2)                                                                                                                                                                             |
| -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pas de modèle Prisma `NonConformity` (ni de table dédiée).                                                           | NC matérialisée par un `Ticket` + convention de tags (`nc-majeure`, `nc-mineure`, `nc-cloturee`). Risque d'incohérence si le tag n'est pas posé. | Introduire un modèle `NonConformity` avec champs `severity` (enum `MAJOR`/`MINOR`), `rootCause`, `detectedSource`, `closureVerifiedAt`, et relations vers `Ticket` / `Incident` / `ComplianceTask`. |
| Pas de valeur `NON_CONFORMITE` dans `enum TicketCategory` (schema ligne 952-961).                                    | La catégorisation repose sur `TicketCategory.SECURITY` + tags. Filtrage analytique moins fin.                                                    | Ajouter `NON_CONFORMITY` à `TicketCategory` ou créer un champ `nature` séparé.                                                                                                                      |
| `ComplianceTask` ne référence pas explicitement la NC d'origine (champ `isoControl` libre, pas de FK vers `Ticket`). | Rattachement informel ; KPIs §7 calculables uniquement par jointure textuelle.                                                                   | Ajouter `nonConformityId String?` (ou `ticketId String?`) avec index.                                                                                                                               |
| Pas d'actions `AuditLog` spécifiques aux NC (`NC_CREATED`, `NC_QUALIFIED`, `NC_CLOSED`).                             | Les évènements sont enregistrés sous `TICKET_*` ; reconstitution audit nécessite un filtrage par tag.                                            | Ajouter des actions dédiées dans `audit.service.ts` lorsque la qualification d'un ticket en NC est effectuée.                                                                                       |
| Pas d'UI dédiée NC dans `/admin/`.                                                                                   | Les RSSI naviguent entre `/tickets`, `/incidents`, `/admin/compliance`.                                                                          | Créer une page `/admin/non-conformities` consolidant les vues (similaire à `/admin/access-reviews`).                                                                                                |
| Pas de workflow d'approbation pour la clôture (la vérification d'efficacité est manuelle).                           | Risque de clôture prématurée.                                                                                                                    | Brancher sur `apps/backend/src/approval-workflows/` (déjà disponible) pour exiger une revue RSSI documentée.                                                                                        |
| Pas d'enum dédiée pour `ComplianceTask.status` (champ String libre, schema ligne 1554).                              | Risque de divergence (`COMPLETED` vs `DONE`).                                                                                                    | Migrer vers un enum Prisma `ComplianceTaskStatus`.                                                                                                                                                  |
| Pas de lien automatique Incident → NC.                                                                               | Le lien est purement déclaratif (tag commun).                                                                                                    | Ajouter `Incident.relatedNonConformityIds String[]` ou table de jointure.                                                                                                                           |

Ces évolutions sont à arbitrer lors de la prochaine revue de direction et
inscrites au backlog SMSI sous PRO_041-V2.

## 12. Historique

| Version | Date       | Auteur                                 | Changement                                                                                                                                                             |
| ------- | ---------- | -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1.0     | 2026-06-13 | Intranet auto-doc (`docs/operations/`) | Création initiale, alignée sur la branche `feature/sharepoint-v2-polish-and-tests`. Couvre §10.2 ISO 27001:2022 et A.5.27. Liste les limitations en vue de PRO_041-V2. |
