# CodeQL : corrections backend prioritaires

Base : `4a2c6cbfaae30dfb99567e8309771c1ed1809f92`. Le rapport PR24
signale huit Critical. Cette qualification corrige les frontières d’entrée et
les téléchargements ; elle conserve les règles et résultats du scanner.
Une nouvelle analyse CodeQL doit confirmer l’état de chaque alerte après fusion.
Aucun statut d’alerte GitHub n’est modifié par ce lot.

| Alerte | Entrée / correction | Preuve locale |
| --- | --- | --- |
| 12 | Callback OnlyOffice SMB : utilise le téléchargeur commun configuré | La sauvegarde n’utilise plus fetch sur l’URL du callback |
| 13 | Callback OnlyOffice GED : même transport, corps borné | Redirect local anciennement suivi reproduit ; nouveau transport refuse 302 sans joindre la cible |
| 14 | Soumission DocuSeal : ID entier positif sûr, redirections refusées pour tous les appels portant la clé API | Chemins relatifs, query strings, objets/tableaux et entiers hors précision refusés avant fetch |
| 278 | Téléchargement Office : token scalaire borné avant JWT/log ; headers traités par type effectif | Token tableau/objet refusé 400 sans appel JWT |
| 61 | Questions du quiz : vrai tableau, champs/options/index valides et bornés, ID uniques | Faux tableaux et index chaîne refusés avant écriture AppConfig |
| 58, 59 | Mentions : texte primitif borné avant parsing/extrait | Objet/tableau refusé avant recherche utilisateur ou notification |
| 57 | Base helpdesk : vrai tableau d’articles, mots clés et textes validés | Formes imbriquées invalides refusées avant écriture ; recherche non scalaire refusée avant lecture |

Les alertes de type ne démontrent pas huit compromissions. Plusieurs chemins
étaient déjà protégés par rôle ou par token, mais leur forme d’entrée n’était
pas contrôlée réellement et pouvait provoquer une erreur ou corrompre une
configuration. Les assertions TypeScript seules sont remplacées par des
contrôles exécutés avant toute action.

## Contrat de téléchargement OnlyOffice

L’origine de connexion est construite exclusivement depuis
`ONLYOFFICE_DOCUMENT_SERVER_URL` et `ONLYOFFICE_INTERNAL_DS_URL`. L’entrée du
callback fournit uniquement le chemin et sa query string après validation :
origine exacte (schéma, hostname, port), absence de credentials/fragment/control
characters, chemin sous le cache du serveur configuré et rejet des traversées
encodées. La signature entrante du callback, le token de session/document et
les contrôles de droits existants restent nécessaires ; le transport ne leur
substitue aucune identité.

Le hostname configuré est résolu une fois. Toutes ses réponses A/AAAA doivent
passer le contrôle d’adresse ; une réponse est ensuite épinglée au socket,
sans nouveau lookup et sans proxy ambiant. Métadonnées/link-local, adresse
indéfinie et multicast sont refusés. Un hostname distant qui se résout vers
loopback est refusé ; localhost ou une IP loopback explicitement configurés
restent utilisables pour un Docs Server local. Les adresses privées d’un
hostname interne configuré restent autorisées : l’intranet utilise des
services internes. La configuration et son DNS administratif sont donc des
composants de confiance ; ce contrôle ne prétend pas résister à leur compromission.

Les redirections sont refusées, le TLS vérifie la chaîne et le hostname
configuré, le corps est lu en streaming avec un plafond de 50 MiB et un délai
total de 60 secondes (DNS inclus). Des réponses encodées inattendues sont
refusées. Une erreur ne sauvegarde aucun corps partiel. Les URLs signées de
cache refusées ne sont plus recopiées dans les journaux.

Cette approche suit la séparation entre application de confiance configurée et
URL non fiable décrite dans la [fiche SSRF OWASP](https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html).
Les identifiants de soumission correspondent au contrat entier de
[l’API DocuSeal](https://www.docuseal.com/docs/api).

## Vérifications et limites

- Serveurs HTTP/TLS locaux éphémères, dans un namespace réseau privé : transfert
  nominal, ancien suivi de redirection reproduit, destination secondaire jamais
  jointe par le nouveau transport, DNS épinglé, refus metadata/IPv4-mapped IPv6,
  limites Content-Length et chunked, délai, certificat auto-signé refusé.
- Contrôles négatifs de tableaux/objets aux frontières quiz, helpdesk, mentions,
  Office et DocuSeal ; absence d’écritures/notifications en cas d’entrée invalide.
- Suites existantes Office et signatures conservées, avec la frontière de
  transport simulée pour leurs scénarios métier. Le transport réel est couvert
  séparément par les serveurs locaux.
- Backend complet : 111 suites / 1 598 tests passent sous Node24 en réseau privé.
  Le build et le typecheck backend sont vérifiés dans la copie autonome.

Aucun callback réel, mail, accès à DocuSeal/OnlyOffice de production ou mutation
de la VM n’est effectué. Ce lot ne qualifie pas le déploiement intégral du
fournisseur ni la reprise d’un fichier modifié via Office ; le statut antivirus
et les autres High backend restent à examiner séparément.
