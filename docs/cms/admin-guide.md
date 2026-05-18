# CMS interne — Guide d'exploitation admin

> Public : ADMIN, SUPER_ADMIN.
> Lié à : [`architecture.md`](architecture.md).

Le module CMS permet de gérer deux types de contenu sans redéploiement :

- **Pages éditoriales** (mentions légales, politique de confidentialité, FAQ, à propos) — chacune a son URL et son historique de versions.
- **Blocs réutilisables** identifiés par une clé (ex. `welcome.hero.title`) — consommés par des composants front (page Welcome, trust center…).

## 1. Accéder au module

Sidebar → section **Admin › Contenus & animation › Pages CMS**. Ou directement `/admin/content`.

Deux entrées : **Pages éditoriales** et **Blocs réutilisables**.

## 2. Workflow Pages éditoriales

### 2.1 Créer une page

1. `/admin/content/pages` → bouton **Nouvelle page**.
2. Renseigner :
   - **Titre** (obligatoire).
   - **Slug** : laissez vide pour génération automatique depuis le titre (ex. `Politique de confidentialité` → `politique-de-confidentialite`). Si vous fournissez un slug, il doit être en minuscules + chiffres + tirets uniquement.
   - **Langue** : `FR` ou `EN`. Une même URL peut coexister en FR et EN (slug unique par langue).
   - **Résumé** (optionnel, ≤ 500 caractères) — utilisé dans les listes et metas sociales.
   - **Contenu** : éditeur rich-text (gras, italique, titres H2/H3, listes, citations, code, liens, images).
   - **SEO** (colonne de droite) : titre SEO (≤ 70) et description SEO (≤ 180) — affichés en preview Google / partage social.
3. **Enregistrer**. La page est créée en statut **Brouillon** (invisible côté public).

### 2.2 Publier / dépublier

Depuis la page d'édition, colonne de droite, bouton **Publier**. La page devient visible sur la route publique `/page/<slug>`.

Pour retirer une page : bouton **Dépublier** — son statut passe à `Archivé`, l'URL renvoie 404 mais le contenu reste accessible en admin pour réactivation.

### 2.3 Historique des versions

Une révision est créée automatiquement à **chaque enregistrement**. Pour consulter l'historique :

- Édition d'une page → bouton **Voir l'historique** dans la colonne de droite.
- Pour restaurer une version : cliquez sur **Restaurer** sur la ligne souhaitée. Le contenu courant est sauvegardé comme nouvelle révision avant écrasement (pas de perte).

### 2.4 Supprimer

Bouton **Supprimer** (rouge) → confirmation. La page est soft-deleted (`deletedAt` set). Elle n'apparaît plus dans la liste mais le contenu reste en DB pour la conformité (ISO 27001 A.5.33).

Pour la restaurer après suppression : intervention SUPER_ADMIN sur la DB (`UPDATE "ContentPage" SET "deletedAt" = NULL WHERE id = ...`).

## 3. Workflow Blocs réutilisables

### 3.1 Modèle

Un bloc = un identifiant `key` namespacé (ex. `welcome.hero.title`, `trust.commitment.iso27001`) + une `locale` + un `body` (texte ou HTML court) + des `data` JSON optionnelles.

Le composant front qui consomme un bloc connait à l'avance la clé et le format des `data`. Modifier le `body` ou `data` d'un bloc met à jour le rendu sans redéploiement.

### 3.2 Créer un bloc

1. `/admin/content/blocks` → bouton **Nouveau bloc**.
2. Renseigner :
   - **Clé** : notation pointée minuscule, ex. `welcome.faq` ou `legal.footer.copyright`. La convention de nommage est documentée par les devs (voir [`developer-guide.md`](developer-guide.md)).
   - **Langue**.
   - **Titre** (optionnel).
   - **Corps** : texte court ou HTML basique.
3. Création.

### 3.3 Éditer un bloc

Édition standard : `body`, `data` (JSON), statut. Le champ **Données structurées** accepte du JSON (array d'items, config). Exemples :

```json
[
  {
    "icon": "Shield",
    "title": "Souveraineté française",
    "body": "Hébergement OVHcloud à Roubaix.",
    "href": "/trust/sovereignty"
  }
]
```

Le JSON est validé à la sauvegarde ; un message d'erreur s'affiche s'il est mal formé.

### 3.4 Statut

- **PUBLIÉ** (défaut) : le bloc est servi sur la route publique.
- **BROUILLON** : invisible — le composant front utilise sa valeur de secours (fallback hardcodé).
- **ARCHIVÉ** : équivalent à BROUILLON, sémantique « retiré volontairement ».

Pour retirer temporairement un bloc, passez-le en `Brouillon`.

## 4. Sécurité et traçabilité

- Tout texte HTML est **sanitisé** côté backend (`sanitize-html` whitelist : H2-H6, gras, listes, code, liens http/https, images http/https, tableaux). Les `<script>`, iframes, formulaires et handlers inline (`onclick=`) sont retirés à la sauvegarde.
- Toutes les actions sont **auditées** :
  - `CONTENT_PAGE_CREATED`, `CONTENT_PAGE_UPDATED`, `CONTENT_PAGE_PUBLISHED`, `CONTENT_PAGE_UNPUBLISHED`, `CONTENT_PAGE_RESTORED`
  - `CONTENT_PAGE_DELETED` (severity `WARN`)
  - `CONTENT_BLOCK_CREATED`, `CONTENT_BLOCK_UPDATED`, `CONTENT_BLOCK_DELETED`
- Consultable dans `/admin/audit` en filtrant sur `resourceType = ContentPage` ou `ContentBlock`. Rétention 3 ans (ISO 27001 A.5.33).
- Anti-abus : 30 créations/min/utilisateur pour les pages, 60 patches/min.

## 5. Rôles

| Rôle                    | Lecture admin | Édition / Publication / Suppression |
| ----------------------- | ------------- | ----------------------------------- |
| SUPER_ADMIN             | ✓             | ✓                                   |
| ADMIN                   | ✓             | ✓                                   |
| DIRECTION et inférieurs | ✗             | ✗                                   |

Les rôles non admin peuvent voir les pages **publiées** sur les URLs publiques (`/page/<slug>`), pas l'interface d'administration.

## 6. Troubleshooting

| Symptôme                                   | Cause probable                               | Résolution                                                                         |
| ------------------------------------------ | -------------------------------------------- | ---------------------------------------------------------------------------------- |
| « Slug déjà utilisé pour la locale fr »    | Une autre page (ou brouillon) a déjà ce slug | Choisir un slug différent OU réutiliser la page existante                          |
| Une page publiée renvoie 404               | Soft delete actif                            | Vérifier `deletedAt` en DB ; restaurer si nécessaire                               |
| L'éditeur perd les styles `<code>` au save | Whitelist obsolète                           | Vérifier `apps/backend/src/common/sanitize.ts`                                     |
| Un bloc n'apparaît pas sur Welcome         | Statut `BROUILLON` ou `ARCHIVÉ`              | Repasser en `PUBLISHED` ; la page est revalidée sous 5 min (cache)                 |
| Modification non visible sur `/welcome`    | Cache Next.js                                | Attendre 5 min (TTL ISR) OU déclencher la revalidation manuelle via le webhook CMS |

## 7. Limites connues (MVP)

Non couvert par cette V1 — voir [`architecture.md`](architecture.md) §12 :

- Programmation de publication différée.
- Workflow de relecture (REVIEWER avant ADMIN approve).
- Traduction automatique d'un contenu d'une langue vers une autre.
- Visibilité par département.
- Upload d'images directement dans l'éditeur (utiliser le module `/admin/media`).
