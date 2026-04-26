# Guide administrateur — OMNITECH Intranet

> Public : rôles `ADMIN` et `SUPER_ADMIN` (administration fonctionnelle
> et technique de l'intranet OMNITECH Security).
> Périmètre : tâches d'exploitation courantes, configuration, gouvernance,
> audit. Les procédures opérationnelles détaillées (backups,
> restauration, incidents) sont déléguées aux runbooks
> [`runbooks/`](./runbooks/) — ce guide y renvoie sans les dupliquer.
> Version : 1.0 — 2026-04-26.
> Documents complémentaires :
> [`USER_GUIDE.md`](./USER_GUIDE.md), [`FAQ.md`](./FAQ.md),
> [`FEATURES_SHIPPED.md`](./FEATURES_SHIPPED.md), [`RELEASE_PROCESS.md`](./RELEASE_PROCESS.md).

---

## Sommaire

1. [Vue d'ensemble — rôles et responsabilités](#1-vue-densemble--rôles-et-responsabilités)
2. [Gestion des utilisateurs](#2-gestion-des-utilisateurs)
3. [Documents et workflows](#3-documents-et-workflows)
4. [Audit et conformité](#4-audit-et-conformité)
5. [Tableau de bord RSSI](#5-tableau-de-bord-rssi)
6. [Configuration applicative](#6-configuration-applicative)
7. [Sauvegardes et plan de continuité (PCA)](#7-sauvegardes-et-plan-de-continuité-pca)
8. [Monitoring et santé système](#8-monitoring-et-santé-système)
9. [Gestion des incidents](#9-gestion-des-incidents)
10. [Sécurité plateforme](#10-sécurité-plateforme)

---

## 1. Vue d'ensemble — rôles et responsabilités

| Rôle           | Périmètre admin                                         |
|----------------|---------------------------------------------------------|
| `SUPER_ADMIN`  | Configuration globale, sauvegardes, vue 360° des accès, RSSI, mode maintenance. |
| `ADMIN`        | Utilisateurs, départements, contenus, audit log, rapports, médiathèque, ticket-spaces. |
| `REVIEWER`     | Validation des workflows d'approbation et de la conformité documentaire. |
| `AUDITEUR`     | Lecture seule sur audit, exports, journaux (lecture sans action). |
| `DIRECTION`    | Vue exécutive (tableaux de bord). Pas d'actions admin.  |
| `COLLABORATEUR`| Pas d'accès admin (consultable dans `USER_GUIDE.md`).   |
| `PRESTATAIRE`  | Accès simplifié, hors administration.                   |

**Principe de moindre privilège** : un compte ne doit jamais cumuler
les rôles RSSI / SUPER_ADMIN / DPO sans justification documentée. Une
revue trimestrielle des accès (`/admin/access-reviews`, SUPER_ADMIN
uniquement) est obligatoire.

---

## 2. Gestion des utilisateurs

### 2.1 Liste et création — `/admin/users`

- Filtres : rôle, département, statut (actif / désactivé / verrouillé),
  MFA (activé / requis / non requis), source (LDAP / manuel).
- Actions ligne par ligne : voir profil, désactiver, réactiver,
  réinitialiser MFA, modifier le rôle, modifier le département.
- Actions en lot (bulk) : appliquer une politique MFA (`mfaRequired=true`),
  forcer un changement de mot de passe au prochain login,
  exporter la sélection en CSV.
- Création manuelle d'un compte : utilisée uniquement pour les comptes
  hors LDAP (prestataires, comptes de service). Les comptes
  collaborateurs sont créés par synchronisation LDAP.

### 2.2 Synchronisation LDAP

La synchronisation est principalement automatique (cron). Un
**lancement manuel** ou une **revue des comptes en attente** se font
depuis :

- `/admin/ldap-pending` — comptes LDAP détectés mais non encore
  validés. Action : valider, refuser, fusionner avec un compte existant.
- Procédure complète : voir
  [`runbooks/LDAP_SYNC_MANUAL.md`](./runbooks/LDAP_SYNC_MANUAL.md).

> Astuce : un badge ambré dans la sidebar (hub Administration) indique
> le nombre de comptes LDAP en attente. Un compteur > 0 doit être traité
> sous 24 h ouvrées.

### 2.3 Politique MFA

- `/admin/users` → bouton **Politique MFA** sur la sélection.
- Trois modes : `optionnel`, `requis (avec délai 7 jours)`, `requis
  immédiat`.
- Champs traçabilité : `mfaEnforcedAt`, `mfaEnforcedById`.
- Procédure de réinitialisation utilisateur : voir
  [`runbooks/MFA_ENROLLMENT.md`](./runbooks/MFA_ENROLLMENT.md).

### 2.4 Onboarding et offboarding

- `/admin/onboarding` : suivi des parcours d'arrivée (chartes à signer,
  formations à suivre, documents à lire). Activable via le flag
  `features.onboardingAdmin`.
- Désactivation d'un compte : passe en statut `DESACTIVE`, l'accès est
  bloqué, le ticket de clôture est journalisé. Aucun compte n'est
  supprimé en base (rétention 7 ans).
- Audit AD : `/admin/ad-audit` — détection des écarts entre LDAP et
  base interne (comptes orphelins, désactivés à droite mais actifs à
  gauche).

### 2.5 Départements et accès externes

- `/admin/departments` : gestion des départements, managers,
  responsables conformité.
- `/admin/external-access` : accès partenaires / prestataires
  (périmètre limité, expiration obligatoire).
- `/admin/access-overview` (SUPER_ADMIN) : **vue 360° des accès** par
  utilisateur, par module, par espace.
- `/admin/access-reviews` (SUPER_ADMIN) : revue trimestrielle des
  accès (audit ISO 27001 A.5.18).

---

## 3. Documents et workflows

### 3.1 Workflows d'approbation — `/admin/workflows`

- Définition des workflows par catégorie de document
  (Politique → RSSI, Procédure → N+1, Document RH → DPO, etc.).
- Étapes paramétrables : approbateur, délai, escalade.
- Édition d'un workflow : `/admin/workflows/[id]`.
- Suivi des approbations en cours : badge ambré dans la sidebar.

### 3.2 Conformité ISO 27001 — `/admin/compliance`

- Cartographie des contrôles ISO 27001:2022 couverts.
- État des contrôles : couvert / partiel / non couvert.
- Lien vers les documents associés à chaque contrôle.
- Export PDF de la matrice de couverture.

### 3.3 Chartes — `/admin/chartes`

- Création / publication des chartes (informatique, éthique, RGPD).
- Activation **modale bloquante** : la charte est imposée à la
  prochaine connexion de chaque utilisateur concerné.
- Suivi du taux de signature, relances automatiques.

### 3.4 Certifications utilisateur — `/admin/certificates`

- Suivi des formations / habilitations / certifications.
- Alertes d'expiration (60 / 30 / 7 jours avant).
- Export PDF des justificatifs par utilisateur.

### 3.5 Rétention documentaire

- Politique : **7 ans minimum** pour les documents ISO 27001
  (A.5.33 — Protection des enregistrements).
- Aucune suppression définitive côté ADMIN. Le SUPER_ADMIN peut
  exécuter une purge après validation 4-yeux RSSI / DPO.

---

## 4. Audit et conformité

### 4.1 Journal d'audit — `/admin/audit`

- Vue chronologique des événements (connexion, modification,
  suppression, consultation sensible).
- Filtres : utilisateur, type d'événement, ressource, période, IP.
- Conservation : **365 jours** en base chaude, archivage froid au-delà.
- Export CSV / JSON pour audit externe.

### 4.2 Rapports — `/admin/reports`

- Rapports périodiques (hebdo / mensuel / trimestriel / annuel).
- Indicateurs : adoption, qualité documentaire, MFA, incidents.
- Export PDF signé (SHA-256) pour archivage SMSI.

### 4.3 Audit Active Directory — `/admin/ad-audit`

- Détection des incohérences AD ↔ base interne.
- Statuts : compte AD désactivé mais actif côté intranet, compte
  intranet sans AD, doublons.

### 4.4 Exports IT — `/admin/it-exports`

- Génération à la demande d'extractions sécurisées (CSV signé).
- Cas d'usage : audit interne, contrôle URSSAF, demande RGPD.
- Exécution soumise à **revalidation MFA** (12 h max).

### 4.5 Vue 360° des accès — `/admin/access-overview` (SUPER_ADMIN)

Vue consolidée par utilisateur :

- Rôles applicatifs.
- Espaces / modules autorisés.
- Documents propriétaires.
- Workflows actifs.
- Sessions récentes (timestamp + IP).

---

## 5. Tableau de bord RSSI

`/admin/rssi-dashboard` (SUPER_ADMIN / RSSI) — synthèse cyber
sécurité ISO 27001:2022.

### 5.1 Cartes par domaine

10 domaines ISO sont représentés sous forme de cartes (politique,
ressources humaines, contrôle d'accès, cryptographie, opérations,
communications, acquisition, fournisseurs, incidents, continuité).

### 5.2 Score cyber — `/admin/cyber-score`

- Score global /100 calculé à partir de signaux temps réel (MFA,
  patches, formations, incidents, etc.).
- Tendance 7 j et 30 j.
- Historique 90 jours.
- Recalcul manuel via le bouton dédié (sinon snapshot dimanche 03 h).

### 5.3 Export PDF SMSI

- Bouton **Exporter PDF SMSI** : génère un rapport conforme ISO 27001
  signé SHA-256, archivable comme preuve d'audit.
- Stockage automatique dans `/admin/reports`.

---

## 6. Configuration applicative

### 6.1 Configuration générale — `/admin/config` (SUPER_ADMIN)

Table `AppConfig` (clé/valeur typée) accessible via l'UI :

| Clé                          | Effet                                                 |
|------------------------------|-------------------------------------------------------|
| `noa.humor.enabled`          | Active/désactive globalement le mode humour NOA.      |
| `banner.enabled`             | Active la bannière d'annonce (haut de page).          |
| `banner.message`             | Texte de la bannière.                                 |
| `banner.severity`            | `info` / `warning` / `critical`.                      |
| `maintenance.mode`           | Active la **page maintenance** (lecture seule).       |
| `maintenance.message`        | Message affiché en mode maintenance.                  |
| `noa.suggestions.enabled`    | Suggestions proactives NOA.                           |
| `glance.enabled` (env)       | Active l'overlay Alt+Clic. Voir `NEXT_PUBLIC_GLANCE_ENABLED`. |

### 6.2 Espaces et modules — `/admin/spaces` (SUPER_ADMIN)

- Définition des **espaces fonctionnels** (Documents, Tickets, Wiki,
  Médiathèque, etc.).
- Assignation des modules aux rôles et départements.
- API utilisée par la sidebar pour filtrer les items
  (`/spaces/my-modules`).

### 6.3 Espaces de ticketing — `/admin/ticket-spaces`

- Création de files de tickets par équipe (IT, RH, Généraux, Sécurité).
- Configuration : SLA, agents responsables, modèles, formulaires.

### 6.4 Médiathèque — `/admin/media`

- Modération des albums et photos.
- Couvertures dédiées par album (générées au upload).
- Albums : `/admin/media/albums/[id]`.

### 6.5 Avis et enquêtes — `/admin/feedback`

- Création d'enquêtes de satisfaction.
- Suivi des réponses : `/admin/feedback/surveys/[id]`.
- Export CSV des résultats.

### 6.6 Témoignages utilisateurs — `/admin/testimonials`

- Modération des avis libres déposés via `/testimonials`.
- Aucun avis n'est publié sans validation ADMIN.

### 6.7 Audit du mode sombre — `/admin/dark-mode-audit`

Outil d'aide à l'équipe design pour vérifier la couverture du thème
sombre sur l'ensemble des routes.

---

## 7. Sauvegardes et plan de continuité (PCA)

### 7.1 Sauvegardes — `/admin/backups`

- Vue des dernières sauvegardes (date, taille, statut, hash).
- Lancement manuel d'un backup ad hoc (validation 4-yeux requise).
- **Procédure complète** :
  [`runbooks/DATABASE_BACKUP_RESTORE.md`](./runbooks/DATABASE_BACKUP_RESTORE.md)
  et [`RESTORE.md`](../RESTORE.md).

### 7.2 PCA / Continuité — `/admin/pca` (SUPER_ADMIN)

- Suivi des **drills de restauration** hebdomadaires.
- Détail d'un drill : `/admin/pca/runs/[id]`.
- KPI : RPO (24 h), RTO base de données (2 h), RTO global (4 h).

> Toute restauration **réelle** suit la procédure documentée :
> dry-run obligatoire, revue 4-yeux RSSI / DSI, journalisation
> ticket d'incident.

### 7.3 Certificats TLS — `/admin/certificates`

- Suivi des certificats serveur (front, back, BunkerWeb).
- Alertes 60 / 30 / 7 jours avant expiration.
- Procédure de rotation : voir
  [`runbooks/SECRETS_ROTATION.md`](./runbooks/SECRETS_ROTATION.md).

---

## 8. Monitoring et santé système

### 8.1 Santé applicative — `/admin/system-health`

- Statut des services : backend, frontend, base, Redis, queues
  (BullMQ), Ollama, DocuSeal.
- Pastille globale visible dans la sidebar (verte / ambre / rouge).
- Healthcheck simple : `GET /api/health` (utilisé par BunkerWeb /
  load balancer).

### 8.2 Monitoring détaillé — `/admin/system-monitoring`

- Métriques : CPU, RAM, disque, latence, taux d'erreur.
- Histogrammes et tendance sur 24 h / 7 j / 30 j.
- Procédure de surveillance et alertes :
  [`runbooks/MONITORING_ALERTING.md`](./runbooks/MONITORING_ALERTING.md).

### 8.3 Réindexation RAG

- Cron nocturne automatique (réindexation incrémentale).
- Procédure de réindexation manuelle (force complète) :
  [`runbooks/RAG_REINDEX_NIGHTLY.md`](./runbooks/RAG_REINDEX_NIGHTLY.md).

---

## 9. Gestion des incidents

### 9.1 Page incidents — `/incidents`

- Vue collaborateurs (déclaration d'incident).
- Vue admin : suivi, classification (mineur / majeur / critique),
  assignation RSSI.

### 9.2 Procédure d'incident production

Toute interruption de service ou suspicion de compromission suit la
procédure encadrée :

[`runbooks/PRODUCTION_INCIDENT_RESPONSE.md`](./runbooks/PRODUCTION_INCIDENT_RESPONSE.md)

Contenus clés :

- Critères de déclenchement de la cellule de crise.
- Matrice d'escalade (RSSI / DSI / DPO / Direction).
- Communication interne (bannière `/admin/config` →
  `banner.severity=critical`).
- Mode maintenance : `maintenance.mode=true` →
  redirige tout le trafic vers `/maintenance`.
- Rollback applicatif : voir
  [`FEATURES_SHIPPED.md`](./FEATURES_SHIPPED.md) § Procédure de rollback
  générique.
- Post-mortem obligatoire sous 5 jours ouvrés.

### 9.3 Audit logs et chronologie

- Pendant l'incident, `/admin/audit` est la source de vérité
  (immuable, journalisé en base et en fichier).
- Aucune purge ni modification n'est possible (contrainte applicative
  et base — append only).

---

## 10. Sécurité plateforme

### 10.1 Observabilité (Sentry / GlitchTip)

- Activation : voir
  [`runbooks/SENTRY_ACTIVATION.md`](./runbooks/SENTRY_ACTIVATION.md).
- DSN configuré via variables d'environnement (front + back) — aucune
  donnée envoyée si DSN non défini (compatible air-gap).
- Alertes routées vers la cellule RSSI.

### 10.2 CSP nonce-based

Le frontend Next.js 15 injecte une **nonce CSP** unique par requête
via le middleware. Cela durcit la politique de sécurité sans casser
l'hydration streaming.

> Attention au rollback : en cas de retour arrière, frontend ET
> reverse-proxy BunkerWeb doivent être redéployés ensemble (sinon
> page blanche). Détails : [`FEATURES_SHIPPED.md`](./FEATURES_SHIPPED.md) § 8.

### 10.3 Rotation des secrets

Procédure encadrée (clés JWT, secret base, jetons API) :

[`runbooks/SECRETS_ROTATION.md`](./runbooks/SECRETS_ROTATION.md)

- Rotation **trimestrielle** des secrets longs (JWT, base).
- Rotation **annuelle** des certificats TLS.
- Rotation **immédiate** en cas de suspicion de compromission.

### 10.4 Bandeau d'annonce et mode maintenance

- Bannière : `AppConfig.banner.*` — apparaît en haut de toutes les
  pages. Ne jamais utiliser pour des messages internes longs.
- Mode maintenance : `AppConfig.maintenance.mode=true` → toutes les
  routes redirigent vers `/maintenance`. Réservé aux opérations à
  risque (migration base, restauration). À documenter dans un ticket
  de change avant activation.

### 10.5 Politique de mots de passe

- Longueur minimale **12 caractères** (politique LDAP).
- 4 catégories de caractères requises sur changement.
- Historique : 5 derniers mots de passe non réutilisables.
- Verrouillage : 5 échecs successifs → 15 minutes.
- L'application n'accepte aucune authentification basique : SSO LDAP
  + MFA exclusivement.

### 10.6 RGPD et données personnelles

- DPO référencé dans `/admin/access-overview` et joignable via
  `dpo@omnitech-security.fr`.
- Demandes RGPD (accès, rectification, effacement, portabilité)
  traitées sous **30 jours**, tracées dans `/admin/audit` avec
  marquage `gdpr.request`.
- Pages publiques de référence : `/legal`, `/privacy-policy`, `/dpa`,
  `/cookies`.

---

## Annexes

### A. Liste des routes admin (référence rapide)

| Route                              | Rôle requis    | Objet                              |
|------------------------------------|----------------|------------------------------------|
| `/admin`                           | ADMIN          | Page d'accueil admin               |
| `/admin/users`                     | ADMIN          | Utilisateurs                       |
| `/admin/users/import`              | ADMIN          | Import CSV utilisateurs            |
| `/admin/ldap-pending`              | ADMIN          | Validation LDAP                    |
| `/admin/departments`               | ADMIN          | Départements                       |
| `/admin/external-access`           | ADMIN          | Accès externes                     |
| `/admin/onboarding`                | ADMIN (flag)   | Parcours d'onboarding              |
| `/admin/access`                    | ADMIN          | Matrice d'accès                    |
| `/admin/access-overview`           | SUPER_ADMIN    | Vue 360° accès                     |
| `/admin/access-reviews`            | SUPER_ADMIN    | Revues d'accès                     |
| `/admin/compliance`                | REVIEWER       | Conformité ISO                     |
| `/admin/workflows`                 | REVIEWER       | Workflows d'approbation            |
| `/admin/chartes`                   | ADMIN          | Chartes                            |
| `/admin/certificates`              | ADMIN          | Certifications utilisateurs        |
| `/admin/audit`                     | ADMIN          | Journal d'audit                    |
| `/admin/reports`                   | ADMIN          | Rapports périodiques               |
| `/admin/ad-audit`                  | ADMIN          | Audit Active Directory             |
| `/admin/it-exports`                | ADMIN          | Exports IT signés                  |
| `/admin/system-health`             | ADMIN          | Santé applicative                  |
| `/admin/system-monitoring`         | ADMIN          | Métriques détaillées               |
| `/admin/config`                    | SUPER_ADMIN    | Configuration globale              |
| `/admin/spaces`                    | SUPER_ADMIN    | Espaces et modules                 |
| `/admin/backups`                   | SUPER_ADMIN    | Sauvegardes                        |
| `/admin/pca`                       | SUPER_ADMIN    | PCA / drills                       |
| `/admin/rssi-dashboard`            | SUPER_ADMIN    | Dashboard RSSI                     |
| `/admin/cyber-score`               | SUPER_ADMIN    | Score cyber                        |
| `/admin/media`                     | ADMIN          | Médiathèque (modération)           |
| `/admin/feedback`                  | ADMIN          | Avis & enquêtes                    |
| `/admin/testimonials`              | ADMIN          | Témoignages utilisateurs           |
| `/admin/ticket-spaces`             | ADMIN          | Espaces de ticketing               |
| `/admin/dark-mode-audit`           | ADMIN          | Audit du mode sombre               |
| `/admin/signatures`                | ADMIN          | Suivi signatures DocuSeal          |

### B. Runbooks d'exploitation référencés

| Runbook                                                                    | Usage                                            |
|----------------------------------------------------------------------------|--------------------------------------------------|
| [`DATABASE_BACKUP_RESTORE.md`](./runbooks/DATABASE_BACKUP_RESTORE.md)      | Sauvegarde et restauration base de données.      |
| [`LDAP_SYNC_MANUAL.md`](./runbooks/LDAP_SYNC_MANUAL.md)                    | Synchronisation LDAP manuelle.                   |
| [`MFA_ENROLLMENT.md`](./runbooks/MFA_ENROLLMENT.md)                        | Enrôlement et réinitialisation MFA.              |
| [`MONITORING_ALERTING.md`](./runbooks/MONITORING_ALERTING.md)              | Surveillance et alertes système.                 |
| [`PRODUCTION_INCIDENT_RESPONSE.md`](./runbooks/PRODUCTION_INCIDENT_RESPONSE.md) | Procédure d'incident production.            |
| [`RAG_REINDEX_NIGHTLY.md`](./runbooks/RAG_REINDEX_NIGHTLY.md)              | Réindexation RAG (NOA).                          |
| [`SECRETS_ROTATION.md`](./runbooks/SECRETS_ROTATION.md)                    | Rotation des secrets et certificats.             |
| [`SENTRY_ACTIVATION.md`](./runbooks/SENTRY_ACTIVATION.md)                  | Activation observabilité Sentry / GlitchTip.     |

---

*Document maintenu par le pôle Système d'Information OMNITECH Security
(SI/RSSI). Dernière mise à jour : 2026-04-26.*
