# Audit des secrets — OMNITECH Intranet

**Date** : 2026-04-20
**Auditeur** : Claude Code (staff engineer review)
**Scope** : `.env`, fichiers source TypeScript, docker-compose, infra

---

## 1. Fichiers `.env` détectés

| Fichier | Chemin | Dans `.gitignore` ? |
|---------|--------|---------------------|
| `.env` | `/root/omnitech-intranet/.env` | ✅ Oui (ligne 6) |
| `.env.example` | `/root/omnitech-intranet/.env.example` | ❌ Non (template, intentionnel) |
| `.env.local` | `apps/frontend/.env.local` | ✅ Oui (ligne 7) |

`.gitignore` couvre : `.env`, `.env.local`, `.env.production`.

---

## 2. Secrets en production (`.env`)

| Ligne | Variable | Sévérité | Valeur (masquée) | Remarque |
|-------|----------|----------|-------------------|----------|
| 21 | `DATABASE_URL` | CRITIQUE | `post***://omni***:0f56***@localhost` | Contient mot de passe inline |
| 23 | `POSTGRES_PASSWORD` | CRITIQUE | `0f56***` | Hexadécimal 32 chars |
| 31 | `REDIS_PASSWORD` | HAUTE | `PSUY***` | |
| 36 | `JWT_ACCESS_SECRET` | CRITIQUE | `/TeF***` | Base64, 88 chars |
| 37 | `JWT_REFRESH_SECRET` | CRITIQUE | `rKZs***` | Base64, 88 chars |
| 55 | `DOCUSEAL_API_KEY` | HAUTE | `dfd8***` | Hex 64 chars |
| 56 | `DOCUSEAL_WEBHOOK_SECRET` | MOYENNE | `dev_***` | **Valeur dev en prod** |
| 89 | `FILESERVER_PASSWORD` | HAUTE | `33S3***` | |
| 115 | `ONLYOFFICE_JWT_SECRET` | MOYENNE | *(vide)* | **JWT désactivé** |
| 123 | `ONLYOFFICE_SECURE_LINK_SECRET` | MOYENNE | `UdTb***` | |
| 127 | `KNOWBE4_API_TOKEN` | CRITIQUE | `eyJh***` | JWT signé, expire 2031-04-15 |
| 133 | `SMB_BACKUP_PASSWORD` | HAUTE | `33S3***` | **Réutilisation mot de passe FILESERVER** |
| 138 | `MEILISEARCH_MASTER_KEY` | MOYENNE | `omni***` | Faible, prédictible |

### Problèmes spécifiques

- **Réutilisation de mot de passe** : `FILESERVER_PASSWORD` (l.89) = `SMB_BACKUP_PASSWORD` (l.133) — même valeur `33S3***`
- **Secret dev en prod** : `DOCUSEAL_WEBHOOK_SECRET=dev_webhook_secret` (l.56)
- **Clé faible** : `MEILISEARCH_MASTER_KEY=omnitech-meili-2026-secret` (l.138) — pas de randomisation
- **JWT OnlyOffice vide** : `ONLYOFFICE_JWT_SECRET=` (l.115) — signature désactivée
- **Duplication** : `MEILISEARCH_ENABLED=true` apparaît deux fois (l.139-140)

---

## 3. Secrets hardcodés dans le code source

| Fichier | Ligne | Pattern | Sévérité | Détail |
|---------|-------|---------|----------|--------|
| `auth/strategies/jwt.strategy.ts` | 9 | `WEAK_JWT_DEFAULT = 'omni***-change-me'` | HAUTE | Fallback JWT fonctionnel |
| `auth/auth.module.ts` | 12, 24 | idem | HAUTE | Même pattern |
| `sms/sms.module.ts` | 18 | `\|\| 'omni***-change-me'` | HAUTE | Fallback silencieux |
| `notifications/notifications.module.ts` | 14 | idem | HAUTE | |
| `notifications/notifications.gateway.ts` | 52 | idem | HAUTE | |
| `office/office.service.ts` | 79 | `\|\| 'insecure-dev-only'` | HAUTE | Fallback en prod |
| `fileserver/ephemeral-session.service.ts` | 38-39 | `\|\| 'insecure-dev-only'` | HAUTE | |
| `fileserver/fileserver.service.ts` | 35 | `\|\| 'fallback'` | **CRITIQUE** | Utilisé comme clé crypto symétrique |
| `documents/workflow/workflow.service.ts` | 190 | `\|\| 'fallback'` | **CRITIQUE** | Utilisé dans HMAC pour tokens email |

### Risque principal

`fileserver.service.ts:35` et `workflow.service.ts:190` utilisent la chaîne littérale `'fallback'` comme clé cryptographique si `JWT_ACCESS_SECRET` est absent. En production le secret est défini, mais ce pattern crée un risque de dégradation silencieuse.

---

## 4. Docker Compose

| Fichier | Statut | Détail |
|---------|--------|--------|
| `docker-compose.prod.yml` | ✅ OK | Toutes les valeurs via `${VAR}`, pas de fallback |
| `docker-compose.dev.yml` | ✅ Acceptable | Fallbacks dev (`omnitech_dev`), normal pour dev |
| `infra/rocketchat-compose.yml` | ⚠️ | L.95 : `ADMIN_PASS` fallback `ChangeMeOnFirstLogin!` |
| `infra/meilisearch-compose.yml` | ✅ OK | Utilise `${MEILI_MASTER_KEY:?...}` (fail si absent) |
| `infra/bunkerweb.env` | ✅ OK | Pas de secrets, config WAF uniquement |

---

## 5. Résumé par sévérité

| Sévérité | Nombre | Items principaux |
|----------|--------|-----------------|
| CRITIQUE | 5 | DB password, JWT secrets (x2), KnowBe4 token, clés crypto fallback |
| HAUTE | 6 | Redis, DocuSeal, fileserver (x2 réutilisation), 5+ fallbacks source |
| MOYENNE | 4 | Meilisearch faible, OnlyOffice JWT vide, webhook dev, RocketChat default |
| BASSE | 5 | Fallbacks `omnitech-access-secret-change-me` (mitigés par `.env` présent) |
