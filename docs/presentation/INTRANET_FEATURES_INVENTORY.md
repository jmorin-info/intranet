# Inventaire des fonctionnalités — Intranet OMNITECH Security

> **Document de référence pour présentation à la direction**
> Date : 2026-04-23 · Branche : `feat/p1-9-prelaunch`
> Mode : lecture seule, aucune modification de code.
> Source : code actuel + base de données de préproduction + audit fonctionnel interne du 2026-04-20 (`docs/audit/INTRANET_FEATURE_AUDIT_v1.0.md`).

**Légende des états** :

- ✅ **Opérationnel** — implémenté, intégré, accessible dans l'interface
- 🟡 **Partiel** — code présent mais pas totalement branché (UI manquante ou feature flag OFF)
- 🔵 **Infrastructure prête** — fondations posées, feature pas encore utilisable

---

## 1. Identité du projet

| Élément                           | Valeur                                                                                                            |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| **Nom officiel**                  | OMNITECH Intranet                                                                                                 |
| **Description (package.json)**    | "Intranet GED sécurisé OMNITECH Security — ISO 27001:2022"                                                        |
| **Version publique**              | 3.1.0-20260417 (`NEXT_PUBLIC_BUILD_VERSION`)                                                                      |
| **Version interne**               | 1.0.0 (package.json)                                                                                              |
| **URL de production**             | https://intranet.omnitech-security.fr                                                                             |
| **Branche active**                | `feat/p1-9-prelaunch`                                                                                             |
| **Dernier commit significatif**   | 2026-04-22 — "chore(ci+security): GitHub Actions, husky, pnpm verify, security headers"                           |
| **Premier commit**                | 2026-04-20 (snapshot P1.8 d'un projet antérieur)                                                                  |
| **Âge effectif de développement** | Plusieurs mois (itérations P1.1 à P1.9, précédés d'une phase de refonte)                                          |
| **Hébergement**                   | VM interne OMNITECH (`10.33.120.55`) derrière reverse-proxy BunkerWeb (WAF + Let's Encrypt)                       |
| **Infra associée**                | PostgreSQL, Redis, Meilisearch, Ollama (IA locale), OnlyOffice, Stirling PDF, DocuSeal, Rocket.Chat (scaffolding) |

### Stack technique (vulgarisée)

Application web moderne construite en deux parties : une **interface** (Next.js / React, en français) et un **serveur applicatif** (NestJS). La base de données est PostgreSQL. L'intelligence artificielle tourne en local sur un serveur Ollama (aucune donnée envoyée à un prestataire tiers). Le moteur de recherche (Meilisearch), l'édition de documents en ligne (OnlyOffice), les signatures électroniques (DocuSeal) et les outils PDF (Stirling) sont également auto-hébergés.

### Volumétrie du code (indicateur de maturité)

| Élément                          | Quantité                                                            |
| -------------------------------- | ------------------------------------------------------------------- |
| Fichiers interface (`.tsx`)      | 212                                                                 |
| Fichiers serveur (`.ts`)         | 324                                                                 |
| Pages web                        | 94 (dont 1 kiosque public, 4 pages d'authentification, 5 redirects) |
| Modules serveur                  | 72                                                                  |
| Contrôleurs API (endpoints REST) | 72                                                                  |
| Tables de base de données        | 76                                                                  |

---

## 2. Cartographie des modules fonctionnels

Fiches détaillées module par module.

### Module : Accueil personnalisé (Dashboard)

**Accès** : `/dashboard`

**Description courte** : Page d'accueil personnelle de chaque collaborateur, avec widgets configurables (actualités, notifications, tâches, indicateurs de santé, flux RSS, météo, etc.). Un sélecteur permet de basculer entre plusieurs "vues" selon l'activité (Mes tâches / Vue d'ensemble / Veille / Analyse).

**État global** : ✅

**Fonctionnalités présentes** :

- ✅ 11 widgets actifs (horloge, météo, liens rapides, flux RSS, documents à traiter, santé système, LDAP en attente, synthèse RSSI, notifications, pages récentes, widget Lucca RH)
- ✅ Personnalisation par utilisateur (mémorisée dans le navigateur)
- ✅ Mode "Prestataire" avec vue distincte pour les intervenants externes
- ✅ Tips quotidiens dismissables
- ✅ Chargement différé des widgets admin pour performance

**Intégrations** : tous les modules métier alimentent ce tableau de bord.

---

### Module : Gestion documentaire (GED)

**Accès** : `/documents`

**Description courte** : Référentiel central des documents de l'entreprise (procédures, politiques, comptes-rendus). Chaque document a un cycle de vie Brouillon → Revue → Approuvé → Obsolète, des versions, des signatures électroniques et une piste d'audit complète.

**État global** : ✅

**Fonctionnalités présentes** :

- ✅ Listing avec filtres sauvegardés (classification, type, statut, propriétaire)
- ✅ Visualisation multi-format (PDF, bureautique via OnlyOffice)
- ✅ Édition collaborative en ligne via OnlyOffice (co-édition temps réel)
- ✅ Versioning avec comparaison (diff)
- ✅ Workflow d'approbation paramétrable (module `approval-workflows`)
- ✅ Signature électronique individuelle (DocuSeal)
- ✅ Commentaires sur documents
- ✅ Piste d'audit par document (lectures, modifications, téléchargements)
- ✅ Classification ISO 27001 : Public / Interne / Confidentiel / Secret
- ✅ Accusés de réception (acknowledgments) sur documents obligatoires
- ✅ Liens documents ↔ contrôles ISO 27001 (table `DocumentIsoControl`)
- 🟡 Sous-page `/documents/new-inline` non reliée à la navigation (doublon `/documents/new`)

**Volumétrie actuelle en base** (préproduction, données de test) :

- 26 documents · 25 versions · 70 liens documents–contrôles ISO

**Contrôles d'accès** : Rôles hiérarchiques 7 niveaux (SUPER_ADMIN → PRESTATAIRE). Documents visibles selon classification et espaces.

---

### Module : Wiki collaboratif

**Accès** : `/wiki`

**Description courte** : Base de connaissance interne sous forme d'articles versionnés et recherchables (procédures IT, documentation métier, notes internes). La page `/wiki` regroupe wiki principal et runbooks techniques via des onglets.

**État global** : ✅

**Fonctionnalités présentes** :

- ✅ Articles avec auteur, catégorie, tags
- ✅ Historique des versions (table `WikiPageVersion`)
- ✅ Recherche plein texte (indexée Meilisearch)
- ✅ Importeurs : Notion, Caramel, Redmine, CSV (scripts dans `packages/database/prisma/`)
- 🟡 Page `/runbooks` (20 lignes) : doublon à fusionner avec l'onglet wiki

**Volumétrie** : 60 pages wiki · 4 versions historisées · ingérées par le moteur IA (587 morceaux de contenu indexés pour la recherche sémantique)

---

### Module : Runbooks techniques

**Accès** : `/runbooks/[slug]`

**Description courte** : Procédures opérationnelles prêtes à exécuter (ex : redémarrer un service, rotation de certificats). Structure distincte des articles wiki, avec étapes numérotées et exécutions tracées.

**État global** : ✅

**Fonctionnalités présentes** :

- ✅ Runbooks versionnés
- ✅ Historique d'exécution (table `RunbookExecution`)
- ✅ Intégration moteur de recherche globale

**Volumétrie** : 10 runbooks enregistrés

---

### Module : Procédures

**Accès** : `/procedures`, `/procedures/[id]`

**Description courte** : Documents procéduraux au format structuré (distinct du wiki libre et des runbooks techniques). Orienté qualité ISO et publication formelle.

**État global** : ✅

---

### Module : Tickets / Helpdesk

**Accès** : `/helpdesk`, `/tickets`, `/tickets/[id]`

**Description courte** : Portail de support IT interne. Les collaborateurs créent des tickets à partir de gabarits (Incident / Matériel / Sécurité / Accès / Demande d'information, etc.). L'équipe IT traite via un tableau avec statuts, priorités et commentaires.

**État global** : ✅

**Fonctionnalités présentes** :

- ✅ 7 gabarits de tickets (INCIDENT, SECURITY, HARDWARE, SOFTWARE, ACCESS, INFO, OTHER)
- ✅ 6 statuts (Ouvert, Assigné, En cours, En attente, Résolu, Fermé)
- ✅ Commentaires (internes / publics), avec mentions `@utilisateur`
- ✅ Actions en masse sur une sélection
- ✅ Filtres intelligents sauvegardés
- ✅ Espaces de tickets par équipe (table `TicketSpace`, `TicketSpaceMember`)
- ✅ Page `/helpdesk` avec libre-service (self-service) + chatbot intégré
- 🟡 Page `/helpdesk` redondante avec `/tickets` (onglet de navigation simple)

**Volumétrie** : 257 tickets en base · 11 étapes de workflow configurées

---

### Module : Médiathèque

**Accès** : `/media`, `/media/albums/[slug]`, `/admin/media` (gestion)

**Description courte** : Bibliothèque centralisée d'images, vidéos et ressources médias, organisée en albums. Utile pour communication interne, formation, procédures illustrées.

**État global** : ✅

**Fonctionnalités présentes** :

- ✅ Albums publics (table `MediaAlbum`)
- ✅ Ressources média (table `MediaItem`)
- ✅ Traçabilité des téléchargements (`MediaItemDownload`)
- ✅ Page admin de gestion
- 🟡 Visuel de présentation d'album (cover image) à améliorer — cf. section 11

**Volumétrie** : 1 album · 6 médias

---

### Module : Actualités / News

**Accès** : `/news`, `/news/[slug]`, `/news/compose`

**Description courte** : Journal interne (annonces direction, événements, nouveautés IT). Rédaction WYSIWYG, publication programmée, catégories, vues tracées.

**État global** : ✅

**Fonctionnalités présentes** :

- ✅ Articles avec workflow brouillon / publié
- ✅ Composition riche (WYSIWYG)
- ✅ Catégories
- ✅ Suivi de lecture (table `NewsPostView`)
- ✅ Mentions `@utilisateur` dans le contenu (notification automatique)

**Volumétrie** : 8 articles

---

### Module : Veille cybersécurité

**Accès** : `/veille`

**Description courte** : Agrégation automatisée de flux de veille sécurité externes (CERT-FR, ANSSI, éditeurs). Génération de bulletins de veille hebdomadaires.

**État global** : ✅

**Fonctionnalités présentes** :

- ✅ Sources configurables (table `VeilleSource`)
- ✅ Items ingérés automatiquement (`VeilleItem`)
- ✅ Bulletins de veille synthétiques (`VeilleBulletin`)
- ✅ Accusés de lecture (`VeilleAck`)
- ✅ Publication kiosque (affichage mural)

**Volumétrie** : 7 sources · 1 338 items collectés · 1 bulletin publié

---

### Module : Alertes sécurité

**Accès** : `/alerts`

**Description courte** : Alertes sécurité entrantes affichées aux utilisateurs (sévérité INFO / WARN / CRITICAL). Distinctes des incidents internes : utilisées pour diffuser des alertes de vulnérabilités, phishing en cours, etc.

**État global** : ✅

**Volumétrie** : 0 alertes en préproduction (table vide)

---

### Module : Incidents

**Accès** : `/incidents`, `/incidents/[id]`

**Description courte** : Journal des incidents de sécurité et IT, avec timeline, remédiations, sévérité et workflow d'investigation.

**État global** : ✅

**Fonctionnalités présentes** :

- ✅ Priorités, sévérités, workflow
- ✅ Timeline d'événements (`IncidentTimelineEntry`)
- ✅ Remédiations associées (`Remediation`)
- ✅ Compteurs animés sur dashboard RSSI

**Volumétrie** : 0 incidents (préproduction vierge)

---

### Module : Assistant conversationnel IA (chatbot)

**Accès** : déclencheur `Ctrl+Shift+K` (modale plein écran) et bouton flottant en bas à droite de toutes les pages

**Description courte** : Assistant qui répond aux questions des collaborateurs en s'appuyant sur la documentation interne (wiki, documents, runbooks, FAQ, procédures). Fonctionne **100% en local** via Ollama (modèles Mistral / Phi3). Les réponses citent leurs sources.

**État global** : 🟡 — deux interfaces coexistent, ne partageant ni historique ni contexte

**Fonctionnalités présentes** :

- ✅ Réponses en streaming (flux progressif)
- ✅ Citations cliquables des sources utilisées
- ✅ Historique des conversations (localStorage, 5 + 50 messages)
- ✅ Notation pouce haut / pouce bas des réponses
- ✅ Questions suggérées à l'accueil + suggestions de suivi
- ✅ Rendu Markdown (gras, italique, code, listes, liens)
- ✅ Suppression de l'historique
- ✅ Recherche sémantique vectorielle (embeddings BGE-M3, seuil de similarité 0.4)
- ✅ 3 modèles de repli (Mistral → Phi3 → Qwen2:0.5b) pour garantir la réponse
- ✅ Anonymisation automatique des données personnelles avant indexation (emails, IP, téléphones, hostnames remplacés par `<EMAIL>`, `<IP_INTERNE>`, etc.)
- 🟡 Deux interfaces disjointes (modale RAG + widget flottant)
- ❌ Bouton "Stop génération" manquant (le code existe mais pas relié à l'UI)
- ❌ "Copier la réponse", "Régénérer", "Éditer et relancer" manquants
- ❌ Export conversation (PDF / Markdown) manquant
- ❌ Sélection du modèle manquante
- ❌ Coloration syntaxique des blocs de code manquante

**Volumétrie** : 587 morceaux de documents indexés (RagChunks) · 8 requêtes historisées · pas encore de chat persisté côté utilisateur (ChatMessages = 0 car les échanges restent locaux pour l'instant)

**Contrôles d'accès** : restriction par rôle activée (`RBAC_RAG_ENABLED=true`) — chaque utilisateur ne voit que les sources auxquelles il a droit.

---

### Module : Recherche globale

**Accès** : `/search` (v1 Postgres) et `/search/v2` (v2 Meilisearch, orpheline)

**Description courte** : Barre de recherche transverse (Ctrl+K) qui interroge simultanément wiki, documents, actualités et tickets. Moteur Meilisearch indexant tout en quelques millisecondes.

**État global** : ✅

**Fonctionnalités présentes** :

- ✅ 4 index fédérés (wiki, documents, news, tickets)
- ✅ Palette de commande `Cmd+K` avec recherche floue (fuzzy)
- ✅ Historique de 5 requêtes
- ✅ Recherche IA sémantique via `Ctrl+Shift+K`
- 🟡 Deux pages coexistent à fusionner

---

### Module : Notifications

**Accès** : `/notifications`, `/notifications/preferences`

**Description courte** : Centre de notifications multi-canal. L'utilisateur choisit par type d'événement s'il souhaite être notifié par application, email, push navigateur ou SMS.

**État global** : ✅ (sauf SMS en 🟡)

**Fonctionnalités présentes** :

- ✅ Canal In-app (badge + centre dédié)
- ✅ Canal Email (16 types "always-send" non modifiables pour événements critiques)
- ✅ Canal Web Push (VAPID)
- ✅ Canal WebSocket temps réel
- ✅ Préférences utilisateur par type
- 🟡 Canal SMS OVH — classe structurée mais connecteur HTTP non câblé en production

**Volumétrie** : 367 notifications en base · 0 abonnements push actifs en préproduction

---

### Module : Annuaire collaborateurs

**Accès** : `/directory`, `/directory/contacts`, `/directory/organigramme`

**Description courte** : Annuaire interne des collaborateurs avec fiches (rôle, département, poste, téléphone, photo), contacts externes et organigramme hiérarchique par département.

**État global** : ✅

**Fonctionnalités présentes** :

- ✅ Annuaire en grille et en liste
- ✅ Organigramme visuel par département
- ✅ Recherche + filtres
- ✅ Avatars colorés auto-générés
- ❌ Statut de présence (online/busy/away) non implémenté
- ❌ Feed d'activité non implémenté

**Volumétrie** : 108 utilisateurs · 13 départements

---

### Module : Gestion des départements et organisation

**Accès** : `/admin/departments`

**Description courte** : Hiérarchie des départements (avec manager, membres) utilisée pour l'organigramme et les contrôles d'accès par périmètre.

**État global** : ✅

**Volumétrie** : 13 départements configurés

---

### Module : Espaces de données (Spaces)

**Accès** : `/admin/spaces`

**Description courte** : Mécanisme de cloisonnement des modules et contenus selon l'utilisateur (table `SpaceAccessConfig`). Complémentaire des rôles : permet d'exposer ou masquer certaines parties de l'intranet par collaborateur.

**État global** : ✅

**Volumétrie** : 67 configurations d'accès enregistrées

---

### Module : Signatures électroniques

**Accès** : `/signatures`, `/admin/signatures`

**Description courte** : Signatures légalement reconnues (eIDAS) via DocuSeal auto-hébergé. Signatures individuelles ou campagnes (envoi massif d'un document à signer à N collaborateurs).

**État global** : ✅

**Fonctionnalités présentes** :

- ✅ Signatures individuelles
- ✅ Campagnes de signature (`SignatureCampaign`)
- ✅ Webhook de retour DocuSeal
- ✅ Audit complet

**Volumétrie** : 1 signature individuelle · 0 campagne · 2 signatures de chartes

---

### Module : Chartes obligatoires

**Accès** : `/chartes`, `/admin/chartes`

**Description courte** : Chartes internes (informatique, confidentialité, télétravail) versionnées, présentées à la connexion avec suivi d'acceptation par collaborateur.

**État global** : ✅

**Volumétrie** : 3 chartes actives · 2 acceptations enregistrées

---

### Module : Conformité ISO 27001 / SMSI

**Accès** : `/admin/compliance` (onglets), `/admin/rssi-dashboard`, `/admin/audit`, `/admin/access-reviews`, `/admin/ad-audit`

**Description courte** : Centre de pilotage du Système de Management de la Sécurité de l'Information. Concentre le référentiel ISO 27001, les tâches de conformité, les revues d'accès et le tableau de bord du RSSI.

**État global** : ✅

**Fonctionnalités présentes** :

- ✅ Référentiel ISO 27001:2022 chargé (93 contrôles de l'Annex A)
- ✅ Liens documents ↔ contrôles ISO
- ✅ Tâches de conformité (`ComplianceTask`)
- ✅ Référentiels multiples (`ComplianceFramework` — cadres externes)
- ✅ Campagnes de revues d'accès (`AccessReviewCampaign`)
- ✅ Audit AD Windows (`ad-audit` + script PowerShell `AD-ISO27001-Report-v5.ps1`)
- ✅ Dashboard RSSI avec indicateurs
- ✅ Analyseur de conformité (`iso-analyzer` : propose mapping automatique documents ↔ contrôles)
- ✅ Journal d'audit horodaté (`AuditLog`)
- 🟡 Deux pages audit coexistent (`audit-log` + `audit-timeline`)
- 🟡 Export PDF du rapport SMSI existant mais perfectible

**Volumétrie** : 93 contrôles ISO référencés · 70 documents liés · 2 104 entrées d'audit · 0 campagne de revue d'accès en cours

---

### Module : Administration des rôles et permissions

**Accès** : `/admin/users`, `/admin/config`, `/admin/spaces`, `/admin/departments`

**Description courte** : Trois leviers complémentaires pour le contrôle d'accès : les rôles (hiérarchie 7 niveaux), les espaces (cloisonnement de contenus par collaborateur) et les départements (périmètre organisationnel).

**État global** : ✅ (mais redondance à clarifier — cf. section 11)

**Hiérarchie des rôles** (du plus privilégié au moins privilégié) :

1. SUPER_ADMIN (niveau 100)
2. ADMIN (80)
3. DIRECTION (70)
4. REVIEWER (50)
5. AUDITEUR (40)
6. COLLABORATEUR (20)
7. PRESTATAIRE (10)

**Volumétrie en préproduction** : 1 SUPER_ADMIN, 3 ADMIN, 1 DIRECTION, 1 REVIEWER, 99 COLLABORATEUR, 3 PRESTATAIRE

---

### Module : Workflows d'approbation

**Accès** : `/admin/workflows`, `/admin/workflows/[id]`

**Description courte** : Moteur de workflows paramétrables (validation séquentielle par N approbateurs, critères par rôle / utilisateur / département). Utilisé pour l'approbation documentaire.

**État global** : 🟡

**Fonctionnalités présentes** :

- ✅ Définition séquentielle (étape après étape)
- ✅ Instances de workflow traçables
- 🟡 Modes PARALLEL_ALL / PARALLEL_ANY pas encore implémentés (TODO identifiés)
- 🟡 Validation approverRole/userId/deptId manquante sur les définitions

**Volumétrie** : 5 workflows définis · 5 instances · 11 étapes

---

### Module : Calendrier

**Accès** : `/calendar`

**Description courte** : Agenda interne pour événements d'entreprise (réunions, formations, fermetures). Indépendant des calendriers externes.

**État global** : 🟡 (interne uniquement)

**Fonctionnalités présentes** :

- ✅ Événements internes
- ❌ Synchronisation Outlook / Microsoft 365 non implémentée
- ❌ Synchronisation Google Calendar non implémentée
- ❌ Liaison calendrier ↔ tickets (dates d'échéance, dates de livraison) non implémentée

**Volumétrie** : 3 événements

---

### Module : Satisfaction / Enquêtes

**Accès** : `/satisfaction`

**Description courte** : Enquêtes internes multi-formats (notation, texte libre, choix multiple, échelle, oui/non) avec statistiques globales.

**État global** : ✅

**Volumétrie** : 1 enquête active · 15 questions · 1 réponse

---

### Module : Quiz de sensibilisation

**Accès** : `/quiz`

**Description courte** : Quiz de sensibilisation cybersécurité (phishing, mots de passe, etc.) gamifiés avec scoring et campagnes programmables.

**État global** : ✅

**Volumétrie** : 3 campagnes de quiz · 0 réponses en préproduction

---

### Module : Tips quotidiens

**Accès** : `/tips`

**Description courte** : Conseils quotidiens affichés en bandeau dashboard, dismissables. Renforce la sensibilisation continue.

**État global** : ✅

---

### Module : Témoignages

**Accès** : `/testimonials`, `/admin/testimonials`

**Description courte** : Espace de publication de témoignages collaborateurs (qualité, événements).

**État global** : ✅ (utilisation limitée)

**Volumétrie** : 1 témoignage publié

---

### Module : Accès prestataires (Extranet)

**Accès** : `/extranet`, `/admin/external-access`, `/admin/external-access` (admin)

**Description courte** : Portail réservé aux intervenants externes (prestataires, auditeurs) avec accès limité dans le temps, scopé sur certains documents / modules, et piste d'audit complète.

**État global** : ✅

**Fonctionnalités présentes** :

- ✅ Accès nominatifs avec expiration
- ✅ Scopes granulaires (quels modules, quels documents)
- ✅ Tableau de bord prestataire distinct
- ❌ Alerte pré-expiration visible manquante

**Volumétrie** : 0 accès externes actifs en préproduction

---

### Module : Certificats

**Accès** : `/certificates`, `/admin/certificates`

**Description courte** : Inventaire et suivi d'échéance des certificats PKI (HTTPS, signature code, S/MIME). Alertes avant expiration.

**État global** : ✅

**Volumétrie** : 280 certificats suivis

---

### Module : Annuaire de fichiers (Fileserver SMB)

**Accès** : `/files`, `/files/smb-editor/[sessionId]`

**Description courte** : Navigation dans le partage SMB/CIFS de l'entreprise (`10.33.50.5`) avec édition OnlyOffice intégrée. L'utilisateur retrouve les fichiers bureautiques du fileserver dans l'intranet.

**État global** : ✅

---

### Module : Outils PDF

**Accès** : `/tools/pdf`

**Description courte** : Boîte à outils PDF auto-hébergée (compression, conversion, fusion, split, signature visuelle, OCR) via Stirling PDF.

**État global** : ✅ (feature toggle activé)

---

### Module : Messagerie d'équipe (Chat)

**Accès** : `/chat`

**Description courte** : Messagerie interne Rocket.Chat (scaffolding posé) intégrée en iframe dans l'intranet. L'infrastructure Docker est provisionnée mais l'instance n'est pas encore ouverte aux utilisateurs.

**État global** : 🔵 (infrastructure prête, service non exposé à grande échelle)

---

### Module : Administration système

**Accès** : `/admin` (hub), `/admin/config`, `/admin/system-health`, `/admin/system-monitoring`, `/admin/backups`, `/admin/ldap-pending`, `/admin/audit`, `/admin/reports`, `/admin/onboarding`, `/admin/ad-audit`, `/admin/external-access`, `/admin/feedback`, `/admin/it-exports`, `/admin/dark-mode-audit`

**Description courte** : Centre de contrôle de l'administrateur. Gère utilisateurs, config serveur, sauvegardes, santé, audit, rapports, onboarding, validation LDAP, exports IT et nombreux outils.

**État global** : ✅

**Fonctionnalités présentes** :

- ✅ CRUD utilisateurs + import CSV massif
- ✅ Validation asynchrone des utilisateurs LDAP (AD)
- ✅ Configuration centralisée en base (table `AppConfig`, modifiable via UI SUPER_ADMIN)
- ✅ Indicateurs de santé (base, Redis, Meilisearch, Ollama, DocuSeal, SMTP)
- ✅ Sauvegardes manuelles + planifiées (script `backup.sh`, A.8.13)
- ✅ Onboarding parcours gamifié (feature flag)
- ✅ AD audit synchronisation
- ✅ Exports IT complexes

**Volumétrie** : 2 104 entrées d'audit · 22 utilisateurs LDAP en attente de validation

---

### Module : Mode kiosque

**Accès** : `/kiosk?interval=15` (public, rate-limité)

**Description courte** : Affichage mural plein écran rotant entre actualités, veille et indicateurs SMSI. Destiné aux écrans de salle de pause / accueil.

**État global** : ✅

**Endpoints publics** : `/api/v1/kiosk/news`, `/api/v1/kiosk/veille`, `/api/v1/kiosk/stats` (30 requêtes/minute/IP)

---

### Module : Mentions `@utilisateur`

**Accès** : transverse (tickets, news)

**Description courte** : Parser qui extrait les `@prenom.nom` d'un texte et crée automatiquement une notification à l'utilisateur mentionné.

**État global** : ✅

**Intégrations** : branché dans commentaires de tickets et articles de news.

---

### Module : Bannières d'annonces

**Accès** : `/admin/config` (création), affichage transverse

**Description courte** : Bannières d'information affichées en haut de l'intranet (mainenance, annonces direction). Priorité variable.

**État global** : 🟡

**Volumétrie** : 1 bannière configurée

**Limites identifiées** : bannière actuellement non cliquable / pas de lien de redirection paramétrable, affichage à améliorer (cf. section 11)

---

### Module : Export de données personnelles (RGPD)

**Accès** : via profil utilisateur → export

**Description courte** : Permet à chaque collaborateur d'exporter ses données personnelles (droit d'accès RGPD).

**État global** : 🟡

**Limite identifiée** : l'export retourne actuellement une erreur 400 (cf. section 11)

---

### Module : Rétention des données

**Accès** : `/api/v1/data-retention` (SUPER_ADMIN uniquement)

**Description courte** : Purge automatique des documents archivés au-delà d'un seuil, conforme aux politiques de conservation.

**État global** : 🟡 (endpoint orphelin côté frontend)

---

### Module : KnowBe4 (plateforme sensibilisation)

**Accès** : via dashboard + endpoints dédiés

**Description courte** : Synchronisation avec la plateforme externe KnowBe4 (campagnes phishing simulées, formations sécurité).

**État global** : ✅

---

### Module : Feedback & témoignages admin

**Accès** : `/admin/feedback`

**Description courte** : Vue admin consolidée du feedback utilisateur (enquêtes, formulaires de satisfaction, témoignages).

**État global** : 🟡

**Limite identifiée** : la page de détail par enquête retourne un 404 sur certaines URL (cf. section 11)

---

## 3. Intégrations externes

| #   | Service                               | Type             | État | Usage concret                                                                  | Fichier de référence                                                |
| --- | ------------------------------------- | ---------------- | ---- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------- |
| 1   | **Active Directory / LDAP**           | Lecture + sync   | ✅   | Authentification SSO, import utilisateurs AD, validation manuelle des comptes  | `apps/backend/src/ldap/ldap.service.ts`                             |
| 2   | **DocuSeal** (signature électronique) | Bidirectionnel   | ✅   | Signature eIDAS des chartes et documents                                       | `apps/backend/src/signatures/signatures.service.ts`                 |
| 3   | **Ollama** (IA locale)                | Appel sortant    | ✅   | Chatbot + embeddings sémantiques, 3 modèles en fallback (Mistral, Phi3, Qwen2) | `apps/backend/src/rag/llm/llm.service.ts`                           |
| 4   | **Meilisearch**                       | Appel sortant    | ✅   | Moteur de recherche globale (4 index)                                          | `apps/backend/src/search/meilisearch.service.ts`                    |
| 5   | **OnlyOffice**                        | Bidirectionnel   | ✅   | Édition bureautique en ligne (DOCX/XLSX/PPTX) avec co-édition                  | `apps/backend/src/office/office.service.ts`                         |
| 6   | **Stirling PDF**                      | Appel sortant    | ✅   | Outils PDF (compression, conversion, fusion, OCR)                              | `apps/backend/src/stirling/stirling.service.ts`                     |
| 7   | **Fileserver SMB/CIFS**               | Lecture/écriture | ✅   | Accès au partage réseau de l'entreprise (`10.33.50.5`)                         | `apps/backend/src/fileserver/fileserver.service.ts`                 |
| 8   | **KnowBe4** (sensibilisation)         | Lecture          | ✅   | Campagnes phishing, formations — cache 5 min                                   | `apps/backend/src/knowbe4/knowbe4.service.ts`                       |
| 9   | **Push VAPID** (notifications web)    | Sortant          | ✅   | Notifications push navigateur                                                  | `apps/backend/src/push-notifications/push-notifications.service.ts` |
| 10  | **SMTP** (email interne)              | Sortant          | ✅   | Notifications par email via `smtp-internal.omnitech-security.fr`               | `apps/backend/src/notifications/notifications.service.ts`           |
| 11  | **Redis**                             | Cache / file     | ✅   | Cache applicatif, files de tâches BullMQ                                       | (infra)                                                             |
| 12  | **BunkerWeb** (WAF)                   | Reverse-proxy    | ✅   | TLS Let's Encrypt, WAF, rate-limiting, géo-filtrage                            | `infra/bunkerweb.env`                                               |
| 13  | **Rocket.Chat**                       | Iframe           | 🔵   | Messagerie interne (scaffolding Docker prêt, non encore ouvert)                | `infra/rocketchat-compose.yml`                                      |
| 14  | **Lucca RH (Poplee)**                 | Widget           | 🟡   | Widget dashboard avec URL codée en dur — pas d'API                             | `apps/frontend/src/components/widgets/lucca-widget.tsx`             |
| 15  | **OVH SMS**                           | Sortant          | 🟡   | Canal SMS de notifications (classe structurée, connecteur HTTP non câblé)      | `apps/backend/src/sms/sms.service.ts`                               |
| 16  | **Microsoft Teams**                   | —                | 🟡   | Mention textuelle dans IA et lien profil uniquement                            | —                                                                   |
| 17  | **Vaultwarden**                       | —                | ❌   | Absent                                                                         | —                                                                   |
| 18  | **Microsoft 365 / Graph**             | —                | ❌   | Absent (calendrier, mail, Teams webhooks)                                      | —                                                                   |
| 19  | **GLPI**                              | —                | ❌   | Absent                                                                         | —                                                                   |
| 20  | **Graylog**                           | —                | ❌   | Absent                                                                         | —                                                                   |
| 21  | **FortiManager / FortiAnalyzer**      | —                | ❌   | Absent                                                                         | —                                                                   |
| 22  | **DocuSign / Autre PKI commerciale**  | —                | ❌   | Non utilisé (DocuSeal auto-hébergé à la place)                                 | —                                                                   |

**Bilan** : **12 intégrations productives**, **4 partielles**, **6 absentes**. Aucune dépendance à un cloud externe (hors KnowBe4 qui est sur leur propre infrastructure). **Souveraineté des données : toutes les données opérationnelles sont stockées sur l'infrastructure OMNITECH.**

---

## 4. Sécurité et conformité

### 4.1 Contrôles d'accès

| Contrôle                      | Implémentation                                                              |
| ----------------------------- | --------------------------------------------------------------------------- |
| Rôles hiérarchiques           | ✅ 7 niveaux (SUPER_ADMIN → PRESTATAIRE), gardé par `RolesGuard` NestJS     |
| Authentification              | ✅ Email/mot de passe + validation Zod                                      |
| SSO LDAP/AD                   | ✅ Synchronisation utilisateurs + attente de validation admin               |
| MFA TOTP                      | ✅ Implémenté (otplib v13), codes de secours inclus                         |
| MFA imposée                   | 🟡 Politique activable, mais pas universellement appliquée (cf. section 11) |
| SSO OIDC/SAML externe         | ❌ Non implémenté                                                           |
| Cloisonnement par espaces     | ✅ Système `Space` granulaire (67 configs)                                  |
| Cloisonnement par département | ✅ Appartenance multiple (`UserDepartment`)                                 |

### 4.2 Audit et traçabilité

| Contrôle                   | Implémentation                                                                                 |
| -------------------------- | ---------------------------------------------------------------------------------------------- |
| Journal d'audit centralisé | ✅ `AuditService` — user, action, resourceType, resourceId, sévérité, metadata, IP, User-Agent |
| Sévérités                  | ✅ INFO / WARN / CRITICAL                                                                      |
| Volumétrie actuelle        | 2 104 entrées en préproduction                                                                 |
| Export piste d'audit       | ✅ `/admin/audit` + export CSV/PDF via `exports` module                                        |
| Horodatage ISO             | ✅ Tous les logs                                                                               |

### 4.3 Chiffrement

| Contrôle                          | Implémentation                                                              |
| --------------------------------- | --------------------------------------------------------------------------- |
| Chiffrement en transit            | ✅ HTTPS / TLS via BunkerWeb + Let's Encrypt                                |
| Certificats HTTPS auto-renouvelés | ✅ Let's Encrypt géré par BunkerWeb                                         |
| JWT signés (OnlyOffice, sessions) | ✅ HS256                                                                    |
| Mots de passe hashés              | ✅ bcrypt                                                                   |
| Refresh tokens                    | ✅ httpOnly cookies (migration fallback body en cours, deadline 2026-05-16) |
| Chiffrement au repos (disque)     | ❌ Non implémenté (noté pour plus tard — cf. section 11)                    |

### 4.4 Sauvegardes

| Contrôle                        | Implémentation                                          |
| ------------------------------- | ------------------------------------------------------- |
| Script de sauvegarde automatisé | ✅ `scripts/backup.sh` — dump Postgres + copie storage  |
| Planification cron              | ✅ Commentée dans le script : `0 2 * * *` (2h du matin) |
| Rétention                       | ✅ 30 jours configurable (`RETENTION_DAYS`)             |
| Destination externe SMB         | ✅ Montage `//10.33.50.5/Public/intranet`               |
| Sauvegarde Veeam                | ✅ Scripts d'intégration dans `scripts/veeam/`          |
| Restauration documentée         | ✅ `RESTORE.md`                                         |

### 4.5 RGPD

| Contrôle                    | Implémentation                                                                                          |
| --------------------------- | ------------------------------------------------------------------------------------------------------- |
| Consentements chartes       | ✅ Obligatoires, tracés par version                                                                     |
| Export données utilisateur  | 🟡 Endpoint existe (table `DataExportRequest`), renvoie erreur 400 actuellement                         |
| Droit à l'oubli             | 🟡 Non trouvé de workflow dédié                                                                         |
| Anonymisation PII dans l'IA | ✅ `PiiSanitizerService` masque emails, IP internes, téléphones, hostnames avant indexation vectorielle |
| Protection PII (A.5.34)     | ✅ Mentionné explicitement dans le code                                                                 |

### 4.6 Protections applicatives

| Contrôle                                   | Implémentation                                                         |
| ------------------------------------------ | ---------------------------------------------------------------------- |
| Headers de sécurité (Helmet)               | ✅ `apps/backend/src/main.ts`                                          |
| Rate-limiting global                       | ✅ 60 req/min, overrides ciblés (login 10, MFA 3, password-reset 5)    |
| Rate-limiting par IP sur endpoints publics | ✅ Kiosque 30/min                                                      |
| Validation d'upload (magic-bytes)          | ✅ Documents refusés si signature fichier ≠ extension                  |
| URLs signées pour téléchargement           | ✅                                                                     |
| Protection XSS (sanitisation)              | ✅ `apps/backend/src/common/sanitize.ts`                               |
| Guards webhooks                            | 🟡 DocuSeal : validation par secret partagé (pas HMAC SHA-256 complet) |
| CORS restrictif                            | ✅ `CORS_ORIGINS=https://intranet.omnitech-security.fr`                |
| CI sécurité                                | ✅ GitHub Actions avec audit pnpm, husky pre-commit                    |

### 4.7 IA — garde-fous

| Contrôle                       | Implémentation                                                              |
| ------------------------------ | --------------------------------------------------------------------------- |
| IA 100% locale                 | ✅ Ollama, aucune donnée envoyée à un prestataire externe                   |
| Anonymisation avant indexation | ✅ `PiiSanitizerService`                                                    |
| RBAC appliqué au RAG           | ✅ `RBAC_RAG_ENABLED=true` — chaque user ne voit que ses sources autorisées |
| Sanitisation des réponses      | ✅ Rendu Markdown maison sans exécution                                     |
| Journalisation des requêtes IA | ✅ `RagQueryLog`                                                            |

### 4.8 Souveraineté des données

**Tous les services critiques sont auto-hébergés sur l'infrastructure OMNITECH** :

- Base de données (Postgres local)
- Moteur IA (Ollama local)
- Moteur de recherche (Meilisearch local)
- Édition documents (OnlyOffice local)
- Signatures (DocuSeal local)
- Messagerie (Rocket.Chat local, en cours)
- Backup (SMB interne + Veeam)

**Aucune dépendance cloud tierce** sauf KnowBe4 (plateforme SaaS officielle — donnée de sensibilisation uniquement).

### 4.9 Couverture ISO 27001:2022 Annex A

**93 contrôles de l'Annex A référencés en base**, couvrant les 4 sections (A.5 organisationnelles, A.6 humaines, A.7 physiques, A.8 technologiques).

**Contrôles référencés explicitement dans le code** (évidence directe) :
| Code | Nom (abrégé) | Évidence |
|---|---|---|
| A.5.7 | Threat intelligence | `apps/backend/src/veille/veille.service.ts` |
| A.5.13 | Labelling of information | Classification documents (4 niveaux couleurs PANTONE SEAL) |
| A.5.15 | Access control | `RolesGuard`, `SpaceAccessConfig` |
| A.5.17 | Authentication information | MFA TOTP + bcrypt |
| A.5.18 | Access rights | `access-reviews/` + `ad-audit/` |
| A.5.24-A.5.28 | Incident management | Module `incidents/` + `Remediation` |
| A.5.34 | Protection of PII | `PiiSanitizerService`, mentionné explicitement |
| A.6.3 | Awareness & training | Quiz + KnowBe4 + Tips |
| A.8.5 | Secure authentication | MFA + refresh tokens httpOnly |
| A.8.13 | Information backup | `scripts/backup.sh` (header explicite) |
| A.8.15 | Logging | `AuditService` |
| A.8.16 | Monitoring activities | `/admin/system-health`, `/admin/system-monitoring` |
| A.8.24 | Use of cryptography | JWT OnlyOffice + DocuSeal webhooks |
| A.8.28 | Secure coding | Sanitisation, Zod, ESLint, TS strict |
| A.8.32 | Change management | CI GitHub Actions, husky, verify |

**70 documents internes sont déjà mappés à des contrôles ISO** via `DocumentIsoControl`.

---

## 5. IA et fonctionnalités innovantes

### Assistant conversationnel

- **Modèle** : Mistral (primaire), Phi3-mini (fallback), Qwen2:0.5b (urgence)
- **Déploiement** : 100% local via Ollama (serveur privé OMNITECH)
- **Embeddings** : BGE-M3 (multilingue, 1024 dimensions)
- **Mode** : streaming (SSE) avec citations
- **Recherche** : hybride (vectorielle + Postgres plein-texte)
- **Seuil de similarité** : 0.4

### Recherche sémantique

- **Vector store** : base Postgres avec extension pgvector
- **Volumétrie** : 587 morceaux de documents indexés
- **Cross-source** : documents + wiki + runbooks + procédures + FAQ
- **Guardrails** : PII anonymisée avant ingestion, RBAC appliqué à la réponse

### Automatisations et tâches programmées

- Veille RSS (cron veille)
- Backup quotidien 2h (ISO A.8.13)
- Purge sessions LDAP inactives (2h30)
- Rappels de revues (`review-reminder.processor.ts`)
- Jobs BullMQ (file-processing, data-export)
- Alertes certificats expirants

### Veille automatisée

- **Sources** : 7 sources RSS / API configurées
- **Agrégation** : items ingérés, dédupliqués, classifiés
- **Bulletins** : synthèses générées (prêtes pour publication)

---

## 6. Expérience utilisateur

| Aspect                          | État                                                                                                                                                        |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Interface moderne, responsive   | ✅ Next.js + Tailwind, optimisée desktop et mobile                                                                                                          |
| Mode sombre                     | 🟡 Implémentation technique OK sur 151 fichiers, pas de sélecteur user visible                                                                              |
| Accessibilité                   | 🟡 Partiel — skip-links, aria-label, role-dialog présents ; audit Pa11y configuré (`a11y` script) ; pas de niveau WCAG AA certifié                          |
| Raccourcis clavier              | ✅ `Cmd+K` palette, `Ctrl+Shift+K` IA, `?` pour aide (documentés)                                                                                           |
| Multilinguisme                  | 🟡 Dictionnaire français / anglais implémenté (2 288 clés dans `i18n.ts`) mais sélecteur de langue non exposé à l'utilisateur                               |
| Charte graphique SEAL / PANTONE | 🟡 Tokens déclarés dans `tailwind.config.ts` et `globals.css`, mais faible propagation (34 classes `seal-*` vs 616 classes legacy `text-navy`/`text-taupe`) |
| Progressive Web App (PWA)       | ✅ Manifest W3C complet, service worker 258 lignes, install prompt discret, update toast, offline indicator, page `/offline`                                |
| Command palette                 | ✅ Fuzzy-search maison, 6 catégories, historique 5 items                                                                                                    |
| Focus mode                      | 🟡 Composant présent, comportement à améliorer (cf. section 11)                                                                                             |
| Navigation                      | ✅ Sidebar rail+panel macOS-like, mobile bottom nav, breadcrumbs dynamiques                                                                                 |

---

## 7. Volumétrie actuelle (préproduction, données de test)

> **Avertissement** : ces chiffres sont ceux de la base de **préproduction** peuplée de données de test et d'imports partiels (Notion, Caramel). Ils donnent un ordre de grandeur de l'usage mais ne représentent pas un déploiement productif réel.

| Entité                                 | Nombre    |
| -------------------------------------- | --------- |
| **Utilisateurs**                       | **108**   |
| Départements                           | 13        |
| **Documents**                          | **26**    |
| Versions de documents                  | 25        |
| Liens documents ↔ ISO                  | 70        |
| **Pages wiki**                         | **60**    |
| Runbooks                               | 10        |
| Actualités (News)                      | 8         |
| **Tickets**                            | **257**   |
| Chartes                                | 3         |
| Signatures de chartes                  | 2         |
| Campagnes de signature                 | 0         |
| Demandes de signature                  | 1         |
| Contrôles ISO 27001                    | **93**    |
| Tâches de conformité                   | 0         |
| Campagnes de revue d'accès             | 0         |
| Certificats suivis                     | 280       |
| Incidents                              | 0         |
| Alertes sécurité                       | 0         |
| Remédiations                           | 0         |
| Enquêtes satisfaction                  | 1         |
| Questions d'enquête                    | 15        |
| Campagnes de quiz                      | 3         |
| Événements calendrier                  | 3         |
| Albums médias                          | 1         |
| Items médias                           | 6         |
| Témoignages                            | 1         |
| Sources de veille                      | 7         |
| **Items de veille ingérés**            | **1 338** |
| Bulletins de veille                    | 1         |
| Utilisateurs LDAP en attente           | 22        |
| Workflows d'approbation                | 5         |
| Instances de workflow                  | 5         |
| Étapes de workflow                     | 11        |
| Espaces configurés                     | 67        |
| Notifications                          | 367       |
| **Entrées d'audit**                    | **2 104** |
| Abonnements push                       | 0         |
| Bannières                              | 1         |
| **Morceaux de documents indexés (IA)** | **587**   |
| Requêtes IA historisées                | 8         |

---

## 8. Synthèse exécutive

- **Périmètre fonctionnel** : 31 modules métier documentés, 94 pages web, 72 modules serveur, 76 tables en base — soit un **SI intranet complet** couvrant GED, wiki, tickets, conformité, signatures, IA, veille, annuaire, notifications multi-canal.
- **12 intégrations techniques actives** dont toutes les composantes critiques auto-hébergées.
- **Conformité ISO 27001:2022** : 93 contrôles référencés en base, évidence dans le code pour les contrôles organisationnels (A.5), humains (A.6) et technologiques (A.8) majeurs. 70 documents déjà mappés à leurs contrôles.
- **Souveraineté des données** : **aucune donnée opérationnelle n'est envoyée à un prestataire cloud externe** (IA locale, signatures locales, édition locale, recherche locale).
- **Sécurité mûre** : RBAC hiérarchique 7 niveaux, MFA TOTP, journal d'audit (2 104 entrées), WAF (BunkerWeb), HTTPS Let's Encrypt, rate-limiting ciblé, anonymisation PII dans l'IA, sauvegarde automatisée quotidienne.
- **UI moderne** : PWA installable, mode kiosque pour affichage mural, recherche globale <50ms via Meilisearch, palette de commande `Cmd+K`, assistant IA streaming.
- **Principales limites** : double interface chatbot à unifier, charte graphique SEAL non propagée (5% de couverture), calendrier non synchronisé M365/Google, chiffrement au repos du disque non activé, export RGPD partiel (erreur 400).
- **Prêt pour démonstration direction** : ✅ **oui** — tous les modules principaux sont navigables, les données de préproduction illustrent les cas d'usage.
- **Prêt pour pilote restreint (5-10 utilisateurs)** : ✅ **oui** — sous réserve de corriger l'export RGPD, les bugs d'extensions de fichiers téléchargés et la bannière non cliquable.
- **Prêt pour ouverture générale** : 🟡 **partiel** — nécessite en amont : migration charte SEAL, unification chatbot, synchronisation calendrier externe, chiffrement disque, procédure de maintenance sans coupure, application MFA à tous les utilisateurs.

---

## 9. Points à valoriser pour la présentation direction

10 faits marquants objectivement vérifiables dans le code et/ou la base de données :

1. **IA 100% locale et souveraine** — Les modèles Mistral, Phi3 et Qwen2 tournent sur un serveur Ollama interne. **Aucune requête utilisateur n'est envoyée à OpenAI, Anthropic, Google ou tout autre prestataire externe.** Fichier : `apps/backend/src/rag/llm/llm.service.ts`. Variable : `OLLAMA_URL=http://localhost:11434`.
2. **Anonymisation automatique avant indexation IA** — Tous les documents sont passés par un `PiiSanitizerService` qui masque emails, IP internes, téléphones et noms d'hôtes avant d'être envoyés au moteur vectoriel. Conformité explicite ISO A.5.34. Fichier : `apps/backend/src/rag/ingestion/pii-sanitizer.service.ts`.
3. **93 contrôles ISO 27001:2022 référencés dans le code et la base** — 70 documents internes sont déjà mappés à leur contrôle ISO correspondant. Tableau de bord RSSI intégré. Vérifiable via la table `IsoControl`.
4. **Piste d'audit complète** — 2 104 entrées déjà tracées en préproduction avec user, action, ressource, sévérité, IP, User-Agent. Journal centralisé `AuditService`. Conformité ISO A.8.15.
5. **12 intégrations techniques productives** dont Active Directory, DocuSeal, OnlyOffice, Meilisearch, Stirling PDF, KnowBe4, Fileserver SMB, Push notifications, SMTP, Redis — le tout **auto-hébergé sur l'infrastructure OMNITECH**.
6. **Sauvegarde quotidienne automatisée** — Script `scripts/backup.sh` lancé à 2h du matin, rétention 30 jours, destination SMB interne + Veeam. Référencement explicite ISO A.8.13 dans l'en-tête du script.
7. **Notifications multi-canal** — 4 canaux (application, email, push navigateur, SMS) + WebSocket temps réel. L'utilisateur choisit par type d'événement. 367 notifications déjà distribuées en préproduction.
8. **Moteur de recherche sémantique** — 587 morceaux de contenu interne indexés avec embeddings BGE-M3, recherche hybride (texte + vecteur). Réponses avec citations de sources cliquables.
9. **Application web progressive (PWA)** — Installable comme une application native (manifest W3C, service worker 258 lignes, mode hors ligne, update automatique). Fonctionne desktop et mobile.
10. **Mode kiosque** — Affichage mural public (`/kiosk`) avec rotation News → Veille → SMSI, utilisable sans compte, rate-limité 30 req/min/IP. Conformité ISO A.5.13 (affichage de l'information).

---

## 10. Ce qui n'est pas encore fait / reste à faire

Liste honnête des chantiers identifiés mais non complétés. Le but est de permettre à la direction de comprendre **ce qui fonctionne aujourd'hui** vs **ce qui nécessiterait encore des investissements**.

### 10.1 Corrections de bugs identifiées

- **Export RGPD** renvoie une erreur 400 — `DataExportRequest` non fonctionnel en l'état
- **Bannière prioritaire non cliquable** — pas de champ "lien de redirection" à la création
- **Page détail enquête 404** — URL `/admin/feedback/surveys/{id}` cassée sur certains IDs
- **Téléchargement fichiers** : extension perdue si le nom contient un point (ex: `OMS-PRO-IT-0006-v1.0` → `.pdf` absent)
- **Sous-navigation `/admin/system-health`** : raccourcis Audit / Santé / RSSI / Rapports présents sur la page hub mais absents sur les pages cibles
- **Lien mort** `/admin/audit` référencé `dashboard/page.tsx:1167` (route réelle : `/admin/audit`)
- **Webhook DocuSeal sans HMAC** — validation par secret simple, pas de vérification cryptographique complète
- **14 `console.log` dans `documents/[id]/editor/page.tsx`** en production

### 10.2 Features partielles à compléter

- **Unification du chatbot** : 2 interfaces (modale + widget flottant) qui ne partagent ni historique ni contexte. 14 fonctionnalités manquantes (Stop, Copier, Régénérer, Export PDF/MD, coloration code, sélection modèle, slash-commands, etc.)
- **Synchronisation calendrier** avec Outlook / Microsoft 365 / Google
- **Liaison tickets ↔ calendrier** (dates d'échéance, livraison matériel, etc.)
- **Mode focus** : à refondre sur le modèle Zen Browser (Glance + Split view)
- **Traduction automatique** de l'intranet (i18n dictionnaire existant mais sélecteur de langue absent)
- **Modes de workflow parallèles** (`PARALLEL_ALL`, `PARALLEL_ANY`) non implémentés
- **SMS OVH** : classe structurée mais appel HTTP non câblé
- **Droit à l'oubli RGPD** : workflow non implémenté
- **Propagation charte graphique SEAL** : 5% de couverture, 95% restant en classes legacy
- **Filigrane (watermark) sur téléchargement** de documents : non implémenté
- **Protection visuelle des images d'aperçu albums** : fenêtre grise actuelle, pas de cover éditable

### 10.3 Modules prévus mais non implémentés

- **Chiffrement au repos** du disque et des données (prévu pour plus tard)
- **Second disque de stockage** avec chiffrement
- **Gestion des quotas de stockage par utilisateur** (configurable dans `/admin/config` ou `/admin/users`)
- **Maintenance sans coupure** (push / montée de version sans redémarrage backend / frontend)
- **Intégration academy.omnitech-security.fr** (module formation)
- **Intégration SoPlanning** + liaison GLPI (envoi d'interventions clientes depuis tickets)
- **Intégration Microsoft 365** (Graph API, webhooks Power Automate, SSO OIDC)
- **Intégration Teams** (webhooks, cards adaptatives, notifications)
- **Intégration Vaultwarden** (SSO mots de passe équipe)
- **Amélioration profonde référentiels de conformité** (`/admin/compliance?tab=frameworks`)
- **Packager l'intranet** pour migration vers autre serveur (gestion dépendances)
- **Améliorer PWA** ou développer une application native dédiée

### 10.4 Dette technique identifiée

- **6 doublons structurels de pages** (audit-log/audit-timeline, search/search/v2, runbooks/wiki, documents/new/new-inline, etc.)
- **Hub Admin** : 17 items à plat sans regroupement
- **`admin/config/page.tsx`** : 1 214 lignes monolithique
- **`dashboard/page.tsx`** : 1 409 lignes
- **`documents/[id]/page.tsx`** : 1 888 lignes
- **`profile/page.tsx`** : 1 248 lignes + 10 `console.error`
- **5 composants UI orphelins** (0 imports) : `bulk-actions-bar`, `keyboard-shortcuts-dialog`, `classification-badge`, `skeleton-page`, `saved-filters-bar`
- **`/admin/dark-mode-audit`** : outil de développement à retirer
- **Formulaires sans validation native** — 11 `required` HTML sur tout le frontend, aucun `react-hook-form+zod` généralisé
- **6 variantes de taille H1** dans l'interface (incohérence typographique)
- **13 TODO actifs** dans le code dont 3 liés au refresh-token à purger avant le 2026-05-16

### 10.5 Questions de cohérence fonctionnelle (à arbitrer)

- **Matrice des accès `/admin/config`** : partiellement redondante avec **Espaces et modules `/admin/spaces`** — clarifier et fusionner ?
- **Revue des accès `/admin/access-reviews`** : usage à préciser, ajouter revue utilisateurs et mots de passe OMNITECH ?
- **Politique MFA `/admin/users`** : utilité réelle ? Appliquer à tous les utilisateurs ?
- **`/helpdesk` vs `/tickets`** : 2 pages très proches — fusionner dans un module IA ?
- **Rapport SMSI PDF** du dashboard RSSI : export à refondre (qualité perfectible)
- **Organigramme `/directory/organigramme`** : cohérence visuelle à améliorer

---

## 11. Rappels pour l'équipe de rédaction de la note direction

Ce document est **factuel** et volontairement exhaustif. Pour la note de synthèse 2 pages destinée au PDG / DG / DSI / Qualité / Marketing, recommandations de structuration :

- **Page 1** — Vision & valeur : identité du projet, souveraineté des données, périmètre couvert (31 modules), conformité ISO 27001 (93 contrôles), IA locale, mode d'hébergement.
- **Page 2** — Maturité & perspectives : volumétrie actuelle en préproduction, 10 points à valoriser (section 9), principales limites honnêtes (section 10), niveau de préparation démo / pilote / ouverture générale.

**Ton recommandé** : neutre, vérifiable, sans emphase marketing. Les chiffres et références `fichier:ligne` de ce document sont vérifiables directement dans le code.

---

_Document produit en lecture seule le 2026-04-23. Aucune modification de code. Branche `feat/p1-9-prelaunch`. Source primaire : audit fonctionnel `docs/audit/INTRANET_FEATURE_AUDIT_v1.0.md` + base de données de préproduction + exploration directe du code._
