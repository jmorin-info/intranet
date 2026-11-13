# Déconnexion effective de la session courante

Le cookie refresh utilisait `/api/v1/auth/refresh`. Le navigateur ne l'envoyait pas à `/auth/logout`, qui renvoyait pourtant 200 sans révoquer la session. Un rejeu du cookie réel obtenait encore des jetons. Le JWT d'accès n'était pas non plus relié à l'état révoqué de sa ligne de session.

## Contrat HTTP et migration

- Les nouveaux cookies refresh restent host-only, httpOnly, SameSite=Strict et Secure en production. Leur Path devient `/api/v1/auth`. Chaque émission et chaque déconnexion confirmée purge aussi l'ancien Path `/api/v1/auth/refresh`.
- Le client utilise POST `/api/v1/auth/refresh/logout`. Cet alias reçoit les cookies ancien et nouveau, même si le cookie d'accès a déjà expiré. Il est public pour permettre cette révocation, mais ne donne aucune identité, aucun accès et aucun contournement MFA. La protection Fetch Metadata et la limitation de débit restent appliquées.
- POST `/api/v1/auth/logout` reste compatible avec le nouveau refresh cookie, un access cookie ou un Bearer signé, y compris expiré. Le JWT expiré ne sert qu'à révoquer son propre `sub`/`sid`, après vérification de signature HS256 ; il n'authentifie aucun autre endpoint. Aucun sid n'est inventé.
- Sans preuve vérifiable, réponse401. Le chemin canonique préserve le cookie qui pourrait être invisible à cause de son ancien Path : un ancien client peut alors effectuer son renouvellement migrateur et rejouer logout. L'alias reçoit tous les Paths connus et purge les cookies invalides avant401. Un MAC prouvé correspondant à une session déjà révoquée donne200 idempotent.
- Une panne de persistance reste une erreur5xx et préserve les cookies. Le client conserve son état, affiche l'échec et permet une nouvelle tentative ; les appelants traitent le rejet sans navigation de succès. Une401 de l'alias signifie qu'aucune session navigateur vérifiable ne reste, et permet de nettoyer l'état local.

L'intercepteur frontend doit exclure l'alias des renouvellements automatiques sur401 ; ce changement est fourni par le lot API du parent (`22d5bf1`), à intégrer avec ce lot.

## Rotation et concurrence

L'id de ligne RefreshToken est désormais stable pour un login. Un renouvellement remplace le hash par CAS sur id/hash précédent/non-révocation/non-expiration, dans une transaction. Un seul renouvellement peut consommer un jeton donné. Le timestamp MFA est conservé tel quel ; seul un vrai facteur peut le rafraîchir. JwtStrategy exige la présence d'une session active, appartenant au bon utilisateur et distincte d'un lien de réinitialisation de mot de passe. Une révocation invalide donc aussi les JWT d'accès de ce login. Les autres sessions de l'utilisateur sont préservées. Les anciens JWT sans sid restent compatibles jusqu'à leur expiration ; aucun rattachement arbitraire à une session n'est créé.

Les nouveaux refresh tokens sont des capacités opaques `sr1` signées HMAC-SHA256, avec sid, nonce UUID et expiration7jours. La clé dérive de **JWT_REFRESH_SECRET** par un libellé de domaine dédié ; ce format n'est jamais accepté comme JWT d'accès. Cette variable est déjà requise au boot. AuthService refuse en production une clé absente, de moins de32 caractères, ou un défaut connu. Préserver cette clé distincte de JWT_ACCESS_SECRET et la sauvegarder comme les autres secrets ; aucune valeur n'est écrite dans ce document.

La signature d'un ancien refresh de cette session permet uniquement sa révocation. Pour obtenir de nouveaux JWT, son hash doit encore être le hash courant en DB. Cela ferme la course où un renouvellement remplace le cookie pendant une déconnexion : l'ancien cookie peut toujours révoquer le même sid après le commit, sans permettre un nouveau renouvellement. Le contrôle compare les MAC de longueur fixe en temps constant et borne les entrées. Un jeton courant dont la clé de signature vient de tourner peut encore révoquer sa propre ligne par correspondance exacte de hash.

Pour les UUID opaques antérieurs, la première rotation crée atomiquement un pont interne AppConfig `auth.legacy-refresh.<hash>` vers le sid/utilisateur. Il ne sert qu'à révoquer, jamais à authentifier ni renouveler. Sa validité ne dépasse pas l'expiration originale du cookie avant rotation. Les entrées de plus de7jours sont purgées opportunément lors d'une migration. Une erreur de création du pont annule le remplacement du hash, conservant l'ancien jeton utilisable. Aucune migration de schéma ni dépendance nouvelle.

## Validation

Node24.22.3 : types backend/frontend, build backend et build frontend complet réussis, avec environnement public de production et réseau privé. Les régressions utilisent le vrai contrôleur HTTP Nest, AuthService, JwtService et JwtStrategy ; seules la persistance et les intégrations externes sont doublées. Elles couvrent le rejeu refresh/access après logout, les autres logins, l'alias sans access, les access réellement expirés, la signature/expiration/altération des capacités, l'idempotence et les deux ordres de course.

Une preuve supplémentaire utilise un PostgreSQL jetable réel :7 scénarios /43 contrôles, dont un verrou de ligne PostgreSQL observé pendant le commit du renouvellement et un rollback atomique du CAS/pont. Aucun serveur applicatif de production, seed métier, notification ou service SMTP externe n'est lancé.

Reproduction depuis ce dépôt compilé, avec Node24 dans PATH, Docker et une image officielle PostgreSQL16 déjà disponible :

```sh
python3 scripts/integration/auth/run-isolated.py --source "$PWD" --artifacts /root/intranet-session-proofs
```

Le harnais utilise un réseau Docker interne, sans port hôte publié, avec compte/DB aléatoires, 512MiB et stockage tmpfs. Il n'hérite jamais de DATABASE_URL. Les preuves privées sont durables avant suppression de la sandbox réussie. En cas d'échec, il conserve uniquement les ressources étiquetées indiquées dans le manifeste pour diagnostic.

Preuves de cette qualification : `/root/intranet-logout-backend-final-20261113.log`, `/root/intranet-logout-final-20261113.log` (frontend282 tests ; lint des seuls fichiers modifiés sans erreur,6 avertissements préexistants dans sidebar), `/root/intranet-logout-frontend-build-20261113.log`, `/root/intranet-session-qualification-20261113/proofs/20261113T142750Z-0173b4/results.json`. Dernière exécution backend :112 suites /1634 tests réussis. Reproduction du harnais depuis les fichiers livrés : `/root/intranet-session-qualification-20261113/reproducible-proof/20261113T143156Z-f16780/results.json` (PostgreSQL16.16,7 scénarios/43 contrôles, nettoyée).

Un retour à l'ancien artefact traite encore le refresh comme une chaîne opaque et peut vérifier son hash. Il réintroduit cependant les défauts de révocation et ne doit pas être présenté comme une correction de sécurité. Coordonner les artefacts backend et frontend à cause de l'alias nouvellement introduit. Ce lot ne prétend pas que les autres alertes de l'audit ont disparu.
