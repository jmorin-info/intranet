# Inventaire des features livrées en pre-launch

> Snapshot des features clés livrées sur la branche `feat/p1-9-prelaunch`
> avant passage prod. Pour chaque entrée : commit hash de référence,
> description courte, fichiers principaux impactés, comment activer ou
> désactiver, dépendances, risques de rollback.
>
> Date de l'inventaire : 2026-04-25.

## Vue d'ensemble

| #   | Feature                                        | Commit principal         | Risque rollback                                            |
| --- | ---------------------------------------------- | ------------------------ | ---------------------------------------------------------- |
| 1   | RSSI dashboard + PDF SMSI ISO 27001            | `c63ddef`                | Faible (UI + export PDF)                                   |
| 2   | MFA fresh-12h + traçabilité per-user           | `88cf1b0`                | **Moyen** (sécurité, voir runbook)                         |
| 3   | Calendar ↔ tickets bidir + iCal export         | `33f8dc5`                | Faible (sync différée OK)                                  |
| 4   | Organigramme refonte + matrice accès clarifiée | `294084b`                | Faible                                                     |
| 5   | NOA mode humour cadré (flag global + opt-in)   | `91176da`                | Très faible (feature flag)                                 |
| 6   | MEDIA / CERTIFICATES previews                  | `cb70d24`                | Faible                                                     |
| 7   | GLANCE focus mode (Alt+Click overlay)          | `27e861c` puis `cb1a195` | Faible                                                     |
| 8   | CSP nonce-based middleware                     | `c50935d`                | **Moyen** (peut casser hydration si désactivé à mi-chemin) |

## 1. RSSI dashboard + PDF SMSI ISO 27001 — `c63ddef`

- **Description** : refonte complète du dashboard `/rssi` avec cartes par
  domaine ISO 27001, génération d'un rapport PDF SMSI signé SHA-256
  (`165b2c3` antérieur a posé l'export PDF, `c63ddef` consolide la refonte).
- **Fichiers principaux** :
  - Frontend : `apps/frontend/app/rssi/**`, composants cartes ISO
  - Backend : `apps/backend/src/rssi-dashboard/`, `apps/backend/src/iso-controls/`,
    `apps/backend/src/iso-analyzer/`
  - Export PDF : route `POST /api/rssi-dashboard/pdf` (signature SHA-256)
- **Activation** : roles `RSSI`, `SUPER_ADMIN` voient `/rssi`. Pas de flag.
- **Désactivation** : retirer le menu via `apps/frontend/lib/menu.ts` ou
  restreindre la route dans `RolesGuard`.
- **Dépendances** : Prisma (tables ISO controls), service de signature
  intégré au backend (`apps/backend/src/signatures/`).
- **Risque rollback** : faible. Revert le commit, regénérer le PDF côté
  build. Aucune migration Prisma destructive.

## 2. MFA fresh-12h + traçabilité per-user — `88cf1b0`

- **Description** : garde backend `MfaRequiredGuard` qui bloque les requêtes
  d'utilisateurs `mfaRequired=true && mfaEnabled=false`, plus garde
  `FreshMfaGuard` qui exige une revalidation TOTP < 12 h sur les actions
  sensibles. Champs `mfaEnforcedAt` / `mfaEnforcedById` ajoutés sur
  `User` pour la traçabilité.
- **Fichiers principaux** :
  - `apps/backend/src/mfa/mfa-required.guard.ts`
  - `apps/backend/src/mfa/fresh-mfa.guard.ts`
  - `apps/backend/src/mfa/mfa.service.ts` (`enforceMfa`, `setMfaPolicy`)
  - `apps/backend/src/mfa/decorators/skip-mfa-check.decorator.ts`
  - Schema : `packages/database/prisma/schema.prisma` (champs `mfa*`)
- **Activation** : guards inscrits comme `APP_GUARD` global. Politique
  appliquée par admin via `/admin/users` ou `POST /api/mfa/policy/:userId`.
- **Désactivation** : retirer l'inscription `APP_GUARD` dans
  `apps/backend/src/app.module.ts`. Ne PAS dropper les colonnes (data loss).
- **Dépendances** : Prisma (champs MFA), `@nestjs/passport`, lib TOTP.
- **Risque rollback** : **moyen**. Si rollback en plein milieu d'un parc
  où des users ont `mfaRequired=true`, on perd la garde côté serveur :
  régression de sécurité. Recommandation : avant rollback, exécuter
  `UPDATE "User" SET "mfaRequired"=false WHERE "mfaEnabled"=false;` pour
  éviter de bloquer les users orphelins. Voir `MFA_ENROLLMENT.md`.

## 3. Calendar ↔ tickets bidir + iCal export — `33f8dc5`

- **Description** : synchronisation bidirectionnelle entre tickets helpdesk
  et événements calendrier (date d'échéance ↔ event), export iCal `.ics`
  par user.
- **Fichiers principaux** :
  - `apps/backend/src/calendar/`, `apps/backend/src/tickets/`
  - Endpoints iCal : `GET /api/calendar/export.ics?token=<USER_TOKEN>`
- **Activation** : automatique pour tout ticket avec date métier.
  L'utilisateur génère son token iCal depuis `/profile` → onglet Calendrier.
- **Désactivation** : revert le commit ; les events synchronisés
  restent en DB (orphelins inoffensifs).
- **Dépendances** : `ical-generator`, jobs BullMQ pour la sync différée.
- **Risque rollback** : faible. Les jobs en queue se vident d'eux-mêmes.

## 4. Organigramme refonte + matrice accès — `294084b`

- **Description** : refonte de la page `/directory` (organigramme par
  département + lien manager hiérarchique) et clarification de la matrice
  d'accès `/admin/access` (rôles, départements, utilisateurs unifiés dans
  3 onglets).
- **Fichiers principaux** :
  - Frontend : `apps/frontend/app/directory/**`, `apps/frontend/app/admin/access/**`
  - Backend : `apps/backend/src/directory/`, `apps/backend/src/departments/`
- **Activation** : `/directory` accessible à tous, `/admin/access` aux
  rôles `ADMIN` + `SUPER_ADMIN`.
- **Désactivation** : revert UI ; aucun impact backend critique.
- **Dépendances** : Prisma (relation `User.managerId`).
- **Risque rollback** : faible.

## 5. NOA mode humour cadré — `91176da`

- **Description** : NOA (assistant) gagne un mode humour avec :
  - **Feature flag global** dans `AppConfig` (clé `noa.humor.enabled`)
  - **Opt-in user** dans `/profile` → toggle « Mode humour »
  - 60 messages d'humour cadrés + exclusions dures (RGPD, sécurité, sujets sensibles)
- **Fichiers principaux** :
  - Backend : `apps/backend/src/ai/`, table `AppConfig`, champ
    `User.preferences` JSON
  - Frontend : composant chat NOA + toggle profil
- **Activation** : `AppConfig.noa.humor.enabled=true` (admin) **ET**
  `User.preferences.humor=true` (user).
- **Désactivation** : flip global à `false` désactive immédiatement pour
  tous (override toggle user).
- **Dépendances** : Ollama / LLM local pour la génération.
- **Risque rollback** : très faible (pure feature flag).

## 6. MEDIA & CERTIFICATES previews — `cb70d24`

- **Description** : couvertures dédiées par album média et aperçu PDF
  des certificats utilisateurs (formations, attestations).
- **Fichiers principaux** :
  - `apps/backend/src/media/`, `apps/backend/src/certificates/`
  - Frontend : `apps/frontend/app/media/**`, `apps/frontend/app/certificates/**`
- **Activation** : automatique. Les couvertures sont générées au upload.
- **Désactivation** : revert UI ; les `coverUrl` en DB restent (cosmétique).
- **Dépendances** : pipeline thumbnails (sharp), `pdf-poppler` ou équivalent
  pour l'aperçu PDF.
- **Risque rollback** : faible.

## 7. GLANCE focus mode (Alt+Click overlay same-origin) — `27e861c` + `cb1a195`

- **Description** : aperçu rapide d'un lien interne sans quitter la page.
  Alt+Clic sur n'importe quel `<a>` interne ouvre une overlay Zen-like
  (Split panel, auto-pinned, navigable au clavier, accessible).
- **Fichiers principaux** :
  - `apps/frontend/components/glance/**`
  - Hook clavier : `apps/frontend/hooks/useGlance.ts` (ou équivalent)
- **Activation** : automatique sur tous les liens internes (same-origin).
- **Désactivation** : flag `NEXT_PUBLIC_GLANCE_ENABLED=false` ou retrait
  du provider racine dans `app/layout.tsx`.
- **Dépendances** : aucune lib externe spécifique (vanilla React + portails).
- **Risque rollback** : faible.

## 8. CSP nonce-based middleware — `c50935d`

- **Description** : middleware Next.js qui injecte une **nonce CSP**
  unique par requête, débloquant l'hydration streaming Next 15 sans
  recourir à `unsafe-inline`. Améliore le score CSP côté headers BunkerWeb.
- **Fichiers principaux** :
  - `apps/frontend/middleware.ts` (génération nonce + header CSP)
  - `apps/frontend/app/layout.tsx` (injection de la nonce dans `<script>` Next)
  - Conf BunkerWeb : header `Content-Security-Policy` avec `'nonce-<value>'`
- **Activation** : automatique au boot du frontend.
- **Désactivation** : retirer le middleware ; revenir à une CSP statique
  avec `unsafe-inline` (régression sécu acceptable temporaire).
- **Dépendances** : Next.js 15, BunkerWeb (passe-plat headers OK).
- **Risque rollback** : **moyen**. Si on rollback à mi-chemin (middleware
  désactivé mais BunkerWeb encore en CSP stricte), l'hydration casse
  (page blanche). Toujours rollback **frontend + reverse-proxy ensemble**.

## Procédure de rollback générique

```bash
cd /root/omnitech-intranet
git log --oneline -20                   # repérer le SHA précédent stable
git checkout -b rollback/<feature> <SHA>
pnpm install --frozen-lockfile
pnpm --filter @omnitech/database prisma:generate

# Si la feature touche le schéma Prisma : voir
# runbooks/PRODUCTION_INCIDENT_RESPONSE.md § Rollback pour la matrice
# additif/destructif. Règle d'or : ne JAMAIS lancer un drop column ou
# alter type avec data-loss sans validation RSSI.

systemctl restart omnitech-backend.service omnitech-frontend.service
curl -s http://localhost:3000/api/health | jq .
```

Voir `runbooks/PRODUCTION_INCIDENT_RESPONSE.md` § Rollback pour la
procédure encadrée.

## Annexes

- Branche : `feat/p1-9-prelaunch`
- Liste exhaustive `git log --oneline --grep="^feat(" -30` extraite le 2026-04-25
- Runbooks ops indispensables : `runbooks/PRODUCTION_INCIDENT_RESPONSE.md`,
  `runbooks/DATABASE_BACKUP_RESTORE.md`, `runbooks/SENTRY_ACTIVATION.md`,
  `runbooks/MONITORING_ALERTING.md`, `runbooks/SECRETS_ROTATION.md`,
  `runbooks/LDAP_SYNC_MANUAL.md`, `runbooks/MFA_ENROLLMENT.md`
- Inventaire complémentaire features (cyber-score, trust, tips, helpdesk
  IA, signatures, etc.) à compléter post-launch :
  ```bash
  git log --oneline --grep="^feat(" --since="2025-10-01" \
    --pretty=format:"- %h %s" > docs/FEATURES_HISTORICAL.md
  ```
  Procédure : à exécuter à chaque release majeure pour générer un
  changelog filtré aux `feat()` sur les 30 derniers commits, à enrichir
  manuellement avec les sections "rollback" + "rôles concernés" pour la
  doc clients.
