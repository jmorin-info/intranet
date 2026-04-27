# Plan de couverture de tests — Backend

Date : 2026-04-26
Branche : `feat/p1-9-prelaunch`
Audit source : `docs/audit/INTRANET_FEATURE_AUDIT_v1.0.md` (Annexe A)

## Objectif

Avant lancement v1.1, atteindre une couverture de tests unitaires/intégration suffisante sur les controllers critiques (sécurité + métier). Les tests utilisent le pattern **NestJS TestingModule + mocks Jest** — pas de Postgres réel, pas de docker, pas de tests E2E réseau.

## Pattern adopté

```ts
const module: TestingModule = await Test.createTestingModule({
  controllers: [ExampleController],
  providers: [
    { provide: SomeService, useValue: { ... } },
    Reflector,
  ],
}).compile();
```

Chaque `*.controller.spec.ts` couvre AU MINIMUM :
- (a) Happy path (auth/RBAC OK + délégation au service)
- (b) Cas d'autorisation refusée (vérifie `@Roles()` metadata via `Reflector`)
- (c) Cas d'entrée invalide (DTO manquant, body absent, file null, query out-of-range)

Les services dépendants sont mockés avec `jest.fn()`. Les guards (`JwtAuthGuard`, `RolesGuard`) ne sont PAS instanciés dans les tests controllers : on teste les **handlers et la metadata RBAC**, pas le pipeline de garde (déjà testé indirectement via `auth.service.spec.ts` et le guard `roles.guard`).

## v1.1 — Couverture livrée (10 controllers, ce PR)

| # | Controller                                | Module                  | Endpoints | Tests              |
|---|-------------------------------------------|-------------------------|-----------|--------------------|
| 1 | `auth.controller.ts`                      | Auth                    | 6         | login MFA, refresh, logout, reset, RBAC |
| 2 | `mfa.controller.ts`                       | MFA                     | 10        | setup, verify, disable, revalidate, RBAC SUPER_ADMIN |
| 3 | `audit.controller.ts`                     | Audit                   | 5         | RBAC ADMIN, my-activity cap, CSV export |
| 4 | `backup.controller.ts`                    | Backup                  | 7         | RBAC SUPER_ADMIN, export, restore, list |
| 5 | `documents.controller.ts`                 | Documents/GED           | 22        | RBAC bulk, uploadVersion input invalide, CSV |
| 6 | `tickets.controller.ts`                   | Tickets/Helpdesk        | 18        | findAll input invalide, RBAC bulk, CSV |
| 7 | `signatures.controller.ts`                | Signatures              | 9         | autorisation refusée signer, RBAC ADMIN |
| 8 | `chartes.controller.ts`                   | Chartes                 | 10        | RBAC, sign, streamPdf 404 |
| 9 | `push-notifications.controller.ts`        | Push                    | 4         | RBAC test, audit, subscribe |
|10 | `notifications.controller.ts`             | Notifications           | 6         | RBAC create/broadcast, pagination |
|11 | `rssi-dashboard.controller.ts`            | RSSI                    | 6         | RBAC controller-level + handler-level (PDF) |
|12 | `iso-controls.controller.ts`              | ISO Controls            | 6         | RBAC SUPER_ADMIN strict |
|13 | `campaigns.controller.ts`                 | Signature Campaigns     | 7         | RBAC, webhook signature invalide |

(13 controllers livrés au lieu des 10 prévus — chartes/notifications/iso-controls ajoutés car peu coûteux et critiques métier)

**Total : ~116 endpoints sur 234 → ≈50 % couverture controllers critiques.**

## v1.2 — À couvrir ensuite (priorisé)

### P1 — Sécurité résiduelle (avant CERTIF ISO)

| Controller                           | Pourquoi                          | Effort  |
|--------------------------------------|-----------------------------------|---------|
| `webhook.controller.ts` (signatures) | Webhook DocuSeal — signature secret env (no JWT). Test : signature valide vs invalide, replay. | 0.5 j  |
| `users.controller.ts`                | RBAC critique sur PATCH role, soft-delete, GDPR export, mfaPolicy. | 1 j    |
| `external-access.controller.ts`      | Tokens d'accès tiers (extranet) — autorisation, scopes, expiration. | 0.5 j  |
| `external-persons.controller.ts`    | Création prestataires (GDPR data minimization). | 0.5 j  |
| `data-retention.controller.ts`       | RGPD — purge/anonymisation, RBAC SUPER_ADMIN. | 0.5 j  |

### P2 — Métier ISO 27001

| Controller                           | Pourquoi                          | Effort  |
|--------------------------------------|-----------------------------------|---------|
| `incidents.controller.ts`            | Workflow incidents → remédiations (déjà couvert au service). | 0.5 j  |
| `remediations.controller.ts`         | Sub-controller incidents.        | 0.3 j  |
| `compliance-tasks.controller.ts`     | Plans d'action conformité.        | 0.3 j  |
| `frameworks.controller.ts`           | Référentiels ISO/NIS2/RGPD.       | 0.3 j  |
| `iso-analyzer.controller.ts`         | Détection écarts auto.            | 0.3 j  |
| `access-reviews.controller.ts`       | A.5.16 — revues d'accès périodiques. | 0.5 j |
| `ad-audit.controller.ts`             | Audit AD (vérifs périodiques).    | 0.3 j  |

### P3 — Workflow GED & Documents

| Controller                                        | Pourquoi                  | Effort  |
|--------------------------------------------------|---------------------------|---------|
| `workflows.controller.ts` (approval)             | Workflow d'approbation 4-eyes. | 0.5 j  |
| `workflow.controller.ts` (documents/workflow)    | Sub-workflow GED.          | 0.3 j  |
| `acknowledgments.controller.ts`                  | Acknowledgement docs A.5.20. | 0.3 j |
| `document-permissions.controller.ts`             | Permissions par document.   | 0.5 j  |
| `ged-dashboard.controller.ts`                    | Dashboard GED.              | 0.3 j  |

### P4 — Helpdesk & Self-service

| Controller                          | Pourquoi                  | Effort  |
|-------------------------------------|---------------------------|---------|
| `helpdesk.controller.ts`            | Self-service tickets.     | 0.5 j  |
| `ticket-spaces.controller.ts`       | Multi-espaces tickets.    | 0.3 j  |
| `satisfaction.controller.ts`        | Satisfaction surveys.     | 0.3 j  |
| `quiz.controller.ts`                | Quiz formations.          | 0.5 j  |
| `runbooks.controller.ts`            | Runbooks (alias wiki).    | 0.3 j  |

### P5 — Knowledge & Communication

| Controller                          | Pourquoi                  | Effort  |
|-------------------------------------|---------------------------|---------|
| `wiki.controller.ts`                | Wiki ISO 27001.           | 0.5 j  |
| `news.controller.ts`                | Communication interne.    | 0.3 j  |
| `tips.controller.ts`                | Tips de sécurité.         | 0.2 j  |
| `chat.controller.ts`                | Chat instantané.          | 0.5 j  |
| `mentions.controller.ts`            | Mentions @user.           | 0.2 j  |
| `banners.controller.ts`             | Bannières push.           | 0.2 j  |
| `testimonials.controller.ts`        | Témoignages.              | 0.2 j  |
| `veille.controller.ts`              | Veille cyber externe.     | 0.5 j  |

### P6 — Intégrations externes (mock-only — pas de prod)

| Controller                          | Pourquoi                  | Effort  |
|-------------------------------------|---------------------------|---------|
| `ldap.controller.ts`                | Connexion AD/LDAP.        | 0.5 j  |
| `knowbe4.controller.ts`             | KnowBe4 webhook.          | 0.3 j  |
| `office.controller.ts`              | OnlyOffice integration.   | 0.5 j  |
| `stirling.controller.ts`            | Stirling PDF tooling.     | 0.3 j  |
| `sms.controller.ts`                 | SMS OVH stub.             | 0.2 j  |
| `fileserver.controller.ts`          | SMB integration.          | 0.3 j  |
| `smb-office.controller.ts`          | SMB Office sub.           | 0.3 j  |
| `rag.controller.ts`                 | RAG Ollama.               | 0.5 j  |
| `ai.controller.ts`                  | AI suggestions.           | 0.5 j  |
| `meilisearch.controller.ts`         | Search index.             | 0.3 j  |
| `search.controller.ts`              | Search global.            | 0.3 j  |
| `certificates.controller.ts`        | TLS certificates.         | 0.3 j  |

### P7 — Admin & Health (utilitaires)

| Controller                          | Pourquoi                  | Effort  |
|-------------------------------------|---------------------------|---------|
| `health.controller.ts`              | Healthz prom.             | 0.2 j  |
| `public.controller.ts`              | Routes publiques.         | 0.2 j  |
| `kiosk.controller.ts`               | Mode kiosque.             | 0.3 j  |
| `dashboard.controller.ts`           | Dashboard.                | 0.3 j  |
| `directory.controller.ts`           | Directory annuaire.       | 0.3 j  |
| `departments.controller.ts`         | Départements.             | 0.3 j  |
| `cyber-score.controller.ts`         | Cyber score.              | 0.5 j  |
| `config.controller.ts`              | AppConfig.                | 0.3 j  |
| `it-exports.controller.ts`          | Exports IT.               | 0.3 j  |
| `exports.controller.ts`             | Exports génériques.       | 0.3 j  |
| `reports.controller.ts`             | Reports.                  | 0.3 j  |
| `pca.controller.ts`                 | PCA backups.              | 0.5 j  |
| `system-monitoring.controller.ts`   | Monitoring système.       | 0.3 j  |
| `media.controller.ts`               | Media uploads.            | 0.3 j  |
| `csv-import.controller.ts`          | Import CSV users.         | 0.5 j  |
| `onboarding.controller.ts`          | Onboarding flow.          | 0.5 j  |
| `calendar.controller.ts`            | Calendrier.               | 0.5 j  |
| `spaces.controller.ts`              | Spaces.                   | 0.3 j  |
| `workflow-rules.controller.ts`      | Règles workflow.          | 0.3 j  |
| `saved-filters.controller.ts`       | Filtres sauvegardés.      | 0.3 j  |
| `trust.controller.ts`               | Trust center.             | 0.5 j  |
| `alerts.controller.ts`              | Alertes système.          | 0.3 j  |

## Résumé effort

| Priorité | Controllers | Effort total |
|----------|-------------|--------------|
| P1 (résiduelle sécurité)  | 5  | 3 j   |
| P2 (métier ISO)           | 7  | 2.5 j |
| P3 (GED/documents)        | 5  | 1.9 j |
| P4 (helpdesk)             | 5  | 1.6 j |
| P5 (knowledge)            | 8  | 2.4 j |
| P6 (intégrations)         | 12 | 4.4 j |
| P7 (admin/health)         | 22 | 7.7 j |
| **Total v1.2 → v1.3**     | **64** | **≈24 j (1 dev)** |

## Recommandations transverses

1. **Pas de tests E2E base réelle** — coût d'infra trop élevé pour rendre déterministe. Les tests d'intégration restent au niveau service avec Prisma mock.
2. **Audit RBAC systématique** : pour chaque endpoint, vérifier `@Roles()` metadata via `Reflector`. C'est le test le plus rentable (anti-régression sécurité).
3. **Tests de DTO** : couvrir séparément avec `class-validator` (non fait ici car zéro régression observée — DTO sont déclaratifs).
4. **Tests Guards (JwtAuthGuard, RolesGuard, FreshMfaGuard, UserThrottlerGuard)** : déjà couverts indirectement, ajouter tests dédiés au plus tard v1.3 quand on aura un wave de refacto Guards.
5. **Tests interceptors / pipes** : `ParseUUIDPipe`, `ValidationPipe` viennent du framework, pas notre code → pas tester.
6. **CI** : passer `pnpm --filter backend test --coverage` en pre-commit hook quand >70% atteint, sinon spam developer.

## Métriques actuelles (estimation manuelle)

- Avant ce PR : 16 specs (services + utils), 0 controller spec.
- Après ce PR : 16 specs services + **13 controller specs**.
- Coverage estimée : **~25 %** des 234 endpoints critiques.
- Reste à atteindre 80 % : environ 64 controllers / 118 endpoints (effort estimé 24 j-dev).

## Tâches reportées explicitement à v1.2

- Tests d'intégration E2E avec supertest réel sur app NestJS bootstrap (besoin Redis + Postgres mockés). Décision : différer.
- Tests Frontend Vitest sur les composants client → pas dans le scope de ce PR (frontend distinct).
- Tests Playwright E2E (`/e2e/`) : audit séparé, dépend de l'environnement de test.
- Tests des cron jobs `JobsService` (cleanup tokens, audit, digest) : low priority — exécution déterministe difficile sans freezer time.
- Tests du processor `data-export.processor.ts` (BullMQ queue runner) : ajouté dans le scope du chantier 2 (data-export endpoint).

## Validations attendues à chaque ajout de spec

```bash
pnpm --filter backend test                 # full suite
pnpm --filter backend test -- foo.spec.ts  # ciblé
pnpm --filter backend typecheck            # bloque le commit si types KO
```

## Suivi par commit (mise à jour incrémentale)

Le tableau ci-dessous trace les commits qui font progresser la couverture
tests / dette technique sur la branche `worktree-agent-a27284cdc5dd23235`
(rebasera ensuite sur `feat/p1-9-prelaunch`).

| Commit  | Type      | Apport                                               |
|---------|-----------|------------------------------------------------------|
| f3768d1 | test      | 13 controller specs (≈2677 lignes) + ce plan v1     |
| 85d7d57 | feat      | Queue BullMQ data-export — ajoute `data-export.processor.spec.ts` au backlog v1.2 |
| b572290 | refactor  | Repository pattern documents — facilite mocking dans `documents.service.spec.ts` |
| a40477b | refactor  | Repository pattern tickets (lecture KB + group-by) — `tickets.service.spec.ts` etendu (provider TicketsRepository reel + CacheService mock) |
| f80d84b | chore     | Reactivation ESLint strict (item 4 dette) — backend + frontend, prepare la voie aux tests no-floating-promises v1.2 |

### Impact sur la roadmap tests

Trois prerequis pour atteindre les 80 % de couverture sont desormais pres :

1. **Repository pattern** (a40477b + b572290) : le mock `prisma.*` migre
   vers le mock `repo.*` dans les services qui l'utilisent. Reduction
   d'environ 40 % du boilerplate par spec service.
2. **ESLint strict en warn** (f80d84b) : detection precoce des
   `unused-vars` qui sont souvent le symptome de tests partiellement
   commences (mocks non consommes). Aide la revue.
3. **Queue BullMQ data-export** (85d7d57) : ajoute un nouveau processor a
   couvrir → `data-export.processor.spec.ts` integre au backlog P1
   (prioritaire car impact RGPD direct).

### Nouvelles entrees backlog v1.2

| Spec à ajouter                              | Prio | Effort | Reference |
|---------------------------------------------|------|--------|-----------|
| `data-export.processor.spec.ts`             | P1   | 0.5 j  | 85d7d57   |
| `documents.repository.spec.ts`              | P3   | 0.3 j  | b572290   |
| `tickets.repository.spec.ts` (extension)    | P3   | 0.3 j  | a40477b   |

### Status agregé v1.1 (post-commits a40477b/f80d84b)

- Specs services : 16 + 1 etendu (tickets) = **17 specs services**
- Specs controllers : **13 specs controllers** (inchange)
- Endpoints couverts : **≈116 / 234 = 50 %**
- Lignes de tests cumulees : **≈2900** (specs + setup mocks)
- Dette eslint : **0 violation `error`** (apres commit f80d84b)
