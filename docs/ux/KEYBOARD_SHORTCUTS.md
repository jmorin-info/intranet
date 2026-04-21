# Raccourcis clavier — Intranet OMNITECH

**Statut** : actif depuis 2026-04-21 (Mission UX-1).

## Catalogue

### Navigation rapide — séquences `g <lettre>`

Pattern vim-like : presser `g` puis la lettre dans les 1500 ms qui suivent.

| Raccourci | Destination | Rôle requis |
|---|---|---|
| `g d` | `/dashboard` | Tous |
| `g t` | `/tickets` | Tous |
| `g w` | `/wiki` | Tous |
| `g m` | `/media` (médiathèque) | Tous |
| `g n` | `/news` | Tous |
| `g i` | `/incidents` | Tous |
| `g a` | `/admin` | ADMIN+ uniquement |

**Escape** réinitialise toute séquence en cours.

### Actions directes — combinaisons simultanées

| Raccourci | Action |
|---|---|
| `Ctrl+K` / `⌘K` | Ouvrir la palette de commandes rapide |
| `Ctrl+Shift+K` | Ouvrir l'assistant IA (chatbot) |
| `Ctrl+Shift+D` | Aller aux Documents (GED) |
| `Ctrl+Shift+T` | Aller aux Tickets |
| `Ctrl+Shift+I` | Aller aux Incidents |
| `Ctrl+Shift+N` | Aller aux Actualités |
| `Ctrl+Shift+W` | Aller au Wiki |
| `Ctrl+Shift+P` | Aller aux Outils PDF |
| `Ctrl+Alt+1-5` | Naviguer entre les hubs (Mon espace, Travail, Sécurité, Admin, RSSI) |

### Accessibilité

| Raccourci | Action |
|---|---|
| `?` | Afficher la modal d'aide raccourcis |
| `Alt+S` | Sauter au contenu principal (pattern sites gouvernementaux FR) |
| `Alt+A` | Sauter aux actions de la page (barre d'actions dans le header) |
| `Tab` | Parcourir les skip-links (visibles uniquement au focus) |
| `Escape` | Fermer modales / annuler séquences |

## Comment ajouter un nouveau raccourci

### Séquentiel (`g <lettre>`)

Éditer `apps/frontend/src/app/(app)/layout.tsx` → tableau `sequentialShortcuts` :

```typescript
{
  key: 'x',              // lettre après `g`
  label: 'Ma page',      // pour la modal d'aide
  href: '/ma-page',      // destination
  enabled: () => true,   // prédicat optionnel (ex: restriction rôle)
}
```

Ajouter ensuite l'entrée dans la section "Navigation rapide" de la modal
`components/ui/keyboard-shortcuts-dialog.tsx`.

### Direct (`Ctrl+Shift+X`)

Éditer `apps/frontend/src/app/(app)/layout.tsx` → constante `KEYBOARD_SHORTCUTS`.

## Règles de désactivation

Les raccourcis globaux (séquentiels + `?`) sont **automatiquement désactivés**
quand le focus est sur :

- `<input>`, `<textarea>`, `<select>`
- Élément `contenteditable`
- Éléments avec `role="textbox"`, `role="combobox"`, `role="searchbox"`

Les actions directes `Ctrl+Shift+*` fonctionnent partout (ce sont de vraies
combinaisons que l'utilisateur doit presser intentionnellement).

## Implémentation technique

- Hook : `apps/frontend/src/hooks/use-keyboard-shortcuts.ts`
- Modal d'aide : `apps/frontend/src/components/ui/keyboard-shortcuts-dialog.tsx`
- Intégration : `apps/frontend/src/app/(app)/layout.tsx`
- Tests : `apps/frontend/src/config/__tests__/breadcrumbs-labels.test.ts` (tests du mapping)
