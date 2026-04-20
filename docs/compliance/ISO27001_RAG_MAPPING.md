# Mapping ISO 27001:2022 — Système RAG/AI

**Date** : 2026-04-20
**Scope** : Pipeline RAG, chatbot AI, retrieval, LLM local
**Certification visée** : ISO 27001:2022 — fin 2026

---

## Tableau de conformité

| Finding audit | Contrôle Annex A | Criticité cert | Status | Evidence |
|---|---|---|---|---|
| RBAC absent au retrieval | A.5.15 (Contrôle d'accès), A.8.3 (Restriction d'accès à l'information) | 🔴 Blocker | ✅ **RÉSOLU** (P-1.1) | `rag.service.ts:370-445` — `applyRbacFilter()`, `getAccessibleDocumentIds()` |
| Audit trail LLM absent | A.8.15 (Journalisation) | 🔴 Blocker | 🟡 **PARTIEL** — logs structurés ajoutés, modèle audit dédié P1 | `rag.service.ts` — logger structuré sur toutes opérations |
| PII dans prompts LLM | A.5.34 (Vie privée et protection des données à caractère personnel) | 🟡 Finding mineur | ✅ **RÉSOLU** (P-1.4) | `rag.service.ts` — `userName` supprimé de tous les prompts |
| Pas de guardrails input | A.8.26 (Exigences de sécurité des applications) | 🟡 Finding mineur | ✅ **RÉSOLU** (P0.2) | `rag/guardrails/input-guard.service.ts` |
| RAG_ENABLED non validé | A.8.9 (Gestion de la configuration) | 🟡 Finding mineur | ✅ **RÉSOLU** (P-1.3) | `.env:145`, `.env.example:124` |
| Secrets non rotés | A.8.24 (Utilisation de la cryptographie) | 🟡 Finding mineur | 🔄 **DOCUMENTÉ** | `docs/security/SECRETS_ROTATION_CHECKLIST.md` |
| Fallback crypto dangereux | A.8.24 | 🟡 Finding mineur | 🔄 **IDENTIFIÉ** | `docs/security/SECRETS_AUDIT.md` §3 — 9 fichiers avec fallback |
| Feature flag rollback RAG | A.8.32 (Gestion des changements) | ℹ️ Recommandation | ✅ **RÉSOLU** | `RBAC_RAG_ENABLED` env var |
| LLM local (souveraineté) | A.5.21 (Gestion de la sécurité dans la chaîne TIC) | ℹ️ Point positif | ✅ Conforme | Ollama local, aucun envoi cloud |

---

## Détail des contrôles

### A.5.15 — Contrôle d'accès (RÉSOLU)

**Exigence** : L'accès à l'information doit être limité conformément à la politique de contrôle d'accès.

**Implémentation** :
- Filtrage RBAC AVANT le retrieval (pas après)
- Classification documents : PUBLIC / INTERNE / CONFIDENTIEL / SECRET
- Règles d'accès par classification et rôle utilisateur
- Feature flag `RBAC_RAG_ENABLED` pour rollback d'urgence
- Logging des chunks filtrés pour traçabilité

**Fichiers** :
- `apps/backend/src/rag/rag.service.ts` — méthodes `applyRbacFilter()`, `getAccessibleDocumentIds()`
- `apps/backend/src/rag/rag.controller.ts` — propagation `RagSearchContext`

### A.8.26 — Sécurité des applications (RÉSOLU)

**Exigence** : Les exigences de sécurité doivent être identifiées et respectées lors du développement d'applications.

**Implémentation** :
- Validation longueur max (2000 chars)
- Détection injection prompt (14 patterns)
- Sanitization caractères de contrôle
- Normalisation Unicode NFC

**Fichier** : `apps/backend/src/rag/guardrails/input-guard.service.ts`

### A.5.34 — Protection des PII (RÉSOLU)

**Exigence** : Les données personnelles doivent être protégées conformément aux réglementations applicables.

**Implémentation** :
- Suppression du `userName` de tous les prompts LLM
- Aucune PII transmise au modèle (même local)
- Les logs de requête contiennent le `userId` (UUID) mais pas le nom complet

---

## Score compliance post-remédiation

| Domaine | Avant | Après | Cible |
|---------|-------|-------|-------|
| Contrôle d'accès RAG | 0% | 90% | 100% (tests auto) |
| Journalisation | 30% | 70% | 100% (modèle audit dédié P1) |
| Protection PII | 50% | 95% | 100% |
| Guardrails applicatifs | 0% | 85% | 100% (rate limiting Redis P1) |
| Gestion secrets | 20% | 40% | 100% (après rotation) |
