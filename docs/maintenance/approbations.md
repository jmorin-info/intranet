# Circuits d’approbation, relances et automatisation

## Frontières métier

Deux parcours existants sont conservés. Le cycle qualité du document suit
`DRAFT → IN_REVIEW → REVIEW_APPROVED → PENDING_APPROVAL → APPROVED`.
La vérification technique est facultative si aucun vérificateur n’est désigné ;
la revue et la confirmation du rédacteur précèdent l’approbation finale.
Les circuits configurables et les règles N+1 ajoutent leurs propres décisions
sur la même version. Leur achèvement ne publie jamais directement le document.

Ce lot ne promet pas une séparation universelle entre tous les rôles. Dans le
cycle qualité et les nouveaux circuits, le rédacteur ne décide pas des étapes
de validation de son propre document. Un relecteur peut aussi être approbateur
si la configuration métier existante le désigne. La dérogation d’un ADMIN à
l’assignation qualité reste autorisée et auditée avec le décideur réel ; elle
n’autorise pas l’auteur à valider son propre document dans ce parcours.
Les routes administratives explicites `directPublish` et `forceApprove` restent
des exceptions distinctes, à encadrer par l’entreprise et à tracer dans l’audit.
Aucun paramètre de séparation des responsabilités n’a été ajouté au schéma.

## Invariants d’exécution

- Une décision porte sur la version courante immuable, appartenant au document,
  avec contrôle antimalware `CLEAN`. Une analyse en attente ou une version
  remplacée bloque la décision. Le contenu natif est réellement stocké et
  versionné avant sa soumission ; aucun chemin `inline://` artificiel n’est créé.
- La soumission compare version, contenu, titre et date de modification au
  snapshot. Une édition commencée en parallèle ne peut pas modifier le texte
  après sa mise en validation. Les versions restent immuables après un refus.
- L’utilisateur est actif et non supprimé. L’assignation explicite prévaut ;
  sinon, le sélecteur est un utilisateur, un département principal ou un rôle.
  Les rôles en lecture seule `AUDITEUR` et `PRESTATAIRE` ne sont pas des décideurs.
  Les nouvelles étapes exigent exactement un type de sélecteur.
- Seule l’étape courante d’un circuit `PENDING` reçoit une décision. Le même
  envoi répété par le même décideur renvoie l’état acquis sans réécrire le motif
  ni doubler l’audit. Une autre décision sur une étape consommée renvoie `409`.
- Un ancien circuit resté pendant sur un document `APPROVED`, `ARCHIVED` ou
  `OBSOLETE` n’apparaît plus dans la boîte et ne peut recevoir ni décision,
  relance ou escalade. Un circuit commencé sur un `DRAFT` reste utilisable
  avant la soumission au cycle qualité ; l’historique demeure consultable.
- Les transitions et audits dynamiques partagent une transaction PostgreSQL
  `Serializable`, avec au plus trois nouvelles tentatives sur le conflit Prisma `P2034`.
  Les mises à jour conditionnelles protègent aussi les transitions qualité.
- `SINGLE` demande une décision ; `PARALLEL_ANY` demande le quorum configuré ;
  `PARALLEL_ALL` demande toutes les voix par défaut. Pour ce dernier, un quorum
  explicite supérieur à 1 et inférieur au groupe permet ce seuil intermédiaire.
  Un refus termine le circuit, quel que soit le mode. Les votes devenus inutiles
  sont marqués `SKIPPED`, jamais transformés en approbations.
- Le graphe visuel traverse réellement `START`, `BRANCH`, les validations et
  `END`. Une branche doit avoir une seule condition satisfaite ou une seule
  sortie dont la condition est explicitement `null`. Une ambiguïté, une étape
  manquante ou une divergence sans `BRANCH` bloque l’exécution. Les conditions
  malformées et les champs inconnus ne correspondent pas. La récursion est bornée.
- Une définition ayant au moins une instance, même terminée, garde ses étapes,
  son nom, sa description et sa catégorie. La duplication remappe tous les
  identifiants et toutes les transitions vers un nouveau circuit désactivé.
  Activation et choix du défaut restent modifiables.
- L’aller-retour dans l’éditeur visuel conserve le mode parallèle et le quorum
  d’une étape classique : changer son apparence ne réduit pas ses validations.

## Refus et retour pour correction

Un refus dynamique exige un motif non vide, termine ses autres validations,
remet la même version en `DRAFT` et clôt la demande qualité encore pendante.
Le rédacteur reçoit une notification interne avec le motif. Aucune décision
qualité n’est fabriquée au nom d’un autre acteur.

Un refus de vérification, de revue ou d’approbation qualité compare l’étape et
la version attendues, enregistre la décision réelle, remet le document en
`DRAFT` et annule ses circuits dynamiques encore pendants dans la même
transaction. Il ne clone pas une version à contenu inchangé. La prochaine
édition ou le prochain dépôt crée la nouvelle version par le service GED.

La publication finale exige la revue approuvée, la vérification approuvée si
elle a été demandée, une demande finale et une étape pendantes sur cette
version. Si un circuit additionnel existe pour cette version, le plus récent
doit être `APPROVED`. Un circuit refusé, annulé ou en retard ne constitue pas
une permission de publier. Les anciens états incohérents sont refusés avec
un message de reprise ; aucun historique n’est réparé en inventant une décision.

## Échéances, relances et délégations

Le délai `slaHours` commence à l’activation de chaque étape, et non au démarrage
initial du circuit. Les échéances des étapes futures restent vides. Le moteur
notifie les acteurs de l’étape qui s’ouvre, dans la transaction de transition.

La relance manuelle est réservée au demandeur du circuit ou à un administrateur.
Une marque d’audit par circuit, étape et date civile `Europe/Paris` limite les
relances à une par jour. La notification interne et cette marque sont écrites
dans la même transaction ; un échec ne consomme pas la relance. Le job ouvré
à 09 h de Paris examine les circuits pendants par pages de 100, sans laisser
les circuits suivants hors du traitement. Il relance après l’échéance ; sans
SLA explicite, il applique le délai de 48 h depuis l’activation.

L’escalade automatique utilise la cible `escalateToUserId`, sinon le manager,
puis un `SUPER_ADMIN` actif distinct du décideur et du rédacteur. Elle ne touche
que la tâche courante en retard, avec contrôle de version, `escalatedAt` et mise
à jour conditionnelle. Un destinataire déjà porteur d’une autre voix de la même
étape ne reçoit pas une seconde voix. Audit et notification sont atomiques.
Le seuil de secours `delegation.autoThresholdHours` reste configurable
(défaut 48 h) pour les étapes sans échéance. Le job reste quotidien à 03 h
selon le fuseau du serveur ; changer ce fuseau est une décision d’exploitation.

Aucune délégation `GLOBAL` de sept jours n’est créée à cause d’une seule tâche
en retard. Les anciennes délégations automatiques globales sont exclues de la
résolution à l’activation. Les délégations manuelles, actives à l’activation de
l’étape, conservent la priorité catégorie puis globale, sans suivre une chaîne.
Une délégation expirée, révoquée, vers l’auteur ou fusionnant deux voix n’est
pas appliquée. La création d’une absence ne réattribue pas rétroactivement une
tâche déjà ouverte : celle-ci garde son assignation ou suit l’escalade de retard.
La révocation empêche les activations futures ; elle ne réécrit pas l’historique
ni une assignation déjà appliquée.

Le champ historique `autoApproveOnTimeout` est conservé pour compatibilité.
Il n’avait pas d’exécuteur effectif ; ce lot n’introduit aucune approbation par
silence. L’interface doit annoncer une relance ou une escalade et une décision
humaine, jamais une publication automatique.

## Règles automatiques N+1

Les règles sont appliquées à la soumission d’une version, dans la transaction
de mise en revue, et non à la création d’une fiche sans fichier. La première
règle active correspondante est choisie par `priority ASC`, puis `createdAt DESC`.
Une condition vide sert de défaut explicite ; une condition nécessitant un
contexte absent, un montant absent ou une clé inconnue ne correspond pas.

Le circuit compilé est inactif, non proposé comme modèle réutilisable, et garde
les sélecteurs utilisés dans ses étapes. Les groupes parallèles de même niveau
et de même identifiant partagent une étape et leurs acteurs sont dédupliqués.
Deux niveaux différents ne sont pas fusionnés. Un acteur absent, un groupe
sans décideur ou un circuit déjà actif incompatible fait échouer toute la
soumission ; aucune demi-instanciation ne doit être conservée.

## Contrats HTTP pour l’interface

| Route | Contrat utile |
| --- | --- |
| `GET /approval-workflows/pending/me` | Étapes courantes seulement, `dueAt`, `isOverdue`, `instance.startedById`, `instance.document` avec `id/title/reference/status/ownerId/currentVersionId` |
| `POST /approval-workflows/steps/:id/decide` | `:id` est l’`ApprovalStepInstance.id` de la boîte ; corps `{decision,comment}` ; refus motivé ; conflit `409` à recharger |
| `POST /approval-workflows/instances/:id/remind` | `{sent,alreadySent,recipientCount}` ; notification interne ; demandeur ou ADMIN+ |
| `GET /approval-workflows/documents/:documentId/history` | `{instances,events}` avec contrôle d’accès ; 20 circuits et 500 événements au maximum |
| `POST /approval-workflows/:id/duplicate` | ADMIN+ ; copie indépendante désactivée et non défaut |
| `GET /approval-workflows/:id` et `/:id/graph` | `definitionLocked` pour expliquer le gel ; détail avec `_count.instances` |
| `POST /workflow-rules/evaluate` | Simulation des règles actives, réponse `{context,matchedRuleId,matchedRuleName,steps}` |

## Matrice avant / après et preuves

| Scénario | Comportement corrigé | Preuve principale |
| --- | --- | --- |
| Double clic / requêtes concurrentes | Une décision durable ; répétition identique sans réécriture, décision divergente en conflit | `workflow-runtime.service.spec.ts` |
| Étape future dans la boîte | Seule l’étape ouverte est proposée et décidable | Runtime, tests de boîte et de permissions |
| Auteur, autre utilisateur, compte inactif | Refus explicite côté service ; le navigateur ne porte pas la sécurité | Runtime et `workflow-publication.security.spec.ts` |
| Version remplacée ou scan non terminé | Validation et publication refusées | Runtime et garde de publication |
| Délais simultanés de toutes les étapes | Délai propre à chaque activation ; aucune relance de l’étape future | Runtime et délégation |
| Relance répétée / lots dépassant 100 circuits | Une notification quotidienne par acteur courant, toutes les pages parcourues | Runtime, horloge et notifications simulées |
| Rejet laissant un circuit pendant | Retour en brouillon et clôture cohérente des deux parcours | Runtime et garde de publication |
| Rejet créant un faux incrément de fichier | Version rejetée conservée ; prochain changement réel versionné par la GED | Garde de publication |
| Publication malgré circuit additionnel refusé | Publication bloquée jusqu’au circuit approuvé de cette version | Garde de publication, matrice des statuts |
| Graphe enregistré mais parcours ignoré | Choix de branche réel ; sorties non choisies jamais activées | Runtime et `workflow-engine.service.spec.ts` |
| Modification d’un modèle déjà utilisé | Historique gelé, duplication indépendante ; aucun effacement de décisions | Moteur, gardes des définitions |
| Retard d’une tâche créant des pouvoirs globaux | Réattribution de cette tâche seulement, audit/CAS, une seule escalade | `delegation.service.spec.ts` |
| Deux voix déléguées à la même personne | Collision refusée ; quorum indépendant conservé | Délégation et runtime |
| Règle N+1 instanciée sans version à la création | Instanciation lors de la soumission versionnée, groupes et audit dans la transaction | `workflow-rules.service.spec.ts`, soumission native |

Vérifications locales effectuées dans la copie d’évolution, sans envoi réel :
types backend valides et 174 tests réussis dans huit suites ciblées.

```bash
corepack pnpm --filter @omnitech/backend typecheck
corepack pnpm --filter @omnitech/backend exec jest --runInBand --silent approval-workflows workflow-rules documents/workflow
```

Les tests utilisent des doublures Prisma et des notifications en mémoire ; ils
vérifient les prédicats de concurrence et les transactions demandées au client,
pas l’ordonnancement réel de PostgreSQL. Avant une release, exercer en
préproduction deux sessions concurrentes, une soumission native, un refus puis
une nouvelle version, une copie de graphe utilisé et une relance de part et
d’autre de minuit à Paris. Faire valider par le référent métier les groupes,
quorums, droits d’exception et seuils. Aucune migration du schéma n’est nécessaire.


Le contrôle réel [PostgreSQL isolé](../../scripts/integration/workflows/README.md)
complète les mocks : dix scénarios et 219 assertions ont été exécutés sur
PostgreSQL 16.16 jetable, avec répétition des courses et comptage des lignes
d’audit et de notification. Il a révélé le SQLSTATE `40P01` remonté par Prisma
comme erreur `Unknown` dans une course approbation/annulation. La reprise de
transaction reconnaît maintenant cette forme structurée ; les deadlocks
observés dans l’essai final ont été absorbés sans doublon ni erreur `500`.
La version mineure de la base, les empreintes des services et les résultats
détaillés restent dans les preuves privées de la release. Le runner n’exécute
aucun transport de notification et exige une URL de base de test dédiée.
