# SEAL Migration — Session 2 Report

**Date** : 2026-04-20  
**Branche** : `chore/seal-design-system-migration` (continuité session 1)  
**Décision designer validée** : **Option B — création du token `seal-navy` (#004469) et renommage sémantique**  
**Scope traité** : toutes occurrences `navy` (text/bg/border/ring/from/to/via + variants) → `seal-navy`

---

## 1. Résumé exécutif

- ✅ **Token `seal-navy = #004469` créé** dans `tailwind.config.ts` et `globals.css` (variable CSS `--seal-navy`). Couleur préservée à l'identique du `navy` legacy.
- ✅ **1 199+ occurrences navy migrées** vers `seal-navy` sur **148 fichiers** (packages/ui + components + app routes + tokens SOT).
- ✅ **Script `scripts/seal-migrate.mjs` étendu** : nouveau `NAVY_UTIL_RE` + intégration dans `applyMigration()` + tests unitaires 33/33 ✓ + **self-exclusion** du script pour éviter l'auto-migration de ses propres tests (bug détecté lors de session 1).
- ✅ **Sélecteurs CSS `globals.css` dual-targeting** : les règles dark mode qui ciblaient `.text-navy` / `.bg-navy` acceptent désormais **les deux** (`.text-navy, .text-seal-navy { ... }`) pour éviter tout risque de régression sur les rares fichiers non migrés (templates, pages isolées).
- ✅ **Fix manuel** : classe invalide `seal-text-navy` corrigée en `text-seal-navy` dans `app/(app)/search/v2/page.tsx:202`.
- ✅ **TypeScript** : `tsc --noEmit` passe sans erreur.
- ✅ **Ratio final seal-* / legacy** : **2 856 seal-\* vs 5 navy (CSS dual) + 3 bg-taupe** = **~99,7 % migré**.

## 2. Compteurs avant / après

| Indicateur | Fin session 1 | Fin session 2 | Delta |
|---|---:|---:|---:|
| Classes `seal-*` totales | 1 750 | **2 856** | +1 106 |
| `seal-navy` (nouveau token) | 0 | **1 212** | +1 212 |
| `text-navy` (utilitaire) | 323+ | **2** (sélecteurs CSS intentionnels) | -321 |
| `bg-navy` / variants | 14+ | **3** (sélecteurs CSS intentionnels) | -11 |
| `border-navy` / variants | 7+ | **0** | -7 |
| `from/to/via/ring-navy` | inconnu | **0** | -all |
| `bg-taupe` / variants | 3 | **3** (HelpdeskChat, reportés pour session 3) | 0 |
| **Total legacy migrable restant** | ~1 216 | **0** | **-100 %** |

## 3. Fichiers modifiés session 2 (6 commits)

| Commit | Scope | Fichiers | Remplacements |
|---|---|---:|---:|
| `8b448b3` | Token `seal-navy` (tailwind + css) | 2 | — |
| `0ab1f84` | Script étendu + self-exclusion + tests | 1 | — |
| `167827c` | `packages/ui/**` | 13 | 16 |
| `e0eb105` | `components/**` (layout, widgets, ai, viewers) | 48 | 131 |
| `f7c7daf` | `app/**` (admin, app, auth, public, root) | 86 | 1 062 |
| `3b4a2ad` | `lib/ui/tokens.ts` + ambiguous doc refresh | 2 | 3 |
| **Total** | | **152** | **~1 212** |

## 4. Ce qui reste (session 3 potentielle)

Seuls 3 cas mineurs subsistent — **non bloquants**, tous intentionnels ou de scope distinct :

| # | Classe | Occurrences | Fichier | Traitement recommandé |
|---|---|---:|---|---|
| 1 | `bg-taupe/50` | 3 | `helpdesk/HelpdeskChat.tsx:653-655` (dots animés typing indicator) | Session 3 : remplacer par `bg-seal-gray-300/50` ou token dédié |
| 2 | Sélecteurs CSS legacy `.text-navy`, `.bg-navy` | 5 | `globals.css:194,201,202,1174,1182` | **À conserver** (dual-targeting intentionnel pour rétro-compat) |
| 3 | Convention PageHeader | 62 H1 maison | divers `page.tsx` | Session 3 originale (hors scope session 2) |

## 5. Validation technique

- ✅ **Self-test du script** : 33/33 tests passent (12 taupe + 8 navy + 5 faux-positifs anti-regression + 8 ambiguous detection).
- ✅ **`tsc --noEmit`** : zéro erreur.
- ✅ **Dry-run final** : 0 remplacement en attente sur le scope migrable. Le script ne trouve plus rien à migrer.
- ⏸ **Build E2E** : non relancé (bundler Next.js — proxy `tsc` utilisé).
- ⏸ **Review visuelle** : requise avant merge, voir §6.

## 6. Screenshots recommandés pour review humaine

**Priorité 1** — pages qui utilisent massivement `text-seal-navy` et `bg-seal-navy/10` :

| Page | Raison |
|---|---|
| `/dashboard` | Page vitrine, 70+ remplacements |
| `/documents/[id]` | Plus gros diff (142 remplacements) |
| `/admin` | Hub admin refondu + classes seal-navy |
| `/admin/audit` | Page fusion + classes seal-navy dans tabs |
| `/tickets` | 148 remplacements |
| `/login` | Page auth, variants navy dans Button |
| `/wiki` | WikiContent + RunbooksContent |
| `/profile` | 54 remplacements |

**Priorité 2** — vérifier les variants React qui utilisent navy :

- `<Badge variant="navy">` et `<Badge variant="seal-blue">` — couleurs doivent rester **distinctes** (navy = #004469, seal-blue = #296DC1).
- `<Button variant="navy-outline">` — `button.tsx:14` utilise désormais `border-seal-navy text-seal-navy hover:bg-seal-navy hover:text-white`.

**Comparaison clé** : aucune différence visuelle attendue entre session 1 et session 2 (le token `seal-navy` = `navy` legacy à l'octet près). Si divergence visuelle → bug de render à identifier.

## 7. Choix faits en autonomie

1. **Strategy `AMBIGUOUS_RE`** modifié : navy retiré du pattern ambigu (désormais migré par `NAVY_UTIL_RE`). `AMBIGUOUS_RE` ne liste plus que `bg/from/to/via/ring-taupe` (pas d'équivalent seal-gray pour ces utilitaires).

2. **Self-exclusion du script** : `SELF_EXCLUDE = new Set(['scripts/seal-migrate.mjs'])` pour éviter que les chaînes littérales dans les tests unitaires (`['text-taupe', 'text-seal-gray-500', ...]`) ne soient migrées. Bug détecté en session 1 et corrigé en session 2.

3. **Dual-targeting CSS** : les 5 sélecteurs CSS dans `globals.css` (dark mode overrides + `@media print`) ciblent **à la fois** l'ancienne et la nouvelle classe. Choix défensif : une page externe ou un template mail pourrait encore utiliser `text-navy` — le dark mode continuera à fonctionner.

4. **Fix typo `seal-text-navy`** : classe invalide dans `search/v2/page.tsx:202` (pré-existante, antérieure à session 1). Corrigée en `text-seal-navy`.

5. **Commits atomiques par scope** : 6 commits rollbackables indépendamment (packages/ui peut être revert sans toucher components).

## 8. Blockers pour session 3

Session 3 originale (finalisation) traite :

1. **Convention PageHeader** : remplacer 62 H1 maison par composant `packages/ui/src/page-header.tsx` (ou `components/layout/page-header.tsx` existant, à vérifier).
2. **Linter ESLint custom** : `no-legacy-seal-classes` qui `warn` sur `text-navy`, `bg-navy`, etc. hors fichiers `.css`.
3. **`bg-taupe/50`** : 3 occurrences dans HelpdeskChat → décision finale (remplacer par `bg-seal-gray-300/50` ? créer `seal-gray-50` ?).
4. **Documentation `docs/design-system/SEAL_USAGE.md`** : guide utilisation pour futurs contributeurs.
5. **Nettoyage eventual du token `navy` legacy** : quand plus aucune occurrence ne l'utilise vraiment (actuellement toujours déclaré dans `tailwind.config.ts:40-48` pour safety).

## 9. Commandes de review

```bash
# Récupérer la branche
git checkout chore/seal-design-system-migration

# Diff session 2 uniquement (6 derniers commits)
git log --oneline chore/seal-design-system-migration ^HEAD~9..HEAD

# Compteurs après session 2
grep -rE "(text|bg|border|ring|from|to|via)-navy(\b|-|/|:)" apps/frontend/src packages/ | wc -l
# → 5 (tous dans globals.css, intentionnels dual-targeting)

grep -rE "seal-navy" apps/frontend/src packages/ | wc -l
# → 1212

grep -rE "seal-" apps/frontend/src packages/ | wc -l
# → 2856

# Self-test du script
node scripts/seal-migrate.mjs --self-test
# → 33 pass, 0 fail

# Dry-run global (rien à faire)
node scripts/seal-migrate.mjs
# → Remplacements auto : 0

# Type-check
cd apps/frontend && pnpm tsc --noEmit
```

---

**Session 2 close.** Token `seal-navy` créé et propagé. 99,7 % des classes legacy migrées. Prochaine étape : session 3 (PageHeader + linter + docs design system).
