# UEBA — Détection comportementale (Item 28)

> Wave D — module `behavior-detection` — cron 5 min, règles R001..R008

## Objectif

Détecter en quasi temps réel les comportements anormaux des utilisateurs
(User Entity Behavior Analytics) pour prévenir les compromissions de comptes,
les exfiltrations de données et les escalades de privilèges. Le système
fonctionne par **règles statistiques** explicites (pas de ML) calibrées sur la
charge typique d'un intranet ~100 users.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     AuditLog (Postgres)                     │
│   LOGIN_SUCCESS / LOGIN_FAILED / DOCUMENT_DOWNLOADED ...    │
└─────────────────────┬───────────────────────────────────────┘
                      │ groupBy / findMany
                      ▼
        ┌─────────────────────────────────────┐
        │  BehaviorDetectionService           │
        │  @Cron EVERY_5_MINUTES              │
        │                                      │
        │  1. bootstrap rules (idempotent)    │
        │  2. for each enabled BehaviorRule:  │
        │     evalRxxx(rule, threshold)       │
        │  3. createAlertIfNotDeduped(...)    │
        │  4. notifyRssi(alert) si HIGH+      │
        └─────────────┬───────────────────────┘
                      ▼
        ┌─────────────────────────────────────┐
        │  BehaviorAlert (Postgres)           │
        │  status NEW → ACK → RESOLVED|FP     │
        │  evidence JSON (auditLogIds, IPs..) │
        └─────────────┬───────────────────────┘
                      ▼
        ┌─────────────────────────────────────┐
        │  /admin/security/behavior-alerts    │
        │  /admin/security/behavior-rules     │
        └─────────────────────────────────────┘
```

## Catalogue des règles

| Code | Nom | Sévérité par défaut | Seuils par défaut |
|------|-----|---------------------|-------------------|
| R001 | Login bursty multi-IP | HIGH | >10 logins / 3 IPs / 10min |
| R002 | Off-hours access | MEDIUM | login 22h-06h UTC + historique 9h-19h sur 30j |
| R003 | Document download burst | HIGH | >50 téléchargements / 5min |
| R004 | Geographic anomaly | CRITICAL | >1000km / 1h (ou /16 distincts si pas de geolite) |
| R005 | Failed login spike | HIGH | >20 LOGIN_FAILED / user / 15min |
| R006 | Privilege escalation suspicion | CRITICAL | role change + admin action <1min |
| R007 | Sensitive bulk download | CRITICAL | >5 docs CONFIDENTIEL/SECRET / 10min |
| R008 | MFA brute force | HIGH | >10 MFA failures / user / 5min |

Tous les seuils sont **persistés en base** (`BehaviorRule.threshold` JSON) et
modifiables sans redéploiement par un SUPER_ADMIN via
`PATCH /admin/behavior-rules/:code`.

## Modèle de données

- **BehaviorRule** — 1 ligne par code (R001..R008). `enabled`, `threshold`,
  `severity` éditables.
- **BehaviorAlert** — 1 ligne par incident détecté. `status` workflow
  `NEW → ACKNOWLEDGED → RESOLVED|FALSE_POSITIVE`. `evidence` JSON contient
  `auditLogIds`, IPs, timestamps, breakdown du score.

Voir `packages/database/prisma/schema.prisma` (sections BehaviorAlert et
BehaviorRule, ~ligne 2632).

## Dédoublonnage

Pour éviter de créer 100 alertes pour le même incident, `createAlertIfNotDeduped`
regarde s'il existe déjà une alerte `(ruleCode, userId)` en `NEW` ou
`ACKNOWLEDGED` créée dans la fenêtre `windowSeconds` de la règle. Si oui → skip.

## Notifications RSSI

Sur HIGH ou CRITICAL : tous les `SUPER_ADMIN` actifs + tous les users dont
l'email contient `rssi` sont notifiés via `NotificationsService.create({
type: "SECURITY_ALERT" | "ALERT_CRITICAL", ... })`. Ces types sont dans
`EMAIL_ALWAYS_SEND_TYPES` côté NotificationsService → email forcé même si le
user a coupé ses notifs.

MEDIUM/LOW restent visibles dans le dashboard sans bombarder les RSSI.

## Calibration

> Une règle qui produit > 1 alerte/jour en moyenne sur > 1 mois est considérée
> bruyante et doit être recalibrée.

Procédure :
1. Aller dans `/admin/security/behavior-rules`.
2. Cliquer "Éditer seuils" sur la règle bruyante.
3. Augmenter le seuil (ex `minLogins: 10 → 15`).
4. Observer 7 jours. Itérer.

## Observabilité

Chaque tick cron logge en JSON structuré :

```json
{ "msg": "behavior-detection.tick", "durationMs": 234, "rulesEvaluated": 8, "alertsCreated": 0, "errors": 0 }
```

Une règle qui throw : `behavior-detection.rule.failed` avec `ruleCode` et
`error` — n'arrête pas les autres règles.

## Kill switch d'urgence

`BEHAVIOR_DETECTION_ENABLED=false` dans l'env → le cron return immédiatement.
À utiliser uniquement si une règle bloque la prod (ex bug de query Postgres
qui mange du CPU).

## Tests

`apps/backend/src/behavior-detection/behavior-detection.service.spec.ts` :

- 8 fixtures (R001..R008) avec datasets minimal Prisma stubbed
- Vérifie création d'alerte avec evidence correcte
- Vérifie absence d'alerte sous le seuil
- Vérifie notif RSSI sur HIGH/CRITICAL et silence sur MEDIUM
- Vérifie dédup (alerte récente → skip)
- Vérifie résilience (1 règle qui throw n'arrête pas les autres)
- Bonus : haversineKm

## Roadmap (post-Wave D)

- R009+ : règles supplémentaires (APT-style, lateral movement)
- ML : détection d'anomalie statistique (isolation forest) en complément des
  règles statiques
- Intégration SIEM externe (Splunk/Wazuh) via webhook `BehaviorAlert.created`
- Geolite2 par défaut : packager la lib en image docker pour avoir R004 actif
  out-of-the-box (aujourd'hui fallback IP /16)
