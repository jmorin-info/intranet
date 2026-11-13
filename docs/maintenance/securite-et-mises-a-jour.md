# Sécurité et mises à jour — état au 13 novembre 2026

Les corrections doivent rester traçables : défaut, composant concerné,
préconditions d'exploitation, correctif, responsable, échéance et preuve de
validation. Une montée de version réussie ne remplace pas cette analyse.
Les responsables et échéances du backlog ci-dessous restent à attribuer par
l'entreprise ; ce document ne vaut pas acceptation de risque.

## Inventaire et travaux à qualifier

| Composant | État observé | Suite et preuve attendue |
| --- | --- | --- |
| Authentification et fichiers privés | Lot sécurité appliqué, sources et artifacts identifiés, santé vérifiée | Recette des rôles/MFA avec comptes dédiés et suivi des journaux |
| Dépendances applicatives | Audit après correctifs : 0 Critical, 78 High, 70 Moderate, 18 Low | Triage des chemins exposés et correction des avis restants ; conserver le rapport complet |
| Node | 20.20.2 sur la VM et builder compatible | Migration validée vers une branche LTS maintenue, avec dépendances natives et intégrations testées |
| PostgreSQL | 16.13 installé, candidat APT 16.16 | Qualification des extensions C et prescriptions de réindexation avant bascule |
| pgvector | Extension 0.8.2 et paquet 0.8.2-1.pgdg12+1 | Prouver la reconstruction et la compatibilité avec PostgreSQL 16.16 ; un simple smoke SQL ne suffit pas |
| VM et protections | Environ 6 Go, épisode OOM et attentes ESET constatés | Dimensionnement mémoire, investigation E/S et supervision ; conserver les protections actives |
| Images et services annexes | OnlyOffice, signature, IA et autres intégrations | Inventaire des versions/digests, qualification des correctifs et contrôle des droits de service |
| Sauvegarde et continuité | Procédures documentées ; points de reprise locaux distincts des copies indépendantes | Restauration complète isolée, intégrité fichiers/base et objectifs RTO/RPO mesurés |

Les compteurs d'avis de dépendances portent sur le graphe installé ; ils ne
représentent pas autant de failles exploitables démontrées. Ils ne constituent
pas non plus une preuve d'absence de vulnérabilité dans les autres composants.
La CI bloque les avis critiques de production et conserve l'inventaire ; les
autres niveaux nécessitent un suivi explicite.

## Qualification PostgreSQL

Les [notes officielles de PostgreSQL 16.16](https://www.postgresql.org/docs/16/release-16-16.html)
précisent que la protection complète de CVE-2026-6460 nécessite la reconstruction
des extensions C, avec adaptation de certaines extensions. La simulation APT
observée ne remplace que le serveur et le client 16 ; le paquet pgvector reste
inchangé. Cette réserve ne prouve pas une incompatibilité fonctionnelle de
pgvector : elle identifie une preuve de qualification manquante.

Conserver les contrôles de types activés. Examiner aussi les prescriptions des
versions intermédiaires pour déterminer les réindexations effectivement
applicables. Une mise à jour mineure ne demande pas `pg_upgrade`, mais exige
une sauvegarde restaurable et un redémarrage préparé.

Les essais de transactions synthétiques sous PostgreSQL 16.16 vérifient le
moteur d'approbation ; ils ne qualifient ni pgvector ni tous les index de la
base métier. La base de production reste en 16.13 tant que ces conditions
ne sont pas traitées et la bascule constatée.

## Suivi d'une correction

1. Relier l'avis au composant et au chemin effectivement utilisé.
2. Choisir une version et un runtime supportés, sans ignorer l'avis pour rendre
   un contrôle vert.
3. Tester dans un environnement isolé, avec les intégrations concernées.
4. Préparer release, sauvegarde, contrôles de santé et retour arrière.
5. Conserver le résultat du déploiement, puis fermer le ticket sur preuve.

Les changements d'architecture ou d'exceptions métier se décident avec le
référent concerné. Les secrets restent hors dépôt et les comptes
d'administration doivent être nominatifs et récupérables par l'entreprise.
