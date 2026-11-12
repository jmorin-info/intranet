# Maintenabilité et reprise de l'intranet

Ce dossier transforme la maintenabilité en critères observables. Les contrôles
locaux, les résultats CI et les essais d'exploitation doivent être distingués.
Une liste de tests réussis ne démontre pas, à elle seule, la qualité de tous les
parcours métier ni la validité d'une restauration.

Procédures détaillées : [GED](ged.md), [approbations](approbations.md) et
[exploitation et reprise](exploitation.md). Les [conventions UI et tests
navigateur](ui-et-approbations.md) complètent les règles métier.
Le [suivi sécurité et mises à jour](securite-et-mises-a-jour.md) distingue les
correctifs appliqués des qualifications et responsabilités encore nécessaires.

## Responsabilités à formaliser

| Fonction | Responsabilité | Décision entreprise |
| --- | --- | --- |
| Responsable technique | Architecture, releases, suivi des dépendances et incidents | Propriétaire actuel du dépôt ; suppléant à désigner |
| Référent GED | Classification, conservation, publication et restauration des documents | À désigner |
| Référent approbations | Circuits, délégations, délais et règles de séparation des responsabilités | À désigner |
| Exploitation | Capacité VM, sauvegardes, supervision et restauration | Équipe et astreinte à confirmer |
| Reviewer | Vérification indépendante du code et des preuves avant release | Au moins un reviewer autorisé |

CODEOWNERS identifie les reviewers techniques. La protection de branche doit
être activée dans l'hébergement Git pour rendre leur validation obligatoire ;
le fichier seul ne configure pas cette protection. Ces réglages ne sont pas
considérés comme appliqués tant qu'ils n'ont pas été vérifiés sur le dépôt distant.

## Propriété et autonomie de l'entreprise

Le dépôt principal, ses sauvegardes, les domaines, l'hébergement et les comptes
d'administration doivent être contrôlés par l'entreprise. Vérifier les droits
de deux administrateurs nominatifs, la récupération des accès et la propriété
des composants et de leurs licences. Les secrets restent dans un gestionnaire
adapté ; un export du dépôt ne doit pas contenir les mots de passe de production.

Conserver les décisions techniques, tickets, changelogs et preuves de validation
dans les outils de l'entreprise. Une conversation avec une IA peut aider à
retrouver le contexte, mais les informations nécessaires à une reprise doivent
être présentes dans le dépôt et les procédures d'exploitation. Chaque correctif
doit identifier son auteur humain responsable et son reviewer ; plusieurs agents
IA ne remplacent pas cette responsabilité.

## Architecture et frontières

- Monorepo : API NestJS, frontend Next.js, application mobile et bibliothèques
  UI/types partagées ; PostgreSQL/Prisma, Redis et services documentaires.
- Les services métier appliquent les droits et invariants. Les contrôleurs
  valident les entrées ; les composants frontend représentent ces règles et
  gèrent les états utilisateur.
- Une décision d'approbation, une nouvelle version et une publication sont
  des opérations métier explicites, auditables et résistantes aux répétitions.
- Les jobs et relances sont idempotents. Leurs tests simulent les notifications
  et services externes, sans expédier de messages aux utilisateurs réels.
- Les définitions de circuits utilisées par des instances ne doivent pas être
  réécrites en détruisant l'historique ; les évolutions passent par une nouvelle
  définition ou une copie versionnée.
- Les règles de lecture s'appliquent à la fiche, au téléchargement, aux versions,
  à l'historique, aux recherches et aux fonctions IA dérivées du document.

Toute évolution de ces frontières nécessite une décision courte dans la PR :
problème, choix, alternatives examinées, conséquences et retour arrière.

## Vérifier sans solliciter la production

Après installation verrouillée des dépendances, dans une copie de développement :

```bash
corepack pnpm install --frozen-lockfile
bash scripts/verify-maintenance.sh
bash scripts/verify-maintenance.sh --build
```

Le script génère le client Prisma, vérifie les types et exécute les tests. Il
n'effectue ni migration ni seed. Il refuse les répertoires, y compris les liens
résolus, utilisés par les services systemd OMNITECH connus, ainsi qu'un client
Prisma résolu hors de la copie. Ce garde ne détecte pas tous les modes
d'hébergement : choisir explicitement une machine de développement ou la CI.
Un audit Node sur la VM de 6 Go a contribué à un épisode de
pression mémoire le 12 novembre 2026. Les compilations et analyses complètes
doivent tourner sur une machine de construction ou en CI.

Les variables publiques nécessaires au build frontend sont fournies par la
configuration du déploiement. Leur empreinte doit correspondre à la cible ;
une compilation avec une URL WebSocket localhost ne constitue pas un artifact
valide pour le site de production.

## Critères d'acceptation d'une release

| Preuve | Critère |
| --- | --- |
| Reproductibilité | Commit, lockfile, runtime supporté et configuration publique identifiés |
| Qualité | Types, tests unitaires et builds exécutés avec codes de sortie conservés |
| Métier | Tests de droits, concurrence, double décision, rejet, délégation expirée, relance répétée et restauration de version |
| Parcours | Essai navigateur réel des scénarios critiques sur une préproduction isolée |
| Sécurité | Secrets, dépendances et images inventoriés ; aucune alerte critique non traitée dans le lot |
| Exploitation | Sauvegarde accessible, état de santé contrôlé, retour arrière documenté et testé |
| Documentation | Changements, contrats API et décisions métier mis à jour dans la même PR |
| Validation | Référent métier et reviewer technique identifiés avec leurs observations |

Un `playwright test --list` vérifie le chargement des specs ; il ne constitue pas
un test navigateur. Le workflow CI existant doit rester explicite sur cette
limite jusqu'à l'exécution réelle de ces scénarios sur les données de test.

Le [harnais PostgreSQL](../../scripts/integration/workflows/README.md) exerce
les vraies transactions du moteur sur une base synthétique isolée : décisions
concurrentes, annulation, refus, permissions et relances. Il conserve version,
empreintes et résultats et ne contacte aucun service métier. Cette preuve
complète les tests unitaires et navigateur sans se confondre avec une recette
authentifiée de l'ensemble de l'application ou une restauration des données.

Le contrôle de dépendances bloque les avis critiques et conserve le rapport
complet. Les autres avis restent dans un backlog nommé, avec précondition,
responsable et échéance ; cette politique n'équivaut pas à « aucune vulnérabilité ».

## Exploitation et cycle de vie

- Relever CPU, mémoire disponible, swap, latence E/S, espace disque et santé des
  services. Une charge élevée peut provenir de la mémoire ou des E/S ; la taille
  du disque libre ne mesure pas sa latence.
- Distinguer sauvegarde des données et retour arrière du code. Restaurer un
  ancien artifact n'autorise pas à écraser des données créées entre-temps.
- Tester une restauration dans un environnement isolé et en conserver la date,
  la durée, l'intégrité des documents et l'authentification après reprise.
- Maintenir une matrice de support pour Node, Debian, PostgreSQL, Prisma et les
  images. Node 20, encore observé sur la VM initiale, est une dette de cycle de
  vie à traiter par une migration validée vers une branche LTS supportée.
- Inventorier et épingler les images par digest ; qualifier leurs mises à jour
  sur les parcours OnlyOffice, PDF et signature avant bascule.

Les procédures ponctuelles d'intervention et leurs preuves sont des éléments
de reprise. Elles doivent être intégrées à un déploiement versionné et à la CI
de l'entreprise avant d'en faire un mécanisme d'exploitation durable.

## Exercice de passation

Une deuxième personne, sans l'auteur principal, doit pouvoir :

1. Installer une copie sans secret de production et exécuter les vérifications.
2. Expliquer le chemin d'un document de son dépôt à son approbation et sa publication.
3. Diagnostiquer un refus de droits et retrouver sa trace d'audit.
4. Déployer une release en préproduction puis revenir à la précédente.
5. Restaurer une sauvegarde de test et vérifier documents, versions et décisions.

Consigner les obstacles et mettre à jour les documents pendant l'exercice.
Les objectifs de reprise et délais d'intervention sont à décider par
l'entreprise en fonction de ses besoins métier.

## Suivi régulier proposé

| Rythme à adopter | Contrôle et preuve conservée |
| --- | --- |
| Chaque changement | Revue, types, tests concernés, CI et changelog |
| Chaque release | Artifact identifié, recette en préproduction, santé et retour arrière |
| Chaque semaine | Incidents, vulnérabilités nouvelles et travaux urgents attribués |
| Chaque mois | Dépendances, capacité, alertes et état des sauvegardes |
| Chaque trimestre | Restauration isolée et passation d'une intervention à un suppléant |

Suivre le taux de releases nécessitant un retour arrière, le délai de correction
des alertes, l'âge du dernier essai de restauration et les obstacles rencontrés
pendant les passations. Le nombre de tests seul ne mesure pas la maintenabilité.
Ces fréquences sont une proposition d'organisation, pas des contrôles déjà
planifiés ni exécutés automatiquement.

Référentiels utiles : [NIST SSDF](https://csrc.nist.gov/pubs/sp/800/218/final)
et [OWASP SAMM](https://owaspsamm.org/model/). Leur usage fournit une démarche
de travail ; il ne constitue pas une certification du projet.
