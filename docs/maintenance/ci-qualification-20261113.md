# Qualification de la consolidation sur GitHub

La première exécution de la PR de consolidation a réellement exercé les
workflows et révélé des défauts d'outillage. Les corrections sont versionnées :

- Ubuntu est fixé à 24.04 : `ubuntu-latest` désigne désormais une version que
  le Playwright verrouillé ne prend pas en charge.
- La santé Meilisearch utilise `curl` sur IPv4 ; la santé PostgreSQL utilise
  explicitement l'utilisateur et la base de test.
- Le nettoyage des conteneurs accepte aussi le message Docker `no such object`
  en minuscules. Les labels de propriété restent obligatoires avant suppression.
- Prisma est formaté sans changement sémantique, et les références Capacitor
  générées ont été synchronisées avec le lockfile courant.
- Chromatic exige une activation explicite et sa configuration. Les tests UI
  Chromium locaux et CI restent indépendants de ce service facultatif.

## Dette lint visible

Le lint TypeScript remplace la règle JavaScript de variables inutilisées, qui
signalait à tort les paramètres de signatures de types. Il reste **237 vrais
avertissements** : 175 variables/imports inutilisés, 50 textes JSX à échapper,
11 dépendances de hooks et un élément image. Ce nombre n'est pas présenté
comme un lint strict réussi à zéro avertissement.

`node scripts/check-frontend-lint.cjs` refuse toute erreur et tout nouvel
avertissement. L'inventaire versionné identifie les avertissements par fichier,
règle, message et empreinte de la ligne source, avec leur multiplicité. Déplacer
une ligne ne masque pas une régression. Les suppressions de dette sont admises.
Les règles ESLint et la commande `lint:strict` restent disponibles.

La mise à jour de l'inventaire est une action explicite de maintenance :
`node scripts/check-frontend-lint.cjs --update-baseline`. Elle doit être revue,
ne doit pas servir à accepter automatiquement les nouveaux avertissements
d'une PR et refuse toujours les erreurs. Une vérification réelle a ajouté puis
retiré une variable inutilisée temporaire : elle a été refusée, puis l'arbre
initial a passé le contrôle. Le rapport CI n'imprime pas l'intégralité des
sources que le format JSON de Next inclut dans ses diagnostics.

## Limites des preuves

Les contrôles locaux ne remplacent pas le résultat GitHub Actions de chaque
SHA. La compilation du mobile ne qualifie pas une signature ou une distribution
iOS/Android. Les fixtures navigateur ne prouvent pas une connexion à tous les
services tiers. Les alertes de dépendances restantes figurent dans le rapport
sécurité et ne sont pas neutralisées par ces corrections de CI.
