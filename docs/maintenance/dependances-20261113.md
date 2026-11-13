# Dépendances et runtime — 13 novembre 2026

Ce lot exige **Node 24.22.3** (ABI 137) : `sanitize-html` récent dépend d’un
parseur ESM qui exige Node >=22.12. Les moteurs du monorepo et du mobile, les
workflows CI, `.node-version`, les Dockerfiles et Compose développement sont
alignés sur le Node 24 qualifié. pnpm est fixé à 9.15.0 dans les images.
Ne pas tenter un rollback de ce lot sur Node 20 ; restaurer ensemble le code,
les manifestes, le lockfile et leur artefact compatible.

## Correctifs

Dépendances directes : axios 1.20.0, multer 2.5.0, sanitize-html 2.18.1,
DOMPurify 3.4.17, next-intl 4.9.2, SimpleWebAuthn serveur 13.3.2,
Nodemailer 8.0.11. Les overrides ciblent les branches compatibles de
body-parser, engine.io, socket.io-parser, ws, follow-redirects, form-data,
undici, xmldom, fast-uri, js-yaml, PostCSS, SVGO, source-map-js, browserslist,
brace-expansion (trois branches distinctes), nanoid, tmp, qs, Babel et
postcss-selector-parser. Chaque version effective est figée dans le lockfile.

Les parseurs HTTP/Socket.IO précèdent parfois les gardes de route. Les
correctifs multipart, fragmentation WebSocket, redirections HTTP et parsing
XML/CSS ont donc été priorisés sans attendre une preuve d’exploitation de
chaque entrée applicative. Les conditions exactes restent celles de l’avis
éditeur, par exemple le [fileFilter asynchrone Multer](https://github.com/expressjs/multer/security/advisories/GHSA-q7qp-rjg7-q26m)
et les [URLs data Axios](https://github.com/axios/axios/security/advisories/GHSA-c29m-xwm3-cm6r).

Le graphe passe de 166 compteurs (0 Critical, 78 High, 70 Moderate, 18 Low)
à 21 (0 Critical, 4 High, 16 Moderate, 1 Low). Le dernier audit reste
bloquant pour les avis restants. Le JSON joint conserve
**chaque avis avant/après**, ses versions, chemins de dépendance, gravité et lien,
Les correctifs finaux tmp 0.2.7 et sanitizer 2.18.1 remplacent les premières
cibles intermédiaires 0.2.6 et 2.18.0. Aucun avis n’a été ignoré ni rétrogradé. Ces compteurs portent
sur le graphe et ne mesurent pas un nombre d’attaques démontrées.

## Dette conservée explicitement

- **Nodemailer 8** : les trois High et les avis Moderate qui demandent 9/10
  nécessitent une migration majeure vers une branche corrigée. Les appels
  applicatifs observés construisent `from/to/subject/html` explicitement,
  sans option `raw` issue d’un objet utilisateur ; cela ne prouve pas l’absence
  d’exposition des parseurs d’adresses. Qualifier le rendu MIME, SMTP/TLS,
  STARTTLS, destinataires et erreurs avec un serveur SMTP local avant passage.
- **Zod 3 → 4** : le High de collections contraintes exige une migration de
  schémas et du resolver de formulaire. Le manifeste backend contient Zod,
  mais les imports directs observés sont essentiellement frontend ; garder
  les limites de corps HTTP et qualifier les collections/formulaires.
- **glob/minimatch** : les planchers corrigés du flux d’audit impliquent des
  changements majeurs. Auditer les consommateurs de motifs et leurs limites
  puis qualifier les API de parcours de fichiers avant override global.
- **deepmerge** : aucun correctif déclaré dans l’avis. Examiner les entrées
  de fusion et remplacer le consommateur concerné ; l’avis Low reste ouvert.

## CI et images

Jest reçoit `--runInBand` dans le job CI pour limiter la pression des runners.
La liste des modules ESM transformés par Jest 29 est étendue au nouveau parseur
HTML ; aucun mock ne remplace le sanitizer réellement testé.

Le Dockerfile backend conserve la topologie des liens pnpm entre la racine,
les packages et `apps/backend` ; il ne copie plus un répertoire Prisma absent
et utilise un compte de service propre. Le frontend emploie `tsconfig.base.json`
et les filtres de workspaces complets. Les images gardent les dépendances de
construction à ce stade : une réduction de surface via pruning reste à qualifier.
Le build local Docker est distinct de la production Debian sous systemd.
Un build d’image réussi ne vaut pas audit de ses paquets OS ni test de son
application avec données réelles.

Les preuves de build et de test restent privées sur la station. Le parent de
l’intervention complète la validation consolidée et publie le résultat CI avant
activation de ces dépendances sur l’application.
