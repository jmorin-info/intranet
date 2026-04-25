# Runbook — Rotation des secrets

> Catalogue exhaustif des secrets de l'intranet OMNITECH Security et
> procédure de rotation. Conforme ISO 27001:2022 — A.5.17 (informations
> d'authentification), A.8.24 (cryptographie), A.5.10 (acceptable use).

## Quand utiliser ce runbook

- Rotation annuelle planifiée (politique minimum)
- Suspicion de fuite / compromission
- Départ d'un collaborateur ayant eu accès aux secrets
- Audit RSSI (vérification fraîcheur des clés)
- Migration vers un coffre / `EnvironmentFile=` dédié

## Pré-requis

- Accès SSH `root` à la VM Debian 12
- Lecture/écriture sur `/root/omnitech-intranet/.env`
- Accès admin aux services tiers (DocuSeal, KnowBe4, Meilisearch, OnlyOffice, NAS SMB)
- Plage de maintenance courte (5–10 min) si rotation des secrets JWT
  (invalide tous les access tokens en cours)
- Outil de génération aléatoire : `openssl rand -hex 32` (32 bytes hex = 64 chars)

## Inventaire des secrets

| Secret                                                | Localisation          | Périodicité min | Impact rotation                                      |
| ----------------------------------------------------- | --------------------- | --------------- | ---------------------------------------------------- |
| `JWT_ACCESS_SECRET`                                   | `.env` (backend)      | 6 mois          | **Tous les access tokens invalides** (relogin forcé) |
| `JWT_REFRESH_SECRET`                                  | `.env` (backend)      | 6 mois          | Toutes les sessions invalidées                       |
| `POSTGRES_PASSWORD`                                   | `.env` + Postgres     | 12 mois         | Backend KO le temps du restart                       |
| `REDIS_PASSWORD`                                      | `.env` + Redis conf   | 12 mois         | Sessions / queues KO le temps du restart             |
| `DOCUSEAL_API_KEY`                                    | `.env`                | 12 mois         | Workflows signatures KO                              |
| `DOCUSEAL_WEBHOOK_SECRET`                             | `.env` + UI DocuSeal  | 12 mois         | Webhooks ignorés tant que déphasé                    |
| `KNOWBE4_API_TOKEN`                                   | `.env`                | 12 mois         | Sync formations KO                                   |
| `MEILISEARCH_MASTER_KEY`                              | `.env` + Meili daemon | 12 mois         | Recherche KO le temps de la rotation                 |
| `ONLYOFFICE_JWT_SECRET`                               | `.env` + Docs Server  | 12 mois         | Editeurs en ligne KO le temps de la rotation         |
| `ONLYOFFICE_SECURE_LINK_SECRET`                       | `.env`                | 12 mois         | Liens d'édition signés expirent (re-génération auto) |
| `SMB_BACKUP_PASSWORD`                                 | `.env`                | 12 mois         | Copie hors-site backup KO                            |
| `FILESERVER_PASSWORD` / `FILESERVER_SERVICE_PASSWORD` | `.env`                | 12 mois         | Module fileserver KO                                 |
| LDAP `bind_password`                                  | `AppConfig` (DB)      | 12 mois         | Auth LDAP + sync nightly KO                          |
| `SENTRY_AUTH_TOKEN` (CI)                              | secret CI             | 12 mois         | Upload sourcemaps KO (non bloquant)                  |

> **NB sécurité** : actuellement `/root/omnitech-intranet/.env` est en mode
> `0644` (lisible par tous). Dans la procédure ci-dessous on normalise à
> `chmod 600 root:root` et on recommande la migration vers
> `EnvironmentFile=/etc/omnitech/intranet.env` (perms 600, hors du repo).

## Procédure générique (tous secrets)

### 1. Préparer la nouvelle valeur

```bash
# Pour les secrets symétriques (JWT, master keys, webhook secrets)
openssl rand -hex 32          # 64 hex chars
# Pour un mot de passe fort
openssl rand -base64 32 | tr -d '=+/' | cut -c1-32
```

Stocker la valeur dans le coffre RSSI **avant** de l'utiliser.

### 2. Mettre à jour `.env` (backend + frontend communs)

```bash
# Sécuriser le fichier d'abord (one-shot, à faire une fois pour toutes)
chmod 600 /root/omnitech-intranet/.env
chown root:root /root/omnitech-intranet/.env

# Editer (éditeur respectant chmod, pas de cat > qui pourrait écraser perms)
EDITOR=nano sudoedit /root/omnitech-intranet/.env
# Remplacer la valeur par xxxxxxxx puis sauver
```

### 3. Appliquer côté service tiers (si applicable)

Voir section dédiée plus bas pour chaque secret.

### 4. Redémarrer les services

```bash
systemctl restart omnitech-backend.service
systemctl restart omnitech-frontend.service     # seulement si secret côté front (rare)
systemctl status omnitech-backend.service
```

### 5. Vérifier

```bash
# Pas d'erreur de boot dans le log
journalctl -u omnitech-backend --since "2 min ago" | grep -iE "error|fatal" | head -20

# Healthcheck OK
curl -s http://localhost:3000/api/health | jq '.status, .services'

# Login fonctionnel (compte test)
# Compte recommandé : créer `smoke-test@omnitech-security.fr` (rôle COLLABORATEUR,
# MFA pré-activé avec TOTP statique stocké dans le coffre du RSSI). Le smoke
# test doit valider en < 60 s : POST /auth/login → POST /auth/mfa/verify →
# GET /auth/me → 200. Si l'un des 3 échoue après rotation, rollback immédiat.
TEST_EMAIL="smoke-test@omnitech-security.fr"
curl -sS -X POST http://localhost:3000/api/v1/auth/login -H "Content-Type: application/json" \
  -d "{\"email\":\"$TEST_EMAIL\",\"password\":\"<from-vault>\"}" | jq '.mfaRequired // .error'
```

### 6. Auditer

```sql
INSERT INTO "AuditLog"(action, "resourceType", severity, metadata, "createdAt")
VALUES('SECRET_ROTATED', 'config', 'WARN',
       '{"secret": "JWT_ACCESS_SECRET", "actor": "ops"}'::jsonb, NOW());
```

(ou via une route admin dédiée à créer si besoin).

## Procédures spécifiques

### `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET`

- Toutes les sessions actives sont invalidées au restart
- Annoncer 30 min avant via bannière dashboard (`/admin/banners`)
- Editer `.env`, restart backend, vérifier `/api/auth/login` OK

### `POSTGRES_PASSWORD`

```bash
# 1. Mettre à jour côté Postgres
sudo -u postgres psql -c "ALTER USER omnitech PASSWORD 'xxxxxxxx';"

# 2. Mettre à jour `.env`
sudoedit /root/omnitech-intranet/.env
# 3. Redémarrer
systemctl restart omnitech-backend.service
```

### `REDIS_PASSWORD`

```bash
# 1. Mettre à jour /etc/redis/redis.conf — directive `requirepass`
sudoedit /etc/redis/redis.conf
systemctl restart redis-server.service

# 2. Mettre à jour .env (REDIS_URL inclut le password : redis://:xxxxxxxx@host:6379)
sudoedit /root/omnitech-intranet/.env
systemctl restart omnitech-backend.service
```

### `MEILISEARCH_MASTER_KEY`

- Stopper le daemon Meilisearch, supprimer la conf de master key, redémarrer
  avec la nouvelle valeur via `--master-key` (ou env var)
- Mettre à jour `.env`, restart backend
- Réindexation complète recommandée (`POST /admin/search/reindex`)

### `DOCUSEAL_API_KEY` / `DOCUSEAL_WEBHOOK_SECRET`

- Régénérer dans l'UI DocuSeal (Profile → API Keys)
- Mettre à jour `.env`, restart backend
- Tester un envoi de signature de bout en bout (création template + envoi)

### `KNOWBE4_API_TOKEN`

- Régénérer dans l'admin KnowBe4 (Account Settings → API)
- Mettre à jour `.env`, restart backend
- Tester `/admin/security-awareness` (sync formations)

### `ONLYOFFICE_JWT_SECRET`

- Modifier la valeur dans la conf du Docs Server (`local.json`)
  puis restart du service Docs
- Mettre à jour `.env` côté intranet, restart backend

### `SMB_BACKUP_PASSWORD` / `FILESERVER_PASSWORD`

- Changer le mot de passe sur l'AD du compte de service `svc_intranet@omnitech.security`
- Mettre à jour `.env`, restart backend
- Tester immédiatement un backup manuel : `/root/omnitech-intranet/scripts/backup.sh`
- Tester l'accès fileserver via `/admin/fileserver`

### LDAP `bind_password`

- Stocké en base (`AppConfig` clé `ldap.bind_password`), pas en `.env`
- UI : `/admin/access` → onglet LDAPS → champ Bind password → Sauver
- Tester via le bouton **Tester la connexion** (`POST /api/ldap/test-connection`)
- Logs : `journalctl -u omnitech-backend | grep -i 'LDAP'`

## Vérifications post-action

- `chmod 600 /root/omnitech-intranet/.env` confirmé
- `journalctl -u omnitech-backend --since "5 min ago"` sans erreur d'auth tierce
- `curl /api/health` rapporte `up` sur le service impacté
- Audit log contient une entrée `SECRET_ROTATED`
- Coffre RSSI mis à jour avec la nouvelle valeur + date de rotation
- Anciennes valeurs détruites (pas seulement « ignorées »)

## Rollback

Pour chaque secret, conserver l'ancienne valeur 24 h dans le coffre RSSI.
En cas d'incident post-rotation :

```bash
# Restaurer l'ancienne valeur dans .env
sudoedit /root/omnitech-intranet/.env
systemctl restart omnitech-backend.service

# Redéfaire la rotation côté service tiers (le cas échéant)
```

Si l'ancienne valeur n'est plus utilisable (ex: clé révoquée côté tiers) :
suivre la procédure normale avec une **nouvelle** valeur, ne PAS tenter
de rétablir l'ancienne révoquée.

## Escalade

| Situation                                              | Contact                                      |
| ------------------------------------------------------ | -------------------------------------------- |
| Suspicion fuite secret (push public, leak Slack, etc.) | RSSI immédiat → invalidation < 1 h           |
| Rotation impossible (service tiers indisponible)       | DSI puis fournisseur                         |
| Découverte ancien secret en clair dans le repo Git     | RSSI + nettoyage history (`git filter-repo`) |

## Annexes

- Bonne pratique : migrer `.env` → `/etc/omnitech/intranet.env` (perms 600,
  hors du repo, référencé par les unités systemd via `EnvironmentFile=`)
- Rotation automatisable via coffre central : décision RSSI/DSI à prendre
  quand le périmètre s'élargira (multi-VM, multi-app). Options évaluées :
  - **Hashicorp Vault** (open-source, self-hosted) — overkill pour ~10
    secrets et 1 VM, mais idéal si on package plusieurs apps demain.
  - **systemd-creds** (built-in Debian 12) — léger, rotation manuelle, pas
    d'intégration applicative native. Pragmatique court terme.
  - **1Password Connect / Bitwarden** — bon si l'équipe a déjà l'outil ;
    complexité opérationnelle moyenne.
    Recommandation actuelle : `EnvironmentFile=/etc/omnitech/intranet.env` +
    rotation manuelle annuelle traçée dans le coffre 1Password équipe DSI.
- Politique cryptographique : ANSSI R20 (cf. `apps/backend/src/auth/hibp.service.ts`)
- Inventaire complet `.env` : `apps/backend/src/main.ts` + `.env.example`
