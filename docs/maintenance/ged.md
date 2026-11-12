# GED, fichiers et accès aux contenus — 12 novembre 2026

Ce lot est préparé dans l’espace `intranet-ameliorations-20261112`. Il ne déclenche ni migration, ni reindexation, ni relance réelle, ni déploiement. Les dépendances existantes sont réutilisées sans installation.

## Comportement livré

- La bibliothèque filtre les familles de statuts côté serveur, notamment les trois étapes de validation. Pagination stable, recherche bornée, période valide et date de fin inclusive. Les compteurs de résultats viennent du serveur.
- La politique de lecture est centralisée dans `apps/backend/src/common/document-library.policy.ts` et les résolveurs dans `common/document-access.ts`. La GED, les résumés IA et les analyses ISO utilisent la même matrice et les mêmes permissions explicites non expirées. Les approbateurs dynamiques accèdent à la version courante de leur étape active, avec priorité utilisateur assigné, utilisateur explicite, département principal, puis rôle.
- Une catégorie « contrat » ou le booléen `isPublic` ne remplace jamais la classification. Un prestataire lit les documents PUBLIC approuvés, ses documents et ceux explicitement accordés. Un rôle inconnu ou une identité absente échoue sans ouvrir l’accès.
- Les nouveaux fichiers créent des versions immuables. Le remplacement d’un document publié crée une révision en DRAFT, avec scan PENDING. Une version ne peut être ajoutée pendant la validation. Le dépôt, le réimport et l’édition native détectent les modifications concurrentes ; un dépôt perdant nettoie seulement son nouveau fichier.
- Les documents natifs produisent un véritable snapshot HTML assaini, stocké et haché, avant soumission. Les éditions du brouillon et la soumission comparent contenu, titre, version et date de modification.
- Les téléchargements exigent CLEAN ; les anciennes versions sont réanalysées, faute de statut antivirus propre à chaque version dans le schéma actuel. Les réponses privées ne sont pas mises en cache. Les liens signés correspondent à la route réelle de téléchargement ; échéance malformée, signature altérée et chemins sortant du stockage sont refusés. Les écritures utilisent des fichiers privés et des noms aléatoires.
- ClamAV utilise `execFile` avec arguments séparés. Une indisponibilité, une erreur ou un délai dépassé produit ERROR et bloque les usages du contenu. Aucun repli sur un scanner autonome gourmand en mémoire. Un ancien scan ne modifie jamais le statut de la nouvelle version courante.
- L’approbation administrative impose également une version courante CLEAN. La publication directe sans contenu est refusée. Les fichiers créés depuis le formulaire commencent toujours en brouillon ; si l’analyse reste en cours, la fiche permet de confirmer ensuite la publication administrative.
- Les sorties en brouillon, obsolète ou archive, l’archivage groupé, la réouverture et les nouvelles versions ferment les circuits et demandes PENDING dans la même transaction Serializable. Seules les étapes encore pendantes deviennent SKIPPED ; les décisions acquises et l’audit restent conservés.
- Les transitions manuelles PATCH n’entrent jamais dans une étape de validation ou dans APPROVED. Les décisions passent par leurs endpoints contrôlés. Les sorties vers brouillon, obsolète ou archive restent soumises à la matrice de cycle de vie.
- Les résumés IA exigent un acteur avant toute consultation du cache. Le flag historique `RBAC_RAG_ENABLED=false` ne supprime plus l’autorisation. Les recherches sans acteur ne restituent aucun document GED. Les recherches lexicales, vectorielles et hybrides filtrent les documents supprimés ou non contrôlés, y compris pour les administrateurs.
- Les analyses ISO propagent le vrai utilisateur depuis les routes et l’approbation qualité. Aucun rôle ADMIN n’est inventé pour un appel interne. L’extraction utilise le stockage confiné, la version courante et `execFile` pour PDF ; elle ne recherche plus arbitrairement un autre fichier voisin.
- L’interface affiche les blocages antivirus et fige les commandes d’édition pendant la validation. L’aperçu utilise la route authentifiée, avec le type réel du fichier. Les téléchargements conservent leur extension. Les exports CSV protègent aussi les formules précédées d’espaces ou de contrôles ; les véritables nombres restent numériques. Les actions groupées ont des confirmations lisibles et le tableau par statuts permet l’accès clavier.

## Vérification

Exécution ciblée avant le dernier garde PATCH : 12 suites backend, 147 tests réussis ; 15 tests frontend réussis. Les deux typechecks réussissent. La matrice commune compare 945 combinaisons rôle × statut × classification × relation à l’utilisateur. Les tests couvrent permissions, version courante des circuits, erreurs ClamAV, concurrence, conservation des versions, chemins et symlinks, liens signés, publication administrative, contextualisation RAG/ISO, commandes littérales, filtres et CSV.

Une dernière vérification croisée GED/workflows/RAG/ISO réussit avec 10 suites et 176 tests après ajout de l’annulation transactionnelle. Le typecheck backend et le contrôle de diff réussissent également : `/tmp/ged-cancellation-tests.log` et `/tmp/ged-cancellation-types.log`.

Le dernier garde PATCH ajoute quatre régressions : IN_REVIEW → REVIEW_APPROVED, PENDING_APPROVAL → APPROVED, APPROVED → IN_REVIEW et OBSOLETE → IN_REVIEW ne déclenchent aucune écriture directe. Preuves locales : `/tmp/ged-last-patch-tests.log` et `/tmp/ged-last-types.log`. La vérification backend intégrée précédente a réussi avec 100 suites et 1 502 tests, avant ce dernier garde.

## Limites et suites identifiées

- L’ancien index RAG peut conserver des chunks devenus obsolètes. Le scope d’accès courant les filtre par document, mais une purge des vieux chunks et un rattachement explicite à la version indexée restent à traiter. Aucune reindexation coûteuse n’a été lancée.
- Le schéma ne conserve pas de statut antivirus par DocumentVersion. Une ancienne version doit être scannée au téléchargement ; une évolution de schéma pourrait éviter cette latence et conserver une preuve par version.
- Les attestations de lecture sont encore rattachées au document, sans version dans le schéma. L’invalidation et la conservation de preuves par révision nécessitent un lot de données dédié.
- Les anciennes instances PENDING sur des documents publiés, archivés ou obsolètes sont exclues de la boîte et bloquées au runtime, aux relances et aux escalades. Les nouvelles mutations passent par l’annulation transactionnelle ; aucune correction massive de données existantes n’a été déclenchée.
- La vérification visuelle et les parcours E2E authentifiés sur un environnement de recette restent distincts des typechecks et tests de logique. Ce lot n’affirme pas qu’un audit élimine toute vulnérabilité possible.
