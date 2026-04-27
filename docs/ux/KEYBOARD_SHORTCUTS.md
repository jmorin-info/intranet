# Raccourcis clavier — Intranet OMNITECH

**Statut** : actif depuis 2026-04-21 (Mission UX-1).

## Catalogue

### Navigation rapide — séquences `g <lettre>`

Pattern vim-like : presser `g` puis la lettre dans les 1500 ms qui suivent.

| Raccourci | Destination            | Rôle requis       |
| --------- | ---------------------- | ----------------- |
| `g d`     | `/dashboard`           | Tous              |
| `g t`     | `/tickets`             | Tous              |
| `g w`     | `/wiki`                | Tous              |
| `g m`     | `/media` (médiathèque) | Tous              |
| `g n`     | `/news`                | Tous              |
| `g i`     | `/incidents`           | Tous              |
| `g a`     | `/admin`               | ADMIN+ uniquement |

**Escape** réinitialise toute séquence en cours.

### Actions directes — combinaisons simultanées

| Raccourci       | Action                                                               |
| --------------- | -------------------------------------------------------------------- |
| `Ctrl+K` / `⌘K` | Ouvrir la palette de commandes rapide                                |
| `Ctrl+Shift+K`  | Ouvrir l'assistant IA (chatbot)                                      |
| `Ctrl+Shift+D`  | Aller aux Documents (GED)                                            |
| `Ctrl+Shift+T`  | Aller aux Tickets                                                    |
| `Ctrl+Shift+I`  | Aller aux Incidents                                                  |
| `Ctrl+Shift+N`  | Aller aux Actualités                                                 |
| `Ctrl+Shift+W`  | Aller au Wiki                                                        |
| `Ctrl+Shift+P`  | Aller aux Outils PDF                                                 |
| `Ctrl+Alt+1-5`  | Naviguer entre les hubs (Mon espace, Travail, Sécurité, Admin, RSSI) |

### Accessibilité

| Raccourci | Action                                                         |
| --------- | -------------------------------------------------------------- |
| `?`       | Afficher la modal d'aide raccourcis                            |
| `Alt+S`   | Sauter au contenu principal (pattern sites gouvernementaux FR) |
| `Alt+A`   | Sauter aux actions de la page (barre d'actions dans le header) |
| `Tab`     | Parcourir les skip-links (visibles uniquement au focus)        |
| `Escape`  | Fermer modales / annuler séquences                             |

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

## Raccourcis spécifiques — Tickets (Wave C)

Actifs uniquement sur la liste tickets `/tickets` (hook `useTicketShortcuts`,
fichier `apps/frontend/src/components/tickets/ticket-shortcuts.tsx`).

| Raccourci | Action                                     |
| --------- | ------------------------------------------ |
| `c`       | Créer un nouveau ticket (modale)           |
| `j`       | Sélectionner le ticket suivant             |
| `k`       | Sélectionner le ticket précédent           |
| `Enter`   | Ouvrir le ticket sélectionné               |
| `e`       | M'assigner le ticket sélectionné           |
| `r`       | Marquer le ticket sélectionné comme résolu |
| `?`       | Afficher la modal d'aide                   |

Ces raccourcis sont automatiquement désactivés dès que le focus est dans un
champ de saisie (input, textarea, contenteditable). Ils ignorent aussi les
combinaisons avec un modifier (Ctrl/Cmd/Alt) pour ne pas entrer en conflit
avec les raccourcis globaux.

## Raccourcis spécifiques — Éditeur WYSIWYG (Wave C)

Actifs dans le `RichTextEditor` (wiki, news, procédures) :

| Raccourci          | Action                                                                   |
| ------------------ | ------------------------------------------------------------------------ |
| `Cmd/Ctrl+S`       | Sauvegarder (déclenche `onSave` ; intercepte la sauvegarde page browser) |
| `Cmd/Ctrl+B`       | Gras (natif contentEditable)                                             |
| `Cmd/Ctrl+I`       | Italique (natif contentEditable)                                         |
| `Cmd/Ctrl+K`       | Insérer un lien (prompt URL via `onInsertLink(selectedText)`)            |
| `Cmd/Ctrl+Shift+K` | Insérer un lien wiki `[[` (`onInsertWikiLink`)                           |
| `Cmd/Ctrl+Enter`   | Publier (depuis modale de validation, géré par parent)                   |

L'autosave local toutes les 5 s (`useEditorAutosave`) restaure un brouillon
si `localStorage` contient une version plus récente que le serverValue à
l'ouverture.

## Implémentation technique

- Hook navigation globale : `apps/frontend/src/hooks/use-keyboard-shortcuts.ts`
- Hook tickets : `apps/frontend/src/components/tickets/ticket-shortcuts.tsx` (`useTicketShortcuts`)
- Modal d'aide globale : `apps/frontend/src/components/ui/keyboard-shortcuts-dialog.tsx`
- Modal d'aide tickets : `apps/frontend/src/components/tickets/ticket-shortcuts.tsx` (`TicketShortcutsModal`)
- Intégration : `apps/frontend/src/app/(app)/layout.tsx` + `apps/frontend/src/app/(app)/tickets/page.tsx`
- Tests : `apps/frontend/src/config/__tests__/breadcrumbs-labels.test.ts` (mapping global)
