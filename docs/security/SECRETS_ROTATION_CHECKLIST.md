# Checklist de rotation des secrets — OMNITECH Intranet

**Date de création** : 2026-04-20
**Prochaine rotation planifiée** : 2026-07-20 (cycle trimestriel)
**Responsable RACI** : CTO (R), Sysadmin (A), Dev lead (C), RSSI (I)

---

## Ordre de rotation (respecter les dépendances)

### Étape 1 — Base de données (aucune dépendance amont)

| Secret | Procédure | Commande | Impact redémarrage |
|--------|-----------|----------|-------------------|
| `POSTGRES_PASSWORD` | 1. `ALTER USER omnitech WITH PASSWORD 'new';`<br>2. Mettre à jour `.env` (l.23 + l.21 DATABASE_URL)<br>3. `systemctl restart omnitech-backend` | `openssl rand -hex 24` | Backend + tous services Prisma |

### Étape 2 — Redis (aucune dépendance amont)

| Secret | Procédure | Commande | Impact |
|--------|-----------|----------|--------|
| `REDIS_PASSWORD` | 1. `redis-cli CONFIG SET requirepass "new"`<br>2. Mettre à jour `.env` (l.31)<br>3. `systemctl restart omnitech-backend` | `openssl rand -base64 24` | Backend (sessions, cache, BullMQ) |

### Étape 3 — JWT (dépend de : rien, mais invalide toutes sessions)

| Secret | Procédure | Impact |
|--------|-----------|--------|
| `JWT_ACCESS_SECRET` | 1. Générer : `openssl rand -base64 64`<br>2. Mettre à jour `.env` (l.36)<br>3. `systemctl restart omnitech-backend`<br>4. **Tous les utilisateurs seront déconnectés** | Déconnexion globale |
| `JWT_REFRESH_SECRET` | Idem (l.37) | Idem |

> **Fenêtre recommandée** : dimanche 02h-04h. Prévenir les utilisateurs 48h avant.

### Étape 4 — Services externes (indépendants)

| Secret | Procédure | Commande | Responsable |
|--------|-----------|----------|-------------|
| `DOCUSEAL_API_KEY` | Régénérer depuis le dashboard DocuSeal | N/A (UI) | Sysadmin |
| `DOCUSEAL_WEBHOOK_SECRET` | Régénérer un vrai secret | `openssl rand -hex 32` | Dev lead |
| `KNOWBE4_API_TOKEN` | Régénérer depuis eu.knowbe4.com/account/api | N/A (UI) | RSSI |
| `MEILISEARCH_MASTER_KEY` | `openssl rand -hex 32` + restart Meilisearch | Réindexation auto | Sysadmin |

### Étape 5 — Infrastructure fichiers

| Secret | Procédure | Impact |
|--------|-----------|--------|
| `FILESERVER_PASSWORD` | Changer sur le NAS/serveur de fichiers + `.env` (l.89) | Accès fichiers |
| `SMB_BACKUP_PASSWORD` | **Générer un mot de passe DIFFÉRENT** + `.env` (l.133) | Backups SMB |

### Étape 6 — OnlyOffice

| Secret | Procédure | Impact |
|--------|-----------|--------|
| `ONLYOFFICE_JWT_SECRET` | 1. Générer : `openssl rand -hex 32`<br>2. `.env` (l.115)<br>3. `docker-compose` env `JWT_SECRET`<br>4. Restart conteneur + backend | Éditeur document |
| `ONLYOFFICE_SECURE_LINK_SECRET` | 1. Générer : `openssl rand -base64 24`<br>2. `.env` (l.123)<br>3. Restart conteneur (auto via env) | Cache fichiers éditeur |

---

## Actions correctives immédiates (hors rotation)

| Action | Priorité | Commande |
|--------|----------|----------|
| Remplacer `dev_webhook_secret` par un vrai secret | P0 | `openssl rand -hex 32` → `.env:56` |
| Briser la réutilisation fileserver/SMB | P0 | Générer un second mot de passe différent pour SMB |
| Remplacer la clé Meilisearch faible | P1 | `openssl rand -hex 32` → `.env:138` |
| Activer JWT OnlyOffice | P1 | Générer secret + passer `JWT_ENABLED=true` |

---

## Politique de rotation

- **Cycle** : trimestriel (Q1, Q2, Q3, Q4)
- **Notification** : 48h avant pour JWT (déconnexion users)
- **Vérification post-rotation** : smoke test backend + frontend + OnlyOffice + backups
- **Documentation** : mettre à jour ce fichier avec la date de dernière rotation
- **Dernière rotation** : **jamais effectuée** (initialisation projet)
