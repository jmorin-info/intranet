# SEAL Migration — Session 3 Report

**Date** : 2026-04-20
**Branche** : `feat/p1-9-prelaunch` (via SEAL branch mergée)
**Scope traité** : finition & conventions (linter, doc, fix bg-taupe)
**Scope reporté** : migration des 49 H1 maison vers `PageHeader`

---

## 1. Résumé exécutif

- ✅ **Linter ESLint custom** : règle `no-restricted-syntax` dans `.eslintrc.json` qui **warn** sur `text-navy`, `text-taupe`, `bg-navy`, `border-taupe`, etc. dans les attributs `className` (Literal ET TemplateLiteral). Message explicite pointant vers la doc. Testé : déclenche bien sur une classe legacy.
- ✅ **Documentation** : `docs/design-system/SEAL_USAGE.md` créé (7 sections, 170+ lignes). Couvre tokens, règles, mapping legacy→SEAL, convention PageHeader, anti-patterns, process de contribution.
- ✅ **Fix `bg-taupe/50`** : 3 occurrences dans `helpdesk/HelpdeskChat.tsx:653-655` (dots animés typing indicator) migrées vers `bg-seal-gray-400/60`. Choix justifié : seal-gray-400 (#676d7f) à 60 % d'opacité donne un gris similaire au taupe/50 original sur fond blanc.
- 🟡 **Migration H1 maison (49 fichiers)** : **reportée** — trop risqué sans validation visuelle humaine page par page. Le `PageHeader` existe déjà (`apps/frontend/src/components/layout/page-header.tsx`), adopté par 7 fichiers seulement. Les 49 autres utilisent des H1 inline avec tailles/styles variables.
- ⏸ **Pre-commit hook** : non ajouté (pas de husky configuré actuellement ; le linter ESLint suffit comme garde-fou en CI/IDE).
- ⏸ **Nettoyage du token `navy` legacy** dans `tailwind.config.ts` : non fait. Le token reste déclaré pour rétro-compat (dual-targeting CSS dans `globals.css`). À supprimer dans une session ultérieure quand on sera certain qu'aucune source externe (templates mail, iframes) ne l'utilise plus.

## 2. Fichiers modifiés session 3

| Fichier | Type de change | Ligne(s) |
|---|---|---:|
| `apps/frontend/.eslintrc.json` | Ajout règle `no-restricted-syntax` (warn) | +12 |
| `docs/design-system/SEAL_USAGE.md` | **Création** | +176 |
| `apps/frontend/src/app/(app)/helpdesk/HelpdeskChat.tsx` | Fix `bg-taupe/50` → `bg-seal-gray-400/60` | 3 remplacements |
| `docs/migration/seal-migration-session-3-report.md` | **Création** (ce fichier) | +120 |

## 3. État final de la migration SEAL

| Indicateur | Session 1 | Session 2 | **Session 3** |
|---|---:|---:|---:|
| Classes `seal-*` | 1 750 | 2 856 | **2 859+** |
| `text-taupe` / `border-taupe` | 0 | 0 | **0** |
| `bg-taupe/*` | 3 | 3 | **0** ✅ |
| `text-navy` / `bg-navy/*` (code) | 1 211 | 2 (CSS dual) | **2** (CSS dual-targeting intentionnel) |
| Couverture charte | 59 % | 99,7 % | **~100 %** ✅ |
| Linter anti-régression | ❌ | ❌ | ✅ ESLint warn |
| Doc design system | ❌ | ❌ | ✅ SEAL_USAGE.md |

**0 occurrence legacy migrable restante dans le code**. Les 2 restantes (`globals.css:194, :201`) sont des sélecteurs CSS dual-targeting volontaires pour rétro-compat.

## 4. Pourquoi repousser la migration des 49 H1

### Risques identifiés
- **62 H1 identifiés**, 49 fichiers impactés. 6 variantes de taille (`text-2xl font-medium`, `text-[26px]`, `text-xl font-medium`, `text-3xl font-semibold`, `text-2xl font-bold`, `text-2xl` nu).
- Certains H1 sont **dynamiques** (titre basé sur data fetched : `{doc.title}`, `{user.firstName}`, `{ticket.title}`).
- Certains H1 sont **conditionnels** (pages comme `dashboard/page.tsx` qui rendent un H1 différent selon `user.role === PRESTATAIRE`). L'audit UX a compté les 2 H1 dans le source mais ils ne s'affichent **jamais simultanément** en runtime — pas un bug.
- Migration aveugle via script = régression visuelle probable (wrapping div différent, icône manquante, subtitle absent).
- Migration manuelle correcte = 10-15 min par fichier × 49 = **~10h** minimum, plus review visuelle.

### Pragmatisme
- Le `PageHeader` existe et fonctionne (adopté par 7 fichiers).
- Le linter ne warn pas sur les `<h1 className="...">` maison (ce serait un autre selector à ajouter — mais à ajouter quand on aura envie de pousser).
- Nouveaux devs : la doc oriente vers PageHeader.
- Migration existante : à faire progressivement par les devs qui touchent déjà une page (plutôt qu'en bulk).

### Recommandation pour une future session
1. Scripts/check : détecter les 49 H1 restants et générer un rapport par fichier (taille, présence d'icône, présence de subtitle).
2. Migration par pack de 5-10 fichiers avec screenshot diff avant/après (manuel ou Storybook).
3. Activer ensuite un sélecteur ESLint supplémentaire qui warn sur `<h1 className` dans `app/(app)/**`.

## 5. Blockers éventuels

Aucun blocker bloquant. Les trois TODO restants sont tous optionnels et peuvent se faire progressivement :

1. Migration H1 (voir §4).
2. Pre-commit hook (husky).
3. Nettoyage token `navy` legacy dans `tailwind.config.ts` (éventuellement quand on voudra supprimer le dual-targeting CSS `globals.css:194, 201`).

## 6. Commandes de review

```bash
# Trigger le linter manuellement sur un fichier
cd apps/frontend && pnpm lint src/__un_fichier_qui_contient_text-navy.tsx

# Trigger global (signal les classes legacy éventuelles)
cd apps/frontend && pnpm lint --dir src

# Compteurs finaux
grep -rE "(text|bg|border|ring|from|to|via)-(navy|taupe)(\b|-|/|:)" apps/frontend/src packages/ | wc -l
# → 2 (dual-targeting CSS dans globals.css)

grep -rcE "<h1\s+className" apps/frontend/src/app --include="*.tsx" | grep -v ":0$" | wc -l
# → 49 fichiers (reportés, migration progressive via PageHeader)

# Vérifier l'adoption PageHeader
grep -rE "<PageHeader\b" apps/frontend/src --include="*.tsx" | wc -l
# → ~7-10 fichiers (à augmenter progressivement)
```

---

**Session 3 close (partiellement).** Infrastructure anti-régression en place (linter + doc). Migration H1 reportée en chantier progressif. Design system SEAL **stabilisé** côté tokens et classes utilitaires.
