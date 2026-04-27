# RAG Evaluation Methodology — Item 30

**Version** : v1.0
**Date** : 2026-04-26
**Auteur** : automatisation Item 30 (RAG fine-tuning corpus maison)

> Ce document decrit la methodologie d'evaluation du pipeline RAG, le format
> du golden dataset, et la procedure pour ajouter de nouveaux exemples.

---

## 1. Objectif

Mesurer de facon reproductible la qualite du retrieval RAG (et optionnellement
de la generation LLM) pour :

- **Comparer des configurations** (reranker on/off, hybrid alpha, BM25 on/off,
  semantic chunking, query expansion).
- **Detecter des regressions** apres une mise a jour de corpus, modele ou code.
- **Tracer l'evolution** des metriques au fil du temps via la table
  `RagBenchmarkRun` (Prisma).

---

## 2. Metriques

| Metrique | Definition | Cible |
|----------|------------|-------|
| **Recall@5** | Proportion de queries dont au moins un chunk pertinent figure dans le top-5. | >= 0.95 |
| **MRR** (Mean Reciprocal Rank) | Moyenne de 1/rang du premier chunk pertinent (0 si aucun). | >= 0.85 |
| **Term Coverage** | Proportion moyenne de keywords attendus presents dans les snippets retournes. | >= 0.90 |
| **Faithfulness** (LLM-judge) | Note 0..1 (LLM evaluateur) sur la fidelite du contexte aux sources, vs. groundTruth. | >= 0.70 |
| **Latence p50 / p95** | Delai end-to-end retrieval (sans LLM gen). | p50 < 200ms, p95 < 500ms |

### Definition de "chunk pertinent"

Un chunk est considere pertinent si :

1. Au moins **un keyword attendu** (`expectedKeywords`) du dataset apparait dans le titre OU le snippet (apres NFD + lowercase).
2. Si specifie : son `sourceType` figure dans `expectedSourceTypes` (filtrage strict).

Cette heuristique evite de stocker des `expectedChunkIds` figes (les UUID changent
a chaque re-index). Elle reste assez forte pour garantir la pertinence : un
keyword distinctif comme "phishing" ou "offboarding" matche rarement par hasard.

---

## 3. Golden dataset

### Localisation

`apps/backend/src/rag/eval/golden-dataset.json`

### Format

```json
{
  "version": "v1.0.0",
  "createdAt": "2026-04-26",
  "description": "...",
  "examples": [
    {
      "id": "Q001",
      "question": "Quelle est la procedure en cas d'incident de securite ?",
      "expectedKeywords": ["incident", "securite", "rssi", "csirt"],
      "expectedSourceTypes": ["RUNBOOK", "WIKI", "PROCEDURE"],
      "groundTruthAnswer": "En cas d'incident, declarer immediatement..."
    }
  ]
}
```

### Champs

- `id` (required) : identifiant unique stable (Q001, Q002, ...)
- `question` (required) : query naturelle en francais
- `expectedKeywords` (required) : 3-7 mots distinctifs pour matcher la pertinence
- `expectedSourceTypes` (optional) : filtre strict sur sourceType (DOCUMENT, WIKI, RUNBOOK, PROCEDURE, FAQ, TICKET)
- `groundTruthAnswer` (optional) : reponse de reference (utilise pour le faithfulness)

### Versioning

Increment du `version` (semver) a chaque modification. Le run benchmark
stocke la `datasetVersion` dans `RagBenchmarkRun` pour pouvoir comparer
entre versions.

### Ajouter un exemple

1. Identifier une question typique (logs `RagQueryLog` reels en prod).
2. Verifier que la reponse existe dans le corpus indexe.
3. Choisir 3-5 `expectedKeywords` distinctifs (eviter les mots generiques comme "comment", "quoi").
4. Si possible, identifier les 1-3 sources autoritaires (`expectedSourceTypes`).
5. Rediger une `groundTruthAnswer` synthetique en 1-2 phrases (pour faithfulness).
6. Verifier en local : `pnpm exec node -e "..."` ou via l'endpoint `POST /rag/eval`.
7. Bumper la `version` du dataset.

### Taille recommandee

- **MVP** : 20 questions (couverture des thematiques principales).
- **v2** : 50 questions (couverture par sourceType + edge cases).
- **v3+** : 100+ questions (samples derives des logs reels post-prod).

---

## 4. Execution du benchmark

### Endpoint

```
POST /api/v1/rag/eval
Authorization: Bearer <admin_token>
Content-Type: application/json

{
  "mode": "hybrid+rerank+expand-3",   // optional, sinon derive des flags
  "evalFaithfulness": false,            // optional, default false (couteux)
  "notes": "test ALPHA=0.6 vs 0.7",     // optional
  "persist": true                       // default true
}
```

### Reponse

```json
{
  "datasetVersion": "v1.0.0",
  "mode": "hybrid+bm25+rerank+expand-3+semchunk",
  "numQueries": 20,
  "numChunks": 587,
  "recall5": 0.95,
  "mrr": 0.87,
  "termCoverage": 0.92,
  "faithfulness": 0.74,
  "latencyP50Ms": 180,
  "latencyP95Ms": 420,
  "perQuery": [ ... ],
  "config": {
    "ragRerankerEnabled": true,
    "ragHybridAlpha": "0.7",
    ...
  },
  "storedRunId": "uuid-of-RagBenchmarkRun"
}
```

### Throttling

1 run / minute / admin (le retrieval consomme des appels embedding + le LLM-judge
consomme des generations).

### Historique

```
GET /api/v1/rag/eval/history
```

Retourne les 50 derniers runs (admin uniquement) pour visualiser une serie
temporelle des metriques.

---

## 5. Procedure de comparaison A/B

Pour comparer deux configurations (ex: alpha=0.5 vs 0.7) :

1. Configurer les env vars cible 1, run `POST /rag/eval` (note l'id).
2. Configurer les env vars cible 2, run `POST /rag/eval` (note l'id).
3. Comparer les metriques recall5, mrr, termCoverage, latency dans la reponse
   ou via la table `RagBenchmarkRun`.
4. Decider : si recall5 et mrr augmentent **simultanement** sans regression
   latency > 20%, deployer la nouvelle config.

### Exemple de decision

| Run | mode | recall5 | mrr | tc | p95 | Verdict |
|-----|------|---------|-----|-----|-----|---------|
| R1 | vector | 1.000 | 0.960 | 0.980 | 305 | baseline |
| R2 | hybrid+bm25 alpha=0.7 | 1.000 | 0.965 | 0.985 | 320 | leger gain MRR, latency OK |
| R3 | hybrid+bm25+rerank | 1.000 | 0.985 | 0.990 | 480 | gros gain MRR, latency limite |

R3 est la meilleure config si la cible p95 < 500ms tient.

---

## 6. Limites et biais

### Heuristique keyword-matching

- **Faux positifs** : un keyword peut apparaitre dans un chunk non-pertinent (ex: "incident" dans une page wiki sur les conges). Mitigation : combiner avec `expectedSourceTypes`.
- **Faux negatifs** : un chunk pertinent peut ne pas contenir le keyword exact (ex: synonyme). Mitigation : 3-5 keywords variation lexicale.

### Taille du dataset

20 exemples = signal noisy (1 query = 5 pts de recall). Pour des comparaisons
fines (delta < 5 pts), il faut > 50 exemples. La logique est : signaler les
gros gains/regressions, pas le tuning de 1%.

### LLM-as-judge biais

- Variabilite : le judge peut donner 6/10 ou 7/10 pour la meme paire selon le seed.
- Biais culturel / linguistique du modele Mistral (peu d'exposure FR juridique).

Mitigation : `evalFaithfulness=true` reserve aux campagnes longues, croise avec
les keywords + groundTruth. Pas decisionnaire seul.

### Corpus en evolution

Le re-index quotidien (cron 01h) modifie les UUID des chunks. Le dataset golden
n'est PAS lie aux UUIDs (heuristique keywords). Les runs sont neanmoins comparables
uniquement entre re-index identiques (champ `numChunks` log dans `RagBenchmarkRun`).

---

## 7. Reference croisee

- `docs/rag/CURRENT_PIPELINE.md` — etat du pipeline avant Item 30
- `docs/rag/EVAL_BASELINE.md` — metriques mesurees avant Item 30 (50 questions v1)
- `docs/rag/FINE_TUNING_PLAN.md` — plan Option D (LoRA) si > 5k paires collectees
- `apps/backend/src/rag/eval/rag-eval.service.ts` — implementation
- `apps/backend/src/rag/eval/golden-dataset.json` — dataset versionne
- `packages/database/prisma/migrations/20260426_rag_benchmark_run/` — schema persistance
