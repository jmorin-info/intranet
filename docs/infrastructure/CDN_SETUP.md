# CDN — Setup pour assets statiques (Item 32)

OMNITECH Intranet — Vague B post-launch.
Externalise les assets statiques Next.js (`_next/static/*`, fonts, images,
JS chunks) vers un CDN pour réduire la latence des utilisateurs distants
(Bordeaux et autres sites) et soulager le frontend Next.js sur 10.33.120.55.

## Fournisseur recommandé : Bunny.net

| Critère | Bunny.net | Cloudflare R2 + CDN |
|---|---|---|
| Souveraineté EU | OUI — DC en Slovénie / Falkenstein (DE), trafic 100% EU | NON — peering global, US possible |
| Conformité RGPD | OUI — DPA signé EU, sous-processeurs EU | DPA OK mais routing imprévisible |
| Pricing | ~$0.01/GB transfert + $0.01/GB storage (~ $5/mois pour 100 users) | $0.015/GB egress + $0 pour 10 GB / mois R2 |
| Image Optimizer | OUI (Pull Zone option) — `?width=&format=webp` natif | OUI (Image Resizing) — syntaxe `/cdn-cgi/image/...` |
| API purge | Simple (REST + AccessKey) | OAuth + zone tokens |
| Lock-in | Faible (HTTP standard, S3 compat sur Storage Zone) | Faible (S3 compat sur R2) |
| Latence FR | Excellente (~10 ms) | Excellente (~5 ms via Anycast) |

**Recommandation : Bunny.net** — souveraineté EU + transparence pricing >
gain marginal de latence Cloudflare. Cloudflare reste documenté ici comme
alternative si OMNITECH change de stratégie.

## Architecture

```
                                    +-------------------+
                                    |  Bunny Pull Zone  |
                                    |  (CDN edge cache) |
                                    |  cdn.intranet.…   |
                                    +---------^---------+
                                              |  miss → fetch
                                              v
                                    +-------------------+
                                    | Bunny Storage Zone|
                                    | (origin S3-like)  |
                                    +---------^---------+
                                              |  PUT /_next/static/*
                                              |  (CI / deploy script)
                                              |
+---------+   1. assetPrefix=cdn.…    +-------+------+
| Browser |---------------------------> Build (Next.js)|
+---------+   2. fetch /_next/static/abc123.js
                                    via cdn.intranet.…
```

L'origine (frontend Next.js + nginx BunkerWeb) reste en place et continue
de servir `/_next/static/*` en interne — fallback si le CDN est down (cf.
runbook plus bas).

## Setup Bunny — pas-à-pas

### 1. Création des zones

1. Créer un compte sur https://dash.bunny.net
2. **Storage Zone** (origin) :
   - Name : `omnitech-intranet`
   - Storage region : `Slovenia` (defaut, EU) ou `Falkenstein, DE`
   - Replication : laisser vide (1 région suffit pour 100 users)
   - Récupérer la **Password** (write key) → secret `BUNNY_STORAGE_PASSWORD`
3. **Pull Zone** (CDN) :
   - Name : `omnitech-intranet`
   - Origin Type : `Storage Zone` → sélectionner la zone créée ci-dessus
   - Pricing tier : `Standard` (suffit pour intranet FR)
   - Image Optimizer : activer (option payante ~$10/mo, justifié si on
     utilise Next/Image avec le custom loader)
   - Récupérer le **Pull Zone ID** (visible dans l'URL ou via API)

### 2. DNS

Créer un enregistrement DNS dans la zone `omnitech-security.fr` :

```
cdn.intranet.omnitech-security.fr   CNAME   omnitech-intranet.b-cdn.net.
```

Bunny propose un certificat SSL gratuit (Let's Encrypt) pour les hostnames
custom. Activer dans Pull Zone → Hostnames → Add `cdn.intranet.omnitech-security.fr`
→ Force SSL.

### 3. API Key

- Account → API → **Account API Key** (read+write) → secret `CDN_PURGE_TOKEN`
  (utilisé pour purger le cache Pull Zone après deploy)

### 4. Variables d'env (server)

Voir `.env.example` :

```
NEXT_PUBLIC_CDN_URL=https://cdn.intranet.omnitech-security.fr
CDN_PROVIDER=bunny
BUNNY_STORAGE_ZONE=omnitech-intranet
BUNNY_STORAGE_PASSWORD=<secret>
BUNNY_STORAGE_ENDPOINT=storage.bunnycdn.com
BUNNY_PULL_ZONE_ID=<id>
CDN_PURGE_TOKEN=<secret>
```

En prod (Docker Compose), stocker `BUNNY_STORAGE_PASSWORD` et
`CDN_PURGE_TOKEN` comme Docker secrets dans `./secrets/` (cf.
`docs/infrastructure/DOCKER_COMPOSE_PROD.md`).

### 5. Variables GitHub Actions

Pour activer le sync CI automatique sur push main :

- Settings → Secrets and variables → Actions :
  - **Variables** (publiques, OK lisibles dans logs) :
    - `NEXT_PUBLIC_CDN_URL` = `https://cdn.intranet.omnitech-security.fr`
    - `CDN_PROVIDER` = `bunny`
    - `BUNNY_STORAGE_ZONE` = `omnitech-intranet`
    - `BUNNY_PULL_ZONE_ID` = `1234567`
  - **Secrets** (chiffrés, jamais loggués) :
    - `BUNNY_STORAGE_PASSWORD`
    - `CDN_PURGE_TOKEN`

Si `NEXT_PUBLIC_CDN_URL` n'est PAS défini, le workflow `cdn-sync.yml`
skippe automatiquement (rétrocompat preprod sans CDN).

## Déploiement

### Manuel (depuis un poste opérateur)

```bash
# Depuis la racine du repo
export NEXT_PUBLIC_CDN_URL=https://cdn.intranet.omnitech-security.fr
export CDN_PROVIDER=bunny
export BUNNY_STORAGE_ZONE=omnitech-intranet
export BUNNY_STORAGE_PASSWORD=<secret>
export BUNNY_PULL_ZONE_ID=<id>
export CDN_PURGE_TOKEN=<secret>

pnpm --filter frontend build
./scripts/deploy-cdn-assets.sh
```

Le script :
1. Vérifie le build artefact (`apps/frontend/.next/static/`)
2. Crée un fichier témoin `check.txt` (commit + timestamp)
3. Upload via PUT HTTPS vers la Storage Zone (deduplication automatique)
4. Purge le cache Pull Zone (best-effort)
5. Smoke test : fetch du fichier témoin via `cdn.intranet.…`

### Automatique (GitHub Actions)

Push sur `main` → workflow `cdn-sync.yml` se déclenche automatiquement.
Si le workflow échoue (upload partiel, purge KO), les nouveaux assets
peuvent être servis stales jusqu'à expiration TTL — voir runbook.

## Cache busting

Next.js gère le cache busting via les hash de filename
(`_next/static/chunks/abc123def.js`). Sur un changement de code, le
nouveau bundle est uploadé avec un nouveau hash → les browsers chargent
la nouvelle version sans purge nécessaire.

**TTL recommandé sur Bunny Pull Zone** :
- `_next/static/*` → `Cache-Control: public, max-age=31536000, immutable`
  (déjà émis par Next.js — vérifier que Bunny respecte ; sinon override
  via Pull Zone → Edge Rules → Match `/_next/static/*` → Set Cache-Control).
- `public/*` (favicons, images statiques) → `max-age=86400` (1 jour).

Le script `deploy-cdn-assets.sh` ne touche PAS au TTL côté Bunny — c'est
configuré une fois pour toutes via le dashboard ou l'API Pull Zone.

## Monitoring

- **Endpoint** `GET /api/v1/health/cdn` (public) :
  ```json
  {
    "status": "up",        // up | down | degraded | not_configured
    "cdnUrl": "https://cdn.intranet.omnitech-security.fr",
    "provider": "bunny",
    "latencyMs": 45,
    "checkedAt": "2026-04-26T10:00:00Z"
  }
  ```
- L'agrégat `GET /health` (services) inclut `services.cdn = "up"` aussi
  (HEAD only, plus rapide).
- Frontend admin : `/admin/system-health` consomme `/health` via
  `useHealthStore` — ajouter une carte "CDN" si nécessaire (TODO Wave C).

## Runbook — incident CDN

### Symptôme : `services.cdn = "down"` dans `/health`

1. **Vérifier l'origine du problème** :
   ```bash
   curl -v https://cdn.intranet.omnitech-security.fr/_next/static/check.txt
   ```
   - 5xx Bunny → incident côté CDN (https://status.bunny.net)
   - DNS NXDOMAIN → problème DNS local (vérifier resolveur intranet)
   - Timeout → routing / pare-feu vers Internet

2. **Bascule rapide vers l'origine** (sans rebuild) :

   Option A — déployer une nouvelle config sans CDN :
   ```bash
   # Sur le serveur 10.33.120.55
   ssh root@10.33.120.55
   cd /opt/omnitech
   sed -i 's|^NEXT_PUBLIC_CDN_URL=.*|NEXT_PUBLIC_CDN_URL=|' .env.prod
   docker compose -f docker-compose.prod.yml up -d --build frontend
   ```
   Le rebuild est nécessaire car `assetPrefix` est figé à build-time.
   Durée : ~5 min.

   Option B — fallback nginx (sans rebuild) :
   - Pointer le DNS `cdn.intranet.omnitech-security.fr` vers `intranet.omnitech-security.fr`
   - nginx route automatiquement les `/_next/static/*` (la location existe déjà)
   - + créer une location alias `/cdn-fallback/*` (déjà présente dans nginx.conf)

3. **Post-mortem** :
   - Vérifier les logs Bunny : Dashboard → Logs / Statistics
   - Re-uploader si Storage Zone purgée par erreur :
     `./scripts/deploy-cdn-assets.sh`
   - Purge cache : `curl -X POST -H "AccessKey: $CDN_PURGE_TOKEN" https://api.bunny.net/pullzone/$BUNNY_PULL_ZONE_ID/purgeCache`

### Symptôme : assets stales après deploy

```bash
# Force purge complète Pull Zone
curl -X POST \
  -H "AccessKey: $CDN_PURGE_TOKEN" \
  https://api.bunny.net/pullzone/$BUNNY_PULL_ZONE_ID/purgeCache
```

ou via dashboard : Pull Zone → Purge Cache.

## Estimation coûts (Bunny)

Hypothèses :
- 100 utilisateurs actifs concurrents
- ~500 MB d'assets statiques (Next bundle + fonts + images publiques)
- 10 deploys/mois (= ~5 GB d'upload total compte tenu du delta)
- Trafic egress : ~50 GB/mois (visites quotidiennes, navigation
  intra-app, polling /health avec assets re-fetchés en cache miss)

| Poste | Quantité | Tarif | Coût |
|---|---|---|---|
| Storage Zone (Slovénie) | 0.5 GB | $0.01/GB/mois | $0.005 |
| Storage Zone (transfert in) | 5 GB | gratuit | $0 |
| Pull Zone (Standard, EU) | 50 GB | $0.01/GB | $0.50 |
| Image Optimizer (option) | ~10K req | $9.50/mois forfait | $9.50 |
| API requests (purge, list) | ~100/mois | gratuit | $0 |
| **Total mensuel sans Image Opt.** | | | **~$0.50** |
| **Total mensuel avec Image Opt.** | | | **~$10.00** |

À comparer au coût de la bande passante intranet → BunkerWeb actuel
(serveur 10.33.120.55) : non mesuré mais probablement supérieur sur le
chemin Bordeaux ↔ siège.

Cloudflare R2 + CDN équivalent : ~$0 (10 GB R2 free tier) + $4-5
egress, mais routing US-EU peering moins prévisible.

## Points d'attention review

1. **Fallback origine** : la location `/_next/static/*` reste active
   dans `nginx/nginx.conf` même quand le CDN est en place. Si on retire
   `NEXT_PUBLIC_CDN_URL` du build, les browsers retomberont automatiquement
   sur l'origine sans changement nginx.
2. **CSP** : `connect-src` et `img-src` actuels n'incluent PAS le domaine
   CDN (cf. `nginx/nginx.conf` ligne ~156 et `apps/frontend/src/middleware.ts`).
   Avant d'activer en prod, ajouter `https://cdn.intranet.omnitech-security.fr`
   à `script-src`, `style-src`, `font-src`, `img-src`, `connect-src`.
   Wave C : faire passer ça via une PR séparée.
3. **CORS sur Bunny** : Pull Zone → CORS → `Access-Control-Allow-Origin: *`
   par défaut, vérifier OK pour les fonts (CORS strict côté Firefox sinon
   les fonts woff2 ne chargent pas).
4. **Source maps Sentry** : si `hideSourceMaps: true` dans next.config.js,
   les `.map` ne sont pas servis publiquement → toujours OK avec CDN.
   Si on change cette policy, vérifier que les .map ne fuient PAS via le CDN.
5. **assetPrefix figé au build** : un changement de CDN (ex: bascule vers
   Cloudflare) nécessite un rebuild Next.js. Ne PAS espérer un swap à chaud.
6. **Path traversal** : `/cdn-fallback/*` proxy vers le frontend — la
   regex `^/cdn-fallback/(.*)$` extrait le path tel quel. nginx est
   safe ici (pas d'eval), mais vérifier qu'aucune route applicative ne
   vit sous `/cdn-fallback` côté Next.

## Checklist activation production

- [ ] Storage Zone Bunny créée + Pull Zone configurée
- [ ] DNS `cdn.intranet.omnitech-security.fr` → CNAME Bunny
- [ ] Cert SSL Bunny actif (Force SSL ON)
- [ ] Variables `BUNNY_*` + `CDN_*` ajoutées à `.env.prod` + Docker secrets
- [ ] Variables GitHub Actions ajoutées (vars + secrets)
- [ ] Premier upload manuel testé : `./scripts/deploy-cdn-assets.sh`
- [ ] CSP mise à jour (nginx + middleware) pour autoriser le domaine CDN
- [ ] `/api/v1/health/cdn` retourne `{ status: "up" }` après deploy
- [ ] Test smoke : ouvrir intranet, DevTools → Network → vérifier que
      `/_next/static/*` est servi par `cdn.intranet.…`
- [ ] Runbook fallback testé (basculer Pull Zone OFF + vérifier que
      l'origine reprend en moins de 5 min)
