# Contributing to OMNITECH Intranet

Ce repo est **propriétaire** (cf. [`LICENSE`](./LICENSE)). Les contributions
sont limitées au propriétaire du code (Julien MORIN CHOUKROUN) et aux
collaborateurs OMNITECH Security autorisés par écrit. Ce document décrit
les conventions à respecter par toute personne autorisée.

## Sommaire

1. [Prérequis](#prérequis)
2. [Workflow Git](#workflow-git)
3. [Conventions de commit](#conventions-de-commit)
4. [Standards de code](#standards-de-code)
5. [Tests](#tests)
6. [Sécurité — checklist avant push](#sécurité--checklist-avant-push)
7. [Revue de code](#revue-de-code)

## Prérequis

- Node.js 20 LTS
- pnpm 9.15+
- PostgreSQL 16 (avec extension `pgvector`)
- Redis 7
- Docker (optionnel mais recommandé pour les services tiers)

```bash
git clone https://github.com/jmorin-info/intranet.git
cd intranet
pnpm install
cp .env.example .env       # configurer les variables locales
pnpm db:generate
pnpm db:push                # ou migrate:dev si tu as les permissions
pnpm dev
```

## Workflow Git

- **Branche par défaut** : `main`
- **Branches de feature** : `feat/<sujet-court>` (ex: `feat/cms-multilingue`)
- **Branches de fix** : `fix/<sujet-court>`
- **Branches de docs** : `docs/<sujet>`
- **Branches de refacto** : `refactor/<sujet>`
- **Branches de tooling** : `chore/<sujet>`

Une seule PR = un seul sujet. Pas de gros PR fourre-tout.

## Conventions de commit

[Conventional Commits](https://www.conventionalcommits.org) — strict :

```
<type>(<scope>): <résumé court à l'impératif>

<corps optionnel, expliquant le pourquoi>

<footer optionnel — refs issues, breaking changes>
```

Types valides : `feat`, `fix`, `docs`, `style`, `refactor`, `perf`,
`test`, `chore`, `ci`, `build`, `revert`.

Scopes courants : `cms`, `rbac`, `auth`, `ui`, `dashboard`, `wiki`,
`tickets`, `signatures`, `mfa`, `audit`, `database`, `a11y`, `tech-debt`.

Exemples :

```
feat(cms): ajout du bloc trust.commitments avec normalizer
fix(rbac): bloquer PRESTATAIRE sur /api/v1/media (sécurité)
docs(cms): MIGRATION.md — procédure de déploiement
chore(ci): tests axe-core sur 10 pages clés
```

Les commits sont co-signés `Co-Authored-By: Claude <noreply@anthropic.com>`
quand un assistant IA a contribué — pour traçabilité ISO 27001 A.5.33.

## Standards de code

- **TypeScript strict** activé partout. `any` interdit sauf dans les
  fichiers de test (commentaire `// @ts-expect-error` accepté avec justif).
- **Pas de commentaires verbeux**. Les commentaires expliquent le « pourquoi »
  (intention, contrainte cachée, bug évité), pas le « quoi » (le code dit
  déjà ce qu'il fait).
- **Imports absolus** via `@/` côté frontend, `src/` côté backend.
- **Pas de dead code** dans une PR. Si tu désactives une feature, supprime
  le code mort plutôt que de le commenter.
- **Pas de console.log()** en commit (sauf `lib/logger.ts` qui pipe vers
  Winston / Sentry).
- **Server vs Client Components Next.js** : par défaut Server. `'use client'`
  uniquement si nécessaire (state local, event handlers, hooks DOM).

### CMS

- Toute nouvelle clé CMS doit avoir :
  1. Un schéma form-driven dans `apps/frontend/src/lib/cms-admin/schemas.ts`
  2. Un fallback hardcodé dans le composant consommateur (pas de page
     vide si la DB n'est pas seedée)
  3. Une entrée dans `packages/database/prisma/seed-cms.ts`

### RBAC

- Toute nouvelle route backend doit avoir un `@Roles(...)` explicite.
- `@UseGuards(JwtAuthGuard, RolesGuard)` au niveau classe minimum.
- Cohérence front/back : la sidebar (`minRole`) doit matcher le `@Roles`
  backend. Discordance = bug à corriger avant merge.

## Tests

```bash
# Frontend (Vitest)
pnpm --filter @omnitech/frontend test

# Backend (Jest)
pnpm --filter @omnitech/backend test

# E2E (Playwright, services up requis)
pnpm test:e2e
```

- Toute nouvelle feature exposée à l'utilisateur doit avoir au minimum :
  - 1 test unitaire si logique pure (normalizer, helper)
  - 1 test e2e Playwright si flux utilisateur critique
- Tests d'accessibilité automatisés : `e2e/a11y.spec.ts` lance axe-core
  sur les 10 pages clés. À étendre si tu ajoutes une page publique.

## Sécurité — checklist avant push

- [ ] Aucun secret en clair commité (`.env`, clés privées, tokens API)
- [ ] `git status` propre, pas de fichier `*.backup`, `*.bak`, transcript Claude
- [ ] Pas de credentials hardcodés dans le code (DATABASE_URL, API keys)
- [ ] Les fichiers `.env*` sont dans `.gitignore` (sauf `.env.example`)
- [ ] Si tu ajoutes un endpoint backend : `@Roles(...)` explicite
- [ ] Si tu rends une variable accessible côté client (`NEXT_PUBLIC_*`),
      elle ne contient PAS de secret
- [ ] CSP nonce respecté pour les `<script>` inline
- [ ] HTML user-généré passé par `sanitizeRichText()` (backend) + `<SafeHtml>`
      (frontend)

En cas de doute → voir [`SECURITY.md`](./SECURITY.md).

## Revue de code

- Chaque PR nécessite **au moins une approbation** du propriétaire ou
  d'un reviewer autorisé.
- Le typecheck (`pnpm tsc --noEmit`), les tests, et le build doivent
  passer en CI avant merge.
- Squash merge par défaut — un seul commit propre par PR sur `main`.
- Branches feature : à supprimer après merge.

## Questions

Pour toute question sur les conventions ou l'architecture, ouvrir
une issue ou contacter directement le propriétaire.
