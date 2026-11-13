# Tests navigateur de l’intranet

La procédure active est [e2e/README.md](../../e2e/README.md). Elle distingue
la vérification visuelle avec API simulée et les parcours utilisant un vrai
backend, une base jetable et des comptes fictifs avec MFA.

Les URL et mots de passe de production n’ont aucun défaut embarqué. Le garde
refuse les hôtes de production connus, y compris les URL publiques compilées
par Next.js dans des fichiers d’environnement ignorés par Git.

Le workflow [E2E Playwright](../../.github/workflows/e2e.yml) prépare sa propre
base vide et ses identités de test. Il ne lance pas le seed métier. Son proxy
local conserve une origine unique pour l’interface, l’API et les cookies, afin
de respecter la CSP de production. Il ne désactive ni MFA, ni contrôle des
rôles, ni limitation de connexion.

Les migrations historiques ne suffisent pas actuellement à créer une base
vierge complète. Le bootstrap E2E utilise `prisma db push` après vérification
explicite d’un environnement jetable, de son identité PostgreSQL et de
l’absence de tables. Il ne modifie pas les migrations et ne constitue pas une
procédure d’évolution ou de restauration d’une base de production.

Un chargement de specs (`playwright test --list`) ne lance aucun navigateur.
Une exécution du profil UI simulé ne teste pas l’API métier. Les résultats des
parcours réels doivent préciser les tests réussis, échoués et ignorés ainsi que
les services optionnels absents de la recette.
