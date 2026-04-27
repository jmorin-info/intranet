# Backup offsite chiffré — Restic + S3 (Wave D item 20)

> Backup quotidien chiffré AES-256 vers stockage S3-compatible européen.
> Cible : protéger contre la perte du datacenter (incendie, ransomware,
> supplier outage). Complémentaire au PRA Patroni HA (qui couvre la perte
> d'1 nœud, mais pas la perte de tout le site).

## Sommaire

1. [Choix du provider](#1-choix-du-provider)
2. [Setup compte + bucket + IAM](#2-setup-compte--bucket--iam)
3. [Init du repo Restic](#3-init-du-repo-restic)
4. [Variables d'env](#4-variables-denv)
5. [Schedule (timers systemd)](#5-schedule-timers-systemd)
6. [Procédure restore — DB perdue](#6-procédure-restore--db-perdue)
7. [Procédure restore — fichiers perdus](#7-procédure-restore--fichiers-perdus)
8. [RPO / RTO](#8-rpo--rto)
9. [Estimation coûts](#9-estimation-coûts)
10. [Test DR annuel](#10-test-dr-annuel-procédure-formelle)
11. [Endpoint admin](#11-endpoint-admin-de-monitoring)
12. [Sécurité](#12-sécurité)

---

## 1. Choix du provider

| Provider                    | Région                | Prix /GB/mois | RGPD                       | Verdict                                        |
| --------------------------- | --------------------- | ------------- | -------------------------- | ---------------------------------------------- |
| **Scaleway Object Storage** | Paris (fr-par)        | 0,005 €       | Oui (entreprise française) | **RECOMMANDÉ**                                 |
| OVH Object Storage          | Gravelines/Strasbourg | 0,007 €       | Oui                        | Alternative crédible                           |
| Bunny.net Storage           | Falkenstein DE        | 0,01 €        | Oui                        | Bon perf, doc moins détaillée                  |
| Wasabi EU                   | Amsterdam             | 0,0069 €      | Oui (filiale US ⚠)         | OK si on accepte juridiction US sur la holding |
| AWS S3 (eu-west-3)          | Paris                 | 0,021 €       | Oui (datacenters EU)       | Trop cher pour ce volume                       |
| Backblaze B2 EU             | Amsterdam             | 0,005 €       | Oui (filiale US ⚠)         | Très bon marché mais juridiction US            |

### Recommandation : **Scaleway Object Storage** (fr-par)

- **EU sovereign** : société française, datacenters France
- **Compatible S3 API** : aucune adaptation Restic nécessaire
- **Endpoint unique** : `s3.fr-par.scw.cloud`
- **Multi-AZ disponible** (option redondance régionale)
- **Object Lock** disponible (rétention compliance immutable)

> Si la politique exige une multi-cloud distribution (anti-ransomware avancé),
> dupliquer vers OVH avec `restic copy` sur un timer mensuel.

---

## 2. Setup compte + bucket + IAM

### Sur la console Scaleway

1. Créer un projet dédié `omnitech-backups`
2. Object Storage → **Créer un bucket** :
   - Nom : `omnitech-backups-intranet`
   - Région : `fr-par`
   - Visibilité : **Privé** (jamais public)
   - Versioning : **Activé** (rollback en cas d'écrasement accidentel)
   - Object Lock : **Compliance mode** rétention 30 jours
     (anti-ransomware : un attaquant ne peut PAS supprimer < 30j même avec creds)
3. IAM → **Créer une API Key** :
   - Application : `intranet-backup`
   - Permissions : **scope au bucket** uniquement
     - `ObjectStorageFullAccess` sur `omnitech-backups-intranet`
     - PAS de droit DELETE-bucket ni IAM
   - Récupérer `access_key` + `secret_key` (afficher 1 seule fois)

### Best practice : 2 jeux de credentials

- **WRITE-ONLY** sur intranet-prod (le serveur peut backup mais pas read/restore)
- **READ-ONLY + DELETE** sur poste ops dédié (pour restore/prune manuels)

→ Si un attaquant compromet l'intranet, il NE PEUT PAS supprimer les backups offsite.

```bash
# WRITE-ONLY — utilisé par intranet-prod
ScalewayPolicy "intranet-backup-write" :
  - s3:PutObject
  - s3:GetObject  (restic check a besoin de lire les manifests)
  Resource: arn:scw:s3:::omnitech-backups-intranet/*

# RESTORE — utilisé par poste ops uniquement
ScalewayPolicy "intranet-backup-restore" :
  - s3:GetObject
  - s3:ListBucket
  - s3:DeleteObject  (pour restic prune)
  Resource: arn:scw:s3:::omnitech-backups-intranet/*
```

---

## 3. Init du repo Restic

**À faire UNE SEULE FOIS** depuis un poste ops :

```bash
# Générer la passphrase Restic (chiffre AES-256 le repo)
RESTIC_PASSWORD=$(openssl rand -base64 32)
echo "RESTIC_PASSWORD=${RESTIC_PASSWORD}" >> ~/.restic-creds  # à archiver dans pass/Vault

export RESTIC_REPOSITORY=s3:s3.fr-par.scw.cloud/omnitech-backups-intranet
export RESTIC_PASSWORD
export AWS_ACCESS_KEY_ID=<scaleway access key>
export AWS_SECRET_ACCESS_KEY=<scaleway secret key>

restic init
# repository abc123 created at s3:s3.fr-par.scw.cloud/omnitech-backups-intranet
```

> ⚠️ **CRITIQUE** : sauvegarder la passphrase Restic dans **2 lieux distincts** :
>
> 1. Coffre-fort équipe (Bitwarden / Vaultwarden / 1Password)
> 2. Coffre-fort physique (KeePass sur clé USB chiffrée Vault Hardware)
>
> **Sans cette passphrase, les backups sont irrécupérables** (par design : c'est
> ce qui les protège des attaquants).

---

## 4. Variables d'env

À ajouter dans `.env` (cf. [`.env.example`](../../.env.example) section item 20) :

```bash
# === Restic backup offsite (Wave D item 20) ===
RESTIC_REPOSITORY=s3:s3.fr-par.scw.cloud/omnitech-backups-intranet
RESTIC_PASSWORD=<générer avec openssl rand -base64 32>
AWS_ACCESS_KEY_ID=<scaleway write-only access key>
AWS_SECRET_ACCESS_KEY=<scaleway write-only secret key>

# Identifiant de l'hôte source (présent dans tous les snapshots)
RESTIC_HOST=intranet-prod

# Optionnel : politique de rétention (défauts = 7d/4w/12m/3y)
RESTIC_KEEP_DAILY=7
RESTIC_KEEP_WEEKLY=4
RESTIC_KEEP_MONTHLY=12
RESTIC_KEEP_YEARLY=3

# Optionnel : taille de l'échantillon vérifié mensuellement
RESTIC_CHECK_SUBSET=1G

# Optionnel : alertes échec backup (mail + webhook)
ALERT_EMAIL=ops@omnitech-security.fr
ALERT_WEBHOOK=https://chat.omnitech-security.fr/hooks/abc123
```

---

## 5. Schedule (timers systemd)

```bash
# Installation
cp infra/systemd/omnitech-backup.{service,timer} /etc/systemd/system/
cp infra/systemd/omnitech-backup-prune.{service,timer} /etc/systemd/system/
cp infra/systemd/omnitech-backup-verify.{service,timer} /etc/systemd/system/
cp infra/systemd/alerter@.service /etc/systemd/system/

systemctl daemon-reload

# Activation
systemctl enable --now omnitech-backup.timer
systemctl enable --now omnitech-backup-prune.timer
systemctl enable --now omnitech-backup-verify.timer

# Vérification
systemctl list-timers --all | grep omnitech-backup
```

| Timer                          | Schedule                  | Tâche                      |
| ------------------------------ | ------------------------- | -------------------------- |
| `omnitech-backup.timer`        | quotidien 02h00           | dump DB + storage → Restic |
| `omnitech-backup-prune.timer`  | hebdo dim 03h00           | rotation GFS + prune repo  |
| `omnitech-backup-verify.timer` | mensuel 1er du mois 04h00 | check intégrité subset 1G  |

Chaque timer a un `RandomizedDelaySec` pour éviter les pics de charge.

---

## 6. Procédure restore — DB perdue

**Cas pratique** : la DB de prod est corrompue/perdue, on doit restaurer le dump
le plus récent.

```bash
# Sur un nouveau serveur Postgres (ou l'actuel après reset DB)
cd /opt/omnitech/intranet

# 1. Lister les snapshots disponibles
RESTIC_REPOSITORY=s3:s3.fr-par.scw.cloud/omnitech-backups-intranet \
RESTIC_PASSWORD=$(cat /root/.restic-creds | grep PASS | cut -d= -f2) \
AWS_ACCESS_KEY_ID=<restore-key> \
AWS_SECRET_ACCESS_KEY=<restore-secret> \
restic snapshots --tag database --last 10

# Output : liste de short_id avec dates

# 2. Restaurer dans une DB temporaire (script interactif)
bash scripts/backup/restore-database.sh
# > Snapshot ID à restaurer : abc1234
# > Tapez exactement RESTORE pour continuer : RESTORE
# ... pg_restore ...
# Restore OK : DB 'intranet_restore_20260426_153000' restaurée

# 3. Vérifier l'intégrité (count des tables critiques)
psql -d intranet_restore_20260426_153000 -c "SELECT count(*) FROM \"User\";"
psql -d intranet_restore_20260426_153000 -c "SELECT count(*) FROM \"Document\";"
# Comparer aux derniers chiffres connus

# 4. Bascule en prod (irréversible — bloquer le backend AVANT)
systemctl stop omnitech-backend
psql -c 'ALTER DATABASE omnitech_intranet RENAME TO old_corrupted;'
psql -c 'ALTER DATABASE intranet_restore_20260426_153000 RENAME TO omnitech_intranet;'
systemctl start omnitech-backend

# 5. Vérifier le smoke test
curl https://intranet.omnitech-security.fr/api/v1/health
```

---

## 7. Procédure restore — fichiers perdus

**Cas pratique** : un user a supprimé par erreur un dossier de chartes, ou un
attaquant a chiffré `/var/omnitech/storage`.

```bash
# 1. Lister les snapshots storage
restic snapshots --tag storage --last 5

# 2. Lister les fichiers d'un snapshot précis
restic ls <snapshot_id> /var/omnitech/storage/chartes

# 3. Restaurer un sous-arbre vers /tmp (pas écraser direct la prod !)
restic restore <snapshot_id> --target /tmp/restore \
  --include "/var/omnitech/storage/chartes/2026"

# 4. Vérifier puis copier vers prod
ls /tmp/restore/var/omnitech/storage/chartes/2026/
rsync -av /tmp/restore/var/omnitech/storage/chartes/2026/ \
  /var/omnitech/storage/chartes/2026/
chown -R omnitech:omnitech /var/omnitech/storage/chartes/2026/

# 5. Cleanup
rm -rf /tmp/restore
```

---

## 8. RPO / RTO

| Métrique                           | Cible       | Notes                                                   |
| ---------------------------------- | ----------- | ------------------------------------------------------- |
| **RPO** (Recovery Point Objective) | **24h max** | Dernier backup quotidien. Max = 24h de données perdues. |
| **RTO** (Recovery Time Objective)  | **~30min**  | Full restore DB intranet (estimation 5-15GB).           |
| RTO storage                        | ~30min - 2h | Dépend du volume (100GB → 2h en réseau 100Mbps)         |
| RTO système complet                | 2-4h        | Provision serveur + restore + smoke test                |

### Pour réduire RPO < 24h

Option 1 : timer toutes les 6h (dedup Restic = peu de bande passante)
Option 2 : streaming WAL via `wal-g` vers S3 (RPO ~1min, plus complexe)

### Pour réduire RTO < 30min

- Pré-provisioner un serveur "warm standby" identique
- Maintenir un cache local du dernier snapshot Restic (`restic restore` plus rapide)
- Le dump Postgres représente quelques GB compressés, restore = 5-10min sur SSD
- Le bottleneck est la bande passante S3 → serveur (Scaleway 1Gbps standard)

---

## 9. Estimation coûts

### Hypothèse intranet OMNITECH

- 100 users actifs
- DB Postgres : ~2GB (snapshots, audits, retention 1 an)
- Storage : ~50GB (chartes, vidéos, médias)
- Croissance estimée : +20% / an

### Coût Scaleway

| Poste                                 | Volume | Tarif      | Mensuel            |
| ------------------------------------- | ------ | ---------- | ------------------ |
| Stockage backups (52GB × dedup)       | ~30GB  | 0,005 €/GB | **0,15 €**         |
| Stockage avec rétention 1 an          | ~150GB | 0,005 €/GB | **0,75 €**         |
| Trafic sortant (restore mensuel test) | 30GB   | 0,01 €/GB  | **0,30 €**         |
| **TOTAL**                             |        |            | **~1,20 € / mois** |

> Dedup Restic est très efficace : 365 backups quotidiens × 2GB ne représentent
> pas 730GB de stockage, mais seulement 5-10GB de chunks uniques.

### Marge sécurité

Estimation officielle pour le budget : **5-15 € / mois** (couvre croissance 5x).

### Comparaison

- AWS S3 eu-west-3 : ~5 € / mois (4x plus cher)
- Backblaze B2 (US juridiction) : ~0,75 € / mois
- Solution interne (NAS sur site) : matériel ~2000 € + coût ops

---

## 10. Test DR annuel (procédure formelle)

**Obligatoire** : test de restauration complet une fois par an (ISO 27001 A.5.30).

### Procédure

1. **Provisionner serveur "DR-test"** isolé du réseau prod
2. **Choisir un snapshot** de + de 30 jours (vérifier object lock)
3. **Restore complet** :
   - DB → instance Postgres temporaire
   - Storage → volume temporaire
4. **Smoke test fonctionnel** :
   - Login d'un user test
   - Browse documents
   - Création/suppression d'un poste blog
   - Vérification audit logs
5. **Mesurer RTO réel** vs cible 30min
6. **Documenter** dans `docs/runbooks/dr-test-YYYY.md`
7. **Détruire** le serveur DR-test (cleanup)

### Critères de succès

- [ ] Restore complet sans erreur
- [ ] Database integrity check OK (count tables critiques cohérent)
- [ ] Storage : checksums fichiers OK (Restic vérifie automatiquement)
- [ ] Application bootable et fonctionnelle
- [ ] RTO observé ≤ 60 min (cible 30 min, marge 100%)

### Si échec

Issue critique → priorisée sprint suivant. Réviser :

- Politique de rétention (snapshots manquants ?)
- Permissions IAM (RESTORE-credentials toujours valides ?)
- Documentation procédure (étape manquante ?)

---

## 11. Endpoint admin de monitoring

```http
GET /api/v1/admin/backup/status
Authorization: Bearer <jwt-super-admin>
```

Réponse :

```json
{
  "available": true,
  "repository": "s3:s3.fr-par.scw.cloud/omnitech-backups-intranet",
  "lastSnapshot": {
    "shortId": "abc1234",
    "time": "2026-04-26T02:00:15Z",
    "hostname": "intranet-prod",
    "tags": ["database", "host:intranet-prod"],
    "ageSeconds": 21600
  },
  "recentSnapshots": [...],
  "alerts": []
}
```

Codes d'alerte :

- `WARN` : dernier snapshot > 30h
- `CRITIQUE` : dernier snapshot > 48h

À intégrer dans le dashboard SUPER_ADMIN ou Grafana via scrape périodique.

---

## 12. Sécurité

### Chiffrement

- **At rest sur S3** : AES-256 par Restic AVANT upload (Scaleway voit du blob)
- **In transit** : HTTPS/TLS 1.2+ obligatoire vers `s3.fr-par.scw.cloud`
- **Passphrase Restic** : 256 bits aléatoires, stockée hors serveur

### Anti-ransomware

- **WRITE-only credentials** sur intranet-prod (pas de DELETE)
- **Object Lock Compliance 30 jours** sur le bucket (immutable)
- **Versioning bucket** activé (rollback instantané d'un overwrite malicieux)
- **Multi-cloud copy mensuel** (optionnel) : `restic copy` vers OVH

### Audit

- `audit.log` : qui exécute restore-database.sh (via auth ssh + sudo log)
- `restic snapshots` audit trail : metadata immutable (snapshot id + date + host)
- API admin endpoint : logs JSON (request-id, user-id, timestamp)

### Rotation des credentials

- Passphrase Restic : ne pas rotater (perdre = perdre tous les backups)
  → Si soupçon de fuite, init un nouveau repo + migration progressive
- AWS keys : rotation tous les 90 jours via IAM Scaleway
  → Mettre à jour `.env` puis `systemctl restart omnitech-backend`

---

**Liens** :

- Scripts : [`scripts/backup/`](../../scripts/backup/)
- Systemd : [`infra/systemd/omnitech-backup*`](../../infra/systemd/)
- HA Postgres complémentaire : [`HA_POSTGRES_PATRONI.md`](./HA_POSTGRES_PATRONI.md)
