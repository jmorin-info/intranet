# Runbook — Backup & restauration PostgreSQL

> Procédure ops standard pour la sauvegarde quotidienne, la copie hors-site
> SMB, le test de restauration mensuel et la restauration réelle de la base
> intranet OMNITECH Security. Conforme ISO 27001:2022 — A.5.29 (préparation
> TIC), A.5.30 (continuité), A.8.13 (sauvegarde des informations).

> Voir aussi `RESTORE.md` à la racine du repo (procédure DR complète,
> machine vierge).

## Quand utiliser ce runbook

- Vérifier que les sauvegardes tournent comme prévu (revue mensuelle)
- Lancer / planifier le drill mensuel de restauration
- Restaurer après incident (perte DB, corruption, ransomware, mauvaise migration)
- Onboarder une nouvelle base de tests (`omnitech_intranet_test`)

## Pré-requis

- Compte `root` (ou sudoer) sur la VM Debian 12
- Outils : `pg_dump`, `pg_restore`, `psql`, `dropdb`, `createdb`, `gunzip`,
  `mount.cifs` (paquet `cifs-utils`), `mailutils` (`mail`)
- Variables d'env présentes dans `/root/omnitech-intranet/.env` :
  `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `DB_HOST`, `DB_PORT`,
  `SMB_BACKUP_SHARE`, `SMB_BACKUP_USER`, `SMB_BACKUP_PASSWORD`, `SMB_BACKUP_DOMAIN`
- Cible RTO **2 h** / RPO **24 h** (cf. `RESTORE.md` §2)

## Procédure

### 1. Sauvegarde quotidienne (déjà câblée)

Le script `scripts/backup.sh` fait :

1. `pg_dump --format=custom --compress=9` vers `/var/backups/omnitech/db_<TS>.sql.gz`
2. Vérification d'intégrité immédiate avec `pg_restore --list`
3. `tar -czf` du dossier `storage/` (uploads / pièces jointes)
4. Rétention **30 jours** locale (`find -mtime +30 -delete`)
5. Copie vers le partage SMB `${SMB_BACKUP_SHARE}` (montage CIFS temporaire)
6. Mail d'alerte si échec via `${ALERT_EMAIL}` (par défaut `jmorin@omnitech-security.fr`)

**Cron actuelle (à installer si pas déjà fait) :**

```bash
# Editer la cron de root
crontab -e

# Ajouter :
0 2 * * * /root/omnitech-intranet/scripts/backup.sh >> /var/log/omnitech/backup.log 2>&1
```

Vérifier qu'elle est bien planifiée :

```bash
crontab -l | grep backup
ls -lh /var/backups/omnitech/ | tail -10
tail -50 /var/log/omnitech/backup.log
```

### 2. Drill mensuel — test de restauration

Le script `scripts/backup-drill.sh` fait, sans toucher à la prod :

1. Sélectionne le dump le plus récent dans `/var/backups/omnitech/`
2. Crée la base éphémère `omnitech_intranet_drill`
3. `pg_restore --single-transaction --exit-on-error`
4. Vérifie 4 tables (`User`, `Document`, `Ticket`, `AuditLog`) avec seuils minimum
5. Vérifie qu'au moins 1 migration Prisma est présente
6. Drop la base éphémère (toujours, via `trap cleanup`)
7. Mail d'alerte si échec

**Cron recommandée (chaque dimanche 3 h) :**

```bash
crontab -e
# Ajouter :
0 3 * * 0 /root/omnitech-intranet/scripts/backup-drill.sh >> /var/log/omnitech/backup-drill.log 2>&1
```

**Lancement manuel (revue mensuelle) :**

```bash
sudo /root/omnitech-intranet/scripts/backup-drill.sh
tail -50 /var/log/omnitech/backup-drill.log
```

Sortie attendue : `=== DRILL OK (NNs) ===`. Sinon, traiter en P1.

### 3. Vérification d'intégrité (md5 / sha256)

Le script de backup ne génère pas systématiquement de checksum compagnon.
Pour générer / vérifier manuellement :

```bash
cd /var/backups/omnitech
# Générer
sha256sum db_*.sql.gz > checksums.sha256

# Vérifier plus tard
sha256sum -c checksums.sha256
```

À ajouter dans la cron de backup si traçabilité longue durée requise :
`[À COMPLÉTER PAR L'ÉQUIPE OPS : décision RSSI sur archivage des checksums]`.

### 4. Restauration vers une base de test (`omnitech_intranet_test`)

Cas d'usage : reproduire un bug, tester une migration, former une recrue.

```bash
# Dry-run (vérifie le plan, ne touche à rien)
sudo bash /root/omnitech-intranet/scripts/backup-restore.sh \
  --backup=/var/backups/omnitech/db_<TIMESTAMP>.sql.gz \
  --db=omnitech_intranet_test

# Exécution réelle
sudo bash /root/omnitech-intranet/scripts/backup-restore.sh \
  --backup=/var/backups/omnitech/db_<TIMESTAMP>.sql.gz \
  --db=omnitech_intranet_test \
  --confirm
```

Le script refuse d'écraser la prod tant que `--prod` n'est pas explicitement
fourni (garde-fou intégré).

### 5. Restauration de la PRODUCTION (incident grave)

**4-yeux obligatoire : DSI + RSSI.** Cf. `RESTORE.md` pour la procédure
complète (réinstallation OS, migrations Prisma, smoke tests). Forme courte :

```bash
# 1. Couper le trafic (mode maintenance)
sudo -u postgres psql -d postgres -c \
  "INSERT INTO \"AppConfig\"(key,value) VALUES('maintenance_mode','true') \
   ON CONFLICT (key) DO UPDATE SET value='true';"

# 2. Stopper le backend pour libérer les connexions
systemctl stop omnitech-backend.service

# 3. Restaurer (avec --prod)
sudo bash /root/omnitech-intranet/scripts/backup-restore.sh \
  --backup=/var/backups/omnitech/db_<TIMESTAMP>.sql.gz \
  --db=omnitech_intranet \
  --storage=/var/backups/omnitech/storage_<TIMESTAMP>.tar.gz \
  --confirm --prod

# 4. Relancer
systemctl start omnitech-backend.service omnitech-frontend.service

# 5. Sortir du mode maintenance (cf. PRODUCTION_INCIDENT_RESPONSE §6)
```

## Vérifications post-action

- `psql -d omnitech_intranet -c "SELECT count(*) FROM \"User\";"` retourne un compte plausible (> 10)
- `psql -d omnitech_intranet -c "SELECT count(*) FROM _prisma_migrations WHERE finished_at IS NOT NULL;"` > 0
- `curl -s http://localhost:3000/api/health | jq .services.database` retourne `"up"`
- Mail de fin de restauration reçu à `${ALERT_EMAIL}` (envoyé par `backup-restore.sh`)
- Connexion fonctionnelle d'un compte SUPER_ADMIN sur l'UI

## Rollback

Si la restauration s'est mal passée mais que la prod tournait encore :

```bash
# Drop la base mal restaurée et recréer depuis un dump plus ancien
sudo -u postgres dropdb omnitech_intranet
sudo -u postgres createdb omnitech_intranet -O omnitech
sudo bash /root/omnitech-intranet/scripts/backup-restore.sh \
  --backup=/var/backups/omnitech/db_<TS_PREV>.sql.gz \
  --db=omnitech_intranet --confirm --prod
```

Si le dump source lui-même est corrompu :
`[À COMPLÉTER PAR L'ÉQUIPE OPS : récupérer un dump plus ancien depuis SMB
hors-site puis appliquer la même procédure ; envisager activation PCA]`.

## Escalade

| Situation                                                   | Contact                                |
|-------------------------------------------------------------|----------------------------------------|
| Drill mensuel échoue 2 fois de suite                        | RSSI (`jmorin@omnitech-security.fr`)   |
| Backup quotidien manqué > 48 h                              | DSI puis RSSI                          |
| Restauration prod nécessaire                                | RSSI **+** DSI (4-yeux)                |
| RTO/RPO dépassé pendant restauration                        | Direction (PCA, cf. `/admin/pca`)      |

## Annexes

- Scripts de référence (à NE PAS modifier sans relecture RSSI) :
  - `/root/omnitech-intranet/scripts/backup.sh` (sauvegarde quotidienne)
  - `/root/omnitech-intranet/scripts/backup-drill.sh` (drill mensuel)
  - `/root/omnitech-intranet/scripts/backup-restore.sh` (wrapper restore réel)
  - `/root/omnitech-intranet/scripts/backup-full.sh` (backup full one-shot manuel)
- Documentation DR complète : `/root/omnitech-intranet/RESTORE.md`
- Cibles : RPO 24 h, RTO base 2 h, RTO global 4 h
