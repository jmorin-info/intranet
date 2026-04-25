# Runbook — Réponse à incident production

> Procédure ops standard pour qualifier, contenir et résoudre un incident
> sur l'intranet OMNITECH Security (prod). Conforme ISO 27001:2022 —
> A.5.24 (planification gestion d'incident), A.5.25 (qualification) et
> A.5.26 (réponse).

## Quand utiliser ce runbook

Dès qu'un signal incident est reçu :

- alerte Sentry (error rate > seuil, voir `MONITORING_ALERTING.md`)
- ticket helpdesk « le site ne marche pas »
- alerte cron (disque, mémoire, échec backup)
- echec healthcheck (`GET /api/health` ne renvoie plus `status: ok`)
- remontée d'un utilisateur via Teams / mail à `jmorin@omnitech-security.fr`

## Pré-requis

- Accès SSH `root` à la VM Debian 12 hébergeant l'intranet
- Accès admin à Sentry (org/projet OMNITECH)
- Téléphone d'astreinte joignable (RSSI / DSI — voir §Escalade)
- Compte SUPER_ADMIN intranet pour `/admin/system-monitoring`
- Lecture seule sur `/var/log/omnitech/`

## Procédure

### 1. Qualifier la sévérité (matrice P0/P1/P2/P3)

| Niveau | Critère                                                                  | Délai prise en charge | MTTR cible |
|--------|--------------------------------------------------------------------------|-----------------------|------------|
| **P0** | Indisponibilité totale (404/502 sur `/`), perte de données, brèche sécu  | Immédiat (< 5 min)    | < 1 h      |
| **P1** | Service dégradé majeur (auth KO, MFA KO, BDD lente, 5xx > 5%/min)        | < 15 min              | < 4 h      |
| **P2** | Fonctionnalité non critique KO (Meilisearch down, Ollama HS, RAG)        | < 1 h ouvré           | < 1 jour   |
| **P3** | Bug cosmétique, demande utilisateur, optimisation                        | Backlog               | Selon plan |

### 2. Premier diagnostic (5 minutes max)

```bash
# 2.1 — Etat des services systemd
systemctl status omnitech-backend.service omnitech-frontend.service

# 2.2 — Healthcheck applicatif (BunkerWeb passe-plat HTTPS)
curl -sk https://intranet.omnitech-security.fr/api/health | jq .

# Si BunkerWeb est lui-même HS, frapper directement le backend :
curl -s http://localhost:3000/api/health | jq .

# 2.3 — Logs en temps réel
journalctl -u omnitech-backend -f --since "10 min ago"
journalctl -u omnitech-frontend -f --since "10 min ago"

# 2.4 — Ressources VM
df -h /
free -m
uptime
```

### 3. Hypothèses fréquentes & actions

| Symptôme                                           | Cause probable               | Action immédiate                          |
|----------------------------------------------------|------------------------------|-------------------------------------------|
| `services.database: down` dans `/api/health`       | Postgres KO ou pool saturé   | `systemctl status postgresql` + voir §4   |
| `services.redis: up` mais latence > 2s             | Redis OOM                    | `redis-cli INFO memory` + flush ciblé     |
| `502 Bad Gateway` sur tout                         | Backend crashé               | `systemctl restart omnitech-backend`      |
| `Cannot find module` après deploy                  | `pnpm install` incomplet     | `pnpm install --frozen-lockfile` + redémarrer |
| Disque `/` > 90 %                                  | Logs ou uploads engorgés     | `du -sh /var/log/* /root/omnitech-intranet/storage/* | sort -h` |
| MFA `403 MFA_SETUP_REQUIRED` en boucle             | Politique MFA forcée à tort  | Voir `MFA_ENROLLMENT.md` §reset           |

### 4. Confinement

```bash
# Mode maintenance (overlay frontend, opt-in DB) — préserve l'UX vs 502 brut
sudo -u postgres psql -d omnitech_intranet -c \
  "INSERT INTO \"AppConfig\"(key,value) VALUES('maintenance_mode','true') \
   ON CONFLICT (key) DO UPDATE SET value='true';"

# Optionnel : message ETA
sudo -u postgres psql -d omnitech_intranet -c \
  "INSERT INTO \"AppConfig\"(key,value) VALUES('maintenance_return_time','2026-04-25T16:00:00Z') \
   ON CONFLICT (key) DO UPDATE SET value='2026-04-25T16:00:00Z';"
```

### 5. Communication

- P0 / P1 : message Teams canal **#ops-intranet** + mail à `jmorin@omnitech-security.fr`
  dans les 15 min avec : sévérité, périmètre, ETA, prochaine update
- Update toutes les 30 min tant que non résolu
- Post-incident < 48 h : rédiger un PIR (Post-Incident Review) court
  (cause racine, impact, correctif, action préventive)

### 6. Résolution & sortie de maintenance

```bash
# Reactiver l'app
sudo -u postgres psql -d omnitech_intranet -c \
  "UPDATE \"AppConfig\" SET value='false' WHERE key='maintenance_mode';"

# Vérifier que l'overlay disparaît
curl -s https://intranet.omnitech-security.fr/api/health/maintenance | jq .
# attendu : { "maintenance": false }
```

## Vérifications post-action

- `GET /api/health` renvoie `status: ok` sur tous les services attendus `up`
- Pas d'erreur Sentry nouvelle dans les 10 min suivant la résolution
- Login + navigation `/` + `/documents` + `/tickets` OK depuis un compte test
- Audit log : `SELECT * FROM "AuditLog" ORDER BY "createdAt" DESC LIMIT 20;`
- Latence p95 `/api/health` < 1 s (mesurée via `time curl` × 5)

## Rollback

Pour un incident causé par un déploiement récent :

```bash
cd /root/omnitech-intranet
git log --oneline -10                 # repérer le SHA stable précédent
git checkout <sha-stable>
pnpm install --frozen-lockfile
pnpm --filter @omnitech/database prisma:generate
# si la migration Prisma du commit problématique a écrit en DB :
# [À COMPLÉTER PAR L'ÉQUIPE OPS : décider rollback DB ou forward-fix selon
#  la migration concernée — Prisma ne sait pas rollback automatiquement]
systemctl restart omnitech-backend.service omnitech-frontend.service
```

## Escalade

Chaîne ops, dans l'ordre :

1. **DSI / Astreinte infra** (premier interlocuteur 24/7)
   `[À COMPLÉTER PAR L'ÉQUIPE OPS : numéro d'astreinte DSI]`
2. **RSSI** — `jmorin@omnitech-security.fr`
   - obligatoire pour toute suspicion brèche sécu, fuite données, ransomware
3. **Direction** — `[À COMPLÉTER PAR L'ÉQUIPE OPS : contact direction]`
   - dépassement RTO/RPO, P0 > 1 h, activation PCA (cf. `/admin/pca`)
4. **Hébergeur / fournisseurs externes** :
   - DocuSeal, KnowBe4, OnlyOffice : `[À COMPLÉTER PAR L'ÉQUIPE OPS]`

SLA cible : **uptime 99,5 %/an** (~ 43 h d'indispo cumulée tolérée par an).

## Annexes

- Healthcheck endpoints : `/api/health`, `/api/health?check=db`, `/api/health/detailed` (SUPER_ADMIN)
- Page admin temps réel : `https://intranet.omnitech-security.fr/admin/system-monitoring`
- Logs centralisés : `/var/log/omnitech/backend.log` / `/var/log/omnitech/frontend.log`
- Runbooks frères : `DATABASE_BACKUP_RESTORE.md`, `MONITORING_ALERTING.md`,
  `SECRETS_ROTATION.md`, `MFA_ENROLLMENT.md`, `LDAP_SYNC_MANUAL.md`
- Inventaire features livrées : `docs/FEATURES_SHIPPED.md`
