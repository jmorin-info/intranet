# Storybook + Chromatic — design system OMNITECH

Le package `@omnitech/ui` contient les composants partages entre toutes les
applications OMNITECH (intranet aujourd'hui, futurs portails clients demain).
Storybook documente chaque composant en isolation et Chromatic detecte les
regressions visuelles sur les PRs.

## Stack

- **Storybook 8** (Vite + React)
- **Tailwind CSS** + tokens SEAL (cf [`SEAL_USAGE.md`](./SEAL_USAGE.md))
- **`@storybook/addon-essentials`** : controls, actions, viewport, backgrounds
- **`@storybook/addon-themes`** : toggle light / dark
- **Chromatic** (gere par GitHub Action sur les PRs)

## Lancer en local

```bash
pnpm --filter @omnitech/ui storybook
# -> http://localhost:6006
```

Le hot-reload Vite reagit aux modifications des fichiers `*.tsx` et `*.css`.
La charte SEAL est chargee via `packages/ui/.storybook/preview.css`.

## Build statique

```bash
pnpm --filter @omnitech/ui build-storybook
# -> packages/ui/storybook-static/
```

Le dossier de sortie est ignore par git (`.gitignore` racine `storybook-static/`).

## Stories couvertes (MVP)

19 stories dans `packages/ui/src/`. Chaque composant a son fichier
`<composant>.stories.tsx` a cote du `.tsx` :

| Composant            | Variantes documentees                               |
| -------------------- | --------------------------------------------------- |
| `Avatar`             | size sm/md/lg/xl, fallback initiales, image         |
| `Badge`              | variant primary/success/warning/danger/neutral      |
| `Button`             | primary/secondary/ghost/danger, sizes, loading      |
| `Card`               | default, with header, with footer, dark mode        |
| `DataTable`          | empty, loading, with rows, sortable                 |
| `Dialog`             | confirm, alert, form                                |
| `EmptyState`         | with icon, with action, dark mode                   |
| `FileUploadZone`     | drag-over, success, error                           |
| `Input`              | text, email, password, error, disabled              |
| `IsoControlBadge`    | A.5.x / A.8.x avec couleurs                         |
| `SearchInput`        | with results, empty, loading                        |
| `Select`             | basic, with groups, multi                           |
| `SignatureBadge`     | pending, signed, expired, refused                   |
| `Skeleton`           | card, row, list                                     |
| `StatusBadge`        | open / in_progress / closed / archived              |
| `Tabs`               | horizontal, vertical, with badges                   |
| `Textarea`           | basic, with counter, error                          |
| `Tooltip`            | top / right / bottom / left                         |
| `WorkflowTimeline`   | etapes en cours / completed / pending               |

Plus la page `Introduction.mdx` qui presente la charte SEAL.

## Ajouter une story

```tsx
// packages/ui/src/my-component.stories.tsx
import type { Meta, StoryObj } from '@storybook/react';
import { MyComponent } from './my-component';

const meta = {
  title: 'Components/MyComponent',
  component: MyComponent,
  tags: ['autodocs'],   // genere une page Docs auto
  parameters: {
    layout: 'centered',
  },
  argTypes: {
    variant: { control: 'select', options: ['primary', 'secondary'] },
  },
} satisfies Meta<typeof MyComponent>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { variant: 'primary' },
};

export const Secondary: Story = {
  args: { variant: 'secondary' },
};
```

Conventions :

- Une story `Default` qui montre l'usage canonique.
- Une story par variant principale (primary / secondary / danger / etc.).
- Pour les composants stateful, faire au moins une story `Loading` /
  `Error` / `Empty`.
- Tags `['autodocs']` sur le `meta` pour generer la page docs.

## Charte visuelle (SEAL)

Les stories doivent utiliser :

- **Couleurs** : `text-seal-navy`, `bg-primary`, `border-seal-gray-300`...
  cf [`SEAL_USAGE.md`](./SEAL_USAGE.md).
- **Typographie** : `font-sans` (Century Gothic / Nunito) chargee dans
  `preview.css`.
- **Backgrounds** : 3 backgrounds sont disponibles dans la barre Storybook
  (`surface`, `white`, `navy`).
- **Dark mode** : toggle dans la toolbar (icone soleil/lune). Verifier que
  chaque story rend correctement dans les deux themes.

## Chromatic — visual regression sur les PRs

### Workflow

Le workflow `.github/workflows/chromatic.yml` se declenche :

- **Sur PR** : si les fichiers `packages/ui/**`, `globals.css` ou
  `tailwind.config.ts` changent.
- **Sur push** vers `main` / `feat/p1-9-prelaunch` : meme filtre.

Etapes :

1. Build du Storybook (`pnpm --filter @omnitech/ui build-storybook`).
2. Upload sur Chromatic (compare aux baselines de la branche cible).
3. Si regression visuelle detectee : status check rouge sur la PR, lien vers
   Chromatic pour reviewer / accepter chaque diff.

### Configuration requise

1. Creer le projet sur https://www.chromatic.com (lier au repo GitHub).
2. Recuperer le `CHROMATIC_PROJECT_TOKEN` dans `Chromatic > Manage > Configure`.
3. Settings GitHub > Secrets and variables > Actions > New secret :
   - Nom : `CHROMATIC_PROJECT_TOKEN`
   - Value : (le token recupere)

### Optimisation : TurboSnap

Le workflow utilise `onlyChanged: true` qui ne re-snapshote que les stories
impactees par le diff git. Sur un changement isole d'un composant, on
economise 80-90% du quota Chromatic.

### Auto-accept sur main

Lorsque le push arrive sur `main`, on auto-accepte les changements
(`autoAcceptChanges: true`) — la baseline est mise a jour automatiquement.
Sur les PRs, le reviewer doit explicitement accepter.

## A11y

L'addon `@storybook/addon-a11y` (a installer plus tard) detecte les
problemes WCAG 2.1 AA dans le panel. En attendant, les composants sont
audites par `pnpm --filter frontend run a11y` (axe-core).

## Liens utiles

- Storybook local : http://localhost:6006
- Storybook deploye : https://chromatic.com/library?appId=<projet-id>
  (URL communiquee dans la PR par le bot Chromatic)
- Docs Storybook 8 : https://storybook.js.org/docs
- Docs Chromatic : https://www.chromatic.com/docs
