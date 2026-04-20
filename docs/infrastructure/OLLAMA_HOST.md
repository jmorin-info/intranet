# Infrastructure Ollama — OMNITECH Intranet

**Date audit** : 2026-04-20
**Host** : bx-it-intranet-vm (VMware)

## Hardware

| Composant | Valeur |
|-----------|--------|
| CPU | Intel Xeon Silver 4215R @ 3.20GHz, 8 cores |
| RAM | 16 GB total, ~10.7 GB disponible |
| GPU | Aucun (VMware SVGA II) |
| Disque | 146 GB, 106 GB libre |
| OS | Debian 12 (Bookworm), Linux 6.1.0-44-amd64 |

## Modèles Ollama installés

| Modèle | Usage | Taille | Paramètres | Quantification |
|--------|-------|--------|------------|----------------|
| `qwen2:0.5b` | LLM génération (RAG responses) | 352 MB | 494M | Q4_0 |
| `phi3:mini` | LLM alt (inactif) | 2.18 GB | 3.8B | Q4_0 |
| `bge-m3` | Embeddings sémantiques (1024D) | ~670 MB | — | FP16 |

## Capacité estimée

- **Embedding bge-m3** : ~0.5 chunks/s (mesuré lors du backfill 142 chunks)
- **Génération qwen2:0.5b** : ~50 tokens/s (rapide mais qualité limitée)
- **Upgrade recommandé** : Mistral 7B Instruct v0.3 (Q4_K_M, ~4.4GB) — faisable avec 10GB RAM libre

## Décisions P1

| Décision | Choix | Justification |
|----------|-------|---------------|
| Embedding model | bge-m3 | Multilingue FR/EN, 1024D, SOTA open-source |
| LLM model | qwen2:0.5b (maintenu P1) | Upgrade Mistral 7B en P0.3 (séparé) |
| Vector store | pgvector 0.8.2 (in-process) | Zero infra supplémentaire |
| Index | HNSW (m=16, ef_construction=64) | Recall/perf équilibré pour <10K vecteurs |
