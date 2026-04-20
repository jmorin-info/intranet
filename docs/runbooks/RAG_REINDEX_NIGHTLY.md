# Runbook — RAG reindex nocturne

**Créé** : 2026-04-20 (Mission 3 Phase 1 Étape 1.6)
**Type** : cron automatique via `@nestjs/schedule`
**Fréquence** : tous les jours à **01:00 Europe/Paris**
**Fichier** : `apps/backend/src/rag/rag-reindex.scheduler.ts`

## Pourquoi

Le pipeline RAG indexe les documents, wiki pages, runbooks, FAQ avec leurs
métadonnées (titre, référence, **classification** depuis Mission 2 polish chatbot).
Les chunks créés **avant** l'ajout du champ `classification` dans
`indexSource` (commit `96fae5f`, 2026-04-20) ne portent pas cette info ;
le badge `ClassificationBadge` dans le popover des citations du chatbot
reste masqué pour ces chunks.

Ce cron répare ça en **réindexant tout** tous les jours à 01h, fenêtre où
aucun utilisateur n'est actif (testeurs + RSSI uniquement en journée).

## Fonctionnement

- `@Cron('0 1 * * *', { timeZone: 'Europe/Paris' })` sur `RagReindexScheduler.reindexNightly`
- Appelle `RagService.reindexAll()` existant (même logique que l'endpoint admin `POST /rag/reindex`)
- Log via `Logger('RagReindexScheduler')` :
  - `rag.reindex.nightly.start`
  - `rag.reindex.nightly.done — Xms, indexed={DOCUMENT:N, WIKI:N, ...}, errors=N`
  - `rag.reindex.nightly.errors` si des erreurs surviennent (5 premières loggées)

## Vérifier la dernière exécution

```bash
# Logs systemd du backend
journalctl -u omnitech-backend --since "yesterday" | grep rag.reindex

# Ou pour le log de la journée en cours
journalctl -u omnitech-backend --since today | grep -E "rag\.reindex\.(start|done|errors)"
```

Résultat attendu (healthy) :
```
rag.reindex.nightly.start
rag.reindex.nightly.done — 12345ms, indexed={"DOCUMENT":143,"WIKI":59,...}, errors=0
```

## Désactiver temporairement

**Option A — commenter le décorateur** (redémarrage backend requis) :

```ts
// @Cron('0 1 * * *', { name: 'rag-reindex-nightly', timeZone: 'Europe/Paris' })
async reindexNightly(): Promise<void> {
```

Puis :
```bash
cd apps/backend && pnpm build && systemctl restart omnitech-backend
```

**Option B — kill-switch env var** (TODO Phase 2 si besoin fréquent) : ajouter
`RAG_REINDEX_NIGHTLY_ENABLED=false` et early-return dans la méthode.

## Déclenchement manuel

Endpoint admin existant, pas besoin d'un endpoint dédié :

```bash
# Login SUPER_ADMIN requis (role ADMIN ne suffit pas pour reindex)
JWT="<bearer_token_super_admin>"

curl -X POST \
  -H "Authorization: Bearer $JWT" \
  http://localhost:3000/api/v1/rag/reindex

# Retour : { "indexed": { DOCUMENT: N, WIKI: N, ... }, "errors": [...] }
```

## Rollback / désinstallation

Si l'on veut supprimer complètement ce cron :

1. Supprimer `apps/backend/src/rag/rag-reindex.scheduler.ts`
2. Retirer `RagReindexScheduler` des `providers` dans `apps/backend/src/rag/rag.module.ts`
3. `pnpm build && systemctl restart omnitech-backend`

Aucune trace résiduelle en DB (le cron n'écrit que des logs stdout).

## Impact performance

Reindex complet = écrire ~1000 chunks (docs + wiki + runbook + FAQ). Temps
observé à la première exécution : **~30s-2min** selon le volume. Fenêtre
01h00-01h05 = aucun utilisateur, charge serveur nulle ailleurs.

**Ollama impact** : le reindex ne sollicite PAS Ollama (seules les
métadonnées sont rafraîchies, pas les embeddings — voir `RagService.indexSource`).
Si l'ajout d'embeddings semantic est activé plus tard dans le reindex,
reconsidérer la fenêtre temporelle (peut prendre 10-30 min).
