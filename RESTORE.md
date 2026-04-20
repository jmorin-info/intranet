# OMNITECH Security — Guide de restauration intranet

## Prérequis machine vierge

| Composant | Version minimum |
|-----------|----------------|
| Debian/Ubuntu | 12+ / 22.04+ |
| Node.js | 20.x LTS |
| PostgreSQL | 16.x |
| Redis | 7.x |
| pnpm | 9.x |
| nginx ou BunkerWeb | dernière stable |

## Étape 1 : Installer les dépendances système

```bash
# Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs postgresql redis-server cifs-utils

# pnpm
corepack enable
corepack prepare pnpm@latest --activate

# PostgreSQL : créer la base
sudo -u postgres createuser omnitech
sudo -u postgres createdb omnitech_intranet -O omnitech
sudo -u postgres psql -c "ALTER USER omnitech PASSWORD 'VOTRE_MOT_DE_PASSE';"
```

## Étape 2 : Extraire la sauvegarde

```bash
# Copier l'archive depuis le partage réseau ou un support externe
cp /chemin/vers/omnitech-full-YYYYMMDD_HHMMSS.tar.gz /tmp/

# Extraire
cd /tmp
tar -xzf omnitech-full-*.tar.gz
cd full-*  # le dossier extrait

# Restaurer le code source
cp -r project /root/omnitech-intranet
```

## Étape 3 : Restaurer la configuration

```bash
cd /root/omnitech-intranet

# Restaurer le .env (ADAPTER les valeurs si la machine change)
cp /tmp/full-*/config/.env .env

# Points à vérifier/modifier dans .env :
# - DATABASE_URL (mot de passe PostgreSQL)
# - SMTP_HOST (serveur mail)
# - APP_URL (URL publique)
# - CORS_ORIGINS
# - JWT secrets (régénérer pour une nouvelle installation)
```

## Étape 4 : Restaurer la base de données

```bash
# Restaurer le dump
gunzip -c /tmp/full-*/database.sql.gz | psql -h localhost -U omnitech omnitech_intranet

# Vérifier
psql -h localhost -U omnitech omnitech_intranet -c "SELECT count(*) FROM \"User\";"
```

## Étape 5 : Restaurer les fichiers

```bash
cd /root/omnitech-intranet

# Storage (avatars, etc.)
cp -r /tmp/full-*/storage/main/* storage/ 2>/dev/null || true

# Uploads (documents, certificats)
cp -r /tmp/full-*/storage/uploads/* uploads/ 2>/dev/null || true
```

## Étape 6 : Installer les dépendances et builder

```bash
cd /root/omnitech-intranet

# Installer les dépendances npm
pnpm install

# Générer le client Prisma
cd packages/database && pnpm generate && cd ../..

# Builder le backend
cd apps/backend && pnpm build && cd ../..

# Builder le frontend
cd apps/frontend && pnpm build && cd ../..
```

## Étape 7 : Configurer les services systemd

```bash
# Copier les fichiers de service
cp /tmp/full-*/config/omnitech-*.service /etc/systemd/system/

# Ou créer manuellement :
cat > /etc/systemd/system/omnitech-backend.service << 'EOF'
[Unit]
Description=OMNITECH Intranet Backend (NestJS)
After=network.target postgresql.service redis-server.service

[Service]
Type=simple
User=root
WorkingDirectory=/root/omnitech-intranet
EnvironmentFile=/root/omnitech-intranet/.env
ExecStart=/usr/bin/pnpm --filter @omnitech/backend start
Restart=on-failure
RestartSec=5
StandardOutput=append:/var/log/omnitech/backend.log
StandardError=append:/var/log/omnitech/backend.log

[Install]
WantedBy=multi-user.target
EOF

cat > /etc/systemd/system/omnitech-frontend.service << 'EOF'
[Unit]
Description=OMNITECH Intranet Frontend (Next.js)
After=network.target omnitech-backend.service

[Service]
Type=simple
User=root
WorkingDirectory=/root/omnitech-intranet/apps/frontend
ExecStart=/usr/bin/pnpm start -- -p 3001 -H 0.0.0.0
Restart=on-failure
RestartSec=5
StandardOutput=append:/var/log/omnitech/frontend.log
StandardError=append:/var/log/omnitech/frontend.log

[Install]
WantedBy=multi-user.target
EOF

# Créer le répertoire de logs
mkdir -p /var/log/omnitech

# Activer et démarrer
systemctl daemon-reload
systemctl enable omnitech-backend omnitech-frontend
systemctl start omnitech-backend omnitech-frontend
```

## Étape 8 : Configurer le reverse proxy

Le reverse proxy (BunkerWeb ou nginx) doit router :
- `https://intranet.omnitech-security.fr/` → `http://localhost:3001` (frontend)
- `https://intranet.omnitech-security.fr/api/` → `http://localhost:3000/api/` (backend)
- `https://intranet.omnitech-security.fr/socket.io/` → `http://localhost:3000/socket.io/` (WebSocket)

### Exemple nginx :

```nginx
server {
    listen 443 ssl;
    server_name intranet.omnitech-security.fr;

    ssl_certificate /etc/letsencrypt/live/intranet.omnitech-security.fr/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/intranet.omnitech-security.fr/privkey.pem;

    location /api/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /socket.io/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }

    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

## Étape 9 : Configurer le backup automatique

```bash
# Cron pour backup quotidien à 2h
crontab -e
# Ajouter :
0 2 * * * /root/omnitech-intranet/scripts/backup.sh >> /var/log/omnitech-backup.log 2>&1
```

## Étape 10 : Vérification

```bash
# Vérifier les services
systemctl status omnitech-backend omnitech-frontend

# Vérifier les endpoints
curl -s http://localhost:3000/api/health | python3 -m json.tool
curl -s -o /dev/null -w "%{http_code}" http://localhost:3001/

# Vérifier la base
psql -h localhost -U omnitech omnitech_intranet -c "
  SELECT 'Users' as table_name, count(*) FROM \"User\"
  UNION ALL SELECT 'Documents', count(*) FROM \"Document\"
  UNION ALL SELECT 'Tickets', count(*) FROM \"Ticket\"
  UNION ALL SELECT 'WikiPages', count(*) FROM \"WikiPage\"
  UNION ALL SELECT 'News', count(*) FROM \"NewsPost\";
"
```

## Services optionnels

| Service | Port | Description |
|---------|------|-------------|
| OnlyOffice Document Server | 8443 | Éditeur collaboratif |
| DocuSeal | 7000 | Signature électronique |
| Stirling PDF | 8080 | Outils PDF |
| Redis | 6379 | Cache + sessions |

## Support

- Email : jmorin@omnitech-security.fr
- Helpdesk : https://intranet.omnitech-security.fr/helpdesk
- Wiki : https://intranet.omnitech-security.fr/wiki
