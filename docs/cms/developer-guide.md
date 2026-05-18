# CMS interne — Guide développeur

> Public : développeurs intranet OMNITECH.
> Liés : [`architecture.md`](architecture.md), [`admin-guide.md`](admin-guide.md).

Ce guide explique comment **consommer** un contenu CMS depuis un composant ou une page, **créer une nouvelle page éditoriale** côté code, et **étendre** le module avec un nouveau type de bloc.

## 1. Vue d'ensemble côté code

```
apps/backend/src/content/         ← Module NestJS (controller + service + repository + DTOs)
apps/frontend/src/lib/cms-admin/  ← Helper axios + types pour l'UI admin
apps/frontend/src/app/(app)/admin/content/  ← Routes admin Next.js
packages/database/prisma/schema.prisma  ← Modèles ContentPage / ContentRevision / ContentBlock
docs/cms/                         ← Documentation
```

## 2. Lire un bloc CMS dans un composant front

### 2.1 Quand utiliser un bloc

- Le contenu **doit être éditable sans redeploy** (texte marketing, FAQ, mentions légales partielles).
- Le contenu **n'est pas une traduction technique** d'un libellé d'UI (utiliser `next-intl` pour ça).
- Le contenu est **statique** (pas généré dynamiquement par requête utilisateur).

### 2.2 Convention de nommage des clés

Notation pointée minuscule : `<page>.<section>.<champ>`.

- `welcome.hero.title` — titre principal de la home publique.
- `welcome.services` — array de cartes services (data structurée).
- `legal.footer.copyright` — pied de page légal.
- `trust.commitment.iso27001` — engagement ISO du trust center.

Tenir à jour cette liste dans `docs/cms/keys.md` (à créer dès qu'un PR introduit une nouvelle clé).

### 2.3 Récupérer un ou plusieurs blocs (Server Component)

L'API publique est `GET /api/v1/content/blocks?keys=k1,k2,k3&locale=fr` et retourne un objet `Record<string, ContentBlock>` (les clés absentes sont omises).

Le helper frontend (Server Component side) — voir `apps/frontend/src/lib/cms.ts` :

```ts
import { getContentBlocks, getBlockText, getBlockData } from "@/lib/cms";

export default async function WelcomePage() {
  const blocks = await getContentBlocks(
    ["welcome.hero.title", "welcome.hero.subtitle", "welcome.services"],
    "fr",
  );

  const title = getBlockText(blocks, "welcome.hero.title", "Bienvenue !");
  const services = getBlockData<Array<{ icon: string; title: string; body: string }>>(
    blocks,
    "welcome.services",
    DEFAULT_SERVICES, // fallback hardcodé
  );

  return (
    <>
      <h1>{title}</h1>
      {services.map((s) => (
        <ServiceCard key={s.title} {...s} />
      ))}
    </>
  );
}
```

**Pourquoi le fallback est obligatoire** : si la DB n'est pas peuplée (env fraîche, bloc passé en DRAFT par erreur), la page doit continuer à rendre quelque chose. Le fallback hardcodé est la version de référence — c'est aussi ce que le seeder (`packages/database/prisma/seed-cms.ts`) doit poser à l'initialisation.

### 2.4 Cache et invalidation

- Le helper utilise `unstable_cache` Next.js (TTL 5 min, tag `cms`).
- À chaque publication / dépublication d'une page ou d'un bloc, le backend peut notifier le frontend via l'endpoint `/api/cms/revalidate` (POST, header `X-CMS-Revalidate-Secret`). Le frontend appelle alors `revalidateTag("cms")` puis `revalidatePath("/welcome")`.
- Si tu ajoutes une nouvelle page consommant des blocs, n'oublie pas d'ajouter son chemin à la liste de `revalidatePath` (ou utiliser uniquement le tag `cms`).

## 3. Lire une page éditoriale dynamique

Une `ContentPage` a son URL publique propre. Pattern frontend :

```
apps/frontend/src/app/(public)/page/[slug]/page.tsx
```

```ts
import { notFound } from "next/navigation";
import { getContentPage } from "@/lib/cms";
import { sanitizeForClient } from "@/lib/cms/sanitize-client";

export default async function PublicCmsPage({ params }: { params: { slug: string } }) {
  const page = await getContentPage(params.slug, "fr");
  if (!page) notFound();

  return (
    <article>
      <h1>{page.title}</h1>
      <div
        // Defense in depth — le backend a déjà sanitisé, mais on relance DOMPurify
        // côté client avec une config CMS dédiée.
        dangerouslySetInnerHTML={{ __html: sanitizeForClient(page.content) }}
      />
    </article>
  );
}

export async function generateMetadata({ params }) {
  const page = await getContentPage(params.slug, "fr");
  return {
    title: page?.seoTitle ?? page?.title,
    description: page?.seoDescription ?? page?.excerpt,
  };
}
```

`getContentPage` doit gérer 404 (page absente ou DRAFT/ARCHIVED) et propager au `notFound()` Next.

## 4. Ajouter un nouveau type de bloc

1. **Choisir la clé** : ex. `incidents.banner.message`. Documenter dans `docs/cms/keys.md` :
   - Format `body` (texte simple ou HTML).
   - Format `data` JSON si applicable (typescript-style schema).
   - Composant front qui le consomme.
   - Fallback hardcodé.
2. **Seeder initial** : ajouter une entrée dans `packages/database/prisma/seed-cms.ts` (upsert sur `key_locale`).
3. **Composant front** : `await getContentBlocks(["incidents.banner.message"])` puis `getBlockText` ou `getBlockData`.
4. **Tests** : ajouter un test (Vitest) qui vérifie le rendu avec / sans bloc en DB.

## 5. Ajouter un endpoint admin spécifique

Le module backend `apps/backend/src/content/` suit le pattern repository + service + controllers (modèle : `apps/backend/src/tickets/`). Si tu ajoutes un endpoint admin spécifique (ex. duplication d'une page) :

1. **DTO** dans `content/dto/` (class-validator).
2. **Méthode service** dans `content.service.ts` (avec audit log obligatoire).
3. **Route** dans `admin-content.controller.ts` (`@Roles(ADMIN, SUPER_ADMIN)` au minimum).
4. **Test** dans `content.service.spec.ts` (mock repo + audit).
5. **Helper frontend** dans `apps/frontend/src/lib/cms-admin/api.ts` si l'UI doit consommer.

## 6. Migrations Prisma

Toute évolution du schema CMS passe par une migration Prisma régulière (`pnpm db:migrate`). Convention de nommage : `YYYYMMDDHHMMSS_<description_courte>` (ex. `20260601120000_content_block_scheduled_at`).

Pour les colonnes pgvector ou autres types non gérés par Prisma, voir le pattern dans `20260425_rag_embedding_column` (ALTER TABLE explicite après le migrate).

## 7. Bonnes pratiques

- **Toujours fournir un fallback hardcodé** côté front, pour résilience.
- **Ne pas mélanger** une string i18n (`t('common.save')`) et un bloc CMS (`welcome.hero.title`) — les premières sont versionnées dans le code, les seconds éditables par les admins.
- **Ne pas exposer un endpoint CMS sans auth** — l'intranet est interne, même les routes "publiques" passent par `JwtAuthGuard`.
- **Documenter chaque nouvelle clé** dans `docs/cms/keys.md` (à créer dans le premier PR qui en ajoute).
- **Tester la sanitization** : tout patch sur `apps/backend/src/common/sanitize.ts` doit faire passer les tests unitaires + le test e2e `e2e/cms-content.spec.ts` (XSS).

## 8. Références

- [Architecture cible](architecture.md)
- [Guide admin](admin-guide.md)
- Module template : `apps/backend/src/tickets/`
- Charte SEAL : `docs/design-system/`
- Audit ISO 27001 A.5.33 (preuves) : `apps/backend/src/audit/`
