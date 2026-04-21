# Breadcrumbs globaux — Intranet OMNITECH

**Statut** : actif depuis 2026-04-21 (Mission UX-1).

## Fonctionnement

Les breadcrumbs sont générés **automatiquement** depuis `usePathname()` Next.js.
Chaque segment d'URL est traduit en label FR via un mapping centralisé.

### Exemples

| URL | Breadcrumb affiché |
|---|---|
| `/tickets` | Accueil › Tickets |
| `/documents/abc-uuid-123` | Accueil › Documents › [titre du document] |
| `/admin/feedback` | Accueil › Administration › Avis & enquêtes |
| `/media/albums/salon-milipol-2026` | Accueil › Médiathèque › Albums › Salon Milipol 2026 |

### Segments dynamiques

Un segment est considéré "dynamique" (UUID ou slug long) et fait l'objet d'un
**lookup API asynchrone** pour afficher le titre réel de l'entité. Pendant la
résolution, "Chargement…" est affiché temporairement.

Le lookup fonctionne pour 9 types d'entités courants :

| Segment parent | Endpoint | Champ affiché |
|---|---|---|
| `documents` | `/documents/:id` | `title` |
| `tickets` | `/tickets/:id` | `reference` |
| `incidents` | `/incidents/:id` | `reference` |
| `news` | `/news/:slug` | `title` |
| `wiki` | `/wiki/:slug` | `title` |
| `runbooks` | `/runbooks/:slug` | `title` |
| `procedures` | `/procedures/:id` | `title` |
| `albums` | `/media/albums/:slug` | `title` |
| `workflows` | `/approval-workflows/:id` | `name` |

## Ajouter un mapping

Éditer `apps/frontend/src/config/breadcrumbs-labels.ts` :

```typescript
export const BREADCRUMBS_LABELS: Record<string, BreadcrumbLabelConfig> = {
  // ...
  'mon-nouveau-module': { label: 'Mon nouveau module' },
};
```

## Ajouter un lookup dynamique personnalisé

Pour les entités dont le fallback ne suffit pas, déclarer explicitement dans
`DYNAMIC_LABEL_LOOKUPS` :

```typescript
export const DYNAMIC_LABEL_LOOKUPS: Record<string, (id: string) => Promise<string | null>> = {
  'mon-module': async (id) => {
    const { data } = await api.get(`/mon-module/${id}`);
    return data?.title ?? null;
  },
};
```

## Comportement responsive

- **Desktop** : tous les niveaux visibles (max-w 200px par item, truncate au-delà)
- **Mobile** : si > 3 niveaux, on affiche `Accueil › [1er item] › … › [avant-dernier] › [actif]`

## Masquage

Les breadcrumbs sont **masqués** sur :

- `/dashboard` (page racine, inutile d'afficher "Accueil > Tableau de bord")
- Pages auth (`(auth)/*` — géré via le fait que le layout `(app)` ne s'applique pas)

## Implémentation

- Composant : `apps/frontend/src/components/ui/breadcrumbs.tsx`
- Config labels : `apps/frontend/src/config/breadcrumbs-labels.ts`
- Intégration : `apps/frontend/src/app/(app)/layout.tsx` (entre Header et `<main>`)
- Tests : `apps/frontend/src/config/__tests__/breadcrumbs-labels.test.ts`

## Pattern alternatif : `<EntityBreadcrumb>` (legacy)

Pour les pages détail avec un pattern fixe `Module / Référence`, il existe
`apps/frontend/src/components/ui/entity-breadcrumb.tsx` qui reste utilisable
dans certaines pages (ex: incidents, tickets legacy). Il sera progressivement
remplacé par les breadcrumbs globaux pour éviter la duplication.
