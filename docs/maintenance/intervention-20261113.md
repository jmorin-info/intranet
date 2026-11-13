# Livraison et exploitation du 13 novembre 2026

Les lots sécurité puis GED, approbations, interface et maintenabilité ont été
installés. Le commit du code applicatif déployé est
`3be0804baf1dc2f8e75738df21f345e7a1ad1c9f`, branche
`maintenance/ged-workflows-20261113` sur la VM. Les configurations CI sont
versionnées ; leur exécution sur GitHub et les protections de branche restent
à vérifier. Aucun push n'a été effectué pendant cette intervention.

## Preuves conservées

- Quatre contrôles de types, 1 538 tests backend, 267 tests frontend et les deux
  builds réussissent sous le Node 20.20.2 exact de la cible.
- Les transactions réelles du moteur passent dix scénarios et 219 assertions
  sur chacune des versions PostgreSQL 16.13 et 16.16, avec données synthétiques.
  Les conflits et interblocages sont rejoués sans doubler les décisions.
- Le navigateur vérifie les interactions bureau/mobile du build final et la
  CSP. L'API y est simulée ; les intégrations authentifiées restent distinctes.
- Après déploiement : API et interface 200, boîte d'approbations sans session
  401, pagination publique invalide 400, accès statique privé 404. Les services
  sont actifs et aucune unité en échec n'est constatée. Une nouvelle connexion
  SSH a également été vérifiée.

Les reçus et archives sont privés sur la VM dans
`/root/intranet-release-20261112/`. Le stage applicatif actif est
`/root/.omnitech-deploy/release-a073a515ff59-q60xs9aj` ; le stage précédent
`release-196fb7c35b07-0wq25381` reste nécessaire au retour arrière.
Ne pas les supprimer : les dépendances peuvent les utiliser par liens.

## Capacité mémoire et swap

La reindexation RAG quotidienne à 01 h, heure de Paris, charge le modèle
`bge-m3` d'environ 1,1 Go. Sur la VM de 6 Go, la mémoire disponible est
descendue à 113 Mio avec le swap initial plein, tandis que l'API répondait.

Un fichier swap supplémentaire de 4 Gio a été activé :
`/swapfile-omnitech-20261113`, root, mode 0600, priorité 10. Le swap existant
est conservé. Son entrée `sw,nofail,pri=10` dans `/etc/fstab` a été validée
séparément et ajoutée sans modifier les entrées initiales. Le diagnostic
préexistant de `findmnt` sur le type du CD-ROM reste inchangé ; aucun nouveau
diagnostic d'erreur n'est introduit. Aucun redémarrage de la VM n'a été testé.

Cette réserve vise la continuité en attendant le dimensionnement RAM. Le
fichier, son entrée et les sauvegardes de configuration sont documentés sous
`/root/intranet-maintenance-20261113/`. Ne pas désactiver ce swap sous pression
mémoire ; son retrait nécessite une capacité disponible suffisante et une
fenêtre d'exploitation. Il ne faut pas utiliser le swap pour justifier des
builds ou analyses lourdes sur cette VM.

## Runtime et autres qualifications

Node 24.22.3 a passé, dans une copie autonome sur SI-IA, les types, les mêmes
1 805 tests, les deux builds, les modules natifs ABI 137, Next et les essais
PostgreSQL 16.13. L'archive officielle et ses empreintes sont conservées.

Le runtime applicatif actif reste **Node 20.20.2**. L'installation et les
sondes Debian 12, puis l'activation de Node 24 pour les deux services seulement,
restent à exécuter dans une fenêtre avec au moins 768 Mio disponibles. Les
scripts et la procédure avec retour arrière sont privés sous
`/root/intranet-maintenance-20261113/node24/`. Les tests locaux du helper et la
qualification Ubuntu ne constituent pas une activation ni une preuve Debian.

La mise à jour PostgreSQL 16.16 reste à qualifier avec pgvector ; voir le
[suivi sécurité](securite-et-mises-a-jour.md). Le durcissement du job de
réindexation doit également couvrir capacité, sources contrôlées, version
courante et purge des anciens chunks.

## Reprise et organisation

Un dump PostgreSQL local a été créé avant la release, sous
`/root/intranet-maintenance-20261112/pre-feature-db/`. Son catalogue est lisible,
mais sa restauration n'a pas été exécutée. Il ne couvre pas à lui seul les
fichiers, clés et configurations et ne remplace pas une copie indépendante.

Restent à formaliser : titulaires et suppléants, revue humaine, protections du
dépôt central, rotation des identifiants d'intervention via un coffre et essai
complet de restauration et de passation. Les preuves locales ne remplacent
pas ces engagements d'exploitation.
