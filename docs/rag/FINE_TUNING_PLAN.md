# Plan Fine-Tuning RAG — Option D (LoRA adaptation)

**Version** : v1.0
**Date** : 2026-04-26
**Auteur** : automatisation Item 30 (RAG fine-tuning corpus maison)
**Statut** : Plan, NON DECLENCHE (deferre tant que > 5k paires de qualite ne
sont pas collectees).

---

## 1. Contexte

L'Item 30 evalue plusieurs strategies pour ameliorer le pipeline RAG :

- **Option A** (hors scope) : fine-tuning complet du modele d'embedding (bge-m3)
  -> couteux (besoin > 50k paires labellisees, 1 GPU semaine).
- **Option B** (hors scope) : fine-tuning du LLM (Mistral 7B / phi3) -> idem.
- **Option C** (DEPLOYE en MVP — Item 30) : optimisation du pipeline sans
  modifier les modeles : reranker, hybrid, query expansion, semantic chunking.
  Gains attendus +5 a +15% MRR pour cout zero training.
- **Option D** (CE PLAN) : LoRA adaptation legere du modele d'embedding sur
  le corpus OMNITECH une fois > 5k paires de qualite collectees via les logs
  de production.

---

## 2. Quand declencher (criteres GO)

Toutes les conditions doivent etre remplies :

1. **Volume** : > 5 000 paires (query, positive, negatives) collectees via
   `scripts/rag/collect-pairs.ts`. La diversite compte autant que le volume :
   au moins 8 thematiques distinctes (incident, RH, ISO, RGPD, technique, etc.).
2. **Qualite** : ratio rating positif/negatif sain (>= 70% positif sur les
   queries avec feedback explicite).
3. **Plafond Option C** : les optimisations Option C ont ete deployees,
   evaluees, et la marge MRR < 0.95 reste un objectif (sinon LoRA = ROI faible).
4. **Infra dispo** : 1 GPU A10/A100 ponctuel (24h fenetre training) — soit en
   cloud burst (AWS p3.2xlarge ~$3/h, ~24h = 72$), soit dedie OMNITECH si
   matos disponible.
5. **Non-regression Mistral** : Mistral reste suffisant pour la generation, on
   ne touche pas au LLM (Option B). LoRA = uniquement embedding.

---

## 3. Pipeline propose

### 3.1 Collecte (en continu, deja deploye Item 30)

Script `scripts/rag/collect-pairs.ts` lance hebdomadairement (cron) :

```bash
pnpm ts-node scripts/rag/collect-pairs.ts \
  --since=2026-04-01 \
  --min-rating=1 \
  --out-dir=storage/rag-finetuning
```

Sortie : `storage/rag-finetuning/pairs-YYYYMMDD.jsonl` au format Sentence-Transformers triplet.

```jsonl
{"query": "comment activer 2FA", "positive": "...", "negatives": ["...", "..."], "meta": {...}}
```

### 3.2 Curation manuelle (1 jour-homme)

Avant training, un opérateur passe le dataset au crible :

- Suppression des paires mal labellisees (rating fortuit).
- Equilibrage par sourceType (eviter > 80% WIKI, < 5% RUNBOOK).
- Validation qu'aucune PII (email, IP, nom) ne fuite — utiliser `PiiSanitizerService` deja integre.
- Split train (80%) / val (10%) / test (10%) stratifie par thematique.

### 3.3 Training LoRA

Stack : Sentence-Transformers + PEFT + LoRA.

```python
# Pseudocode — script Python a developper si Option D declenche
from sentence_transformers import SentenceTransformer, losses, InputExample
from sentence_transformers.evaluation import InformationRetrievalEvaluator
from peft import LoraConfig, get_peft_model

model = SentenceTransformer("BAAI/bge-m3")  # base
lora_cfg = LoraConfig(r=16, lora_alpha=32, target_modules=["query", "value"], dropout=0.05)
model = get_peft_model(model, lora_cfg)

train_examples = load_jsonl("pairs-train.jsonl")
loss = losses.MultipleNegativesRankingLoss(model)
model.fit(train_dataloader=..., epochs=3, warmup_steps=500, lr=2e-5)

model.save("./bge-m3-omnitech-lora-v1")
```

Hyperparametres de depart :
- Epochs : 3
- LR : 2e-5
- Batch : 32 (GPU 24Go)
- Warmup : 500 steps
- LoRA r=16, alpha=32

Duree estimee : 8-12h sur A10G pour 5k paires.

### 3.4 Validation

Sur le test set (10% holdout) :
- Recall@5 doit gagner au moins +0.03 vs bge-m3 baseline.
- MRR doit gagner au moins +0.02 vs baseline.
- Pas de regression sur le golden dataset existant (apps/backend/src/rag/eval/golden-dataset.json).

Si KO sur l'un de ces criteres, on JETTE le LoRA et on garde bge-m3 baseline.

### 3.5 Deploiement

Le checkpoint LoRA est merge dans bge-m3 (technique LoRA "merge-and-unload")
puis converti en GGUF pour Ollama :

```bash
# Pseudocode Ollama
ollama create bge-m3-omnitech-v1 -f Modelfile
# Modelfile: FROM bge-m3-merged.gguf
```

Configuration env :
```env
OLLAMA_EMBEDDING_MODEL=bge-m3-omnitech-v1
```

Re-index complet du corpus (script `backfill-embeddings.ts` deja deploye).
Duree : ~30 min pour 600 chunks.

### 3.6 Rollback

En cas de regression detectee post-deploiement (ex: latence inattendue, outliers
sur certaines thematiques) :

```env
OLLAMA_EMBEDDING_MODEL=bge-m3
```

Re-index. Le code RAG n'a aucune dependance sur la version du modele autre
que la dimension (1024). Bascule trivial sans deploiement code.

---

## 4. Metriques de succes

| Metrique | Avant LoRA | Cible LoRA | Verdict deploy |
|----------|-----------|------------|----------------|
| Recall@5 | 0.95 (post Option C) | >= 0.97 | Si delta < 0.02, ROLLBACK |
| MRR | 0.85 | >= 0.88 | Si delta < 0.02, ROLLBACK |
| Term Coverage | 0.92 | >= 0.94 | Soft, indicatif |
| Faithfulness | 0.74 | >= 0.78 | Soft, indicatif |
| Latence p95 | 450ms | <= 500ms | Hard limit, ROLLBACK si depassement |

---

## 5. Cout / Benefice

### Cout

- Cloud GPU : ~$72-150 par run (A10G/A100 24h)
- Stockage modele LoRA + bge-m3 modifie : ~5GB extra
- Operateur curation : 1-2 jours-homme par batch
- Maintenance : reentrainement 2-4x/an si corpus bouge significativement

### Benefice attendu

- +0.03 a +0.05 sur MRR / Recall@5 (estimation, 70% confidence)
- Reduction des hallucinations LLM (top-1 plus precis -> contexte plus dense)
- Meilleur matching sur le vocabulaire metier OMNITECH (cyber, ISO, ANSSI)

### ROI

Faible si le pipeline est deja a 0.95 recall / 0.95 MRR (Option C). Significatif
si plafond < 0.92 (corpus diversifie / specialise). **Decision GO/NO-GO** a
prendre apres 3-6 mois d'observation post-Option C.

---

## 6. Risques et mitigations

| Risque | Probabilite | Impact | Mitigation |
|--------|-------------|--------|------------|
| Overfitting sur le corpus OMNITECH | Moyenne | Moyen | Validation stricte test holdout, eval sur queries jamais vues |
| Drift du corpus post-training | Haute | Faible | Reentrainer 2-4x/an, monitorer `RagBenchmarkRun` |
| PII leakage dans le dataset | Faible | Eleve | `PiiSanitizerService` applique, audit manuel curation |
| Augmentation latence Ollama | Faible | Moyen | Bench p95 avant deploy, hardcap 500ms via env |
| Modele LoRA non chargeable | Faible | Eleve | Tester en staging avant prod, plan rollback documente |

---

## 7. Decision matrix

### Quand activer Option D

```
si nb_paires_collectees > 5000
ET diversite_themes >= 8
ET recall@5_baseline < 0.97
ET infra_GPU_disponible
ET budget_72h_GPU_approuve
=> GO Option D
sinon
=> RESTER en Option C
```

### Quand revenir a baseline

```
si test_recall@5 - baseline_recall@5 < 0.02
OU test_mrr - baseline_mrr < 0.02
OU latence_p95 > 500ms
=> ROLLBACK vers OLLAMA_EMBEDDING_MODEL=bge-m3
```

---

## 8. Reference croisee

- `scripts/rag/collect-pairs.ts` — collecteur deja deploye (Item 30)
- `docs/rag/EVALUATION.md` — methodologie d'eval pour valider le LoRA
- `docs/rag/CURRENT_PIPELINE.md` — etat du pipeline (Option C deploye)
- `docs/rag/EVAL_BASELINE.md` — metriques pre-Option C
- `apps/backend/src/rag/embedding/embedding.service.ts` — service Ollama (compatible LoRA)
