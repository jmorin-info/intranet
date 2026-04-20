# Baseline évaluation RAG — v1.0

**Date** : 2026-04-20
**Gold set** : v1.0.0 (50 questions)
**Modèle embedding** : bge-m3 (1024D, Ollama local)
**Index** : pgvector 0.8.2, HNSW (m=16, ef=64)
**Corpus** : 142 chunks (3 DOCUMENT, 133 WIKI, 6 RUNBOOK)

---

## Résumé exécutif

| Mode | Pass rate | Recall@5 | MRR | Term Coverage | p50 latency | p95 latency |
|------|-----------|----------|-----|---------------|-------------|-------------|
| **Lexical** | 34.0% | 0.923 | 0.925 | 0.270 | 3ms | 4ms |
| **Vector** | 96.0% | 1.000 | 0.960 | 0.980 | 196ms | 305ms |
| **Hybrid** | 96.0% | 1.000 | 0.907 | 0.950 | 202ms | 285ms |

---

## Gain P1.3 (sémantique vs lexical)

| Métrique | Lexical | Hybrid | Delta | Verdict |
|----------|---------|--------|-------|---------|
| Pass rate | 34.0% | **96.0%** | **+62 pts** | Victoire écrasante sémantique |
| Term Coverage | 0.270 | **0.950** | **+0.680** | Le lexical ne retrouve pas les termes dans les snippets |
| MRR | 0.925 | 0.907 | -0.018 | Quasi-identique |
| Recall@5 | 0.923 | 1.000 | +0.077 | |
| Latency p50 | 3ms | 202ms | +199ms | Acceptable pour UX (< 500ms) |

**Conclusion** : le passage au sémantique apporte un gain majeur (+62% pass rate). La latence est acceptable (p95 < 300ms). Le MRR est légèrement inférieur en hybrid car le RRF mélange parfois l'ordre — le mode vector pur est meilleur sur ce point.

---

## Décision Reranker P1.4

| Comparaison | Recall@5 | MRR | Term Coverage |
|-------------|----------|-----|---------------|
| Vector pur | 1.000 | **0.960** | **0.980** |
| Hybrid RRF | 1.000 | 0.907 | 0.950 |
| Delta | 0 | -0.053 | -0.030 |

Le mode vector pur est déjà meilleur que hybrid sur MRR et term coverage. Le reranker n'apporterait un gain que s'il améliore l'ordering au-delà de 0.96 MRR.

**Décision : REPORTER le reranker (P1.4) → `docs/remediation/DEFERRED.md`**

Justification :
- MRR vector pur = 0.960 (excellent)
- Recall@5 = 1.000 (parfait)
- Un reranker complexifie l'infra sans gain mesurable sur ce corpus
- Le gain viendra plutôt de l'ajout de sources (P1.7) que du re-ranking

**Recommandation** : passer `RAG_HYBRID_MODE=vector` en prod plutôt que `hybrid` (meilleur MRR).

---

## Faiblesses identifiées

1. **Q029** (procédure de départ) : Term Coverage = 0 — le mot "départ" n'apparaît pas dans les snippets retournés. À vérifier : le chunk existe-t-il ?
2. **Q047** (edge case hors-corpus) : le système retourne quand même des résultats au lieu de "non trouvé" — le seuil de confiance doit être ajusté
3. **Latence vector** : p95 = 305ms — acceptable mais à surveiller avec la croissance du corpus

---

## Configuration recommandée post-baseline

```env
RAG_HYBRID_MODE=vector    # vector pur > hybrid RRF sur ce corpus
VECTOR_SIMILARITY_THRESHOLD=0.4  # relever de 0.3 à 0.4 pour réduire le bruit (Q047)
```
