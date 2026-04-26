# PCA — Sauvegarde & restauration OMNITECH Intranet

> Plan de Continuité d'Activité (PCA) — volet sauvegarde / restauration de
> la base PostgreSQL, du storage applicatif et de la configuration.
>
> Conforme ISO 27001:2022 :
> - **A.5.29** Préparation TIC pour la continuité (drill / test régulier)
> - **A.5.30** Continuité d'activité (RPO / RTO documentés, escalade)
> - **A.8.13** Sauvegarde des informations (chiffrement, intégrité, durée)
>
> Mainteneur : RSSI (J. Morin — `jmorin@omnitech-security.fr`).

---

## 1. Vue d'ensemble

| Champ                 | Valeur                                               |
| --------------------- | ---------------------------------------------------- |
| Données sauvegardées  | PostgreSQL `omnitech_intranet` + `storage/` (uploads, avatars, certificats) + `.env` (sur archives full) |
| Localisation primaire | Serveur intranet `localhost:/var/backups/omnitech/`  |
| Localisation hors-site| Partage SMB `\\filer.omnitech-security.fr\intranet-backup` (CIFS) |
| Fréquence             | **Quotidienne** 02:00 (cron root)                    |
| Rétention             | **GFS** : 7 daily + 4 weekly + 12 monthly (≈ 1 an)   |
| Intégrité             | SHA-256 compagnon `.sha256` à côté de chaque dump     |
| Chiffrement transport | SMB 3.0 (chiffré sur le réseau)                      |
| Chiffrement repos     | À activer (cf. §6) — dépend de la politique RSSI     |
| Test de restore       | **Hebdomadaire** (dimanche 02:00 / 03:00) — exit 0 obligatoire |

---

## 2. RPO / RTO

| Métrique | Engagement | Justification                                              |
| -------- | ---------- | ---------------------------------------------------------- |
| **RPO**  | 24 h       | Backup quotidien à 02:00 + copie SMB hors-site             |
| **RTO** base de données | 2 h | Restore depuis dump custom local sur Postgres warm |
| **RTO** global (intranet utilisable) | 4 h | Inclut DB + storage + rebuild assets + smoke tests |
| **MTPD** | 5 jours    | Au-delà : risque opérationnel / contractuel                |

Dépassement → escalade Direction (cf. `RESTORE.md` §7).

---

## 3. Architecture des scripts

```
scripts/
├── backup.sh                 ← cron quotidienne 02:00
│                             ↳ pg_dump custom + storage tar
│                             ↳ SHA-256 compagnon
│                             ↳ copie SMB
│                             ↳ délégué à backup-cleanup.sh pour la rotation
│
├── backup-cleanup.sh         ← rotation GFS 7/4/12
│                             ↳ daily=7, weekly=4 (dimanche), monthly=12 (1er)
│                             ↳ purge fichiers .sha256 orphelins
│
├── backup-full.sh            ← one-shot manuel : code + DB + storage + config
│                             ↳ archive unique omnitech-full-<TS>.tar.gz
│
├── backup-drill.sh           ← drill historique (hebdo, base éphémère drill)
│                             ↳ counts simples sur User/Document/Ticket/AuditLog
│
├── test-backup-restore.sh    ← NEW : test de restauration ISO A.8.13
│                             ↳ assertions étendues : pgvector, SUPER_ADMIN
│                             ↳ sortie JSON parsable (CI / monitoring)
│                             ↳ exit codes 0/1/2/3 (env/restore/assert)
│
└── backup-restore.sh         ← wrapper réel (incident — restauration prod)
                              ↳ garde-fous --confirm / --prod, log audit, mail
```

Le service NestJS `apps/backend/src/backup/backup.service.ts` expose ces
scripts à l'UI admin (`/admin/backup`) pour les SUPER_ADMIN (download / upload
/ restore via formulaire web).

---

## 4. Procédures opérationnelles

### 4.1 Cron actuelle (référence)

```cron
# /etc/crontab
0 2 * * *  /root/omnitech-intranet/scripts/backup.sh \
           >> /var/log/omnitech/backup.log 2>&1
0 3 * * 0  /root/omnitech-intranet/scripts/backup-drill.sh \
           >> /var/log/omnitech/backup-drill.log 2>&1
0 2 * * 0  /root/omnitech-intranet/scripts/test-backup-restore.sh \
           >> /var/log/omnitech/test-backup-restore.log 2>&1
```

> **Action recommandée** : rajouter la ligne `test-backup-restore.sh` dans la
> cron racine si pas déjà fait. Le drill historique reste en place pour la
> compatibilité, le nouveau script complète avec des assertions ISO A.8.13.

### 4.2 Lancer une sauvegarde manuelle

```bash
sudo /root/omnitech-intranet/scripts/backup.sh
```

Ou via l'UI : **Admin → Sauvegarde → Lancer une sauvegarde maintenant**.

### 4.3 Lancer un test de restore manuellement

```bash
# Auto-détecte le dernier dump dans /var/backups/omnitech/
sudo /root/omnitech-intranet/scripts/test-backup-restore.sh

# Sur un dump spécifique
sudo /root/omnitech-intranet/scripts/test-backup-restore.sh \
  /var/backups/omnitech/db_20260423_020001.sql.gz

# Sortie texte humaine (au lieu de JSON)
sudo FORMAT=text /root/omnitech-intranet/scripts/test-backup-restore.sh
```

Sortie attendue (JSON, extrait) :

```json
{
  "status": "pass",
  "exit_code": 0,
  "duration_seconds": 142,
  "test_db": "omnitech_restore_test_20260427_020001",
  "dump": {
    "path": "/var/backups/omnitech/db_20260427_020001.sql.gz",
    "size_bytes": 134217728,
    "sha256": "3f2c…",
    "restore_duration_seconds": 87
  },
  "assertions": {
    "restore_ok": true,
    "users_above_min": true,
    "documents_above_min": true,
    "auditlog_above_min": true,
    "pgvector_present": true,
    "super_admin_present": true,
    "migrations_applied": true
  },
  "metrics": {
    "users": 108,
    "documents": 27,
    "audit_logs": 2495,
    "super_admins": 1,
    "migrations": 47,
    "tables_public": 84
  }
}
```

Exit codes :
- `0` — OK, toutes les assertions passées
- `1` — restore échoué (dump corrompu, pg_restore plante)
- `2` — assertions échouées (counts/extensions incohérents)
- `3` — erreur d'environnement (outils manquants, postgres injoignable)

### 4.4 Restauration manuelle (incident)

Voir `RESTORE.md` à la racine du repo pour la procédure complète. Forme
courte :

```bash
# 1. Test de restauration (vérifie que le dump est sain, sans toucher la prod)
sudo /root/omnitech-intranet/scripts/test-backup-restore.sh \
  /var/backups/omnitech/db_<TS>.sql.gz

# 2. Restauration réelle dans une base de tests (dry-run)
sudo bash /root/omnitech-intranet/scripts/backup-restore.sh \
  --backup=/var/backups/omnitech/db_<TS>.sql.gz \
  --db=omnitech_intranet_test

# 3. Restauration réelle dans une base de tests (exécution)
sudo bash /root/omnitech-intranet/scripts/backup-restore.sh \
  --backup=/var/backups/omnitech/db_<TS>.sql.gz \
  --db=omnitech_intranet_test \
  --confirm

# 4. Restauration PROD — réservée aux incidents (4-yeux RSSI + DSI)
sudo bash /root/omnitech-intranet/scripts/backup-restore.sh \
  --backup=/var/backups/omnitech/db_<TS>.sql.gz \
  --db=omnitech_intranet \
  --storage=/var/backups/omnitech/storage_<TS>.tar.gz \
  --confirm --prod
```

Le wrapper `backup-restore.sh` envoie un mail post-restore à
`${ALERT_EMAIL}` (par défaut `jmorin@omnitech-security.fr`).

---

## 5. Vérifications d'intégrité (SHA-256)

Chaque dump est accompagné d'un fichier `.sha256` :

```bash
# Sur le serveur primaire
ls /var/backups/omnitech/db_20260427_020001.sql.gz*
# db_20260427_020001.sql.gz
# db_20260427_020001.sql.gz.sha256

# Vérification manuelle
cd /var/backups/omnitech
sha256sum -c db_20260427_020001.sql.gz.sha256
# db_20260427_020001.sql.gz: OK
```

Le script `test-backup-restore.sh` vérifie automatiquement la `sha256`
compagnon avant la restauration et fail-fast si mismatch.

---

## 6. Chiffrement (à activer)

À ce stade, les dumps locaux ne sont pas chiffrés au repos (chiffrement
disque LUKS recommandé sur la VM hôte). Le transit SMB 3.0 vers le NAS est
chiffré. Pour ajouter un chiffrement applicatif :

### 6.1 Option `age` (simple, recommandée)

```bash
# Génération de clé (à faire une fois, garder la privée hors-ligne)
age-keygen -o /root/.age/intranet-backup.key
# Clé publique → .env :
echo "BACKUP_AGE_RECIPIENT=age1xxxxxxxxxxx..." >> /root/omnitech-intranet/.env
```

Patch dans `backup.sh` (à ajouter après `pg_dump`) :

```bash
if [ -n "${BACKUP_AGE_RECIPIENT:-}" ]; then
  age -r "$BACKUP_AGE_RECIPIENT" -o "${DB_BACKUP}.age" "$DB_BACKUP"
  rm -f "$DB_BACKUP"  # On ne garde que la version chiffrée
  DB_BACKUP="${DB_BACKUP}.age"
fi
```

### 6.2 Option `gpg --encrypt`

```bash
# Importer la clé publique de chiffrement (ne stocker QUE la publique sur le
# serveur de prod ; la privée vit hors-ligne / dans un coffre)
gpg --import /etc/omnitech/backup-pubkey.asc

# Patch backup.sh :
gpg --batch --yes --encrypt --recipient backup@omnitech-security.fr \
    -o "${DB_BACKUP}.gpg" "$DB_BACKUP"
rm -f "$DB_BACKUP"
```

> **Important** : si chiffrement activé, mettre à jour
> `test-backup-restore.sh` pour déchiffrer avant restauration. Et
> documenter la procédure de récupération de la clé privée dans le coffre
> RSSI (sinon, le backup chiffré devient inutilisable lors d'un incident).

### 6.3 Décision actuelle

Tant que la décision RSSI n'est pas formalisée, on s'appuie sur :
- Disque hôte chiffré au repos (LUKS / dm-crypt)
- Ace direct uniquement par root (UMASK 077 sur `/var/backups/omnitech`)
- Transit SMB 3.0 chiffré

À traiter dans le ticket `INFRA-XXX — Chiffrement applicatif backups` (P2).

---

## 7. Logs et observabilité

| Log fichier                                     | Quoi                                  |
| ----------------------------------------------- | ------------------------------------- |
| `/var/log/omnitech/backup.log`                  | Backup quotidien (cron)               |
| `/var/log/omnitech/backup-drill.log`            | Drill hebdomadaire historique         |
| `/var/log/omnitech/test-backup-restore.log`    | Test de restore A.8.13 (NEW)          |
| `/var/log/omnitech/backup-restore.log`          | Restauration réelle (incident)        |
| `/var/log/omnitech/backup-cleanup.log`          | Rotation GFS                          |

**Logrotate** suggéré (à déposer dans `/etc/logrotate.d/omnitech-backup`) :

```
/var/log/omnitech/backup*.log /var/log/omnitech/test-backup*.log {
    weekly
    rotate 12
    compress
    delaycompress
    missingok
    notifempty
    create 0640 root root
}
```

---

## 8. Responsabilités

| Action                                | Responsable principal | Backup       |
| ------------------------------------- | --------------------- | ------------ |
| Surveiller backup quotidien           | DSI (astreinte infra) | RSSI         |
| Lire logs `test-backup-restore.log`   | DSI                   | RSSI         |
| Décider d'une restauration prod       | RSSI **+** DSI (4-yeux) | Direction  |
| Faire tourner le drill mensuel manuel | RSSI                  | DSI          |
| Vérifier la copie SMB hors-site       | DSI (mensuel)         | RSSI         |
| Mettre à jour ce document             | RSSI                  | DSI          |

Tableau d'escalade complet : `RESTORE.md` §7.

---

## 9. Tests réalisés (historique)

| Date        | Type            | Résultat | Opérateur | Lien                                         |
| ----------- | --------------- | -------- | --------- | -------------------------------------------- |
| 2026-04-27  | test-backup-restore.sh (initial) | À compléter — voir log | jmorin    | `/var/log/omnitech/test-backup-restore.log`  |

> Tenir cette table à jour à chaque exécution manuelle ou drill mensuel.
> En cas d'échec : ticket P1, ne pas marquer le système DR-ready.

---

## 10. Limitations connues

- **Pas de DR drill complet** (restauration sur VM vierge + smoke tests UI)
  Recommandation : faire un DR drill complet 1 fois par an, planifié et
  documenté en ticket dédié.
- **Pas de test de restore offsite** automatisé : on teste sur le serveur
  primaire. Le SMB hors-site n'est pas drillé automatiquement (il faudrait
  monter le partage en lecture, copier un dump, et le restorer ailleurs).
- **Pas de chiffrement applicatif** au repos pour le moment (cf. §6).
- **Pas de réplication temps réel** (pas de WAL streaming / PITR). RPO 24 h
  acceptable au regard du contexte intranet interne ; à ré-évaluer si la
  criticité monte.

---

## 11. Références

- `RESTORE.md` — procédure DR complète (machine vierge)
- `docs/runbooks/DATABASE_BACKUP_RESTORE.md` — runbook ops opérationnel
- `docs/security/SECRETS_AUDIT.md` — où sont stockés les secrets backup
- ISO 27001:2022 — A.5.29, A.5.30, A.8.13
- RGPD Art. 32 — sécurité du traitement (intégrité / disponibilité)
