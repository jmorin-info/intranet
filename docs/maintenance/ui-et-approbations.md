# Maintenir l’interface et les parcours d’approbation

Le socle visuel reste dans `packages/ui` ; les pages composent ses boutons,
dialogues, recherches et états vides. Une correction de contraste ou de focus
doit bénéficier à l’ensemble de l’intranet, au lieu de multiplier les styles
locaux. Conserver l’orange `#F9964A` et le bleu `#296DC1` de la marque.

## Conventions à conserver

- Utiliser `Button` / `buttonVariants` pour les actions et liens d’action.
  Le texte navy `#004469` sur l’orange principal atteint environ 4,67:1.
  Ne pas rétablir un texte blanc sur cet orange pour les petits libellés.
- Employer `PageHeader` et `Page` pour permettre le retour à la ligne du titre
  et des actions sur mobile. Associer chaque recherche à un vrai `<label>`.
- Distinguer un chargement, une liste vide, un filtre sans résultat et une
  panne API. Une réponse invalide ne doit pas devenir une liste vide rassurante.
- Pour chaque erreur d’écriture, garder la saisie et proposer une reprise
  explicite. Après un conflit de décision, recharger les données du serveur.
- Les liens d’évitement doivent déplacer le focus, pas seulement le défilement.
  Les actions de page exposent `#page-actions`, le contenu `#main-content`.
- Les dialogues partagés utilisent un portail dans `body` et passent devant
  la navigation mobile. Ne pas recréer une modale dans un conteneur transformé.
- Une requête HTTP annulée volontairement reste rejetée pour son appelant,
  sans afficher une fausse panne réseau. Une erreur réseau réelle reste signalée.
- Ne pas présenter une échéance ou une relance comme une approbation automatique.
  Une décision humaine et les contrôles de publication restent nécessaires.

## Parcours livré dans ce lot

`/approvals` centralise les étapes actuellement ouvertes pour l’utilisateur.
La logique pure `apps/frontend/src/lib/approvals.ts` applique le filtrage des
étapes courantes, le tri par échéance, la recherche sans accents et la
validation des motifs de refus. Les tests couvrent les étapes futures,
terminées et annulées, les dates invalides et les limites du commentaire.

Le point d’entrée apparaît dans Mon espace, la palette de commandes et les
tâches du tableau de bord. L’interface affiche le document, le circuit,
l’étape et l’échéance, et demande une confirmation avant chaque décision.
L’API reste responsable de l’autorisation et de l’intégrité des transitions.

Un circuit déjà utilisé expose `definitionLocked=true`. Sa fiche permet la
duplication vers un circuit désactivé et empêche l’ajout, la suppression ou
le réordonnancement des étapes ; l’éditeur visuel applique la même protection.
Le backend doit toujours appliquer cette règle, indépendamment de l’interface.
Les changements de nom et de description sont également verrouillés ;
l’activation et le choix du circuit par défaut restent modifiables.

Les nouvelles règles de routage sont créées désactivées. Leur activation est
explicite ; la simulation des règles actives affiche les paliers retenus sans
créer de demande. Les rôles proposés s’appuient sur l’énumération partagée, et
les délais/niveaux sont bornés selon le contrat du backend.

Les relances manuelles utilisent la route d’instance dédiée et rendent visible
la limitation quotidienne renvoyée par l’API. Aucune relance globale ni décision
en masse n’est déclenchée lors du simple affichage d’une page.

## Vérifier sans toucher à la production

Voir [les profils Playwright](../../e2e/README.md). Le profil UI simulé ne
réutilise aucune session admin et bloque les origines externes. Il valide la
présentation ; les tests métier réels sur une préproduction isolée restent
nécessaires avant livraison. Les résultats obtenus et leurs limites doivent
être joints à la revue de code.

La CI distingue `UI navigateur avec mocks` (interactions Chromium bureau et
mobile, captures conservées) de `E2E specs compile (--list)` (chargement des
fichiers uniquement). Aucun de ces jobs ne valide une vraie base métier.

Cette évolution améliore des composants transversaux et le parcours prioritaire
d’approbation ; elle ne constitue pas un audit visuel exhaustif de toutes les
routes, de toutes les langues ou de toutes les technologies d’assistance.
