# Migration CMS + RBAC — Guide opérateur

Document à jour à la date de la PR. Branche : `feature/admin-content-management`.

## Vue d'ensemble

Cette PR livre en une seule fois 3 chantiers cohérents :

1. **CMS étendu** — 28 blocs `ContentBlock` + 4 `ContentPage` éditables depuis `/admin/content`
2. **Theming + UX admin** — éditeur form-driven, theming CSS via CMS, items sidebar éditables
3. **RBAC durci** — ~100 routes patchées, audit PRESTATAIRE complet, alignement front/back

Toutes les fonctionnalités sont **additives** et **désactivables** : les blocs vides utilisent les fallbacks hardcodés, garantissant zéro régression visuelle si la base CMS n'est pas seedée.

## Procédure de déploiement

### 1. Pré-requis base de données

Aucune migration Prisma n'a été ajoutée dans cette PR (les modèles `ContentPage`, `ContentBlock`, `ContentRevision` existent déjà depuis la PR initiale du CMS). Vérifier que le schéma est à jour :

```bash
cd packages/database
pnpm prisma migrate deploy   # ou `db push` en dev
```

### 2. Seeder le CMS

Exécuter les deux seeders dans cet ordre :

```bash
cd packages/database
pnpm seed-cms        # 28 ContentBlocks (idempotent, upsert sur key+locale)
pnpm seed-cms-pages  # 4 ContentPages juridiques (idempotent, upsert sur slug+locale)
```

Le seeder `seed-cms-pages` nécessite qu'un utilisateur `SUPER_ADMIN` existe en base (rattachement éditorial ISO 27001 A.5.33). Si KO :

```bash
pnpm seed   # crée les comptes système initiaux
```

### 3. Build + redémarrage

```bash
pnpm --filter @omnitech/backend  build
pnpm --filter @omnitech/frontend build
systemctl restart omnitech-backend.service
systemctl restart omnitech-frontend.service
```

### 4. Vérifications post-déploiement

```bash
# Health backend
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/v1/health

# Pages publiques (doivent renvoyer 200 et le contenu CMS depuis la DB)
for r in /welcome /trust /legal /privacy-policy /cookies /dpa /kiosk; do
  echo -n "$r: "
  curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3001$r
done

# Endpoint CMS (doit renvoyer le JSON des blocs)
curl -s "http://localhost:3000/api/v1/content/blocks?keys=welcome.hero.title&locale=fr"
```

### 5. Purge du cache Next.js (si rebuild sans restart)

Si le cache `unstable_cache` retient une ancienne version vide :

```bash
rm -rf /root/omnitech-intranet/apps/frontend/.next/cache/fetch-cache
systemctl restart omnitech-frontend.service
```

## Inventaire des blocs CMS (28 + 4 pages)

### Blocs ContentBlock par section

| Section         | Clés                                                                                                                                                                                               |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Welcome         | `welcome.hero.title`, `welcome.hero.subtitle`, `welcome.hero.cta`, `welcome.steps`, `welcome.services`, `welcome.faq`, `welcome.banner`, `welcome.media`, `welcome.testimonials`, `welcome.layout` |
| Trust           | `trust.hero`, `trust.commitments`, `trust.certifications`, `trust.contact`, `trust.score.badges`                                                                                                   |
| Hubs            | `hub.security.cards`, `hub.work.cards`                                                                                                                                                             |
| Onboarding      | `onboarding.steps`, `onboarding.shortcuts`, `onboarding.welcome_message`                                                                                                                           |
| Dashboard       | `dashboard.daily_tips`                                                                                                                                                                             |
| Tools           | `tools.pdf.shortcuts`                                                                                                                                                                              |
| Login / Kiosque | `auth.tagline`, `kiosk.labels`                                                                                                                                                                     |
| Navigation      | `nav.sidebar.overrides`, `nav.sidebar.hidden`, `nav.sidebar.custom_items`                                                                                                                          |
| Theme           | `theme.tokens`                                                                                                                                                                                     |

### ContentPages

| Slug                        | Route consommatrice | Status par défaut |
| --------------------------- | ------------------- | ----------------- |
| `mentions-legales`          | `/legal`            | PUBLISHED         |
| `politique-confidentialite` | `/privacy-policy`   | PUBLISHED         |
| `politique-cookies`         | `/cookies`          | PUBLISHED         |
| `accord-traitement-donnees` | `/dpa`              | PUBLISHED         |

Toutes les ContentPages sont aussi accessibles via la route générique `/page/<slug>`.

## Changements RBAC — impact opérateurs

### Politique appliquée

| Rôle            | Niveau | Périmètre métier après PR                         |
| --------------- | ------ | ------------------------------------------------- |
| `SUPER_ADMIN`   | 100    | Accès total                                       |
| `ADMIN`         | 80     | Lecture + écriture sur tous modules métier        |
| `DIRECTION`     | 60     | Lecture + édition news/chartes                    |
| `MANAGER`       | 50     | Lecture + actions de management                   |
| `REVIEWER`      | 40     | Lecture + audit + revue d'accès                   |
| `COLLABORATEUR` | 20     | Lecture standard + actions perso                  |
| `AUDITEUR`      | 10     | Lecture stricte (à valider cas par cas)           |
| `PRESTATAIRE`   | 5      | Sidebar simplifiée 7 items + chartes obligatoires |

### Sidebar simplifiée PRESTATAIRE

Un utilisateur `PRESTATAIRE` voit exclusivement : Dashboard, Notifications, Documents, Mes tickets, Mes signatures, Fichiers réseau, MFA. Tout autre module est bloqué côté API (403).

### Exceptions documentées

- `chartes` : `@Roles(PRESTATAIRE)` — un prestataire DOIT pouvoir signer ses chartes obligatoires avant utilisation (ISO 27001 A.5.18).
- `OAuth callbacks` (calendar/google, calendar/outlook) : `@Public()` — flux d'auth externe.
- `ICS subscription` : auth par token URL signé, pas par JWT.

### Impact possible sur l'existant

- Si un utilisateur AUDITEUR (10) signalait pouvoir lire des modules métier (wiki, tickets, etc.) auparavant, il recevra désormais des 403. C'est intentionnel.
- Les comptes PRESTATAIRE qui auraient été "détournés" pour des usages internes ne pourront plus accéder aux modules type chat/media/ai/fileserver.

## Theming CSS — extension white-label

L'admin peut surcharger 14 CSS variables via le bloc `theme.tokens` :

- **9 couleurs** : `sealOrange`, `sealOrangeLight`, `sealBlue`, `sealGreen`, `sealBordeaux`, `sealNavy`, `sealTaupe`, `primary`, `primaryDark`
- **2 fontes** : `body`, `display`
- **3 rayons** : `card`, `button`, `input`

Seules les valeurs validées par regex stricte (hex pour couleurs, `px`/`rem`/`em` pour rayons) sont injectées. Pas d'injection CSS arbitraire possible.

Pour purger le cache après une modification :

```bash
# Option 1 — via endpoint
curl -X POST -H "X-CMS-Revalidate-Secret: $CMS_REVALIDATE_SECRET" \
  http://localhost:3001/api/cms/revalidate

# Option 2 — TTL expire automatiquement après 300 s
```

## Édition admin

### Pour les blocs avec schéma form-driven (20 sur 28)

L'admin ouvre `/admin/content/blocks/[id]` et voit :

- Toggle **« Formulaire ↔ JSON brut »** en haut à droite
- Champs typés (input, textarea, select pour iconKey/accent/status)
- Liste d'items avec **↑ ↓ 🗑** pour réordonner / supprimer + bouton « Ajouter un item »

### Pour les blocs sans schéma (welcome.banner / media / layout)

Toggle automatiquement sur **JSON brut** avec textarea + validation côté serveur.

## Tests

```bash
# Backend
pnpm --filter @omnitech/backend test

# Frontend (Vitest)
pnpm --filter @omnitech/frontend test
```

État de référence : **213/213 tests Vitest** passent.

## Rollback

En cas d'erreur en prod :

1. **Sécurité RBAC trop stricte** : un `@Roles(COLLABORATEUR)` qui empêche un user légitime d'accéder à une route. Solution : ajouter le rôle attendu au décorateur OU rétrograder vers `@Roles(PRESTATAIRE)` (= tous authentifiés).

2. **Theming CSS cassé** : vider le bloc `theme.tokens` côté admin (data `{ colors: {}, fonts: {}, radii: {} }`). Les valeurs `globals.css` reprennent immédiatement (TTL 300 s ou revalidate manuel).

3. **Sections Welcome non désirées** : vider `welcome.layout` (data `null`) → ordre par défaut. Ou dépublier chaque section individuellement.

4. **Items sidebar mal configurés** : vider `nav.sidebar.overrides` / `nav.sidebar.custom_items` / `nav.sidebar.hidden` (data `[]`).

## Limites assumées (à traiter dans des PRs futures)

| Sujet                                    | Pourquoi reporté                                                                                 |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Multilingue effectif FR + EN             | Tous les blocs sont en `fr` ; le seeder ne pose que la locale française.                         |
| Workflow draft → review → publish + diff | Versioning existant pour pages, à étendre pour blocs ; UI dédiée pour audit ISO A.5.33.          |
| Édition visuelle in-page (style Webflow) | Hors scope.                                                                                      |
| Migration i18n vers CMS                  | Volontairement maintenu sur next-intl (`messages/{fr,en}.json`).                                 |
| Refacto chat ChatbotUnifiedGuard         | `@Roles(COLLABORATEUR)` ajouté au niveau classe (PR-12), mais le guard custom reste indépendant. |

## Statistiques

- **16 commits** sur la branche
- **~100 routes API** patchées (`@Roles` ajouté ou ajusté)
- **+10 000 / −1 500** lignes environ
- **213 tests Vitest** passent
- **TypeScript** : 0 erreur
- **Build** prod OK pour backend + frontend
