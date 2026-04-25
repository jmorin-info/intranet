# Runbook — Monitoring & alertes production

> Vue d'ensemble du dispositif observabilité de l'intranet OMNITECH Security
> et seuils opérationnels recommandés. Conforme ISO 27001:2022 — A.8.16
> (surveillance des activités).

## Quand utiliser ce runbook

- Mise en place du monitoring sur une nouvelle VM
- Ajustement d'un seuil suite à un incident (post-mortem)
- Audit ISO / RSSI annuel
- Onboarding ops

## Pré-requis

- Sentry activé (cf. `SENTRY_ACTIVATION.md`) pour les erreurs applicatives
- Accès `root` à la VM Debian 12
- `mailutils` installé (`apt install mailutils`) pour les alertes mail
- Adresse mail de l'oncall définie : par défaut `jmorin@omnitech-security.fr`
- (Optionnel) `node_exporter` + Prometheus si supervision externe disponible

## Procédure

### 1. Sources de signal disponibles

| Source                        | Couvre                                           | Comment lire                                  |
|-------------------------------|--------------------------------------------------|-----------------------------------------------|
| Sentry (backend)              | exceptions Nest, 500, jobs failed                | sentry.io → Issues + Alerts                   |
| Sentry (frontend)             | erreurs React, chunk loads, replays sur erreur   | sentry.io → projet frontend                   |
| `journalctl -u omnitech-backend` | logs Pino structurés (pid, requestId, level)  | `journalctl -u omnitech-backend -f`           |
| `/api/health`                 | DB / Redis / SMTP / LDAP / Storage / ClamAV / Meili / Ollama / OnlyOffice | `curl -s /api/health \| jq` |
| `/api/health/detailed`        | pool Postgres, Redis usedMemory, last LDAP sync, disk usage | nécessite SUPER_ADMIN     |
| `/api/health/metrics`         | métriques Prometheus exportables (cf. `MetricsService`) | scrape Prometheus si déployé              |
| Cron alerts (`backup.sh`, `backup-drill.sh`) | échecs sauvegarde / drill          | mail à `${ALERT_EMAIL}`                       |

### 2. Seuils recommandés (à ajuster après baseline 2 semaines)

| Métrique                          | Seuil WARN | Seuil CRIT | Action attendue                              |
|-----------------------------------|------------|------------|----------------------------------------------|
| Disque `/`                        | 70 %       | 85 %       | Purge logs + uploads anciens                 |
| Disque `/var/backups/omnitech`    | 70 %       | 90 %       | Vérifier rétention + copie SMB               |
| RAM libre VM                      | < 1.5 GB   | < 500 MB   | Identifier process gourmand                  |
| Heap Node backend (`memoryUsage().heapUsed`) | 350 MB | 500 MB | Restart contrôlé + investigation fuite     |
| Error rate Sentry (5 min)         | 0.5 %      | 1 %        | Ouvrir incident P1                           |
| Latence p95 `/api/health`         | 500 ms     | 1 s        | Vérifier DB lente, charge Postgres            |
| Connexions Postgres actives       | 30         | 80         | Vérifier `max_connections` et pool Prisma    |
| Sessions Redis usedMemory         | 256 MB     | 512 MB     | Inspect keys, flush ciblé                    |
| Echec backup quotidien            | 1 jour     | 2 jours    | Voir `DATABASE_BACKUP_RESTORE.md`            |
| Drill mensuel KO                  | 1 fois     | 2 fois consécutives | Escalade RSSI                       |

### 3. Alertes Sentry (à configurer dans l'UI)

Settings → Alerts → New Alert Rule (par projet) :

- **Backend — error spike** : trigger si `event.count > 10` sur 5 min,
  destinataires : `${ALERT_EMAIL}`, canal Teams ops.
- **Backend — issue first seen** : nouvelle issue, severity `error` ou +,
  envoi immédiat.
- **Frontend — error spike** : trigger si `event.count > 25` sur 5 min
  (le navigateur est plus bruyant que le serveur).
- **Performance — p95** : si une transaction critique dépasse 1 s en p95
  sur 10 min (`/api/auth/login`, `/api/documents`).

### 4. Cron d'alertes minimal (sans Prometheus)

Si pas de `node_exporter` / Prometheus déployé, mettre en place un cron
système qui surveille disque + RAM et mail si seuils atteints.

```bash
# Editer la cron de root
crontab -e

# Ajouter (toutes les 15 min) :
*/15 * * * * /root/omnitech-intranet/scripts/ops-alert.sh >> /var/log/omnitech/ops-alert.log 2>&1
```

Exemple de script `scripts/ops-alert.sh` à créer
(`[À COMPLÉTER PAR L'ÉQUIPE OPS : valider seuils + ajouter au repo]`) :

```bash
#!/usr/bin/env bash
set -euo pipefail
ALERT_EMAIL="${ALERT_EMAIL:-jmorin@omnitech-security.fr}"
HOST=$(hostname)

# --- Disque /
DISK_PCT=$(df --output=pcent / | tail -1 | tr -dc '0-9')
if [ "${DISK_PCT:-0}" -ge 85 ]; then
  echo "[CRIT] Disque / à ${DISK_PCT}% sur ${HOST}" \
    | mail -s "[OMNITECH][CRIT] Disque saturé" "$ALERT_EMAIL"
fi

# --- RAM libre (MB)
FREE_MB=$(free -m | awk '/^Mem:/ {print $7}')
if [ "${FREE_MB:-0}" -lt 500 ]; then
  echo "[CRIT] Mémoire libre ${FREE_MB} MB sur ${HOST}" \
    | mail -s "[OMNITECH][CRIT] RAM saturée" "$ALERT_EMAIL"
fi

# --- Healthcheck applicatif
HEALTH=$(curl -s --max-time 5 http://localhost:3000/api/health | head -c 200)
if ! echo "$HEALTH" | grep -q '"status":"ok"'; then
  echo "[CRIT] Healthcheck KO sur ${HOST}: ${HEALTH}" \
    | mail -s "[OMNITECH][CRIT] /api/health" "$ALERT_EMAIL"
fi
```

Rendre le script exécutable : `chmod +x /root/omnitech-intranet/scripts/ops-alert.sh`.

### 5. Logs centralisés

Les unités systemd écrivent dans :

- `/var/log/omnitech/backend.log` (append, rotation à mettre en place)
- `/var/log/omnitech/frontend.log` (idem)

Activer la rotation (logrotate) si pas encore fait :

```bash
# Créer /etc/logrotate.d/omnitech avec :
cat <<'EOF' | tee /etc/logrotate.d/omnitech
/var/log/omnitech/*.log {
    daily
    rotate 14
    compress
    delaycompress
    missingok
    notifempty
    copytruncate
    su root root
}
EOF
```

Vérifier : `logrotate -d /etc/logrotate.d/omnitech` (dry-run).

## Vérifications post-action

- `crontab -l` montre bien les entrées `backup.sh`, `backup-drill.sh`, `ops-alert.sh`
- `mail` envoie bien (`echo test | mail -s test ${ALERT_EMAIL}`) → mail reçu
- Sentry → Alerts liste au moins 4 règles actives
- `/var/log/omnitech/*.log` rotates après 24 h (vérifier `.1.gz`)
- Une alerte de test (ex: simuler `df` à 90 % via mock) déclenche bien un mail
  `[À COMPLÉTER PAR L'ÉQUIPE OPS : runbook de chaos test trimestriel]`

## Rollback

Pour désactiver le cron d'alertes (ex: faux positifs en série) :

```bash
crontab -e
# Commenter la ligne ops-alert.sh
```

Pour désactiver une règle Sentry : Settings → Alerts → toggle Disable
(préserve la config, simple flip).

## Escalade

- Volume d'alertes mail > 20/jour → réviser les seuils, RSSI prévenu
- Echec d'envoi mail (`mail` non installé / SMTP KO) → DSI : configurer relais
- Sentry quota dépassé → ajuster `SENTRY_TRACES_SAMPLE_RATE` à 0.05 puis 0

## Annexes

- Métriques Prometheus exportées : `apps/backend/src/health/metrics.service.ts`
- Healthcheck : `apps/backend/src/health/health.controller.ts`
- Page admin temps réel : `/admin/system-monitoring`
- Sentry config : voir `SENTRY_ACTIVATION.md`
- Audit ISO 27001 A.8.16 : conserver les logs > 6 mois (à confirmer RSSI)
