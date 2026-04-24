# OMNITECH Intranet

Intranet GED sécurisé OMNITECH Security — ISO 27001:2022.

Monorepo `pnpm` + `turbo` :

- `apps/frontend` — Next.js 15 / React 19
- `apps/backend` — NestJS
- `packages/*` — code partagé (`@omnitech/shared`, `@omnitech/ui`, `@omnitech/database`)

## Démarrage rapide

```bash
pnpm install
pnpm db:generate
pnpm dev
```

## Build hardening

Le build local reste tolérant (`eslint.ignoreDuringBuilds: true` dans
`apps/frontend/next.config.js`) afin de ne pas bloquer le développement, mais
plusieurs garde-fous sont en place pour piloter la dette lint et la taille
du bundle.

- `pnpm --filter @omnitech/frontend lint` — exécute `next lint` et affiche les
  warnings/errors actuels (non bloquant).
- `pnpm --filter @omnitech/frontend lint:strict` — exécute
  `next lint --max-warnings 0` ; échoue dès le premier warning. Utilisé par la
  CI (`.github/workflows/lint-strict.yml`) sur chaque pull request pour empêcher
  l'introduction de nouvelles violations.
- `pnpm --filter @omnitech/frontend analyze` — équivalent à
  `ANALYZE=true next build` ; produit un rapport HTML interactif (via
  `@next/bundle-analyzer`) ouvert automatiquement dans le navigateur, utile
  pour identifier les chunks lourds.
