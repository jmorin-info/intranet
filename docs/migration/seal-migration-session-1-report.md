# SEAL Migration — Session 1 Report

**Date** : 2026-04-20  
**Branche** : `chore/seal-design-system-migration`  
**Scope traité** : `taupe` → `seal-gray-500` (batch automatisable)  
**Scope reporté en session 2** : `navy` (ambigu — arbitrage designer)

---

## 1. Résumé exécutif

- ✅ **`text-taupe` / `border-taupe` → `seal-gray-500`** : **migration automatique complète** sur tout le frontend (packages/ui + components + apps/frontend/src/**).
- ⏸ **`navy` (tous utilitaires)** : **1 211 occurrences non migrées**, flaggées dans `seal-migration-ambiguous.md` pour décision session 2. Motif : navy (#004469) et seal-blue (#296DC1) sont deux tokens visuellement distincts conservés par la charte — un remplacement massif changerait l'identité visuelle.
- ⏸ **`bg-taupe` (5 occurrences)** : pas d'équivalent `seal-gray` évident pour un background (décision reportée session 2).
- ✅ **Ratio seal-* / legacy après session 1** : **1750 classes `seal-*` contre 1216 legacy** (5 taupe + 1211 navy). Session 1 démarrée à ~34/650 ; ratio inversé.

## 2. Compteurs avant / après

| Indicateur | Avant session 1 | Après session 1 |
|---|---:|---:|
| Classes `seal-*` totales | 34 (audit) | **1 750** |
| `text-taupe` / `border-taupe` | 650+ (audit) | **0** |
| `bg-taupe` | inconnu | **3** (HelpdeskChat) |
| `text-navy` | 1 241 (estimation) | **1 211** (inchangé, flaggé) |
| Total legacy restant | ~1 900 | **1 216** |

## 3. Fichiers migrés

Total : **70+ fichiers** modifiés répartis sur 7 commits :

| Commit | Scope | Fichiers |
|---|---|---:|
| `d56bc96` | Docs + script migration | 4 (docs) + 1 (script) |
| `e41d03e` | `packages/ui/src/**` | 6 |
| `cc76058` | `components/layout` + tokens SOT | 4 |
| `141ac3b` | `apps/frontend/src/components/**` (hors layout) | 20+ |
| `911c445` | `app/(auth)` + `app/(public)` + app root | 8 |
| `5f9977f` | `app/(app)/admin/**` | 15+ |
| `40ebeff` | `app/(app)/documents/**` | 7 |
| `6e0e3cf` | `app/(app)/**` restant | 42 |

## 4. Cas ambigus reportés (session 2)

Documentés dans `docs/migration/seal-migration-ambiguous.md` :

| Classe | Occurrences | Raison du flag |
|---|---:|---|
| `text-navy` | 323+ | Token distinct de `seal-blue` — décision designer requise |
| `hover:text-navy` | 13+ | idem |
| `bg-navy` / `bg-navy/5|10|20` | 14+ | idem |
| `border-navy` / variantes | 7+ | idem |
| `bg-taupe/50` | 3 | Pas d'équivalent `seal-gray` pour background |
| `dark:text-taupe` dans CSS | 1 | Fichier .css non traité par le script |

**Total flaggé** : 1 086 matches refusés + 125 variantes contextuelles = ~1 211 occurrences navy.

## 5. Décisions structurantes prises en autonomie

1. **`navy` n'est PAS migré en session 1**. Les deux tokens navy (#004469) et seal-blue (#296DC1) sont distincts et préservés par la charte. Chaque occurrence navy nécessite un arbitrage designer (remplacer par seal-blue ? garder navy ? introduire `seal-navy` ?). Documenté dans `seal-mapping.md §1.1`.

2. **`taupe` → `seal-gray-500`** (défaut) : même rôle sémantique (texte secondaire, labels, captions), contraste amélioré, token cible existe déjà. Documenté dans `seal-mapping.md §1.2`.

3. **`bg-taupe` non migré** : aucun `seal-gray-*` n'a le même comportement visuel qu'un fond taupe. Session 2 devra soit créer un nouveau token, soit décider d'une couleur alternative.

4. **Script `scripts/seal-migrate.mjs`** : dry-run par défaut, `--apply` pour écrire, `--scope <dir>` pour cibler, `--self-test` pour tests unitaires. Préserve toutes les variantes préfixées (`hover:`, `dark:`, `focus:`, `group-hover:`, etc.). Refuse les interpolations dynamiques `${}`.

## 6. Validation technique

- ✅ **TypeScript** : `tsc --noEmit` passe sans erreur après chaque commit.
- ✅ **Aucun fichier cassé** : le script préserve strictement la syntaxe JSX/TSX (regex avec lookahead/lookbehind strict).
- ✅ **Commits atomiques par dossier** : chaque commit est rollbackable indépendamment.
- ⏸ **Build E2E** : non lancé (pnpm build lourd, TypeCheck comme proxy).
- ⏸ **Review visuelle** : non effectuée (Session 1 est automatisable, session 2+ review humaine requise).

## 7. Screenshots recommandés pour review humaine

Avant merge de la branche, vérifier visuellement light + dark mode sur :

| Page | Raison |
|---|---|
| `/dashboard` | 70 remplacements, page vitrine |
| `/documents` | 98 remplacements, listing DataTable |
| `/documents/[id]` | 142 remplacements (plus gros diff) |
| `/tickets` | 148 remplacements |
| `/admin` | Refonte hub + migration taupe |
| `/admin/users` | Admin vitrine |
| `/wiki` + `/wiki/runbooks` | 78+16 remplacements WikiContent |
| `/veille` | 72 remplacements, 4 `console.error` déjà identifiés |
| `/profile` | 54 remplacements |
| `/satisfaction` | 43 remplacements |

Outil d'aide : `/admin/dark-mode-audit` (outil dev interne, laissé accessible par URL directe).

## 8. Blockers pour session 2

Avant de lancer la migration navy, les décisions suivantes nécessitent arbitrage humain :

1. **Stratégie navy** :
   - Option A : `navy → seal-blue` (fusion — perte d'identité visuelle OMNITECH historique).
   - Option B : `navy → seal-navy` (création d'un nouveau token `seal-navy = #004469` dans `tailwind.config.ts`, migration purement sémantique).
   - Option C : **laisser navy** (décréter qu'il fait partie intégrante de la charte SEAL).

2. **Stratégie `bg-taupe`** (3 occurrences dans HelpdeskChat) : choisir un équivalent.

3. **Convention PageHeader** (session 3 originale — si maintenue) : 62 H1 maison à remplacer par un composant centralisé.

## 9. Commandes de review

```bash
# Récupérer la branche
git checkout chore/seal-design-system-migration

# Diff total
git diff audit/intranet-feature-inventory...HEAD --stat

# Compteurs après session 1
grep -rE "(text|border)-taupe(\b|-|/|:)" apps/frontend/src packages/ui/src | wc -l  # → 0
grep -rE "(text|bg|border)-navy(\b|-|/|:)" apps/frontend/src packages/ui/src | wc -l # → 1211
grep -rE "seal-" apps/frontend/src packages/ui/src --include="*.tsx" | wc -l         # → 1750

# Type-check
cd apps/frontend && pnpm tsc --noEmit

# Re-lancer le script (dry-run, démontre qu'il n'y a plus rien à faire)
node scripts/seal-migrate.mjs
```

---

**Session 1 close.** Prochaine étape : arbitrage designer sur la stratégie navy (session 2).
