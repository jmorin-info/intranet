# Deploiement Docker Compose — Production

> Cible : VM Debian 12 / Ubuntu 22.04 LTS — au moins 16 Go RAM, 200 Go SSD,
> 8 vCPU. Profil OMNITECH : ~100 utilisateurs, intranet on-prem
> (10.33.120.55).

## Stack deployee

| Service          | Image                              | Role                            | RAM max |
| ---------------- | ---------------------------------- | ------------------------------- | ------- |
| postgres         | `postgres:16-alpine`               | Base relationnelle              | 2 Go    |
| redis            | `redis:7-alpine`                   | Cache, queues, sessions         | 768 Mo  |
| meilisearch      | `getmeili/meilisearch:v1.11`       | Recherche full-text federee     | 1 Go    |
| ollama           | `ollama/ollama:latest`             | LLM local (RAG + chatbot)       | 8 Go    |
| documentserver   | `onlyoffice/documentserver:latest` | Edition collaborative           | 2 Go    |
| stirling-pdf     | `stirlingtools/stirling-pdf:...`   | Outils PDF (split / merge / OCR)| 1 Go    |
| docuseal         | `docuseal/docuseal:latest`         | Signatures eIDAS                | 1 Go    |
| backend          | `omnitech/backend` (build local)   | NestJS API + workers            | 1.5 Go  |
| frontend         | `omnitech/frontend` (build local)  | Next.js SSR                     | 768 Mo  |
| nginx            | `nginx:1.27-alpine`                | Reverse proxy TLS               | 256 Mo  |
| watchtower       | `containrrr/watchtower:latest`     | Auto-update images (opt-in)     | —       |

Total RAM allouee : ~18 Go (avec Ollama). Si pas de LLM local, retomber sous
10 Go.

## 1. Pre-requis serveur

```bash
# Debian 12
apt update && apt install -y docker.io docker-compose-v2 certbot

# Activer Docker au boot
systemctl enable --now docker

# Cle SSH operateur ajoutee, utilisateur `omnitech` membre du groupe docker
usermod -aG docker omnitech
```

Pare-feu (`ufw` ou `iptables`) :

```text
allow 22/tcp        # SSH (idealement restreint a un bastion)
allow 80/tcp        # HTTP (Let's Encrypt + redirect)
allow 443/tcp       # HTTPS
deny  3000:3001/tcp # bloquer acces direct backend/frontend (tout passe par nginx)
deny  5432/tcp      # postgres jamais expose
deny  6379/tcp      # redis jamais expose
```

## 2. Premiere installation

### 2.1 Cloner le repo

```bash
git clone git@github.com:omnitech-security/intranet.git /opt/omnitech
cd /opt/omnitech
git checkout feat/p1-9-prelaunch
```

### 2.2 Configurer l'environnement

```bash
# Creer le fichier d'env (sans secrets sensibles)
cp .env.prod.example .env.prod
vim .env.prod
# - Verifier APP_URL, DOCKER_BIND_IP, NEXT_PUBLIC_*
# - Configurer SMTP_*
# - Ne pas remplir les "secret_*" : ils sont generes ci-dessous

# Generer les secrets Docker
./scripts/init-secrets.sh
ls -la secrets/
# postgres_password.txt, redis_password.txt, jwt_*, meili_*, onlyoffice_*

# Stocker une copie chiffree dans le coffre (KeePass/Vault) — voir secrets/README.md
```

### 2.3 Certificat TLS

```bash
# Stoper temporairement nginx si il tourne sur le host
systemctl stop nginx 2>/dev/null || true

# Obtenir le certificat
certbot certonly --standalone \
  -d intranet.omnitech-security.fr \
  --email noc@omnitech-security.fr \
  --agree-tos --non-interactive

# Verifier
ls /etc/letsencrypt/live/intranet.omnitech-security.fr/
# fullchain.pem  privkey.pem  chain.pem  cert.pem
```

### 2.4 Demarrer la stack

```bash
# Build des images locales (backend + frontend)
docker compose --env-file .env.prod -f docker-compose.prod.yml build

# Lancement (sans watchtower — ajouter --profile auto-update si voulu)
docker compose --env-file .env.prod -f docker-compose.prod.yml up -d

# Suivre les logs
docker compose --env-file .env.prod -f docker-compose.prod.yml logs -f --tail=100

# Verifier que tous les services sont healthy
docker compose --env-file .env.prod -f docker-compose.prod.yml ps
# STATE = "running (healthy)" pour tous
```

### 2.5 Initialiser la DB

```bash
# Migrations Prisma
docker exec omnitech-backend pnpm --filter @omnitech/database exec prisma migrate deploy

# Seed initial (admin user)
docker exec omnitech-backend pnpm --filter @omnitech/database exec prisma db seed

# Telecharger les modeles Ollama
docker exec omnitech-ollama ollama pull qwen2:0.5b
docker exec omnitech-ollama ollama pull bge-m3
docker exec omnitech-ollama ollama list
```

## 3. Operations courantes

### Mise a jour de l'application

```bash
cd /opt/omnitech
git pull origin feat/p1-9-prelaunch
docker compose --env-file .env.prod -f docker-compose.prod.yml build backend frontend
docker compose --env-file .env.prod -f docker-compose.prod.yml up -d backend frontend
```

Avec watchtower active (`--profile auto-update`), seules les images marquees
avec le label `com.centurylinklabs.watchtower.enable=true` sont auto-update,
ce qui exclut backend/frontend (tags `latest` n'etant pas pertinents pour
nos images locales).

### Sauvegardes

```bash
# Snapshot complet : DB + storage + secrets (chiffre)
./scripts/backup-full.sh

# Quotidien automatique (cron)
0 2 * * * /opt/omnitech/scripts/backup.sh
```

Le script `backup.sh` exporte :

- `pg_dumpall` du conteneur postgres
- `tar.gz` du volume `omnitech_storage_data`
- Metadonnees Meilisearch (`/meili_data` snapshot)
- Liste des secrets (sans leur contenu — alerte si en moins)

### Restauration

Voir `RESTORE.md`. Procedure simplifiee :

```bash
# 1. Stopper backend + frontend (garder postgres up)
docker compose ... stop backend frontend

# 2. Restaurer le dump
zcat /var/backups/omnitech/db_2026-04-25.sql.gz | \
  docker exec -i omnitech-postgres psql -U omnitech -d omnitech_intranet

# 3. Restaurer storage
docker run --rm -v omnitech_storage_data:/data -v /var/backups/omnitech:/bk \
  alpine tar xzf /bk/storage_2026-04-25.tar.gz -C /data

# 4. Redemarrer
docker compose ... up -d backend frontend
```

### Scaling vertical

Toutes les limites sont definies via `deploy.resources.limits`. Pour augmenter :

```yaml
# Exemple : passer Ollama de 8 Go a 16 Go (Mistral 7B Q4)
ollama:
  deploy:
    resources:
      limits:
        memory: 16G
        cpus: "8.0"
```

Puis : `docker compose ... up -d ollama` (recreate).

### Scaling horizontal (limite)

Compose ne supporte pas vraiment le scaling horizontal au-dela de la
duplication de conteneurs (`docker compose up -d --scale backend=3`).
**Pour du vrai HA, basculer sur k3s** (cf `K3S_DEPLOYMENT.md`).

### Rotation des secrets (ISO 27001 A.5.17, 90j)

```bash
# 1. Backup avant rotation
./scripts/backup-full.sh

# 2. Generer nouveaux secrets
FORCE=1 ./scripts/init-secrets.sh

# 3. Pour Postgres : repasse par un dump/restore (le mot de passe est
#    stocke dans le volume — le changer sans dump = perte d'acces)
docker exec omnitech-postgres pg_dumpall -U omnitech > /tmp/pg-pre-rotation.sql
docker compose ... down postgres
docker volume rm omnitech_postgres_data
docker compose ... up -d postgres
# attendre health, puis restaurer
docker exec -i omnitech-postgres psql -U omnitech < /tmp/pg-pre-rotation.sql

# 4. Pour les autres : recreate suffit
docker compose ... up -d --force-recreate redis backend frontend meilisearch documentserver
```

## 4. Monitoring

### Healthchecks intégrés

Chaque service expose un healthcheck Docker. `docker compose ps` montre :

```text
NAME                       STATUS
omnitech-postgres          Up 2 hours (healthy)
omnitech-redis             Up 2 hours (healthy)
omnitech-meilisearch       Up 2 hours (healthy)
omnitech-ollama            Up 2 hours (healthy)
omnitech-backend           Up 2 hours (healthy)
omnitech-frontend          Up 2 hours (healthy)
omnitech-documentserver    Up 2 hours (healthy)
omnitech-stirling-pdf      Up 2 hours (healthy)
omnitech-docuseal          Up 2 hours (healthy)
omnitech-nginx             Up 2 hours (healthy)
```

### Endpoints de health applicatifs

| Endpoint                                       | Service       |
| ---------------------------------------------- | ------------- |
| `https://intranet.omnitech-security.fr/health` | nginx → frontend |
| `https://intranet.omnitech-security.fr/api/health` | backend (200)|
| `https://intranet.omnitech-security.fr/api/health/metrics` | Prometheus metrics |

### Logs

Tous les conteneurs utilisent `json-file` avec rotation 10 Mo / 5 fichiers.
Pour explorer :

```bash
# Logs d'un service
docker compose ... logs -f backend

# JSON brut + filtre par level (avec jq)
docker logs omnitech-backend 2>&1 | jq 'select(.level >= 40)'

# Recherche par X-Request-ID
docker logs omnitech-backend 2>&1 | jq 'select(.req.id == "abc-123")'
```

### Alerting

L'integration Sentry (opt-in via `SENTRY_DSN`) capte les 5xx + uncaught.
Voir `README.md` racine, section "Observabilite".

## 5. Securite

| Mesure                          | Implementation                              |
| ------------------------------- | ------------------------------------------- |
| Mots de passe via Docker secret | `secrets:` block + montage `/run/secrets/`  |
| Reseau interne segmente         | `omnitech-internal` (postgres, redis, ...)  |
| TLS Let's Encrypt               | `certbot` + nginx                            |
| Rate limiting                   | nginx `limit_req_zone`                       |
| Headers de securite             | nginx CSP / HSTS / X-Frame-Options           |
| Memory limits                   | `deploy.resources.limits`                    |
| Restart policy                  | `unless-stopped`                             |
| Logs avec rotation              | `json-file` + `max-size: 10m, max-file: 5`  |

## 6. Choix de cible : compose vs k3s

| Critere                 | docker compose                   | k3s                                     |
| ----------------------- | -------------------------------- | --------------------------------------- |
| Mise en route           | < 1 h                            | 2-4 h                                   |
| Maintenance             | Faible                           | Moyenne (operateurs k8s)                |
| HA                      | Non (1 host)                     | Oui (multi-noeud)                       |
| Scaling auto            | Manuel (deploy.replicas)         | HPA (Horizontal Pod Autoscaler)         |
| Rolling update          | `up -d` (downtime ~5s)           | Zero-downtime via Deployment            |
| Cible OMNITECH actuelle | **Recommande** (~100 users, 1VM) | A envisager si scale > 500 users        |

**Pour OMNITECH aujourd'hui (~100 users, 1 VM 10.33.120.55) : compose
suffit largement.** Garder le Helm chart `infra/k3s/` en reserve pour le
jour ou la charge ou la criticite justifient une migration.

## Annexes

### A. Variables d'env requises (resume)

Les vraies cibles sont detaillees dans `.env.prod.example`. A minima :

```text
NODE_ENV=production
APP_URL=https://intranet.omnitech-security.fr
POSTGRES_USER=omnitech
POSTGRES_DB=omnitech_intranet
NEXT_PUBLIC_API_URL=https://intranet.omnitech-security.fr/api
NEXT_PUBLIC_WS_URL=wss://intranet.omnitech-security.fr
SMTP_HOST=smtp.example.com
SMTP_USER=noreply@example.com
SMTP_PASSWORD=[mettre en docker secret]
DOCKER_BIND_IP=0.0.0.0
TRUST_PROXY=loopback, linklocal, uniquelocal
```

Et tous les `*_PASSWORD_FILE` / `*_SECRET_FILE` qui pointent vers
`/run/secrets/*` automatiquement injectes par `secrets:`.

### B. Troubleshooting

| Symptome                         | Diagnostic / fix                                  |
| -------------------------------- | ------------------------------------------------- |
| `pg_isready` echoue              | `docker logs omnitech-postgres` — souvent volume corrompu. Restaurer. |
| Frontend 502 Bad Gateway         | `docker logs omnitech-backend` — depend health. |
| Ollama "out of memory"           | Reduire `OLLAMA_NUM_PARALLEL` ou augmenter `memory: limit`. |
| Meilisearch "missing master key" | Verifier que `secrets/meili_master_key.txt` existe et n'est pas vide. |
| OnlyOffice JWT error             | `secrets/onlyoffice_jwt_secret.txt` doit etre identique cote backend (env `ONLYOFFICE_JWT_SECRET`). |
| Watchtower update casse l'app    | Disable : retirer `--profile auto-update`. Pin les tags d'images (pas `latest`). |

### C. Commandes utiles

```bash
# Lister tous les volumes du projet
docker volume ls --filter "name=omnitech_"

# Espace disque par volume
docker system df -v | grep omnitech_

# Forcer un re-pull des images externes
docker compose --env-file .env.prod -f docker-compose.prod.yml pull

# Restart d'un service unique
docker compose --env-file .env.prod -f docker-compose.prod.yml restart backend

# Stopper toute la stack proprement (sans supprimer)
docker compose --env-file .env.prod -f docker-compose.prod.yml stop

# Arret + suppression conteneurs (volumes preserves)
docker compose --env-file .env.prod -f docker-compose.prod.yml down

# DESTRUCTIF : tout supprimer + volumes
docker compose --env-file .env.prod -f docker-compose.prod.yml down -v
```
