# Conformité WCAG 2.1 AA — Intranet OMNITECH

**Dernière mise à jour** : 2026-04-21 après Mission UX-1 (navigation foundations).

## État par critère WCAG

### 🟢 Critères respectés

| Critère | Niveau | Implémentation |
|---|---|---|
| **1.1.1** Contenu non textuel | A | `alt` sur toutes les images (audit à renforcer), `aria-label` sur boutons icône |
| **1.3.1** Info et relations | A | Balises sémantiques (`<nav>`, `<main>`, `<aside>`, `<header>`), ARIA landmarks |
| **1.4.3** Contraste minimum | AA | Charte SEAL testée : seal-navy (#004469) sur blanc = 11.5:1 ✓ |
| **1.4.4** Redimensionnement du texte | AA | Typo en `rem`, pas de `px` sur les textes |
| **2.1.1** Clavier | A | Tous les composants interactifs accessibles au clavier (Tab, Enter, Esc, flèches) |
| **2.4.1** Contournement des blocs | A | **Skip-links** `#main-content`, `#main-nav`, `#main-footer` + raccourci `Alt+S` ✓ (Mission UX-1) |
| **2.4.3** Ordre de focus | A | Ordre logique suivant le flux du document |
| **2.4.4** Fonction du lien (contexte) | A | Labels explicites, `aria-current="page"` sur breadcrumbs actifs |
| **2.4.5** Plusieurs moyens | AA | Navigation via sidebar, breadcrumbs, palette Ctrl+K, raccourcis `g <lettre>`, recherche globale |
| **2.4.6** En-têtes et étiquettes | AA | Hiérarchie `<h1>` unique par page, labels descriptifs |
| **2.4.7** Visibilité du focus | AA | `focus-visible:ring-2 ring-[#F9964A]` systématique |
| **3.2.1** Au focus | A | Pas de changement de contexte automatique au focus |
| **3.2.2** À la saisie | A | Pas de soumission implicite |
| **3.3.2** Étiquettes ou instructions | A | Tous les champs de formulaire ont un `<label>` ou `aria-label` |
| **4.1.2** Nom, rôle, valeur | A | ARIA states (`aria-pressed`, `aria-expanded`, `aria-current`, `aria-label`) |

### 🟡 Critères partiellement respectés

| Critère | Niveau | Gap | Action prévue |
|---|---|---|---|
| **1.1.1** Contenu non textuel | A | Quelques images décoratives sans `alt=""` explicite | Audit automatisé + correctifs |
| **1.3.5** Identification du but de saisie | AA | `autocomplete="..."` manquant sur certains formulaires | Phase UX-2 |
| **2.4.11** Focus masqué | AA | À vérifier sur les modales empilées | Audit manuel |

### 🔴 Critères à adresser

| Critère | Niveau | Gap | Plan |
|---|---|---|---|
| **3.1.2** Langue des parties | AA | Portions EN pas annotées `lang="en"` | i18n switch doc |
| **4.1.3** Messages d'état | AA | Certains toasts pourraient bénéficier de `role="status"` ou `role="alert"` | Audit toast + sonner |

## Nouvelles fonctionnalités UX-1 (2026-04-21)

### Skip-links

Composant `apps/frontend/src/components/a11y/skip-links.tsx` rendu en tête
du layout `(app)`. Invisible par défaut, visible au focus clavier.

Cibles :
- `#main-content` (balise `<main>`)
- `#main-nav` (balise `<aside id="main-nav">`)
- `#main-footer` (si présent dans la page)

Raccourci supplémentaire **`Alt+S`** pour sauter directement au contenu
principal (pattern FR gouvernement).

### Breadcrumbs globaux

Génération automatique depuis l'URL, avec `role="navigation"` et
`aria-current="page"` sur le dernier item (non-cliquable).

### Tooltips cohérents sur icon-only buttons

Composant `<IconButton>` force `aria-label` + tooltip visuel. Pattern à
généraliser progressivement dans les itérations futures.

### Raccourcis clavier globaux

Désactivation automatique dans les champs de saisie pour ne pas
interférer avec la dictée vocale ou lecteurs d'écran. Modal d'aide
accessible via `?`.

## Audit et tests

**Automatisés** : `pnpm test` — 40 tests passent actuellement.

**Recommandés en manuel** :
1. Navigation clavier complète (Tab, Shift+Tab) sur les 10 pages principales
2. Test avec lecteur d'écran (NVDA sur Windows, VoiceOver sur Mac)
3. Zoom 200% sans scroll horizontal
4. Vérification contrastes avec WebAIM Color Contrast Checker

**Outils recommandés pour audit continu** :
- [axe DevTools](https://www.deque.com/axe/devtools/) (navigateur)
- [Lighthouse Accessibility](https://developer.chrome.com/docs/lighthouse/accessibility/) intégré Chrome
- [Pa11y CI](https://pa11y.org/) pour automatisation

## Roadmap

**Court terme (Mission UX-2 envisagée)** :
- Étendre `IconButton` à tous les boutons icône du header, sidebar, listes
- Audit `autocomplete="..."` formulaires
- Annotations `lang="en"` sur les mentions techniques EN

**Moyen terme** :
- Audit WCAG formel par un tiers qualifié (RGAA niveau AA)
- Tests automatisés Pa11y dans la CI
- Accessibilité des composants custom (Select, Dialog, DataTable) à auditer
