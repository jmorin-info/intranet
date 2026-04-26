# OMNITECH Intranet — Installation from scratch

> Procédure complète de déploiement de l'intranet sur une VM Debian 12 vierge.
> Sert à la fois pour : DR (reconstruction post-sinistre), nouveau site, environnement dev/staging.
> ISO 27001:2022 — A.5.29 (préparation TIC), A.5.30 (continuité), A.8.13 (backup).
>
> Audience : ingé sys/RSSI. Compter 60-90 min sur une VM neuve avec une bonne ligne.

Conventions :
- toutes les commandes sont à exécuter en `root` (ou `sudo`)
- `<XXX>` = à remplacer
- les blocs `bash` sont copy-paste safe en l'état (sauf valeurs marquées `<...>`)

---

## 1. Pré-requis VM Debian 12

| Ressource | Minimum | Recommandé prod |
|-----------|---------|-----------------|
| CPU       | 4 vCPU  | 8 vCPU          |
| RAM       | 12 GB   | 16 GB           |
| Disque    | 60 GB   | 100 GB SSD      |
| OS        | Debian 12 (bookworm) x86_64 | idem |
| Réseau    | IP fixe LAN, accès SMB backup, sortie 443 (Let's Encrypt + HIBP) | idem |
| DNS       | un FQDN `intranet.<site>` pointant sur l'IP LAN | idem |

Pré-checks :

```bash
cat /etc/debian_version           # >= 12
nproc                             # >= 4
free -g                           # >= 12 GB
df -h /                           # >= 50 GB free
ip a                              # IP fixe configurée
ping -c1 filer.omnitech-security.fr   # SMB joignable
```

Créer arborescence cible :

```bash
mkdir -p /opt/omnitech/intranet /opt/omnitech/storage \
         /var/log/omnitech /var/backups/omnitech /var/releases/omnitech
```

---

## 2. Paquets système

```bash
apt update && apt upgrade -y
apt install -y \
  curl wget gnupg ca-certificates lsb-release \
  build-essential git unzip jq \
  ufw cifs-utils mailutils \
  postgresql-16 postgresql-16-pgvector \
  redis-server \
  clamav clamav-daemon \
  docker.io docker-compose-v2 \
  nginx-light    # uniquement si BunkerWeb tourne sur un autre host
```

Node.js 20 LTS via NodeSource :

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs
node --version    # v20.x
```

pnpm via corepack (pinné à la version du `package.json`) :

```bash
corepack enable
corepack prepare pnpm@9.15.0 --activate
pnpm --version    # 9.15.0
```

Ollama (LLM local) :

```bash
curl -fsSL https://ollama.com/install.sh | sh
systemctl enable --now ollama
```

Si `postgresql-16-pgvector` n'est pas dispo via apt sur ta release, installer
depuis le repo PostgreSQL officiel :

```bash
install -d /usr/share/postgresql-common/pgdg
curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc \
  -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc
echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] \
  https://apt.postgresql.org/pub/repos/apt bookworm-pgdg main" \
  > /etc/apt/sources.list.d/pgdg.list
apt update && apt install -y postgresql-16-pgvector
```

Firewall minimal (BunkerWeb sur autre host = `10.33.0.0/16` typiquement) :

```bash
ufw default deny incoming
ufw default allow outgoing
ufw allow from 10.33.0.0/16 to any port 22
ufw allow from 10.33.0.0/16 to any port 3000   # backend (depuis BunkerWeb)
ufw allow from 10.33.0.0/16 to any port 3001   # frontend
ufw --force enable
```

---

## 3. PostgreSQL 16 + pgvector

Activer/démarrer + créer user/db :

```bash
systemctl enable --now postgresql
sudo -u postgres psql <<'SQL'
  CREATE USER omnitech WITH ENCRYPTED PASSWORD '<MOTDEPASSE_FORT>';
  CREATE DATABASE omnitech_intranet OWNER omnitech;
  \c omnitech_intranet
  CREATE EXTENSION IF NOT EXISTS vector;
  CREATE EXTENSION IF NOT EXISTS pg_trgm;
  CREATE EXTENSION IF NOT EXISTS unaccent;
SQL
```

Tuning `/etc/postgresql/16/main/postgresql.conf` (VM 16 GB RAM) :

```
listen_addresses = 'localhost'
max_connections = 100
shared_buffers = 4GB
effective_cache_size = 12GB
work_mem = 32MB
maintenance_work_mem = 1GB
wal_buffers = 16MB
checkpoint_completion_target = 0.9
random_page_cost = 1.1
log_min_duration_statement = 500
log_line_prefix = '%t [%p] %u@%d '
```

`/etc/postgresql/16/main/pg_hba.conf` — n'autoriser que `local` + `127.0.0.1` :

```
local  all  postgres            peer
local  all  all                 scram-sha-256
host   all  all   127.0.0.1/32  scram-sha-256
host   all  all   ::1/128       scram-sha-256
```

```bash
systemctl restart postgresql
sudo -u postgres psql -d omnitech_intranet -c "SELECT extversion FROM pg_extension WHERE extname='vector';"
# => 0.8.2
```

---

## 4. Redis 7

`/etc/redis/redis.conf` :

```
bind 127.0.0.1 -::1
port 6379
requirepass <REDIS_PASSWORD>
maxmemory 1gb
maxmemory-policy allkeys-lru
appendonly yes
appendfsync everysec
```

```bash
systemctl enable --now redis-server
redis-cli -a '<REDIS_PASSWORD>' ping    # PONG
```

---

## 5. Ollama — modèles LLM

```bash
ollama pull mistral        # générateur principal RAG
ollama pull bge-m3         # embeddings (multilingue, 1024 dim)
ollama pull phi3:mini      # fallback léger
ollama pull qwen2:0.5b     # tests / dev / smoke

ollama list                # vérif les 4 présents
curl -s http://localhost:11434/api/tags | jq '.models[].name'
```

L'API Ollama écoute déjà sur `127.0.0.1:11434` ; l'intranet la consomme via
`OLLAMA_URL` du `.env`. Voir `docs/infrastructure/OLLAMA_HOST.md` pour exposer
sur le LAN si besoin (déconseillé hors VM dédiée GPU).

---

## 6. Stack tierce Docker (gérée séparément)

> Ces conteneurs ne font **PAS** partie du tarball release. Leurs configs et
> volumes sont gérés dans `/opt/omnitech-docker/` (repo séparé, voir
> `docs/infrastructure/THIRD_PARTY_STACK.md`). Ce paragraphe documente
> seulement les images attendues.

| Conteneur          | Image                          | Port hôte | Rôle                          |
|--------------------|--------------------------------|-----------|-------------------------------|
| `onlyoffice-ds`    | `onlyoffice/documentserver:9.3.1` | 8082   | Édition Word/Excel collaborative |
| `omnitech-docuseal`| `docuseal/docuseal:latest`     | 7000      | Signature électronique         |
| `stirling-pdf`     | `frooodle/s-pdf:latest`        | 8080      | Manipulation PDF               |
| `meilisearch`      | `getmeili/meilisearch:v1.7`    | 7700      | Full-text search docs/wiki     |

Démarrage type (à adapter au compose réel) :

```bash
cd /opt/omnitech-docker
docker compose -f onlyoffice.yml -f docuseal.yml -f stirling.yml -f meili.yml up -d
docker ps
```

---

## 7. GlitchTip (Sentry self-hosted)

Stack déjà fournie dans `/opt/glitchtip/docker-compose.yml`. Démarrage :

```bash
cd /opt/glitchtip
# Lecture des secrets dans .env (SECRET_KEY, EMAIL_*, DATABASE_URL, etc.)
docker compose up -d
docker compose ps   # web, worker, db, redis tous "healthy"
```

Web bind sur `127.0.0.1:8001`. Exposer via BunkerWeb sur
`https://glitchtip.<site>` (TLS). Récupérer le DSN du projet "intranet-backend"
+ "intranet-frontend" et coller dans `.env` :

```
SENTRY_DSN=https://<key>@glitchtip.<site>/<projectId>
NEXT_PUBLIC_SENTRY_DSN=https://<key>@glitchtip.<site>/<projectId>
```

---

## 8. Déploiement intranet (depuis le tarball release)

```bash
cd /opt/omnitech
TARBALL=/var/releases/omnitech/omnitech-intranet-v3.2.0-<sha>.tar.gz
sha256sum -c "${TARBALL}.sha256"           # OBLIGATOIRE
tar -xzf "$TARBALL"
rm -rf intranet.old; mv intranet intranet.old 2>/dev/null || true
mv omnitech-intranet-v3.2.0-* intranet
cd intranet
```

Génération du `.env` (chaque secret a sa commande dédiée) :

```bash
cp .env.example .env
chmod 600 .env

# Secrets à générer (chaque ligne remplace la valeur "changeme" du template)
sed -i "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=$(openssl rand -base64 24 | tr -d '/+=')|" .env
sed -i "s|^REDIS_PASSWORD=.*|REDIS_PASSWORD=$(openssl rand -base64 24 | tr -d '/+=')|" .env
sed -i "s|^JWT_ACCESS_SECRET=.*|JWT_ACCESS_SECRET=$(openssl rand -base64 64 | tr -d '\n')|" .env
sed -i "s|^JWT_REFRESH_SECRET=.*|JWT_REFRESH_SECRET=$(openssl rand -base64 64 | tr -d '\n')|" .env
sed -i "s|^STORAGE_SECRET=.*|STORAGE_SECRET=$(openssl rand -hex 32)|" .env
sed -i "s|^DOCUSEAL_WEBHOOK_SECRET=.*|DOCUSEAL_WEBHOOK_SECRET=$(openssl rand -hex 32)|" .env
sed -i "s|^ONLYOFFICE_JWT_SECRET=.*|ONLYOFFICE_JWT_SECRET=$(openssl rand -hex 32)|" .env

# VAPID (Web Push) — clés asymétriques
npx --yes web-push generate-vapid-keys --json > /tmp/vapid.json
PUB=$(jq -r .publicKey /tmp/vapid.json)
PRIV=$(jq -r .privateKey /tmp/vapid.json)
sed -i "s|^VAPID_PUBLIC_KEY=.*|VAPID_PUBLIC_KEY=${PUB}|" .env
sed -i "s|^VAPID_PRIVATE_KEY=.*|VAPID_PRIVATE_KEY=${PRIV}|" .env
shred -u /tmp/vapid.json
```

À éditer manuellement (valeurs métier — pas auto-générables) :

```
APP_URL=https://intranet.<site>.omnitech-security.fr
DATABASE_URL=postgresql://omnitech:<PG_PWD>@localhost:5432/omnitech_intranet?schema=public
SMTP_HOST / SMTP_USER / SMTP_PASSWORD / SMTP_FROM
FILESERVER_HOST / FILESERVER_USER / FILESERVER_SERVICE_PASSWORD
SMB_BACKUP_SHARE / SMB_BACKUP_USER / SMB_BACKUP_PASSWORD
DOCUSEAL_API_KEY (généré dans l'UI DocuSeal)
SENTRY_DSN / NEXT_PUBLIC_SENTRY_DSN (cf. §7)
DOCKER_BIND_IP=<IP LAN de cette VM>
```

Build :

```bash
pnpm install --frozen-lockfile
pnpm db:generate
pnpm -C packages/database exec prisma migrate deploy
pnpm build
```

---

## 9. systemd

```bash
cp infra/systemd/omnitech-backend.service  /etc/systemd/system/
cp infra/systemd/omnitech-frontend.service /etc/systemd/system/
# Ajuste WorkingDirectory si tu n'es pas en /opt/omnitech/intranet
systemctl daemon-reload
systemctl enable --now omnitech-backend.service
systemctl enable --now omnitech-frontend.service

systemctl status omnitech-backend  --no-pager
systemctl status omnitech-frontend --no-pager
journalctl -u omnitech-backend -n 50 --no-pager
```

Logs applicatifs : `/var/log/omnitech/{backend,frontend}.log` (rotation logrotate
recommandée — voir `infra/logrotate-omnitech` si fourni).

---

## 10. Reverse proxy BunkerWeb

Sur le host BunkerWeb (autre VM) :

```bash
scp infra/nginx-bunkerweb-snippet.conf bunkerweb-host:/tmp/
ssh bunkerweb-host
cp /tmp/nginx-bunkerweb-snippet.conf /etc/bunkerweb/configs/server-http/intranet.conf
# Vars BunkerWeb : SERVER_NAME=intranet.<site>.omnitech-security.fr
# AUTO_LETS_ENCRYPT=yes EMAIL_LETS_ENCRYPT=rssi@omnitech-security.fr
systemctl reload bunkerweb
```

Vérifier la chaîne TLS :

```bash
curl -I https://intranet.<site>.omnitech-security.fr/healthz
# HTTP/2 200, header `server: bunkerweb`
```

---

## 11. Backup SMB

Identifiants dans `.env` (`SMB_BACKUP_*`). Test du montage :

```bash
mkdir -p /mnt/intranet-backup
mount -t cifs "$SMB_BACKUP_SHARE" /mnt/intranet-backup \
  -o "username=$SMB_BACKUP_USER,password=$SMB_BACKUP_PASSWORD,domain=$SMB_BACKUP_DOMAIN,vers=3.0"
ls /mnt/intranet-backup
umount /mnt/intranet-backup
```

Cron `/etc/cron.d/omnitech-backup` :

```
# Backup nightly + drill hebdo (ISO 27001 A.8.13)
0 2  * * *  root  /opt/omnitech/intranet/scripts/backup.sh        >> /var/log/omnitech/backup.log 2>&1
30 3 * * 0  root  /opt/omnitech/intranet/scripts/backup-drill.sh  >> /var/log/omnitech/backup-drill.log 2>&1
```

Vérifier qu'un backup s'exécute :

```bash
/opt/omnitech/intranet/scripts/backup.sh
ls -lh /var/backups/omnitech/ | tail -5
ls -lh /mnt/intranet-backup/ 2>/dev/null | tail -5    # remontable manuellement
```

---

## 12. Smoke tests

```bash
# Backend health (doit retourner status:ok et tous les services up)
curl -s http://127.0.0.1:3000/api/health | jq .
# {
#   "status": "ok",
#   "services": { "database": "up", "redis": "up", "ollama": "up", ... }
# }

# Frontend
curl -sI http://127.0.0.1:3001/ | head -3        # HTTP/1.1 200 OK

# Via BunkerWeb (depuis poste client)
curl -sI https://intranet.<site>.omnitech-security.fr/healthz
```

Login UI :
1. Aller sur `https://intranet.<site>...`
2. Login avec compte test (créer via `pnpm db:seed` ou via UI admin)
3. Vérifier dashboard, search Meili, upload doc, OnlyOffice
4. Test webpush (notification push test depuis admin)

---

## 13. Restauration depuis dump existant (DR)

Pour reconstruire une VM identique avec les données d'un autre site, suivre :

1. Étapes 1 → 11 ci-dessus (installer la stack vide)
2. Stopper les services :
   ```bash
   systemctl stop omnitech-backend omnitech-frontend
   ```
3. Suivre `RESTORE.md` (à la racine du tarball) — dump pg_restore + storage
   `rsync` depuis le SMB
4. Re-deploy migrations (idempotent) :
   ```bash
   pnpm -C packages/database exec prisma migrate deploy
   ```
5. Redémarrer :
   ```bash
   systemctl start omnitech-backend omnitech-frontend
   ```
6. Re-vérifier §12 (smoke tests)

Le drill de restauration doit être joué chaque trimestre via
`scripts/backup-drill.sh` qui simule l'opération sur une VM jetable.

---

## Annexe A — Checklist post-install (à cocher)

- [ ] `systemctl is-active omnitech-{backend,frontend}` → active
- [ ] `curl /api/health` → tous services `up`
- [ ] Logs sans erreur dans les 5 premières minutes
- [ ] Backup nocturne présent sur SMB sous 24 h
- [ ] Sentry/GlitchTip reçoit les events de test
- [ ] TLS noté A+ sur ssllabs (si exposition Internet)
- [ ] ufw status = 3 règles + default deny
- [ ] `.env` permissions = 600, owner root
- [ ] ClamAV `freshclam` à jour, scan planifié
- [ ] Compte admin de seed renommé/désactivé après bootstrap
