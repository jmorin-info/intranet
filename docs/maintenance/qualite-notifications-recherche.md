# Qualité des notifications et de la recherche — 13 novembre 2026

Ce lot corrige des erreurs reproduites sur des données synthétiques. Il ne
constitue pas une recette exhaustive de toutes les pages de l’intranet.

## Comportements corrigés

- Le nombre global de notifications non lues provient de `/notifications/unread-count`.
  Charger 20 ou 50 lignes ne remplace plus ce total par le sous-total de la page.
  Une même lecture ou un même événement WebSocket ne décrémente ou n’incrémente
  plus deux fois le badge. Le chargement d’une page supplémentaire conserve
  les événements reçus entre-temps et l’état de lecture des lignes déjà présentes.
- Les filtres de la liste restent locaux aux lignes chargées. L’interface le
  précise lorsqu’il reste des pages ; « Charger plus » reste accessible même
  si aucune ligne chargée ne correspond au filtre.
- Un chargement échoué ou une réponse sans tableau affiche une erreur avec
  reprise explicite. Une erreur d’écriture conserve l’état non lu et fournit
  un retour visible ; elle ne se transforme plus en liste vide rassurante.
- La cloche et la page utilisent les mêmes destinations. Les campagnes et
  demandes de signature ouvrent les signatures ; les chartes conservent leur
  parcours spécifique. Un accusé de réception porte son vrai libellé. Les
  types de signature actuels disposent d’une icône et d’un libellé.
- Les notifications d’actualité portent un ID, alors que l’API détail attend
  un slug. Le repli explicite « Voir les actualités » ouvre `/news` et évite
  le lien individuel cassé. Pour rétablir le lien direct, faire évoluer le
  contrat de notification ou ajouter un résolveur d’ID autorisé côté API.
- Une ligne de notification expose un bouton de lecture et un lien voisins,
  sans lien imbriqué dans un bouton. La recherche principale possède un nom
  accessible.
- Les rôles proposés pour une diffusion proviennent de `UserRole` et de ses
  libellés partagés. Le type inexistant `GENERAL` n’est plus proposé. Le
  formulaire examine `sent` et `total` : aucun destinataire, échec complet,
  résultat partiel et traitement complet produisent des messages distincts.
  L’absence de destinataire ou l’échec complet conserve la saisie. Le compteur
  de l’API mesure des traitements, pas la délivrabilité de chaque canal.
- Les recherches standard et intelligente annulent leur requête précédente
  après changement de recherche, de filtre ou de mode. Une réponse obsolète
  ne remplace plus les résultats récents ; son annulation ne produit pas de
  fausse alerte réseau.

## Vérification reproductible

Validation locale de ce lot avec Node 24.22.3 : types valides, 278 tests
unitaires réussis dans 31 fichiers, build frontend réussi et 24 scénarios
Chromium réussis (20 nouveaux et 4 scénarios d’approbation existants). Le build,
les types et les tests unitaires ont tourné dans un réseau privé systemd.
La copie de dépendances est autonome ; les 1 703 fichiers du snapshot source
figé ont conservé leurs empreintes.

Dans une copie de développement autonome, avec un runtime qualifié :

```bash
corepack pnpm --filter @omnitech/frontend typecheck
corepack pnpm --filter @omnitech/frontend test
corepack pnpm exec playwright test --config=playwright.ui.config.ts
corepack pnpm --filter @omnitech/frontend build
```

Les tests de store couvrent le total global, les lectures répétées, les
événements dupliqués et les pages qui se chevauchent. Les tests de destinations
couvrent chartes, signatures, accusés de réception, actualités et module Veille
masqué.

`e2e/ui/quality.spec.ts` vérifie bureau et mobile : badge et destinations,
pagination sans résultat chargé, reprise après réponse invalide, échec de
marquage, rôles/types de diffusion, résultats de diffusion nuls ou partiels,
et annulation d’une ancienne recherche standard ou intelligente maintenue en
attente pendant qu’une nouvelle réponse arrive.

Le profil UI n’utilise ni compte réel, ni base métier, ni envoi de notification.
Les origines externes et les hôtes de production restent bloqués. Les captures
sont générées sous `test-results/ui/` ; les résultats d’une exécution ne doivent
pas être confondus avec une validation de l’API réelle, des permissions métier,
du transport WebSocket ou de Safari sur appareil physique.

L’avertissement de nonce observé en développement Next.js et les avertissements
Sentry déjà présents ne sont pas masqués par ce lot. Les protections CSP restent
en place. La qualification de l’artifact compilé pour la cible de production
et la recette d’exploitation restent nécessaires avant son déploiement.
