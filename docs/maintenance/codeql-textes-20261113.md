# CodeQL : textes, aperçus et génération de slugs

La revue porte sur les flux de la PR 24, et pas seulement sur le nom de chaque
règle. Les alertes de dépendances et celles du code applicatif restent des
inventaires distincts.

## Correctifs de ce lot

Les expressions `<[^>]*>` et `<[^>]+>` pouvaient reparcourir un texte contenant
de nombreux délimiteurs non fermés. Les aperçus wiki, actualités et blocs CMS,
les compteurs et les champs texte backend utilisent désormais un parcours
linéaire. Les balises incomplètes sont éliminées, les entités encodées restent
encodées et aucune ouverture `<` n'est réintroduite. Cela évite de reconstituer
une balise avec une entrée imbriquée ou tronquée.

Cette extraction produit du texte pour les aperçus et compteurs ; elle ne
remplace pas DOMPurify ou sanitize-html pour afficher du contenu enrichi, ni
l'échappement propre à un attribut HTML. Le backend ne dépend volontairement
pas du package TypeScript frontend partagé : les deux fonctions pures gardent
la même politique, avec des tests de sécurité des deux côtés.

Les fonctions de slug retirent au plus un tiret à chaque extrémité après
compression des séparateurs. Le suffixe d'un slug de secours utilise un parcours
linéaire. Les valeurs normales, accents, séparateurs et troncatures restent
couverts. Le lien de création de document encode sa catégorie dans la query.

Le fallback de conversion des emails passe par sanitize-html au lieu de filtres
regex partiels pour les scripts et styles. La bibliothèque principale
html-to-text reste utilisée lorsque disponible.

## Qualification et alertes à distinguer

Les nouveaux essais incluent des délimiteurs imbriqués, des éléments non fermés,
des entités encodées, les caractères français et des entrées de 200000 caractères.
Les tests backend/frontend complets, leurs contrôles de types et le garde-fou
lint passent dans la copie autonome sous Node 24. Les builds consolidés restent
une étape distincte après intégration des autres correctifs de sécurité.

L'alerte DOM de la page procédures suit une valeur de sélection jusqu'à un lien
à préfixe fixe ; elle n'identifie pas un appel à innerHTML. La query est encodée
explicitement. L'alerte de l'avatar suit un fichier jusqu'à une URL blob affichée
par un élément img React. Cette seule trace ne prouve pas une exécution de HTML ;
le contrôle des fichiers et de leur publication relève du lot avatar séparé.
Aucune alerte n'est désactivée globalement et aucune conclusion « zéro
vulnérabilité » n'est déduite du succès des tests.
