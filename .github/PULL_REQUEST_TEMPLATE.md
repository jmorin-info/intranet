<!-- Merci pour ta contribution. Remplis ce template — voir CONTRIBUTING.md. -->

## Description

<!-- Que fait cette PR ? Pourquoi ? Lien vers l'issue si applicable. -->

Closes #

## Type de changement

- [ ] 🐛 Bug fix (non-breaking)
- [ ] ✨ Nouvelle fonctionnalité (non-breaking)
- [ ] 💥 Breaking change
- [ ] 📖 Documentation
- [ ] ♻️ Refactor (sans changement fonctionnel)
- [ ] 🔒 Sécurité / RBAC
- [ ] ⚙️ CI / tooling / infra

## Checklist

- [ ] Mon code suit les conventions de [`CONTRIBUTING.md`](../blob/main/CONTRIBUTING.md)
- [ ] `pnpm typecheck` passe (backend + frontend)
- [ ] `pnpm test` passe (Vitest + Jest)
- [ ] Lint sans warning (`pnpm lint`)
- [ ] J'ai ajouté/mis à jour les tests si pertinent
- [ ] J'ai mis à jour la documentation si pertinent

## Checklist sécurité

- [ ] Aucun secret en clair commité (`.env`, clés, tokens)
- [ ] Si nouvelle route backend : `@Roles(...)` explicite ajouté
- [ ] Si variable `NEXT_PUBLIC_*` : ne contient aucun secret
- [ ] HTML user-généré passé par `sanitizeRichText()` + `<SafeHtml>`
- [ ] Cohérence front/back : `minRole` sidebar = `@Roles` backend

## Impact conformité

- [ ] Aucun
- [ ] ISO 27001 — contrôle(s) : <!-- A.5.x -->
- [ ] RGPD
- [ ] NIS2

## Captures / preuves (si UI)

<!-- Avant / après, ou capture de la nouvelle feature. -->
