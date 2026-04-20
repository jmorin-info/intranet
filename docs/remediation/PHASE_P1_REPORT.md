# Rapport d'exécution — Phase P1 : RAG Sémantique

**Date** : 2026-04-20
**Statut** : ✅ CORE LIVRÉ (P1.0 + P1.1 + P1.2 + P1.3)

---

## Résumé

Le pipeline RAG est passé d'un retrieval lexical pur (`LIKE %term%`) à un **hybrid search sémantique** combinant :
- Recherche lexicale TF-scoring (existant, préservé comme fallback)
- Recherche vectorielle pgvector + bge-m3 1024D
- Fusion RRF (Reciprocal Rank Fusion, k=60)

---

## Actions complétées

### P1.0 — Prérequis

| Action | Statut | Livrable |
|--------|--------|----------|
| Audit hardware | ✅ | `docs/infrastructure/OLLAMA_HOST.md` |
| Backup pré-migration | ✅ | `/tmp/backup_pre_p1_20260420.dump` (996K) |
| Feature flags | ✅ | `RAG_SEMANTIC_ENABLED`, `RAG_HYBRID_MODE`, `VECTOR_SIMILARITY_THRESHOLD` |

### P1.1 — pgvector

| Action | Statut | Détail |
|--------|--------|--------|
| Install package | ✅ | `postgresql-16-pgvector 0.8.2-1` |
| Extension CREATE | ✅ | `vector 0.8.2` confirmé |
| Colonne embedding | ✅ | `vector(1024)` nullable sur `RagChunk` |
| Index HNSW | ✅ | `rag_chunk_embedding_hnsw_idx` (m=16, ef=64, cosine) |

### P1.2 — Embeddings

| Action | Statut | Détail |
|--------|--------|--------|
| Télécharger bge-m3 | ✅ | `ollama pull bge-m3` — 1024D vérifié |
| EmbeddingService | ✅ | `rag/embedding/embedding.service.ts` — retry 3x, cache SHA-256 |
| Backfill 142 chunks | ✅ | 142/142 embeddés, 0 erreurs, 299s |
| Vérification DB | ✅ | `WHERE embedding IS NULL` = 0 |

### P1.3 — Hybrid Search

| Action | Statut | Détail |
|--------|--------|--------|
| vectorSearch() | ✅ | Raw SQL pgvector `<=>` cosine, RBAC pré-filtre |
| reciprocalRankFusion() | ✅ | k=60, fusion lexical + vector |
| search() unifié | ✅ | Mode switcher `lexical \| vector \| hybrid` |
| Pipeline RAG migré | ✅ | `answerStream()` + `answer()` utilisent `search()` |

### P1.4 — Reranker

| Action | Statut | Détail |
|--------|--------|--------|
| Décision | ⏸️ DÉFÉRÉ | Nécessite eval gold set (P1.6) pour quantifier le gain |

### P1.5 — Indexation incrémentale

| Action | Statut | Détail |
|--------|--------|--------|
| Queue BullMQ | ❌ Non fait | Prévu itération suivante |
| Hooks Prisma | ❌ Non fait | Idem |

### P1.6 — Gold set & Eval

| Action | Statut | Détail |
|--------|--------|--------|
| Gold set v1.0 | ❌ Non fait | Nécessite données métier réelles |
| Script eval | ❌ Non fait | Dépend du gold set |
| CI integration | ❌ Non fait | Dépend du script eval |

### P1.7 — Sources manquantes

| Action | Statut | Détail |
|--------|--------|--------|
| Tickets | ❌ Non fait | Prévu itération suivante |
| FAQ | ❌ Non fait | Idem |

---

## Fichiers créés/modifiés

### Créés (4)
- `apps/backend/src/rag/embedding/embedding.service.ts` — Service Ollama embeddings
- `scripts/rag/backfill-embeddings.ts` — Script de backfill batch
- `docs/infrastructure/OLLAMA_HOST.md` — Documentation hardware
- `docs/remediation/PHASE_P1_REPORT.md` — Ce rapport

### Modifiés (4)
- `apps/backend/src/rag/rag.service.ts` — vectorSearch, hybridSearch, RRF, search() unifié
- `apps/backend/src/rag/rag.module.ts` — Ajout EmbeddingService
- `.env` — `RAG_SEMANTIC_ENABLED=true`, `RAG_HYBRID_MODE=hybrid`, `OLLAMA_EMBEDDING_MODEL=bge-m3`
- `.env.example` — Documentation variables P1

### Infrastructure
- `postgresql-16-pgvector` installé (apt)
- `bge-m3` téléchargé dans Ollama
- Colonne `embedding vector(1024)` + index HNSW créés

---

## Build & Deploy

```
$ pnpm --filter @omnitech/backend exec tsc --noEmit → exit 0
$ pnpm --filter @omnitech/backend run build → OK
$ systemctl restart omnitech-backend → active
$ curl /api/v1/health → status: ok, ollama: up
```

---

## Scorecard mis à jour

| Capacité | P0 | P1 | Delta |
|----------|----|----|-------|
| Retrieval accuracy | 2/10 | 6/10 | +4 (vector + hybrid) |
| Context awareness | 1/10 | 1/10 | — (mémoire = P2) |
| Hallucination resistance | 3/10 | 4/10 | +1 (meilleur retrieval) |
| Multi-source fusion | 1/10 | 4/10 | +3 (RRF) |
| Citation fidelity | 5/10 | 5/10 | — |
| Role-based filtering | 7/10 | 7/10 | — |
| Latency | ?/10 | 5/10 | (vector ~200ms, acceptable) |

**Score global estimé : 32/100 → ~48/100** (+16 points)

Le score n'atteint pas encore 55/100 car :
- P1.4 (reranker) non implémenté
- P1.6 (eval) non quantifié
- P1.7 (sources manquantes) non fait
- LLM toujours 0.5B (qualité génération limitée)

---

## Rollback

| Scénario | Méthode |
|----------|---------|
| Vector search cassé | `RAG_HYBRID_MODE=lexical` → restart |
| Embedding service down | `RAG_SEMANTIC_ENABLED=false` → restart |
| pgvector problème perf | DROP INDEX + mode lexical |
| Retour total P0 | `RAG_SEMANTIC_ENABLED=false` + `RAG_HYBRID_MODE=lexical` |

---

## Prochaines étapes (P1 restant)

1. **Gold set** (P1.6.1) — demander à l'équipe 50 questions représentatives
2. **Script eval** (P1.6.2) — Recall@5, MRR, nDCG
3. **Indexation incrémentale** (P1.5) — hooks on document save
4. **Sources manquantes** (P1.7) — tickets résolus + FAQ
5. **Reranker** (P1.4) — décision après eval
6. **LLM upgrade** — phi3:mini ou Mistral 7B

**[CHECKPOINT P1.3] — Livré : pgvector + bge-m3 + hybrid search opérationnel. Validation requise avant P1.5-P1.7.**
