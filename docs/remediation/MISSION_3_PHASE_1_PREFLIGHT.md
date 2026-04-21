# Mission 3 Phase 1 — Préflight check

**Date** : 2026-04-20 22:00 (Europe/Paris)
**Opérateur** : Claude Code
**Branche** : `feat/chatbot-unified-backend`
**HEAD** : `592daa9` (commit backup)

## Résultats des 6 vérifications

### 1. État git ✅

- Working tree clean (seulement untracked : `bundles/`, `infra/bunkerweb.env` — pré-existants et hors scope)
- Sur branche `feat/chatbot-unified-backend`
- Pas de merge conflict

### 2. État Prisma ❌ **BLOCKER**

- **Table `_prisma_migrations` absente** de la base.
- **68 tables existantes** (dont `AccessReviewCampaign`, `ItExport`, `PushSubscription`, etc. qui correspondent à des migrations datées 2026-04-10/11).
- **16 migrations listées comme "not yet applied"** par `pnpm prisma migrate status`.

**Diagnostic** : la base a été construite via `prisma db push` (sync direct du schéma) au démarrage du projet, jamais bootée sur le système `migrate`. Les migrations Prisma existent dans `packages/database/prisma/migrations/` comme documentation/historique, mais ne sont pas tracées côté DB.

**Impact sur Mission 3** : `pnpm prisma migrate dev --create-only --name add_chat_unified_models` va tenter d'appliquer les 16 migrations "pending" d'abord, ce qui causera des conflits `relation already exists` ou **recréera des tables avec perte de données**.

**Solutions possibles** :

| Option | Description | Risque | Recommandé |
|---|---|---|---|
| **A. Baseline existante** | `pnpm prisma migrate resolve --applied <name>` pour chaque migration → crée `_prisma_migrations` et marque les 16 comme appliquées sans les exécuter. Ensuite `migrate dev` fonctionne normalement. | Faible. Standard Prisma pour ce cas. | **Oui** |
| B. `prisma db push` pour la Mission 3 | Contourner `migrate`, pousser directement le schéma modifié. | Pas de traçabilité, pas de rollback SQL documenté. | Non (contraire aux règles de la mission) |
| C. Dump + recréation complète | Drop DB, restore depuis le dump pre-Mission-3 via `prisma migrate deploy`. | Très élevé : 1.4 MB de données productives à perdre et re-importer. | Non |

**Action recommandée** : **Option A** — baseline toutes les migrations existantes avant Étape 1.3. Commande exacte :
```bash
cd packages/database
for m in $(ls prisma/migrations/ | grep -v migration_lock); do
  pnpm prisma migrate resolve --applied "$m"
done
pnpm prisma migrate status
# Doit afficher "Database schema is up to date"
```

### 3. État Ollama ✅

Modèles présents :
- `mistral:latest` (Mistral 7B) ✅
- `bge-m3:latest` (embedding) ✅
- `qwen2:0.5b` (fallback) ✅
- `phi3:mini` (fallback) ✅

Service répond sur `http://localhost:11434`.

### 4. État backend ✅

- `GET /api/v1/health` → 200 `{"status":"ok", "uptime":593s, ...}`
- `systemctl is-active omnitech-backend` → `active`
- Services internes up : `database`, `redis`, `ldap`, `smtp`, `storage`

### 5. État `RagQueryLog` ℹ️

| Total | Unique users | Oldest | Newest |
|---|---|---|---|
| **12** | 1 | 2026-04-16 07:24:46 | 2026-04-20 14:20:56 |

Volume faible (~12 entrées sur 4 jours, 1 utilisateur testeur). Migration future vers `ChatMessage` (Phase 3) sera triviale.

### 6. État feature flag ✅

`CHATBOT_UNIFIED_ENABLED` **absent** du `.env` actuel (pré-existant, sera ajouté en Étape 1.2 avec default `false`).

---

## Décision

**🛑 CHECKPOINT HUMAIN [P1.9.M3.1.1]** — **validation requise avant de continuer**.

Option proposée : **Option A (baseline existante)** — standard Prisma, non destructive, ~30s d'exécution.

### Pour valider l'option A, répondre :

- **"GO A"** → Claude Code exécute `prisma migrate resolve --applied` pour les 16 migrations existantes, puis poursuit l'Étape 1.2 (feature flag).
- **"STOP"** → Claude Code laisse la mission en l'état et attend instructions additionnelles.
- **Autre option** → préciser (ex: "utiliser db push pour cette mission").

### Risque de l'Option A

- Très faible. `prisma migrate resolve --applied` n'exécute AUCUN SQL sur les tables existantes. Elle insère juste 16 lignes dans `_prisma_migrations` pour déclarer ces migrations "déjà appliquées".
- Backup pris en 1.0 disponible pour rollback total si imprévu.
- Rollback = `DROP TABLE _prisma_migrations;` (annule le seul changement fait par l'option A).
