# Runbook — Enrôlement et reset MFA

> Procédure utilisateur + ops pour activer, retirer, contrôler et réinitialiser
> le second facteur d'authentification (TOTP) sur l'intranet OMNITECH Security.
> Conforme ISO 27001:2022 — A.8.5 (authentification forte) et ANSSI R20.

## Quand utiliser ce runbook

- Onboarding utilisateur (auto-enrôlement via `/profile`)
- Reset MFA après perte de l'app authenticator
- Application d'une politique MFA forcée par l'admin
- Audit RSSI (qui a / n'a pas le MFA actif)

## Pré-requis

- Compte utilisateur actif sur l'intranet
- Application TOTP sur smartphone (Google Authenticator, Aegis, 1Password, Bitwarden…)
- Pour les actions admin : rôle `SUPER_ADMIN` ou `ADMIN` selon endpoint

## Architecture & politique actuelle

- **Garde globale** : `MfaRequiredGuard` (`apps/backend/src/mfa/mfa-required.guard.ts`)
  bloque toute requête authentifiée d'un user `mfaRequired=true && mfaEnabled=false`
  avec une `403 { code: "MFA_SETUP_REQUIRED" }` que le frontend redirige vers `/mfa`.
- **Politique appliquée** : actuellement, le code expose `enforceMfa(roles?)` dans
  `mfa.service.ts:387`. La cible des rôles est paramétrable :
  - sans paramètre → tous les utilisateurs actifs
  - avec `roles: ['ADMIN', 'SUPER_ADMIN']` → uniquement les admins
  - politique réellement déployée actuellement :
    `[À COMPLÉTER PAR L'ÉQUIPE OPS : confirmer auprès du RSSI quels rôles sont
    soumis à mfaRequired=true en base — recommandation RSSI = SUPER_ADMIN + ADMIN
    + RSSI obligatoire, COLLABORATEUR optionnel]`
- **Fraîcheur** : la garde `FreshMfaGuard` (`apps/backend/src/mfa/fresh-mfa.guard.ts`)
  exige une revalidation TOTP sur certaines actions sensibles si la dernière
  vérification date de plus de **12 h**.
- **Per-user audit** : `mfaEnforcedAt` + `mfaEnforcedById` sur la table `User`
  permettent de tracer qui a forcé MFA sur qui (audit `MFA_POLICY_ENFORCED`).

## Procédure utilisateur

### 1. Activer le MFA (auto-enrôlement)

1. Se connecter à l'intranet
2. Cliquer sur l'avatar en haut à droite → **Mon profil**
3. Onglet **Sécurité** → bouton **Activer MFA**
4. Scanner le QR code avec l'app authenticator
5. Saisir le code à 6 chiffres pour confirmer
6. **Sauvegarder les codes de secours** (à mettre dans le coffre perso)
7. Confirmation visuelle : badge MFA vert sur le profil

### 2. Désactiver le MFA (self-service)

1. **Mon profil** → **Sécurité** → **Désactiver MFA**
2. Re-saisir : mot de passe **+** code TOTP **ou** code de secours
3. Confirmation : badge MFA repasse en gris

### 3. Perte de l'app authenticator

Si vous avez encore au moins un **code de secours** :

1. Page de login → coller email + mot de passe
2. Sur le prompt MFA → cliquer **« Utiliser un code de secours »**
3. Saisir un des codes (chacun est à usage unique)
4. Une fois connecté, retourner dans **Mon profil → Sécurité** pour
   désactiver puis ré-activer MFA (nouveau QR + nouveaux codes)

Si vous n'avez plus aucun code → contacter un admin (cf. §Procédure admin).

## Procédure admin

### 1. Forcer l'enrôlement MFA pour un utilisateur

UI : `/admin/users` → ligne utilisateur → action **« Imposer MFA »**.

API équivalente :

```bash
curl -s -X POST \
     -H "Authorization: Bearer <SUPER_ADMIN_JWT>" \
     -H "Content-Type: application/json" \
     -d '{"enforced": true}' \
     https://intranet.omnitech-security.fr/api/mfa/policy/<USER_ID>
```

Effet : `mfaRequired=true` posé en base. À la prochaine requête authentifiée,
l'utilisateur reçoit `403 MFA_SETUP_REQUIRED` et est redirigé vers `/mfa`.

### 2. Reset MFA pour un utilisateur (perte d'app + plus de codes)

UI : `/admin/users` → ligne utilisateur → action **« Réinitialiser MFA »**.

API équivalente :

```bash
curl -s -X POST \
     -H "Authorization: Bearer <SUPER_ADMIN_JWT>" \
     https://intranet.omnitech-security.fr/api/mfa/admin/reset/<USER_ID>
```

Effet : `mfaEnabled=false`, `mfaSecret=null`, `backupCodes=null`. Si la
politique impose `mfaRequired=true`, l'utilisateur sera obligé de
ré-enrôler à la prochaine connexion.

### 3. Lever la politique MFA pour un utilisateur

UI : `/admin/users` → action **« Lever la politique MFA »**.

API :

```bash
curl -s -X POST \
     -H "Authorization: Bearer <SUPER_ADMIN_JWT>" \
     -H "Content-Type: application/json" \
     -d '{"enforced": false}' \
     https://intranet.omnitech-security.fr/api/mfa/policy/<USER_ID>
```

### 4. Appliquer en masse

```bash
# Tous les ADMIN + SUPER_ADMIN (recommandation par défaut)
curl -s -X POST \
     -H "Authorization: Bearer <SUPER_ADMIN_JWT>" \
     -H "Content-Type: application/json" \
     -d '{"roles": ["ADMIN", "SUPER_ADMIN"]}' \
     https://intranet.omnitech-security.fr/api/mfa/enforce-bulk

# Tous les utilisateurs actifs (rare — décision RSSI requise)
curl -s -X POST \
     -H "Authorization: Bearer <SUPER_ADMIN_JWT>" \
     -H "Content-Type: application/json" \
     -d '{}' \
     https://intranet.omnitech-security.fr/api/mfa/enforce-bulk
```

> **NB** : noms d'endpoints exacts à confirmer dans
> `apps/backend/src/mfa/mfa.controller.ts`. Les actions sont auditées
> sous `MFA_POLICY_ENFORCED`, `MFA_POLICY_RELEASED`, `MFA_POLICY_NOOP`.

### 5. Audit & rapport

```sql
-- Qui a le MFA actif ?
SELECT email, "mfaEnabled", "mfaRequired", "mfaEnforcedAt"
FROM "User"
WHERE "isActive" = true AND "deletedAt" IS NULL
ORDER BY "mfaEnabled" ASC, role DESC, email ASC;

-- Actions admin sur la politique MFA (90 derniers jours)
SELECT "createdAt", action, "userId", "resourceId", metadata
FROM "AuditLog"
WHERE action LIKE 'MFA_%'
  AND "createdAt" > NOW() - INTERVAL '90 days'
ORDER BY "createdAt" DESC;
```

Indicateur cyber-score MFA : `apps/backend/src/cyber-score/cyber-score.service.ts`
calcule un score MFA `mfaPolicyScore` (100 si au moins 1 user a `mfaRequired=true`,
50 sinon). Visible dans `/rssi` → carte « Authentification forte ».

## Vérifications post-action

- L'utilisateur cible peut se connecter et est redirigé vers `/mfa` si
  `mfaRequired=true && mfaEnabled=false`
- Audit log contient l'entrée correspondante (`MFA_POLICY_ENFORCED`,
  `MFA_RESET`, etc.)
- Le badge MFA apparaît bien dans `/admin/users` (colonne MFA)
- Score cyber `/rssi` recalculé (refresh page admin)

## Rollback

| Action faite à tort                       | Rollback                                              |
|-------------------------------------------|-------------------------------------------------------|
| Politique forcée sur un user pas prêt     | Lever via `/admin/users` (action « Lever politique ») |
| Reset MFA accidentel                      | L'utilisateur ré-active depuis son profil (TOTP requis) — il faudra qu'il scanne un nouveau QR |
| Forçage en masse trop large               | `UPDATE "User" SET "mfaRequired"=false WHERE "mfaEnforcedAt" > NOW() - INTERVAL '10 minutes';` (relire d'abord en SELECT) |

## Escalade

| Situation                                                         | Contact                            |
|-------------------------------------------------------------------|------------------------------------|
| Plusieurs utilisateurs bloqués en boucle `MFA_SETUP_REQUIRED`     | DSI / Helpdesk → assistance directe |
| Suspicion contournement MFA (token forgé, replay)                 | RSSI immédiat                      |
| Demande de levée de MFA sur un compte SUPER_ADMIN                 | RSSI **+** Direction (4-yeux)      |

## Annexes

- Garde globale : `apps/backend/src/mfa/mfa-required.guard.ts`
- Fraîcheur 12 h : `apps/backend/src/mfa/fresh-mfa.guard.ts`
- Service : `apps/backend/src/mfa/mfa.service.ts`
- Controller (endpoints exacts) : `apps/backend/src/mfa/mfa.controller.ts`
- Décorateur de bypass (routes publiques admin) : `@SkipMfaCheck()`
  (`apps/backend/src/mfa/decorators/skip-mfa-check.decorator.ts`)
- UI admin : `/admin/users` (table + actions)
- UI user : `/profile` onglet Sécurité, `/mfa` (enrôlement)
- Champs DB : `User.mfaEnabled`, `User.mfaRequired`, `User.mfaSecret`,
  `User.backupCodes` (JSON haché bcrypt), `User.mfaEnforcedAt`,
  `User.mfaEnforcedById`
