# Benchmark LLM — OMNITECH RAG

**Date** : 2026-04-20
**Host** : bx-it-intranet-vm (8 cores Xeon @ 3.2GHz, 16GB RAM, no GPU)
**Charge prompt** : RAG context ~500 chars + question, output 150 tokens

## Résultats

| Modèle | Tokens/s | Latence 150 tok | Taille mémoire | Qualité FR |
|--------|----------|-----------------|----------------|------------|
| `qwen2:0.5b` | ~50 | ~3s | 352 MB | Pauvre — réponses incohérentes, hallucinations fréquentes |
| `phi3:mini` (3.8B Q4_0) | 8.8 | ~17s | 2.2 GB | Moyenne — bonne en EN, FR correct mais formel |
| `mistral` (7B Q4_K_M) | 5.7 | ~26s | 4.4 GB | **Bonne** — FR natif, vocabulaire technique cyber adapté |

## Analyse

- **Vitesse** : Mistral est 1.5x plus lent que phi3 mais reste exploitable en streaming
  (le first token apparaît en ~2-3s, le reste s'affiche progressivement)
- **Qualité** : Mistral surpasse phi3 sur les questions techniques FR (PSSI, ISO 27001,
  vocabulaire ANSSI) → choix retenu malgré la latence
- **Mémoire runtime** : Mistral 4.4GB + bge-m3 1.2GB = 5.6GB simultanés → marge suffisante
  sur 10.7GB disponibles

## Décision

**Chaîne de fallback configurée** dans `.env` :
```
OLLAMA_LLM_MODEL_PRIMARY=mistral          # qualité FR
OLLAMA_LLM_MODEL_FALLBACK=phi3:mini        # 1.5x plus rapide si Mistral timeout
OLLAMA_LLM_MODEL_EMERGENCY=qwen2:0.5b      # ultra-rapide en cas d'échec multiple
```

Logique d'escalade dans `apps/backend/src/rag/llm/llm.service.ts` :
1. Primary avec 3 tentatives et retry exponentiel
2. Fallback sans retry (1 essai)
3. Emergency en dernier recours

Chaque escalade = log structuré `llm.fallback_used` + métriques exposées via `/rag/stats`.

## Re-évaluation prévue

Trigger : si volume utilisateurs > 50/jour ET p95 latence > 30s → envisager :
- Quantification plus agressive (Q4_K_S au lieu de Q4_K_M)
- GPU dédié (A100/L4 sur infra Cloud)
- Modèle plus petit type Mistral 3B / Qwen2.5 3B
