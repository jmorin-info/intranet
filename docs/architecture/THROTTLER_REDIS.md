# Throttler Redis Storage

> Item 15 — Vague A v1.1. Bascule du storage in-memory de `@nestjs/throttler`
> vers Redis pour garantir un rate limiting cohérent en multi-instance.

## Contexte

Avant ce changement, `ThrottlerModule.forRoot` utilisait l'implémentation
par défaut `ThrottlerStorageService` (in-memory). Conséquences :

- En mode multi-instance (load-balancer, blue/green, autoscale), chaque
  process avait son propre compteur. Un attaquant pouvait répartir ses
  requêtes sur N instances et obtenir N × `THROTTLE_LIMIT` requêtes/min
  effectives au lieu de la limite annoncée.
- Au moindre redémarrage (déploiement, OOM, reload nginx), les compteurs
  étaient réinitialisés. Un attaquant pouvait déclencher artificiellement
  un rolling restart pour contourner les limites burst-courtes (ex: tentatives
  de login).

## Architecture cible

```
                   ┌────────────────────────┐
   ┌────────┐      │  RedisThrottlerStorage │
   │  HTTP  │─────▶│   (apps/backend/src/   │
   │ Guard  │      │   common/throttler/)   │
   └────────┘      │                        │
       ▲           │  ┌──────────────────┐  │
       │           │  │  Pipeline Redis  │  │
       │           │  │  INCR + PEXPIRE  │──┼─────▶ Redis (single source of truth)
       │           │  └──────────────────┘  │
       │           │                        │
       │           │  ┌──────────────────┐  │
       │ fallback  │  │  In-memory Map   │  │
       └───────────┼─▶│  (instance-local)│  │   ⚠ INCOHÉRENT inter-instance
                   │  └──────────────────┘  │     mais service ne tombe pas
                   └────────────────────────┘
```

### Algorithme

Pour chaque requête entrant dans un endpoint guardé par
`ThrottlerGuard` (ou un descendant comme `UserThrottlerGuard`) :

1. Le guard appelle `storage.increment(key, ttl, limit, blockDuration, name)`.
2. `RedisThrottlerStorage.increment` exécute un pipeline Redis atomique :
   - `INCR <key>` : incrémente le compteur (création si absent).
   - `PEXPIRE <key> <ttl> NX` : pose le TTL si la clé est nouvelle, sinon ne
     touche pas au TTL existant (sliding-window équivalent à l'in-memory
     officiel).
   - `PTTL <key>` : récupère le temps restant.
   - `PTTL <key>:blocked` : récupère le temps de blocage restant si déjà bloqué.
3. Si `totalHits > limit` ET pas encore bloqué, on pose `<key>:blocked` avec
   TTL = `blockDuration`. Tant que cette clé existe, `isBlocked=true` et le
   guard renvoie HTTP 429.

### Format des clés

Le `UserThrottlerGuard` génère :
```
throttle:user:<tracker>:<Class>.<handler>:<throttlerName>
```

Le préfixe Redis (`throttle:`) est ajouté par `RedisThrottlerStorage` avant
écriture. Exemple complet :
```
throttle:throttle:user:user:abc-123:AuthController.login:default
```

(Le double `throttle:` provient de la concaténation préfixe-storage + nom
de tracker hérité de l'in-memory officiel — non gênant fonctionnellement,
juste verbeux dans Redis.)

## Configuration

### Variables d'environnement

| Variable | Défaut | Description |
|---|---|---|
| `THROTTLE_TTL` | `60000` | Fenêtre glissante en ms (1 min). Inchangé. |
| `THROTTLE_LIMIT` | `300` | Hits max par fenêtre. Inchangé. |
| `THROTTLER_REDIS_URL` | _(vide)_ | URL Redis dédiée. Si vide → fallback sur `REDIS_URL` ou `REDIS_HOST/PORT/PASSWORD`. |
| `REDIS_URL` | _(vide)_ | URL Redis générique réutilisée pour BullMQ, cache, throttler. |
| `REDIS_HOST` | `localhost` | Host Redis (utilisé si pas d'URL complète). |
| `REDIS_PORT` | `6379` | Port Redis. |
| `REDIS_PASSWORD` | _(vide)_ | Mot de passe Redis. |
| `THROTTLER_REDIS_REQUIRED` | `false` | Si `true` → fail-closed (HTTP 429 systématique si Redis est down). |

### Production recommandée

```bash
# Si vous avez un Redis dédié au throttling (sinon réutilisez REDIS_URL) :
THROTTLER_REDIS_URL=redis://:STRONG_PASSWORD@redis-throttle.internal:6379/2
THROTTLER_REDIS_REQUIRED=false  # commencer en fail-open puis durcir
```

Activer `THROTTLER_REDIS_REQUIRED=true` une fois la stabilité Redis vérifiée
en prod (typiquement après 1 mois sans incident sur le cluster Redis).

## Fail-open vs Fail-closed

| Mode | Comportement si Redis down | Trade-off |
|---|---|---|
| **Fail-open** (défaut) | Fallback in-memory → service fonctionne mais rate limit dégradé inter-instance | Disponibilité ✅ — Sécurité ⚠ |
| **Fail-closed** | Toutes les requêtes guardées → HTTP 429 | Sécurité ✅ — Disponibilité ⚠ (DoS auto-infligé si Redis flap) |

Recommandation par environnement :
- **dev / staging** : fail-open (`THROTTLER_REDIS_REQUIRED=false`).
- **prod sensible** : fail-open les premiers mois, puis fail-closed après
  monitoring stable.

## Healthcheck

`/api/v1/health` expose maintenant `services.throttlerRedis` avec les
valeurs suivantes :

| État | Signification |
|---|---|
| `up` | Redis joignable, compteurs centralisés. |
| `degraded` | Redis injoignable mais fallback in-memory actif. Multi-instance INCOHÉRENT. |
| `down` | Mode fail-closed activé et Redis injoignable → toutes les requêtes guardées sont bloquées. |
| `not_configured` | `RedisThrottlerStorage` non injecté (test/dev sans health). |

Check ciblé : `GET /api/v1/health?check=throttler-redis`.

## Runbook : opérations courantes

### Vider tous les compteurs (incident, faux positif sur un user)

Solution programmatique (à appeler depuis un endpoint admin ou un script
de runbook) :

```ts
import { getSharedThrottlerStorage } from 'src/health/health.module';
const storage = getSharedThrottlerStorage();
await storage.clearCounters();
```

Solution Redis directe (cluster Ops) :

```bash
# Sur le Redis Throttler :
redis-cli --scan --pattern 'throttle:*' | xargs -L 100 redis-cli DEL
```

ATTENTION : pendant la purge, certains users peuvent enchaîner plus de
requêtes que la limite normale (compteur partiellement reset). Effet
acceptable pour un opérateur qui sait ce qu'il fait.

### Diagnostiquer un user bloqué injustement

```bash
# Liste les compteurs pour un user donné :
redis-cli --scan --pattern 'throttle:throttle:user:user:<USER_ID>:*'

# Inspecter un compteur :
redis-cli GET 'throttle:throttle:user:user:<USER_ID>:AuthController.login:default'
redis-cli PTTL 'throttle:throttle:user:user:<USER_ID>:AuthController.login:default'

# Vérifier l'état "blocked" :
redis-cli PTTL 'throttle:throttle:user:user:<USER_ID>:AuthController.login:default:blocked'

# Débloquer manuellement (efface compteur + blocked key) :
redis-cli DEL 'throttle:throttle:user:user:<USER_ID>:AuthController.login:default'
redis-cli DEL 'throttle:throttle:user:user:<USER_ID>:AuthController.login:default:blocked'
```

### Migrer Redis (changement de host)

1. Mettre à jour `THROTTLER_REDIS_URL` dans le `.env` de toutes les instances.
2. Rolling restart des backends (durée ≤ TTL = 60s recommandée) :
   pendant le rolling, des compteurs frais seront créés sur le nouveau
   Redis ; les anciens expireront naturellement après `THROTTLE_TTL`.
3. Vérifier `/health?check=throttler-redis` retourne `up` sur chaque instance.
4. Drain l'ancien Redis (optionnel : `FLUSHDB`).

### Audit : observabilité

Chaque dépassement de limite est logué dans `audit_log` avec
`action=RATE_LIMIT_EXCEEDED, severity=WARN`. Filtre Grafana / RSSI :

```sql
SELECT user_id, ip_address, metadata->>'route' AS route, COUNT(*)
FROM audit_log
WHERE action = 'RATE_LIMIT_EXCEEDED'
  AND created_at > NOW() - INTERVAL '24 hours'
GROUP BY 1, 2, 3
ORDER BY 4 DESC
LIMIT 50;
```

## Tests

`apps/backend/src/common/throttler/redis-throttler.storage.spec.ts` couvre :
- incrément simple, dépassement (`isBlocked` après `limit+1`),
- persistance cross-instance ("restart" simulé via partage du même client),
- fallback in-memory transparent (Redis down, mode fail-open),
- mode fail-closed (`THROTTLER_REDIS_REQUIRED=true`),
- erreur transitoire Redis pendant `multi.exec` (auto-fallback).

Lancer : `pnpm --filter @omnitech/backend test redis-throttler`.

## Compatibilité versions

- `@nestjs/throttler@6.5.0` : OK (interface `ThrottlerStorage` stable).
- `ioredis@5.10.1` : OK (utilise `multi/incr/pexpire/pttl/scan/del`).

Si la version `@nestjs/throttler@7.x` casse l'interface, mettre à jour la
signature de `RedisThrottlerStorage.increment` (le storage est
volontairement isolé du reste pour faciliter ce remplacement).
