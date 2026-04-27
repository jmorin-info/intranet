# RAG Pipeline — Etat actuel (audit avant Item 30)

**Date audit** : 2026-04-26
**Branche source** : `feat/p1-9-prelaunch`
**Auteur** : automatisation Item 30 (RAG fine-tuning corpus maison)

> Ce document fige l'etat du pipeline RAG juste avant les optimisations Item 30
> (reranker, hybrid search ameliore, semantic chunking, query expansion, eval
> endpoint). Il sert de baseline de comparaison.

---

## 1. Composants

| Composant | Fichier | Modele / strategie |
|-----------|---------|--------------------|
| Embedding | `apps/backend/src/rag/embedding/embedding.service.ts` | `bge-m3` via Ollama (`OLLAMA_EMBEDDING_MODEL=bge-m3`), 1024 dims |
| LLM generation | `apps/backend/src/rag/llm/llm.service.ts` | Chaine `mistral` -> `phi3:mini` -> `qwen2:0.5b` (fallback) |
| Vector store | pgvector 0.8.2 | Index ivfflat (`lists=100`), distance cosine `<=>` |
| BM25 | Postgres `to_tsvector('french')` | Utilise dans `SearchService` (pas encore RagChunk) |
| Hybrid | RRF (k=60) | `rag.service.ts` -> `reciprocalRankFusion()` |
| Chunking | Fixed-size | 2000 chars, overlap 200 chars (~ 500 tokens) |
| Retrieval | top-k = 10 | Confidence threshold = 0.3 |
| Prompt | Template par modele | `apps/backend/src/rag/prompts/templates.ts` (mistral/phi3/qwen) |
| Reranker | **absent** | Ajoute par Item 30 |
| Query expansion | **absente** | Ajoute par Item 30 |
| Eval endpoint | **absent** | Ajoute par Item 30 |

## 2. Volumetrie corpus (snapshot baseline 2026-04-20)

| Source | Chunks |
|--------|--------|
| WIKI | 133 |
| DOCUMENT | 3 |
| RUNBOOK | 6 |
| **Total** | **142** |

Le corpus a depuis grossi (l'audit v1.0 mentionne ~60 pages wiki, ~587 chunks
indexes en stock prod). La volumetrie reelle au moment de la mesure depend du
flag `RAG_ENABLED` et du dernier `reindexAll()` (cron 01h00 Europe/Paris).

## 3. Strategie de chunking actuelle

```ts
// rag.service.ts
const CHUNK_SIZE_CHARS = 2000;
const CHUNK_OVERLAP_CHARS = 200;
chunkContent(content: string): string[] {
  // boucle naive : start += (CHUNK_SIZE_CHARS - CHUNK_OVERLAP_CHARS)
}
```

**Limitations** :
- Coupe au milieu d'une phrase, d'un titre ou d'un paragraphe
- Ne preserve pas la structure Markdown (titres, listes, tableaux)
- Ne tient pas compte des frontieres semantiques (changement de sujet)
- HTML wiki (Tiptap) est traite comme du texte brut -> les balises polluent les
  embeddings

**Impact mesure** :
- Term Coverage en lexical = 0.270 (`docs/rag/EVAL_BASELINE.md`) -> 73% des
  termes de la query ne sont pas dans les snippets retournes
- Q029 (procedure de depart) : Term Coverage = 0 — le mot est present dans le
  document source mais coupe par le chunking

## 4. Strategie de retrieval actuelle

3 modes selon `RAG_HYBRID_MODE` (env) :
- `lexical` : tokenisation FR + filtrage stopwords + scoring TF heuristique
  (rag.service.ts:`searchSimilar`)
- `vector` : pgvector cosine + threshold (`VECTOR_SIMILARITY_THRESHOLD=0.4`)
- `hybrid` : RRF (k=60) entre lexical et vector

**Limitations** :
- Le mode lexical est un TF brut (pas de BM25) -> ne penalise pas les chunks longs
- Pas de reranker -> l'ordre top-k peut etre suboptimal sur les queries ambigues
- Pas de query expansion -> sensibilite aux reformulations

## 5. Confidence gate

```ts
const CONFIDENCE_THRESHOLD = 0.3;
if (retrievalConfidence < CONFIDENCE_THRESHOLD || sources.length === 0) {
  return "Je n'ai pas trouve d'information suffisamment pertinente...";
}
```

Le score "confidence" = score normalise du top-1 (lexical) ou similarity cosine
top-1 (vector). Pas calibre cross-mode (un 0.3 lexical != 0.3 vector).

## 6. Metriques mesurees aujourd'hui

Source : `docs/rag/EVAL_BASELINE.md` (50 questions golden v1.0.0).

| Mode | Pass rate | Recall@5 | MRR | Term Coverage | p50 latency | p95 latency |
|------|-----------|----------|-----|---------------|-------------|-------------|
| Lexical | 34.0% | 0.923 | 0.925 | 0.270 | 3ms | 4ms |
| Vector | 96.0% | 1.000 | 0.960 | 0.980 | 196ms | 305ms |
| Hybrid | 96.0% | 1.000 | 0.907 | 0.950 | 202ms | 285ms |

**Observation** : vector pur deja excellent (recall@5 = 1.0) -> il faut viser
des ameliorations sur l'**ordering** (MRR), la **robustesse aux reformulations**
(via query expansion) et la **qualite des chunks** (semantic chunking).

## 7. Endpoints exposes

| Methode | Route | Description |
|---------|-------|-------------|
| POST | `/rag/ask` | Q/R synchrone (RBAC + guardrails) |
| POST | `/rag/ask-stream` | SSE streaming |
| GET | `/rag/documents/:id/ai-summary` | Resume LLM (cache 5 min) |
| GET | `/rag/tickets/:id/ai-suggest` | Suggestion reponse ticket |
| POST | `/rag/wiki/:id/ask` | Q/R sur un article wiki specifique |
| POST | `/rag/reindex` | Reindex full (admin) |
| GET | `/rag/stats` | Stats par sourceType |
| POST | `/rag/:id/feedback` | Feedback utilisateur |
| POST | `/rag/conversations/share` | Partage conversation |
| GET | `/rag/conversations/share/:token` | Lecture conversation partagee |
| **POST** | `/rag/eval` | **Ajoute Item 30** : run benchmark golden dataset |

## 8. Variables d'environnement RAG

| Var | Defaut | Role |
|-----|--------|------|
| `RAG_ENABLED` | `false` | Active le pipeline |
| `RBAC_RAG_ENABLED` | `true` | Filtre RBAC ISO 27001 A.5.15 |
| `RAG_SEMANTIC_ENABLED` | `false` | Active embeddings + pgvector |
| `RAG_HYBRID_MODE` | `lexical` | `lexical` / `vector` / `hybrid` |
| `VECTOR_SIMILARITY_THRESHOLD` | `0.5` | Seuil cosine |
| `OLLAMA_URL` | `http://localhost:11434` | Endpoint Ollama |
| `OLLAMA_EMBEDDING_MODEL` | `bge-m3` | Modele embeddings |
| `OLLAMA_LLM_MODEL_PRIMARY` | `mistral` | LLM primaire |
| `OLLAMA_LLM_MODEL_FALLBACK` | `phi3:mini` | LLM fallback |
| `OLLAMA_LLM_MODEL_EMERGENCY` | `qwen2:0.5b` | LLM derniere chance |
| **`RAG_RERANKER_ENABLED`** | **`false`** | **Item 30** : active le cross-encoder rerank |
| **`OLLAMA_RERANKER_MODEL`** | **`bge-reranker-v2-m3`** | **Item 30** : modele cross-encoder |
| **`RAG_RERANKER_TOP_N`** | **`5`** | **Item 30** : N apres rerank |
| **`RAG_RERANKER_TOP_K`** | **`20`** | **Item 30** : K candidats avant rerank |
| **`RAG_QUERY_EXPANSION_ENABLED`** | **`false`** | **Item 30** : multi-query expansion |
| **`RAG_QUERY_EXPANSION_N`** | **`3`** | **Item 30** : nombre de reformulations |
| **`RAG_HYBRID_ALPHA`** | **`0.7`** | **Item 30** : ponderation vector vs BM25 (alpha) |
| **`RAG_BM25_ENABLED`** | **`false`** | **Item 30** : utilise tsvector BM25 sur RagChunk |
| **`RAG_SEMANTIC_CHUNKING_ENABLED`** | **`false`** | **Item 30** : chunking structure-aware |

## 9. Audit Item 30 — strategie de fine-tuning retenue

Voir `docs/rag/FINE_TUNING_PLAN.md`. **Decision** :

- **MVP (v1.3+)** = Option C (optimisation pipeline). Pas de fine-tuning, pas de
  GPU training. Gains attendus : +5 a +15% MRR via reranker, +20% robustesse via
  query expansion, +30% term coverage via semantic chunking.
- **Plus tard (v2.x)** = Option D (LoRA adaptation legere du modele
  d'embedding) si on collecte > 5k paires de qualite via le script
  `scripts/rag/collect-pairs.ts`.
- **Hors scope** = Option A (fine-tuning complet embedding) et Option B
  (fine-tuning LLM). Cout/benefice defavorable a notre echelle.

## 10. Reference croisee

- `docs/rag/EVAL_BASELINE.md` — metriques avant Item 30
- `docs/rag/EVALUATION.md` — methodologie + golden dataset (Item 30)
- `docs/rag/FINE_TUNING_PLAN.md` — plan Option D futur (Item 30)
- `docs/rag/LLM_BENCHMARK.md` — comparaison LLM (mistral/phi3/qwen)
- `docs/audit/INTRANET_FEATURE_AUDIT_v1.0.md` — audit global v1.0
