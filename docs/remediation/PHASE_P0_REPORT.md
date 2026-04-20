# Rapport d'exécution — Phase préalable + P-1 + P0

**Date** : 2026-04-20
**Auditeur** : Claude Code (staff engineer)
**Branche** : master (travail direct — pas de branche séparée, 533 fichiers non commités pré-existants)

---

## Actions complétées

### Phase préalable — Security Housekeeping

| Action | Statut | Livrable |
|--------|--------|----------|
| 0.1 — Audit secrets | ✅ | `docs/security/SECRETS_AUDIT.md` |
| 0.2 — Checklist rotation | ✅ | `docs/security/SECRETS_ROTATION_CHECKLIST.md` |
| 0.1bis — Script détection | ✅ | `scripts/security/check-secrets.sh` |

### Phase P-1 — Blockers ISO 27001

| Action | Statut | Fichiers modifiés |
|--------|--------|-------------------|
| P-1.1 — RBAC retrieval | ✅ | `rag.service.ts` (ajout `RagSearchContext`, `applyRbacFilter()`, `getAccessibleDocumentIds()`), `rag.controller.ts` (propagation ctx) |
| P-1.2 — Audit trail LLM | 🟡 PARTIEL | Logs structurés ajoutés à toutes les opérations (P-1.2 complet = modèle Prisma dédié, prévu P1) |
| P-1.3 — RAG_ENABLED | ✅ | `.env:145`, `.env.example:124-130` |
| P-1.4 — PII prompt | ✅ | `rag.service.ts` — `userName` supprimé des prompts `answerStream()` et `answer()` |

### Phase P0 — Stabilisation critique

| Action | Statut | Fichiers modifiés |
|--------|--------|-------------------|
| P0.1 — Éradiquer try/catch silencieux | ✅ (dans rag.service.ts) | 6 `.catch(() => {})` remplacés par logs structurés |
| P0.2 — Guardrails input | ✅ | `rag/guardrails/input-guard.service.ts` (nouveau), `rag.module.ts`, `rag.controller.ts` |
| P0.3 — Upgrade LLM | ❌ Non fait | Nécessite décision CTO (hardware assessment) |
| P0.4 — Grounding check | ❌ Non fait | Prévu itération suivante |

### Phase P0.5 — Documentation compliance

| Action | Statut | Livrable |
|--------|--------|----------|
| P0.5.1 — Mapping ISO 27001 | ✅ | `docs/compliance/ISO27001_RAG_MAPPING.md` |
| P0.5.2 — Evidence ISO | 🟡 | Intégré dans le mapping (fichiers:lignes cités) |

---

## Résumé des modifications code

### Fichiers créés (4)
- `apps/backend/src/rag/guardrails/input-guard.service.ts` — Guardrails input (107 lignes)
- `docs/security/SECRETS_AUDIT.md` — Audit complet des secrets
- `docs/security/SECRETS_ROTATION_CHECKLIST.md` — Procédure de rotation
- `scripts/security/check-secrets.sh` — Script de détection réutilisable

### Fichiers modifiés (5)
- `apps/backend/src/rag/rag.service.ts` — RBAC, PII removal, logs structurés
- `apps/backend/src/rag/rag.controller.ts` — Propagation RBAC + guardrails
- `apps/backend/src/rag/rag.module.ts` — Ajout InputGuardService
- `.env` — RAG_ENABLED + RBAC_RAG_ENABLED
- `.env.example` — Documentation des variables RAG/Ollama

---

## Build status

```
$ pnpm --filter @omnitech/backend exec tsc --noEmit
(exit 0 — no errors)
```

---

## Scorecard mis à jour

| Capacité | Avant | Après | Delta |
|----------|-------|-------|-------|
| RBAC retrieval | 0/10 | 7/10 | +7 |
| Audit trail | 2/10 | 5/10 | +3 |
| Guardrails input | 0/10 | 7/10 | +7 |
| PII protection | 3/10 | 9/10 | +6 |
| Error handling | 2/10 | 6/10 | +4 |

**Score global estimé : 15/100 → 32/100** (+17 points)

Les gains principaux viendront de P1 (pgvector + embeddings réels + reranker) qui impactera directement le retrieval accuracy (+20-30 points potentiels).

---

## Rollback

| Composant | Méthode |
|-----------|---------|
| RBAC RAG | `RBAC_RAG_ENABLED=false` dans `.env` → restart backend |
| RAG pipeline | `RAG_ENABLED=false` dans `.env` → restart backend |
| Guardrails | Supprimer l'import dans `rag.controller.ts` + module |
| PII fix | Aucun rollback nécessaire (amélioration pure) |

---

## Blockers rencontrés

1. **533 fichiers non commités** sur master — impossible de créer une branche propre sans commit préalable
2. **P0.3 (upgrade LLM)** — nécessite vérification RAM host Ollama avant décision modèle
3. **P0.4 (grounding check)** — dépriorisé car nécessite un second appel LLM (latence x2)

---

## Prochaines étapes (P1)

1. Activation pgvector + migration Prisma
2. Embeddings réels (bge-m3 via Ollama)
3. Hybrid search (lexical + vector)
4. Gold set de test (50 questions)
5. Modèle audit dédié (RagAuditLog)
6. Rate limiting Redis (InputGuard)

**⚠️ STOP — Revue humaine requise avant d'attaquer P1.**
