# OMNITECH Security — Guide de restauration intranet

> Document opérationnel de restauration et de continuité d'activité (DR).
> Conforme ISO 27001:2022 — A.5.29 (préparation TIC), A.5.30 (continuité),
> A.8.13 (sauvegarde des informations).
>
> Toute mise à jour doit être validée par le RSSI et testée via
> `scripts/backup-drill.sh` avant publication.

---

## 1. Prérequis

### 1.1 Versions logicielles

| Composant         | Version minimum     | Remarque                                    |
|-------------------|---------------------|---------------------------------------------|
| Debian / Ubuntu   | 12+ / 22.04+        | Kernel 6.x recommandé                       |
| Node.js           | 20.x LTS            | Identique à la prod (cf. `package.json`)    |
| pnpm              | 9.15+               | `corepack prepare pnpm@9.15.0 --activate`   |
| PostgreSQL        | 16.x                | Major version doit MATCHER celle du dump    |
| Redis             | 7.x                 | Cache + sessions                            |
| nginx / BunkerWeb | dernière stable     | Reverse proxy TLS                           |
| cifs-utils        | tout récent         | Montage du partage SMB de backup            |
| coreutils, gnupg  | base                | sha256sum, gpg si dump chiffré              |

### 1.2 Accès et réseau

- Compte `root` (ou sudoer) sur la machine de restauration
- Accès SMB en lecture sur `\\filer.omnitech-security.fr\intranet-backup`
  (credentials dans `vault/intranet-backup-svc`)
- Ouverture sortante 445/TCP vers le NAS, 5432/TCP vers Postgres cible
- Résolution DNS `intranet.omnitech-security.fr` mise à jour si bascule

### 1.3 Rôles requis (ISO 27001 — séparation des tâches)

| Action                            | Rôle minimum            |
|-----------------------------------|-------------------------|
| Lancer `backup-restore.sh`        | DSI ou astreinte infra  |
| Restaurer la base de PRODUCTION   | DSI **+** RSSI (4-yeux) |
| Modifier la cron de backup        | DSI                     |
| Recevoir les alertes drill        | RSSI + DSI              |
| Décider d'une bascule DR          | Direction + RSSI        |

---

## 2. RPO / RTO documentés

| Métrique | Valeur engagée | Justification                                              |
|----------|---------------|------------------------------------------------------------|
| **RPO** | **24 h**       | Backup quotidien à 02:00 + copie SMB hors-site             |
| **RTO** base de données | **2 h** | Restore depuis dump custom local sur Postgres warm        |
| **RTO** global (intranet utilisable) | **4 h** | Inclut DB + storage + rebuild assets + smoke tests |
| **MTPD** | 5 jours       | Au-delà : risque opérationnel / contractuel                |

Dépassement de RTO/RPO → escalade Direction (cf. §7).

---

## 3. Restauration COMPLÈTE (machine vierge)

### 3.1 Étape 1 — Installer les dépendances système

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs postgresql redis-server cifs-utils mailutils

corepack enable
corepack prepare pnpm@9.15.0 --activate

sudo -u postgres createuser omnitech
sudo -u postgres createdb omnitech_intranet -O omnitech
sudo -u postgres psql -c "ALTER USER omnitech PASSWORD 'VOTRE_MOT_DE_PASSE';"
```

Sortie attendue : `CREATE ROLE`, `CREATE DATABASE`, `ALTER ROLE`.

### 3.2 Étape 2 — Récupérer la sauvegarde

```bash
mount -t cifs //filer.omnitech-security.fr/intranet-backup /mnt/backup \
  -o credentials=/root/.smb-backup,vers=3.0,uid=root
ls -lah /mnt/backup/omnitech-full-*.tar.gz | tail -5
cp /mnt/backup/omnitech-full-LATEST.tar.gz /tmp/
sha256sum /tmp/omnitech-full-LATEST.tar.gz
# Comparer au sha publié dans /mnt/backup/SHA256SUMS
```

### 3.3 Étape 3 — Extraire l'archive

```bash
cd /tmp && tar -xzf omnitech-full-*.tar.gz
cd full-*
ls
# project/  database.sql.gz  storage/  config/  manifest.json  RESTORE.md
cat manifest.json   # vérifier date, hostname, postgres_version
```

### 3.4 Étape 4 — Restaurer le code et la config

```bash
cp -r project /root/omnitech-intranet
cd /root/omnitech-intranet
cp /tmp/full-*/config/.env .env
# Adapter : DATABASE_URL, SMTP_HOST, APP_URL, CORS_ORIGINS, JWT_SECRET
```

### 3.5 Étape 5 — Restaurer la base via le wrapper

> À partir de la v1.1 de l'intranet, **toujours** passer par
> `scripts/backup-restore.sh` plutôt que `psql` direct : il pose des
> garde-fous (prod, dry-run), logue dans `/var/log/omnitech/backup-restore.log`
> et envoie un mail post-restore.

```bash
# Dry-run (recommandé en premier passage)
sudo bash scripts/backup-restore.sh \
  --backup=/tmp/full-*/database.sql.gz \
  --db=omnitech_intranet

# Exécution réelle (cible PROD → flag --prod requis)
sudo bash scripts/backup-restore.sh \
  --backup=/tmp/full-*/database.sql.gz \
  --db=omnitech_intranet \
  --confirm --prod \
  --storage=/tmp/full-*/storage.tar.gz
```

Sortie attendue (extrait) :

```
[…] 1/6 — Vérification du backup
   SHA-256 : 3f2c…
[…] 5/6 — Restauration de la base omnitech_intranet
   Restauration DB OK
   Tables publiques restaurées : 87
[…] RESTAURATION TERMINÉE en 142s — DB 'omnitech_intranet' prête
```

### 3.6 Étape 6 — Build et services

```bash
pnpm install
pnpm --filter @omnitech/database generate
pnpm --filter @omnitech/backend build
pnpm --filter @omnitech/frontend build

cp /tmp/full-*/config/omnitech-*.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now omnitech-backend omnitech-frontend
systemctl status omnitech-backend omnitech-frontend
```

### 3.7 Étape 7 — Reverse proxy + smoke test

Voir `docs/infrastructure/` pour la config nginx/BunkerWeb complète.

```bash
curl -s https://intranet.omnitech-security.fr/api/health | jq
curl -s -o /dev/null -w "%{http_code}\n" https://intranet.omnitech-security.fr/
```

Sortie attendue : `{"status":"ok"}` puis `200`.

---

## 4. Restauration PARTIELLE (table unique)

Cas d'usage : suppression accidentelle d'enregistrements, corruption d'une
table, audit ponctuel.

```bash
# 1. Restaurer le dump dans une base scratch (ne touche pas la prod)
sudo bash scripts/backup-restore.sh \
  --backup=/var/backups/omnitech/db_20260423_020001.sql.gz \
  --db=omnitech_scratch --confirm

# 2. Extraire la table cible (custom dump)
pg_restore -h localhost -U omnitech -d omnitech_scratch \
  -t '"Document"' --data-only -f /tmp/document_only.sql \
  /var/backups/omnitech/db_20260423_020001.sql.gz

# 3. Réinjecter dans la prod (après revue + snapshot)
psql -h localhost -U omnitech -d omnitech_intranet \
  -v ON_ERROR_STOP=1 -f /tmp/document_only.sql
```

Snapshot Postgres recommandé avant l'étape 3 :

```bash
pg_dump -h localhost -U omnitech -d omnitech_intranet -t '"Document"' \
  --format=custom -f /tmp/document_pre_restore.dump
```

---

## 5. Rollback post-incident

Procédure quand un déploiement (ou une migration) a corrompu les données.

1. **Geler les écritures** : couper `omnitech-backend`
   `systemctl stop omnitech-backend`
2. **Snapshot de l'état corrompu** (forensique / RGPD audit) :
   `pg_dump --format=custom -f /tmp/snapshot_corrupted.dump`
3. **Identifier le dernier backup sain** (consulter
   `/var/log/omnitech/backup-drill.log` → drill OK le plus récent)
4. **Revert du code** :
   `cd /root/omnitech-intranet && git checkout <tag-prev-release>`
5. **Restaurer la DB** via wrapper :
   ```bash
   sudo bash scripts/backup-restore.sh \
     --backup=/var/backups/omnitech/db_<dernier_drill_ok>.sql.gz \
     --db=omnitech_intranet --confirm --prod
   ```
6. **Redémarrer** : `systemctl start omnitech-backend omnitech-frontend`
7. **Communication users** (cf. §8 checklist) + ouverture incident dans
   `/audit-log` avec catégorie `INCIDENT_RESTORE`.

---

## 6. Tests de drill (validation backups)

Le script `scripts/backup-drill.sh` vérifie chaque dimanche que le dernier
dump est restaurable et cohérent. Sans ce test, un backup est présumé
inexistant (ISO 27001 A.5.29).

### 6.1 Cron en place

```cron
# /etc/crontab — chaque dimanche 03:00 (1h après le backup quotidien)
0 3 * * 0 root /opt/omnitech/scripts/backup-drill.sh
```

### 6.2 Exécution manuelle

```bash
sudo -u postgres /opt/omnitech/scripts/backup-drill.sh
echo "exit=$?"   # 0=OK, 1=env, 2=restore KO, 3=intégrité KO
tail -50 /var/log/omnitech/backup-drill.log
```

### 6.3 Vérifier qu'un backup donné est valide

```bash
BACKUP_DIR=/tmp/un-autre-dossier /opt/omnitech/scripts/backup-drill.sh
```

### 6.4 Que faire si le drill échoue

| Code   | Cause probable                              | Action                                  |
|--------|---------------------------------------------|-----------------------------------------|
| 1      | Outils manquants, BACKUP_DIR introuvable    | Vérifier installation pg_*, droits      |
| 2      | `pg_restore` échoue                          | Backup corrompu → relancer `backup.sh`  |
| 3      | Counts < seuils (User<10, Migrations<1)     | Backup partiel → ne PAS marquer DR-ready |

Un échec drill déclenche un mail à `ALERT_EMAIL`. À traiter sous 24 h
(documenter dans le journal d'incidents).

---

## 7. Contacts d'escalade incident

| Rôle                  | Personne                       | Canal principal                 | Backup |
|-----------------------|--------------------------------|---------------------------------|--------|
| RSSI                  | J. Morin                       | jmorin@omnitech-security.fr     | +33 6 xx xx xx xx |
| DSI                   | (à compléter)                  | dsi@omnitech-security.fr        | astreinte-infra |
| DPO                   | (à compléter)                  | dpo@omnitech-security.fr        | — |
| Direction             | M. Dubois                      | direction@omnitech-security.fr  | — |
| Hébergeur / infra     | OVHcloud — support pro         | https://help.ovhcloud.com       | tickets via console |
| Fournisseur Postgres  | (interne — équipe DBA)         | dba@omnitech-security.fr        | — |
| Astreinte 24/7        | (rotation hebdo dans `/wiki/astreinte`) | +33 9 xx xx xx xx       | — |

### Matrice de déclenchement

| Événement                                  | Notifier sous |
|--------------------------------------------|---------------|
| Drill backup KO                            | 24 h (RSSI + DSI) |
| Restauration partielle effectuée           | 4 h (RSSI)        |
| Restauration prod / bascule DR             | Immédiat (RSSI + DSI + Direction) |
| Suspicion ransomware                       | Immédiat (RSSI + Direction + DPO) |
| Perte de données > 1 h ouvrée              | 24 h (DPO si données perso)       |

---

## 8. Checklist post-restore

À cocher dans le ticket d'incident avant clôture.

### 8.1 Intégrité technique

- [ ] `systemctl status omnitech-backend omnitech-frontend` → both `active (running)`
- [ ] `curl https://intranet.omnitech-security.fr/api/health` → `{"status":"ok"}`
- [ ] Counts de cohérence sur tables critiques :
  ```sql
  SELECT 'User' t, count(*) FROM "User"
  UNION ALL SELECT 'Document', count(*) FROM "Document"
  UNION ALL SELECT 'Ticket',   count(*) FROM "Ticket"
  UNION ALL SELECT 'AuditLog', count(*) FROM "AuditLog"
  UNION ALL SELECT 'WikiPage', count(*) FROM "WikiPage"
  UNION ALL SELECT 'NewsPost', count(*) FROM "NewsPost";
  ```
- [ ] `_prisma_migrations` → toutes les migrations en `finished_at IS NOT NULL`
- [ ] Storage : `du -sh /root/omnitech-intranet/storage` cohérent avec backup

### 8.2 Audit & traçabilité

- [ ] Entrée `AuditLog` créée : action `RESTORE_PERFORMED`, acteur = opérateur
- [ ] Log `/var/log/omnitech/backup-restore.log` archivé (lien dans le ticket)
- [ ] SHA-256 du backup utilisé consigné
- [ ] Drill manuel post-restore lancé → exit 0
- [ ] Mise à jour du registre des incidents (ISO 27001 A.5.24)

### 8.3 Communication utilisateurs

- [ ] Annonce sur le portail (bandeau `/admin/maintenance`)
- [ ] Mail global `news.intranet@omnitech-security.fr` envoyé
- [ ] Status page mise à jour (incident → resolved)
- [ ] DPO informé si données personnelles impactées (RGPD art. 33/34)
- [ ] Note dans le wiki interne `/wiki/incidents/<date>`

### 8.4 Suivi à J+7

- [ ] Post-mortem rédigé et partagé (RSSI + DSI)
- [ ] Plan d'action correctif ouvert (Jira/CAPA)
- [ ] Tests de non-régression sur fonctionnalités impactées

---

## 9. Annexe — Reverse proxy de référence

```nginx
server {
    listen 443 ssl;
    server_name intranet.omnitech-security.fr;

    ssl_certificate     /etc/letsencrypt/live/intranet.omnitech-security.fr/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/intranet.omnitech-security.fr/privkey.pem;

    location /api/      { proxy_pass http://127.0.0.1:3000; include /etc/nginx/snippets/proxy.conf; }
    location /socket.io/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
    location /          { proxy_pass http://127.0.0.1:3001; include /etc/nginx/snippets/proxy.conf; }
}
```

## 10. Annexe — Services optionnels

| Service               | Port | Description                |
|-----------------------|------|----------------------------|
| OnlyOffice DocServer  | 8443 | Édition collaborative      |
| DocuSeal              | 7000 | Signature électronique     |
| Stirling PDF          | 8080 | Outils PDF                 |
| Redis                 | 6379 | Cache + sessions           |

## 11. Support

- Email : jmorin@omnitech-security.fr
- Helpdesk : https://intranet.omnitech-security.fr/helpdesk
- Wiki : https://intranet.omnitech-security.fr/wiki/dr
